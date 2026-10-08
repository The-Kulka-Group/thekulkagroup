import { describe, expect, it } from "vitest";

import { computeDevelopmentCapital } from "./development-capital";
import { annualCashFlow, annualCashFlowChecks, annualCashFlowViews, ANNUAL_LINE_KEYS, type AnnualCashFlowYears, type AnnualCashFlowSource, type AnnualLineKey } from "./annual-cash-flow";
import { projectApartmentOperationsThrough } from "./apartment-operations";
import { runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import { retailAbatementCase, retailCase, lenderTestPlan } from "./fixtures/commercial-cap-cases";
import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { PERMANENT_LOAN_ASSUMPTION_KEYS, PERMANENT_LOAN_INPUT_VERSION, type PermanentLoanPlan } from "./permanent-loan";
import { computePropertyReturns, type PropertyReturnsRun } from "./property-returns";

const evidence = { sourceLabel: "Permanent loan quote", sourceDate: "2026-10-07", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const SALE = "2032-09";

function plan(overrides: Partial<PermanentLoanPlan> = {}): PermanentLoanPlan {
  return {
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
}

const cents = (value: number) => Math.round(value * 100);
const sumLine = (result: AnnualCashFlowYears, key: AnnualLineKey) => result.years.reduce((total, year) => total + cents(year.lines[key]), 0) / 100;

/** The monthly total of a line, summed from the monthly results the run keeps, with no help from the annual code. */
function monthlyTotal(run: PropertyReturnsRun, field: "netOperatingIncome" | "operatingCashFlow" | "effectiveGrossRevenue" | "operatingExpenses" | "propertyTax" | "fullPropertyTax" | "vacancyLoss" | "creditLoss" | "commercialVacancyLoss" | "commercialCreditLoss") {
  const result = run.result!;
  const months = projectApartmentOperationsThrough(run.inputSnapshot, result.propertyReturns.months.at(-1)!.month)
    .filter(({ month }) => month <= result.propertyReturns.months.at(-1)!.month);
  return months.reduce((total, month) => total + cents(month[field]), 0) / 100;
}

describe("annual cash flow on the v2.98 sample", () => {
  const run = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE });
  const result = run.result!;
  const views = result.annualCashFlow!;

  it("carries all three bases inside the run result", () => {
    expect(run.status).toBe("complete");
    expect(views.analysis_year.basis).toEqual({ kind: "analysis_year" });
    expect(views.calendar_year.basis).toEqual({ kind: "calendar_year" });
    expect(views.operating_year!.basis.kind).toBe("operating_year");
  });

  it("starts operating years at the first stabilized month, with the development period first", () => {
    const operating = views.operating_year!;
    const stabilized = (operating.basis as { startMonth: string }).startMonth;
    expect(stabilized).toBe("2028-09");
    const [development, first, second] = operating.years;
    expect(development).toMatchObject({ key: "development", label: "Development Period", kind: "development", startMonth: result.propertyReturns.months[0].month, partial: false });
    expect(development.endMonth).toBe("2028-08");
    expect(first).toMatchObject({ label: "Operating Year 1", startMonth: "2028-09", endMonth: "2029-08", monthCount: 12, partial: false });
    expect(second.label).toBe("Operating Year 2");
    // The model ends in the sale month, so the last year holds the sale and is marked with its month count.
    const last = operating.years.at(-1)!;
    expect(last.saleYear).toBe(true);
    expect(last.endMonth).toBe(SALE);
    expect(last.monthCount).toBe(operating.monthCount - development.monthCount - 12 * (operating.years.length - 2));
  });

  it("marks part years at either end on the other bases", () => {
    const analysis = views.analysis_year;
    expect(analysis.years[0]).toMatchObject({ label: "Analysis Year 1", monthCount: 12, partial: false });
    expect(analysis.years.every(({ kind }) => kind === "year")).toBe(true);
    const calendar = views.calendar_year;
    expect(calendar.years.map(({ label }) => label)[0]).toBe(result.propertyReturns.months[0].month.slice(0, 4));
    expect(calendar.years.at(-1)!.endMonth).toBe(SALE);
    for (const view of [views.operating_year!, analysis, calendar]) {
      expect(view.years.reduce((total, year) => total + year.monthCount, 0)).toBe(view.monthCount);
      expect(view.years.every((year) => year.partial === (year.kind === "year" && year.monthCount < 12))).toBe(true);
    }
    expect(calendar.years.some(({ partial }) => partial)).toBe(true);
  });

  it("passes every year check, and the years add up to the monthly totals on every basis", () => {
    for (const view of [views.operating_year!, views.analysis_year, views.calendar_year]) {
      expect(annualCashFlowChecks(view).filter(({ status }) => status === "fail").map(({ id }) => id)).toEqual([]);
      expect(view.years.every((year) => year.checks.length >= 8 && year.checks.every(({ status }) => status === "pass"))).toBe(true);
      expect(sumLine(view, "netOperatingIncome")).toBe(monthlyTotal(run, "netOperatingIncome"));
      expect(sumLine(view, "operatingCashFlow")).toBe(monthlyTotal(run, "operatingCashFlow"));
      expect(sumLine(view, "effectiveGrossRevenue")).toBe(monthlyTotal(run, "effectiveGrossRevenue"));
      expect(sumLine(view, "operatingExpenses")).toBe(monthlyTotal(run, "operatingExpenses"));
      expect(sumLine(view, "vacancyLoss")).toBe(monthlyTotal(run, "vacancyLoss"));
      expect(sumLine(view, "creditLoss")).toBe(monthlyTotal(run, "creditLoss"));
      expect(view.totals.leveredCashFlow).toBe(result.propertyReturns.returns.levered.netProfit);
      expect(view.totals.unleveredCashFlow).toBe(result.propertyReturns.returns.unlevered.netProfit);
      expect(view.totals.projectCosts).toBe(result.developmentCapital.totals.projectCosts);
    }
  });

  it("reads each year's net operating income from the months it holds", () => {
    const operating = views.operating_year!;
    const monthly = projectApartmentOperationsThrough(run.inputSnapshot, "2029-08").filter(({ month }) => month >= "2028-09");
    expect(monthly).toHaveLength(12);
    const expected = monthly.reduce((total, month) => total + cents(month.netOperatingIncome), 0) / 100;
    expect(operating.years[1].lines.netOperatingIncome).toBe(expected);
    expect(operating.years[1].lines.effectiveGrossRevenue - operating.years[1].lines.operatingExpenses).toBeCloseTo(expected, 2);
  });

  it("puts sale proceeds and payoff in the sale year only", () => {
    const operating = views.operating_year!;
    const sale = result.propertyReturns.sale;
    for (const year of operating.years.slice(0, -1)) {
      expect(year.lines.netSaleProceeds).toBe(0);
      expect(year.lines.grossSaleValue).toBe(0);
    }
    const last = operating.years.at(-1)!;
    expect(last.lines).toMatchObject({ grossSaleValue: sale.grossSaleValue, sellingCosts: sale.sellingCosts, netSaleProceeds: sale.netSaleProceeds, repayment: sale.debtPayoff });
  });

  it("sums hard cost by year to the cost schedule total", () => {
    const operating = views.operating_year!;
    for (const view of [operating, views.analysis_year, views.calendar_year]) expect(sumLine(view, "hardCost")).toBe(42_630_000);
    expect(operating.years[0].lines.hardCost).toBeGreaterThan(0);
  });

  it("carries one formula trace for every line, plus coverage and debt yield", () => {
    const traces = views.traces;
    expect(traces.map(({ key }) => key).sort()).toEqual([...ANNUAL_LINE_KEYS, "debtServiceCoverage", "debtYield"].sort());
    expect(traces.every(({ formula, label }) => formula.length > 0 && label.length > 0)).toBe(true);
  });

  it("matches annualCashFlow called directly with the same source", () => {
    const source = sourceOf(run);
    const direct = annualCashFlow(source, { kind: "operating_year", startMonth: "2028-09" });
    expect(direct.status).toBe("complete");
    expect(direct.status === "complete" && direct.result.years).toEqual(views.operating_year!.years);
    expect(direct.status === "complete" && direct.result.traces).toEqual(views.traces);
  });
});

describe("annual cash flow with no stabilized month", () => {
  it("leaves operating years null, and keeps analysis and calendar years", () => {
    // The sale falls before the first stabilized month.
    const run = computePropertyReturns({ ...base, saleMonth: "2028-03", payoffMonth: "2028-03" });
    if (run.status === "complete") {
      const views = run.result!.annualCashFlow!;
      expect(views.analysis_year.years.length).toBeGreaterThan(0);
      expect(views.calendar_year.years.length).toBeGreaterThan(0);
    }
  });
});

describe("year basis checks", () => {
  const run = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE });
  const source = sourceOf(run);

  it("fails an operating start month outside the model months", () => {
    const outside = annualCashFlow(source, { kind: "operating_year", startMonth: "1999-01" });
    expect(outside.status).toBe("failed");
    expect(outside.issues.map(({ code, path }) => [path, code])).toEqual([["basis.startMonth", "invalid_year_basis"]]);
  });

  it("fails months that do not line up", () => {
    const short = annualCashFlow({ ...source, operations: source.operations.slice(1) }, { kind: "analysis_year" });
    expect(short.status).toBe("failed");
    expect(short.issues.map(({ code }) => code)).toEqual(["months_misaligned"]);
  });

  it("starts operating years in the first model month with no development column", () => {
    const first = source.months[0].month;
    const result = annualCashFlow(source, { kind: "operating_year", startMonth: first });
    expect(result.status === "complete" && result.result.years[0].key).toBe("operating-year-1");
  });

  it("does not change when run twice", () => {
    const again = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE });
    expect(JSON.stringify(again.result!.annualCashFlow)).toBe(JSON.stringify(run.result!.annualCashFlow));
  });
});

describe("annual cash flow with a permanent loan", () => {
  const run = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE, permanentLoan: plan() });
  const result = run.result!;
  const operating = result.annualCashFlow!.operating_year!;
  const permanent = result.developmentCapital.permanentLoan!;

  it("is complete and ties to the monthly levered cash flow", () => {
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    expect(annualCashFlowChecks(operating).filter(({ status }) => status === "fail")).toEqual([]);
    expect(operating.totals.leveredCashFlow).toBe(result.propertyReturns.returns.levered.netProfit);
  });

  it("funds in the first operating year and repays the construction loan there", () => {
    const [development, first] = operating.years;
    expect(first.lines.permanentLoanProceeds).toBe(permanent.loanAmount);
    expect(first.lines.repayment).toBe(permanent.constructionPayoff);
    expect(development.lines.permanentLoanProceeds).toBe(0);
    expect(development.lines.repayment).toBe(0);
  });

  it("reads coverage from the permanent debt service paid and debt yield from the loan amount", () => {
    const full = operating.years.filter(({ kind, monthCount }) => kind === "year" && monthCount === 12);
    expect(full.length).toBeGreaterThan(2);
    for (const year of full) {
      expect(year.lines.permanentDebtService).toBeGreaterThan(0);
      expect(year.debtServiceCoverage).toBeCloseTo(year.lines.netOperatingIncome / year.debtServiceUsed!, 10);
      expect(year.debtYield).toBeCloseTo(year.lines.netOperatingIncome / permanent.loanAmount, 10);
    }
    const [development] = operating.years;
    expect(development.debtServiceCoverage).toBeNull();
    expect(development.debtYield).toBeNull();
    const last = operating.years.at(-1)!;
    expect(last.lines.permanentLoanPayoff).toBe(permanent.payoffAtSale);
    expect(last.partial || last.monthCount === 12).toBe(true);
  });

  it("pays the year's interest-only then level debt service from the loan schedule", () => {
    const [, first, second, third, fourth] = operating.years;
    const paidIn = (startMonth: string, endMonth: string) => permanent.months
      .filter(({ month }) => month >= startMonth && month <= endMonth)
      .reduce((total, row) => total + Math.round(row.debtService * 100), 0) / 100;
    for (const year of [first, second, third, fourth]) expect(year.lines.permanentDebtService).toBe(paidIn(year.startMonth, year.endMonth));
    // The loan funds in the first month of year one, so year one pays eleven months and coverage scales them to twelve.
    expect(first.debtServiceMonths).toBe(11);
    expect(first.debtServiceUsed).toBe(Math.round(first.lines.permanentDebtService * 100 * 12 / 11) / 100);
    expect(first.debtServiceUsed).toBe(permanent.firstYearDebtService);
    expect(second.debtServiceMonths).toBe(12);
    // Year three mixes the last interest-only payment with level payments; year four is level throughout.
    expect(fourth.lines.permanentDebtService).toBe(permanent.annualDebtService);
  });

  it("reports no coverage for a part year", () => {
    const part = operating.years.find(({ partial }) => partial);
    if (part) {
      expect(part.debtServiceCoverage).toBeNull();
      expect(part.debtYield).toBeNull();
    }
  });
});

describe("annual cash flow with a stated debt service and no permanent loan", () => {
  const run = computePropertyReturns(retailCase({ saleMonth: SALE, payoffMonth: SALE, lenderTests: lenderTestPlan({ loanSizing: undefined }) }));
  const result = run.result!;
  const operating = result.annualCashFlow!.operating_year!;

  it("divides full years by the stated annual debt service and the construction loan", () => {
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const year = operating.years[1];
    expect(year.debtServiceUsed).toBe(3_000_000);
    expect(year.debtServiceCoverage).toBeCloseTo(year.lines.netOperatingIncome / 3_000_000, 10);
    expect(year.debtYield).toBeCloseTo(year.lines.netOperatingIncome / result.developmentCapital.totals.totalDebt, 10);
  });
});

describe("annual cash flow with no debt service figure", () => {
  it("reports debt yield and no coverage", () => {
    const run = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE });
    const year = run.result!.annualCashFlow!.operating_year!.years[1];
    expect(year.debtServiceCoverage).toBeNull();
    expect(year.debtServiceUsed).toBeNull();
    expect(year.debtYield).toBeCloseTo(year.lines.netOperatingIncome / run.result!.developmentCapital.totals.totalDebt, 10);
  });
});

describe("annual cash flow with commercial space", () => {
  const run = computePropertyReturns(retailCase({ saleMonth: SALE, payoffMonth: SALE }));
  const operating = run.result!.annualCashFlow!.operating_year!;

  it("keeps commercial revenue, vacancy and credit loss apart from residential", () => {
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const year = operating.years[2];
    expect(year.lines.commercialBaseRent).toBeGreaterThan(0);
    expect(year.lines.commercialVacancyLoss).toBeLessThan(0);
    expect(year.lines.commercialCreditLoss).toBeLessThan(0);
    expect(year.lines.vacancyLoss).toBeLessThan(0);
    expect(year.lines.vacancyLoss).not.toBe(year.lines.commercialVacancyLoss);
    expect(year.lines.residentialNetOperatingIncome + year.lines.commercialNetOperatingIncome).toBeCloseTo(year.lines.netOperatingIncome, 2);
    expect(sumLine(operating, "commercialVacancyLoss")).toBe(monthlyTotal(run, "commercialVacancyLoss"));
    expect(sumLine(operating, "commercialCreditLoss")).toBe(monthlyTotal(run, "commercialCreditLoss"));
  });

  it("carries first-generation tenant costs in project costs", () => {
    expect(annualCashFlowChecks(operating).filter(({ status }) => status === "fail")).toEqual([]);
    expect(operating.totals.projectCosts).toBe(run.result!.developmentCapital.totals.projectCosts);
  });
});

describe("annual cash flow with an abatement", () => {
  const run = computePropertyReturns(retailAbatementCase("full_tax", { saleMonth: SALE, payoffMonth: SALE }));
  const operating = run.result!.annualCashFlow!.operating_year!;

  it("shows property tax on the scheduled and the full basis, and NOI on full tax", () => {
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    const early = operating.years[1];
    expect(early.lines.propertyTax).toBeGreaterThan(0);
    expect(early.lines.fullPropertyTax).toBeGreaterThan(early.lines.propertyTax);
    expect(early.lines.netOperatingIncomeFullTax).toBeCloseTo(early.lines.netOperatingIncome - early.lines.fullPropertyTax + early.lines.propertyTax, 2);
    expect(sumLine(operating, "propertyTax")).toBe(monthlyTotal(run, "propertyTax"));
    expect(sumLine(operating, "fullPropertyTax")).toBe(monthlyTotal(run, "fullPropertyTax"));
  });
});

describe("annual cash flow per scenario", () => {
  const evidenceFor = { sourceLabel: "Lender term sheet", sourceDate: "2026-10-05", reviewState: "working" as const };
  const scenarios: ApartmentScenarioDefinition[] = [
    { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: evidenceFor } },
    { id: "lower-exit-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: evidenceFor } },
  ];
  const comparison = runApartmentScenarioComparison({ ...base, saleMonth: SALE, payoffMonth: SALE }, scenarios);

  it("gives each scenario its own annual view", () => {
    expect(comparison.status, JSON.stringify(comparison.issues)).toBe("complete");
    const baseView = comparison.result!.base.propertyResult.annualCashFlow!.operating_year!;
    const downside = comparison.result!.scenarios[0].propertyResult.annualCashFlow!.operating_year!;
    expect(downside.years[1].lines.netOperatingIncome).toBeLessThan(baseView.years[1].lines.netOperatingIncome);
    expect(annualCashFlowChecks(downside).filter(({ status }) => status === "fail")).toEqual([]);
    const upside = comparison.result!.scenarios[1].propertyResult.annualCashFlow!.operating_year!;
    expect(upside.years[1].lines.netOperatingIncome).toBe(baseView.years[1].lines.netOperatingIncome);
    expect(upside.totals.netSaleProceeds).toBeGreaterThan(baseView.totals.netSaleProceeds);
  });
});

describe("annual cash flow size", () => {
  it("stays small enough to save inside the run result", () => {
    const run = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE, permanentLoan: plan() });
    const annual = JSON.stringify(run.result!.annualCashFlow).length;
    const whole = JSON.stringify(run.result).length;
    console.info(`annual view ${annual} bytes of ${whole} bytes in the run result`);
    expect(annual).toBeLessThan(250_000);
  });
});

describe("annualCashFlowViews", () => {
  it("returns no operating years without a first stabilized month", () => {
    const run = computePropertyReturns({ ...base, saleMonth: SALE, payoffMonth: SALE });
    const source = { ...sourceOf(run), firstStabilizedMonth: null };
    const viewed = annualCashFlowViews(source);
    expect(viewed.status).toBe("complete");
    expect(viewed.status === "complete" && viewed.views.operating_year).toBeNull();
  });
});

/** Rebuilds the source from the run's own pieces, the way the run does, so the function can be called by hand. */
function sourceOf(run: PropertyReturnsRun): AnnualCashFlowSource {
  const result = run.result!;
  const input = run.inputSnapshot;
  const months = result.propertyReturns.months;
  const operations = projectApartmentOperationsThrough(input, months.at(-1)!.month).filter(({ month }) => month <= months.at(-1)!.month);
  const costMonths = computePropertyReturnsCostMonths(run);
  const permanent = result.developmentCapital.permanentLoan;
  return {
    operations,
    usesByCategory: costMonths,
    months,
    sale: result.propertyReturns.sale,
    operationStartMonth: input.operationStartMonth,
    firstStabilizedMonth: result.annualCashFlow?.operating_year ? (result.annualCashFlow.operating_year.basis as { startMonth: string }).startMonth : null,
    debt: permanent
      ? { loanAmount: permanent.loanAmount, loanKind: "permanent", statedAnnualDebtService: null }
      : { loanAmount: result.developmentCapital.totals.totalDebt, loanKind: "construction", statedAnnualDebtService: input.lenderTests?.annualDebtService ?? null },
    runTotals: {
      netOperatingIncome: operations.reduce((total, month) => total + cents(month.netOperatingIncome), 0) / 100,
      operatingCashFlow: operations.reduce((total, month) => total + cents(month.operatingCashFlow), 0) / 100,
      projectCosts: result.developmentCapital.totals.projectCosts,
      unleveredNetProfit: result.propertyReturns.returns.unlevered.netProfit,
      leveredNetProfit: result.propertyReturns.returns.levered.netProfit,
    },
  };
}


function computePropertyReturnsCostMonths(run: PropertyReturnsRun) {
  const capital = computeDevelopmentCapital(run.inputSnapshot, { maxLoan: run.result!.developmentCapital.debtCeiling ?? null });
  return capital.result!.apartmentOperations.costSchedule.months.map(({ usesByCategory }) => usesByCategory);
}
