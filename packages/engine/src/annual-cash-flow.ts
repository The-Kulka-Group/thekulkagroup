import type { MonthlyApartmentOperations } from "./apartment-operations";
import type { CostCategory, ReconciliationCheck } from "./monthly-cost-schedule";
import type { DatedPropertyCashFlow, PropertyReturnsCalculationResult } from "./property-returns";

/*
 * LA-1872: the annual cash flow view. It is a report over the monthly results of a completed
 * property run. It sums months into years and changes no monthly number. Every year carries checks
 * that its lines build up to the monthly totals, and every line has one formula trace.
 */

export const ANNUAL_CASH_FLOW_VERSION = "annual_cash_flow.v1" as const;

export type AnnualYearBasis =
  /** Twelve months from the first model month. */
  | { kind: "analysis_year" }
  | { kind: "calendar_year" }
  /** Twelve months from `startMonth`, such as the first stabilized month, with one development column before it. */
  | { kind: "operating_year"; startMonth: string };

export type AnnualYearBasisKind = AnnualYearBasis["kind"];

export type AnnualSection = "revenue" | "expenses" | "net_operating_income" | "project_costs" | "debt" | "sale" | "cash_flow";

export const ANNUAL_SECTION_LABELS: Record<AnnualSection, string> = {
  revenue: "Revenue",
  expenses: "Operating Expenses",
  net_operating_income: "Net Operating Income",
  project_costs: "Project Costs",
  debt: "Debt",
  sale: "Sale",
  cash_flow: "Cash Flow",
};

type MonthContext = {
  operations: MonthlyApartmentOperations;
  dated: DatedPropertyCashFlow;
  usesByCategory: Partial<Record<CostCategory, number>>;
  isSaleMonth: boolean;
  sale: PropertyReturnsCalculationResult["sale"];
};

type LineDefinition = {
  key: string;
  label: string;
  section: AnnualSection;
  formula: string;
  inputPaths: string[];
  /** Dollars for one month. The year sums these in cents. */
  read: (month: MonthContext) => number;
};

const op = (key: keyof MonthlyApartmentOperations) => (month: MonthContext) => Number(month.operations[key]);
const dated = (key: keyof DatedPropertyCashFlow) => (month: MonthContext) => Number(month.dated[key] ?? 0);
const uses = (category: CostCategory) => (month: MonthContext) => month.usesByCategory[category] ?? 0;
const monthly = (name: string) => `Sum of the year's monthly ${name}`;

const OPERATIONS_PATHS = ["unitTypes", "operationStartMonth", "annualIncomeGrowthPercent", "leaseUpUnitsPerMonth"];
const EXPENSE_PATHS = ["operatingExpenseLines", "annualExpenseGrowthPercent", "propertyTax"];
const COMMERCIAL_PATHS = ["commercial"];
const CAPITAL_PATHS = ["costLines", "loanTerms", "targetDebtSharePercent"];

const LINE_DEFINITIONS = [
  { key: "residentialGrossRent", label: "Residential Gross Rent", section: "revenue", formula: monthly("residential gross rent"), inputPaths: OPERATIONS_PATHS, read: op("residentialGrossRent") },
  { key: "nonRevenueRentAdjustment", label: "Non-Revenue Unit Adjustment", section: "revenue", formula: monthly("non-revenue unit rent adjustment"), inputPaths: OPERATIONS_PATHS, read: op("nonRevenueRentAdjustment") },
  { key: "leaseUpLoss", label: "Lease-Up Loss", section: "revenue", formula: monthly("lease-up loss"), inputPaths: OPERATIONS_PATHS, read: op("leaseUpLoss") },
  { key: "rentAdjustmentLoss", label: "Rent Adjustment Loss", section: "revenue", formula: monthly("rent adjustment loss"), inputPaths: OPERATIONS_PATHS, read: op("rentAdjustmentLoss") },
  { key: "freeRentLoss", label: "Free Rent", section: "revenue", formula: monthly("free rent loss"), inputPaths: OPERATIONS_PATHS, read: op("freeRentLoss") },
  { key: "leaseUpConcessionLoss", label: "Lease-Up Concessions", section: "revenue", formula: monthly("lease-up concession loss"), inputPaths: OPERATIONS_PATHS, read: op("leaseUpConcessionLoss") },
  { key: "totalResidentialRent", label: "Total Residential Rent", section: "revenue", formula: monthly("total residential rent"), inputPaths: OPERATIONS_PATHS, read: op("totalResidentialRent") },
  { key: "otherIncome", label: "Other Income", section: "revenue", formula: monthly("other income"), inputPaths: ["otherIncomeLines", "annualIncomeGrowthPercent"], read: op("otherIncome") },
  { key: "totalPotentialIncome", label: "Residential Potential Income", section: "revenue", formula: monthly("residential potential income, which is residential rent plus other income"), inputPaths: OPERATIONS_PATHS, read: op("totalPotentialIncome") },
  { key: "vacancyLoss", label: "Residential Vacancy", section: "revenue", formula: monthly("residential vacancy loss"), inputPaths: ["vacancyPercent"], read: op("vacancyLoss") },
  { key: "creditLoss", label: "Residential Credit Loss", section: "revenue", formula: monthly("residential credit loss"), inputPaths: ["creditLossPercent"], read: op("creditLoss") },
  { key: "commercialBaseRent", label: "Commercial Base Rent", section: "revenue", formula: monthly("commercial base rent"), inputPaths: COMMERCIAL_PATHS, read: op("commercialBaseRent") },
  { key: "commercialFreeRent", label: "Commercial Free Rent", section: "revenue", formula: monthly("commercial free rent"), inputPaths: COMMERCIAL_PATHS, read: op("commercialFreeRent") },
  { key: "commercialRecoveries", label: "Commercial Recoveries", section: "revenue", formula: monthly("commercial recoveries"), inputPaths: COMMERCIAL_PATHS, read: op("commercialRecoveries") },
  { key: "commercialVacancyLoss", label: "Commercial Vacancy", section: "revenue", formula: monthly("commercial vacancy loss"), inputPaths: COMMERCIAL_PATHS, read: op("commercialVacancyLoss") },
  { key: "commercialCreditLoss", label: "Commercial Credit Loss", section: "revenue", formula: monthly("commercial credit loss"), inputPaths: COMMERCIAL_PATHS, read: op("commercialCreditLoss") },
  { key: "commercialEffectiveGrossRevenue", label: "Commercial Effective Gross Revenue", section: "revenue", formula: monthly("commercial effective gross revenue"), inputPaths: COMMERCIAL_PATHS, read: op("commercialEffectiveGrossRevenue") },
  { key: "effectiveGrossRevenue", label: "Effective Gross Revenue", section: "revenue", formula: monthly("effective gross revenue for the whole property"), inputPaths: [...OPERATIONS_PATHS, ...COMMERCIAL_PATHS], read: op("effectiveGrossRevenue") },
  { key: "operatingExpenses", label: "Operating Expenses", section: "expenses", formula: monthly("operating expenses for the whole property, property tax included"), inputPaths: EXPENSE_PATHS, read: op("operatingExpenses") },
  { key: "commercialOperatingExpenses", label: "Commercial Operating Expenses", section: "expenses", formula: monthly("commercial operating expenses, which sit inside operating expenses"), inputPaths: [...EXPENSE_PATHS, ...COMMERCIAL_PATHS], read: op("commercialOperatingExpenses") },
  { key: "propertyTax", label: "Property Tax, Scheduled", section: "expenses", formula: monthly("property tax under the tax schedule, which sits inside operating expenses"), inputPaths: ["propertyTax"], read: op("propertyTax") },
  { key: "fullPropertyTax", label: "Property Tax, Full", section: "expenses", formula: monthly("property tax with no abatement"), inputPaths: ["propertyTax"], read: op("fullPropertyTax") },
  { key: "netOperatingIncome", label: "Net Operating Income", section: "net_operating_income", formula: monthly("net operating income, which is effective gross revenue less operating expenses"), inputPaths: [...OPERATIONS_PATHS, ...EXPENSE_PATHS], read: op("netOperatingIncome") },
  { key: "residentialNetOperatingIncome", label: "Residential Net Operating Income", section: "net_operating_income", formula: monthly("residential net operating income"), inputPaths: [...OPERATIONS_PATHS, ...EXPENSE_PATHS], read: op("residentialNetOperatingIncome") },
  { key: "commercialNetOperatingIncome", label: "Commercial Net Operating Income", section: "net_operating_income", formula: monthly("commercial net operating income"), inputPaths: COMMERCIAL_PATHS, read: op("commercialNetOperatingIncome") },
  { key: "netOperatingIncomeFullTax", label: "Net Operating Income, Full Tax", section: "net_operating_income", formula: `${monthly("net operating income")} less full property tax plus scheduled property tax`, inputPaths: ["propertyTax"], read: (month) => month.operations.netOperatingIncome - month.operations.fullPropertyTax + month.operations.propertyTax },
  { key: "capitalExpenditures", label: "Capital Expenditures", section: "net_operating_income", formula: monthly("capital expenditures"), inputPaths: ["capitalExpenditureLines", "annualExpenseGrowthPercent"], read: op("capitalExpenditures") },
  { key: "operatingCashFlow", label: "Operating Cash Flow", section: "net_operating_income", formula: monthly("operating cash flow, which is net operating income less capital expenditures"), inputPaths: [...OPERATIONS_PATHS, ...EXPENSE_PATHS], read: op("operatingCashFlow") },
  { key: "projectCosts", label: "Project Costs", section: "project_costs", formula: monthly("project costs from the cost schedule"), inputPaths: CAPITAL_PATHS, read: dated("projectCosts") },
  { key: "landCost", label: "Land", section: "project_costs", formula: monthly("land uses from the cost schedule"), inputPaths: ["costLines"], read: uses("land") },
  { key: "hardCost", label: "Hard Cost", section: "project_costs", formula: monthly("hard cost uses from the cost schedule"), inputPaths: ["costLines"], read: uses("hard_cost") },
  { key: "softCost", label: "Soft Cost", section: "project_costs", formula: monthly("soft cost uses from the cost schedule"), inputPaths: ["costLines"], read: uses("soft_cost") },
  { key: "developmentFee", label: "Development Fee", section: "project_costs", formula: monthly("development fee uses from the cost schedule"), inputPaths: ["costLines"], read: uses("development_fee") },
  { key: "financingFeeCost", label: "Financing Fee", section: "project_costs", formula: monthly("financing fee uses from the cost schedule"), inputPaths: ["costLines"], read: uses("financing_fee") },
  { key: "loanFee", label: "Construction Loan Fee", section: "debt", formula: monthly("construction loan fee"), inputPaths: CAPITAL_PATHS, read: dated("loanFee") },
  { key: "constructionInterest", label: "Construction Interest", section: "debt", formula: monthly("gross construction interest, which is paid from debt draws, operating cash and equity"), inputPaths: CAPITAL_PATHS, read: dated("grossInterest") },
  { key: "totalDebtDraw", label: "Construction Debt Draws", section: "debt", formula: monthly("construction debt draws"), inputPaths: CAPITAL_PATHS, read: dated("totalDebtDraw") },
  { key: "otherSourcesApplied", label: "Grants and Soft Loans Applied", section: "debt", formula: monthly("grant and soft loan cash applied to uses"), inputPaths: ["otherSources"], read: dated("otherSourcesApplied") },
  { key: "repayment", label: "Construction Loan Repayment", section: "debt", formula: monthly("construction loan repayment, in the takeout month with a permanent loan and in the sale month without one"), inputPaths: CAPITAL_PATHS, read: dated("repayment") },
  { key: "softLoanRepayment", label: "Soft Loan Repayment", section: "debt", formula: monthly("soft loan principal and interest repaid"), inputPaths: ["otherSources"], read: dated("softLoanRepayment") },
  { key: "permanentLoanProceeds", label: "Permanent Loan Proceeds", section: "debt", formula: monthly("permanent loan proceeds"), inputPaths: ["permanentLoan"], read: dated("permanentLoanProceeds") },
  { key: "refinanceCosts", label: "Permanent Loan Fee and Closing Costs", section: "debt", formula: monthly("permanent loan fee and closing costs"), inputPaths: ["permanentLoan"], read: dated("refinanceCosts") },
  { key: "permanentDebtService", label: "Permanent Debt Service", section: "debt", formula: monthly("permanent loan interest and principal paid"), inputPaths: ["permanentLoan"], read: dated("permanentDebtService") },
  { key: "permanentLoanPayoff", label: "Permanent Loan Payoff", section: "debt", formula: monthly("permanent loan balance repaid from sale proceeds"), inputPaths: ["permanentLoan"], read: dated("permanentLoanPayoff") },
  { key: "grossSaleValue", label: "Gross Sale Value", section: "sale", formula: "Gross sale value from the property returns sale result, in the sale year only", inputPaths: ["terminalCapRatePercent", "saleMonth"], read: (month) => month.isSaleMonth ? month.sale.grossSaleValue : 0 },
  { key: "sellingCosts", label: "Selling Costs", section: "sale", formula: "Selling costs from the property returns sale result, in the sale year only", inputPaths: ["sellingCostPercent"], read: (month) => month.isSaleMonth ? month.sale.sellingCosts : 0 },
  { key: "netSaleProceeds", label: "Net Sale Proceeds", section: "sale", formula: monthly("net sale proceeds, which fall in the sale month"), inputPaths: ["terminalCapRatePercent", "sellingCostPercent", "saleMonth"], read: dated("netSaleProceeds") },
  { key: "unleveredCashFlow", label: "Unlevered Cash Flow", section: "cash_flow", formula: monthly("unlevered cash flow, which is operating cash flow and sale proceeds less project costs"), inputPaths: [...CAPITAL_PATHS, "saleMonth"], read: dated("unleveredCashFlow") },
  { key: "leveredCashFlow", label: "Levered Cash Flow", section: "cash_flow", formula: monthly("levered cash flow"), inputPaths: [...CAPITAL_PATHS, "saleMonth", "permanentLoan"], read: dated("leveredCashFlow") },
] as const satisfies readonly LineDefinition[];

export type AnnualLineKey = typeof LINE_DEFINITIONS[number]["key"];

export const ANNUAL_LINE_KEYS: readonly AnnualLineKey[] = LINE_DEFINITIONS.map(({ key }) => key);

export type AnnualLines = Record<AnnualLineKey, number>;

export type AnnualFormulaTrace = {
  key: AnnualLineKey | "debtServiceCoverage" | "debtYield";
  label: string;
  section: AnnualSection;
  formula: string;
  inputPaths: string[];
};

export type AnnualYear = {
  /** "development", or "year-1" and on, or the calendar year. */
  key: string;
  /** "Development Period", "Operating Year 1", "Analysis Year 1" or "2027". */
  label: string;
  kind: "development" | "year";
  startMonth: string;
  endMonth: string;
  monthCount: number;
  /** A year of fewer than twelve months. The development column is a period, never a part year. */
  partial: boolean;
  /** Holds the sale month, so it carries sale proceeds and the payoff. */
  saleYear: boolean;
  lines: AnnualLines;
  /** Net operating income over debt service. Only for a full operating year, and only when debt service exists. */
  debtServiceCoverage: number | null;
  /** Net operating income over the loan amount. Only for a full operating year. */
  debtYield: number | null;
  /**
   * The debt service the year's coverage divides by. Null when coverage is not reported. A permanent
   * loan that funds inside the year pays fewer than twelve months, so its payments are scaled to twelve.
   */
  debtServiceUsed: number | null;
  /** Months of permanent loan payments in the year, when coverage reads them. Null otherwise. */
  debtServiceMonths: number | null;
  checks: ReconciliationCheck[];
};

export type AnnualDebtBasis = {
  /** The permanent loan amount when the case has one, otherwise the construction loan's total debt. */
  loanAmount: number;
  loanKind: "permanent" | "construction";
  /** The lender test's stated annual debt service. Used only when the case has no permanent loan. */
  statedAnnualDebtService: number | null;
};

export type AnnualCashFlowSource = {
  /** The full monthly operations grid, from the first model month through the sale month. */
  operations: MonthlyApartmentOperations[];
  /** Cost schedule uses by category for the same months. */
  usesByCategory: Array<Partial<Record<CostCategory, number>>>;
  /** The dated monthly cash flow of the property returns run, on the same months. */
  months: DatedPropertyCashFlow[];
  sale: PropertyReturnsCalculationResult["sale"];
  /** The first month of operations. Years that start before it never report coverage or debt yield. */
  operationStartMonth: string | null;
  firstStabilizedMonth: string | null;
  debt: AnnualDebtBasis;
  /** Totals the run reports on its own, which the annual years must add up to. */
  runTotals: {
    netOperatingIncome: number;
    operatingCashFlow: number;
    projectCosts: number;
    unleveredNetProfit: number;
    leveredNetProfit: number;
  };
};

export type AnnualCashFlowIssueCode = "invalid_year_basis" | "months_misaligned";

export type AnnualCashFlowIssue = {
  path: string;
  code: AnnualCashFlowIssueCode;
  message: string;
};

export type AnnualCashFlowResult = {
  annualCashFlowVersion: typeof ANNUAL_CASH_FLOW_VERSION;
  basis: AnnualYearBasis;
  basisLabel: string;
  firstMonth: string;
  lastMonth: string;
  monthCount: number;
  years: AnnualYear[];
  /** Each line summed over every year, which equals the sum over every month. */
  totals: AnnualLines;
  traces: AnnualFormulaTrace[];
  /** The checks across all years. Each year's own checks sit on the year. */
  runChecks: ReconciliationCheck[];
};

/** The years of one basis. A saved run keeps the traces once, on the views, instead of on every basis. */
export type AnnualCashFlowYears = Omit<AnnualCashFlowResult, "traces">;

/** Every check on a result: each year's, then the run-wide checks. */
export function annualCashFlowChecks(result: AnnualCashFlowYears): ReconciliationCheck[] {
  return [...result.years.flatMap(({ checks }) => checks), ...result.runChecks];
}

export type AnnualCashFlowRun =
  | { status: "complete"; issues: []; result: AnnualCashFlowResult }
  | { status: "failed"; issues: AnnualCashFlowIssue[]; result: null };

/** The three year bases a run carries. Operating years are null when the run never reaches a stabilized month. */
export type AnnualCashFlowViews = {
  annualCashFlowVersion: typeof ANNUAL_CASH_FLOW_VERSION;
  /** One formula trace for each line, which holds on every basis. */
  traces: AnnualFormulaTrace[];
  operating_year: AnnualCashFlowYears | null;
  analysis_year: AnnualCashFlowYears;
  calendar_year: AnnualCashFlowYears;
};

export const ANNUAL_YEAR_BASIS_LABELS: Record<AnnualYearBasisKind, string> = {
  operating_year: "Operating Years",
  analysis_year: "Analysis Years",
  calendar_year: "Calendar Years",
};

/**
 * Sums a completed property run into years. Operating years start at `basis.startMonth` with the
 * months before it as one development column. Analysis years count twelve months from the first
 * model month, and calendar years follow January to December. The first and last year can be part
 * years, and each says how many months it holds.
 */
export function annualCashFlow(source: AnnualCashFlowSource, basis: AnnualYearBasis): AnnualCashFlowRun {
  const grid = source.months.map(({ month }) => month);
  const misaligned = source.operations.length !== grid.length
    || source.usesByCategory.length !== grid.length
    || source.operations.some(({ month }, index) => month !== grid[index]);
  if (grid.length === 0 || misaligned) {
    return failed([{ path: "months", code: "months_misaligned", message: "The monthly operations, cost schedule and cash flow do not cover the same months." }]);
  }
  const specs = yearSpecs(grid, basis);
  if ("code" in specs) return failed([specs]);

  const context = (index: number): MonthContext => ({
    operations: source.operations[index],
    dated: source.months[index],
    usesByCategory: source.usesByCategory[index],
    isSaleMonth: index === grid.length - 1,
    sale: source.sale,
  });
  const operationStart = source.operationStartMonth === null ? null : monthIndexOf(source.operationStartMonth);

  const years = specs.map((spec): AnnualYear => {
    const sums = Object.fromEntries(LINE_DEFINITIONS.map(({ key }) => [key, 0])) as Record<AnnualLineKey, number>;
    for (let index = spec.first; index <= spec.last; index += 1) {
      const month = context(index);
      for (const line of LINE_DEFINITIONS) sums[line.key] += cents(line.read(month));
    }
    const lines = Object.fromEntries(LINE_DEFINITIONS.map(({ key }) => [key, dollars(sums[key])])) as AnnualLines;
    const monthCount = spec.last - spec.first + 1;
    const startMonth = grid[spec.first];
    const endMonth = grid[spec.last];
    const full = spec.kind === "year" && monthCount === 12;
    const operating = operationStart !== null && monthIndexOf(startMonth)! >= operationStart;
    const permanent = source.debt.loanKind === "permanent";
    const paidMonths = source.months.slice(spec.first, spec.last + 1).filter((month) => (month.permanentDebtService ?? 0) > 0).length;
    const debtService = !full || !operating
      ? null
      : permanent
        ? (paidMonths > 0 ? dollars(Math.round(cents(lines.permanentDebtService) * 12 / paidMonths)) : null)
        : source.debt.statedAnnualDebtService;
    const debtServiceCoverage = debtService !== null && debtService > 0 ? lines.netOperatingIncome / debtService : null;
    const debtYield = full && operating && source.debt.loanAmount > 0 ? lines.netOperatingIncome / source.debt.loanAmount : null;
    const year: AnnualYear = {
      key: spec.key,
      label: spec.label,
      kind: spec.kind,
      startMonth,
      endMonth,
      monthCount,
      partial: spec.kind === "year" && monthCount < 12,
      saleYear: spec.last === grid.length - 1,
      lines,
      debtServiceCoverage,
      debtYield,
      debtServiceUsed: debtServiceCoverage === null ? null : debtService,
      debtServiceMonths: debtServiceCoverage === null || !permanent ? null : paidMonths,
      checks: [],
    };
    year.checks = yearChecks(year, spec, source);
    return year;
  });

  const totals = Object.fromEntries(ANNUAL_LINE_KEYS.map((key) => [key, dollars(years.reduce((sum, year) => sum + cents(year.lines[key]), 0))])) as AnnualLines;
  const runChecks = [
    check("annual-total-months", "The years cover every model month once", grid.length, years.reduce((sum, year) => sum + year.monthCount, 0), "count"),
    checkUsd("annual-total-noi", "Net operating income over the years equals the monthly total", source.runTotals.netOperatingIncome, totals.netOperatingIncome),
    checkUsd("annual-total-operating-cash-flow", "Operating cash flow over the years equals the monthly total", source.runTotals.operatingCashFlow, totals.operatingCashFlow),
    checkUsd("annual-total-project-costs", "Project costs over the years equal the monthly total", source.runTotals.projectCosts, totals.projectCosts),
    checkUsd("annual-total-unlevered", "Unlevered cash flow over the years equals the unlevered net profit", source.runTotals.unleveredNetProfit, totals.unleveredCashFlow),
    checkUsd("annual-total-levered", "Levered cash flow over the years equals the levered net profit", source.runTotals.leveredNetProfit, totals.leveredCashFlow),
  ];
  return {
    status: "complete",
    issues: [],
    result: {
      annualCashFlowVersion: ANNUAL_CASH_FLOW_VERSION,
      basis: structuredClone(basis),
      basisLabel: ANNUAL_YEAR_BASIS_LABELS[basis.kind],
      firstMonth: grid[0],
      lastMonth: grid[grid.length - 1],
      monthCount: grid.length,
      years,
      totals,
      traces: tracesFor(source),
      runChecks,
    },
  };
}

/** The three bases a run carries. The caller saves this inside the run result, so a saved run needs no monthly grid to show years. */
export function annualCashFlowViews(source: AnnualCashFlowSource): { status: "complete"; views: AnnualCashFlowViews } | { status: "failed"; issues: AnnualCashFlowIssue[] } {
  const analysis = annualCashFlow(source, { kind: "analysis_year" });
  const calendar = annualCashFlow(source, { kind: "calendar_year" });
  const operating = source.firstStabilizedMonth === null
    ? null
    : annualCashFlow(source, { kind: "operating_year", startMonth: source.firstStabilizedMonth });
  for (const run of [analysis, calendar, operating]) {
    if (run && run.status === "failed") return { status: "failed", issues: run.issues };
  }
  const years = (run: AnnualCashFlowRun | null): AnnualCashFlowYears | null => {
    if (!run || run.status !== "complete") return null;
    const { traces, ...rest } = run.result;
    void traces;
    return rest;
  };
  return {
    status: "complete",
    views: {
      annualCashFlowVersion: ANNUAL_CASH_FLOW_VERSION,
      traces: tracesFor(source),
      operating_year: years(operating),
      analysis_year: years(analysis)!,
      calendar_year: years(calendar)!,
    },
  };
}

type YearSpec = { key: string; label: string; kind: "development" | "year"; first: number; last: number };

function yearSpecs(grid: string[], basis: AnnualYearBasis): YearSpec[] | AnnualCashFlowIssue {
  const specs: YearSpec[] = [];
  const chunk = (from: number, prefix: string, labelPrefix: string) => {
    for (let first = from, number = 1; first < grid.length; first += 12, number += 1) {
      specs.push({ key: `${prefix}-${number}`, label: `${labelPrefix} ${number}`, kind: "year", first, last: Math.min(first + 11, grid.length - 1) });
    }
  };
  if (basis.kind === "analysis_year") {
    chunk(0, "analysis-year", "Analysis Year");
  } else if (basis.kind === "calendar_year") {
    let first = 0;
    for (let index = 1; index <= grid.length; index += 1) {
      if (index === grid.length || grid[index].slice(0, 4) !== grid[first].slice(0, 4)) {
        specs.push({ key: grid[first].slice(0, 4), label: grid[first].slice(0, 4), kind: "year", first, last: index - 1 });
        first = index;
      }
    }
  } else if (basis.kind === "operating_year") {
    const start = typeof basis.startMonth === "string" ? grid.indexOf(basis.startMonth) : -1;
    if (start < 0) {
      return { path: "basis.startMonth", code: "invalid_year_basis", message: "The operating year start month must be one of the model months." };
    }
    if (start > 0) specs.push({ key: "development", label: "Development Period", kind: "development", first: 0, last: start - 1 });
    chunk(start, "operating-year", "Operating Year");
  } else {
    return { path: "basis.kind", code: "invalid_year_basis", message: "The year basis must be operating years, analysis years or calendar years." };
  }
  return specs;
}

function yearChecks(year: AnnualYear, spec: YearSpec, source: AnnualCashFlowSource): ReconciliationCheck[] {
  const { lines } = year;
  const id = (name: string) => `annual-${year.key}-${name}`;
  const label = (text: string) => `${year.label}: ${text}`;
  const monthlyLevered = source.months.slice(spec.first, spec.last + 1).reduce((sum, month) => sum + cents(month.leveredCashFlow), 0);
  const monthlyNoi = source.operations.slice(spec.first, spec.last + 1).reduce((sum, month) => sum + cents(month.netOperatingIncome), 0);
  const leveredBuildUp = -lines.loanFee - lines.projectCosts - lines.constructionInterest + lines.totalDebtDraw + lines.otherSourcesApplied
    + lines.operatingCashFlow + lines.netSaleProceeds - lines.repayment - lines.softLoanRepayment
    + lines.permanentLoanProceeds - lines.refinanceCosts - lines.permanentDebtService - lines.permanentLoanPayoff;
  return [
    check(id("months"), label("months summed match the months from start to end"), monthSpan(year.startMonth, year.endMonth), year.monthCount, "count"),
    checkUsd(id("noi-months"), label("net operating income equals the sum of its monthly net operating income"), dollars(monthlyNoi), lines.netOperatingIncome),
    checkUsd(id("noi"), label("effective gross revenue less operating expenses equals net operating income"), lines.effectiveGrossRevenue - lines.operatingExpenses, lines.netOperatingIncome),
    checkUsd(id("revenue"), label("residential income, vacancy, credit loss and commercial revenue add to effective gross revenue"), lines.totalPotentialIncome + lines.vacancyLoss + lines.creditLoss + lines.commercialEffectiveGrossRevenue, lines.effectiveGrossRevenue),
    checkUsd(id("operating-cash-flow"), label("net operating income less capital expenditures equals operating cash flow"), lines.netOperatingIncome - lines.capitalExpenditures, lines.operatingCashFlow),
    checkUsd(id("project-costs"), label("costs by category add to project costs"), lines.landCost + lines.hardCost + lines.softCost + lines.developmentFee + lines.financingFeeCost, lines.projectCosts),
    checkUsd(id("unlevered"), label("operating cash flow and sale proceeds less project costs equal unlevered cash flow"), lines.operatingCashFlow + lines.netSaleProceeds - lines.projectCosts, lines.unleveredCashFlow),
    checkUsd(id("levered"), label("the debt and sale lines build up to the sum of its monthly levered cash flow"), dollars(monthlyLevered), leveredBuildUp),
    ...(year.saleYear ? [checkUsd(id("sale"), label("gross sale value less selling costs equals net sale proceeds"), lines.grossSaleValue - lines.sellingCosts, lines.netSaleProceeds)] : []),
  ];
}

function tracesFor(source: AnnualCashFlowSource): AnnualFormulaTrace[] {
  const debt = source.debt.loanKind === "permanent"
    ? "the permanent debt service paid in the year, scaled to twelve months when the loan funds inside the year"
    : "the lender test's stated annual debt service";
  const amount = source.debt.loanKind === "permanent" ? "the permanent loan amount" : "the construction loan's total debt";
  return [
    ...LINE_DEFINITIONS.map(({ key, label, section, formula, inputPaths }): AnnualFormulaTrace => ({ key, label, section, formula, inputPaths: [...inputPaths] })),
    {
      key: "debtServiceCoverage",
      label: "Debt Service Coverage",
      section: "cash_flow",
      formula: `Year net operating income divided by ${debt}, for a full operating year only`,
      inputPaths: source.debt.loanKind === "permanent" ? ["permanentLoan"] : ["lenderTests.annualDebtService"],
    },
    {
      key: "debtYield",
      label: "Debt Yield",
      section: "cash_flow",
      formula: `Year net operating income divided by ${amount}, for a full operating year only`,
      inputPaths: source.debt.loanKind === "permanent" ? ["permanentLoan"] : ["targetDebtSharePercent", "costLines"],
    },
  ];
}

function monthIndexOf(value: string) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function monthSpan(first: string, last: string) {
  return monthIndexOf(last)! - monthIndexOf(first)! + 1;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(valueCents: number) {
  return valueCents / 100;
}

function failed(issues: AnnualCashFlowIssue[]): AnnualCashFlowRun {
  return { status: "failed", issues, result: null };
}

function checkUsd(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

function check(id: string, label: string, expected: number, actual: number, unit: ReconciliationCheck["unit"]): ReconciliationCheck {
  const difference = actual - expected;
  return { id, label, expected, actual, difference, tolerance: 0, status: difference === 0 ? "pass" : "fail", unit };
}
