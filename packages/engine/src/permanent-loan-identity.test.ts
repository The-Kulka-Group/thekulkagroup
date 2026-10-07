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
 * existed. Each digest is the SHA-256 of a full run's JSON, computed on origin/main at 86dc8d8 (the
 * LA-1863 merge) with these same inputs. Any change to a number, label, trace or check moves it.
 */
const BEFORE_LA_1867 = {
  propertyReturns: "39bf73b8a984cbcf88385221eb7722b512903f021ed1cfaf1a0beb3b9dca6d1c",
  propertyReturnsSized: "3cd4b08183f05f0ed012f91dd018a7d7b58a5db03df7b6d9da891169da132a83",
  developmentCapital: "9d615c124fb67ee7d3b78860c08be2396ced003617a4bedf37e61fc5999e853b",
  returnsFixture: "7105e447fb80df64f817f4c7300877914033c94ee7e6dee9db72955461c2f142",
  capitalFixture: "0b2cf04c2fd8d8db45ae57e0be0c275967a8dbaff2995bb1da39315db865ca6c",
  scenarios: "b08c6c801dc0d3e351b1dbfcf7f066291db619c4637c075a3fdc17284d1ab3f6",
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
