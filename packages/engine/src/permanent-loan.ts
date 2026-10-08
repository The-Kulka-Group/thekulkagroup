import type { MonthlyApartmentOperations } from "./apartment-operations";
import { splitNoiByUse } from "./use-split";
import type { DevelopmentCapitalEvidence } from "./development-capital";
import { LOAN_SIZING_TAX_BASES, noiSizingCaps, type LoanSizingCap } from "./lender-tests";
import type { Milestone, MilestoneAnchor } from "./milestones";
import type { ReconciliationCheck } from "./monthly-cost-schedule";

/*
 * LA-1867: a permanent loan that takes out the construction loan before the sale. The construction
 * loan repays in the takeout month, the permanent loan funds that month, debt service runs monthly
 * from operating cash, and the permanent balance repays at sale. A case without the block runs as
 * before. The sizing NOI comes from operations, which never read the loan, so there is no loop.
 */

export const PERMANENT_LOAN_INPUT_VERSION = "permanent_loan_inputs.v1" as const;
export const PERMANENT_LOAN_SIZING_MODES = ["lesser_of_tests", "construction_balance"] as const;
export const PERMANENT_LOAN_CASH_OUT = ["distribute", "limit_to_payoff"] as const;
export const MAX_PERMANENT_LOAN_TERM_YEARS = 40;
export const MAX_PERMANENT_LOAN_AMORTIZATION_YEARS = 40;
export const MAX_PERMANENT_LOAN_WINDOW_MONTHS = 24;
export const MAX_PERMANENT_LOAN_FUNDING_OFFSET_MONTHS = 240;
export const MAX_PERMANENT_LOAN_SOURCE_LABEL_LENGTH = 500;

export type PermanentLoanSizingMode = (typeof PERMANENT_LOAN_SIZING_MODES)[number];
export type PermanentLoanCashOut = (typeof PERMANENT_LOAN_CASH_OUT)[number];

/** Terms every permanent loan carries, each with its own source and review state. */
export const PERMANENT_LOAN_ASSUMPTION_KEYS = [
  "fundingMonth",
  "sizingMode",
  "sizingNoiWindow",
  "noiTaxBasis",
  "annualRatePercent",
  "interestOnlyMonths",
  "amortizationYears",
  "termYears",
  "feePercent",
  "closingCosts",
  "cashOut",
] as const;

/** Caps and the valuation cap rate need evidence only when the case sets them. */
export const PERMANENT_LOAN_CAP_KEYS = [
  "maxLoanToValuePercent",
  "valuationCapRatePercent",
  "commercialValuationCapRatePercent",
  "minDebtServiceCoverage",
  "minDebtYieldPercent",
] as const;

export type PermanentLoanAssumptionKey = (typeof PERMANENT_LOAN_ASSUMPTION_KEYS)[number];
export type PermanentLoanCapKey = (typeof PERMANENT_LOAN_CAP_KEYS)[number];

/** The first stabilized month plus an offset (Benjamin Input!T685), or a named milestone plus an offset. */
export type PermanentLoanFundingAnchor = { kind: "stabilization"; offsetMonths: number } | MilestoneAnchor;

/** The NOI the caps read: an annualized trailing window ending the month before funding, or the twelve months from funding. */
export type PermanentLoanNoiWindow = { kind: "trailing"; months: number } | { kind: "forward_twelve" };

export type PermanentLoanPlan = {
  permanentLoanInputVersion: typeof PERMANENT_LOAN_INPUT_VERSION;
  /** A typed funding month. Set this or `fundingAnchor`, not both. */
  fundingMonth?: string;
  fundingAnchor?: PermanentLoanFundingAnchor;
  sizingMode: PermanentLoanSizingMode;
  sizingNoiWindow: PermanentLoanNoiWindow;
  noiTaxBasis: (typeof LOAN_SIZING_TAX_BASES)[number];
  maxLoanToValuePercent?: number;
  /** Turns the sizing NOI into value. Required with an LTV cap; with no cap it still reports LTV. */
  valuationCapRatePercent?: number;
  /**
   * Cap rate for the commercial spaces' part of the sizing NOI (LA-1869). With it the LTV cap values the
   * residential NOI at `valuationCapRatePercent` and the commercial NOI at this rate. Absent keeps one cap
   * for the whole NOI. It needs an LTV cap and a commercial block on the case, and carries its own evidence.
   */
  commercialValuationCapRatePercent?: number;
  minDebtServiceCoverage?: number;
  minDebtYieldPercent?: number;
  annualRatePercent: number;
  /** Payment months that pay interest only, counted from the first month after funding. */
  interestOnlyMonths: number;
  /** Zero is interest only for the whole term. */
  amortizationYears: number;
  /** The sale must fall on or before maturity, the funding month plus the term. */
  termYears: number;
  /** Of the loan amount, paid from proceeds. */
  feePercent: number;
  /** Fixed, paid from proceeds. */
  closingCosts: number;
  /** Proceeds above the construction payoff and costs go to the equity holders, or the loan is cut back to payoff. */
  cashOut: PermanentLoanCashOut;
  evidence: Record<PermanentLoanAssumptionKey, DevelopmentCapitalEvidence> & Partial<Record<PermanentLoanCapKey, DevelopmentCapitalEvidence>>;
};

export type PermanentLoanIssueCode =
  | "invalid_permanent_loan"
  | "permanent_loan_funding_unavailable"
  | "permanent_loan_sizing_unavailable"
  | "permanent_loan_window_before_operations"
  | "permanent_loan_after_maturity"
  | "permanent_loan_zero_amount"
  | "permanent_loan_commercial_unavailable"
  | "missing_evidence"
  | "invalid_source_label"
  | "invalid_source_date"
  | "invalid_review_state"
  | "text_too_long";

export type PermanentLoanIssue = { path: string; code: PermanentLoanIssueCode; message: string };

/** What set the loan amount: the smallest NOI cap, the construction balance, or the cut back to payoff. */
export type PermanentLoanBindingKey = "loanToValue" | "debtYield" | "debtServiceCoverage" | "constructionBalance" | "payoffLimit";

export type MonthlyPermanentLoan = {
  month: string;
  openingBalance: number;
  /** Gross loan proceeds, in the funding month only. */
  proceeds: number;
  fee: number;
  closingCosts: number;
  /** The construction loan balance the proceeds repay, in the funding month only. */
  constructionPayoff: number;
  /** Net proceeds above the construction payoff, paid to the equity holders. */
  cashOut: number;
  /** Construction payoff above net proceeds, paid by the equity holders. */
  equityPaydown: number;
  interest: number;
  principal: number;
  debtService: number;
  /** The balance repaid from sale proceeds, in the sale month only. */
  payoff: number;
  closingBalance: number;
  operatingCashFlow: number;
  /** Operating cash flow less debt service, after funding. */
  cashFlowAfterDebtService: number;
  /** Debt service and operating shortfall that operating cash does not cover, funded by the equity holders. */
  equityCall: number;
};

export type PermanentLoanTrace = {
  key: string;
  label: string;
  formula: string;
  inputPaths: string[];
};

export type PermanentLoanResult = {
  fundingMonth: string;
  /** How the funding month was set, in words, for the run page. */
  fundingTrace: string;
  maturityMonth: string;
  saleMonth: string;
  sizingMode: PermanentLoanSizingMode;
  binding: PermanentLoanBindingKey;
  sizingWindow: { kind: PermanentLoanNoiWindow["kind"]; startMonth: string; endMonth: string; monthCount: number };
  noiTaxBasis: PermanentLoanPlan["noiTaxBasis"];
  /** Annualized NOI on the chosen tax basis. The caps and coverage read it. */
  sizingNoi: number;
  scheduledTaxSizingNoi: number;
  fullTaxSizingNoi: number;
  /** Every NOI cap the case sets, with the one that binds marked. */
  caps: LoanSizingCap[];
  loanAmount: number;
  fee: number;
  closingCosts: number;
  netProceeds: number;
  constructionPayoff: number;
  cashOut: number;
  equityPaydown: number;
  /** The level monthly payment once amortization starts; null for a loan that never amortizes. */
  monthlyPayment: number | null;
  /** Twelve level payments, or twelve months of interest on the loan amount when it never amortizes. */
  annualDebtService: number;
  annualDebtServiceFormula: string;
  /** Debt service in the first twelve months after funding, or fewer when the sale comes sooner. */
  firstYearDebtService: number;
  firstYearMonthCount: number;
  totalInterest: number;
  totalPrincipal: number;
  totalDebtService: number;
  payoffAtSale: number;
  equityCalls: number;
  /** Sizing NOI over annual debt service, on the chosen tax basis and on each basis. */
  debtServiceCoverage: number | null;
  debtServiceCoverageScheduledTax: number | null;
  debtServiceCoverageFullTax: number | null;
  debtYield: number;
  /** Loan over sizing NOI capitalized at the valuation cap rate; null without one. */
  loanToValue: number | null;
  /** The balance after the last payment of each whole loan year that ends on or before the sale. */
  loanYearBalances: Array<{ loanYear: number; endMonth: string; balance: number }>;
  months: MonthlyPermanentLoan[];
  formulaTraces: PermanentLoanTrace[];
  reconciliations: ReconciliationCheck[];
};

export function validatePermanentLoanPlan(value: unknown): PermanentLoanIssue[] {
  const path = "permanentLoan";
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ path, code: "invalid_permanent_loan", message: "Permanent loan must be an object." }];
  }
  const plan = value as PermanentLoanPlan;
  const issues: PermanentLoanIssue[] = [];
  const bad = (field: string, message: string) => issues.push({ path: `${path}.${field}`, code: "invalid_permanent_loan", message });
  if (plan.permanentLoanInputVersion !== PERMANENT_LOAN_INPUT_VERSION) bad("permanentLoanInputVersion", `Use ${PERMANENT_LOAN_INPUT_VERSION}.`);
  const typed = plan.fundingMonth !== undefined;
  const anchored = plan.fundingAnchor !== undefined;
  if (typed === anchored) bad("fundingMonth", "Set a funding month or a funding anchor, not both.");
  if (typed && monthIndex(plan.fundingMonth) === null) bad("fundingMonth", "Funding month must use YYYY-MM.");
  if (anchored) {
    const anchor = plan.fundingAnchor as Record<string, unknown> | null;
    const offset = anchor && typeof anchor === "object" ? anchor.offsetMonths : undefined;
    const offsetOk = typeof offset === "number" && Number.isInteger(offset) && Math.abs(offset) <= MAX_PERMANENT_LOAN_FUNDING_OFFSET_MONTHS;
    const target = anchor && typeof anchor === "object" && (anchor.kind === "stabilization" || (anchor.kind === undefined && typeof anchor.milestoneId === "string" && anchor.milestoneId !== ""));
    if (!target) bad("fundingAnchor", "Anchor the funding to the first stabilized month or to a named milestone.");
    if (!offsetOk) bad("fundingAnchor.offsetMonths", `The offset must be a whole number of months, no more than ${MAX_PERMANENT_LOAN_FUNDING_OFFSET_MONTHS} either way.`);
  }
  if (!PERMANENT_LOAN_SIZING_MODES.includes(plan.sizingMode)) bad("sizingMode", "Size the loan on the lesser of the tests or on the construction balance.");
  const window = plan.sizingNoiWindow as PermanentLoanNoiWindow | undefined;
  if (!window || typeof window !== "object" || (window.kind !== "trailing" && window.kind !== "forward_twelve")) {
    bad("sizingNoiWindow", "Size on a trailing NOI window or on the forward twelve months.");
  } else if (window.kind === "trailing" && !(Number.isInteger(window.months) && window.months >= 1 && window.months <= MAX_PERMANENT_LOAN_WINDOW_MONTHS)) {
    bad("sizingNoiWindow.months", `The trailing window must be a whole number of months from 1 to ${MAX_PERMANENT_LOAN_WINDOW_MONTHS}.`);
  }
  if (!LOAN_SIZING_TAX_BASES.includes(plan.noiTaxBasis)) bad("noiTaxBasis", "Size on full tax or abated tax.");
  const positive = (field: unknown, max: number) => typeof field === "number" && Number.isFinite(field) && field > 0 && field <= max;
  if (plan.maxLoanToValuePercent !== undefined && !positive(plan.maxLoanToValuePercent, 100)) bad("maxLoanToValuePercent", "Maximum LTV must be above zero and no more than 100 percent.");
  if (plan.valuationCapRatePercent !== undefined && !positive(plan.valuationCapRatePercent, 100)) bad("valuationCapRatePercent", "Valuation cap rate must be above zero and no more than 100 percent.");
  if (plan.commercialValuationCapRatePercent !== undefined) {
    if (!positive(plan.commercialValuationCapRatePercent, 100)) bad("commercialValuationCapRatePercent", "Commercial valuation cap rate must be above zero and no more than 100 percent.");
    else if (plan.maxLoanToValuePercent === undefined) bad("commercialValuationCapRatePercent", "Enter a maximum LTV to use the commercial valuation cap rate.");
  }
  if (plan.maxLoanToValuePercent !== undefined && plan.valuationCapRatePercent === undefined) bad("valuationCapRatePercent", "Enter the cap rate that values the sizing NOI for the LTV cap.");
  if (plan.minDebtServiceCoverage !== undefined && !positive(plan.minDebtServiceCoverage, 10)) bad("minDebtServiceCoverage", "Minimum DSCR must be above zero and no more than 10.");
  if (plan.minDebtYieldPercent !== undefined && !positive(plan.minDebtYieldPercent, 100)) bad("minDebtYieldPercent", "Minimum debt yield must be above zero and no more than 100 percent.");
  const anyCap = plan.maxLoanToValuePercent !== undefined || plan.minDebtServiceCoverage !== undefined || plan.minDebtYieldPercent !== undefined;
  if (plan.sizingMode === "lesser_of_tests" && !anyCap) bad("sizingMode", "Sizing on the lesser of the tests needs at least one cap: LTV, DSCR or debt yield.");
  if (!positive(plan.annualRatePercent, 100)) bad("annualRatePercent", "Rate must be above zero and no more than 100 percent.");
  const termOk = Number.isInteger(plan.termYears) && plan.termYears >= 1 && plan.termYears <= MAX_PERMANENT_LOAN_TERM_YEARS;
  if (!termOk) bad("termYears", `Term must be a whole number of years from 1 to ${MAX_PERMANENT_LOAN_TERM_YEARS}.`);
  if (!(Number.isInteger(plan.amortizationYears) && plan.amortizationYears >= 0 && plan.amortizationYears <= MAX_PERMANENT_LOAN_AMORTIZATION_YEARS)) {
    bad("amortizationYears", `Amortization must be a whole number of years from 0 (interest only) to ${MAX_PERMANENT_LOAN_AMORTIZATION_YEARS}.`);
  }
  if (!(Number.isInteger(plan.interestOnlyMonths) && plan.interestOnlyMonths >= 0 && (!termOk || plan.interestOnlyMonths <= plan.termYears * 12))) {
    bad("interestOnlyMonths", "Interest-only months must be a whole number from zero to the term in months.");
  }
  if (!(typeof plan.feePercent === "number" && Number.isFinite(plan.feePercent) && plan.feePercent >= 0 && plan.feePercent < 100)) bad("feePercent", "Fee must be from 0 to under 100 percent.");
  if (!validUsd(plan.closingCosts)) bad("closingCosts", "Closing costs must be zero or a positive USD amount with no more than two decimal places.");
  if (!PERMANENT_LOAN_CASH_OUT.includes(plan.cashOut)) bad("cashOut", "Send proceeds above payoff to the equity holders, or cut the loan back to payoff.");
  issues.push(...validateEvidence(plan));
  return issues;
}

function validateEvidence(plan: PermanentLoanPlan): PermanentLoanIssue[] {
  const evidence = plan.evidence as Record<string, DevelopmentCapitalEvidence | undefined> | undefined;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    return [{ path: "permanentLoan.evidence", code: "missing_evidence", message: "Add source and review details for the permanent loan terms." }];
  }
  const keys: string[] = [...PERMANENT_LOAN_ASSUMPTION_KEYS, ...PERMANENT_LOAN_CAP_KEYS.filter((key) => plan[key] !== undefined)];
  const issues: PermanentLoanIssue[] = [];
  for (const key of keys) {
    const item = evidence[key];
    const path = `permanentLoan.evidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path, code: "missing_evidence", message: "Add source and review details." });
      continue;
    }
    if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") issues.push({ path: `${path}.sourceLabel`, code: "invalid_source_label", message: "Source label must be text." });
    else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_PERMANENT_LOAN_SOURCE_LABEL_LENGTH) issues.push({ path: `${path}.sourceLabel`, code: "text_too_long", message: `Source label cannot exceed ${MAX_PERMANENT_LOAN_SOURCE_LABEL_LENGTH} characters.` });
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  }
  return issues;
}

/**
 * The funding month: typed, the first stabilized month plus an offset, or a milestone plus an offset.
 * The plan must already be valid.
 */
export function resolvePermanentLoanFundingMonth(
  plan: PermanentLoanPlan,
  context: { firstStabilizedMonth?: string; milestones?: Milestone[] },
): { month: string; trace: string } | PermanentLoanIssue {
  if (plan.fundingMonth !== undefined) return { month: plan.fundingMonth, trace: `typed funding month ${plan.fundingMonth}` };
  const anchor = plan.fundingAnchor!;
  const offsetText = (offset: number) => offset === 0 ? "" : offset > 0 ? ` plus ${offset} months` : ` less ${-offset} months`;
  if ("kind" in anchor) {
    if (!context.firstStabilizedMonth) {
      return { path: "permanentLoan.fundingAnchor", code: "permanent_loan_funding_unavailable", message: "The funding month follows stabilization, and this run does not reach a stabilized month." };
    }
    const month = addMonths(context.firstStabilizedMonth, anchor.offsetMonths);
    return { month, trace: `first stabilized month ${context.firstStabilizedMonth}${offsetText(anchor.offsetMonths)}` };
  }
  const milestone = context.milestones?.find(({ id }) => id === anchor.milestoneId);
  if (!milestone || monthIndex(milestone.month) === null) {
    return { path: "permanentLoan.fundingAnchor.milestoneId", code: "permanent_loan_funding_unavailable", message: "The funding anchor names a milestone the case does not have." };
  }
  return { month: addMonths(milestone.month, anchor.offsetMonths), trace: `milestone ${milestone.name} (${milestone.month})${offsetText(anchor.offsetMonths)}` };
}

/** The last month a sizing window reads, so the caller can project operations far enough. */
export function permanentLoanWindowEndMonth(plan: PermanentLoanPlan, fundingMonth: string) {
  return plan.sizingNoiWindow.kind === "forward_twelve" ? addMonths(fundingMonth, 11) : addMonths(fundingMonth, -1);
}

export type PermanentLoanSchedule = {
  plan: PermanentLoanPlan;
  fundingMonth: string;
  fundingTrace: string;
  /** The construction balance the takeout repays, from the capital schedule. */
  constructionPayoffCents: number;
  /** The capital schedule's months, funding month through sale month included. */
  months: Array<{ month: string; operatingCashFlow: number }>;
  /** Operations from the analysis start through at least the end of the sizing window. */
  operations: MonthlyApartmentOperations[];
  analysisStartMonth: string;
  /** The first month of operations. A trailing sizing window may not start before it. */
  operationStartMonth: string;
  /** Operating input paths the sizing NOI reads, for the traces. */
  operationPaths: string[];
  /** The share of the property tax the commercial use carries in a month, as a percent. Absent when the case has no commercial block. */
  commercialTaxSharePercent?: (month: string) => number;
};

/** Sizes the loan, runs its monthly schedule from funding through sale, and checks every month. */
export function schedulePermanentLoan(input: PermanentLoanSchedule): PermanentLoanResult | PermanentLoanIssue {
  const { plan, fundingMonth, constructionPayoffCents, months } = input;
  const fundingPosition = months.findIndex(({ month }) => month === fundingMonth);
  const saleMonth = months.at(-1)!.month;
  if (fundingPosition < 0 || fundingPosition === months.length - 1) {
    return { path: "permanentLoan.fundingMonth", code: "invalid_permanent_loan", message: `The permanent loan must fund inside the model timeline and before the sale month; it funds in ${fundingMonth}.` };
  }
  const maturityMonth = addMonths(fundingMonth, plan.termYears * 12);
  if (monthIndex(saleMonth)! > monthIndex(maturityMonth)!) {
    return { path: "permanentLoan.termYears", code: "permanent_loan_after_maturity", message: `The sale in ${saleMonth} falls after the permanent loan matures in ${maturityMonth}. Lengthen the term or move the sale.` };
  }

  const window = sizingWindow(plan, fundingMonth);
  if (monthIndex(window.startMonth)! < monthIndex(input.analysisStartMonth)!) {
    return { path: "permanentLoan.sizingNoiWindow", code: "permanent_loan_sizing_unavailable", message: `The trailing sizing window starts in ${window.startMonth}, before the analysis start. Shorten the window or fund later.` };
  }
  if (window.kind === "trailing" && monthIndex(window.startMonth)! < monthIndex(input.operationStartMonth)!) {
    const before = monthIndex(input.operationStartMonth)! - monthIndex(window.startMonth)!;
    const longest = monthIndex(fundingMonth)! - monthIndex(input.operationStartMonth)!;
    const earliest = addMonths(input.operationStartMonth, window.monthCount);
    const fit = longest >= 1
      ? `The longest window that fits is ${longest} ${longest === 1 ? "month" : "months"}, or fund no earlier than ${earliest}.`
      : `No trailing window fits a ${fundingMonth} funding, so fund no earlier than ${addMonths(input.operationStartMonth, 1)}.`;
    return {
      path: "permanentLoan.sizingNoiWindow.months",
      code: "permanent_loan_window_before_operations",
      message: `The ${window.monthCount}-month trailing window runs ${window.startMonth} to ${window.endMonth}, and ${before} of those ${before === 1 ? "month falls" : "months fall"} before operations start in ${input.operationStartMonth}. ${fit}`,
    };
  }
  const windowMonths = input.operations.filter(({ month }) => month >= window.startMonth && month <= window.endMonth);
  if (windowMonths.length !== window.monthCount) {
    return { path: "permanentLoan.sizingNoiWindow", code: "permanent_loan_sizing_unavailable", message: "The operating projection does not cover the sizing window." };
  }
  const scheduledSumCents = windowMonths.reduce((total, month) => total + cents(month.netOperatingIncome), 0);
  const abatementSumCents = windowMonths.reduce((total, month) => total + cents(month.fullPropertyTax) - cents(month.propertyTax), 0);
  const annualize = (sumCents: number) => Math.round(sumCents * 12 / window.monthCount);
  const scheduledNoiCents = annualize(scheduledSumCents);
  const fullNoiCents = annualize(scheduledSumCents - abatementSumCents);
  const noiCents = plan.noiTaxBasis === "full_tax" ? fullNoiCents : scheduledNoiCents;
  const anyCap = plan.maxLoanToValuePercent !== undefined || plan.minDebtServiceCoverage !== undefined || plan.minDebtYieldPercent !== undefined;
  if ((anyCap || plan.sizingMode === "lesser_of_tests") && noiCents <= 0) {
    return { path: "permanentLoan.sizingNoiWindow", code: "permanent_loan_sizing_unavailable", message: "The sizing window has no positive NOI on the chosen tax basis, so the caps cannot size a loan." };
  }

  const windowText = window.kind === "forward_twelve"
    ? `NOI before reserves for the twelve months from funding (${window.startMonth} to ${window.endMonth})`
    : `NOI before reserves for the ${window.monthCount} months before funding (${window.startMonth} to ${window.endMonth}), annualized`;
  const noiText = `${windowText}${plan.noiTaxBasis === "full_tax" ? " with full tax" : " with scheduled tax"}`;
  const noiPaths = [...input.operationPaths, "permanentLoan.sizingNoiWindow", "permanentLoan.noiTaxBasis", ...fundingPaths(plan)];
  if (plan.commercialValuationCapRatePercent !== undefined && !input.commercialTaxSharePercent) {
    return { path: "permanentLoan.commercialValuationCapRatePercent", code: "permanent_loan_commercial_unavailable", message: "The commercial valuation cap rate needs commercial spaces on the case. Add them or remove the rate." };
  }
  const commercialNoiCents = plan.commercialValuationCapRatePercent === undefined
    ? null
    : annualize(splitNoiByUse(windowMonths, "netOperatingIncome", plan.noiTaxBasis === "full_tax" ? "full" : "scheduled", input.commercialTaxSharePercent!).commercialCents);
  const commercialTerm = plan.commercialValuationCapRatePercent === undefined || commercialNoiCents === null
    ? {}
    : { commercial: { noiCents: commercialNoiCents, capRatePercent: plan.commercialValuationCapRatePercent } };
  const noiCaps = noiSizingCaps(noiCents, {
    maxLoanToValuePercent: plan.maxLoanToValuePercent,
    capRatePercent: plan.valuationCapRatePercent,
    ...commercialTerm,
    minDebtYieldPercent: plan.minDebtYieldPercent,
    minDebtServiceCoverage: plan.minDebtServiceCoverage,
    ratePercent: plan.annualRatePercent,
    amortizationYears: plan.amortizationYears,
  }, { noi: noiText, value: "value", capRate: "the valuation cap rate" }, {
    noi: noiPaths,
    capRate: "permanentLoan.valuationCapRatePercent",
    commercialCapRate: "permanentLoan.commercialValuationCapRatePercent",
    loanToValue: "permanentLoan.maxLoanToValuePercent",
    debtYield: "permanentLoan.minDebtYieldPercent",
    debtServiceCoverage: "permanentLoan.minDebtServiceCoverage",
    rate: "permanentLoan.annualRatePercent",
    amortization: "permanentLoan.amortizationYears",
  });

  const closingCents = cents(plan.closingCosts);
  const feeOn = (loanCents: number) => Math.round(loanCents * plan.feePercent / 100);
  const netOf = (loanCents: number) => loanCents - feeOn(loanCents) - closingCents;
  const smallestCap = noiCaps.reduce<(typeof noiCaps)[number] | null>((low, cap) => !low || cap.amountCents < low.amountCents ? cap : low, null);
  let loanCents: number;
  let binding: PermanentLoanBindingKey;
  if (plan.sizingMode === "construction_balance") {
    loanCents = constructionPayoffCents;
    binding = "constructionBalance";
  } else {
    loanCents = smallestCap!.amountCents;
    binding = smallestCap!.key;
  }
  if (plan.cashOut === "limit_to_payoff") {
    const limitCents = payoffLimitCents(constructionPayoffCents, closingCents, plan.feePercent, netOf);
    if (limitCents < loanCents) {
      loanCents = limitCents;
      binding = "payoffLimit";
    }
  }
  if (loanCents <= 0) {
    return { path: "permanentLoan", code: "permanent_loan_zero_amount", message: "The permanent loan sizes to zero. Check the construction balance and the caps." };
  }
  const feeCents = feeOn(loanCents);
  const netProceedsCents = loanCents - feeCents - closingCents;
  const cashOutCents = Math.max(netProceedsCents - constructionPayoffCents, 0);
  const equityPaydownCents = Math.max(constructionPayoffCents - netProceedsCents, 0);

  const monthlyRate = plan.annualRatePercent / 1200;
  const amortizationMonths = plan.amortizationYears * 12;
  const paymentCents = amortizationMonths > 0 ? Math.round(loanCents * monthlyRate / (1 - (1 + monthlyRate) ** -amortizationMonths)) : null;
  const annualDebtServiceCents = paymentCents !== null ? paymentCents * 12 : Math.round(loanCents * monthlyRate) * 12;
  const annualDebtServiceFormula = paymentCents !== null
    ? `twelve level monthly payments at ${plan.annualRatePercent} percent over ${plan.amortizationYears} years`
    : `twelve months of interest at ${plan.annualRatePercent} percent on the loan amount, interest only`;

  const rows: MonthlyPermanentLoan[] = [];
  let openingCents = 0;
  months.slice(fundingPosition).forEach((month, offset) => {
    const isFunding = offset === 0;
    const isSale = fundingPosition + offset === months.length - 1;
    const proceedsCents = isFunding ? loanCents : 0;
    const interestCents = Math.round(openingCents * monthlyRate);
    const amortizing = !isFunding && paymentCents !== null && offset > plan.interestOnlyMonths;
    const principalCents = amortizing ? Math.min(Math.max(paymentCents - interestCents, 0), openingCents) : 0;
    const debtServiceCents = interestCents + principalCents;
    const balanceCents = openingCents + proceedsCents - principalCents;
    const payoffCents = isSale ? balanceCents : 0;
    const operatingCents = cents(month.operatingCashFlow);
    const afterDebtServiceCents = isFunding ? 0 : operatingCents - debtServiceCents;
    rows.push({
      month: month.month,
      openingBalance: dollars(openingCents),
      proceeds: dollars(proceedsCents),
      fee: dollars(isFunding ? feeCents : 0),
      closingCosts: dollars(isFunding ? closingCents : 0),
      constructionPayoff: dollars(isFunding ? constructionPayoffCents : 0),
      cashOut: dollars(isFunding ? cashOutCents : 0),
      equityPaydown: dollars(isFunding ? equityPaydownCents : 0),
      interest: dollars(interestCents),
      principal: dollars(principalCents),
      debtService: dollars(debtServiceCents),
      payoff: dollars(payoffCents),
      closingBalance: dollars(balanceCents - payoffCents),
      operatingCashFlow: dollars(operatingCents),
      cashFlowAfterDebtService: dollars(afterDebtServiceCents),
      equityCall: dollars(Math.max(-afterDebtServiceCents, 0)),
    });
    openingCents = balanceCents - payoffCents;
  });

  const sumOf = (key: keyof MonthlyPermanentLoan) => rows.reduce((total, row) => total + cents(row[key] as number), 0);
  const firstYear = rows.slice(1, 13);
  const firstYearDebtServiceCents = firstYear.reduce((total, row) => total + cents(row.debtService), 0);
  const coverage = (noi: number) => annualDebtServiceCents > 0 ? noi / annualDebtServiceCents : null;
  const loanYearBalances = Array.from({ length: plan.termYears }, (_, index) => index + 1)
    .filter((loanYear) => loanYear * 12 < rows.length)
    .map((loanYear) => {
      const row = rows[loanYear * 12];
      return { loanYear, endMonth: row.month, balance: dollars(cents(row.closingBalance) + cents(row.payoff)) };
    });
  const caps: LoanSizingCap[] = noiCaps.map(({ amountCents: _amountCents, ...cap }) => {
    void _amountCents;
    return { ...cap, binding: cap.key === binding };
  });
  const valueCents = plan.valuationCapRatePercent === undefined
    ? null
    : commercialNoiCents === null
      ? Math.round(noiCents / (plan.valuationCapRatePercent / 100))
      : Math.round((noiCents - commercialNoiCents) / (plan.valuationCapRatePercent / 100)) + Math.round(commercialNoiCents / (plan.commercialValuationCapRatePercent! / 100));

  const result: PermanentLoanResult = {
    fundingMonth,
    fundingTrace: input.fundingTrace,
    maturityMonth,
    saleMonth,
    sizingMode: plan.sizingMode,
    binding,
    sizingWindow: window,
    noiTaxBasis: plan.noiTaxBasis,
    sizingNoi: dollars(noiCents),
    scheduledTaxSizingNoi: dollars(scheduledNoiCents),
    fullTaxSizingNoi: dollars(fullNoiCents),
    caps,
    loanAmount: dollars(loanCents),
    fee: dollars(feeCents),
    closingCosts: dollars(closingCents),
    netProceeds: dollars(netProceedsCents),
    constructionPayoff: dollars(constructionPayoffCents),
    cashOut: dollars(cashOutCents),
    equityPaydown: dollars(equityPaydownCents),
    monthlyPayment: paymentCents === null ? null : dollars(paymentCents),
    annualDebtService: dollars(annualDebtServiceCents),
    annualDebtServiceFormula,
    firstYearDebtService: dollars(firstYearDebtServiceCents),
    firstYearMonthCount: firstYear.length,
    totalInterest: dollars(sumOf("interest")),
    totalPrincipal: dollars(sumOf("principal")),
    totalDebtService: dollars(sumOf("debtService")),
    payoffAtSale: rows.at(-1)!.payoff,
    equityCalls: dollars(sumOf("equityCall")),
    debtServiceCoverage: coverage(noiCents),
    debtServiceCoverageScheduledTax: coverage(scheduledNoiCents),
    debtServiceCoverageFullTax: coverage(fullNoiCents),
    debtYield: noiCents / loanCents,
    loanToValue: valueCents === null || valueCents <= 0 ? null : loanCents / valueCents,
    loanYearBalances,
    months: rows,
    formulaTraces: traces(plan, noiText, noiPaths, binding, annualDebtServiceFormula),
    reconciliations: [],
  };
  result.reconciliations = reconcile(result, plan);
  return result;
}

/** The smallest loan whose net proceeds cover the payoff: net proceeds rise by zero or one cent per cent of loan, so one exists. */
function payoffLimitCents(payoffCents: number, closingCents: number, feePercent: number, netOf: (loanCents: number) => number) {
  let loanCents = Math.ceil((payoffCents + closingCents) / (1 - feePercent / 100));
  while (netOf(loanCents) < payoffCents) loanCents += 1;
  while (loanCents > 0 && netOf(loanCents - 1) >= payoffCents) loanCents -= 1;
  return loanCents;
}

function sizingWindow(plan: PermanentLoanPlan, fundingMonth: string) {
  if (plan.sizingNoiWindow.kind === "forward_twelve") {
    return { kind: "forward_twelve" as const, startMonth: fundingMonth, endMonth: addMonths(fundingMonth, 11), monthCount: 12 };
  }
  const count = plan.sizingNoiWindow.months;
  return { kind: "trailing" as const, startMonth: addMonths(fundingMonth, -count), endMonth: addMonths(fundingMonth, -1), monthCount: count };
}

function fundingPaths(plan: PermanentLoanPlan) {
  return plan.fundingMonth !== undefined ? ["permanentLoan.fundingMonth"] : ["permanentLoan.fundingAnchor"];
}

function reconcile(result: PermanentLoanResult, plan: PermanentLoanPlan): ReconciliationCheck[] {
  const rate = plan.annualRatePercent / 1200;
  const last = result.months.at(-1)!;
  return [
    ...result.months.flatMap((row) => [
      checkUsd(
        `permanent-loan-roll-forward:${row.month}`,
        `${row.month} permanent loan opening balance plus proceeds less principal and payoff equals closing`,
        row.closingBalance,
        money(row.openingBalance, row.proceeds, -row.principal, -row.payoff),
      ),
      checkUsd(
        `permanent-loan-interest:${row.month}`,
        `${row.month} permanent loan interest equals the opening balance times the rate over twelve`,
        dollars(Math.round(cents(row.openingBalance) * rate)),
        row.interest,
      ),
    ]),
    checkUsd(
      "permanent-loan-takeout",
      "Permanent loan proceeds equal the construction payoff plus fee and closing costs plus cash-out, less any equity paydown",
      result.loanAmount,
      money(result.constructionPayoff, result.fee, result.closingCosts, result.cashOut, -result.equityPaydown),
    ),
    checkUsd(
      "permanent-loan-sale-payoff",
      "The sale repays the permanent loan balance outstanding after the sale month's payment",
      money(last.openingBalance, last.proceeds, -last.principal),
      result.payoffAtSale,
    ),
    checkUsd("permanent-loan-paid-off", "The permanent loan balance is zero after the sale", 0, last.closingBalance),
    {
      id: "permanent-loan-maturity",
      label: "The sale falls on or before the permanent loan matures",
      expected: Math.min(monthIndex(result.saleMonth)!, monthIndex(result.maturityMonth)!),
      actual: monthIndex(result.saleMonth)!,
      difference: monthIndex(result.saleMonth)! - Math.min(monthIndex(result.saleMonth)!, monthIndex(result.maturityMonth)!),
      tolerance: 0,
      status: monthIndex(result.saleMonth)! <= monthIndex(result.maturityMonth)! ? "pass" : "fail",
      unit: "count",
    },
  ];
}

function traces(plan: PermanentLoanPlan, noiText: string, noiPaths: string[], binding: PermanentLoanBindingKey, annualFormula: string): PermanentLoanTrace[] {
  const terms = ["permanentLoan.annualRatePercent", "permanentLoan.interestOnlyMonths", "permanentLoan.amortizationYears"];
  const sizing = plan.sizingMode === "construction_balance"
    ? "the construction loan balance repaid in the funding month"
    : "the smallest NOI cap";
  const limit = plan.cashOut === "limit_to_payoff" ? ", cut back to the smallest loan whose net proceeds cover the construction payoff" : "";
  return [
    { key: "fundingMonth", label: "Funding Month", formula: plan.fundingMonth !== undefined ? "the typed funding month" : "the anchor month plus the offset; the construction loan repays this month", inputPaths: fundingPaths(plan) },
    { key: "sizingNoi", label: "Sizing NOI", formula: noiText, inputPaths: noiPaths },
    { key: "loanAmount", label: "Permanent Loan Amount", formula: `${sizing}${limit}; it binds on ${binding}`, inputPaths: ["permanentLoan.sizingMode", "permanentLoan.cashOut", ...noiPaths, "costLines", "targetDebtSharePercent"] },
    { key: "fee", label: "Permanent Loan Fee", formula: "loan amount times the fee percent, paid from proceeds", inputPaths: ["permanentLoan.feePercent"] },
    { key: "netProceeds", label: "Net Proceeds", formula: "loan amount less fee and closing costs", inputPaths: ["permanentLoan.feePercent", "permanentLoan.closingCosts"] },
    { key: "cashOut", label: "Cash-Out", formula: "net proceeds above the construction payoff, paid to the equity holders in the funding month", inputPaths: ["permanentLoan.cashOut", "permanentLoan.sizingMode"] },
    { key: "equityPaydown", label: "Equity Paydown", formula: "construction payoff above net proceeds, paid by the equity holders in the funding month", inputPaths: ["permanentLoan.sizingMode", "permanentLoan.feePercent", "permanentLoan.closingCosts"] },
    { key: "interest", label: "Permanent Loan Interest", formula: "opening permanent balance times the annual rate divided by twelve, from the month after funding", inputPaths: ["permanentLoan.annualRatePercent"] },
    { key: "principal", label: "Permanent Loan Principal", formula: "after the interest-only months, a level monthly payment on the loan amount over the amortization less that month's interest; none while interest only", inputPaths: terms },
    { key: "annualDebtService", label: "Annual Debt Service", formula: annualFormula, inputPaths: terms },
    { key: "equityCall", label: "Equity Call", formula: "debt service and operating shortfall that operating cash flow does not cover, funded by the equity holders", inputPaths: [...terms, "operatingExpenseLines"] },
    { key: "payoffAtSale", label: "Permanent Loan Payoff", formula: "the permanent balance outstanding after the sale month's payment, repaid from sale proceeds", inputPaths: [...terms, "saleMonth"] },
    { key: "maturityMonth", label: "Maturity", formula: "funding month plus the term; the sale must fall on or before it", inputPaths: ["permanentLoan.termYears", ...fundingPaths(plan)] },
  ];
}

function checkUsd(id: string, label: string, expected: number, actual: number): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit: "usd" };
}

function money(...values: number[]) {
  return dollars(values.reduce((sum, value) => sum + cents(value), 0));
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
