import { describe, expect, it } from "vitest";

import { runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { LENDER_TESTS_INPUT_VERSION } from "./lender-tests";
import { computePropertyReturns, type PropertyReturnsInputs, type PropertyReturnsRun } from "./property-returns";
import {
  MAX_RESIDUAL_LAND_TRIALS,
  RESIDUAL_LAND_INPUT_VERSION,
  solveResidualLand,
  type ResidualLandPlan,
  type ResidualLandTarget,
} from "./residual-land";

const evidence = { sourceLabel: "Investment committee hurdle", sourceDate: "2026-10-08", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const plan = (target: ResidualLandTarget, targetValue: number, overrides: Partial<ResidualLandPlan> = {}): ResidualLandPlan => ({
  residualLandInputVersion: RESIDUAL_LAND_INPUT_VERSION,
  target,
  targetValue,
  landLineId: "land-costs",
  evidence,
  ...overrides,
});
const withLand = (input: PropertyReturnsInputs, amount: number): PropertyReturnsInputs => ({
  ...input,
  costLines: input.costLines.map((line) => (line.id === "land-costs" ? { ...line, amount } : line)),
});
const sized: PropertyReturnsInputs = {
  ...base,
  lenderTests: {
    lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
    valuationMonth: "2028-09",
    asStabilizedCapRatePercent: 5.5,
    annualDebtService: 3_000_000,
    noiBasis: "noi_before_reserves",
    lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
    loanSizing: { noiTaxBasis: "full_tax", evidence, maxLoanToValuePercent: 60, minDebtYieldPercent: 8, minDebtServiceCoverage: 1.25, dscrRatePercent: 7, dscrAmortizationYears: 30 },
  },
};

/** Reads a target metric from a plain run, in the target's unit, with no help from the solve. */
function metricOf(run: PropertyReturnsRun, target: ResidualLandTarget) {
  const returns = run.result!.propertyReturns;
  return {
    yield_on_cost: returns.yieldOnCost * 100,
    development_spread: returns.developmentSpreadBasisPoints,
    unlevered_xirr: returns.returns.unlevered.xirr * 100,
    levered_xirr: returns.returns.levered.xirr * 100,
  }[target];
}

describe("residual land solve", () => {
  it.each([
    ["yield_on_cost", 6, base],
    ["development_spread", 100, base],
    ["unlevered_xirr", 10, base],
    ["levered_xirr", 15, base],
    ["levered_xirr", 15, sized],
  ] as const)("prices the land line at the edge of a %s target of %s", (target, targetValue, input) => {
    const run = computePropertyReturns({ ...input, residualLand: plan(target, targetValue) });
    expect(run.status).toBe("complete");
    const residual = run.result!.residualLand!;
    expect(residual.status).toBe("solved");
    expect(residual.trials).toBeLessThanOrEqual(MAX_RESIDUAL_LAND_TRIALS);
    expect(residual.reconciliations.map(({ status }) => status)).toEqual(["pass", "pass", "pass", "pass"]);

    // Independent runs at the residual and one cent above it bracket the target.
    const at = computePropertyReturns(withLand(input, residual.residualLineAmount!));
    const above = computePropertyReturns(withLand(input, Math.round(residual.residualLineAmount! * 100 + 1) / 100));
    expect(metricOf(at, target)).toBeGreaterThanOrEqual(targetValue);
    expect(metricOf(above, target)).toBeLessThan(targetValue);
    expect(residual.metricsAtResidual).toEqual(at.result!.propertyReturns.metrics);
    expect(residual.residualLandCashCost).toBe(at.result!.developmentCapital.totals.landCashCost);
  });

  it("leaves the stated run, the inputs and their snapshot unchanged", () => {
    const input = { ...base, residualLand: plan("yield_on_cost", 6) };
    const before = structuredClone(input);
    const run = computePropertyReturns(input);
    const plain = computePropertyReturns(base);
    expect(input).toEqual(before);
    const { residualLand, ...stated } = run.result!;
    expect(stated).toEqual(plain.result);
    expect(residualLand!.stated.lineAmount).toBe(7_990_000);
    expect(run.inputSnapshot.costLines.find(({ id }) => id === "land-costs")!.amount).toBe(7_990_000);
    expect(run.reconciliations).toEqual([...plain.reconciliations, ...residualLand!.reconciliations]);
  });

  it("solves below the stated price when the stated land misses the target", () => {
    const stated = metricOf(computePropertyReturns(base), "levered_xirr");
    const residual = computePropertyReturns({ ...base, residualLand: plan("levered_xirr", stated + 1) }).result!.residualLand!;
    expect(residual.stated.outcome).toBe("misses");
    expect(residual.status).toBe("solved");
    expect(residual.residualLineAmount!).toBeLessThan(7_990_000);
  });

  it("moves lines priced off the land line with the solved price", () => {
    const input: PropertyReturnsInputs = {
      ...base,
      costLines: base.costLines.map((line) => (line.id === "closing-costs"
        ? { ...line, amount: undefined, basis: { type: "percent_of_line", baseLineId: "land-costs", percent: 3 } }
        : line)),
      residualLand: plan("yield_on_cost", 6),
    };
    const residual = computePropertyReturns(input).result!.residualLand!;
    expect(residual.status).toBe("solved");
    const lineCents = Math.round(residual.residualLineAmount! * 100);
    expect(residual.residualLandCashCost).toBe((lineCents + Math.round(lineCents * 0.03)) / 100);
  });

  it("caps the price where cash land reaches the stated credited value", () => {
    const input: PropertyReturnsInputs = {
      ...base,
      creditedLand: { creditedValue: 9_000_000, countsAsSponsorEquity: true, sourceLabel: "Appraisal", sourceDate: "2026-09-01", reviewState: "done" },
      residualLand: plan("yield_on_cost", 6),
    };
    const run = computePropertyReturns(input);
    expect(run.status).toBe("complete");
    const residual = run.result!.residualLand!;
    expect(residual.status).toBe("credited_land_cap");
    // The closing cost line stays at 240,000, so the land line can reach 8,760,000 before cash land passes 9,000,000.
    expect(residual.residualLineAmount).toBe(8_760_000);
    expect(residual.residualLandCashCost).toBe(9_000_000);
    expect(residual.misses!.outcome).toBe("credited_land_cap");
    expect(residual.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(residual.inputPaths).toContain("creditedLand");
  });

  it("reports a target the building cannot carry at any land price", () => {
    const run = computePropertyReturns({ ...base, residualLand: plan("yield_on_cost", 90) });
    expect(run.status).toBe("complete");
    const residual = run.result!.residualLand!;
    expect(residual).toMatchObject({ status: "below_minimum", residualLineAmount: null, metricsAtResidual: null, reconciliations: [] });
    expect(residual.misses).toMatchObject({ lineAmount: 0.01, outcome: "misses" });
    expect(residual.message).toContain("even at one cent");
  });

  it("stops at a failed trial and keeps the failure's issues", () => {
    const input = { ...base, residualLand: plan("yield_on_cost", 6) };
    const stated = computePropertyReturns(base);
    // A runner that fails every run with land above 12,000,000.00, so the search closes against the failure.
    const runner = (trial: PropertyReturnsInputs): PropertyReturnsRun => {
      const amount = trial.costLines.find(({ id }) => id === "land-costs")!.amount!;
      return amount > 12_000_000
        ? { ...stated, status: "failed", result: null, reconciliations: [], issues: [{ path: "targetDebtSharePercent", code: "funding_solution", message: "Did not settle." }] }
        : computePropertyReturns(trial);
    };
    const residual = solveResidualLand(input, stated, runner);
    expect(residual.status).toBe("trial_failed");
    expect(residual.meets!.lineAmount).toBe(12_000_000);
    expect(residual.misses).toMatchObject({ lineAmount: 12_000_000.01, outcome: "failed" });
    expect(residual.trialIssues).toEqual([{ path: "targetDebtSharePercent", code: "funding_solution", message: "Did not settle." }]);
    expect(residual.residualLineAmount).toBeNull();
  });

  it("solves each scenario on its own copy", () => {
    const scenarios: ApartmentScenarioDefinition[] = [
      { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: evidence } },
      { id: "lower-exit-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: evidence } },
    ];
    const run = runApartmentScenarioComparison({ ...base, residualLand: plan("development_spread", 100) }, scenarios);
    expect(run.status).toBe("complete");
    const baseResidual = run.result!.base.propertyResult.residualLand!.residualLineAmount!;
    const [downside, upside] = run.result!.scenarios.map(({ propertyResult }) => propertyResult.residualLand!);
    expect([downside.status, upside.status]).toEqual(["solved", "solved"]);
    expect(downside.residualLineAmount!).toBeLessThan(baseResidual);
    expect(upside.residualLineAmount!).toBeGreaterThan(baseResidual);
  });
});

describe("residual land inputs", () => {
  const issuesFor = (residualLand: unknown, input: PropertyReturnsInputs = base) =>
    computePropertyReturns({ ...input, residualLand: residualLand as ResidualLandPlan }).issues;

  it("refuses a bad version, target, value or evidence, each on its own path", () => {
    const issues = issuesFor({ residualLandInputVersion: "v0", target: "cap_rate", targetValue: Number.NaN, landLineId: "", evidence: { reviewState: "maybe", sourceDate: "2026-02-30" } });
    expect(issues.map(({ path, code }) => [path, code])).toEqual([
      ["residualLand.residualLandInputVersion", "unsupported_input_version"],
      ["residualLand.target", "invalid_residual_land"],
      ["residualLand.targetValue", "invalid_residual_land"],
      ["residualLand.landLineId", "invalid_residual_land"],
      ["residualLand.evidence.sourceDate", "invalid_source_date"],
      ["residualLand.evidence.reviewState", "invalid_review_state"],
    ]);
  });

  it.each([
    ["yield_on_cost", 0],
    ["yield_on_cost", 101],
    ["development_spread", 10_001],
    ["levered_xirr", -100],
  ] as const)("refuses a %s target of %s", (target, targetValue) => {
    expect(issuesFor(plan(target, targetValue)).map(({ path }) => path)).toEqual(["residualLand.targetValue"]);
  });

  it("refuses a missing line, a line that is not land, and a land line priced by a basis", () => {
    expect(issuesFor(plan("yield_on_cost", 6, { landLineId: "nowhere" }))[0].message).toContain("not on the cost schedule");
    const hardLine = base.costLines.find(({ category }) => category === "hard_cost")!;
    expect(issuesFor(plan("yield_on_cost", 6, { landLineId: hardLine.id }))[0].message).toContain("is not a land line");
    const derived: PropertyReturnsInputs = {
      ...base,
      costLines: base.costLines.map((line) => (line.id === "closing-costs"
        ? { ...line, amount: undefined, basis: { type: "percent_of_line", baseLineId: "land-costs", percent: 3 } }
        : line)),
    };
    expect(issuesFor(plan("yield_on_cost", 6, { landLineId: "closing-costs" }), derived)[0].message).toContain("priced by a basis");
  });
});
