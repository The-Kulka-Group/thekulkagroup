import { describe, expect, it } from "vitest";

import {
  DEVELOPMENT_CAPITAL_INPUT_VERSION,
  computeDevelopmentCapital,
  fundMonthlyDevelopmentCashFlow,
  type DevelopmentCapitalPlan,
  type MonthlyDevelopmentCashFlow,
} from "./development-capital";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { LENDER_TESTS_INPUT_VERSION, type LenderTestPlan } from "./lender-tests";
import { engineOutputsFor } from "./model-scorecard";
import type { CreditedLandPlan, OtherFundingSource } from "./other-sources";
import { computePropertyReturns, type PropertyReturnsInputs } from "./property-returns";

const evidence = {
  targetDebtSharePercent: { sourceLabel: "Capital plan", sourceDate: "2026-08-01", reviewState: "done" as const },
  annualInterestRatePercent: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  loanFeePercent: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  fundingOrder: { sourceLabel: "Capital plan", sourceDate: "2026-08-01", reviewState: "done" as const },
  interestTreatment: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  interestConvention: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  feeMonth: { sourceLabel: "Term sheet", sourceDate: "2026-08-01", reviewState: "done" as const },
  payoffMonth: { sourceLabel: "Exit plan", sourceDate: "2026-08-01", reviewState: "done" as const },
};

const plan: DevelopmentCapitalPlan = {
  capitalInputVersion: DEVELOPMENT_CAPITAL_INPUT_VERSION,
  targetDebtSharePercent: 50,
  annualInterestRatePercent: 12,
  loanFeePercent: 1,
  fundingOrder: "equity_first.v1",
  interestTreatment: "capitalized_net_operating_cash.v1",
  interestConvention: "opening_balance_monthly.v1",
  feeMonth: "2026-01",
  payoffMonth: "2026-05",
  capitalAssumptionEvidence: evidence,
};

const cashFlow: MonthlyDevelopmentCashFlow[] = [
  { month: "2026-01", projectCosts: 100_000, operatingCashFlow: 0 },
  { month: "2026-02", projectCosts: 100_000, operatingCashFlow: -10_000 },
  { month: "2026-03", projectCosts: 0, operatingCashFlow: 5_000 },
  { month: "2026-04", projectCosts: 0, operatingCashFlow: 5_000 },
  { month: "2026-05", projectCosts: 0, operatingCashFlow: 5_000 },
];

const grant = (overrides: Partial<OtherFundingSource> = {}): OtherFundingSource => ({
  id: "state-grant",
  name: "State Grant",
  kind: "grant",
  draws: [{ month: "2026-01", amount: 50_000 }],
  sourceLabel: "Award letter",
  sourceDate: "2026-08-01",
  reviewState: "working",
  ...overrides,
});

const softLoan = (overrides: Partial<OtherFundingSource> = {}): OtherFundingSource => ({
  id: "county-loan",
  name: "County Loan",
  kind: "soft_loan",
  draws: [{ month: "2026-01", amount: 100_000 }],
  annualInterestRatePercent: 6,
  repaymentMonth: "2026-05",
  reviewState: "working",
  ...overrides,
});

const creditedLand = (overrides: Partial<CreditedLandPlan> = {}): CreditedLandPlan => ({
  creditedValue: 60_000,
  countsAsSponsorEquity: true,
  reviewState: "working",
  ...overrides,
});

const fund = (overrides: Partial<DevelopmentCapitalPlan> = {}, landCashCost = 0) =>
  fundMonthlyDevelopmentCashFlow(cashFlow, { ...plan, ...overrides }, landCashCost);

describe("grants", () => {
  it("fund uses before equity, cut the equity needed, and leave the debt share where it was", () => {
    const base = fund().result!;
    const run = fund({ otherSources: [grant()] });
    expect(run.status).toBe("complete");
    const result = run.result!;

    expect(result.totals.grants).toBe(50_000);
    expect(result.totals.equity).toBeLessThan(base.totals.equity);
    expect(result.totals.debtSharePercent).toBeCloseTo(50, 6);
    expect(result.months[0]).toMatchObject({ grantDraw: 50_000, otherSourcesApplied: 50_000 });
    expect(result.totals.equity + result.totals.grants + result.totals.totalDebt).toBeCloseTo(result.totals.totalUses, 2);
    expect(result.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });

  it("show up in the sources and uses summary with the amount the schedule applied", () => {
    const result = fund({ otherSources: [grant()] }).result!;
    const line = result.sourcesAndUses.cashBasis.sources.find(({ key }) => key === "other:state-grant");

    expect(line).toEqual({ key: "other:state-grant", label: "State Grant (Grant)", amount: 50_000 });
    expect(result.sourcesAndUses.cashBasis.totalSources).toBe(result.totals.totalUses);
    expect(result.sourcesAndUses.cashBasis.totalUses).toBe(result.totals.totalUses);
    expect(result.otherSources).toEqual([expect.objectContaining({ id: "state-grant", drawn: 50_000, applied: 50_000 })]);
    expect(result.reconciliations.find(({ id }) => id === "other-source-in-sources-and-uses:state-grant")?.status).toBe("pass");
  });

  it("take a schedule of draws, each in its own month", () => {
    const run = fund({ otherSources: [grant({ draws: [{ month: "2026-01", amount: 30_000 }, { month: "2026-02", amount: 20_000 }] })] });
    expect(run.status).toBe("complete");
    expect(run.result!.months.map(({ grantDraw }) => grantDraw)).toEqual([30_000, 20_000, 0, 0, 0]);
  });

  it("hold cash that arrives before it is needed and apply it when costs come", () => {
    const early = [{ month: "2026-01", amount: 103_000 }];
    const run = fund({ otherSources: [grant({ draws: early })] });
    expect(run.status).toBe("complete");
    const months = run.result!.months;
    expect(months[0].otherSourcesApplied).toBe(101_000);
    expect(months[0].otherSourcesCashBalance).toBe(2_000);
    expect(months[1].otherSourcesCashBalance).toBe(0);
  });

  it("fail the run when a draw brings more cash than the project uses", () => {
    const run = fund({ otherSources: [grant({ draws: [{ month: "2026-05", amount: 50_000 }] })] });
    expect(run.status).toBe("failed");
    expect(run.issues[0]).toMatchObject({ code: "other_sources_unused", path: "otherSources" });
  });

  it("fail the run when grants and loans leave negative equity at the target debt share", () => {
    const run = fund({ otherSources: [grant({ draws: [{ month: "2026-01", amount: 150_000 }] })] });
    expect(run.status).toBe("failed");
    expect(run.issues[0]).toMatchObject({ code: "other_sources_exceed_equity_need" });
  });
});

describe("soft loans", () => {
  it("accrue interest on the opening balance and repay principal plus interest in the repayment month", () => {
    const run = fund({ otherSources: [softLoan()] });
    expect(run.status).toBe("complete");
    const result = run.result!;

    expect(result.months.map(({ softLoanInterest }) => softLoanInterest)).toEqual([0, 500, 502.5, 505.01, 507.54]);
    expect(result.months.map(({ softLoanBalance }) => softLoanBalance)).toEqual([100_000, 100_500, 101_002.5, 101_507.51, 0]);
    expect(result.months[4].softLoanRepayment).toBe(102_015.05);
    expect(result.totals).toMatchObject({ softLoans: 100_000, softLoanInterest: 2_015.05, softLoanRepayment: 102_015.05 });
    expect(result.otherSources[0]).toMatchObject({ kind: "soft_loan", accruedInterest: 2_015.05, repaid: 102_015.05, closingBalance: 0 });
    expect(result.reconciliations.find(({ id }) => id === "soft-loans-repaid")?.status).toBe("pass");
  });

  it("keep accrued soft loan interest out of project uses", () => {
    const { totals } = fund({ otherSources: [softLoan()] }).result!;
    expect(totals.totalUses).toBeCloseTo(
      totals.projectCosts + totals.loanFees + totals.operatingShortfall + totals.capitalizedInterest,
      2,
    );
  });

  it("charge no interest at a zero rate", () => {
    const { totals } = fund({ otherSources: [softLoan({ annualInterestRatePercent: 0 })] }).result!;
    expect(totals.softLoanInterest).toBe(0);
    expect(totals.softLoanRepayment).toBe(100_000);
  });

  it("run beside a grant and tie both to the summary", () => {
    const run = fund({ otherSources: [grant({ draws: [{ month: "2026-01", amount: 20_000 }] }), softLoan({ draws: [{ month: "2026-01", amount: 60_000 }] })] });
    expect(run.status).toBe("complete");
    const keys = run.result!.sourcesAndUses.cashBasis.sources.map(({ key }) => key);
    expect(keys).toEqual(["equity", "debt", "other:state-grant", "other:county-loan"]);
    expect(run.result!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });
});

describe("credited land", () => {
  it("is never cash spent, so the funding schedule matches a run without it", () => {
    const base = fund({}, 40_000).result!;
    const run = fund({ creditedLand: creditedLand() }, 40_000).result!;
    expect(run.totals.totalUses).toBe(base.totals.totalUses);
    expect(run.totals.totalDebt).toBe(base.totals.totalDebt);
    expect(run.totals.equity).toBe(base.totals.equity);
    expect(run.creditedLand).toEqual({ cashLandCost: 40_000, creditedValue: 60_000, stepUp: 20_000, countsAsSponsorEquity: true });
  });

  it("counts as sponsor equity, and as a non-cash use, only where the deal says so", () => {
    const counted = fund({ creditedLand: creditedLand() }, 40_000).result!;
    expect(counted.totals).toMatchObject({ creditedLandStepUp: 20_000, creditedLandEquity: 20_000 });
    expect(counted.totals.sponsorEquity).toBeCloseTo(counted.totals.equity + 20_000, 2);
    const credited = counted.sourcesAndUses.creditedBasis!;
    expect(credited.sources.at(-1)).toEqual({ key: "creditedLandEquity", label: "Credited Land Equity (Non-Cash)", amount: 20_000 });
    expect(credited.uses.at(-1)).toEqual({ key: "landStepUp", label: "Land Step-Up to Credited Value (Non-Cash)", amount: 20_000 });
    expect(credited.totalSources).toBe(credited.totalUses);
    expect(credited.totalUses).toBeCloseTo(counted.totals.totalUses + 20_000, 2);

    const notCounted = fund({ creditedLand: creditedLand({ countsAsSponsorEquity: false }) }, 40_000).result!;
    expect(notCounted.totals).toMatchObject({ creditedLandStepUp: 20_000, creditedLandEquity: 0 });
    expect(notCounted.totals.sponsorEquity).toBe(notCounted.totals.equity);
    expect(notCounted.sourcesAndUses.creditedBasis).toBeNull();
  });

  it("splits land at cash cost from other project costs in the summary", () => {
    const { cashBasis } = fund({}, 40_000).result!.sourcesAndUses;
    expect(cashBasis.uses.slice(0, 2)).toEqual([
      { key: "land", label: "Land at Cash Cost", amount: 40_000 },
      { key: "otherProjectCosts", label: "Other Project Costs", amount: 160_000 },
    ]);
  });

  it("cannot be valued below the cash land cost", () => {
    const run = fund({ creditedLand: creditedLand({ creditedValue: 30_000 }) }, 40_000);
    expect(run.status).toBe("failed");
    expect(run.issues[0]).toMatchObject({ code: "credited_land_below_cash_cost", path: "creditedLand.creditedValue" });
  });

  it("is absent from the totals when the case has none", () => {
    const { totals, creditedLand: result } = fund({}, 40_000).result!;
    expect(result).toBeNull();
    expect(totals.creditedLandStepUp).toBeNull();
  });
});

describe("other source validation", () => {
  const codes = (overrides: Partial<DevelopmentCapitalPlan>) => fund(overrides).issues.map(({ code, path }) => `${path}:${code}`);

  it("rejects a grant that carries a rate or repayment month", () => {
    expect(codes({ otherSources: [grant({ annualInterestRatePercent: 3 })] })).toContain("otherSources.0:invalid_other_source");
  });

  it("requires a soft loan to name its rate and repayment month", () => {
    expect(codes({ otherSources: [softLoan({ annualInterestRatePercent: undefined, repaymentMonth: undefined })] })).toEqual(expect.arrayContaining([
      "otherSources.0.annualInterestRatePercent:invalid_percent",
      "otherSources.0.repaymentMonth:invalid_month",
    ]));
  });

  it("requires repayment after the last draw", () => {
    expect(codes({ otherSources: [softLoan({ repaymentMonth: "2026-01" })] })).toContain("otherSources.0.repaymentMonth:repayment_before_draw");
  });

  it("keeps every draw and repayment inside the model timeline", () => {
    expect(codes({ otherSources: [grant({ draws: [{ month: "2027-01", amount: 1 }] })] })).toContain("otherSources.0.draws.0.month:outside_timeline");
    expect(codes({ otherSources: [softLoan({ repaymentMonth: "2027-01" })] })).toContain("otherSources.0.repaymentMonth:outside_timeline");
  });

  it("rejects duplicate ids, repeated draw months and amounts that are not cents", () => {
    expect(codes({ otherSources: [grant(), grant()] })).toContain("otherSources.1.id:invalid_other_source");
    expect(codes({ otherSources: [grant({ draws: [{ month: "2026-01", amount: 5 }, { month: "2026-01", amount: 5 }] })] })).toContain("otherSources.0.draws.1.month:invalid_other_source");
    expect(codes({ otherSources: [grant({ draws: [{ month: "2026-01", amount: 5.123 }] })] })).toContain("otherSources.0.draws.0.amount:invalid_amount");
    expect(codes({ otherSources: [grant({ draws: [{ month: "2026-01", amount: 0 }] })] })).toContain("otherSources.0.draws.0.amount:invalid_amount");
  });

  it("requires a review state and a boolean equity choice on credited land", () => {
    expect(codes({ creditedLand: { creditedValue: 1, countsAsSponsorEquity: undefined as unknown as boolean, reviewState: "x" as "done" } })).toEqual(expect.arrayContaining([
      "creditedLand.countsAsSponsorEquity:invalid_credited_land",
      "creditedLand.reviewState:invalid_review_state",
    ]));
  });

  it("does not change the submitted plan", () => {
    const submitted = { ...plan, otherSources: [grant()], creditedLand: creditedLand() };
    const before = structuredClone(submitted);
    fundMonthlyDevelopmentCashFlow(cashFlow, submitted, 40_000);
    expect(submitted).toEqual(before);
  });
});

describe("other sources in the full run", () => {
  const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
  const startMonth = base.analysisStartMonth;
  const lenderTests: LenderTestPlan = {
    lenderTestInputVersion: LENDER_TESTS_INPUT_VERSION,
    valuationMonth: "2028-09",
    asStabilizedCapRatePercent: 5.5,
    annualDebtService: 3_000_000,
    noiBasis: "noi_before_reserves",
    lenderTestEvidence: {
      valuationMonth: { reviewState: "working" },
      asStabilizedCapRatePercent: { reviewState: "working" },
      annualDebtService: { reviewState: "working" },
      noiBasis: { reviewState: "working" },
    },
  };
  const run = (overrides: Partial<PropertyReturnsInputs>) => computePropertyReturns({ ...base, ...overrides });

  it("adds a grant to levered cash flow in the month it funds a cost", () => {
    const without = run({}).result!;
    const withGrant = run({ otherSources: [grant({ draws: [{ month: startMonth, amount: 1_000_000 }] })] });
    expect(withGrant.status).toBe("complete");
    const result = withGrant.result!;

    expect(result.developmentCapital.totals.grants).toBe(1_000_000);
    expect(result.developmentCapital.totals.equity).toBeLessThan(without.developmentCapital.totals.equity);
    expect(result.propertyReturns.returns.levered.netProfit).toBeGreaterThanOrEqual(without.propertyReturns.returns.levered.netProfit + 1_000_000 - 1);
    expect(withGrant.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });

  it("repays a soft loan's principal and interest out of levered cash flow in the repayment month", () => {
    const draws = [{ month: startMonth, amount: 1_000_000 }];
    const asGrant = run({ otherSources: [grant({ draws })] }).result!;
    const asLoan = run({ otherSources: [softLoan({ draws, annualInterestRatePercent: 5, repaymentMonth: base.saleMonth })] }).result!;

    const interest = asLoan.developmentCapital.totals.softLoanInterest;
    expect(interest).toBeGreaterThan(0);
    expect(asLoan.propertyReturns.months.at(-1)?.softLoanRepayment).toBe(asLoan.developmentCapital.totals.softLoanRepayment);
    expect(asGrant.propertyReturns.returns.levered.netProfit - asLoan.propertyReturns.returns.levered.netProfit)
      .toBeCloseTo(1_000_000 + interest, 1);
  });

  it("reports loan to cost with land at cash cost and at credited value", () => {
    const withCredit = run({ lenderTests, creditedLand: creditedLand({ creditedValue: 10_000_000 }) });
    expect(withCredit.status).toBe("complete");
    const tests = withCredit.result!.lenderTests!;
    const cash = tests.metrics.find(({ key }) => key === "loanToCost")!;
    const credited = tests.metrics.find(({ key }) => key === "loanToCostCreditedLand")!;

    const stepUp = 10_000_000 - withCredit.result!.developmentCapital.totals.landCashCost;
    expect(stepUp).toBeGreaterThan(0);
    expect(tests.creditedLandStepUp).toBeCloseTo(stepUp, 2);
    expect(tests.totalCostAtCreditedLand).toBeCloseTo(tests.totalCost + stepUp, 2);
    expect(cash.value).toBeCloseTo(tests.loanAmount / tests.totalCost, 10);
    expect(credited.value).toBeCloseTo(tests.loanAmount / (tests.totalCost + stepUp), 10);
    expect(credited.value!).toBeLessThan(cash.value!);
    expect(credited.label).toBe("Loan to Cost, Land at Credited Value");
  });

  it("reports one loan to cost when the case has no credited land", () => {
    const tests = run({ lenderTests }).result!.lenderTests!;
    expect(tests.metrics.some(({ key }) => key === "loanToCostCreditedLand")).toBe(false);
    expect(tests.creditedLandStepUp).toBeNull();
    expect(tests.totalCostAtCreditedLand).toBeNull();
  });

  it("does not let credited land lower the cash loan to cost", () => {
    const without = run({ lenderTests }).result!.lenderTests!.metrics.find(({ key }) => key === "loanToCost")!.value;
    const withCredit = run({ lenderTests, creditedLand: creditedLand({ creditedValue: 10_000_000 }) }).result!.lenderTests!.metrics.find(({ key }) => key === "loanToCost")!.value;
    expect(withCredit).toBe(without);
  });

  it("reads the new outputs for the golden scorecard", () => {
    const outputs = engineOutputsFor({
      ...base,
      lenderTests,
      otherSources: [grant({ draws: [{ month: startMonth, amount: 1_000_000 }] })],
      creditedLand: creditedLand({ creditedValue: 10_000_000 }),
    }).outputs;
    expect(outputs).toMatchObject({ grants: 1_000_000, softLoans: 0, creditedLandEquity: expect.any(Number) });
    expect(outputs.loanToCostCreditedLand).toBeLessThan(Number(outputs.loanToCost));
    expect(outputs.sponsorEquity).toBeCloseTo(Number(outputs.equity) + Number(outputs.creditedLandEquity), 2);
  });

  it("carries both sources through the capital run's input snapshot and formula traces", () => {
    const capital = computeDevelopmentCapital({
      ...base,
      otherSources: [grant({ draws: [{ month: startMonth, amount: 1_000_000 }] })],
      creditedLand: creditedLand({ creditedValue: 10_000_000 }),
    });
    expect(capital.status).toBe("complete");
    expect(capital.inputSnapshot.otherSources).toHaveLength(1);
    const traces = capital.result!.capital.formulaTraces;
    expect(traces.find(({ key }) => key === "creditedLandStepUp")).toBeDefined();
    for (const trace of traces) {
      for (const path of trace.inputPaths) expect(path.split(".")[0] in capital.inputSnapshot, `${trace.key} ${path}`).toBe(true);
    }
  });
});
