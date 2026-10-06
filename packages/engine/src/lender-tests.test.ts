import { describe, expect, it } from "vitest";

import { projectApartmentOperationsThrough } from "./apartment-operations";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { LENDER_TESTS_INPUT_VERSION, type LenderTestPlan } from "./lender-tests";
import {
  computePropertyReturns,
  PROPERTY_RETURNS_FORMULA_VERSION,
  validatePropertyReturnsPlan,
  type PropertyReturnsInputs,
} from "./property-returns";

const evidence = { sourceLabel: "Lender term sheet", sourceDate: "2026-10-05", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;

const lenderPlan = (overrides: Partial<LenderTestPlan> = {}): LenderTestPlan => ({
  lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
  valuationMonth: "2028-09",
  asStabilizedCapRatePercent: 5.5,
  annualDebtService: 3_000_000,
  noiBasis: "noi_before_reserves",
  lenderTestEvidence: {
    valuationMonth: evidence,
    asStabilizedCapRatePercent: evidence,
    annualDebtService: evidence,
    noiBasis: evidence,
  },
  ...overrides,
});

const withLenderTests = (plan: LenderTestPlan, overrides: Partial<PropertyReturnsInputs> = {}): PropertyReturnsInputs => ({
  ...base,
  ...overrides,
  lenderTests: plan,
});

function metric(run: ReturnType<typeof computePropertyReturns>, key: string) {
  const found = run.result?.lenderTests?.metrics.find((item) => item.key === key);
  if (!found) throw new Error(`Missing lender metric ${key}`);
  return found;
}

function twelveMonthSum(input: PropertyReturnsInputs, startMonth: string, field: "netOperatingIncome" | "operatingCashFlow") {
  const [year, month] = startMonth.split("-").map(Number);
  const endIndex = year * 12 + month - 1 + 11;
  const endMonth = `${Math.floor(endIndex / 12)}-${String(endIndex % 12 + 1).padStart(2, "0")}`;
  const months = projectApartmentOperationsThrough(input, endMonth).filter((item) => item.month >= startMonth);
  return Math.round(months.reduce((total, item) => total + item[field], 0) * 100) / 100;
}

describe("lender tests on the full property run", () => {
  it("runs under the current formula and reports no lender tests when the plan has none", () => {
    const run = computePropertyReturns(base);
    expect(run.formulaVersion).toBe("underwriting.property_returns.v3");
    expect(PROPERTY_RETURNS_FORMULA_VERSION).toBe("underwriting.property_returns.v3");
    expect(run.status).toBe("complete");
    expect(run.result?.lenderTests).toBeNull();
  });

  it("values the stabilized year, then tests the loan against value, cost and debt service", () => {
    const input = withLenderTests(lenderPlan());
    const run = computePropertyReturns(input);
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const tests = run.result!.lenderTests!;
    const capital = run.result!.developmentCapital.totals;
    const noi = twelveMonthSum(input, "2028-09", "netOperatingIncome");

    expect(tests.valuationStartMonth).toBe("2028-09");
    expect(tests.valuationEndMonth).toBe("2029-08");
    expect(tests.stabilizedNoi).toBeCloseTo(noi, 2);
    expect(tests.issues).toEqual([]);
    expect(metric(run, "asStabilizedValue").value).toBeCloseTo(noi / 0.055, 0);
    expect(metric(run, "loanToValue").value).toBeCloseTo(capital.totalDebt / (noi / 0.055), 6);
    expect(metric(run, "loanToCost").value).toBeCloseTo(capital.totalDebt / capital.totalUses, 9);
    expect(metric(run, "debtServiceCoverage").value).toBeCloseTo(noi / 3_000_000, 9);
    expect(metric(run, "debtYield").value).toBeCloseTo(noi / capital.totalDebt, 9);
  });

  it("names the NOI basis in every NOI-driven trace and uses cash flow after reserves when asked", () => {
    const input = withLenderTests(lenderPlan({ noiBasis: "noi_after_reserves" }));
    const run = computePropertyReturns(input);
    const afterReserves = twelveMonthSum(input, "2028-09", "operatingCashFlow");
    expect(run.result!.lenderTests!.stabilizedNoi).toBeCloseTo(afterReserves, 2);
    for (const key of ["asStabilizedValue", "loanToValue", "debtServiceCoverage", "debtYield"]) {
      expect(metric(run, key).formula, key).toContain("NOI after reserves");
      expect(metric(run, key).inputPaths, key).toContain("lenderTests.noiBasis");
    }
    expect(metric(run, "loanToCost").formula).not.toContain("NOI");
  });

  it("reports an issue in place of each test that needs debt when there is no debt", () => {
    const run = computePropertyReturns(withLenderTests(lenderPlan({ annualDebtService: 0 }), { targetDebtSharePercent: 0 }));
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    expect(metric(run, "loanToValue").value).toBe(0);
    expect(metric(run, "loanToCost").value).toBe(0);
    expect(metric(run, "debtYield").value).toBeNull();
    expect(metric(run, "debtServiceCoverage").value).toBeNull();
    expect(run.result!.lenderTests!.issues.map(({ code }) => code).sort()).toEqual(["zero_debt", "zero_debt_service"]);
  });

  it("reports an issue in place of every NOI-driven test when stabilized NOI is not positive", () => {
    const run = computePropertyReturns(withLenderTests(lenderPlan({ valuationMonth: "2026-01" })));
    expect(run.status).toBe("complete");
    expect(run.result!.lenderTests!.stabilizedNoi).toBeLessThanOrEqual(0);
    for (const key of ["asStabilizedValue", "loanToValue", "debtServiceCoverage", "debtYield"]) {
      expect(metric(run, key).value, key).toBeNull();
    }
    expect(metric(run, "loanToCost").value).not.toBeNull();
    expect(run.result!.lenderTests!.issues.map(({ code }) => code)).toEqual(["nonpositive_noi"]);
  });

  it("reports an issue when the valuation year starts before the analysis start", () => {
    const run = computePropertyReturns(withLenderTests(lenderPlan({ valuationMonth: "2020-01" })));
    expect(run.status).toBe("complete");
    expect(run.result!.lenderTests!.issues.map(({ code }) => code)).toEqual(["valuation_outside_timeline"]);
    expect(metric(run, "asStabilizedValue").value).toBeNull();
    expect(metric(run, "loanToCost").value).not.toBeNull();
  });

  it("projects a valuation year that runs past the sale month", () => {
    const run = computePropertyReturns(withLenderTests(lenderPlan({ valuationMonth: "2029-09" })));
    expect(run.status).toBe("complete");
    expect(run.result!.lenderTests!.valuationEndMonth).toBe("2030-08");
    expect(run.result!.lenderTests!.issues).toEqual([]);
  });

  it("reports an issue when the valuation year ends after the forward sale year", () => {
    const run = computePropertyReturns(withLenderTests(lenderPlan({ valuationMonth: "2029-10" })));
    expect(run.status).toBe("complete");
    expect(run.result!.lenderTests!.issues.map(({ code }) => code)).toEqual(["valuation_outside_timeline"]);
    expect(metric(run, "debtYield").value).toBeNull();
  });

  it("keeps the sale and returns unchanged when lender tests are added", () => {
    const without = computePropertyReturns(base).result!.propertyReturns;
    const withTests = computePropertyReturns(withLenderTests(lenderPlan())).result!.propertyReturns;
    expect(withTests).toEqual(without);
  });
});

describe("lender test plan validation", () => {
  const plan = (lenderTests: unknown) => ({ ...base, lenderTests } as PropertyReturnsInputs);
  const codes = (lenderTests: unknown) => validatePropertyReturnsPlan(plan(lenderTests)).map(({ path, code }) => `${path}:${code}`);

  it("accepts a complete lender test plan", () => {
    expect(codes(lenderPlan())).toEqual([]);
  });

  it.each([0, -1, 101, Number.NaN])("rejects an as-stabilized cap rate of %s", (asStabilizedCapRatePercent) => {
    expect(codes(lenderPlan({ asStabilizedCapRatePercent }))).toEqual(["lenderTests.asStabilizedCapRatePercent:invalid_percent"]);
  });

  it("rejects negative or fractional-cent debt service", () => {
    expect(codes(lenderPlan({ annualDebtService: -1 }))).toEqual(["lenderTests.annualDebtService:invalid_amount"]);
    expect(codes(lenderPlan({ annualDebtService: 10.005 }))).toEqual(["lenderTests.annualDebtService:invalid_amount"]);
  });

  it("rejects a bad month, basis, version and missing evidence", () => {
    expect(codes(lenderPlan({ valuationMonth: "2028-13" }))).toEqual(["lenderTests.valuationMonth:invalid_month"]);
    expect(codes(lenderPlan({ noiBasis: "gross" as LenderTestPlan["noiBasis"] }))).toEqual(["lenderTests.noiBasis:invalid_noi_basis"]);
    expect(codes(lenderPlan({ lenderTestInputVersion: "lender_tests_inputs.v0" as LenderTestPlan["lenderTestInputVersion"] })))
      .toEqual(["lenderTests.lenderTestInputVersion:unsupported_input_version"]);
    const { noiBasis: _dropped, ...partial } = lenderPlan().lenderTestEvidence;
    void _dropped;
    expect(codes(lenderPlan({ lenderTestEvidence: partial as LenderTestPlan["lenderTestEvidence"] })))
      .toEqual(["lenderTests.lenderTestEvidence.noiBasis:missing_evidence"]);
  });

  it("rejects a lender test block that is not an object", () => {
    expect(codes("yes")).toEqual(["lenderTests:invalid_lender_tests"]);
  });

  it("fails the run, not a single metric, when the plan is invalid", () => {
    const run = computePropertyReturns(withLenderTests(lenderPlan({ asStabilizedCapRatePercent: 0 })));
    expect(run.status).toBe("failed");
    expect(run.issues.map(({ code }) => code)).toContain("invalid_percent");
  });
});
