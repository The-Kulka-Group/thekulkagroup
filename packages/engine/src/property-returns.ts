import {
  computeApartmentOperations,
  type ApartmentOperationsIssue,
  type MonthlyApartmentOperations,
} from "./apartment-operations";
import {
  computeDevelopmentCapital,
  type DevelopmentCapitalInputs,
  type DevelopmentCapitalIssue,
  type DevelopmentCapitalResult,
} from "./development-capital";
import type { ReconciliationCheck } from "./monthly-cost-schedule";

export const PROPERTY_RETURNS_INPUT_VERSION = "property_returns_inputs.v1" as const;
export const PROPERTY_RETURNS_FORMULA_VERSION = "underwriting.property_returns.v1" as const;
export const FORWARD_TWELVE_MONTH_NOI_VERSION = "forward_twelve_month_noi.v1" as const;
export const MONTH_END_CASH_FLOW_DATES_VERSION = "month_end_dates.v1" as const;
export const XIRR_ACTUAL_365_VERSION = "xirr_actual_365.v1" as const;

type ReviewState = "working" | "done";

export const PROPERTY_RETURNS_ASSUMPTION_KEYS = [
  "saleMonth",
  "terminalCapRatePercent",
  "sellingCostPercent",
  "forwardNoiConvention",
  "cashFlowDateConvention",
  "xirrConvention",
] as const;

export type PropertyReturnsAssumptionKey = typeof PROPERTY_RETURNS_ASSUMPTION_KEYS[number];

export type PropertyReturnsEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export type PropertyReturnsPlan = {
  saleInputVersion: typeof PROPERTY_RETURNS_INPUT_VERSION;
  terminalCapRatePercent: number;
  sellingCostPercent: number;
  forwardNoiConvention: typeof FORWARD_TWELVE_MONTH_NOI_VERSION;
  cashFlowDateConvention: typeof MONTH_END_CASH_FLOW_DATES_VERSION;
  xirrConvention: typeof XIRR_ACTUAL_365_VERSION;
  saleAssumptionEvidence: Record<PropertyReturnsAssumptionKey, PropertyReturnsEvidence>;
};

export type PropertyReturnsInputs = DevelopmentCapitalInputs & PropertyReturnsPlan;

export type MonthlyPropertyReturnsInput = {
  month: string;
  projectCosts: number;
  loanFee: number;
  grossInterest: number;
  totalDebtDraw: number;
  operatingCashFlow: number;
  repayment: number;
};

export type ForwardSalePeriod = {
  startMonth: string;
  endMonth: string;
  monthCount: 12;
  effectiveGrossRevenue: number;
  operatingExpenses: number;
};

export type PropertyReturnsIssueCode =
  | "unsupported_input_version"
  | "invalid_percent"
  | "invalid_amount"
  | "invalid_month"
  | "non_contiguous_months"
  | "invalid_forward_period"
  | "sale_payoff_mismatch"
  | "unsupported_forward_noi_convention"
  | "unsupported_date_convention"
  | "unsupported_xirr_convention"
  | "missing_evidence"
  | "invalid_source_date"
  | "invalid_review_state"
  | "xirr_no_root"
  | "derived_results";

export type PropertyReturnsIssue = {
  path: string;
  code: PropertyReturnsIssueCode;
  message: string;
};

export type DatedPropertyCashFlow = MonthlyPropertyReturnsInput & {
  date: string;
  netSaleProceeds: number;
  unleveredCashFlow: number;
  leveredCashFlow: number;
};

export type PropertyReturnStream = {
  xirr: number;
  equityMultiple: number;
  netProfit: number;
};

export type PropertyReturnMetricUnit = "usd" | "ratio" | "multiple" | "basis_points";

export type PropertyReturnMetric = {
  key: string;
  label: string;
  value: number;
  unit: PropertyReturnMetricUnit;
  formula: string;
  inputPaths: string[];
};

export type PropertyReturnsCalculationResult = {
  sale: {
    forwardEffectiveGrossRevenue: number;
    forwardOperatingExpenses: number;
    forwardNetOperatingIncome: number;
    grossSaleValue: number;
    sellingCosts: number;
    netSaleProceeds: number;
    debtPayoff: number;
    equitySaleProceeds: number;
  };
  months: DatedPropertyCashFlow[];
  returns: {
    unlevered: PropertyReturnStream;
    levered: PropertyReturnStream;
  };
  yieldOnCost: number;
  developmentSpreadBasisPoints: number;
  metrics: PropertyReturnMetric[];
  reconciliations: ReconciliationCheck[];
};

export type PropertyReturnsCalculationRun = {
  formulaVersion: typeof PROPERTY_RETURNS_FORMULA_VERSION;
  inputSnapshot: {
    months: MonthlyPropertyReturnsInput[];
    forwardSalePeriod: ForwardSalePeriod;
    plan: PropertyReturnsPlan;
  };
  status: "complete" | "failed";
  issues: PropertyReturnsIssue[];
  result: PropertyReturnsCalculationResult | null;
  reconciliations: ReconciliationCheck[];
};

export type PropertyReturnsResult = {
  developmentCapital: DevelopmentCapitalResult;
  forwardOperations: {
    startMonth: string;
    endMonth: string;
    months: MonthlyApartmentOperations[];
  };
  propertyReturns: PropertyReturnsCalculationResult;
};

export type PropertyReturnsRun = {
  formulaVersion: typeof PROPERTY_RETURNS_FORMULA_VERSION;
  inputSnapshot: PropertyReturnsInputs;
  status: "complete" | "failed";
  issues: Array<ApartmentOperationsIssue | DevelopmentCapitalIssue | PropertyReturnsIssue>;
  result: PropertyReturnsResult | null;
  reconciliations: ReconciliationCheck[];
};

export function computePropertyReturns(input: PropertyReturnsInputs): PropertyReturnsRun {
  const inputSnapshot = structuredClone(input);
  const capitalRun = computeDevelopmentCapital(inputSnapshot);
  if (capitalRun.status === "failed" || !capitalRun.result) {
    return failedFull(inputSnapshot, capitalRun.issues);
  }
  if (inputSnapshot.payoffMonth !== inputSnapshot.saleMonth) {
    return failedFull(inputSnapshot, [{
      path: "saleMonth",
      code: "sale_payoff_mismatch",
      message: "This formula version requires the construction debt payoff in the sale month.",
    }]);
  }

  const forwardEndMonth = addMonths(inputSnapshot.saleMonth, 11);
  const forwardRun = computeApartmentOperations({ ...inputSnapshot, saleMonth: forwardEndMonth });
  if (forwardRun.status === "failed" || !forwardRun.result) {
    return failedFull(inputSnapshot, forwardRun.issues);
  }
  const forwardMonths = forwardRun.result.months.filter((month) =>
    monthIndex(month.month)! >= monthIndex(inputSnapshot.saleMonth)!
      && monthIndex(month.month)! <= monthIndex(forwardEndMonth)!,
  );
  const forwardSalePeriod: ForwardSalePeriod = {
    startMonth: inputSnapshot.saleMonth,
    endMonth: forwardEndMonth,
    monthCount: 12,
    effectiveGrossRevenue: sum(forwardMonths, "effectiveGrossRevenue"),
    operatingExpenses: sum(forwardMonths, "operatingExpenses"),
  };
  const calculation = calculatePropertyReturns(
    capitalRun.result.capital.months.map((month) => ({
      month: month.month,
      projectCosts: month.projectCosts,
      loanFee: month.loanFee,
      grossInterest: month.grossInterest,
      totalDebtDraw: month.totalDebtDraw,
      operatingCashFlow: month.operatingCashFlow,
      repayment: month.repayment,
    })),
    forwardSalePeriod,
    planFrom(inputSnapshot),
  );
  if (calculation.status === "failed" || !calculation.result) {
    return failedFull(inputSnapshot, calculation.issues);
  }
  return {
    formulaVersion: PROPERTY_RETURNS_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result: {
      developmentCapital: capitalRun.result.capital,
      forwardOperations: { startMonth: inputSnapshot.saleMonth, endMonth: forwardEndMonth, months: forwardMonths },
      propertyReturns: calculation.result,
    },
    reconciliations: [...capitalRun.reconciliations, ...calculation.reconciliations],
  };
}

export function calculatePropertyReturns(
  submittedMonths: MonthlyPropertyReturnsInput[],
  submittedForwardSalePeriod: ForwardSalePeriod,
  submittedPlan: PropertyReturnsPlan,
): PropertyReturnsCalculationRun {
  const months = structuredClone(submittedMonths);
  const forwardSalePeriod = structuredClone(submittedForwardSalePeriod);
  const plan = structuredClone(submittedPlan);
  const inputSnapshot = { months, forwardSalePeriod, plan };
  const issues = validate(months, forwardSalePeriod, plan);
  if (issues.length > 0) return failedCalculation(inputSnapshot, issues);

  const forwardNetOperatingIncome = forwardSalePeriod.effectiveGrossRevenue - forwardSalePeriod.operatingExpenses;
  const grossSaleValue = forwardNetOperatingIncome / (plan.terminalCapRatePercent / 100);
  const sellingCosts = grossSaleValue * plan.sellingCostPercent / 100;
  const netSaleProceeds = grossSaleValue - sellingCosts;
  const debtPayoff = months.at(-1)!.repayment;
  const equitySaleProceeds = netSaleProceeds - debtPayoff;
  const datedMonths = months.map((month, index): DatedPropertyCashFlow => {
    const saleProceeds = index === months.length - 1 ? netSaleProceeds : 0;
    return {
      ...month,
      date: monthEndDate(month.month),
      netSaleProceeds: saleProceeds,
      unleveredCashFlow: -month.projectCosts + month.operatingCashFlow + saleProceeds,
      leveredCashFlow: -month.loanFee - month.projectCosts - month.grossInterest
        + month.totalDebtDraw + month.operatingCashFlow + saleProceeds - month.repayment,
    };
  });
  const unleveredXirr = xirr(datedMonths.map(({ date, unleveredCashFlow: amount }) => ({ date, amount })));
  const leveredXirr = xirr(datedMonths.map(({ date, leveredCashFlow: amount }) => ({ date, amount })));
  if (unleveredXirr === null) {
    issues.push({ path: "unleveredCashFlow", code: "xirr_no_root", message: "Unlevered XIRR requires dated cash flow with a solvable positive and negative return." });
  }
  if (leveredXirr === null) {
    issues.push({ path: "leveredCashFlow", code: "xirr_no_root", message: "Levered XIRR requires dated cash flow with a solvable positive and negative return." });
  }
  if (issues.length > 0) return failedCalculation(inputSnapshot, issues);

  const totalProjectCost = months.reduce((total, month) => total
    + month.projectCosts
    + month.loanFee
    + Math.max(-month.operatingCashFlow, 0)
    + Math.max(month.grossInterest - Math.max(month.operatingCashFlow, 0), 0), 0);
  const returns = {
    unlevered: stream(datedMonths.map(({ unleveredCashFlow }) => unleveredCashFlow), unleveredXirr!),
    levered: stream(datedMonths.map(({ leveredCashFlow }) => leveredCashFlow), leveredXirr!),
  };
  const yieldOnCost = forwardNetOperatingIncome / totalProjectCost;
  const developmentSpreadBasisPoints = (yieldOnCost - plan.terminalCapRatePercent / 100) * 10_000;
  const sale = {
    forwardEffectiveGrossRevenue: forwardSalePeriod.effectiveGrossRevenue,
    forwardOperatingExpenses: forwardSalePeriod.operatingExpenses,
    forwardNetOperatingIncome,
    grossSaleValue,
    sellingCosts,
    netSaleProceeds,
    debtPayoff,
    equitySaleProceeds,
  };
  const reconciliations = reconcile(datedMonths, sale, returns);
  const metrics = metricsFor(sale, returns, yieldOnCost, developmentSpreadBasisPoints);
  if (![...Object.values(sale), yieldOnCost, developmentSpreadBasisPoints, ...metrics.map(({ value }) => value)].every(Number.isFinite)
    || reconciliations.some(({ status }) => status === "fail")) {
    return failedCalculation(inputSnapshot, [{ path: "propertyReturns", code: "derived_results", message: "The sale and property return results did not reconcile within one cent." }]);
  }
  const result = { sale, months: datedMonths, returns, yieldOnCost, developmentSpreadBasisPoints, metrics, reconciliations };
  return { formulaVersion: PROPERTY_RETURNS_FORMULA_VERSION, inputSnapshot, status: "complete", issues: [], result, reconciliations };
}

export function validatePropertyReturnsPlan(plan: PropertyReturnsPlan): PropertyReturnsIssue[] {
  const issues: PropertyReturnsIssue[] = [];
  if (plan.saleInputVersion !== PROPERTY_RETURNS_INPUT_VERSION) issues.push({ path: "saleInputVersion", code: "unsupported_input_version", message: `Use ${PROPERTY_RETURNS_INPUT_VERSION}.` });
  if (!Number.isFinite(plan.terminalCapRatePercent) || plan.terminalCapRatePercent <= 0 || plan.terminalCapRatePercent > 100) issues.push({ path: "terminalCapRatePercent", code: "invalid_percent", message: "Terminal cap rate must be greater than zero and no more than 100 percent." });
  if (!Number.isFinite(plan.sellingCostPercent) || plan.sellingCostPercent < 0 || plan.sellingCostPercent > 100) issues.push({ path: "sellingCostPercent", code: "invalid_percent", message: "Selling costs must be from 0 to 100 percent." });
  if (plan.forwardNoiConvention !== FORWARD_TWELVE_MONTH_NOI_VERSION) issues.push({ path: "forwardNoiConvention", code: "unsupported_forward_noi_convention", message: `Use ${FORWARD_TWELVE_MONTH_NOI_VERSION}.` });
  if (plan.cashFlowDateConvention !== MONTH_END_CASH_FLOW_DATES_VERSION) issues.push({ path: "cashFlowDateConvention", code: "unsupported_date_convention", message: `Use ${MONTH_END_CASH_FLOW_DATES_VERSION}.` });
  if (plan.xirrConvention !== XIRR_ACTUAL_365_VERSION) issues.push({ path: "xirrConvention", code: "unsupported_xirr_convention", message: `Use ${XIRR_ACTUAL_365_VERSION}.` });
  validateEvidence(issues, plan.saleAssumptionEvidence);
  return issues;
}

function validate(months: MonthlyPropertyReturnsInput[], period: ForwardSalePeriod, plan: PropertyReturnsPlan) {
  const issues: PropertyReturnsIssue[] = [];
  if (!Array.isArray(months) || months.length < 2) {
    issues.push({ path: "months", code: "invalid_amount", message: "Add at least two monthly property cash-flow rows." });
    return issues;
  }
  let prior: number | null = null;
  months.forEach((month, index) => {
    const current = monthIndex(month.month);
    if (current === null) issues.push({ path: `months.${index}.month`, code: "invalid_month", message: "Month must use YYYY-MM." });
    else if (prior !== null && current !== prior + 1) issues.push({ path: `months.${index}.month`, code: "non_contiguous_months", message: "Monthly cash-flow rows must be contiguous." });
    prior = current;
    for (const key of ["projectCosts", "loanFee", "grossInterest", "totalDebtDraw", "repayment"] as const) {
      if (!Number.isFinite(month[key]) || month[key] < 0) issues.push({ path: `months.${index}.${key}`, code: "invalid_amount", message: `${labelFor(key)} must be zero or a positive USD amount.` });
    }
    if (!Number.isFinite(month.operatingCashFlow)) issues.push({ path: `months.${index}.operatingCashFlow`, code: "invalid_amount", message: "Operating cash flow must be a USD amount." });
  });
  issues.push(...validatePropertyReturnsPlan(plan));
  const saleMonth = months.at(-1)?.month;
  if (period.monthCount !== 12 || period.startMonth !== saleMonth || period.endMonth !== addMonths(period.startMonth, 11)) {
    issues.push({ path: "forwardSalePeriod", code: "invalid_forward_period", message: "The forward sale period must contain the sale month and the next eleven calendar months." });
  }
  if (!Number.isFinite(period.effectiveGrossRevenue) || period.effectiveGrossRevenue < 0 || !Number.isFinite(period.operatingExpenses) || period.operatingExpenses < 0) {
    issues.push({ path: "forwardSalePeriod", code: "invalid_amount", message: "Forward revenue and operating expenses must be zero or positive USD amounts." });
  }
  if (months.slice(0, -1).some(({ repayment }) => repayment !== 0)) {
    issues.push({ path: "months.repayment", code: "sale_payoff_mismatch", message: "This formula version repays construction debt in the sale month only." });
  }
  return issues;
}

function validateEvidence(issues: PropertyReturnsIssue[], evidence: Record<PropertyReturnsAssumptionKey, PropertyReturnsEvidence>) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push({ path: "saleAssumptionEvidence", code: "missing_evidence", message: "Add source and review details for the sale assumptions." });
    return;
  }
  for (const key of PROPERTY_RETURNS_ASSUMPTION_KEYS) {
    const item = evidence[key];
    const path = `saleAssumptionEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path, code: "missing_evidence", message: `${labelFor(key)} needs source and review details.` });
      continue;
    }
    if (item.sourceDate !== undefined && !validDate(item.sourceDate)) issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on it or Done." });
  }
}

function stream(cashFlow: number[], rate: number): PropertyReturnStream {
  const positive = cashFlow.reduce((sum, value) => sum + Math.max(value, 0), 0);
  const negative = cashFlow.reduce((sum, value) => sum + Math.min(value, 0), 0);
  return { xirr: rate, equityMultiple: positive / -negative, netProfit: positive + negative };
}

function xirr(cashFlow: Array<{ date: string; amount: number }>) {
  if (!cashFlow.some(({ amount }) => amount < 0) || !cashFlow.some(({ amount }) => amount > 0)) return null;
  const first = Date.parse(`${cashFlow[0].date}T00:00:00.000Z`);
  const timed = cashFlow.map(({ date, amount }) => ({ amount, years: (Date.parse(`${date}T00:00:00.000Z`) - first) / 86_400_000 / 365 }));
  let rate = 0.1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const base = 1 + rate;
    if (base <= 0) break;
    const value = timed.reduce((total, item) => total + item.amount / base ** item.years, 0);
    const derivative = timed.reduce((total, item) => total - item.years * item.amount / base ** (item.years + 1), 0);
    if (Math.abs(value) <= 1e-7) return rate;
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -0.999999999) break;
    if (Math.abs(next - rate) <= 1e-12) return next;
    rate = next;
  }
  const candidates: Array<{ low: number; high: number }> = [];
  let priorRate = Math.expm1(-20);
  let priorValue = xnpv(timed, priorRate);
  for (let logBase = -19.75; logBase <= 14; logBase += 0.25) {
    const currentRate = Math.expm1(logBase);
    const currentValue = xnpv(timed, currentRate);
    if (Number.isFinite(priorValue) && Number.isFinite(currentValue) && priorValue * currentValue <= 0) candidates.push({ low: priorRate, high: currentRate });
    priorRate = currentRate;
    priorValue = currentValue;
  }
  const bracket = candidates.sort((a, b) => Math.abs((a.low + a.high) / 2 - 0.1) - Math.abs((b.low + b.high) / 2 - 0.1))[0];
  if (!bracket) return null;
  let { low, high } = bracket;
  let lowValue = xnpv(timed, low);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const value = xnpv(timed, middle);
    if (Math.abs(value) <= 1e-7 || Math.abs(high - low) <= 1e-12) return middle;
    if (lowValue * value <= 0) high = middle;
    else { low = middle; lowValue = value; }
  }
  return null;
}

function xnpv(cashFlow: Array<{ amount: number; years: number }>, rate: number) {
  return cashFlow.reduce((total, item) => total + item.amount / (1 + rate) ** item.years, 0);
}

function reconcile(
  months: DatedPropertyCashFlow[],
  sale: PropertyReturnsCalculationResult["sale"],
  returns: PropertyReturnsCalculationResult["returns"],
) {
  return [
    check("forward-noi", "Forward sale NOI equals effective gross revenue less operating expenses", sale.forwardNetOperatingIncome, sale.forwardEffectiveGrossRevenue - sale.forwardOperatingExpenses),
    check("net-sale-proceeds", "Net sale proceeds equal gross sale value less selling costs", sale.netSaleProceeds, sale.grossSaleValue - sale.sellingCosts),
    check("equity-sale-proceeds", "Equity sale proceeds equal net sale proceeds less construction debt payoff", sale.equitySaleProceeds, sale.netSaleProceeds - sale.debtPayoff),
    ...months.flatMap((month) => [
      check(`unlevered-cash-flow:${month.month}`, `${month.month} unlevered cash flow equals operating cash and sale proceeds less project costs`, month.unleveredCashFlow, -month.projectCosts + month.operatingCashFlow + month.netSaleProceeds),
      check(`levered-cash-flow:${month.month}`, `${month.month} levered cash flow equals operating cash, debt funding, sale proceeds, costs, interest, and debt repayment`, month.leveredCashFlow, -month.loanFee - month.projectCosts - month.grossInterest + month.totalDebtDraw + month.operatingCashFlow + month.netSaleProceeds - month.repayment),
    ]),
    check("unlevered-net-profit", "Unlevered net profit equals dated unlevered cash flow", returns.unlevered.netProfit, months.reduce((sum, month) => sum + month.unleveredCashFlow, 0)),
    check("levered-net-profit", "Levered net profit equals dated levered cash flow", returns.levered.netProfit, months.reduce((sum, month) => sum + month.leveredCashFlow, 0)),
  ];
}

function metricsFor(
  sale: PropertyReturnsCalculationResult["sale"],
  returns: PropertyReturnsCalculationResult["returns"],
  yieldOnCost: number,
  developmentSpreadBasisPoints: number,
): PropertyReturnMetric[] {
  return [
    { key: "forwardNetOperatingIncome", label: "Forward Sale NOI", value: sale.forwardNetOperatingIncome, unit: "usd", formula: "forward twelve-month effective gross revenue less forward twelve-month operating expenses", inputPaths: ["forwardNoiConvention", "forwardOperations"] },
    { key: "grossSaleValue", label: "Gross Sale Value", value: sale.grossSaleValue, unit: "usd", formula: "forward sale NOI divided by terminal cap rate", inputPaths: ["terminalCapRatePercent", "forwardOperations"] },
    { key: "sellingCosts", label: "Selling Costs", value: sale.sellingCosts, unit: "usd", formula: "gross sale value times selling cost percent", inputPaths: ["sellingCostPercent"] },
    { key: "netSaleProceeds", label: "Net Sale Proceeds", value: sale.netSaleProceeds, unit: "usd", formula: "gross sale value less selling costs", inputPaths: ["terminalCapRatePercent", "sellingCostPercent"] },
    { key: "debtPayoff", label: "Construction Debt Payoff", value: sale.debtPayoff, unit: "usd", formula: "construction debt repayment in the sale month", inputPaths: ["saleMonth", "payoffMonth"] },
    { key: "equitySaleProceeds", label: "Equity Sale Proceeds", value: sale.equitySaleProceeds, unit: "usd", formula: "net sale proceeds less construction debt payoff", inputPaths: ["saleMonth", "payoffMonth"] },
    { key: "unleveredXirr", label: "Unlevered XIRR", value: returns.unlevered.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly unlevered cash flow", inputPaths: ["cashFlowDateConvention", "xirrConvention"] },
    { key: "unleveredEquityMultiple", label: "Unlevered Equity Multiple", value: returns.unlevered.equityMultiple, unit: "multiple", formula: "positive unlevered cash flow divided by negative unlevered cash flow", inputPaths: ["propertyReturns.months.unleveredCashFlow"] },
    { key: "unleveredNetProfit", label: "Unlevered Net Profit", value: returns.unlevered.netProfit, unit: "usd", formula: "sum dated monthly unlevered cash flow", inputPaths: ["propertyReturns.months.unleveredCashFlow"] },
    { key: "leveredXirr", label: "Levered XIRR", value: returns.levered.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly levered cash flow", inputPaths: ["cashFlowDateConvention", "xirrConvention"] },
    { key: "leveredEquityMultiple", label: "Levered Equity Multiple", value: returns.levered.equityMultiple, unit: "multiple", formula: "positive levered cash flow divided by negative levered cash flow", inputPaths: ["propertyReturns.months.leveredCashFlow"] },
    { key: "leveredNetProfit", label: "Levered Net Profit", value: returns.levered.netProfit, unit: "usd", formula: "sum dated monthly levered cash flow", inputPaths: ["propertyReturns.months.leveredCashFlow"] },
    { key: "yieldOnCost", label: "Sale Yield On Cost", value: yieldOnCost, unit: "ratio", formula: "forward sale NOI divided by total project cost including carry", inputPaths: ["forwardOperations", "developmentCapital.months.totalUses"] },
    { key: "developmentSpread", label: "Development Spread", value: developmentSpreadBasisPoints, unit: "basis_points", formula: "sale yield on cost less terminal cap rate, in basis points", inputPaths: ["terminalCapRatePercent", "forwardOperations", "developmentCapital.months.projectCosts"] },
  ];
}

function check(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = actual - expected;
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

function planFrom(input: PropertyReturnsInputs): PropertyReturnsPlan {
  return {
    saleInputVersion: input.saleInputVersion,
    terminalCapRatePercent: input.terminalCapRatePercent,
    sellingCostPercent: input.sellingCostPercent,
    forwardNoiConvention: input.forwardNoiConvention,
    cashFlowDateConvention: input.cashFlowDateConvention,
    xirrConvention: input.xirrConvention,
    saleAssumptionEvidence: structuredClone(input.saleAssumptionEvidence),
  };
}

function sum(months: MonthlyApartmentOperations[], key: "effectiveGrossRevenue" | "operatingExpenses") {
  return months.reduce((total, month) => total + month[key], 0);
}

function monthIndex(value: string) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function addMonths(value: string, offset: number) {
  const index = monthIndex(value);
  if (index === null) return "";
  const result = index + offset;
  return `${Math.floor(result / 12)}-${String(result % 12 + 1).padStart(2, "0")}`;
}

function monthEndDate(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function labelFor(value: string) {
  return value.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function failedCalculation(inputSnapshot: PropertyReturnsCalculationRun["inputSnapshot"], issues: PropertyReturnsIssue[]): PropertyReturnsCalculationRun {
  return { formulaVersion: PROPERTY_RETURNS_FORMULA_VERSION, inputSnapshot, status: "failed", issues, result: null, reconciliations: [] };
}

function failedFull(inputSnapshot: PropertyReturnsInputs, issues: PropertyReturnsRun["issues"]): PropertyReturnsRun {
  return { formulaVersion: PROPERTY_RETURNS_FORMULA_VERSION, inputSnapshot, status: "failed", issues, result: null, reconciliations: [] };
}
