import { describe, expect, it } from "vitest";

import { projectApartmentOperationsThrough } from "./apartment-operations";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { annualDebtConstant, LENDER_TESTS_INPUT_VERSION, type LenderTestPlan, type LoanSizingPlan } from "./lender-tests";
import { computePropertyReturns, validatePropertyReturnsPlan, type PropertyReturnsInputs } from "./property-returns";

const evidence = { sourceLabel: "Lender term sheet", sourceDate: "2026-10-05", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;

const withSizing = (loanSizing?: Partial<LoanSizingPlan>): PropertyReturnsInputs => {
  const lenderTests: LenderTestPlan = {
    lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
    valuationMonth: "2028-09",
    asStabilizedCapRatePercent: 5.5,
    annualDebtService: 3_000_000,
    noiBasis: "noi_before_reserves",
    lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
    ...(loanSizing ? { loanSizing: { noiTaxBasis: "full_tax", evidence, ...loanSizing } } : {}),
  };
  return { ...base, lenderTests };
};

function valuationNoi(input: PropertyReturnsInputs) {
  const months = projectApartmentOperationsThrough(input, "2029-08").filter(({ month }) => month >= "2028-09");
  return months.reduce((total, month) => total + Math.round(month.netOperatingIncome * 100), 0) / 100;
}

describe("loan sizing as the lesser of lender caps", () => {
  const ltcOnly = computePropertyReturns(withSizing());
  const ltcLoan = ltcOnly.result!.developmentCapital.totals.totalDebt;
  const noi = valuationNoi(base);

  it("keeps LTC sizing and the same results when no cap is set", () => {
    const sized = computePropertyReturns(withSizing({}));
    expect(sized.status, JSON.stringify(sized.issues)).toBe("complete");
    expect(sized.result!.developmentCapital.totals).toEqual(ltcOnly.result!.developmentCapital.totals);
    expect(sized.result!.lenderTests!.loanSizing).toMatchObject({ bindingCap: "loanToCost", loanAmount: ltcLoan });
    expect(sized.result!.developmentCapital.debtCeiling).toBeUndefined();
  });

  it("sizes the loan down to an LTV cap that binds and funds the gap with equity", () => {
    const value = noi / 0.055;
    const ltvPercent = Math.floor(ltcLoan * 0.8 / value * 1000) / 10;
    const run = computePropertyReturns(withSizing({ maxLoanToValuePercent: ltvPercent }));
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const sizing = run.result!.lenderTests!.loanSizing!;
    const totals = run.result!.developmentCapital.totals;
    expect(sizing.bindingCap).toBe("loanToValue");
    const ltv = sizing.caps.find(({ key }) => key === "loanToValue")!;
    expect(ltv.amount).toBeCloseTo(value * ltvPercent / 100, -1);
    expect(totals.totalDebt).toBeCloseTo(ltv.amount, 2);
    expect(totals.totalDebt).toBeLessThan(ltcLoan);
    expect(totals.equity).toBeGreaterThan(ltcOnly.result!.developmentCapital.totals.equity);
    expect(sizing.caps.find(({ key }) => key === "loanToCost")!.amount).toBeGreaterThan(ltv.amount);
    expect(run.reconciliations.find(({ id }) => id === "loan-sizing-binding-cap")?.status).toBe("pass");
    expect(run.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(run.result!.developmentCapital.debtCeiling).toBeCloseTo(ltv.amount, 2);
  });

  it("caps on debt yield and on DSCR at a stated rate and amortization", () => {
    const debtYield = computePropertyReturns(withSizing({ minDebtYieldPercent: noi / (ltcLoan * 0.7) * 100 }));
    expect(debtYield.result!.lenderTests!.loanSizing!.bindingCap).toBe("debtYield");
    expect(debtYield.result!.developmentCapital.totals.totalDebt).toBeCloseTo(ltcLoan * 0.7, -1);

    const constant = annualDebtConstant(7, 30);
    const dscr = noi / (ltcLoan * 0.75 * constant);
    const run = computePropertyReturns(withSizing({ minDebtServiceCoverage: dscr, dscrRatePercent: 7, dscrAmortizationYears: 30 }));
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    expect(run.result!.lenderTests!.loanSizing!.bindingCap).toBe("debtServiceCoverage");
    expect(run.result!.developmentCapital.totals.totalDebt).toBeCloseTo(ltcLoan * 0.75, -1);
  });

  it("prices the debt constant for amortizing and interest-only loans", () => {
    expect(annualDebtConstant(6, 0)).toBeCloseTo(0.06, 12);
    // $1 over 30 years at 6% pays 0.0059955 a month.
    expect(annualDebtConstant(6, 30)).toBeCloseTo(0.0719461, 6);
  });

  it("binds on the smallest of several caps and marks only that one", () => {
    const run = computePropertyReturns(withSizing({
      maxLoanToValuePercent: 99,
      minDebtYieldPercent: noi / (ltcLoan * 0.6) * 100,
      minDebtServiceCoverage: 1.0,
      dscrRatePercent: 1,
      dscrAmortizationYears: 0,
    }));
    const caps = run.result!.lenderTests!.loanSizing!.caps;
    expect(caps.map(({ key }) => key)).toEqual(["loanToCost", "loanToValue", "debtYield", "debtServiceCoverage"]);
    expect(caps.filter(({ binding }) => binding).map(({ key }) => key)).toEqual(["debtYield"]);
  });

  it("fails the run when a cap is set but the valuation year cannot be sized", () => {
    const input = withSizing({ maxLoanToValuePercent: 60 });
    const run = computePropertyReturns({ ...input, lenderTests: { ...input.lenderTests!, valuationMonth: "2020-01" } });
    expect(run.status).toBe("failed");
    expect(run.issues.map(({ code }) => code)).toEqual(["loan_sizing_unavailable"]);
  });

  it("rejects bad caps, a DSCR floor without its rate and amortization, and missing evidence", () => {
    const issues = validatePropertyReturnsPlan({
      ...withSizing(),
      lenderTests: { ...withSizing().lenderTests!, loanSizing: { noiTaxBasis: "gross" as never, maxLoanToValuePercent: 0, minDebtServiceCoverage: 1.2, evidence: undefined as never } },
    });
    expect(issues.map(({ path }) => path)).toEqual([
      "lenderTests.loanSizing.noiTaxBasis",
      "lenderTests.loanSizing.maxLoanToValuePercent",
      "lenderTests.loanSizing.dscrRatePercent",
      "lenderTests.loanSizing.dscrAmortizationYears",
      "lenderTests.loanSizing.evidence",
    ]);
  });
});
