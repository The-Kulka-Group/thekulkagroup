import {
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type ApartmentOperationsIssue,
  type ApartmentOperationsResult,
} from "./apartment-operations";
import type { MonthlyCostLine, MonthlyCostScheduleResult, ReconciliationCheck } from "./monthly-cost-schedule";
import {
  scheduleOtherSources,
  validateOtherFunding,
  type CreditedLandPlan,
  type OtherFundingSource,
  type OtherSourceIssueCode,
  type OtherSourceKind,
  type OtherSourceScheduleCents,
} from "./other-sources";

export const DEVELOPMENT_CAPITAL_INPUT_VERSION = "development_capital_inputs.v1" as const;
/**
 * v2 adds the dated rate path (LA-1691). v3 adds grants, soft loans and credited land, a sources and
 * uses summary, and the totals and months that carry them (LA-1813). Runs saved under v1 and v2 stay readable.
 */
export const DEVELOPMENT_CAPITAL_FORMULA_VERSION = "underwriting.development_capital.v3" as const;
export const DEVELOPMENT_CAPITAL_V2_FORMULA_VERSION = "underwriting.development_capital.v2" as const;
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
  /** Grants and soft loans, each with its own draw timing. They fund uses before equity and debt. */
  otherSources?: OtherFundingSource[];
  /** Land value the deal credits apart from cash land cost. */
  creditedLand?: CreditedLandPlan;
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
  | "stale_rate_curve"
  | "other_sources_exceed_equity_need"
  | "other_sources_unused"
  | "percent_total_unsettled"
  | OtherSourceIssueCode;

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
  /** Grant cash that arrives this month. */
  grantDraw: number;
  /** Soft loan cash that arrives this month. */
  softLoanDraw: number;
  /** Grant and soft loan cash applied to this month's uses. */
  otherSourcesApplied: number;
  /** Grant and soft loan cash that has arrived and is not yet applied. */
  otherSourcesCashBalance: number;
  softLoanInterest: number;
  softLoanRepayment: number;
  softLoanBalance: number;
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
  grants: number;
  softLoans: number;
  otherSourcesApplied: number;
  softLoanInterest: number;
  softLoanRepayment: number;
  /** Land cost lines in the cost schedule, paid in cash. */
  landCashCost: number;
  /** Credited land value less cash land cost. Null when the case has no credited land. */
  creditedLandStepUp: number | null;
  /** The step-up when the deal counts credited land as sponsor equity, otherwise zero. */
  creditedLandEquity: number;
  /** Cash equity plus credited land counted as equity. */
  sponsorEquity: number;
};

export type OtherSourceResult = {
  id: string;
  name: string;
  kind: OtherSourceKind;
  drawn: number;
  /** Cash from this source applied to uses. Matches drawn when the source ties to sources and uses. */
  applied: number;
  accruedInterest: number;
  repaid: number;
  closingBalance: number;
};

export type CreditedLandResult = {
  cashLandCost: number;
  creditedValue: number;
  stepUp: number;
  countsAsSponsorEquity: boolean;
};

export type SourcesAndUsesLine = {
  key: string;
  label: string;
  amount: number;
};

export type SourcesAndUsesBasis = {
  sources: SourcesAndUsesLine[];
  uses: SourcesAndUsesLine[];
  totalSources: number;
  totalUses: number;
};

export type SourcesAndUses = {
  /** Land at cash cost. Every source and every use is cash. */
  cashBasis: SourcesAndUsesBasis;
  /**
   * Land at credited value. Present only when the deal counts credited land as sponsor equity, so the
   * step-up appears as a non-cash use and a non-cash equity source of the same amount.
   */
  creditedBasis: SourcesAndUsesBasis | null;
};

export type CapitalFormulaTrace = {
  key: keyof DevelopmentCapitalTotals | "operatingCashFlow" | "repayment" | "monthlyDebtRollForward" | "sourcesAndUses";
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
  otherSources: OtherSourceResult[];
  creditedLand: CreditedLandResult | null;
  sourcesAndUses: SourcesAndUses;
  totals: DevelopmentCapitalTotals;
  /** The largest total debt the lender's NOI caps allow (LA-1823); absent or null when LTC alone sizes the loan. */
  debtCeiling?: number | null;
  formulaTraces: CapitalFormulaTrace[];
  reconciliations: ReconciliationCheck[];
};

/**
 * Engine-derived limits the property returns layer passes in. `maxLoan` is the smallest NOI cap
 * on total debt; it is never a user input and never enters the input snapshot.
 */
export type DevelopmentCapitalOptions = { maxLoan?: number | null };

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

export const MAX_FINANCING_ROUNDS = 100;

export function computeDevelopmentCapital(input: DevelopmentCapitalInputs, options: DevelopmentCapitalOptions = {}): DevelopmentCapitalRun {
  const inputSnapshot = structuredClone(input);
  const failedWith = (issues: DevelopmentCapitalRun["issues"]): DevelopmentCapitalRun => ({
    formulaVersion: DEVELOPMENT_CAPITAL_FORMULA_VERSION,
    inputSnapshot,
    status: "failed",
    issues,
    result: null,
    reconciliations: [],
  });
  /*
   * LA-1822: a percent-of-total line on a total base is a share of cost that includes financing,
   * and financing depends on cost. Run the schedule with a financing guess from zero, fund it, and
   * feed the financing back until it moves by no more than a cent. With no such line one round runs.
   */
  const needsFinancing = financedPercentLines(inputSnapshot).length > 0;
  let financingCents = 0;
  for (let round = 0; round < MAX_FINANCING_ROUNDS; round += 1) {
    const operationsRun = computeApartmentOperations(inputSnapshot, { financingCost: dollars(financingCents) });
    if (operationsRun.status === "failed" || !operationsRun.result) return failedWith(operationsRun.issues);
    const monthlyCashFlow = operationsRun.result.months.map((month) => ({
      month: month.month,
      projectCosts: month.totalUses,
      operatingCashFlow: month.operatingCashFlow,
    }));
    const landCashCost = operationsRun.result.costSchedule.totalsByCategory.land;
    const capitalRun = fundMonthlyDevelopmentCashFlow(monthlyCashFlow, planFrom(inputSnapshot), landCashCost, options.maxLoan ?? null);
    if (capitalRun.status === "failed" || !capitalRun.result) return failedWith(capitalRun.issues);
    const { totals } = capitalRun.result;
    const nextFinancingCents = cents(totals.totalUses) - cents(totals.projectCosts);
    if (needsFinancing && Math.abs(nextFinancingCents - financingCents) > 1) {
      financingCents = nextFinancingCents;
      continue;
    }
    const percentChecks = percentOfTotalChecks(inputSnapshot, operationsRun.result.costSchedule, nextFinancingCents);
    if (percentChecks.some(({ status }) => status === "fail")) {
      return failedWith([{ path: "costLines", code: "percent_total_unsettled", message: "A percent-of-total line did not tie to its share of cost including financing." }]);
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
      reconciliations: [...operationsRun.reconciliations, ...capitalRun.reconciliations, ...percentChecks],
    };
  }
  return failedWith([{
    path: "costLines",
    code: "percent_total_unsettled",
    message: `Percent-of-total lines and financing did not settle to a cent within ${MAX_FINANCING_ROUNDS} rounds.`,
  }]);
}

type FinancedPercentLine = MonthlyCostLine & { basis: { type: "percent_of_total"; base: "total_cost" | "total_less_land"; percent: number } };

function financedPercentLines(input: DevelopmentCapitalInputs): FinancedPercentLine[] {
  return (input.costLines ?? []).filter((line): line is FinancedPercentLine => line?.basis?.type === "percent_of_total"
    && (line.basis.base === "total_cost" || line.basis.base === "total_less_land"));
}

/** Each percent-of-total line on a total base equals its percent of every other line in the base plus the funded financing. */
function percentOfTotalChecks(input: DevelopmentCapitalInputs, schedule: MonthlyCostScheduleResult, financingCents: number) {
  return financedPercentLines(input).map((line) => {
    const baseCents = schedule.costLineSchedules.reduce((sum, other) => (
      other.lineId !== line.id && (line.basis.base === "total_cost" || other.category !== "land") ? sum + cents(other.amount) : sum
    ), financingCents);
    const amount = schedule.costLineSchedules.find(({ lineId }) => lineId === line.id)!.amount;
    return check(
      `percent-of-total-financed:${line.id}`,
      `${line.name} equals ${line.basis.percent} percent of its base including the funded financing`,
      dollars(Math.round(baseCents * line.basis.percent / 100)),
      amount,
    );
  });
}

/**
 * `landCashCost` is the cost schedule's land total, paid in cash. It splits land from other project
 * costs in the sources and uses summary and sets the floor for credited land value.
 */
export function fundMonthlyDevelopmentCashFlow(
  submittedCashFlow: MonthlyDevelopmentCashFlow[],
  submittedPlan: DevelopmentCapitalPlan,
  landCashCost = 0,
  maxLoan: number | null = null,
): MonthlyCapitalRun {
  const monthlyCashFlow = structuredClone(submittedCashFlow);
  const plan = structuredClone(submittedPlan);
  const inputSnapshot = { monthlyCashFlow, plan };
  const issues = validate(monthlyCashFlow, plan, cents(landCashCost));
  if (issues.length > 0) return failed(inputSnapshot, issues);

  const maxLoanCents = maxLoan === null ? null : cents(maxLoan);
  const projectCostCents = monthlyCashFlow.reduce((sum, month) => sum + cents(month.projectCosts), 0);
  const committedLoanCents = percentOf(projectCostCents, plan.targetDebtSharePercent);
  // With a ceiling below the LTC commitment the fee is on the capped loan; otherwise the original single-rounding formula.
  const loanFeeCents = maxLoanCents !== null && maxLoanCents < committedLoanCents
    ? percentOf(maxLoanCents, plan.loanFeePercent)
    : percentOf(projectCostCents, plan.targetDebtSharePercent * plan.loanFeePercent / 100);
  const schedule = scheduleOtherSources(plan.otherSources ?? [], monthlyCashFlow.map(({ month }) => month));
  const solution = solveEquityCommitment(monthlyCashFlow, plan, loanFeeCents, schedule, maxLoanCents);
  if (solution.kind === "negative") {
    return failed(inputSnapshot, [{
      path: "otherSources",
      code: "other_sources_exceed_equity_need",
      message: "Grants and soft loans cover more than the share of cost left after the target debt share, so equity would be negative. Lower the other sources or the target debt share.",
    }]);
  }
  if (solution.kind === "unsettled") {
    return failed(inputSnapshot, [{
      path: "targetDebtSharePercent",
      code: "funding_solution",
      message: "The equity and debt funding target did not settle to a cent within the formula limit.",
    }]);
  }
  const calculated = simulate(monthlyCashFlow, plan, loanFeeCents, solution.cents, schedule);
  if (calculated.unusedOtherCashCents !== 0) {
    return failed(inputSnapshot, [{
      path: "otherSources",
      code: "other_sources_unused",
      message: `Grants and soft loans bring ${formatUsd(calculated.unusedOtherCashCents)} more cash than the project uses, so sources would exceed uses. Lower an amount or move a draw earlier.`,
    }]);
  }
  const totals = totalsFor(calculated.months, cents(landCashCost), plan.creditedLand);
  const otherSources = otherSourceResults(schedule, calculated.sourceAppliedCents);
  const creditedLand = creditedLandResult(plan.creditedLand, cents(landCashCost));
  const sourcesAndUses = sourcesAndUsesFor(totals, otherSources, creditedLand);
  const reconciliations = reconciliationsFor(calculated.months, totals, plan, sourcesAndUses, otherSources, maxLoanCents);
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
    otherSources,
    creditedLand,
    sourcesAndUses,
    totals,
    ...(maxLoanCents === null ? {} : { debtCeiling: dollars(maxLoanCents) }),
    formulaTraces: formulaTraces(plan, maxLoanCents !== null),
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

function validate(months: MonthlyDevelopmentCashFlow[], plan: DevelopmentCapitalPlan, landCashCostCents: number) {
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
  issues.push(...validateOtherFunding(plan.otherSources, plan.creditedLand, months[0].month, months[months.length - 1].month));
  if (
    plan.creditedLand
    && typeof plan.creditedLand.creditedValue === "number"
    && cents(plan.creditedLand.creditedValue) < landCashCostCents
  ) {
    addIssue(
      issues,
      "creditedLand.creditedValue",
      "credited_land_below_cash_cost",
      `Credited land value cannot be below the ${formatUsd(landCashCostCents)} of cash land cost in the cost schedule.`,
    );
  }
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

type EquitySolution = { kind: "solved"; cents: number } | { kind: "negative" } | { kind: "unsettled" };

function solveEquityCommitment(
  months: MonthlyDevelopmentCashFlow[],
  plan: DevelopmentCapitalPlan,
  loanFeeCents: number,
  schedule: OtherSourceScheduleCents[],
  maxLoanCents: number | null,
): EquitySolution {
  const targetDebtCents = (usesCents: number) => maxLoanCents === null
    ? percentOf(usesCents, plan.targetDebtSharePercent)
    : Math.min(percentOf(usesCents, plan.targetDebtSharePercent), maxLoanCents);
  const otherTotalCents = schedule.reduce(
    (sum, entry) => sum + entry.months.reduce((total, month) => total + month.drawCents, 0),
    0,
  );
  const baseCents = months.reduce(
    (sum, month) => sum + cents(month.projectCosts) + Math.max(-cents(month.operatingCashFlow), 0),
    loanFeeCents,
  );
  let equityCents = Math.max(baseCents - targetDebtCents(baseCents) - otherTotalCents, 0);
  const seen = new Set<number>();
  for (let iteration = 0; iteration < 200; iteration += 1) {
    if (seen.has(equityCents)) return { kind: "unsettled" };
    seen.add(equityCents);
    const simulation = simulate(months, plan, loanFeeCents, equityCents, schedule);
    const totalUsesCents = simulation.months.reduce((sum, month) => sum + cents(month.totalUses), 0);
    const nextEquityCents = totalUsesCents - targetDebtCents(totalUsesCents) - otherTotalCents;
    if (nextEquityCents < -1) {
      if (equityCents === 0) return { kind: "negative" };
      equityCents = 0;
      continue;
    }
    const next = Math.max(nextEquityCents, 0);
    if (Math.abs(next - equityCents) <= 1) return { kind: "solved", cents: equityCents };
    equityCents = next;
  }
  return { kind: "unsettled" };
}

function simulate(
  months: MonthlyDevelopmentCashFlow[],
  plan: DevelopmentCapitalPlan,
  loanFeeCents: number,
  equityCommitmentCents: number,
  schedule: OtherSourceScheduleCents[],
) {
  let remainingEquityCents = equityCommitmentCents;
  let openingDebtCents = 0;
  const sourceCashCents = schedule.map(() => 0);
  const sourceAppliedCents = schedule.map(() => 0);
  /** Takes up to `needCents` from the arrived grant and soft loan cash, in the order the sources are listed. */
  const applyOtherCash = (needCents: number) => {
    let remaining = needCents;
    sourceCashCents.forEach((available, index) => {
      const take = Math.min(available, remaining);
      sourceCashCents[index] -= take;
      sourceAppliedCents[index] += take;
      remaining -= take;
    });
    return needCents - remaining;
  };
  const rows: MonthlyDevelopmentCapital[] = [];
  months.forEach((month, position) => {
    const projectCostCents = cents(month.projectCosts);
    const operatingCashFlowCents = cents(month.operatingCashFlow);
    const operatingShortfallCents = Math.max(-operatingCashFlowCents, 0);
    const currentLoanFeeCents = month.month === plan.feeMonth ? loanFeeCents : 0;
    const rate = rateFor(plan, month.month);
    const grossInterestCents = percentOf(openingDebtCents, rate.annualRatePercent / 12);
    const operatingCashAppliedCents = Math.min(Math.max(operatingCashFlowCents, 0), grossInterestCents);
    const capitalizedInterestCents = grossInterestCents - operatingCashAppliedCents;

    let grantDrawCents = 0;
    let softLoanDrawCents = 0;
    let softLoanInterestCents = 0;
    let softLoanRepaymentCents = 0;
    let softLoanBalanceCents = 0;
    schedule.forEach((entry, index) => {
      const sourceMonth = entry.months[position];
      sourceCashCents[index] += sourceMonth.drawCents;
      if (entry.source.kind === "grant") grantDrawCents += sourceMonth.drawCents;
      else {
        softLoanDrawCents += sourceMonth.drawCents;
        softLoanInterestCents += sourceMonth.interestCents;
        softLoanRepaymentCents += sourceMonth.repaymentCents;
        softLoanBalanceCents += sourceMonth.closingBalanceCents;
      }
    });

    const projectAndFeeCents = projectCostCents + currentLoanFeeCents;
    const projectOtherCents = applyOtherCash(projectAndFeeCents);
    const projectNeedCents = projectAndFeeCents - projectOtherCents;
    const projectEquityCents = Math.min(remainingEquityCents, projectNeedCents);
    remainingEquityCents -= projectEquityCents;
    const debtBeforeReservesCents = projectNeedCents - projectEquityCents;
    const shortfallOtherCents = applyOtherCash(operatingShortfallCents);
    const shortfallNeedCents = operatingShortfallCents - shortfallOtherCents;
    const shortfallEquityCents = Math.min(remainingEquityCents, shortfallNeedCents);
    remainingEquityCents -= shortfallEquityCents;
    const shortfallReserveCents = shortfallNeedCents - shortfallEquityCents;
    const interestOtherCents = applyOtherCash(capitalizedInterestCents);
    const interestNeedCents = capitalizedInterestCents - interestOtherCents;
    const interestEquityCents = Math.min(remainingEquityCents, interestNeedCents);
    remainingEquityCents -= interestEquityCents;
    const interestReserveCents = interestNeedCents - interestEquityCents;
    const otherAppliedCents = projectOtherCents + shortfallOtherCents + interestOtherCents;
    const equityContributionCents = projectEquityCents + shortfallEquityCents + interestEquityCents;
    const totalDebtDrawCents = debtBeforeReservesCents + shortfallReserveCents + interestReserveCents;
    const beforeRepaymentCents = openingDebtCents + totalDebtDrawCents;
    const repaymentCents = month.month === plan.payoffMonth ? beforeRepaymentCents : 0;
    const closingDebtCents = beforeRepaymentCents - repaymentCents;
    const totalUsesCents = projectAndFeeCents + operatingShortfallCents + capitalizedInterestCents;
    const totalSourcesCents = equityContributionCents + totalDebtDrawCents + otherAppliedCents;

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
      grantDraw: dollars(grantDrawCents),
      softLoanDraw: dollars(softLoanDrawCents),
      otherSourcesApplied: dollars(otherAppliedCents),
      otherSourcesCashBalance: dollars(sourceCashCents.reduce((sum, value) => sum + value, 0)),
      softLoanInterest: dollars(softLoanInterestCents),
      softLoanRepayment: dollars(softLoanRepaymentCents),
      softLoanBalance: dollars(softLoanBalanceCents),
      totalSources: dollars(totalSourcesCents),
      totalUses: dollars(totalUsesCents),
      repayment: dollars(repaymentCents),
      closingDebtBalance: dollars(closingDebtCents),
    });
    openingDebtCents = closingDebtCents;
  });
  return {
    months: rows,
    remainingEquityCents,
    sourceAppliedCents,
    unusedOtherCashCents: sourceCashCents.reduce((sum, value) => sum + value, 0),
  };
}

function totalsFor(
  months: MonthlyDevelopmentCapital[],
  landCashCents: number,
  creditedLand: CreditedLandPlan | undefined,
): DevelopmentCapitalTotals {
  const sum = (key: keyof MonthlyDevelopmentCapital) => dollars(
    months.reduce((total, month) => total + (typeof month[key] === "number" ? cents(month[key] as number) : 0), 0),
  );
  const totalDebt = dollars(
    cents(sum("debtBeforeReservesDraw")) + cents(sum("interestReserveDraw")) + cents(sum("operatingShortfallReserveDraw")),
  );
  const totalUses = sum("totalUses");
  const equity = sum("equityContribution");
  const stepUpCents = creditedLand ? cents(creditedLand.creditedValue) - landCashCents : null;
  const creditedEquityCents = stepUpCents !== null && creditedLand?.countsAsSponsorEquity ? stepUpCents : 0;
  return {
    projectCosts: sum("projectCosts"),
    loanFees: sum("loanFee"),
    operatingShortfall: sum("operatingShortfall"),
    grossInterest: sum("grossInterest"),
    operatingCashAppliedToInterest: sum("operatingCashAppliedToInterest"),
    capitalizedInterest: sum("capitalizedInterest"),
    equity,
    debtBeforeReserves: sum("debtBeforeReservesDraw"),
    interestReserve: sum("interestReserveDraw"),
    operatingShortfallReserve: sum("operatingShortfallReserveDraw"),
    totalDebt,
    totalSources: sum("totalSources"),
    totalUses,
    debtSharePercent: totalUses === 0 ? 0 : totalDebt / totalUses * 100,
    grants: sum("grantDraw"),
    softLoans: sum("softLoanDraw"),
    otherSourcesApplied: sum("otherSourcesApplied"),
    softLoanInterest: sum("softLoanInterest"),
    softLoanRepayment: sum("softLoanRepayment"),
    landCashCost: dollars(landCashCents),
    creditedLandStepUp: stepUpCents === null ? null : dollars(stepUpCents),
    creditedLandEquity: dollars(creditedEquityCents),
    sponsorEquity: money(equity, dollars(creditedEquityCents)),
  };
}

/**
 * Capital runs saved before LA-1813 carry no land split, so their summary lists project costs as one
 * line with land inside it. Readers use this for those runs only.
 */
export function earlierSourcesAndUses(
  totals: Pick<DevelopmentCapitalTotals, "equity" | "totalDebt" | "projectCosts" | "loanFees" | "operatingShortfall" | "capitalizedInterest">,
): SourcesAndUses {
  const sources = [
    { key: "equity", label: "Cash Equity", amount: totals.equity },
    { key: "debt", label: "Senior Construction Debt", amount: totals.totalDebt },
  ];
  const uses = [
    { key: "projectCosts", label: "Project Costs, Land Included", amount: totals.projectCosts },
    { key: "loanFees", label: "Loan Fees", amount: totals.loanFees },
    { key: "operatingShortfall", label: "Operating Shortfall", amount: totals.operatingShortfall },
    { key: "capitalizedInterest", label: "Capitalized Interest", amount: totals.capitalizedInterest },
  ];
  return {
    cashBasis: {
      sources,
      uses,
      totalSources: money(...sources.map(({ amount }) => amount)),
      totalUses: money(...uses.map(({ amount }) => amount)),
    },
    creditedBasis: null,
  };
}

function otherSourceResults(schedule: OtherSourceScheduleCents[], appliedCents: number[]): OtherSourceResult[] {
  return schedule.map((entry, index) => ({
    id: entry.source.id,
    name: entry.source.name,
    kind: entry.source.kind,
    drawn: dollars(entry.months.reduce((total, month) => total + month.drawCents, 0)),
    applied: dollars(appliedCents[index]),
    accruedInterest: dollars(entry.months.reduce((total, month) => total + month.interestCents, 0)),
    repaid: dollars(entry.months.reduce((total, month) => total + month.repaymentCents, 0)),
    closingBalance: dollars(entry.months.at(-1)?.closingBalanceCents ?? 0),
  }));
}

function creditedLandResult(creditedLand: CreditedLandPlan | undefined, landCashCents: number): CreditedLandResult | null {
  if (!creditedLand) return null;
  return {
    cashLandCost: dollars(landCashCents),
    creditedValue: creditedLand.creditedValue,
    stepUp: dollars(cents(creditedLand.creditedValue) - landCashCents),
    countsAsSponsorEquity: creditedLand.countsAsSponsorEquity,
  };
}

/**
 * Builds the summary from the schedule's totals, one line per source and use, so a source the schedule
 * funds cannot be left off the summary without a reconciliation failing.
 */
function sourcesAndUsesFor(
  totals: DevelopmentCapitalTotals,
  otherSources: OtherSourceResult[],
  creditedLand: CreditedLandResult | null,
): SourcesAndUses {
  const basis = (sources: SourcesAndUsesLine[], uses: SourcesAndUsesLine[]): SourcesAndUsesBasis => ({
    sources,
    uses,
    totalSources: money(...sources.map(({ amount }) => amount)),
    totalUses: money(...uses.map(({ amount }) => amount)),
  });
  const sources: SourcesAndUsesLine[] = [
    { key: "equity", label: "Cash Equity", amount: totals.equity },
    { key: "debt", label: "Senior Construction Debt", amount: totals.totalDebt },
    ...otherSources.map((source) => ({
      key: `other:${source.id}`,
      label: `${source.name} (${source.kind === "grant" ? "Grant" : "Soft Loan"})`,
      amount: source.applied,
    })),
  ];
  const uses: SourcesAndUsesLine[] = [
    { key: "land", label: "Land at Cash Cost", amount: totals.landCashCost },
    { key: "otherProjectCosts", label: "Other Project Costs", amount: money(totals.projectCosts, -totals.landCashCost) },
    { key: "loanFees", label: "Loan Fees", amount: totals.loanFees },
    { key: "operatingShortfall", label: "Operating Shortfall", amount: totals.operatingShortfall },
    { key: "capitalizedInterest", label: "Capitalized Interest", amount: totals.capitalizedInterest },
  ];
  const credited = creditedLand?.countsAsSponsorEquity
    ? basis(
      [...sources, { key: "creditedLandEquity", label: "Credited Land Equity (Non-Cash)", amount: creditedLand.stepUp }],
      [...uses, { key: "landStepUp", label: "Land Step-Up to Credited Value (Non-Cash)", amount: creditedLand.stepUp }],
    )
    : null;
  return { cashBasis: basis(sources, uses), creditedBasis: credited };
}

function reconciliationsFor(
  months: MonthlyDevelopmentCapital[],
  totals: DevelopmentCapitalTotals,
  plan: DevelopmentCapitalPlan,
  summary: SourcesAndUses,
  otherSources: OtherSourceResult[],
  maxLoanCents: number | null = null,
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
  const softLoanChecks = otherSources.some(({ kind }) => kind === "soft_loan")
    ? months.map((month, index) => check(
      `soft-loan-roll-forward:${month.month}`,
      `${month.month} soft loan opening plus draws and interest less repayment equals closing`,
      month.softLoanBalance,
      money(months[index - 1]?.softLoanBalance ?? 0, month.softLoanDraw, month.softLoanInterest, -month.softLoanRepayment),
    ))
    : [];
  const sourceChecks = otherSources.flatMap((source) => {
    const planned = plan.otherSources?.find(({ id }) => id === source.id);
    return [
      check(
        `other-source-draws:${source.id}`,
        `${source.name} draws equal the amounts entered`,
        money(...(planned?.draws ?? []).map(({ amount }) => amount)),
        source.drawn,
      ),
      check(
        `other-source-in-sources-and-uses:${source.id}`,
        `${source.name} is fully applied to uses in the sources and uses summary`,
        source.drawn,
        summary.cashBasis.sources.find(({ key }) => key === `other:${source.id}`)?.amount ?? 0,
      ),
    ];
  });
  const creditedChecks = summary.creditedBasis
    ? [check("sources-and-uses-credited-basis", "Sources equal uses with land at credited value", summary.creditedBasis.totalUses, summary.creditedBasis.totalSources)]
    : [];
  return [
    ...checks,
    ...softLoanChecks,
    check("total-sources-uses", "Total sources equal total uses", totals.totalUses, totals.totalSources),
    check("sources-and-uses-cash-basis", "Sources equal uses with land at cash cost", summary.cashBasis.totalUses, summary.cashBasis.totalSources),
    check("sources-and-uses-uses-tie", "The sources and uses summary uses equal the monthly uses", totals.totalUses, summary.cashBasis.totalUses),
    check("sources-and-uses-sources-tie", "The sources and uses summary sources equal the monthly sources", totals.totalSources, summary.cashBasis.totalSources),
    ...sourceChecks,
    ...creditedChecks,
    ...(otherSources.some(({ kind }) => kind === "soft_loan")
      ? [check("soft-loans-repaid", "Every soft loan is repaid by the final model month", 0, months.at(-1)?.softLoanBalance ?? 0)]
      : []),
    check(
      "debt-components",
      "Total debt equals debt before reserves plus interest and operating shortfall reserves",
      totals.totalDebt,
      money(totals.debtBeforeReserves, totals.interestReserve, totals.operatingShortfallReserve),
    ),
    maxLoanCents !== null && maxLoanCents < percentOf(cents(totals.totalUses), plan.targetDebtSharePercent)
      ? check("debt-ceiling", "Total debt equals the lender's NOI cap, which is below the target share of total uses", dollars(maxLoanCents), totals.totalDebt)
      : check(
        "target-debt-share",
        "Total debt equals the target share of total uses",
        dollars(percentOf(cents(totals.totalUses), plan.targetDebtSharePercent)),
        totals.totalDebt,
      ),
    check("debt-paid-off", "Closing construction debt equals zero after the payoff month", 0, months.at(-1)?.closingDebtBalance ?? 0),
  ];
}

function formulaTraces(plan: DevelopmentCapitalPlan, hasDebtCeiling = false): CapitalFormulaTrace[] {
  const ceiling = hasDebtCeiling ? ", or until debt reaches the lender's smallest NOI cap if that is lower" : "";
  const ratePath = plan.ratePath !== undefined ? ["ratePath"] : [];
  const otherSources = plan.otherSources !== undefined ? ["otherSources"] : [];
  const creditedLand = plan.creditedLand !== undefined ? ["creditedLand"] : [];
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
    { key: "equity", label: "Equity", formula: `grants and soft loans fund monthly uses first, then equity funds uses until the target debt share of total uses is reached${ceiling}; equity is total uses less target debt less grants and soft loans`, inputPaths: ["targetDebtSharePercent", "fundingOrder", ...otherSources] },
    { key: "debtBeforeReserves", label: "Debt Before Reserves", formula: "project costs and loan fees not funded by equity", inputPaths: ["targetDebtSharePercent", "loanFeePercent", "feeMonth", "fundingOrder"] },
    { key: "grossInterest", label: "Gross Interest", formula: "opening monthly debt balance times the month's annual rate divided by twelve; the rate is the fixed annual rate, or with a rate path the month's base rate plus the spread, using the first base rate before the curve starts and the last base rate after it ends", inputPaths: ["annualInterestRatePercent", ...ratePath, "interestConvention"] },
    { key: "operatingCashAppliedToInterest", label: "Operating Cash Applied to Interest", formula: "the lesser of positive monthly operating cash flow or gross interest", inputPaths: ["interestTreatment", ...operatingCashFlowInputs] },
    { key: "capitalizedInterest", label: "Capitalized Interest", formula: "gross monthly interest less positive operating cash applied to interest", inputPaths: ["annualInterestRatePercent", ...ratePath, "interestConvention", "interestTreatment", ...operatingCashFlowInputs] },
    { key: "interestReserve", label: "Interest Reserve", formula: "gross interest less positive operating cash applied to interest after equity has funded its target amount", inputPaths: ["annualInterestRatePercent", ...ratePath, "interestTreatment", "fundingOrder"] },
    { key: "operatingShortfallReserve", label: "Operating Shortfall Reserve", formula: "negative operating cash flow funded after equity under the equity-first rule and kept separate from project costs", inputPaths: ["fundingOrder", ...operatingCashFlowInputs] },
    { key: "loanFees", label: "Loan Fees", formula: `project costs times target debt share times loan fee percent in the entered fee month${hasDebtCeiling ? ", on the lender's NOI cap in place of that commitment when the cap is lower" : ""}`, inputPaths: ["targetDebtSharePercent", "loanFeePercent", "feeMonth"] },
    { key: "totalDebt", label: "Total Debt", formula: "debt before reserves plus interest reserve and operating shortfall reserve draws", inputPaths: ["targetDebtSharePercent", "fundingOrder", "annualInterestRatePercent", ...ratePath, "loanFeePercent", "costLines", ...operatingCashFlowInputs] },
    { key: "totalSources", label: "Total Sources", formula: "grant and soft loan cash applied to uses, plus equity contributions, plus all debt draws", inputPaths: ["targetDebtSharePercent", "fundingOrder", ...otherSources] },
    { key: "totalUses", label: "Total Uses", formula: "project costs plus loan fees, operating shortfalls, and capitalized interest", inputPaths: ["costLines", "loanFeePercent", "annualInterestRatePercent", ...ratePath, ...operatingCashFlowInputs] },
    { key: "debtSharePercent", label: "Debt Share", formula: "total debt divided by total uses", inputPaths: ["targetDebtSharePercent", "fundingOrder"] },
    { key: "repayment", label: "Debt Repayment", formula: "the full opening debt plus current debt draws repaid in the final entered payoff month", inputPaths: ["payoffMonth"] },
    ...(plan.otherSources !== undefined ? [
      { key: "grants" as const, label: "Grants", formula: "grant cash that arrives in each entered draw month and funds uses before equity and debt", inputPaths: ["otherSources"] },
      { key: "softLoans" as const, label: "Soft Loans", formula: "soft loan cash that arrives in each entered draw month and funds uses before equity and debt", inputPaths: ["otherSources"] },
      { key: "otherSourcesApplied" as const, label: "Other Sources Applied", formula: "grant and soft loan cash applied to project costs, loan fees, operating shortfall and capitalized interest in the month it arrives or later", inputPaths: ["otherSources", "costLines", "loanFeePercent", ...operatingCashFlowInputs] },
      { key: "softLoanInterest" as const, label: "Soft Loan Interest", formula: "opening soft loan balance times the loan's annual rate divided by twelve, accrued to the balance and paid at repayment; it is not a project use and does not enter total uses", inputPaths: ["otherSources"] },
      { key: "softLoanRepayment" as const, label: "Soft Loan Repayment", formula: "soft loan principal plus accrued interest repaid in the entered repayment month", inputPaths: ["otherSources"] },
    ] : []),
    { key: "landCashCost", label: "Land at Cash Cost", formula: "land cost lines in the cost schedule, paid in cash", inputPaths: ["costLines"] },
    ...(plan.creditedLand !== undefined ? [
      { key: "creditedLandStepUp" as const, label: "Credited Land Step-Up", formula: "credited land value less land at cash cost; it is never cash spent", inputPaths: ["creditedLand", "costLines"] },
      { key: "creditedLandEquity" as const, label: "Credited Land Equity", formula: "the credited land step-up when the deal counts credited land as sponsor equity, otherwise zero", inputPaths: ["creditedLand", "costLines"] },
      { key: "sponsorEquity" as const, label: "Sponsor Equity", formula: "cash equity plus credited land counted as sponsor equity", inputPaths: ["targetDebtSharePercent", ...creditedLand, ...otherSources, "costLines"] },
    ] : []),
    { key: "sourcesAndUses" as const, label: "Sources and Uses", formula: "one line per source and use from the schedule's totals, with land at cash cost; with credited land counted as equity a second basis adds the step-up to both sides; the run fails if sources and uses differ", inputPaths: ["costLines", "targetDebtSharePercent", ...otherSources, ...creditedLand] },
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
    ...(input.otherSources !== undefined ? { otherSources: structuredClone(input.otherSources) } : {}),
    ...(input.creditedLand !== undefined ? { creditedLand: structuredClone(input.creditedLand) } : {}),
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
    && Object.values(totals).every((value) => value === null || (Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100))));
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

function formatUsd(valueCents: number) {
  return `$${(valueCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
