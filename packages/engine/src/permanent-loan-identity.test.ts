import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import { computeDevelopmentCapital, fundMonthlyDevelopmentCashFlow } from "./development-capital";
import { APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE } from "./fixtures/apartment-development-model-v2.98-capital";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { LENDER_TESTS_INPUT_VERSION, type LenderTestPlan } from "./lender-tests";
import { computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";

/*
 * LA-1867: a case without a permanent loan must give the same results as before the permanent loan
 * existed. Each digest is the SHA-256 of a full run's JSON, computed on origin/main at 7b51ac9 (the
 * LA-1868 merge, whose commercial fields changed the run JSON) with these same inputs.
 * Any change to a number, label, trace or check moves it.
 */
const BEFORE_LA_1867 = {
  propertyReturns: "6866283838e418a72678b57c8d53f1d1ac643779a50b1352e4c09e97d13b551b",
  propertyReturnsSized: "11e94343ee509424e51953661c9f3705fb2401755d216803f88e64ce03eb0f41",
  developmentCapital: "3a517e9dbbd3235ca27e7edd164c3100d6c657fac54a54c032bc0c5f9ae39509",
  returnsFixture: "51b75a5e599d2a519287c4808ae2d639f695637b1ea3824c96d3205c6475e187",
  capitalFixture: "0b2cf04c2fd8d8db45ae57e0be0c275967a8dbaff2995bb1da39315db865ca6c",
  scenarios: "d9d29f53ec01b4cde0b6215c7f0fac493a40541fc531a54d570f94644d9a4b0c",
};

const evidence = { sourceLabel: "Lender term sheet", sourceDate: "2026-10-05", reviewState: "working" as const };
const lenderTests = (valuationMonth: string): LenderTestPlan => ({
  lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
  valuationMonth,
  asStabilizedCapRatePercent: 5.5,
  annualDebtService: 3_000_000,
  noiBasis: "noi_before_reserves",
  lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
});
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const sized: PropertyReturnsInputs = {
  ...base,
  lenderTests: {
    ...lenderTests("2028-09"),
    loanSizing: { noiTaxBasis: "full_tax", evidence, maxLoanToValuePercent: 60, minDebtYieldPercent: 8, minDebtServiceCoverage: 1.25, dscrRatePercent: 7, dscrAmortizationYears: 30 },
  },
};
const scenarioBase: PropertyReturnsInputs = { ...APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput, lenderTests: lenderTests("2027-09") };
const scenarios: ApartmentScenarioDefinition[] = [
  { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: evidence } },
  { id: "lower-exit-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: evidence } },
];

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

describe("runs without a permanent loan", () => {
  const runs = {
    propertyReturns: computePropertyReturns(base),
    propertyReturnsSized: computePropertyReturns(sized),
    developmentCapital: computeDevelopmentCapital(base),
    returnsFixture: computePropertyReturns(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput),
    capitalFixture: fundMonthlyDevelopmentCashFlow(APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE.monthlyCashFlow, APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE.plan),
    scenarios: runApartmentScenarioComparison(scenarioBase, scenarios),
  };

  it("complete, so the digests compare real results", () => {
    for (const [name, run] of Object.entries(runs)) expect(run.status, name).toBe("complete");
  });

  it("match the results from before LA-1867 exactly", () => {
    const digests = Object.fromEntries(Object.entries(runs).map(([name, run]) => [name, digest(run)]));
    expect(digests).toEqual(BEFORE_LA_1867);
  });
});
