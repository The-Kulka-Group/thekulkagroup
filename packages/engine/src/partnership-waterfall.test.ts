import { describe, expect, it } from "vitest";

import {
  PARTNERSHIP_INPUT_VERSION,
  peakEquityOf,
  runPartnershipWaterfall,
  validatePartnershipPlan,
  type PartnershipCashFlowMonth,
  type PartnershipPlan,
} from "./partnership-waterfall";

const evidence = { sourceLabel: "Operating agreement", sourceDate: "2026-10-07", reviewState: "working" as const };

function plan(overrides: Partial<PartnershipPlan> = {}): PartnershipPlan {
  return {
    partnershipInputVersion: PARTNERSHIP_INPUT_VERSION,
    lpFundingSharePercent: 90,
    fundingOrder: "pari_passu",
    tiers: [],
    finalSplit: { promotePercent: 0, lpBaseSharePercent: 90 },
    partnershipEvidence: { funding: evidence, promoteTiers: evidence, ...(overrides.preferredReturn ? { preferredReturn: evidence } : {}) },
    ...overrides,
  };
}

/** Month-end dated rows from 2026-01, with equity contributions equal to each negative levered month. */
function months(levered: number[], equity?: number[]): PartnershipCashFlowMonth[] {
  return levered.map((amount, index) => {
    const year = 2026 + Math.floor(index / 12);
    const monthNumber = index % 12 + 1;
    const month = `${year}-${String(monthNumber).padStart(2, "0")}`;
    return {
      month,
      date: new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10),
      leveredCashFlow: amount,
      equityContribution: equity ? equity[index] : Math.max(-amount, 0),
    };
  });
}

/** A contribution, `gap` empty months, then one distribution. */
function oneShot(contribution: number, gap: number, distribution: number) {
  return months([-contribution, ...Array.from({ length: gap }, () => 0), distribution]);
}

const cents = (value: number) => Math.round(value * 100);

describe("peak equity", () => {
  it("reports the deepest cumulative levered position and the first month it is reached", () => {
    const peak = peakEquityOf(months([-100, -50, 30, 0, -40, 500]));
    expect(peak).toEqual({ amount: 160, month: "2026-05" });
  });

  it("reports zero and no month when the levered cash flow never goes negative", () => {
    expect(peakEquityOf(months([0, 10]))).toEqual({ amount: 0, month: null });
  });
});

describe("partnership waterfall", () => {
  it("splits a straight pari passu deal by funding share and reconciles every month", () => {
    const run = runPartnershipWaterfall(months([-1_000_000, -500_000, 20_000, 1_800_000]), plan());
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const result = run.result!;
    expect(result.lp.contributions).toBe(1_350_000);
    expect(result.gp.contributions).toBe(150_000);
    expect(result.lp.distributions).toBe(1_638_000);
    expect(result.gp.distributions).toBe(182_000);
    expect(result.lp.equityMultiple).toBeCloseTo(1_638_000 / 1_350_000, 12);
    expect(result.lp.xirr).not.toBeNull();
    expect(result.lp.xirr!).toBeCloseTo(result.gp.xirr!, 6);
    expect(result.promoteTotal).toBe(0);
    for (const month of result.months) {
      expect(cents(month.lpNetCashFlow) + cents(month.gpNetCashFlow)).toBe(cents(month.leveredCashFlow));
    }
    expect(run.reconciliations.length).toBeGreaterThan(0);
    expect(run.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("compounds the preferred return monthly to the stated annual rate", () => {
    const run = runPartnershipWaterfall(oneShot(1_000_000, 23, 2_000_000), plan({
      preferredReturn: { ratePercent: 8, accrual: "compound_monthly" },
    }));
    const result = run.result!;
    // Two years at 8 percent effective: 1.08^2 - 1 on the capital, accrued to the partners' shares.
    expect(result.lp.preferredReturnAccrued + result.gp.preferredReturnAccrued).toBeCloseTo(166_400, 0);
    expect(result.lp.preferredReturnPaid).toBe(result.lp.preferredReturnAccrued);
    expect(result.lp.capitalReturned).toBe(900_000);
    expect(result.gp.capitalReturned).toBe(100_000);
    expect(run.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("accrues a simple preferred return on unreturned capital only", () => {
    const run = runPartnershipWaterfall(oneShot(1_000_000, 23, 2_000_000), plan({
      preferredReturn: { ratePercent: 8, accrual: "simple_monthly" },
    }));
    const result = run.result!;
    expect(result.lp.preferredReturnAccrued).toBeCloseTo(24 * 900_000 * 0.08 / 12, 0);
    expect(result.gp.preferredReturnAccrued).toBeCloseTo(24 * 100_000 * 0.08 / 12, 0);
  });

  it("pays the LP to its IRR hurdle before the next tier and grosses up the GP share with its promote", () => {
    // One year between contribution and distribution, so the 12 percent hurdle needs 1.12 times LP capital.
    const run = runPartnershipWaterfall(oneShot(1_000_000, 11, 2_000_000), plan({
      tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
      finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
    }));
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const result = run.result!;
    const tier = result.tiers[0];
    expect(tier.lp).toBeCloseTo(900_000 * 1.12, 0);
    // LP takes 72 percent of tier cash: 90 percent of what is left after a 20 percent promote.
    expect(tier.total).toBeCloseTo(tier.lp / 0.72, 0);
    expect(tier.promote).toBeCloseTo(tier.total * 0.2, 0);
    expect(tier.gpBase).toBeCloseTo(tier.total * 0.08, 0);
    const final = result.finalSplit;
    expect(final.total).toBeCloseTo(2_000_000 - tier.total, 2);
    expect(final.lp).toBeCloseTo(final.total * 0.54, 0);
    expect(final.promote).toBeCloseTo(final.total * 0.4, 0);
    expect(result.promoteTotal).toBeCloseTo(tier.promote + final.promote, 2);
    expect(run.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("stops at the hurdle when cash runs out inside a tier", () => {
    const run = runPartnershipWaterfall(oneShot(1_000_000, 11, 1_050_000), plan({
      tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
      finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
    }));
    const result = run.result!;
    expect(result.tiers[0].total).toBe(1_050_000);
    expect(result.tiers[0].lp).toBeCloseTo(1_050_000 * 0.72, 2);
    expect(result.finalSplit.total).toBe(0);
  });

  it("returns capital before a tier when a preferred return block is set, even at a zero rate", () => {
    const run = runPartnershipWaterfall(oneShot(1_000_000, 11, 1_000_000), plan({
      preferredReturn: { ratePercent: 0, accrual: "compound_monthly" },
      tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 50, lpBaseSharePercent: 90 }],
    }));
    const result = run.result!;
    expect(result.lp.capitalReturned).toBe(900_000);
    expect(result.gp.capitalReturned).toBe(100_000);
    expect(result.promoteTotal).toBe(0);
  });

  it("has the GP fund alone until the LP enters, then the LP pays its catch-up to the GP", () => {
    const run = runPartnershipWaterfall(months([-100_000, -100_000, -200_000, -100_000, 600_000]), plan({
      lpFundingSharePercent: 75,
      lpEntryMonth: "2026-03",
      finalSplit: { promotePercent: 0, lpBaseSharePercent: 75 },
    }));
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const [first, second, entry, after] = run.result!.months;
    expect(first.gpContribution).toBe(100_000);
    expect(second.lpContribution).toBe(0);
    expect(entry.lpCatchUp).toBe(150_000);
    expect(entry.lpContribution).toBe(150_000 + 150_000);
    expect(entry.gpContribution).toBe(50_000 - 150_000);
    expect(after.lpContribution).toBe(75_000);
    expect(run.result!.lp.contributions).toBe(375_000);
    expect(run.result!.gp.contributions).toBe(125_000);
    expect(run.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("has the GP fund its whole share first under GP-first funding", () => {
    const run = runPartnershipWaterfall(months([-50_000, -50_000, -100_000, -200_000, 600_000]), plan({ fundingOrder: "gp_first" }));
    const rows = run.result!.months;
    expect(rows.map(({ gpContribution }) => gpContribution)).toEqual([40_000, 0, 0, 0, 0]);
    expect(rows.map(({ lpContribution }) => lpContribution)).toEqual([10_000, 50_000, 100_000, 200_000, 0]);
  });

  it("refunds the GP above its share at a late LP entry under GP-first funding", () => {
    const run = runPartnershipWaterfall(months([-50_000, -50_000, -100_000, -200_000, 600_000]), plan({ fundingOrder: "gp_first", lpEntryMonth: "2026-03" }));
    const rows = run.result!.months;
    expect(rows[2].lpCatchUp).toBe(60_000);
    expect(rows.map(({ gpContribution }) => gpContribution)).toEqual([50_000, 50_000, -60_000, 0, 0]);
    expect(run.result!.gp.contributions).toBe(40_000);
  });

  it("funds a negative month after equity as a cash call in funding shares", () => {
    const run = runPartnershipWaterfall(months([-1_000, 300, -200, 2_000], [1_000, 0, 0, 0]), plan());
    const rows = run.result!.months;
    expect(rows[2].cashCall).toBe(200);
    expect(rows[2].lpContribution).toBe(180);
    expect(run.result!.cashCalls).toBe(200);
    expect(run.reconciliations.find(({ id }) => id === "partnership-contributions")?.status).toBe("pass");
  });

  it("reports an IRR it cannot compute as an issue without failing the run", () => {
    const run = runPartnershipWaterfall(months([-1_000, 0]), plan());
    expect(run.status).toBe("complete");
    expect(run.result!.lp.xirr).toBeNull();
    expect(run.result!.issues.map(({ code }) => code)).toContain("lp_xirr_unavailable");
  });

  it("rejects an LP entry month outside the cash flow", () => {
    const run = runPartnershipWaterfall(months([-1_000, 2_000]), plan({ lpEntryMonth: "2030-01" }));
    expect(run.status).toBe("failed");
    expect(run.issues.map(({ path }) => path)).toContain("partnership.lpEntryMonth");
  });

  it("traces every reported figure to its formula and inputs", () => {
    const run = runPartnershipWaterfall(oneShot(1_000_000, 11, 2_000_000), plan({
      preferredReturn: { ratePercent: 8, accrual: "compound_monthly" },
      tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
    }), ["costLines"]);
    const keys = run.result!.metrics.map(({ key }) => key);
    expect(keys).toEqual(expect.arrayContaining([
      "lpContributions", "gpContributions", "lpDistributions", "gpDistributions", "lpXirr", "gpXirr",
      "lpEquityMultiple", "gpEquityMultiple", "lpNetProfit", "gpNetProfit", "lpPeakEquity", "gpPeakEquity",
      "lpPreferredReturnAccrued", "gpPreferredReturnAccrued", "promoteTotal",
    ]));
    for (const metric of run.result!.metrics) {
      expect(metric.formula.length, metric.key).toBeGreaterThan(10);
      expect(metric.inputPaths).toEqual(expect.arrayContaining(["costLines", "partnership"]));
    }
  });
});

describe("partnership plan validation", () => {
  it("accepts a well-formed plan", () => {
    expect(validatePartnershipPlan(plan({ tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }] }))).toEqual([]);
  });

  it("names each bad field", () => {
    const issues = validatePartnershipPlan({
      ...plan(),
      lpFundingSharePercent: 0,
      fundingOrder: "lp_first" as never,
      lpEntryMonth: "March",
      preferredReturn: { ratePercent: -1, accrual: "daily" as never },
      tiers: [
        { lpIrrHurdlePercent: 14, promotePercent: 20, lpBaseSharePercent: 90 },
        { lpIrrHurdlePercent: 12, promotePercent: 100, lpBaseSharePercent: 0 },
      ],
      finalSplit: { promotePercent: 120, lpBaseSharePercent: 90 },
    });
    const paths = issues.map(({ path }) => path);
    expect(paths).toEqual(expect.arrayContaining([
      "partnership.lpFundingSharePercent",
      "partnership.fundingOrder",
      "partnership.lpEntryMonth",
      "partnership.preferredReturn.ratePercent",
      "partnership.preferredReturn.accrual",
      "partnership.tiers.1.lpIrrHurdlePercent",
      "partnership.tiers.1.promotePercent",
      "partnership.tiers.1.lpBaseSharePercent",
      "partnership.finalSplit.promotePercent",
      "partnership.partnershipEvidence.preferredReturn",
    ]));
  });

  it("requires source details for each block it carries", () => {
    const issues = validatePartnershipPlan({ ...plan(), partnershipEvidence: {} });
    expect(issues.map(({ path }) => path)).toEqual(expect.arrayContaining([
      "partnership.partnershipEvidence.funding",
      "partnership.partnershipEvidence.promoteTiers",
    ]));
  });
});
