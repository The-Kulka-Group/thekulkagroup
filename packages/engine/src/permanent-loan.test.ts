import { describe, expect, it } from "vitest";

import { computeApartmentOperations, projectApartmentOperationsThrough } from "./apartment-operations";
import { runApartmentScenarioComparison } from "./apartment-scenarios";
import type { CommercialOperations } from "./commercial-operations";
import { fundMonthlyDevelopmentCashFlow } from "./development-capital";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { annualDebtConstant, LENDER_TESTS_INPUT_VERSION, type LenderTestPlan } from "./lender-tests";
import { engineOutputsFor, validateScorecardTargets } from "./model-scorecard";
import {
  PERMANENT_LOAN_ASSUMPTION_KEYS,
  PERMANENT_LOAN_INPUT_VERSION,
  validatePermanentLoanPlan,
  type PermanentLoanPlan,
} from "./permanent-loan";
import { calculatePropertyReturns, computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";

const evidence = { sourceLabel: "Permanent loan quote", sourceDate: "2026-10-07", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const SALE = "2032-09";
// The v2.98 base stabilizes in 2028-09; its last project cost falls in 2027-06.
const STABILIZED = computeApartmentOperations({ ...base, saleMonth: SALE }).result!.firstStabilizedMonth!;

function loan(overrides: Partial<PermanentLoanPlan> = {}): PermanentLoanPlan {
  const plan: PermanentLoanPlan = {
    permanentLoanInputVersion: PERMANENT_LOAN_INPUT_VERSION,
    fundingAnchor: { kind: "stabilization", offsetMonths: 0 },
    sizingMode: "construction_balance",
    sizingNoiWindow: { kind: "trailing", months: 3 },
    noiTaxBasis: "full_tax",
    annualRatePercent: 6,
    interestOnlyMonths: 24,
    amortizationYears: 30,
    termYears: 10,
    feePercent: 0,
    closingCosts: 0,
    cashOut: "distribute",
    evidence: Object.fromEntries(PERMANENT_LOAN_ASSUMPTION_KEYS.map((key) => [key, evidence])) as PermanentLoanPlan["evidence"],
    ...overrides,
  };
  return plan;
}

const withLoan = (plan: PermanentLoanPlan | undefined, extra: Partial<PropertyReturnsInputs> = {}): PropertyReturnsInputs => ({
  ...base,
  saleMonth: SALE,
  payoffMonth: SALE,
  ...(plan ? { permanentLoan: plan } : {}),
  ...extra,
});

function complete(input: PropertyReturnsInputs) {
  const run = computePropertyReturns(input);
  expect(run.status, JSON.stringify(run.issues)).toBe("complete");
  expect(run.reconciliations.filter(({ status }) => status === "fail").map(({ id }) => id)).toEqual([]);
  return { run, result: run.result!, loan: run.result!.developmentCapital.permanentLoan! };
}

/** NOI before reserves from the run's own operations, summed over a window. */
function noiOver(input: PropertyReturnsInputs, first: string, last: string) {
  return projectApartmentOperationsThrough(input, last)
    .filter(({ month }) => month >= first && month <= last)
    .reduce((total, month) => total + Math.round(month.netOperatingIncome * 100), 0);
}

function addMonths(month: string, offset: number) {
  const [year, number] = month.split("-").map(Number);
  const index = year * 12 + number - 1 + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

describe("permanent loan takeout", () => {
  it("repays the construction loan in the takeout month and funds the permanent loan there", () => {
    const { result, loan: permanent } = complete(withLoan(loan()));
    const capital = result.developmentCapital;
    expect(permanent.fundingMonth).toBe(STABILIZED);
    expect(permanent.fundingTrace).toBe(`first stabilized month ${STABILIZED}`);

    const repaid = capital.months.filter(({ repayment }) => repayment !== 0);
    expect(repaid.map(({ month }) => month)).toEqual([STABILIZED]);
    expect(permanent.constructionPayoff).toBe(repaid[0].repayment);
    const after = capital.months.filter(({ month }) => month > STABILIZED);
    expect(after.every((month) => month.closingDebtBalance === 0 && month.grossInterest === 0 && month.totalDebtDraw === 0)).toBe(true);

    // Construction balance sizing: proceeds equal the payoff, with no cash-out or paydown.
    expect(permanent.binding).toBe("constructionBalance");
    expect(permanent.loanAmount).toBe(permanent.constructionPayoff);
    expect(permanent.cashOut).toBe(0);
    expect(permanent.equityPaydown).toBe(0);
    expect(permanent.maturityMonth).toBe(addMonths(STABILIZED, 120));
  });

  it("charges interest only, then a level payment, month by month", () => {
    const { loan: permanent } = complete(withLoan(loan()));
    const amountCents = Math.round(permanent.loanAmount * 100);
    const rate = 0.06 / 12;
    const interestOnlyCents = Math.round(amountCents * rate);
    const [funding, ...payments] = permanent.months;
    expect(funding.debtService).toBe(0);
    expect(payments.slice(0, 24).every((row) => row.principal === 0 && row.interest * 100 === interestOnlyCents)).toBe(true);

    // The level payment is the 30-year annuity on the loan amount.
    const paymentCents = Math.round(amountCents * rate / (1 - (1 + rate) ** -360));
    expect(Math.round(permanent.monthlyPayment! * 100)).toBe(paymentCents);
    expect(permanent.annualDebtService).toBe(paymentCents * 12 / 100);
    expect(permanent.annualDebtService).toBeCloseTo(permanent.loanAmount * annualDebtConstant(6, 30), 0);
    expect(payments.slice(24).every((row) => Math.round(row.debtService * 100) === paymentCents)).toBe(true);
    expect(permanent.firstYearDebtService).toBe(interestOnlyCents * 12 / 100);
    expect(permanent.firstYearMonthCount).toBe(12);

    // After k level payments the balance is the closed-form annuity balance, within rounding.
    const k = 24;
    const closedForm = amountCents * (1 + rate) ** k - paymentCents * ((1 + rate) ** k - 1) / rate;
    expect(Math.abs(Math.round(permanent.loanYearBalances[3].balance * 100) - closedForm)).toBeLessThan(k);
    expect(permanent.loanYearBalances.slice(0, 2).every(({ balance }) => balance === permanent.loanAmount)).toBe(true);
  });

  it("repays the closing permanent balance at sale and puts debt service in levered cash flow", () => {
    const { result, loan: permanent } = complete(withLoan(loan()));
    const last = permanent.months.at(-1)!;
    expect(last.month).toBe(SALE);
    expect(permanent.payoffAtSale).toBe(Math.round((last.openingBalance - last.principal) * 100) / 100);
    expect(last.closingBalance).toBe(0);
    expect(result.propertyReturns.sale.debtPayoff).toBe(permanent.payoffAtSale);
    expect(result.propertyReturns.metrics.find(({ key }) => key === "debtPayoff")!.label).toBe("Permanent Loan Payoff");

    const months = result.propertyReturns.months;
    const takeout = months.find(({ month }) => month === STABILIZED)!;
    expect(takeout.permanentLoanProceeds).toBe(permanent.loanAmount);
    expect(takeout.repayment).toBe(permanent.constructionPayoff);
    const middle = months.find(({ month }) => month === addMonths(STABILIZED, 30))!;
    const row = permanent.months.find(({ month }) => month === middle.month)!;
    expect(middle.leveredCashFlow).toBe(Math.round((middle.operatingCashFlow - row.debtService) * 100) / 100);
    const sale = months.at(-1)!;
    expect(sale.leveredCashFlow).toBeCloseTo(sale.operatingCashFlow - last.debtService + sale.netSaleProceeds - permanent.payoffAtSale, 2);
    expect(sale.unleveredCashFlow).toBeCloseTo(sale.operatingCashFlow + sale.netSaleProceeds, 2);
  });

  it("names every check the scope asks for", () => {
    const { run, loan: permanent } = complete(withLoan(loan()));
    const ids = run.reconciliations.map(({ id }) => id);
    for (const id of ["permanent-loan-takeout", "permanent-loan-sale-payoff", "permanent-loan-paid-off", "permanent-loan-maturity", "permanent-loan-construction-payoff"]) {
      expect(ids).toContain(id);
    }
    expect(ids.filter((id) => id.startsWith("permanent-loan-roll-forward:"))).toHaveLength(permanent.months.length);
    expect(permanent.formulaTraces.map(({ key }) => key)).toEqual(expect.arrayContaining(["sizingNoi", "loanAmount", "annualDebtService", "payoffAtSale", "maturityMonth"]));
  });

  it("keeps project cost and operating shortfall before takeout in total uses, and nothing after", () => {
    const { result } = complete(withLoan(loan()));
    const capital = result.developmentCapital;
    const throughTakeout = capital.months.filter(({ month }) => month <= STABILIZED);
    const usesCents = throughTakeout.reduce((total, month) => total + Math.round(month.totalUses * 100), 0);
    expect(Math.round(capital.totals.totalUses * 100)).toBe(usesCents);
    expect(capital.months.filter(({ month }) => month > STABILIZED).every(({ totalUses }) => totalUses === 0)).toBe(true);
  });
});

describe("permanent loan sizing", () => {
  const takeoutPayoff = complete(withLoan(loan())).loan.constructionPayoff;

  it("annualizes a trailing window that ends the month before funding", () => {
    const input = withLoan(loan({ sizingNoiWindow: { kind: "trailing", months: 6 } }));
    const { loan: permanent } = complete(input);
    expect(permanent.sizingWindow).toEqual({ kind: "trailing", startMonth: addMonths(STABILIZED, -6), endMonth: addMonths(STABILIZED, -1), monthCount: 6 });
    expect(Math.round(permanent.sizingNoi * 100)).toBe(Math.round(noiOver(input, addMonths(STABILIZED, -6), addMonths(STABILIZED, -1)) * 12 / 6));
    // No abatement on this case, so both tax bases agree.
    expect(permanent.fullTaxSizingNoi).toBe(permanent.scheduledTaxSizingNoi);
  });

  it("reads the forward twelve months from funding, past the sale year end if needed", () => {
    const input = withLoan(loan({ sizingNoiWindow: { kind: "forward_twelve" } }));
    const { loan: permanent } = complete(input);
    expect(permanent.sizingWindow.startMonth).toBe(STABILIZED);
    expect(Math.round(permanent.sizingNoi * 100)).toBe(noiOver(input, STABILIZED, addMonths(STABILIZED, 11)));
  });

  it("sizes on the lesser of the caps, marks the binding one, and pays the excess to the equity holders", () => {
    const input = withLoan(loan({ sizingNoiWindow: { kind: "forward_twelve" } }));
    const noiCents = noiOver(input, STABILIZED, addMonths(STABILIZED, 11));
    // A debt yield that sizes the loan at 120 percent of the construction payoff binds below the LTV cap.
    const minDebtYieldPercent = noiCents / (takeoutPayoff * 100 * 1.2) * 100;
    const { result, loan: permanent } = complete(withLoan(loan({
      sizingMode: "lesser_of_tests",
      sizingNoiWindow: { kind: "forward_twelve" },
      minDebtYieldPercent,
      maxLoanToValuePercent: 75,
      valuationCapRatePercent: 5,
      feePercent: 1,
      closingCosts: 50_000,
      evidence: { ...loan().evidence, minDebtYieldPercent: evidence, maxLoanToValuePercent: evidence, valuationCapRatePercent: evidence },
    })));
    expect(permanent.binding).toBe("debtYield");
    expect(permanent.caps.map(({ key, binding }) => [key, binding])).toEqual([["loanToValue", false], ["debtYield", true]]);
    expect(permanent.loanAmount).toBeCloseTo(takeoutPayoff * 1.2, -1);
    expect(permanent.fee).toBe(Math.round(permanent.loanAmount * 100 * 0.01) / 100);
    expect(permanent.cashOut).toBeCloseTo(permanent.loanAmount - permanent.fee - 50_000 - takeoutPayoff, 2);
    expect(permanent.equityPaydown).toBe(0);
    expect(permanent.loanToValue).toBeCloseTo(permanent.loanAmount / (permanent.sizingNoi / 0.05), 10);

    const takeout = result.propertyReturns.months.find(({ month }) => month === STABILIZED)!;
    expect(takeout.refinanceCosts).toBe(Math.round((permanent.fee + 50_000) * 100) / 100);
    // The cash-out reaches levered cash flow, and the waterfall distributes it with no change of its own.
    const withoutLoanTerms = takeout.leveredCashFlow - takeout.permanentLoanProceeds! + takeout.refinanceCosts! + takeout.repayment;
    expect(takeout.leveredCashFlow).toBeCloseTo(withoutLoanTerms - permanent.constructionPayoff + permanent.netProceeds, 2);
    const partnershipMonth = result.partnership!.months.find(({ month }) => month === STABILIZED)!;
    expect(partnershipMonth.lpDistribution + partnershipMonth.gpDistribution).toBeGreaterThanOrEqual(permanent.cashOut - 0.01);
  });

  it("cuts the loan back to payoff so net proceeds equal the construction payoff to the cent", () => {
    const { loan: permanent } = complete(withLoan(loan({
      sizingMode: "lesser_of_tests",
      minDebtYieldPercent: 1,
      cashOut: "limit_to_payoff",
      feePercent: 1,
      closingCosts: 50_000,
      evidence: { ...loan().evidence, minDebtYieldPercent: evidence },
    })));
    expect(permanent.binding).toBe("payoffLimit");
    expect(permanent.netProceeds).toBe(permanent.constructionPayoff);
    expect(permanent.cashOut).toBe(0);
    expect(permanent.equityPaydown).toBe(0);
    expect(permanent.loanAmount).toBeGreaterThan(permanent.constructionPayoff + 50_000);
  });

  it("reports a shortfall as an equity paydown on its own line, funded as a cash call", () => {
    const { result, loan: permanent } = complete(withLoan(loan({
      sizingMode: "lesser_of_tests",
      minDebtServiceCoverage: 2,
      evidence: { ...loan().evidence, minDebtServiceCoverage: evidence },
    })));
    expect(permanent.binding).toBe("debtServiceCoverage");
    expect(permanent.loanAmount).toBeLessThan(permanent.constructionPayoff);
    expect(permanent.equityPaydown).toBeCloseTo(permanent.constructionPayoff - permanent.loanAmount, 2);
    expect(permanent.months[0].equityPaydown).toBe(permanent.equityPaydown);
    const partnershipMonth = result.partnership!.months.find(({ month }) => month === STABILIZED)!;
    expect(partnershipMonth.cashCall).toBeGreaterThan(0);
  });

  it("each scenario sizes its own permanent loan on its own NOI", () => {
    const input = withLoan(loan({ sizingMode: "lesser_of_tests", minDebtYieldPercent: 9, evidence: { ...loan().evidence, minDebtYieldPercent: evidence } }));
    const run = runApartmentScenarioComparison(input, [
      { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 12 }, evidence: { vacancyPercent: evidence } },
      { id: "lower-exit-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: evidence } },
    ]);
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const baseLoan = run.result!.base.propertyResult.developmentCapital.permanentLoan!;
    const scenarioLoan = run.result!.scenarios[0].propertyResult.developmentCapital.permanentLoan!;
    expect(scenarioLoan.sizingNoi).toBeLessThan(baseLoan.sizingNoi);
    expect(scenarioLoan.loanAmount).toBeLessThan(baseLoan.loanAmount);
    expect(scenarioLoan.loanAmount).toBeCloseTo(scenarioLoan.sizingNoi / 0.09, -1);
  });
});

describe("permanent loan on a case with commercial space (LA-1867 and LA-1868 seam)", () => {
  it("sizes on total NOI, so commercial NOI raises the sizing NOI and the loan", () => {
    const commercial: CommercialOperations = {
      spaces: [{
        id: "retail-a", name: "Retail A", areaSf: 10_000, annualRentPerSf: 30, leaseStartMonth: "2027-07", freeRentMonths: 0,
        recoveries: [], tenantImprovementPerSf: 40, leasingCommissionPercent: 5, leaseTermMonths: 120, ...evidence,
      }],
      vacancyPercent: 5,
      creditLossPercent: 1,
      ...evidence,
    };
    const plan = loan({ sizingMode: "lesser_of_tests", sizingNoiWindow: { kind: "forward_twelve" }, minDebtYieldPercent: 9, evidence: { ...loan().evidence, minDebtYieldPercent: evidence } });
    const residential = withLoan(plan);
    const mixed = withLoan(plan, { commercial });
    const withSpace = complete(mixed).loan;
    const without = complete(residential).loan;
    const window = projectApartmentOperationsThrough(mixed, addMonths(withSpace.fundingMonth, 11)).filter(({ month }) => month >= withSpace.fundingMonth);
    const commercialNoiCents = window.reduce((total, month) => total + Math.round(month.commercialNetOperatingIncome * 100), 0);
    expect(commercialNoiCents).toBeGreaterThan(0);
    expect(Math.round(withSpace.sizingNoi * 100)).toBe(noiOver(mixed, withSpace.fundingMonth, addMonths(withSpace.fundingMonth, 11)));
    expect(withSpace.fundingMonth).toBe(without.fundingMonth);
    expect(Math.round(withSpace.sizingNoi * 100) - Math.round(without.sizingNoi * 100)).toBe(commercialNoiCents);
    expect(withSpace.binding).toBe("debtYield");
    expect(withSpace.loanAmount).toBe(Math.floor(Math.round(withSpace.sizingNoi * 100) / 0.09) / 100);
    expect(withSpace.loanAmount).toBeGreaterThan(without.loanAmount);
  });
});

describe("permanent loan timing", () => {
  it("funds on a typed month, a stabilization offset, or a milestone offset", () => {
    const typed = complete(withLoan(loan({ fundingAnchor: undefined, fundingMonth: "2029-03" }))).loan;
    expect(typed.fundingMonth).toBe("2029-03");
    const offset = complete(withLoan(loan({ fundingAnchor: { kind: "stabilization", offsetMonths: 3 } }))).loan;
    expect(offset.fundingMonth).toBe(addMonths(STABILIZED, 3));
    expect(offset.fundingTrace).toBe(`first stabilized month ${STABILIZED} plus 3 months`);
    const milestone = complete(withLoan(
      loan({ fundingAnchor: { milestoneId: "refi", offsetMonths: -2 } }),
      { milestones: [{ id: "refi", name: "Refinance", month: "2029-06" }] },
    )).loan;
    expect(milestone.fundingMonth).toBe("2029-04");
  });

  it("allows a sale on maturity and refuses a sale after it", () => {
    const maturity = addMonths(STABILIZED, 36);
    expect(complete(withLoan(loan({ termYears: 3 }), { saleMonth: maturity, payoffMonth: maturity })).loan.maturityMonth).toBe(maturity);
    const late = computePropertyReturns(withLoan(loan({ termYears: 3 })));
    expect(late.status).toBe("failed");
    expect(late.issues.map(({ code }) => code)).toEqual(["permanent_loan_after_maturity"]);
  });

  it("refuses a takeout before the last project cost or on the sale month", () => {
    const early = computePropertyReturns(withLoan(loan({ fundingAnchor: undefined, fundingMonth: "2027-01" })));
    expect(early.status).toBe("failed");
    expect(early.issues.map(({ path, code }) => [path, code])).toEqual([["permanentLoan.fundingMonth", "payoff_before_last_use"]]);
    const onSale = computePropertyReturns(withLoan(loan({ fundingAnchor: undefined, fundingMonth: SALE })));
    expect(onSale.issues.map(({ code }) => code)).toContain("invalid_permanent_loan");
  });

  it("funds debt service shortfalls after takeout as equity calls, not construction draws", () => {
    // A rate high enough that interest-only debt service exceeds operating cash flow.
    const { result, loan: permanent } = complete(withLoan(loan({ annualRatePercent: 12 })));
    expect(permanent.equityCalls).toBeGreaterThan(0);
    const short = permanent.months.find(({ equityCall }) => equityCall > 0)!;
    expect(short.equityCall).toBeCloseTo(short.debtService - short.operatingCashFlow, 2);
    const capitalMonth = result.developmentCapital.months.find(({ month }) => month === short.month)!;
    expect(capitalMonth.totalDebtDraw).toBe(0);
    expect(capitalMonth.equityContribution).toBe(0);
    expect(result.propertyReturns.months.find(({ month }) => month === short.month)!.leveredCashFlow).toBeCloseTo(-short.equityCall, 2);
  });

  it("runs interest only for the whole term with zero amortization", () => {
    const { loan: permanent } = complete(withLoan(loan({ amortizationYears: 0, interestOnlyMonths: 0 })));
    expect(permanent.monthlyPayment).toBeNull();
    expect(permanent.totalPrincipal).toBe(0);
    expect(permanent.payoffAtSale).toBe(permanent.loanAmount);
    expect(permanent.annualDebtService).toBe(Math.round(permanent.loanAmount * 100 * 0.06 / 12) * 12 / 100);
  });

  it("needs operations to resolve an anchored funding month", () => {
    const capital = fundMonthlyDevelopmentCashFlow([
      { month: "2026-01", projectCosts: 100, operatingCashFlow: 0 },
      { month: "2026-02", projectCosts: 0, operatingCashFlow: 10 },
    ], { ...base, payoffMonth: "2026-02", feeMonth: "2026-01", permanentLoan: loan() });
    expect(capital.issues.map(({ code }) => code)).toEqual(["permanent_loan_funding_unavailable"]);
  });
});

describe("lender DSCR with a permanent loan", () => {
  const lenderTests = (debtServiceBasis?: LenderTestPlan["debtServiceBasis"]): LenderTestPlan => ({
    lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
    valuationMonth: STABILIZED,
    asStabilizedCapRatePercent: 5.5,
    annualDebtService: 3_000_000,
    noiBasis: "noi_before_reserves",
    lenderTestEvidence: { valuationMonth: evidence, asStabilizedCapRatePercent: evidence, annualDebtService: evidence, noiBasis: evidence },
    ...(debtServiceBasis ? { debtServiceBasis } : {}),
  });
  const dscr = (result: { lenderTests: { metrics: Array<{ key: string; value: number | null; formula: string; inputPaths: string[] }> } | null }) =>
    result.lenderTests!.metrics.find(({ key }) => key === "debtServiceCoverage")!;

  it("reads the permanent loan's computed debt service by default", () => {
    const { result, loan: permanent } = complete(withLoan(loan(), { lenderTests: lenderTests() }));
    const metric = dscr(result);
    expect(result.lenderTests!.annualDebtService).toBe(permanent.annualDebtService);
    expect(result.lenderTests!.debtServiceSource).toBe("permanent_loan");
    expect(metric.value).toBeCloseTo(result.lenderTests!.stabilizedNoi / permanent.annualDebtService, 12);
    expect(metric.inputPaths).toContain("permanentLoan");
  });

  it("keeps the stated debt service as an override", () => {
    const { result } = complete(withLoan(loan(), { lenderTests: lenderTests("stated") }));
    expect(result.lenderTests!.annualDebtService).toBe(3_000_000);
    expect(result.lenderTests!.debtServiceSource).toBe("stated");
    expect(dscr(result).value).toBeCloseTo(result.lenderTests!.stabilizedNoi / 3_000_000, 12);
  });

  it("refuses the permanent loan basis without a permanent loan, and leaves runs without one unmarked", () => {
    const refused = computePropertyReturns(withLoan(undefined, { lenderTests: lenderTests("permanent_loan") }));
    expect(refused.issues.map(({ code }) => code)).toEqual(["invalid_lender_tests"]);
    const plain = complete(withLoan(undefined, { lenderTests: lenderTests() })).result;
    expect(plain.lenderTests!.debtServiceSource).toBeUndefined();
    expect(plain.developmentCapital.permanentLoan).toBeUndefined();
  });

  it("works beside construction loan sizing caps", () => {
    const tests = { ...lenderTests(), loanSizing: { noiTaxBasis: "full_tax" as const, maxLoanToValuePercent: 50, evidence } };
    const { result, loan: permanent } = complete(withLoan(loan(), { lenderTests: tests }));
    expect(result.lenderTests!.loanSizing!.bindingCap).toBe("loanToValue");
    expect(permanent.constructionPayoff).toBeLessThan(complete(withLoan(loan())).loan.constructionPayoff);
  });
});

describe("permanent loan scorecard outputs", () => {
  it("reports the loan, binding cap, debt service, coverage and loan-year balances", () => {
    const input = withLoan(loan({ sizingMode: "lesser_of_tests", minDebtServiceCoverage: 1.3, evidence: { ...loan().evidence, minDebtServiceCoverage: evidence } }));
    const { loan: permanent } = complete(input);
    const { outputs } = engineOutputsFor(input);
    expect(outputs).toMatchObject({
      permanentLoanAmount: permanent.loanAmount,
      permanentLoanBindingCap: "debtServiceCoverage",
      permanentLoanFundingMonth: STABILIZED,
      permanentLoanFirstYearDebtService: permanent.firstYearDebtService,
      permanentLoanAnnualDebtService: permanent.annualDebtService,
      permanentLoanDebtServiceCoverage: permanent.debtServiceCoverage,
      constructionLoanPayoff: permanent.constructionPayoff,
      permanentLoanPayoff: permanent.payoffAtSale,
      permanentLoanBalanceYear4: permanent.loanYearBalances[3].balance,
    });
    expect(outputs.permanentLoanBalanceYear5).toBeUndefined();
    expect(engineOutputsFor(withLoan(undefined)).outputs.permanentLoanAmount).toBeUndefined();
  });

  it("accepts a binding cap or funding month as text and refuses other text", () => {
    const target = (output: "permanentLoanBindingCap" | "permanentLoanFundingMonth", expected: string) => ({ id: output, output, expected, stage: "compare" as const, tolerance: { absolute: 0 } });
    expect(validateScorecardTargets([target("permanentLoanBindingCap", "constructionBalance"), target("permanentLoanFundingMonth", "2027-01")])).toEqual([]);
    expect(validateScorecardTargets([target("permanentLoanBindingCap", "lender")]).map(({ problem }) => problem)).toEqual(["bad_expected"]);
  });
});

describe("permanent loan validation", () => {
  it("rejects a bad block field by field", () => {
    const issues = validatePermanentLoanPlan({
      ...loan(),
      fundingMonth: "2029-01",
      sizingMode: "lesser_of_tests",
      sizingNoiWindow: { kind: "trailing", months: 0 },
      maxLoanToValuePercent: 70,
      annualRatePercent: 0,
      termYears: 0,
      interestOnlyMonths: -1,
      closingCosts: 1.234,
      cashOut: "keep" as never,
    });
    expect(issues.map(({ path }) => path)).toEqual([
      "permanentLoan.fundingMonth",
      "permanentLoan.sizingNoiWindow.months",
      "permanentLoan.valuationCapRatePercent",
      "permanentLoan.annualRatePercent",
      "permanentLoan.termYears",
      "permanentLoan.interestOnlyMonths",
      "permanentLoan.closingCosts",
      "permanentLoan.cashOut",
      "permanentLoan.evidence.maxLoanToValuePercent",
    ]);
    expect(validatePermanentLoanPlan({ ...loan(), sizingMode: "lesser_of_tests" }).map(({ message }) => message)).toEqual([
      "Sizing on the lesser of the tests needs at least one cap: LTV, DSCR or debt yield.",
    ]);
  });

  it("refuses permanent loan cash in a returns calculation with no takeout month", () => {
    const { run } = complete(withLoan(loan()));
    const months = run.result!.propertyReturns.months.map(({ date: _date, netSaleProceeds: _sale, unleveredCashFlow: _u, leveredCashFlow: _l, ...month }) => {
      void _date; void _sale; void _u; void _l;
      return month;
    });
    const moved = months.map((month) => ({ ...month, permanentLoanProceeds: 0 }));
    const calculation = calculatePropertyReturns(moved, {
      startMonth: SALE, endMonth: addMonths(SALE, 11), monthCount: 12, effectiveGrossRevenue: 1_000_000, operatingExpenses: 400_000,
    }, { ...run.inputSnapshot, saleAssumptionEvidence: run.inputSnapshot.saleAssumptionEvidence });
    expect(calculation.issues.map(({ code }) => code)).toContain("sale_payoff_mismatch");
  });
});
