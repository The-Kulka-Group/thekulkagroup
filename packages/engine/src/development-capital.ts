import {
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type ApartmentOperationsIssue,
  type ApartmentOperationsResult,
} from "./apartment-operations";
import type { ReconciliationCheck } from "./monthly-cost-schedule";

export const DEVELOPMENT_CAPITAL_INPUT_VERSION = "development_capital_inputs.v1" as const;
export const DEVELOPMENT_CAPITAL_FORMULA_VERSION = "underwriting.development_capital.v2" as const;
export const DEVELOPMENT_CAPITAL_V1_FORMULA_VERSION = "underwriting.development_capital.v1" as const;
export const EQUITY_FIRST_FUNDING_VERSION = "equity_first.v1" as const;
export const CAPITALIZED_NET_OPERATING_CASH_VERSION = "capitalized_net_operating_cash.v1" as const;
export const OPENING_BALANCE_MONTHLY_VERSION = "opening_balance_monthly.v1" as const;
export const MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH = 500;
export const MAX_RATE_CURVE_AGE_MONTHS = 6;

type ReviewState = "working" | "done";

export const DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS = [
  "targetDebtSharePercent",
  "annualInterestRatePercent",
  "loanFeePercent",
  "fundingOrder",
  "interestTreatment",
  "interestConvention",
  "feeMonth",
  "payoffMonth",
] as const;

export type DevelopmentCapitalAssumptionKey = typeof DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS[number];

export type DevelopmentCapitalEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export type DevelopmentCapitalRatePoint = {
  month: string;
  baseRatePercent: number;
};

/**
 * A monthly base rate curve plus a spread. The spread may be negative. While a path is set it
 * replaces annualInterestRatePercent for interest; that field stays as the fixed-rate default.
 */
export type DevelopmentCapitalRatePath = {
  baseRates: DevelopmentCapitalRatePoint[];
  spreadPercent: number;
  curveSourceLabel: string;
  asOfDate: string;
};

export type DevelopmentCapitalPlan = {
  capitalInputVersion: typeof DEVELOPMENT_CAPITAL_INPUT_VERSION;
  targetDebtSharePercent: number;
  annualInterestRatePercent: number;
  loanFeePercent: number;
  fundingOrder: typeof EQUITY_FIRST_FUNDING_VERSION;
  interestTreatment: typeof CAPITALIZED_NET_OPERATING_CASH_VERSION;
  interestConvention: typeof OPENING_BALANCE_MONTHLY_VERSION;
  feeMonth: string;
  payoffMonth: string;
  ratePath?: DevelopmentCapitalRatePath;
  capitalAssumptionEvidence: Record<DevelopmentCapitalAssumptionKey, DevelopmentCapitalEvidence>;
};

export type DevelopmentCapitalInputs = ApartmentOperationsInputs & DevelopmentCapitalPlan;

export type MonthlyDevelopmentCashFlow = {
  month: string;
  projectCosts: number;
  operatingCashFlow: number;
};

export type DevelopmentCapitalIssueCode =
  | "unsupported_input_version"
  | "invalid_percent"
  | "invalid_amount"
  | "invalid_month"
  | "non_contiguous_months"
  | "outside_timeline"
  | "payoff_before_last_use"
  | "payoff_before_final_month"
  | "unsupported_funding_order"
  | "unsupported_interest_treatment"
  | "unsupported_interest_convention"
  | "missing_evidence"
  | "invalid_source_date"
  | "invalid_source_label"
  | "invalid_review_state"
  | "text_too_long"
  | "derived_results"
  | "funding_solution"
  | "invalid_rate_path"
  | "stale_rate_curve";

export type DevelopmentCapitalIssue = {
  path: string;
  code: DevelopmentCapitalIssueCode;
  message: string;
};

export type RateSource = "fixed" | "curve" | "before_curve" | "after_curve";

export type MonthlyDevelopmentCapital = MonthlyDevelopmentCashFlow & {
  annualRatePercent: number;
  baseRatePercent: number | null;
  rateSource: RateSource;
  openingDebtBalance: number;
  operatingShortfall: number;
  loanFee: number;
  grossInterest: number;
  operatingCashAppliedToInterest: number;
  capitalizedInterest: number;
  equityContribution: number;
  debtBeforeReservesDraw: number;
  interestReserveDraw: number;
  operatingShortfallReserveDraw: number;
  totalDebtDraw: number;
  totalSources: number;
  totalUses: number;
  repayment: number;
  closingDebtBalance: number;
};

export type DevelopmentCapitalTotals = {
  projectCosts: number;
  loanFees: number;
  operatingShortfall: number;
  grossInterest: number;
  operatingCashAppliedToInterest: number;
  capitalizedInterest: number;
  equity: number;
  debtBeforeReserves: number;
  interestReserve: number;
  operatingShortfallReserve: number;
  totalDebt: number;
  totalSources: number;
  totalUses: number;
  debtSharePercent: number;
};

export type CapitalFormulaTrace = {
  key: keyof DevelopmentCapitalTotals | "operatingCashFlow" | "repayment" | "monthlyDebtRollForward";
  label: string;
  formula: string;
  inputPaths: string[];
};

export type RateScheduleTrace = {
  curveSourceLabel: string;
  asOfDate: string;
  spreadPercent: number;
  curveFirstMonth: string;
  curveLastMonth: string;
  firstBaseRatePercent: number;
  lastBaseRatePercent: number;
  monthsBeforeCurve: number;
  monthsAfterCurve: number;
};

export type DevelopmentCapitalResult = {
  months: MonthlyDevelopmentCapital[];
  rateSchedule: RateScheduleTrace | null;
  totals: DevelopmentCapitalTotals;
  formulaTraces: CapitalFormulaTrace[];
  reconciliations: ReconciliationCheck[];
};

export type MonthlyCapitalRun = {
  formulaVersion: typeof DEVELOPMENT_CAPITAL_FORMULA_VERSION;
  inputSnapshot: { monthlyCashFlow: MonthlyDevelopmentCashFlow[]; plan: DevelopmentCapitalPlan };
  status: "complete" | "failed";
  issues: DevelopmentCapitalIssue[];
  result: DevelopmentCapitalResult | null;
  reconciliations: ReconciliationCheck[];
};

export type DevelopmentCapitalRun = {
  formulaVersion: typeof DEVELOPMENT_CAPITAL_FORMULA_VERSION;
  inputSnapshot: DevelopmentCapitalInputs;
  status: "complete" | "failed";
  issues: Array<ApartmentOperationsIssue | DevelopmentCapitalIssue>;
  result: { apartmentOperations: ApartmentOperationsResult; capital: DevelopmentCapitalResult } | null;
  reconciliations: ReconciliationCheck[];
};

export function computeDevelopmentCapital(input: DevelopmentCapitalInputs): DevelopmentCapitalRun {
  const inputSnapshot = structuredClone(input);
  const operationsRun = computeApartmentOperations(inputSnapshot);
  if (operationsRun.status === "failed" || !operationsRun.result) {
    return {
      formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
      inputSnapshot,
      status: "failed",
      issues: operationsRun.issues,
      result: null,
      reconciliations: [],
    };
  }
  const monthlyCashFlow = operationsRun.result.months.map((month) => ({
    month: month.month,
    projectCosts: month.totalUses,
    operatingCashFlow: month.operatingCashFlow,
  }));
  const capitalRun = fundMonthlyDevelopmentCashFlow(monthlyCashFlow, planFrom(inputSnapshot));
  if (capitalRun.status === "failed" || !capitalRun.result) {
    return {
      formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
      inputSnapshot,
      status: "failed",
      issues: capitalRun.issues,
      result: null,
      reconciliations: [],
    };
  }
  return {
    formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result: {
      apartmentOperations: operationsRun.result,
      capital: capitalRun.result,
    },
    reconciliations: [...operationsRun.reconciliations, ...capitalRun.reconciliations],
  };
}

export function fundMonthlyDevelopmentCashFlow(
  submittedCashFlow: MonthlyDevelopmentCashFlow[],
  submittedPlan: DevelopmentCapitalPlan,
): MonthlyCapitalRun {
  const monthlyCashFlow = structuredClone(submittedCashFlow);
  const plan = structuredClone(submittedPlan);
  const inputSnapshot = { monthlyCashFlow, plan };
  const issues = validate(monthlyCashFlow, plan);
  if (issues.length > 0) return failed(inputSnapshot, issues);

  const loanFeeCents = percentOf(
    monthlyCashFlow.reduce((sum, month) => sum + cents(month.projectCosts), 0),
    plan.targetDebtSharePercent * plan.loanFeePercent / 100,
  );
  const equityCents = solveEquityCommitment(monthlyCashFlow, plan, loanFeeCents);
  if (equityCents === null) {
    return failed(inputSnapshot, [{
      path: "targetDebtSharePercent",
      code: "funding_solution",
      message: "The equity and debt funding target did not settle to a cent within the formula limit.",
    }]);
  }
  const calculated = simulate(monthlyCashFlow, plan, loanFeeCents, equityCents);
  const totals = totalsFor(calculated.months);
  const reconciliations = reconciliationsFor(calculated.months, totals, plan);
  if (!numbersAreSafe(calculated.months, totals) || reconciliations.some(({ status }) => status === "fail")) {
    return failed(inputSnapshot, [{
      path: "capital",
      code: "derived_results",
      message: "The monthly capital schedule did not reconcile within one cent.",
    }]);
  }
  const result = {
    months: calculated.months,
    rateSchedule: rateScheduleTrace(plan, calculated.months),
    totals,
    formulaTraces: formulaTraces(plan),
    reconciliations,
  };
  return {
    formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result,
    reconciliations,
  };
}

function validate(months: MonthlyDevelopmentCashFlow[], plan: DevelopmentCapitalPlan) {
  const issues: DevelopmentCapitalIssue[] = [];
  if (!Array.isArray(months) || months.length === 0) {
    addIssue(issues, "monthlyCashFlow", "invalid_amount", "Add at least one monthly development cash-flow row.");
    return issues;
  }
  const seen = new Set<string>();
  let priorMonth: number | null = null;
  months.forEach((month, index) => {
    const path = `monthlyCashFlow.${index}`;
    const current = monthIndex(month.month);
    if (current === null) addIssue(issues, `${path}.month`, "invalid_month", "Month must use YYYY-MM.");
    if (current !== null && (seen.has(month.month) || (priorMonth !== null && current !== priorMonth + 1))) {
      addIssue(issues, `${path}.month`, "non_contiguous_months", "Monthly cash-flow rows must be unique and contiguous.");
    }
    seen.add(month.month);
    priorMonth = current;
    validateMoney(issues, `${path}.projectCosts`, month.projectCosts, false);
    validateMoney(issues, `${path}.operatingCashFlow`, month.operatingCashFlow, true);
  });
  if (plan.capitalInputVersion !== DEVELOPMENT_CAPITAL_INPUT_VERSION) {
    addIssue(issues, "capitalInputVersion", "unsupported_input_version", `Use ${DEVELOPMENT_CAPITAL_INPUT_VERSION}.`);
  }
  validatePercent(issues, "targetDebtSharePercent", plan.targetDebtSharePercent);
  validatePercent(issues, "annualInterestRatePercent", plan.annualInterestRatePercent);
  validatePercent(issues, "loanFeePercent", plan.loanFeePercent);
  if (plan.ratePath !== undefined) validateRatePath(issues, plan.ratePath, plan.feeMonth);
  if (plan.fundingOrder !== EQUITY_FIRST_FUNDING_VERSION) {
    addIssue(issues, "fundingOrder", "unsupported_funding_order", `Use ${EQUITY_FIRST_FUNDING_VERSION} for this formula version.`);
  }
  if (plan.interestTreatment !== CAPITALIZED_NET_OPERATING_CASH_VERSION) {
    addIssue(issues, "interestTreatment", "unsupported_interest_treatment", `Use ${CAPITALIZED_NET_OPERATING_CASH_VERSION} for this formula version.`);
  }
  if (plan.interestConvention !== OPENING_BALANCE_MONTHLY_VERSION) {
    addIssue(issues, "interestConvention", "unsupported_interest_convention", `Use ${OPENING_BALANCE_MONTHLY_VERSION} for this formula version.`);
  }
  const first = monthIndex(months[0].month);
  const last = monthIndex(months[months.length - 1].month);
  for (const key of ["feeMonth", "payoffMonth"] as const) {
    const value = monthIndex(plan[key]);
    if (value === null) addIssue(issues, key, "invalid_month", `${labelFor(key)} must use YYYY-MM.`);
    else if (first !== null && last !== null && (value < first || value > last)) {
      addIssue(issues, key, "outside_timeline", `${labelFor(key)} must stay within the model timeline.`);
    }
  }
  const payoffIndex = monthIndex(plan.payoffMonth);
  if (payoffIndex !== null) {
    if (last !== null && payoffIndex < last) {
      addIssue(issues, "payoffMonth", "payoff_before_final_month", "Debt payoff must occur in the final model month until a named payoff source is available.");
    }
    const lastRequiredUse = [...months].reverse().find((month) => month.projectCosts > 0 || month.operatingCashFlow < 0);
    const lastRequiredUseIndex = lastRequiredUse ? monthIndex(lastRequiredUse.month) : null;
    const feeIndex = plan.loanFeePercent > 0 ? monthIndex(plan.feeMonth) : null;
    const lastDrawIndex = Math.max(lastRequiredUseIndex ?? Number.NEGATIVE_INFINITY, feeIndex ?? Number.NEGATIVE_INFINITY);
    if (payoffIndex < lastDrawIndex) {
      addIssue(issues, "payoffMonth", "payoff_before_last_use", "Debt payoff cannot occur before the last project cost, loan fee, or operating shortfall.");
    }
  }
  validateEvidence(issues, plan.capitalAssumptionEvidence);
  return issues;
}

function validateRatePath(issues: DevelopmentCapitalIssue[], path: DevelopmentCapitalRatePath, loanCloseMonth: string) {
  const at = (suffix: string) => `ratePath.${suffix}`;
  if (!path || typeof path !== "object" || Array.isArray(path)) {
    addIssue(issues, "ratePath", "invalid_rate_path", "Rate path must be an object with base rates, a spread, a source label, and an as-of date.");
    return;
  }
  const spread = path.spreadPercent;
  const spreadOk = typeof spread === "number" && Number.isFinite(spread) && spread >= -100 && spread <= 100;
  if (!spreadOk) addIssue(issues, at("spreadPercent"), "invalid_percent", "Spread must be a number from -100 to 100 percent.");
  if (typeof path.curveSourceLabel !== "string" || path.curveSourceLabel.trim() === "") {
    addIssue(issues, at("curveSourceLabel"), "invalid_source_label", "Name the curve source, for example the forward SOFR curve and its provider.");
  } else if (path.curveSourceLabel.length > MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH) {
    addIssue(issues, at("curveSourceLabel"), "text_too_long", `Curve source label cannot exceed ${MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH} characters.`);
  }
  if (typeof path.asOfDate !== "string" || !validDate(path.asOfDate)) {
    addIssue(issues, at("asOfDate"), "invalid_source_date", "Curve as-of date must be a valid YYYY-MM-DD date.");
  } else {
    const close = monthIndex(loanCloseMonth);
    const asOf = monthIndex(path.asOfDate.slice(0, 7));
    if (close !== null && asOf !== null && Math.abs(close - asOf) > MAX_RATE_CURVE_AGE_MONTHS) {
      addIssue(
        issues,
        at("asOfDate"),
        "stale_rate_curve",
        `The curve as-of date is more than ${MAX_RATE_CURVE_AGE_MONTHS} months from the fee month, when the loan is priced. Refresh the curve or move the fee month.`,
      );
    }
  }
  if (!Array.isArray(path.baseRates) || path.baseRates.length === 0) {
    addIssue(issues, at("baseRates"), "invalid_rate_path", "Add at least one monthly base rate.");
    return;
  }
  let prior: number | null = null;
  path.baseRates.forEach((point, index) => {
    const pointPath = at(`baseRates.${index}`);
    const current = monthIndex(point?.month);
    if (current === null) addIssue(issues, `${pointPath}.month`, "invalid_month", "Month must use YYYY-MM.");
    else if (prior !== null && current !== prior + 1) {
      addIssue(issues, `${pointPath}.month`, "non_contiguous_months", "Base rate months must be unique, in order, and contiguous.");
    }
    prior = current;
    const base = point?.baseRatePercent;
    if (!(typeof base === "number" && Number.isFinite(base) && base >= 0 && base <= 100)) {
      addIssue(issues, `${pointPath}.baseRatePercent`, "invalid_percent", "Base rate must be from 0 to 100 percent.");
    } else if (spreadOk && (base + spread < 0 || base + spread > 100)) {
      addIssue(issues, `${pointPath}.baseRatePercent`, "invalid_percent", "Base rate plus spread must be from 0 to 100 percent.");
    }
  });
}

function validateEvidence(
  issues: DevelopmentCapitalIssue[],
  evidence: Record<DevelopmentCapitalAssumptionKey, DevelopmentCapitalEvidence>,
) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    addIssue(issues, "capitalAssumptionEvidence", "missing_evidence", "Add source and review details for the capital assumptions.");
    return;
  }
  for (const key of DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS) {
    const item = evidence[key];
    const path = `capitalAssumptionEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      addIssue(issues, path, "missing_evidence", `${labelFor(key)} needs source and review details.`);
      continue;
    }
    if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") {
      addIssue(issues, `${path}.sourceLabel`, "invalid_source_label", "Source label must be text.");
    } else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH) {
      addIssue(issues, `${path}.sourceLabel`, "text_too_long", `Source label cannot exceed ${MAX_DEVELOPMENT_CAPITAL_SOURCE_LABEL_LENGTH} characters.`);
    }
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) {
      addIssue(issues, `${path}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
    }
    if (item.reviewState !== "working" && item.reviewState !== "done") {
      addIssue(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on It or Done.");
    }
  }
}

function solveEquityCommitment(
  months: MonthlyDevelopmentCashFlow[],
  plan: DevelopmentCapitalPlan,
  loanFeeCents: number,
) {
  const baseCents = months.reduce(
    (sum, month) => sum + cents(month.projectCosts) + Math.max(-cents(month.operatingCashFlow), 0),
    loanFeeCents,
  );
  let equityCents = baseCents - percentOf(baseCents, plan.targetDebtSharePercent);
  const seen = new Set<number>();
  for (let iteration = 0; iteration < 200; iteration += 1) {
    if (seen.has(equityCents)) return null;
    seen.add(equityCents);
    const simulation = simulate(months, plan, loanFeeCents, equityCents);
    const totalUsesCents = simulation.months.reduce((sum, month) => sum + cents(month.totalUses), 0);
    const nextEquityCents = totalUsesCents - percentOf(totalUsesCents, plan.targetDebtSharePercent);
    if (Math.abs(nextEquityCents - equityCents) <= 1) return equityCents;
    equityCents = nextEquityCents;
  }
  return null;
}

function simulate(
  months: MonthlyDevelopmentCashFlow[],
  plan: DevelopmentCapitalPlan,
  loanFeeCents: number,
  equityCommitmentCents: number,
) {
  let remainingEquityCents = equityCommitmentCents;
  let openingDebtCents = 0;
  const rows: MonthlyDevelopmentCapital[] = [];
  for (const month of months) {
    const projectCostCents = cents(month.projectCosts);
    const operatingCashFlowCents = cents(month.operatingCashFlow);
    const operatingShortfallCents = Math.max(-operatingCashFlowCents, 0);
    const currentLoanFeeCents = month.month === plan.feeMonth ? loanFeeCents : 0;
    const rate = rateFor(plan, month.month);
    const grossInterestCents = percentOf(openingDebtCents, rate.annualRatePercent / 12);
    const operatingCashAppliedCents = Math.min(Math.max(operatingCashFlowCents, 0), grossInterestCents);
    const capitalizedInterestCents = grossInterestCents - operatingCashAppliedCents;

    const projectAndFeeCents = projectCostCents + currentLoanFeeCents;
    const projectEquityCents = Math.min(remainingEquityCents, projectAndFeeCents);
    remainingEquityCents -= projectEquityCents;
    const debtBeforeReservesCents = projectAndFeeCents - projectEquityCents;
    const shortfallEquityCents = Math.min(remainingEquityCents, operatingShortfallCents);
    remainingEquityCents -= shortfallEquityCents;
    const shortfallReserveCents = operatingShortfallCents - shortfallEquityCents;
    const interestEquityCents = Math.min(remainingEquityCents, capitalizedInterestCents);
    remainingEquityCents -= interestEquityCents;
    const interestReserveCents = capitalizedInterestCents - interestEquityCents;
    const equityContributionCents = projectEquityCents + shortfallEquityCents + interestEquityCents;
    const totalDebtDrawCents = debtBeforeReservesCents + shortfallReserveCents + interestReserveCents;
    const beforeRepaymentCents = openingDebtCents + totalDebtDrawCents;
    const repaymentCents = month.month === plan.payoffMonth ? beforeRepaymentCents : 0;
    const closingDebtCents = beforeRepaymentCents - repaymentCents;
    const totalUsesCents = projectAndFeeCents + operatingShortfallCents + capitalizedInterestCents;
    const totalSourcesCents = equityContributionCents + totalDebtDrawCents;

    rows.push({
      month: month.month,
      projectCosts: dollars(projectCostCents),
      operatingCashFlow: dollars(operatingCashFlowCents),
      annualRatePercent: rate.annualRatePercent,
      baseRatePercent: rate.baseRatePercent,
      rateSource: rate.rateSource,
      openingDebtBalance: dollars(openingDebtCents),
      operatingShortfall: dollars(operatingShortfallCents),
      loanFee: dollars(currentLoanFeeCents),
      grossInterest: dollars(grossInterestCents),
      operatingCashAppliedToInterest: dollars(operatingCashAppliedCents),
      capitalizedInterest: dollars(capitalizedInterestCents),
      equityContribution: dollars(equityContributionCents),
      debtBeforeReservesDraw: dollars(debtBeforeReservesCents),
      interestReserveDraw: dollars(interestReserveCents),
      operatingShortfallReserveDraw: dollars(shortfallReserveCents),
      totalDebtDraw: dollars(totalDebtDrawCents),
      totalSources: dollars(totalSourcesCents),
      totalUses: dollars(totalUsesCents),
      repayment: dollars(repaymentCents),
      closingDebtBalance: dollars(closingDebtCents),
    });
    openingDebtCents = closingDebtCents;
  }
  return { months: rows, remainingEquityCents };
}

function totalsFor(months: MonthlyDevelopmentCapital[]): DevelopmentCapitalTotals {
  const sum = (key: keyof MonthlyDevelopmentCapital) => dollars(
    months.reduce((total, month) => total + (typeof month[key] === "number" ? cents(month[key] as number) : 0), 0),
  );
  const totalDebt = dollars(
    cents(sum("debtBeforeReservesDraw")) + cents(sum("interestReserveDraw")) + cents(sum("operatingShortfallReserveDraw")),
  );
  const totalUses = sum("totalUses");
  return {
    projectCosts: sum("projectCosts"),
    loanFees: sum("loanFee"),
    operatingShortfall: sum("operatingShortfall"),
    grossInterest: sum("grossInterest"),
    operatingCashAppliedToInterest: sum("operatingCashAppliedToInterest"),
    capitalizedInterest: sum("capitalizedInterest"),
    equity: sum("equityContribution"),
    debtBeforeReserves: sum("debtBeforeReservesDraw"),
    interestReserve: sum("interestReserveDraw"),
    operatingShortfallReserve: sum("operatingShortfallReserveDraw"),
    totalDebt,
    totalSources: sum("totalSources"),
    totalUses,
    debtSharePercent: totalUses === 0 ? 0 : totalDebt / totalUses * 100,
  };
}

function reconciliationsFor(
  months: MonthlyDevelopmentCapital[],
  totals: DevelopmentCapitalTotals,
  plan: DevelopmentCapitalPlan,
) {
  const checks = months.flatMap((month) => [
    check(`sources-uses:${month.month}`, `${month.month} sources equal uses`, month.totalUses, month.totalSources),
    check(
      `debt-roll-forward:${month.month}`,
      `${month.month} debt opening plus draws less repayment equals closing`,
      month.closingDebtBalance,
      money(month.openingDebtBalance, month.totalDebtDraw, -month.repayment),
    ),
    check(
      `expected-interest:${month.month}`,
      `${month.month} interest equals opening debt times the monthly interest rate`,
      dollars(percentOf(cents(month.openingDebtBalance), rateFor(plan, month.month).annualRatePercent / 12)),
      month.grossInterest,
    ),
    check(
      `operating-cash-offset:${month.month}`,
      `${month.month} operating cash applied equals the lesser of positive operating cash flow or interest`,
      dollars(Math.min(Math.max(cents(month.operatingCashFlow), 0), cents(month.grossInterest))),
      month.operatingCashAppliedToInterest,
    ),
  ]);
  return [
    ...checks,
    check("total-sources-uses", "Total sources equal total uses", totals.totalUses, totals.totalSources),
    check(
      "debt-components",
      "Total debt equals debt before reserves plus interest and operating shortfall reserves",
      totals.totalDebt,
      money(totals.debtBeforeReserves, totals.interestReserve, totals.operatingShortfallReserve),
    ),
    check(
      "target-debt-share",
      "Total debt equals the target share of total uses",
      dollars(percentOf(cents(totals.totalUses), plan.targetDebtSharePercent)),
      totals.totalDebt,
    ),
    check("debt-paid-off", "Closing construction debt equals zero after the payoff month", 0, months.at(-1)?.closingDebtBalance ?? 0),
  ];
}

function formulaTraces(plan: DevelopmentCapitalPlan): CapitalFormulaTrace[] {
  const ratePath = plan.ratePath !== undefined ? ["ratePath"] : [];
  const operatingCashFlowInputs = [
    "analysisStartMonth",
    "saleMonth",
    "operationStartMonth",
    "growthStartMonth",
    "preleasedUnits",
    "leaseUpUnitsPerMonth",
    "annualIncomeGrowthPercent",
    "annualExpenseGrowthPercent",
    "rentAdjustmentLossPercent",
    "freeRentPercent",
    "vacancyPercent",
    "creditLossPercent",
    "residentialUnitTypes",
    "otherIncomeLines",
    "operatingExpenseLines",
    "capitalExpenditureLines",
  ] satisfies Array<keyof DevelopmentCapitalInputs>;
  return [
    { key: "projectCosts", label: "Project Costs", formula: "the displayed monthly cost schedule carried into the capital schedule", inputPaths: ["analysisStartMonth", "saleMonth", "costLines"] },
    { key: "operatingCashFlow", label: "Operating Cash Flow", formula: "the displayed monthly apartment operating cash flow carried into the capital schedule", inputPaths: [...operatingCashFlowInputs] },
    { key: "operatingShortfall", label: "Operating Shortfall", formula: "the amount by which monthly operating cash flow is below zero", inputPaths: [...operatingCashFlowInputs] },
    { key: "equity", label: "Equity", formula: "equity funds monthly uses first until the target debt share of total uses is reached", inputPaths: ["targetDebtSharePercent", "fundingOrder"] },
    { key: "debtBeforeReserves", label: "Debt Before Reserves", formula: "project costs and loan fees not funded by equity", inputPaths: ["targetDebtSharePercent", "loanFeePercent", "feeMonth", "fundingOrder"] },
    { key: "grossInterest", label: "Gross Interest", formula: "opening monthly debt balance times the month's annual rate divided by twelve; the rate is the fixed annual rate, or with a rate path the month's base rate plus the spread, using the first base rate before the curve starts and the last base rate after it ends", inputPaths: ["annualInterestRatePercent", ...ratePath, "interestConvention"] },
    { key: "operatingCashAppliedToInterest", label: "Operating Cash Applied to Interest", formula: "the lesser of positive monthly operating cash flow or gross interest", inputPaths: ["interestTreatment", ...operatingCashFlowInputs] },
    { key: "capitalizedInterest", label: "Capitalized Interest", formula: "gross monthly interest less positive operating cash applied to interest", inputPaths: ["annualInterestRatePercent", ...ratePath, "interestConvention", "interestTreatment", ...operatingCashFlowInputs] },
    { key: "interestReserve", label: "Interest Reserve", formula: "gross interest less positive operating cash applied to interest after equity has funded its target amount", inputPaths: ["annualInterestRatePercent", ...ratePath, "interestTreatment", "fundingOrder"] },
    { key: "operatingShortfallReserve", label: "Operating Shortfall Reserve", formula: "negative operating cash flow funded after equity under the equity-first rule and kept separate from project costs", inputPaths: ["fundingOrder", ...operatingCashFlowInputs] },
    { key: "loanFees", label: "Loan Fees", formula: "project costs times target debt share times loan fee percent in the entered fee month", inputPaths: ["targetDebtSharePercent", "loanFeePercent", "feeMonth"] },
    { key: "totalDebt", label: "Total Debt", formula: "debt before reserves plus interest reserve and operating shortfall reserve draws", inputPaths: ["targetDebtSharePercent", "fundingOrder", "annualInterestRatePercent", ...ratePath, "loanFeePercent", "costLines", ...operatingCashFlowInputs] },
    { key: "totalSources", label: "Total Sources", formula: "equity contributions plus all debt draws", inputPaths: ["targetDebtSharePercent", "fundingOrder"] },
    { key: "totalUses", label: "Total Uses", formula: "project costs plus loan fees, operating shortfalls, and capitalized interest", inputPaths: ["costLines", "loanFeePercent", "annualInterestRatePercent", ...ratePath, ...operatingCashFlowInputs] },
    { key: "debtSharePercent", label: "Debt Share", formula: "total debt divided by total uses", inputPaths: ["targetDebtSharePercent", "fundingOrder"] },
    { key: "repayment", label: "Debt Repayment", formula: "the full opening debt plus current debt draws repaid in the final entered payoff month", inputPaths: ["payoffMonth"] },
    { key: "monthlyDebtRollForward", label: "Monthly Debt Roll-Forward", formula: "opening debt plus debt draws and reserves less payoff equals closing debt", inputPaths: ["payoffMonth", "fundingOrder", "interestTreatment", "interestConvention"] },
  ];
}

function planFrom(input: DevelopmentCapitalInputs): DevelopmentCapitalPlan {
  return {
    capitalInputVersion: input.capitalInputVersion,
    targetDebtSharePercent: input.targetDebtSharePercent,
    annualInterestRatePercent: input.annualInterestRatePercent,
    loanFeePercent: input.loanFeePercent,
    fundingOrder: input.fundingOrder,
    interestTreatment: input.interestTreatment,
    interestConvention: input.interestConvention,
    feeMonth: input.feeMonth,
    payoffMonth: input.payoffMonth,
    ...(input.ratePath !== undefined ? { ratePath: structuredClone(input.ratePath) } : {}),
    capitalAssumptionEvidence: structuredClone(input.capitalAssumptionEvidence),
  };
}

function rateFor(plan: DevelopmentCapitalPlan, month: string): { annualRatePercent: number; baseRatePercent: number | null; rateSource: RateSource } {
  const path = plan.ratePath;
  if (!path) return { annualRatePercent: plan.annualInterestRatePercent, baseRatePercent: null, rateSource: "fixed" };
  const first = path.baseRates[0];
  const last = path.baseRates[path.baseRates.length - 1];
  const index = monthIndex(month)!;
  const firstIndex = monthIndex(first.month)!;
  const lastIndex = monthIndex(last.month)!;
  const [point, rateSource]: [DevelopmentCapitalRatePoint, RateSource] = index < firstIndex
    ? [first, "before_curve"]
    : index > lastIndex
      ? [last, "after_curve"]
      : [path.baseRates[index - firstIndex], "curve"];
  return {
    annualRatePercent: Math.round((point.baseRatePercent + path.spreadPercent) * 1e8) / 1e8,
    baseRatePercent: point.baseRatePercent,
    rateSource,
  };
}

function rateScheduleTrace(plan: DevelopmentCapitalPlan, months: MonthlyDevelopmentCapital[]): RateScheduleTrace | null {
  const path = plan.ratePath;
  if (!path) return null;
  return {
    curveSourceLabel: path.curveSourceLabel,
    asOfDate: path.asOfDate,
    spreadPercent: path.spreadPercent,
    curveFirstMonth: path.baseRates[0].month,
    curveLastMonth: path.baseRates[path.baseRates.length - 1].month,
    firstBaseRatePercent: path.baseRates[0].baseRatePercent,
    lastBaseRatePercent: path.baseRates[path.baseRates.length - 1].baseRatePercent,
    monthsBeforeCurve: months.filter(({ rateSource }) => rateSource === "before_curve").length,
    monthsAfterCurve: months.filter(({ rateSource }) => rateSource === "after_curve").length,
  };
}

function validatePercent(issues: DevelopmentCapitalIssue[], path: string, value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    addIssue(issues, path, "invalid_percent", `${labelFor(path)} must be from 0 to 100 percent.`);
  }
}

function validateMoney(issues: DevelopmentCapitalIssue[], path: string, value: number, signed: boolean) {
  const valueCents = Math.round(value * 100);
  if (!Number.isFinite(value) || (!signed && value < 0) || !Number.isSafeInteger(valueCents) || Math.abs(value - valueCents / 100) > 1e-9) {
    addIssue(issues, path, "invalid_amount", `${labelFor(path)} must be ${signed ? "a" : "zero or a positive"} USD amount with no more than two decimal places.`);
  }
}

function check(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

function money(...values: number[]) {
  return dollars(values.reduce((sum, value) => sum + cents(value), 0));
}

function numbersAreSafe(months: MonthlyDevelopmentCapital[], totals: DevelopmentCapitalTotals) {
  return months.every((month) => Object.values(month).every((value) => typeof value !== "number" || (Number.isFinite(value) && Number.isSafeInteger(cents(value)))))
    && Object.values(totals).every((value) => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)));
}

function monthIndex(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function percentOf(valueCents: number, percent: number) {
  return Math.round(valueCents * percent / 100);
}

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(valueCents: number) {
  return valueCents / 100;
}

function labelFor(path: string) {
  return path.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
}

function addIssue(issues: DevelopmentCapitalIssue[], path: string, code: DevelopmentCapitalIssueCode, message: string) {
  issues.push({ path, code, message });
}

function failed(
  inputSnapshot: MonthlyCapitalRun["inputSnapshot"],
  issues: DevelopmentCapitalIssue[],
): MonthlyCapitalRun {
  return {
    formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
    inputSnapshot,
    status: "failed",
    issues,
    result: null,
    reconciliations: [],
  };
}
