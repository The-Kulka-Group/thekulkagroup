import {
  projectApartmentOperationsThrough,
  type ApartmentOperationsIssue,
  type MonthlyApartmentOperations,
} from "./apartment-operations";
import {
  computeDevelopmentCapital,
  type DevelopmentCapitalInputs,
  type DevelopmentCapitalIssue,
  type DevelopmentCapitalResult,
} from "./development-capital";
import {
  lenderTestsFor,
  validateLenderTestPlan,
  type LenderTestPlan,
  type LenderTestsResult,
} from "./lender-tests";
import type { ReconciliationCheck } from "./monthly-cost-schedule";

export const PROPERTY_RETURNS_INPUT_VERSION = "property_returns_inputs.v1" as const;
/** v2 adds lender tests (LA-1689). Runs saved under v1 stay readable and carry no lender tests. */
export const PROPERTY_RETURNS_FORMULA_VERSION = "underwriting.property_returns.v2" as const;
export const PROPERTY_RETURNS_V1_FORMULA_VERSION = "underwriting.property_returns.v1" as const;
export const FORWARD_TWELVE_MONTH_NOI_VERSION = "forward_twelve_month_noi.v1" as const;
export const MONTH_END_CASH_FLOW_DATES_VERSION = "month_end_dates.v1" as const;
export const XIRR_ACTUAL_365_VERSION = "xirr_actual_365.v1" as const;
export const MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH = 500;

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
  lenderTests?: LenderTestPlan;
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
  | "invalid_source_label"
  | "text_too_long"
  | "invalid_source_date"
  | "invalid_review_state"
  | "xirr_no_root"
  | "xirr_convergence"
  | "derived_results"
  | "invalid_lender_tests"
  | "invalid_noi_basis";

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
  lenderTests: LenderTestsResult | null;
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
  if (inputSnapshot.lenderTests !== undefined) {
    const lenderIssues = validateLenderTestPlan(inputSnapshot.lenderTests);
    if (lenderIssues.length > 0) return failedFull(inputSnapshot, lenderIssues);
  }
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
  const projectedMonths = projectApartmentOperationsThrough(inputSnapshot, forwardEndMonth);
  const forwardMonths = projectedMonths.filter((month) =>
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
      lenderTests: lenderTestsFor(inputSnapshot, capitalRun.result.capital.totals, projectedMonths),
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

  const forwardEffectiveGrossRevenueCents = cents(forwardSalePeriod.effectiveGrossRevenue);
  const forwardOperatingExpensesCents = cents(forwardSalePeriod.operatingExpenses);
  const forwardNetOperatingIncomeCents = forwardEffectiveGrossRevenueCents - forwardOperatingExpensesCents;
  const grossSaleValueCents = Math.round(forwardNetOperatingIncomeCents / (plan.terminalCapRatePercent / 100));
  const sellingCostsCents = percentOf(grossSaleValueCents, plan.sellingCostPercent);
  const netSaleProceedsCents = grossSaleValueCents - sellingCostsCents;
  const debtPayoffCents = cents(months.at(-1)!.repayment);
  const equitySaleProceedsCents = netSaleProceedsCents - debtPayoffCents;
  if (![forwardNetOperatingIncomeCents, grossSaleValueCents, sellingCostsCents, netSaleProceedsCents, debtPayoffCents, equitySaleProceedsCents].every(Number.isSafeInteger)) {
    return failedCalculation(inputSnapshot, [{ path: "propertyReturns", code: "derived_results", message: "The sale result is outside the supported cent range." }]);
  }
  const datedMonths = months.map((month, index): DatedPropertyCashFlow => {
    const saleProceedsCents = index === months.length - 1 ? netSaleProceedsCents : 0;
    const projectCostsCents = cents(month.projectCosts);
    const loanFeeCents = cents(month.loanFee);
    const grossInterestCents = cents(month.grossInterest);
    const totalDebtDrawCents = cents(month.totalDebtDraw);
    const operatingCashFlowCents = cents(month.operatingCashFlow);
    const repaymentCents = cents(month.repayment);
    return {
      ...month,
      date: monthEndDate(month.month),
      netSaleProceeds: dollars(saleProceedsCents),
      unleveredCashFlow: dollars(-projectCostsCents + operatingCashFlowCents + saleProceedsCents),
      leveredCashFlow: dollars(-loanFeeCents - projectCostsCents - grossInterestCents
        + totalDebtDrawCents + operatingCashFlowCents + saleProceedsCents - repaymentCents),
    };
  });
  if (!datedMonths.every((month) => Number.isSafeInteger(cents(month.unleveredCashFlow)) && Number.isSafeInteger(cents(month.leveredCashFlow)))) {
    return failedCalculation(inputSnapshot, [{ path: "propertyReturns.months", code: "derived_results", message: "The dated cash flow is outside the supported cent range." }]);
  }
  const unleveredXirr = xirr(datedMonths.map(({ date, unleveredCashFlow }) => ({ date, amountCents: cents(unleveredCashFlow) })));
  const leveredXirr = xirr(datedMonths.map(({ date, leveredCashFlow }) => ({ date, amountCents: cents(leveredCashFlow) })));
  if (unleveredXirr.status !== "ok") {
    issues.push(xirrIssue("unleveredCashFlow", unleveredXirr.status));
  }
  if (leveredXirr.status !== "ok") {
    issues.push(xirrIssue("leveredCashFlow", leveredXirr.status));
  }
  if (issues.length > 0) return failedCalculation(inputSnapshot, issues);
  if (unleveredXirr.status !== "ok" || leveredXirr.status !== "ok") {
    return failedCalculation(inputSnapshot, issues);
  }

  const totalProjectCostCents = months.reduce((total, month) => total
    + cents(month.projectCosts)
    + cents(month.loanFee)
    + Math.max(-cents(month.operatingCashFlow), 0)
    + Math.max(cents(month.grossInterest) - Math.max(cents(month.operatingCashFlow), 0), 0), 0);
  if (!Number.isSafeInteger(totalProjectCostCents) || totalProjectCostCents <= 0) {
    return failedCalculation(inputSnapshot, [{ path: "propertyReturns", code: "derived_results", message: "Total project cost is outside the supported cent range." }]);
  }
  const returns = {
    unlevered: stream(datedMonths.map(({ unleveredCashFlow }) => cents(unleveredCashFlow)), unleveredXirr.rate),
    levered: stream(datedMonths.map(({ leveredCashFlow }) => cents(leveredCashFlow)), leveredXirr.rate),
  };
  const yieldOnCost = forwardNetOperatingIncomeCents / totalProjectCostCents;
  const developmentSpreadBasisPoints = (yieldOnCost - plan.terminalCapRatePercent / 100) * 10_000;
  const sale = {
    forwardEffectiveGrossRevenue: dollars(forwardEffectiveGrossRevenueCents),
    forwardOperatingExpenses: dollars(forwardOperatingExpensesCents),
    forwardNetOperatingIncome: dollars(forwardNetOperatingIncomeCents),
    grossSaleValue: dollars(grossSaleValueCents),
    sellingCosts: dollars(sellingCostsCents),
    netSaleProceeds: dollars(netSaleProceedsCents),
    debtPayoff: dollars(debtPayoffCents),
    equitySaleProceeds: dollars(equitySaleProceedsCents),
  };
  const reconciliations = reconcile(datedMonths, sale, returns, plan, totalProjectCostCents, unleveredXirr, leveredXirr, yieldOnCost, developmentSpreadBasisPoints);
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
  if (plan.lenderTests !== undefined) issues.push(...validateLenderTestPlan(plan.lenderTests));
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
      if (!validUsd(month[key], false)) issues.push({ path: `months.${index}.${key}`, code: "invalid_amount", message: `${labelFor(key)} must be zero or a positive safe USD amount with no more than two decimal places.` });
    }
    if (!validUsd(month.operatingCashFlow, true)) issues.push({ path: `months.${index}.operatingCashFlow`, code: "invalid_amount", message: "Operating cash flow must be a safe USD amount with no more than two decimal places." });
  });
  issues.push(...validatePropertyReturnsPlan(plan));
  const saleMonth = months.at(-1)?.month;
  if (period.monthCount !== 12 || period.startMonth !== saleMonth || period.endMonth !== addMonths(period.startMonth, 11)) {
    issues.push({ path: "forwardSalePeriod", code: "invalid_forward_period", message: "The forward sale period must contain the sale month and the next eleven calendar months." });
  }
  if (!validUsd(period.effectiveGrossRevenue, false) || !validUsd(period.operatingExpenses, false)) {
    issues.push({ path: "forwardSalePeriod", code: "invalid_amount", message: "Forward revenue and operating expenses must be safe, zero or positive USD amounts with no more than two decimal places." });
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
    if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") issues.push({ path: `${path}.sourceLabel`, code: "invalid_source_label", message: "Source label must be text." });
    else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH) issues.push({ path: `${path}.sourceLabel`, code: "text_too_long", message: `Source label cannot exceed ${MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH} characters.` });
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  }
}

function stream(cashFlow: number[], rate: number): PropertyReturnStream {
  const positive = cashFlow.reduce((sum, value) => sum + Math.max(value, 0), 0);
  const negative = cashFlow.reduce((sum, value) => sum + Math.min(value, 0), 0);
  return { xirr: rate, equityMultiple: positive / -negative, netProfit: dollars(positive + negative) };
}

type XirrResult =
  | { status: "ok"; rate: number; residualCents: number; toleranceCents: number }
  | { status: "no_root" | "convergence" };

function xirr(cashFlow: Array<{ date: string; amountCents: number }>): XirrResult {
  if (!cashFlow.some(({ amountCents }) => amountCents < 0) || !cashFlow.some(({ amountCents }) => amountCents > 0)) return { status: "no_root" };
  const first = Date.parse(`${cashFlow[0].date}T00:00:00.000Z`);
  const timed = cashFlow.map(({ date, amountCents }) => ({ amountCents, years: (Date.parse(`${date}T00:00:00.000Z`) - first) / 86_400_000 / 365 }));
  const toleranceCents = Math.max(0.01, cashFlow.reduce((total, item) => total + Math.abs(item.amountCents), 0) * 1e-10);
  const accept = (rate: number): XirrResult | undefined => {
    const residualCents = xnpv(timed, rate);
    return Number.isFinite(residualCents) && Math.abs(residualCents) <= toleranceCents
      ? { status: "ok", rate, residualCents, toleranceCents }
      : undefined;
  };
  let rate = 0.1;
  for (let iteration = 0; iteration < 100; iteration += 1) {
    const base = 1 + rate;
    if (base <= 0) break;
    const value = xnpv(timed, rate);
    const accepted = accept(rate);
    if (accepted) return accepted;
    const derivative = timed.reduce((total, item) => total - item.years * item.amountCents / base ** (item.years + 1), 0);
    if (!Number.isFinite(derivative) || Math.abs(derivative) < 1e-12) break;
    const next = rate - value / derivative;
    if (!Number.isFinite(next) || next <= -0.999999999) break;
    if (Math.abs(next - rate) <= 1e-12) {
      const acceptedNext = accept(next);
      if (acceptedNext) return acceptedNext;
      break;
    }
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
  if (!bracket) return { status: "convergence" };
  let { low, high } = bracket;
  let lowValue = xnpv(timed, low);
  for (let iteration = 0; iteration < 200; iteration += 1) {
    const middle = (low + high) / 2;
    const value = xnpv(timed, middle);
    const accepted = accept(middle);
    if (accepted) return accepted;
    if (Math.abs(high - low) <= 1e-12) break;
    if (lowValue * value <= 0) high = middle;
    else { low = middle; lowValue = value; }
  }
  return { status: "convergence" };
}

function xnpv(cashFlow: Array<{ amountCents: number; years: number }>, rate: number) {
  return cashFlow.reduce((total, item) => total + item.amountCents / (1 + rate) ** item.years, 0);
}

function reconcile(
  months: DatedPropertyCashFlow[],
  sale: PropertyReturnsCalculationResult["sale"],
  returns: PropertyReturnsCalculationResult["returns"],
  plan: PropertyReturnsPlan,
  totalProjectCostCents: number,
  unleveredXirr: Extract<XirrResult, { status: "ok" }>,
  leveredXirr: Extract<XirrResult, { status: "ok" }>,
  yieldOnCost: number,
  developmentSpreadBasisPoints: number,
) {
  const unleveredCents = months.map((month) => cents(month.unleveredCashFlow));
  const leveredCents = months.map((month) => cents(month.leveredCashFlow));
  const datedUnlevered = months.map((month) => ({ amountCents: cents(month.unleveredCashFlow), years: yearsFrom(months[0].date, month.date) }));
  const datedLevered = months.map((month) => ({ amountCents: cents(month.leveredCashFlow), years: yearsFrom(months[0].date, month.date) }));
  return [
    checkUsd("forward-noi", "Forward sale NOI equals effective gross revenue less operating expenses", sale.forwardNetOperatingIncome, dollars(cents(sale.forwardEffectiveGrossRevenue) - cents(sale.forwardOperatingExpenses))),
    checkUsd("gross-sale-value", "Gross sale value equals forward sale NOI divided by terminal cap rate", sale.grossSaleValue, dollars(Math.round(cents(sale.forwardNetOperatingIncome) / (plan.terminalCapRatePercent / 100)))),
    checkUsd("selling-costs", "Selling costs equal gross sale value times selling cost percent", sale.sellingCosts, dollars(percentOf(cents(sale.grossSaleValue), plan.sellingCostPercent))),
    checkUsd("net-sale-proceeds", "Net sale proceeds equal gross sale value less selling costs", sale.netSaleProceeds, dollars(cents(sale.grossSaleValue) - cents(sale.sellingCosts))),
    checkUsd("debt-payoff", "Construction debt payoff equals sale-month repayment", sale.debtPayoff, months.at(-1)!.repayment),
    checkUsd("equity-sale-proceeds", "Equity sale proceeds equal net sale proceeds less construction debt payoff", sale.equitySaleProceeds, dollars(cents(sale.netSaleProceeds) - cents(sale.debtPayoff))),
    ...months.flatMap((month) => [
      checkUsd(`unlevered-cash-flow:${month.month}`, `${month.month} unlevered cash flow equals operating cash and sale proceeds less project costs`, month.unleveredCashFlow, dollars(-cents(month.projectCosts) + cents(month.operatingCashFlow) + cents(month.netSaleProceeds))),
      checkUsd(`levered-cash-flow:${month.month}`, `${month.month} levered cash flow equals operating cash, debt funding, sale proceeds, costs, interest, and debt repayment`, month.leveredCashFlow, dollars(-cents(month.loanFee) - cents(month.projectCosts) - cents(month.grossInterest) + cents(month.totalDebtDraw) + cents(month.operatingCashFlow) + cents(month.netSaleProceeds) - cents(month.repayment))),
    ]),
    checkMetric("unlevered-equity-multiple", "Unlevered equity multiple equals positive cash flow divided by negative cash flow", returns.unlevered.equityMultiple, equityMultiple(unleveredCents), 1e-10, "multiple"),
    checkMetric("levered-equity-multiple", "Levered equity multiple equals positive cash flow divided by negative cash flow", returns.levered.equityMultiple, equityMultiple(leveredCents), 1e-10, "multiple"),
    checkMetric("unlevered-xirr-residual", "Unlevered XIRR has a scale-aware XNPV residual", 0, dollars(xnpv(datedUnlevered, unleveredXirr.rate)), dollars(unleveredXirr.toleranceCents), "usd"),
    checkMetric("levered-xirr-residual", "Levered XIRR has a scale-aware XNPV residual", 0, dollars(xnpv(datedLevered, leveredXirr.rate)), dollars(leveredXirr.toleranceCents), "usd"),
    checkMetric("yield-on-cost", "Yield on cost equals forward NOI divided by total project cost", yieldOnCost, cents(sale.forwardNetOperatingIncome) / totalProjectCostCents, 1e-10, "ratio"),
    checkMetric("development-spread", "Development spread equals yield on cost less terminal cap rate", developmentSpreadBasisPoints, (yieldOnCost - plan.terminalCapRatePercent / 100) * 10_000, 1e-6, "basis_points"),
    checkUsd("unlevered-net-profit", "Unlevered net profit equals dated unlevered cash flow", returns.unlevered.netProfit, dollars(unleveredCents.reduce((sum, value) => sum + value, 0))),
    checkUsd("levered-net-profit", "Levered net profit equals dated levered cash flow", returns.levered.netProfit, dollars(leveredCents.reduce((sum, value) => sum + value, 0))),
  ];
}

function metricsFor(
  sale: PropertyReturnsCalculationResult["sale"],
  returns: PropertyReturnsCalculationResult["returns"],
  yieldOnCost: number,
  developmentSpreadBasisPoints: number,
): PropertyReturnMetric[] {
  const costPaths = ["analysisStartMonth", "saleMonth", "costLines"];
  const operationPaths = [
    "analysisStartMonth", "saleMonth", "inputVersion", "operationStartMonth", "growthStartMonth",
    "preleasedUnits", "leaseUpUnitsPerMonth", "annualIncomeGrowthPercent",
    "annualExpenseGrowthPercent", "rentAdjustmentLossPercent", "freeRentPercent",
    "vacancyPercent", "creditLossPercent", "residentialUnitTypes", "otherIncomeLines",
    "operatingExpenseLines", "capitalExpenditureLines",
  ];
  const capitalPaths = [
    "capitalInputVersion", "targetDebtSharePercent", "annualInterestRatePercent", "loanFeePercent",
    "fundingOrder", "interestTreatment", "interestConvention", "feeMonth", "payoffMonth",
  ];
  const saleValuePaths = ["saleInputVersion", "terminalCapRatePercent", "forwardNoiConvention"];
  const saleProceedsPaths = [...saleValuePaths, "sellingCostPercent"];
  const returnTimingPaths = ["cashFlowDateConvention", "xirrConvention"];
  return [
    { key: "forwardNetOperatingIncome", label: "Forward Sale NOI", value: sale.forwardNetOperatingIncome, unit: "usd", formula: "forward twelve-month effective gross revenue less forward twelve-month operating expenses", inputPaths: rootPaths(operationPaths, ["forwardNoiConvention"]) },
    { key: "grossSaleValue", label: "Gross Sale Value", value: sale.grossSaleValue, unit: "usd", formula: "forward sale NOI divided by terminal cap rate", inputPaths: rootPaths(operationPaths, saleValuePaths) },
    { key: "sellingCosts", label: "Selling Costs", value: sale.sellingCosts, unit: "usd", formula: "gross sale value times selling cost percent", inputPaths: rootPaths(operationPaths, saleProceedsPaths) },
    { key: "netSaleProceeds", label: "Net Sale Proceeds", value: sale.netSaleProceeds, unit: "usd", formula: "gross sale value less selling costs", inputPaths: rootPaths(operationPaths, saleProceedsPaths) },
    { key: "debtPayoff", label: "Construction Debt Payoff", value: sale.debtPayoff, unit: "usd", formula: "construction debt repayment in the sale month", inputPaths: rootPaths(costPaths, operationPaths, capitalPaths) },
    { key: "equitySaleProceeds", label: "Equity Sale Proceeds", value: sale.equitySaleProceeds, unit: "usd", formula: "net sale proceeds less construction debt payoff", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "unleveredXirr", label: "Unlevered XIRR", value: returns.unlevered.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly unlevered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, returnTimingPaths) },
    { key: "unleveredEquityMultiple", label: "Unlevered Equity Multiple", value: returns.unlevered.equityMultiple, unit: "multiple", formula: "positive unlevered cash flow divided by negative unlevered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths) },
    { key: "unleveredNetProfit", label: "Unlevered Net Profit", value: returns.unlevered.netProfit, unit: "usd", formula: "sum dated monthly unlevered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths) },
    { key: "leveredXirr", label: "Levered XIRR", value: returns.levered.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly levered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, returnTimingPaths, capitalPaths) },
    { key: "leveredEquityMultiple", label: "Levered Equity Multiple", value: returns.levered.equityMultiple, unit: "multiple", formula: "positive levered cash flow divided by negative levered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "leveredNetProfit", label: "Levered Net Profit", value: returns.levered.netProfit, unit: "usd", formula: "sum dated monthly levered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "yieldOnCost", label: "Sale Yield on Cost", value: yieldOnCost, unit: "ratio", formula: "forward sale NOI divided by total project cost including carry", inputPaths: rootPaths(costPaths, operationPaths, ["forwardNoiConvention"], capitalPaths) },
    { key: "developmentSpread", label: "Development Spread", value: developmentSpreadBasisPoints, unit: "basis_points", formula: "sale yield on cost less terminal cap rate, in basis points", inputPaths: rootPaths(costPaths, operationPaths, saleValuePaths, capitalPaths) },
  ];
}

function rootPaths(...groups: string[][]) {
  return [...new Set(groups.flat())];
}

function checkUsd(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

function checkMetric(id: string, label: string, expected: number, actual: number, tolerance: number, unit: ReconciliationCheck["unit"]): ReconciliationCheck {
  const difference = actual - expected;
  return { id, label, expected, actual, difference, tolerance, status: Math.abs(difference) <= tolerance ? "pass" : "fail", unit };
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
  return dollars(months.reduce((total, month) => total + cents(month[key]), 0));
}

function xirrIssue(path: string, status: Exclude<XirrResult["status"], "ok">): PropertyReturnsIssue {
  return status === "no_root"
    ? { path, code: "xirr_no_root", message: `${labelFor(path)} requires at least one positive and one negative dated cash flow.` }
    : { path, code: "xirr_convergence", message: `${labelFor(path)} could not meet the scale-aware XNPV residual tolerance.` };
}

function equityMultiple(cashFlowCents: number[]) {
  const positive = cashFlowCents.reduce((total, value) => total + Math.max(value, 0), 0);
  const negative = cashFlowCents.reduce((total, value) => total + Math.min(value, 0), 0);
  return positive / -negative;
}

function yearsFrom(firstDate: string, date: string) {
  return (Date.parse(`${date}T00:00:00.000Z`) - Date.parse(`${firstDate}T00:00:00.000Z`)) / 86_400_000 / 365;
}

function validUsd(value: number, allowNegative: boolean) {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) return false;
  const valueCents = Math.round(value * 100);
  return Number.isSafeInteger(valueCents) && Math.abs(value - valueCents / 100) <= 1e-9;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(valueCents: number) {
  return valueCents / 100;
}

function percentOf(valueCents: number, percent: number) {
  return Math.round(valueCents * percent / 100);
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
