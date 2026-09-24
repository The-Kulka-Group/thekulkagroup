import { describe, expect, it } from "vitest";

import { computeRom, type Benchmark, type EngineParameters } from "./rom";
import {
  computeMarkups,
  WEEKS_PER_MONTH,
  type FieldOfficeRate,
  type MarkupChoices,
  type MarkupHistoryRow,
  type MarkupInputs,
  type StaffingRate,
} from "./rom-markups";

// LA-1016: the waterfall below the trade subtotal. The rates and history rows
// here are synthetic, except where a case names Matt's stated fee and
// insurance rates to check the arithmetic reads them the way he stated them.

function parameter(value: number) {
  return {
    value,
    provenance: {
      kind: "reviewed_judgment" as const,
      recordedBy: "automated test",
      recordedAt: "2026-09-23",
      reason: "synthetic",
    },
  };
}

function history(over: Partial<MarkupHistoryRow> = {}): MarkupHistoryRow {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    projectName: "Jefferson's Ferry",
    setup: "both",
    usdPerGsf: 20,
    pctOfSubtotal: 0.1573,
    exportLabel: "synthetic export",
    recordedBy: "automated test",
    recordedAt: "2026-09-23",
    ...over,
  };
}

const STAFF: StaffingRate[] = [
  { id: "s-pm", role: "Project Manager", daysPerWeek: 5, weeklyRateLow: 5200, weeklyRateHigh: 5200, sourceEstimate: "C-00379" },
  { id: "s-spm", role: "Sr. Project Manager", daysPerWeek: 2, weeklyRateLow: 2600, weeklyRateHigh: 2615.2, sourceEstimate: "C-00379" },
];

const OFFICE: FieldOfficeRate[] = [
  { id: "f-trailer", category: "trailer_rental", item: "Single wide", rateBasis: "monthly", rate: 800, recurringRate: null, sourceEstimate: "C-00379" },
  { id: "f-sign", category: "general_field", item: "Project ID sign", rateBasis: "lump_sum", rate: 2500, recurringRate: null, sourceEstimate: "C-00379" },
  { id: "f-gator", category: "general_field", item: "Gators", rateBasis: "each", rate: 10000, recurringRate: null, sourceEstimate: "C-00379" },
  { id: "f-power", category: "office_setup", item: "Electric connect", rateBasis: "lump_sum_then_monthly", rate: 500, recurringRate: 175, sourceEstimate: "C-00379" },
];

function inputs(over: Partial<MarkupInputs> & { choices?: MarkupChoices } = {}): MarkupInputs {
  return {
    subtotal: { low: 1_000_000, high: 1_200_000 },
    ownerDirect: { low: 0, high: 0 },
    grossSquareFeet: 50_000,
    choices: { setup: "both", method: "pct_of_subtotal" },
    history: [history()],
    staffingRates: STAFF,
    fieldOfficeRates: OFFICE,
    feeParameter: parameter(0.0325),
    insuranceParameter: parameter(0.054),
    ...over,
  };
}

/** The ADR 0004 waterfall, written out once so each case checks against it. */
function waterfall(subtotal: number, gc: number, fee = 0.0325, insurance = 0.054) {
  const feeAmount = Math.round((subtotal + gc) * fee);
  const insuranceAmount = Math.round((subtotal + gc + feeAmount) * insurance);
  return { fee: feeAmount, insurance: insuranceAmount, total: subtotal + gc + feeAmount + insuranceAmount };
}

describe("computeMarkups, percent of subtotal", () => {
  it("prices GRs/GCs off history, then fee on subtotal plus GRs/GCs, then insurance on all of it", () => {
    const m = computeMarkups(inputs());

    expect(m.generalConditions.low).toBe(157_300);
    expect(m.generalConditions.high).toBe(188_760);
    expect(m.generalConditions.basis).toBe("15.73% of subtotal, from 1 job: Jefferson's Ferry");
    expect(m.generalConditions.label).toBe("General Requirements & General Conditions");
    expect(m.generalConditions.code).toBe("90 20 00");

    const low = waterfall(1_000_000, 157_300);
    const high = waterfall(1_200_000, 188_760);
    expect(m.fee.low).toBe(low.fee);
    expect(m.fee.high).toBe(high.fee);
    expect(m.insurance.low).toBe(low.insurance);
    expect(m.insurance.high).toBe(high.insurance);
    expect(m.total.low).toBe(low.total);
    expect(m.total.high).toBe(high.total);
    expect(m.fee.basis).toContain("3.25% of subtotal plus General Requirements & General Conditions");
    expect(m.insurance.basis).toContain("5.40%");
  });

  it("uses the mean of the history rows for the chosen setup and ignores the other setups", () => {
    const m = computeMarkups(
      inputs({
        choices: { setup: "gc_only", method: "pct_of_subtotal" },
        history: [
          history({ setup: "gc_only", pctOfSubtotal: 0.06, projectName: "B job" }),
          history({ setup: "gc_only", pctOfSubtotal: 0.08, projectName: "A job", projectId: "22222222-2222-4222-8222-222222222222" }),
          history({ setup: "both", pctOfSubtotal: 0.5 }),
        ],
      }),
    );

    expect(m.generalConditions.label).toBe("General Conditions");
    expect(m.generalConditions.low).toBe(70_000);
    expect(m.generalConditions.high).toBe(84_000);
    expect(m.generalConditions.basis).toBe("7.00% of subtotal, from 2 jobs: A job, B job");
    expect(m.generalConditions.source).toBe("history");
  });

  it("labels the General Requirements setup", () => {
    const m = computeMarkups(
      inputs({
        choices: { setup: "gr_only", method: "pct_of_subtotal" },
        history: [history({ setup: "gr_only", pctOfSubtotal: 0.03 })],
      }),
    );
    expect(m.generalConditions.label).toBe("General Requirements");
    expect(m.generalConditions.low).toBe(30_000);
  });

  it("uses the user's override over history and says so", () => {
    const m = computeMarkups(inputs({ choices: { setup: "both", method: "pct_of_subtotal", overrideRate: 0.1 } }));

    expect(m.generalConditions.low).toBe(100_000);
    expect(m.generalConditions.high).toBe(120_000);
    expect(m.generalConditions.source).toBe("override");
    expect(m.generalConditions.basis).toBe(
      "10.00% of subtotal, user override (history: 15.73% from 1 job: Jefferson's Ferry)",
    );
  });

  it("shows GRs/GCs as TBD outside the total when no history exists and no override is given", () => {
    const m = computeMarkups(inputs({ history: [] }));

    expect(m.generalConditions.tbd).toBe(true);
    expect(m.generalConditions.low).toBe(0);
    expect(m.generalConditions.high).toBe(0);
    expect(m.generalConditions.source).toBe("none");

    const low = waterfall(1_000_000, 0);
    expect(m.fee.low).toBe(low.fee);
    expect(m.total.low).toBe(low.total);
    expect(m.fee.basis).not.toContain("General Conditions");
    expect(m.total.basis).toContain("TBD");
    expect(m.assumptions.some((a) => a.includes("TBD and sits outside the total"))).toBe(true);
  });

  it("is TBD rather than borrowing another setup's history", () => {
    const m = computeMarkups(inputs({ choices: { setup: "gc_only", method: "pct_of_subtotal" } }));
    expect(m.generalConditions.tbd).toBe(true);
  });
});

describe("computeMarkups, dollars per GSF", () => {
  it("multiplies the mean history rate by gross square feet, so low and high match", () => {
    const m = computeMarkups(
      inputs({
        choices: { setup: "both", method: "usd_per_gsf" },
        history: [history({ usdPerGsf: 10 }), history({ usdPerGsf: 14, projectName: "Fieldstone" })],
      }),
    );

    expect(m.generalConditions.low).toBe(600_000);
    expect(m.generalConditions.high).toBe(600_000);
    expect(m.generalConditions.basis).toBe(
      "$12.00/GSF × 50,000 GSF, from 2 jobs: Fieldstone, Jefferson's Ferry",
    );
    const low = waterfall(1_000_000, 600_000);
    expect(m.total.low).toBe(low.total);
  });

  it("uses an override rate per GSF", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "gc_only", method: "usd_per_gsf", overrideRate: 8 }, history: [] }),
    );
    expect(m.generalConditions.low).toBe(400_000);
    expect(m.generalConditions.tbd).toBe(false);
    expect(m.generalConditions.basis).toBe("$8.00/GSF × 50,000 GSF, user override");
  });

  it("is TBD with no history and no override", () => {
    const m = computeMarkups(inputs({ choices: { setup: "both", method: "usd_per_gsf" }, history: [] }));
    expect(m.generalConditions.tbd).toBe(true);
  });
});

describe("computeMarkups, staffing and duration", () => {
  it("prices roles by weeks and field-office items by basis, with months at weeks over 4.33", () => {
    const weeks = 52;
    const months = weeks / WEEKS_PER_MONTH;
    const m = computeMarkups(
      inputs({
        history: [],
        choices: {
          setup: "gc_only",
          method: "staffing_duration",
          durationWeeks: weeks,
          staff: [{ rateId: "s-pm" }, { rateId: "s-spm", weeks: 26 }],
          fieldOffice: [
            { rateId: "f-trailer" },
            { rateId: "f-sign" },
            { rateId: "f-gator", quantity: 2 },
            { rateId: "f-power" },
          ],
        },
      }),
    );

    const office = 800 * months + 2500 + 10000 * 2 + (500 + 175 * months);
    expect(m.generalConditions.low).toBe(Math.round(52 * 5200 + 26 * 2600 + office));
    expect(m.generalConditions.high).toBe(Math.round(52 * 5200 + 26 * 2615.2 + office));
    expect(m.generalConditions.source).toBe("staffing");
    expect(m.generalConditions.basis).toContain("2 roles and 4 field-office items over 52 weeks");
    expect(m.generalConditions.basis).toContain("weeks / 4.33");
    expect(m.assumptions.some((a) => a.includes("52 weeks divided by 4.33"))).toBe(true);

    const low = waterfall(1_000_000, m.generalConditions.low);
    expect(m.fee.low).toBe(low.fee);
    expect(m.insurance.low).toBe(low.insurance);
  });

  it("scales with duration: a longer job costs more", () => {
    const choices = (durationWeeks: number): MarkupChoices => ({
      setup: "both",
      method: "staffing_duration",
      durationWeeks,
      staff: [{ rateId: "s-pm" }],
      fieldOffice: [{ rateId: "f-trailer" }],
    });
    const short = computeMarkups(inputs({ choices: choices(40) }));
    const long = computeMarkups(inputs({ choices: choices(60) }));
    expect(long.generalConditions.low).toBeGreaterThan(short.generalConditions.low);
  });

  it("is TBD when nothing was picked, rather than zero", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "both", method: "staffing_duration", durationWeeks: 52 } }),
    );
    expect(m.generalConditions.tbd).toBe(true);
  });

  it("refuses a missing duration and an unknown rate", () => {
    expect(() =>
      computeMarkups(inputs({ choices: { setup: "both", method: "staffing_duration", staff: [{ rateId: "s-pm" }] } })),
    ).toThrow(/duration in weeks/);
    expect(() =>
      computeMarkups(
        inputs({ choices: { setup: "both", method: "staffing_duration", durationWeeks: 10, staff: [{ rateId: "nope" }] } }),
      ),
    ).toThrow(/No staffing rate nope/);
  });
});

describe("computeMarkups, fee and insurance", () => {
  it("uses the user's fee and insurance rates in place of the parameters", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "both", method: "pct_of_subtotal", feeRate: 0.05, insuranceRate: 0.02 } }),
    );
    const low = waterfall(1_000_000, 157_300, 0.05, 0.02);
    expect(m.fee.low).toBe(low.fee);
    expect(m.insurance.low).toBe(low.insurance);
    expect(m.fee.source).toBe("override");
    expect(m.fee.basis).toContain("user override");
  });

  it("names the parameter when it priced the line", () => {
    const m = computeMarkups(inputs());
    expect(m.fee.source).toBe("parameter");
    expect(m.fee.basis).toContain("parameter fee.rate");
    expect(m.insurance.basis).toContain("parameter insurance.rate");
  });

  it("refuses to run without a fee rate from either source", () => {
    expect(() => computeMarkups(inputs({ feeParameter: undefined }))).toThrow(/fee\.rate/);
    expect(() => computeMarkups(inputs({ insuranceParameter: undefined }))).toThrow(/insurance\.rate/);
  });

  it("reproduces Jefferson's Ferry's insurance on the running-total basis", () => {
    // 470,404.12 / (8,437,400.67 + 274,263.95) is the stated 5.40 percent.
    const m = computeMarkups(
      inputs({
        subtotal: { low: 8_437_401, high: 8_437_401 },
        history: [],
      }),
    );
    expect(Math.abs(m.fee.low - 274_264) / 274_264).toBeLessThan(0.001);
    expect(Math.abs(m.insurance.low - 470_404) / 470_404).toBeLessThan(0.001);
  });
});

describe("computeRom with markups", () => {
  const benchmark = (costCode: string, value: number, contractSide: "kulka" | "owner"): Benchmark => ({
    costCode,
    label: costCode,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "actuals",
      sourceProjectIds: ["11111111-1111-4111-8111-111111111111"],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-08-27",
    },
    scopeSide: "building",
    contractSide,
  });

  const parameters: EngineParameters = {
    "weight.actuals": parameter(5),
    "weight.proest_budget": parameter(1),
    "weight.reviewed_judgment": parameter(2),
    "weight.llm_proposal": parameter(0.5),
    "flag.high_min_comparables": parameter(5),
    "flag.medium_min_comparables": parameter(2),
    "spread.high": parameter(0.1),
    "spread.medium": parameter(0.2),
    "spread.low": parameter(0.35),
    "fee.rate": parameter(0.0325),
    "insurance.rate": parameter(0.054),
  };

  const snapshot = {
    benchmarks: [benchmark("03", 100, "kulka"), benchmark("11", 10, "owner")],
    parameters,
    markupHistory: [history()],
  };

  it("keeps owner-direct lines out of the markup base and adds them back in total project cost", () => {
    const rom = computeRom(
      {
        projectType: "multifamily",
        constructionKind: "new",
        grossSquareFeet: 1000,
        markups: { setup: "both", method: "pct_of_subtotal" },
      },
      snapshot,
    );

    const m = rom.markups!;
    expect(m.subtotal.low).toBe(rom.kulkaContractTotal.low);
    expect(m.subtotal.high).toBe(rom.kulkaContractTotal.high);
    const owner = rom.lines.find((l) => l.contractSide === "owner")!;
    expect(m.ownerDirect).toEqual({ low: owner.low, high: owner.high });
    expect(m.generalConditions.low).toBe(Math.round(rom.kulkaContractTotal.low * 0.1573));
    expect(m.totalProjectCost.low).toBe(m.total.low + owner.low);
    // `total` still means trade cost, so the closing comparison reads what it always read.
    expect(rom.total.low).toBe(rom.kulkaContractTotal.low + owner.low);
    expect(rom.assumptions.some((a) => a.includes("ADR 0004 waterfall"))).toBe(true);
  });

  it("carries no markups when the answers name none", () => {
    const rom = computeRom(
      { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 },
      snapshot,
    );
    expect(rom.markups).toBeUndefined();
  });
});
