import type { MonthlyApartmentOperations } from "./apartment-operations";
import type { DevelopmentCapitalTotals } from "./development-capital";
import type { PermanentLoanResult } from "./permanent-loan";
import type { PropertyReturnsInputs, PropertyReturnsIssue } from "./property-returns";
import { commercialTaxSharePercentFor, splitNoiByUse, valueByUse, type UseSplit } from "./use-split";

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
/** Evidence for the commercial cap rate, required only when the plan states one (LA-1870). */
export const LENDER_TEST_COMMERCIAL_CAP_KEY = "commercialCapRatePercent" as const;
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
  /**
   * Cap rate for the commercial spaces' NOI (LA-1870). With it, as-stabilized value is residential NOI
   * over the as-stabilized cap plus commercial NOI over this cap, and so is the LTV cap. Absent keeps one
   * cap for the whole property. It needs a commercial block on the case, and evidence of its own.
   */
  commercialCapRatePercent?: number;
  lenderTestEvidence: Record<LenderTestAssumptionKey, LenderTestEvidence> & { commercialCapRatePercent?: LenderTestEvidence };
  /** Optional caps that size the construction loan below its LTC (LA-1823). Absent keeps LTC sizing only. */
  loanSizing?: LoanSizingPlan;
  /**
   * Which debt service DSCR divides by (LA-1867). With a permanent loan the default is the loan's own
   * computed annual debt service, and "stated" keeps `annualDebtService` as an override. With no
   * permanent loan the stated figure is the only one, so the field is absent or "stated".
   */
  debtServiceBasis?: LenderDebtServiceBasis;
};

export const LENDER_DEBT_SERVICE_BASES = ["stated", "permanent_loan"] as const;
export type LenderDebtServiceBasis = (typeof LENDER_DEBT_SERVICE_BASES)[number];

export const LOAN_SIZING_TAX_BASES = ["full_tax", "abated"] as const;
export const MAX_DSCR_AMORTIZATION_YEARS = 40;

/**
 * The loan is the lesser of LTC on total cost (the capital plan's target debt share) and each cap
 * set here. Every NOI cap reads the lender-test valuation year and NOI basis, taxed on `noiTaxBasis`:
 * full tax as if any abatement had ended, or the scheduled abated tax.
 */
export type LoanSizingPlan = {
  noiTaxBasis: (typeof LOAN_SIZING_TAX_BASES)[number];
  maxLoanToValuePercent?: number;
  minDebtYieldPercent?: number;
  minDebtServiceCoverage?: number;
  /** Rate the DSCR cap prices debt service at. Required with a DSCR floor. */
  dscrRatePercent?: number;
  /** Amortization the DSCR cap prices debt service at; zero is interest only. Required with a DSCR floor. */
  dscrAmortizationYears?: number;
  evidence: LenderTestEvidence;
};

export type LoanSizingCapKey = "loanToCost" | "loanToValue" | "debtYield" | "debtServiceCoverage";

export type LoanSizingCap = {
  key: LoanSizingCapKey;
  label: string;
  /** The largest loan this test allows. */
  amount: number;
  binding: boolean;
  formula: string;
  inputPaths: string[];
};

export type LoanSizingResult = {
  noiTaxBasis: LoanSizingPlan["noiTaxBasis"];
  sizingNoi: number;
  loanAmount: number;
  bindingCap: LoanSizingCapKey;
  caps: LoanSizingCap[];
};

export type LenderTestMetricKey =
  | "asStabilizedValue"
  | "loanToValue"
  | "loanToCost"
  | "loanToCostCreditedLand"
  | "debtServiceCoverage"
  | "debtYield";

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
  code: "valuation_outside_timeline" | "nonpositive_noi" | "nonpositive_full_tax_noi" | "zero_debt" | "zero_debt_service";
  message: string;
};

export type LenderValueSplitKey = "residentialNoi" | "commercialNoi" | "residentialValue" | "commercialValue";

export type LenderValueSplitLine = {
  key: LenderValueSplitKey;
  label: string;
  value: number;
  unit: "usd";
  formula: string;
  inputPaths: string[];
};

/** As-stabilized value by use, reported only with a commercial cap (LA-1870). The two values add to the as-stabilized value. */
export type LenderValueSplit = {
  residentialNoi: number;
  commercialNoi: number;
  residentialValue: number;
  commercialValue: number;
  lines: LenderValueSplitLine[];
};

/** The NOI tests again with full tax for the same valuation year, as if the abatement had ended (LA-1690). */
export type LenderFullTaxTests = {
  stabilizedNoi: number;
  metrics: LenderTestMetric[];
  /** Value by use on full tax. Present only with a commercial cap and a value to report. */
  valueSplit?: LenderValueSplit;
};

export type LenderTestsResult = {
  valuationStartMonth: string;
  valuationEndMonth: string;
  noiBasis: LenderTestNoiBasis;
  stabilizedNoi: number;
  loanAmount: number;
  /** Total uses including carry, with land at cash cost. */
  totalCost: number;
  /** Credited land value less cash land cost, when the case has credited land (LA-1813). */
  creditedLandStepUp: number | null;
  /** Total cost with land at credited value in place of cash cost, when the case has credited land. */
  totalCostAtCreditedLand: number | null;
  annualDebtService: number;
  metrics: LenderTestMetric[];
  /** Value by use. Present only with a commercial cap and a value to report (LA-1870). */
  valueSplit?: LenderValueSplit;
  /** Present when the run's tax schedule carries an abatement. */
  fullTax: LenderFullTaxTests | null;
  /** Present when the lender tests carry loan sizing caps. Runs saved before LA-1823 read it as absent. */
  loanSizing?: LoanSizingResult | null;
  /** Present only when the run has a permanent loan (LA-1867): the debt service DSCR divides by. */
  debtServiceSource?: LenderDebtServiceBasis;
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
  const commercialCap = candidate.commercialCapRatePercent;
  if (commercialCap !== undefined && (typeof commercialCap !== "number" || !Number.isFinite(commercialCap) || commercialCap <= 0 || commercialCap > 100)) {
    issues.push({ path: "lenderTests.commercialCapRatePercent", code: "invalid_percent", message: "Commercial cap rate must be greater than zero and no more than 100 percent." });
  }
  issues.push(...validateEvidence(candidate.lenderTestEvidence, commercialCap !== undefined));
  if (candidate.loanSizing !== undefined) issues.push(...validateLoanSizing(candidate.loanSizing));
  if (candidate.debtServiceBasis !== undefined && !LENDER_DEBT_SERVICE_BASES.includes(candidate.debtServiceBasis)) {
    issues.push({ path: "lenderTests.debtServiceBasis", code: "invalid_lender_tests", message: "Debt service basis must be Stated or Permanent Loan." });
  }
  return issues;
}

function validateLoanSizing(sizing: unknown): PropertyReturnsIssue[] {
  const path = "lenderTests.loanSizing";
  if (!sizing || typeof sizing !== "object" || Array.isArray(sizing)) {
    return [{ path, code: "invalid_loan_sizing", message: "Loan sizing must be an object." }];
  }
  const plan = sizing as LoanSizingPlan;
  const issues: PropertyReturnsIssue[] = [];
  const bad = (field: string, message: string) => issues.push({ path: `${path}.${field}`, code: "invalid_loan_sizing", message });
  if (!LOAN_SIZING_TAX_BASES.includes(plan.noiTaxBasis)) bad("noiTaxBasis", "Size on full tax or abated tax.");
  const positive = (value: unknown, max: number) => typeof value === "number" && Number.isFinite(value) && value > 0 && value <= max;
  if (plan.maxLoanToValuePercent !== undefined && !positive(plan.maxLoanToValuePercent, 100)) bad("maxLoanToValuePercent", "Maximum LTV must be above zero and no more than 100 percent.");
  if (plan.minDebtYieldPercent !== undefined && !positive(plan.minDebtYieldPercent, 100)) bad("minDebtYieldPercent", "Minimum debt yield must be above zero and no more than 100 percent.");
  if (plan.minDebtServiceCoverage !== undefined) {
    if (!positive(plan.minDebtServiceCoverage, 10)) bad("minDebtServiceCoverage", "Minimum DSCR must be above zero and no more than 10.");
    if (!positive(plan.dscrRatePercent, 100)) bad("dscrRatePercent", "Enter the rate the DSCR test prices debt service at, above zero and no more than 100 percent.");
    const years = plan.dscrAmortizationYears;
    if (typeof years !== "number" || !Number.isInteger(years) || years < 0 || years > MAX_DSCR_AMORTIZATION_YEARS) {
      bad("dscrAmortizationYears", `Amortization must be a whole number of years from 0 (interest only) to ${MAX_DSCR_AMORTIZATION_YEARS}.`);
    }
  } else if (plan.dscrRatePercent !== undefined || plan.dscrAmortizationYears !== undefined) {
    bad("minDebtServiceCoverage", "Enter a minimum DSCR to use the DSCR rate and amortization.");
  }
  const item = plan.evidence as LenderTestEvidence | undefined;
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    issues.push({ path: `${path}.evidence`, code: "missing_evidence", message: "Add source and review details for the loan sizing terms." });
  } else {
    if (item.sourceLabel !== undefined && (typeof item.sourceLabel !== "string" || item.sourceLabel.length > MAX_LENDER_TEST_SOURCE_LABEL_LENGTH)) issues.push({ path: `${path}.evidence.sourceLabel`, code: "invalid_source_label", message: `Source label must be text of no more than ${MAX_LENDER_TEST_SOURCE_LABEL_LENGTH} characters.` });
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) issues.push({ path: `${path}.evidence.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.evidence.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  }
  return issues;
}

/** Annual debt service per dollar of loan with level monthly payments; zero years is interest only. */
export function annualDebtConstant(ratePercent: number, amortizationYears: number) {
  const monthlyRate = ratePercent / 100 / 12;
  if (amortizationYears === 0) return ratePercent / 100;
  const payments = amortizationYears * 12;
  return 12 * monthlyRate / (1 - (1 + monthlyRate) ** -payments);
}

/** The terms one set of NOI caps reads. Each cap is optional; a DSCR floor needs its rate and amortization. */
export type NoiCapTerms = {
  maxLoanToValuePercent?: number;
  /** The cap rate that turns the sizing NOI into value. Required with an LTV cap. */
  capRatePercent?: number;
  minDebtYieldPercent?: number;
  minDebtServiceCoverage?: number;
  ratePercent?: number;
  amortizationYears?: number;
  /**
   * The commercial part of the sizing NOI and the cap rate that values it (LA-1870). The LTV cap then
   * values the rest of the NOI at `capRatePercent`. Debt yield and DSCR read the whole NOI either way.
   */
  commercial?: { noiCents: number; capRatePercent: number };
};

export type NoiSizingCap = Omit<LoanSizingCap, "binding"> & { key: Exclude<LoanSizingCapKey, "loanToCost">; amountCents: number };

/**
 * The largest loan each NOI cap allows on one sizing NOI (LA-1823). The construction loan calls it on
 * the lender-test valuation year and the permanent loan on its own NOI window (LA-1867), so the two
 * share one formula. `text` names the NOI, the value and the cap rate in the traces.
 */
export function noiSizingCaps(
  noiCents: number,
  terms: NoiCapTerms,
  text: { noi: string; value: string; capRate: string },
  paths: { noi: string[]; capRate: string; commercialCapRate?: string; loanToValue: string; debtYield: string; debtServiceCoverage: string; rate: string; amortization: string },
): NoiSizingCap[] {
  const caps: NoiSizingCap[] = [];
  if (terms.maxLoanToValuePercent !== undefined) {
    const { commercial } = terms;
    const valueCents = commercial
      ? Math.round((noiCents - commercial.noiCents) / (terms.capRatePercent! / 100)) + Math.round(commercial.noiCents / (commercial.capRatePercent / 100))
      : Math.round(noiCents / (terms.capRatePercent! / 100));
    const amountCents = Math.floor(valueCents * terms.maxLoanToValuePercent / 100);
    caps.push({
      key: "loanToValue",
      label: "Loan to Value",
      amount: dollars(amountCents),
      amountCents,
      formula: commercial
        ? `maximum LTV times ${text.value}, where value is the residential part of ${text.noi} divided by ${text.capRate}, plus the commercial part divided by the commercial cap rate`
        : `maximum LTV times ${text.value}, where value is ${text.noi} divided by ${text.capRate}`,
      inputPaths: [...paths.noi, paths.capRate, ...(commercial && paths.commercialCapRate ? [paths.commercialCapRate] : []), paths.loanToValue],
    });
  }
  if (terms.minDebtYieldPercent !== undefined) {
    const amountCents = Math.floor(noiCents / (terms.minDebtYieldPercent / 100));
    caps.push({
      key: "debtYield",
      label: "Debt Yield",
      amount: dollars(amountCents),
      amountCents,
      formula: `${text.noi} divided by the minimum debt yield`,
      inputPaths: [...paths.noi, paths.debtYield],
    });
  }
  if (terms.minDebtServiceCoverage !== undefined) {
    const constant = annualDebtConstant(terms.ratePercent!, terms.amortizationYears!);
    const amountCents = Math.floor(noiCents / terms.minDebtServiceCoverage / constant);
    caps.push({
      key: "debtServiceCoverage",
      label: "Debt Service Coverage",
      amount: dollars(amountCents),
      amountCents,
      formula: `${text.noi} divided by the minimum DSCR, divided by the annual debt constant ${constant.toFixed(6)} at ${terms.ratePercent} percent ${terms.amortizationYears === 0 ? "interest only" : `over ${terms.amortizationYears} years of monthly payments`}`,
      inputPaths: [...paths.noi, paths.debtServiceCoverage, paths.rate, paths.amortization],
    });
  }
  return caps;
}

export type LoanSizingCeiling = {
  /** The smallest NOI cap in cents, or null when only LTC sizes the loan. */
  maxLoanCents: number | null;
  sizingNoiCents: number;
  noiCaps: NoiSizingCap[];
};

/**
 * The NOI caps, read before the capital plan runs: the valuation-year NOI does not depend on the
 * loan, so the capital plan can take the smallest cap as a ceiling on total debt. Returns an issue
 * when a cap is set but the valuation year has no positive NOI to size on.
 */
export function loanSizingCeiling(
  input: PropertyReturnsInputs,
  projectedMonths: MonthlyApartmentOperations[],
): LoanSizingCeiling | PropertyReturnsIssue {
  const plan = input.lenderTests!;
  const sizing = plan.loanSizing!;
  const valuationEndMonth = addMonths(plan.valuationMonth, 11);
  const year = projectedMonths.filter(({ month }) => month >= plan.valuationMonth && month <= valuationEndMonth);
  const field = plan.noiBasis === "noi_after_reserves" ? "operatingCashFlow" : "netOperatingIncome";
  const scheduledCents = year.reduce((total, month) => total + cents(month[field]), 0);
  const abatementCents = year.reduce((total, month) => total + cents(month.fullPropertyTax) - cents(month.propertyTax), 0);
  const noiCents = sizing.noiTaxBasis === "full_tax" ? scheduledCents - abatementCents : scheduledCents;
  const anyCap = sizing.maxLoanToValuePercent !== undefined || sizing.minDebtYieldPercent !== undefined || sizing.minDebtServiceCoverage !== undefined;
  if (anyCap && (year.length !== 12 || noiCents <= 0)) {
    return {
      path: "lenderTests.loanSizing",
      code: "loan_sizing_unavailable",
      message: "The loan sizing caps need a full valuation year with positive NOI on the chosen tax basis. Move the valuation month or remove the caps.",
    };
  }
  const basis = `${NOI_BASIS_LABELS[plan.noiBasis]}${sizing.noiTaxBasis === "full_tax" ? " with full tax" : " with scheduled tax"}`;
  const operationPaths = operationPathsFor(input);
  const commercialCap = plan.commercialCapRatePercent;
  const commercialNoiCents = commercialCap === undefined
    ? null
    : splitNoiByUse(year, field, sizing.noiTaxBasis === "full_tax" ? "full" : "scheduled", commercialTaxSharePercentFor(input)).commercialCents;
  const noiCaps = noiSizingCaps(noiCents, {
    maxLoanToValuePercent: sizing.maxLoanToValuePercent,
    capRatePercent: plan.asStabilizedCapRatePercent,
    ...(commercialCap === undefined || commercialNoiCents === null ? {} : { commercial: { noiCents: commercialNoiCents, capRatePercent: commercialCap } }),
    minDebtYieldPercent: sizing.minDebtYieldPercent,
    minDebtServiceCoverage: sizing.minDebtServiceCoverage,
    ratePercent: sizing.dscrRatePercent,
    amortizationYears: sizing.dscrAmortizationYears,
  }, {
    noi: `valuation-year ${basis}`,
    value: "as-stabilized value",
    capRate: "the as-stabilized cap rate",
  }, {
    noi: [...operationPaths, "lenderTests.valuationMonth", "lenderTests.noiBasis", "lenderTests.loanSizing.noiTaxBasis"],
    capRate: "lenderTests.asStabilizedCapRatePercent",
    commercialCapRate: "lenderTests.commercialCapRatePercent",
    loanToValue: "lenderTests.loanSizing.maxLoanToValuePercent",
    debtYield: "lenderTests.loanSizing.minDebtYieldPercent",
    debtServiceCoverage: "lenderTests.loanSizing.minDebtServiceCoverage",
    rate: "lenderTests.loanSizing.dscrRatePercent",
    amortization: "lenderTests.loanSizing.dscrAmortizationYears",
  });
  return {
    maxLoanCents: noiCaps.length === 0 ? null : Math.min(...noiCaps.map(({ amountCents }) => amountCents)),
    sizingNoiCents: noiCents,
    noiCaps,
  };
}

/** The sized loan against every cap. LTC reads the run's final total uses, so it is added after the capital plan settles. */
export function loanSizingResult(
  sizing: LoanSizingPlan,
  ceiling: LoanSizingCeiling,
  capital: DevelopmentCapitalTotals,
  targetDebtSharePercent: number,
): LoanSizingResult {
  const ltcCents = Math.round(cents(capital.totalUses) * targetDebtSharePercent / 100);
  const caps = [
    {
      key: "loanToCost" as const,
      label: "Loan to Cost",
      amountCents: ltcCents,
      amount: dollars(ltcCents),
      formula: "target debt share times total uses including carry, with land at cash cost",
      inputPaths: [...CAPITAL_PATHS],
    },
    ...ceiling.noiCaps,
  ];
  const smallest = caps.reduce((low, cap) => cap.amountCents < low.amountCents ? cap : low, caps[0]);
  return {
    noiTaxBasis: sizing.noiTaxBasis,
    sizingNoi: dollars(ceiling.sizingNoiCents),
    loanAmount: capital.totalDebt,
    bindingCap: smallest.key,
    caps: caps.map(({ amountCents: _amountCents, ...cap }) => {
      void _amountCents;
      return { ...cap, binding: cap.key === smallest.key };
    }),
  };
}

/**
 * `projectedMonths` is the run's own operating projection from the analysis start through the
 * forward sale year, so the valuation year must fall inside that window.
 */
export function lenderTestsFor(
  input: PropertyReturnsInputs,
  capital: DevelopmentCapitalTotals,
  projectedMonths: MonthlyApartmentOperations[],
  permanentLoan: Pick<PermanentLoanResult, "annualDebtService" | "annualDebtServiceFormula"> | null = null,
): LenderTestsResult | null {
  const plan = input.lenderTests;
  if (!plan) return null;

  const valuationStartMonth = plan.valuationMonth;
  const valuationEndMonth = addMonths(valuationStartMonth, 11);
  const year = projectedMonths.filter(({ month }) => month >= valuationStartMonth && month <= valuationEndMonth);
  const field = plan.noiBasis === "noi_after_reserves" ? "operatingCashFlow" : "netOperatingIncome";
  const stabilizedNoiCents = year.reduce((total, month) => total + cents(month[field]), 0);
  const abatementCents = year.reduce((total, month) => total + cents(month.fullPropertyTax) - cents(month.propertyTax), 0);
  const loanCents = cents(capital.totalDebt);
  const totalCostCents = cents(capital.totalUses);
  const stepUpCents = capital.creditedLandStepUp == null ? null : cents(capital.creditedLandStepUp);
  const creditedCostCents = stepUpCents === null ? null : totalCostCents + stepUpCents;
  const debtServiceSource: LenderDebtServiceBasis = permanentLoan && plan.debtServiceBasis !== "stated" ? "permanent_loan" : "stated";
  const debtServiceCents = permanentLoan && debtServiceSource === "permanent_loan"
    ? cents(permanentLoan.annualDebtService)
    : cents(plan.annualDebtService);
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
    issues.push({ path: debtServiceSource === "permanent_loan" ? "permanentLoan" : "lenderTests.annualDebtService", code: "zero_debt_service", message: "Annual debt service is zero, so DSCR is not reported." });
  }

  const debtService = permanentLoan && debtServiceSource === "permanent_loan"
    ? { text: `the permanent loan's annual debt service, ${permanentLoan.annualDebtServiceFormula}`, paths: ["permanentLoan"] }
    : { text: "stated annual debt service", paths: ["lenderTests.annualDebtService"] };
  const tests = { plan, loanCents, debtServiceCents, debtService };
  const noiPaths = [...operationPathsFor(input), "lenderTests.valuationMonth", "lenderTests.noiBasis"];
  // LA-1870: with a commercial cap each use's NOI takes its own cap rate. Without one the split is never read.
  const commercialTaxShare = commercialTaxSharePercentFor(input);
  const capTermsFor = (taxBasis: "scheduled" | "full"): UseCapTerms | undefined => plan.commercialCapRatePercent === undefined || year.length !== 12
    ? undefined
    : { split: splitNoiByUse(year, field, taxBasis, commercialTaxShare), commercialCapRatePercent: plan.commercialCapRatePercent };
  const scheduledUse = capTermsFor("scheduled");
  const scheduled = noiMetrics(tests, noiCents, basis, noiPaths, scheduledUse);
  const metrics: LenderTestMetric[] = [
    scheduled[0],
    scheduled[1],
    {
      key: "loanToCost",
      label: "Loan to Cost",
      value: totalCostCents > 0 ? loanCents / totalCostCents : null,
      unit: "ratio",
      formula: "total construction debt divided by total uses including carry, with land at cash cost",
      inputPaths: [...CAPITAL_PATHS],
    },
    ...(creditedCostCents === null ? [] : [{
      key: "loanToCostCreditedLand" as const,
      label: "Loan to Cost, Land at Credited Value",
      value: creditedCostCents > 0 ? loanCents / creditedCostCents : null,
      unit: "ratio" as const,
      formula: "total construction debt divided by total uses including carry, with land at credited value in place of cash cost",
      inputPaths: [...CAPITAL_PATHS, "creditedLand"],
    }]),
    scheduled[2],
    scheduled[3],
  ];
  const valueSplit = scheduledUse && noiCents !== null ? valueSplitFor(plan, scheduledUse, basis, noiPaths) : undefined;

  let fullTax: LenderFullTaxTests | null = null;
  if (input.propertyTax?.mode === "abatement") {
    const fullTaxNoiCents = stabilizedNoiCents - abatementCents;
    let fullNoi: number | null = year.length === 12 ? fullTaxNoiCents : null;
    if (fullNoi !== null && fullNoi <= 0) {
      fullNoi = null;
      issues.push({ path: "propertyTax", code: "nonpositive_full_tax_noi", message: `${basis} with full tax for the valuation year is zero or negative, so the full-tax value, LTV, DSCR and debt yield are not reported.` });
    }
    const fullUse = capTermsFor("full");
    fullTax = {
      stabilizedNoi: dollars(fullTaxNoiCents),
      metrics: noiMetrics(tests, fullNoi, `${basis} with full tax`, noiPaths, fullUse),
      ...(fullUse && fullNoi !== null ? { valueSplit: valueSplitFor(plan, fullUse, `${basis} with full tax`, noiPaths) } : {}),
    };
  }

  return {
    valuationStartMonth,
    valuationEndMonth,
    noiBasis: plan.noiBasis,
    stabilizedNoi: dollars(stabilizedNoiCents),
    loanAmount: dollars(loanCents),
    totalCost: dollars(totalCostCents),
    creditedLandStepUp: stepUpCents === null ? null : dollars(stepUpCents),
    totalCostAtCreditedLand: creditedCostCents === null ? null : dollars(creditedCostCents),
    annualDebtService: dollars(debtServiceCents),
    metrics,
    ...(valueSplit ? { valueSplit } : {}),
    fullTax,
    ...(permanentLoan ? { debtServiceSource } : {}),
    issues,
  };
}

/** Value, LTV, DSCR and debt yield on one valuation-year NOI. LTC does not read NOI, so it is reported once. */
function noiMetrics(
  tests: { plan: LenderTestPlan; loanCents: number; debtServiceCents: number; debtService: { text: string; paths: string[] } },
  noiCents: number | null,
  basis: string,
  noiPaths: string[],
  use?: UseCapTerms,
): LenderTestMetric[] {
  const { plan, loanCents, debtServiceCents, debtService } = tests;
  const valueCents = noiCents === null
    ? null
    : use
      ? valueByUse(use.split, plan.asStabilizedCapRatePercent, use.commercialCapRatePercent).totalValueCents
      : Math.round(noiCents / (plan.asStabilizedCapRatePercent / 100));
  const commercialCapPath = use ? ["lenderTests.commercialCapRatePercent"] : [];
  return [
    {
      key: "asStabilizedValue",
      label: "As-Stabilized Value",
      value: valueCents === null ? null : dollars(valueCents),
      unit: "usd",
      formula: use
        ? `valuation-year residential ${basis} divided by the as-stabilized cap rate, plus valuation-year commercial ${basis} divided by the commercial cap rate`
        : `valuation-year ${basis} divided by the as-stabilized cap rate`,
      inputPaths: [...noiPaths, "lenderTests.asStabilizedCapRatePercent", ...commercialCapPath],
    },
    {
      key: "loanToValue",
      label: "Loan to Value",
      value: valueCents === null ? null : loanCents / valueCents,
      unit: "ratio",
      formula: `total construction debt divided by as-stabilized value on ${basis}`,
      inputPaths: [...noiPaths, ...CAPITAL_PATHS, "lenderTests.asStabilizedCapRatePercent", ...commercialCapPath],
    },
    {
      key: "debtServiceCoverage",
      label: "Debt Service Coverage",
      value: noiCents === null || debtServiceCents <= 0 ? null : noiCents / debtServiceCents,
      unit: "multiple",
      formula: `valuation-year ${basis} divided by ${debtService.text}`,
      inputPaths: [...noiPaths, ...debtService.paths],
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
}

type UseCapTerms = { split: UseSplit; commercialCapRatePercent: number };

/** The operating inputs behind NOI. A tax schedule and a commercial block each join the list only when the case has them. */
export function operationPathsFor(input: Pick<PropertyReturnsInputs, "propertyTax" | "commercial">) {
  return [...OPERATION_PATHS, ...(input.propertyTax ? ["propertyTax"] : []), ...(input.commercial ? ["commercial"] : [])];
}

/** Valuation-year NOI and value for each use, with a formula for every line. The two values add to the as-stabilized value. */
function valueSplitFor(plan: LenderTestPlan, use: UseCapTerms, basis: string, noiPaths: string[]): LenderValueSplit {
  const { residentialValueCents, commercialValueCents } = valueByUse(use.split, plan.asStabilizedCapRatePercent, use.commercialCapRatePercent);
  const line = (key: LenderValueSplitKey, label: string, valueCents: number, formula: string, inputPaths: string[]): LenderValueSplitLine =>
    ({ key, label, value: dollars(valueCents), unit: "usd", formula, inputPaths });
  return {
    residentialNoi: dollars(use.split.residentialCents),
    commercialNoi: dollars(use.split.commercialCents),
    residentialValue: dollars(residentialValueCents),
    commercialValue: dollars(commercialValueCents),
    lines: [
      line("residentialNoi", "Residential NOI", use.split.residentialCents, `valuation-year ${basis} of the residential use: residential effective gross revenue less the expenses it carries${basis.includes("full tax") ? ", with the added tax shared by each use's tenant recovery share" : ""}`, noiPaths),
      line("commercialNoi", "Commercial NOI", use.split.commercialCents, `valuation-year ${basis} of the commercial spaces: commercial effective gross revenue less the expenses they carry${basis.includes("full tax") ? ", with the added tax shared by each use's tenant recovery share" : ""}`, noiPaths),
      line("residentialValue", "Residential Value", residentialValueCents, "residential NOI divided by the as-stabilized cap rate", [...noiPaths, "lenderTests.asStabilizedCapRatePercent"]),
      line("commercialValue", "Commercial Value", commercialValueCents, "commercial NOI divided by the commercial cap rate", [...noiPaths, "lenderTests.commercialCapRatePercent"]),
    ],
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

function validateEvidence(evidence: unknown, withCommercialCap: boolean): PropertyReturnsIssue[] {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [{ path: "lenderTests.lenderTestEvidence", code: "missing_evidence", message: "Add source and review details for the lender tests." }];
  }
  const issues: PropertyReturnsIssue[] = [];
  const keys: readonly string[] = withCommercialCap ? [...LENDER_TEST_ASSUMPTION_KEYS, LENDER_TEST_COMMERCIAL_CAP_KEY] : LENDER_TEST_ASSUMPTION_KEYS;
  for (const key of keys) {
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
