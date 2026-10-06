import type { MonthlyApartmentOperations } from "./apartment-operations";
import type { DevelopmentCapitalTotals } from "./development-capital";
import type { PropertyReturnsInputs, PropertyReturnsIssue } from "./property-returns";

/*
 * LA-1689: the lender's tests on one underwriting run. They read the run's own capital totals and
 * a stated twelve-month valuation year; they size nothing. A test that cannot be computed reports
 * an issue in place of its number, and the run itself stays complete.
 */

export const LENDER_TESTS_INPUT_VERSION = "lender_tests_inputs.v1" as const;
export const MAX_LENDER_TEST_SOURCE_LABEL_LENGTH = 500;

export const LENDER_TEST_ASSUMPTION_KEYS = [
  "valuationMonth",
  "asStabilizedCapRatePercent",
  "annualDebtService",
  "noiBasis",
] as const;

export type LenderTestAssumptionKey = typeof LENDER_TEST_ASSUMPTION_KEYS[number];
export type LenderTestNoiBasis = "noi_before_reserves" | "noi_after_reserves";

export type LenderTestEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: "working" | "done";
};

export type LenderTestPlan = {
  lenderTestInputVersion: typeof LENDER_TESTS_INPUT_VERSION;
  /** First month of the twelve-month stabilized year the lender values. */
  valuationMonth: string;
  asStabilizedCapRatePercent: number;
  /** Debt service the lender states, per year. The engine does not derive it. */
  annualDebtService: number;
  noiBasis: LenderTestNoiBasis;
  lenderTestEvidence: Record<LenderTestAssumptionKey, LenderTestEvidence>;
};

export type LenderTestMetricKey = "asStabilizedValue" | "loanToValue" | "loanToCost" | "debtServiceCoverage" | "debtYield";

export type LenderTestMetric = {
  key: LenderTestMetricKey;
  label: string;
  value: number | null;
  unit: "usd" | "ratio" | "multiple";
  formula: string;
  inputPaths: string[];
};

export type LenderTestIssue = {
  path: string;
  code: "valuation_outside_timeline" | "nonpositive_noi" | "zero_debt" | "zero_debt_service";
  message: string;
};

export type LenderTestsResult = {
  valuationStartMonth: string;
  valuationEndMonth: string;
  noiBasis: LenderTestNoiBasis;
  stabilizedNoi: number;
  loanAmount: number;
  totalCost: number;
  annualDebtService: number;
  metrics: LenderTestMetric[];
  issues: LenderTestIssue[];
};

const NOI_BASIS_LABELS: Record<LenderTestNoiBasis, string> = {
  noi_before_reserves: "NOI before reserves",
  noi_after_reserves: "NOI after reserves",
};

export function validateLenderTestPlan(plan: unknown): PropertyReturnsIssue[] {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
    return [{ path: "lenderTests", code: "invalid_lender_tests", message: "Lender tests must be an object." }];
  }
  const candidate = plan as LenderTestPlan;
  const issues: PropertyReturnsIssue[] = [];
  if (candidate.lenderTestInputVersion !== LENDER_TESTS_INPUT_VERSION) {
    issues.push({ path: "lenderTests.lenderTestInputVersion", code: "unsupported_input_version", message: `Use ${LENDER_TESTS_INPUT_VERSION}.` });
  }
  const valuationIndex = monthIndex(candidate.valuationMonth);
  if (valuationIndex === null || valuationIndex + 11 > MAX_MONTH_INDEX) {
    issues.push({ path: "lenderTests.valuationMonth", code: "invalid_month", message: "Valuation month must use YYYY-MM, with its twelve-month year ending by 2200-12." });
  }
  const cap = candidate.asStabilizedCapRatePercent;
  if (typeof cap !== "number" || !Number.isFinite(cap) || cap <= 0 || cap > 100) {
    issues.push({ path: "lenderTests.asStabilizedCapRatePercent", code: "invalid_percent", message: "As-stabilized cap rate must be greater than zero and no more than 100 percent." });
  }
  if (!validUsd(candidate.annualDebtService)) {
    issues.push({ path: "lenderTests.annualDebtService", code: "invalid_amount", message: "Annual debt service must be zero or a positive safe USD amount with no more than two decimal places." });
  }
  if (candidate.noiBasis !== "noi_before_reserves" && candidate.noiBasis !== "noi_after_reserves") {
    issues.push({ path: "lenderTests.noiBasis", code: "invalid_noi_basis", message: "NOI basis must be NOI before reserves or NOI after reserves." });
  }
  issues.push(...validateEvidence(candidate.lenderTestEvidence));
  return issues;
}

/**
 * `projectedMonths` is the run's own operating projection from the analysis start through the
 * forward sale year, so the valuation year must fall inside that window.
 */
export function lenderTestsFor(
  input: PropertyReturnsInputs,
  capital: DevelopmentCapitalTotals,
  projectedMonths: MonthlyApartmentOperations[],
): LenderTestsResult | null {
  const plan = input.lenderTests;
  if (!plan) return null;

  const valuationStartMonth = plan.valuationMonth;
  const valuationEndMonth = addMonths(valuationStartMonth, 11);
  const year = projectedMonths.filter(({ month }) => month >= valuationStartMonth && month <= valuationEndMonth);
  const field = plan.noiBasis === "noi_after_reserves" ? "operatingCashFlow" : "netOperatingIncome";
  const stabilizedNoiCents = year.reduce((total, month) => total + cents(month[field]), 0);
  const loanCents = cents(capital.totalDebt);
  const totalCostCents = cents(capital.totalUses);
  const debtServiceCents = cents(plan.annualDebtService);
  const basis = NOI_BASIS_LABELS[plan.noiBasis];
  const issues: LenderTestIssue[] = [];

  let noiCents: number | null = stabilizedNoiCents;
  if (year.length !== 12) {
    noiCents = null;
    issues.push({ path: "lenderTests.valuationMonth", code: "valuation_outside_timeline", message: "The valuation year must start on or after the analysis start month and end by the last month of the forward sale year." });
  } else if (stabilizedNoiCents <= 0) {
    noiCents = null;
    issues.push({ path: "lenderTests.valuationMonth", code: "nonpositive_noi", message: `${basis} for the valuation year is zero or negative, so value, LTV, DSCR and debt yield are not reported.` });
  }
  if (noiCents !== null && loanCents <= 0) {
    issues.push({ path: "targetDebtSharePercent", code: "zero_debt", message: "The run has no construction debt, so debt yield is not reported." });
  }
  if (noiCents !== null && debtServiceCents <= 0) {
    issues.push({ path: "lenderTests.annualDebtService", code: "zero_debt_service", message: "Annual debt service is zero, so DSCR is not reported." });
  }

  const valueCents = noiCents === null ? null : Math.round(noiCents / (plan.asStabilizedCapRatePercent / 100));
  const noiPaths = [...OPERATION_PATHS, "lenderTests.valuationMonth", "lenderTests.noiBasis"];
  const metrics: LenderTestMetric[] = [
    {
      key: "asStabilizedValue",
      label: "As-Stabilized Value",
      value: valueCents === null ? null : dollars(valueCents),
      unit: "usd",
      formula: `valuation-year ${basis} divided by the as-stabilized cap rate`,
      inputPaths: [...noiPaths, "lenderTests.asStabilizedCapRatePercent"],
    },
    {
      key: "loanToValue",
      label: "Loan to Value",
      value: valueCents === null ? null : loanCents / valueCents,
      unit: "ratio",
      formula: `total construction debt divided by as-stabilized value on ${basis}`,
      inputPaths: [...noiPaths, ...CAPITAL_PATHS, "lenderTests.asStabilizedCapRatePercent"],
    },
    {
      key: "loanToCost",
      label: "Loan to Cost",
      value: totalCostCents > 0 ? loanCents / totalCostCents : null,
      unit: "ratio",
      formula: "total construction debt divided by total uses including carry",
      inputPaths: [...CAPITAL_PATHS],
    },
    {
      key: "debtServiceCoverage",
      label: "Debt Service Coverage",
      value: noiCents === null || debtServiceCents <= 0 ? null : noiCents / debtServiceCents,
      unit: "multiple",
      formula: `valuation-year ${basis} divided by stated annual debt service`,
      inputPaths: [...noiPaths, "lenderTests.annualDebtService"],
    },
    {
      key: "debtYield",
      label: "Debt Yield",
      value: noiCents === null || loanCents <= 0 ? null : noiCents / loanCents,
      unit: "ratio",
      formula: `valuation-year ${basis} divided by total construction debt`,
      inputPaths: [...noiPaths, ...CAPITAL_PATHS],
    },
  ];

  return {
    valuationStartMonth,
    valuationEndMonth,
    noiBasis: plan.noiBasis,
    stabilizedNoi: dollars(stabilizedNoiCents),
    loanAmount: dollars(loanCents),
    totalCost: dollars(totalCostCents),
    annualDebtService: dollars(debtServiceCents),
    metrics,
    issues,
  };
}

const OPERATION_PATHS = [
  "analysisStartMonth", "inputVersion", "operationStartMonth", "growthStartMonth",
  "preleasedUnits", "leaseUpUnitsPerMonth", "annualIncomeGrowthPercent",
  "annualExpenseGrowthPercent", "rentAdjustmentLossPercent", "freeRentPercent",
  "vacancyPercent", "creditLossPercent", "residentialUnitTypes", "otherIncomeLines",
  "operatingExpenseLines", "capitalExpenditureLines",
];

const CAPITAL_PATHS = [
  "costLines", "saleMonth", "capitalInputVersion", "targetDebtSharePercent", "annualInterestRatePercent",
  "loanFeePercent", "fundingOrder", "interestTreatment", "interestConvention", "feeMonth", "payoffMonth",
];

const MAX_MONTH_INDEX = 2200 * 12 + 11;

function validateEvidence(evidence: unknown): PropertyReturnsIssue[] {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [{ path: "lenderTests.lenderTestEvidence", code: "missing_evidence", message: "Add source and review details for the lender tests." }];
  }
  const issues: PropertyReturnsIssue[] = [];
  for (const key of LENDER_TEST_ASSUMPTION_KEYS) {
    const item = (evidence as Record<string, LenderTestEvidence | undefined>)[key];
    const path = `lenderTests.lenderTestEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path, code: "missing_evidence", message: "Add source and review details." });
      continue;
    }
    if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") issues.push({ path: `${path}.sourceLabel`, code: "invalid_source_label", message: "Source label must be text." });
    else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_LENDER_TEST_SOURCE_LABEL_LENGTH) issues.push({ path: `${path}.sourceLabel`, code: "text_too_long", message: `Source label cannot exceed ${MAX_LENDER_TEST_SOURCE_LABEL_LENGTH} characters.` });
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  }
  return issues;
}

function validUsd(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return false;
  const valueCents = Math.round(value * 100);
  return Number.isSafeInteger(valueCents) && Math.abs(value - valueCents / 100) <= 1e-9;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function monthIndex(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function addMonths(value: string, offset: number) {
  const index = monthIndex(value)! + offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function dollars(valueCents: number) {
  return valueCents / 100;
}
