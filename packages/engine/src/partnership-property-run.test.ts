import { describe, expect, it } from "vitest";

import { runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { PARTNERSHIP_INPUT_VERSION, type PartnershipPlan } from "./partnership-waterfall";
import { computePropertyReturns, validatePropertyReturnsPlan, type PropertyReturnsInputs } from "./property-returns";

const evidence = { sourceLabel: "Operating agreement", sourceDate: "2026-10-07", reviewState: "working" as const };
// The scorecard carries the sample's own waterfall; these tests start from a run without one.
const { partnership: _sampleWaterfall, ...base } = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
void _sampleWaterfall;

const partnership: PartnershipPlan = {
  partnershipInputVersion: PARTNERSHIP_INPUT_VERSION,
  lpFundingSharePercent: 90,
  fundingOrder: "pari_passu",
  lpEntryMonth: "2026-03",
  preferredReturn: { ratePercent: 8, accrual: "compound_monthly" },
  tiers: [
    { lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 },
    { lpIrrHurdlePercent: 15, promotePercent: 30, lpBaseSharePercent: 90 },
  ],
  finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
  partnershipEvidence: { funding: evidence, preferredReturn: evidence, promoteTiers: evidence },
};

const withPartnership = (plan: PartnershipPlan = partnership): PropertyReturnsInputs => ({ ...base, partnership: plan });

describe("peak equity and the partnership waterfall on a full property run", () => {
  const without = computePropertyReturns(base);
  const withWaterfall = computePropertyReturns(withPartnership());

  it("reports peak equity on every run, from levered cash flow", () => {
    expect(without.status, JSON.stringify(without.issues)).toBe("complete");
    const result = without.result!;
    const peak = result.propertyReturns.peakEquity!;
    // Equity funds first and nothing comes back before it is all in, so the peak is the whole equity.
    expect(peak.amount).toBeCloseTo(result.developmentCapital.totals.equity, 2);
    const lastEquityMonth = result.developmentCapital.months.filter(({ equityContribution }) => equityContribution > 0).at(-1)!.month;
    expect(peak.month).toBe(lastEquityMonth);
    const metric = result.propertyReturns.metrics.find(({ key }) => key === "peakEquity")!;
    expect(metric.value).toBe(peak.amount);
    expect(metric.formula).toContain(lastEquityMonth);
    expect(result.partnership).toBeNull();
  });

  it("leaves every property figure unchanged when a waterfall is added", () => {
    expect(withWaterfall.status, JSON.stringify(withWaterfall.issues)).toBe("complete");
    const { partnership: added, ...rest } = withWaterfall.result!;
    const { partnership: none, ...before } = without.result!;
    expect(none).toBeNull();
    expect(added).not.toBeNull();
    expect(rest).toEqual(before);
  });

  it("ties LP and GP cash to levered cash flow every month and to the capital plan's equity", () => {
    const result = withWaterfall.result!;
    const waterfall = result.partnership!;
    expect(waterfall.months).toHaveLength(result.propertyReturns.months.length);
    waterfall.months.forEach((month, index) => {
      expect(month.leveredCashFlow).toBe(result.propertyReturns.months[index].leveredCashFlow);
      expect(Math.round((month.lpNetCashFlow + month.gpNetCashFlow) * 100)).toBe(Math.round(month.leveredCashFlow * 100));
    });
    expect(waterfall.lp.contributions + waterfall.gp.contributions).toBeCloseTo(result.developmentCapital.totals.equity + waterfall.cashCalls, 2);
    expect(waterfall.lp.netProfit + waterfall.gp.netProfit).toBeCloseTo(result.propertyReturns.returns.levered.netProfit, 2);
    const ids = withWaterfall.reconciliations.map(({ id }) => id);
    expect(ids).toContain(`partnership-distributions:${waterfall.months[0].month}`);
    expect(ids).toContain("partnership-contributions");
    expect(withWaterfall.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("gives the GP a higher return than the LP once a promote is paid", () => {
    const waterfall = withWaterfall.result!.partnership!;
    expect(waterfall.promoteTotal).toBeGreaterThan(0);
    expect(waterfall.gp.xirr!).toBeGreaterThan(waterfall.lp.xirr!);
    expect(waterfall.lp.xirr!).toBeLessThan(withWaterfall.result!.propertyReturns.returns.levered.xirr);
  });

  it("fails the run on an invalid waterfall and on an LP entry month outside the run", () => {
    const bad = computePropertyReturns(withPartnership({ ...partnership, lpFundingSharePercent: 0 }));
    expect(bad.status).toBe("failed");
    expect(bad.issues.map(({ code }) => code)).toContain("invalid_partnership");
    const late = computePropertyReturns(withPartnership({ ...partnership, lpEntryMonth: "2040-01" }));
    expect(late.status).toBe("failed");
    expect(late.issues.map(({ code }) => code)).toContain("partnership_outside_timeline");
    expect(validatePropertyReturnsPlan({ ...withPartnership(), partnership: { ...partnership, tiers: "none" as never } }).map(({ path }) => path)).toContain("partnership.tiers");
  });

  it("runs the waterfall inside each scenario without failing the comparison", () => {
    const scenario = (id: string, role: "downside" | "upside", name: string, delta: ApartmentScenarioDefinition["delta"]): ApartmentScenarioDefinition => ({
      id,
      role,
      name,
      inputVersion: "apartment_scenario_delta.v1",
      delta,
      evidence: Object.fromEntries(Object.keys(delta).map((key) => [key, evidence])) as ApartmentScenarioDefinition["evidence"],
    });
    const scenarios = [
      scenario("higher-vacancy", "downside", "Higher Vacancy", { vacancyPercent: 8 }),
      scenario("lower-exit-cap", "upside", "Lower Terminal Cap", { terminalCapRatePercent: 5 }),
    ];
    const comparison = runApartmentScenarioComparison(withPartnership(), scenarios);
    expect(comparison.status, JSON.stringify(comparison.issues)).toBe("complete");
  });
});
