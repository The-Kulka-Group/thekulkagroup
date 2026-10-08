import { resolveMilestoneAnchors } from "./milestones";
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
  loanSizingCeiling,
  loanSizingResult,
  type LoanSizingResult,
  validateLenderTestPlan,
  type LenderTestPlan,
  type LenderTestsResult,
} from "./lender-tests";
import type { ReconciliationCheck } from "./monthly-cost-schedule";
import {
  peakEquityOf,
  runPartnershipWaterfall,
  validatePartnershipPlan,
  type PartnershipPlan,
  type PartnershipResult,
  type PeakEquity,
} from "./partnership-waterfall";
import { abatementValueAtSale, propertyTaxScheduleEndMonth, type PropertyTaxResult } from "./property-tax";
import { commercialTaxSharePercentFor, splitNoiByUse, valueByUse, type UseSplit } from "./use-split";
import { xirr, xnpv, yearsFrom, type XirrResult } from "./xirr";

export const PROPERTY_RETURNS_INPUT_VERSION = "property_returns_inputs.v1" as const;
export const SALE_TAX_INPUT_VERSION = "sale_tax_inputs.v1" as const;
/**
 * v2 adds lender tests (LA-1689). v3 adds the sale's tax basis, the abatement value at sale and the
 * full-tax lender tests (LA-1690). Runs saved under v1 and v2 stay readable.
 */
export const PROPERTY_RETURNS_FORMULA_VERSION = "underwriting.property_returns.v3" as const;
export const PROPERTY_RETURNS_V2_FORMULA_VERSION = "underwriting.property_returns.v2" as const;
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
/** Evidence for the commercial exit cap rate, required only when the plan states one (LA-1870). */
export const PROPERTY_RETURNS_COMMERCIAL_CAP_KEY = "commercialTerminalCapRatePercent" as const;

export type PropertyReturnsEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export const SALE_TAX_ASSUMPTION_KEYS = ["valueBasis", "abatementDiscountRatePercent"] as const;
export type SaleTaxAssumptionKey = typeof SALE_TAX_ASSUMPTION_KEYS[number];

/**
 * Which tax the sale prices. Scheduled tax caps the forward year as the property pays it. Full tax caps
 * it with no abatement, and the third basis adds the present value of the abatement left at sale.
 */
export type SaleTaxValueBasis = "scheduled_tax" | "full_tax" | "full_tax_plus_abatement_value";

export type SaleTaxPlan = {
  saleTaxInputVersion: typeof SALE_TAX_INPUT_VERSION;
  valueBasis: SaleTaxValueBasis;
  /** Required for full_tax_plus_abatement_value. One annual rate discounts every month of saved tax. */
  abatementDiscountRatePercent?: number;
  /** Discount rate evidence is required only when the basis uses it. */
  saleTaxEvidence: Partial<Record<SaleTaxAssumptionKey, PropertyReturnsEvidence>>;
};

export type SaleTaxResult = {
  valueBasis: SaleTaxValueBasis;
  scheduledTaxForwardNoi: number;
  fullTaxForwardNoi: number;
  scheduledTaxValue: number;
  fullTaxValue: number;
  abatementDiscountRatePercent: number | null;
  abatementValue: number | null;
  abatementEndMonth: string;
};

export type PropertyReturnsPlan = {
  saleInputVersion: typeof PROPERTY_RETURNS_INPUT_VERSION;
  terminalCapRatePercent: number;
  /**
   * Exit cap rate for the commercial spaces' forward NOI (LA-1870). With it, gross sale value is
   * residential forward NOI over `terminalCapRatePercent` plus commercial forward NOI over this rate.
   * Absent keeps one cap for the whole property. It needs a commercial block on the case, and evidence of its own.
   */
  commercialTerminalCapRatePercent?: number;
  sellingCostPercent: number;
  forwardNoiConvention: typeof FORWARD_TWELVE_MONTH_NOI_VERSION;
  cashFlowDateConvention: typeof MONTH_END_CASH_FLOW_DATES_VERSION;
  xirrConvention: typeof XIRR_ACTUAL_365_VERSION;
  saleAssumptionEvidence: Record<PropertyReturnsAssumptionKey, PropertyReturnsEvidence> & { commercialTerminalCapRatePercent?: PropertyReturnsEvidence };
  lenderTests?: LenderTestPlan;
  /** Required when the operating tax schedule carries an abatement, and allowed only then. */
  saleTax?: SaleTaxPlan;
  /** LP and GP funding and the distribution waterfall on levered cash flow (LA-1863). Absent runs no waterfall. */
  partnership?: PartnershipPlan;
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
  /** Grant and soft loan cash applied to the month's uses (LA-1813). Absent means zero. */
  otherSourcesApplied?: number;
  /** Soft loan principal and accrued interest repaid in the month (LA-1813). Absent means zero. */
  softLoanRepayment?: number;
  /** Gross permanent loan proceeds in the takeout month (LA-1867). Absent means zero. */
  permanentLoanProceeds?: number;
  /** Permanent loan fee and closing costs, paid from proceeds in the takeout month. Absent means zero. */
  refinanceCosts?: number;
  /** Permanent loan interest and principal paid in the month. Absent means zero. */
  permanentDebtService?: number;
  /** Permanent loan balance repaid from sale proceeds, in the sale month. Absent means zero. */
  permanentLoanPayoff?: number;
};

const PERMANENT_LOAN_MONTH_KEYS = ["permanentLoanProceeds", "refinanceCosts", "permanentDebtService", "permanentLoanPayoff"] as const;

export type ForwardSalePeriod = {
  startMonth: string;
  endMonth: string;
  monthCount: 12;
  effectiveGrossRevenue: number;
  operatingExpenses: number;
  /** Present value of the tax abatement left at sale, added to the capped value. Zero when absent. */
  abatementValue?: number;
  /**
   * Forward NOI of each use on the same tax basis as `operatingExpenses` (LA-1870). Required with a
   * commercial exit cap, and together they equal effective gross revenue less operating expenses.
   */
  residentialNetOperatingIncome?: number;
  commercialNetOperatingIncome?: number;
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
  | "invalid_noi_basis"
  | "invalid_loan_sizing"
  | "loan_sizing_unavailable"
  | "invalid_sale_tax"
  | "missing_sale_tax_basis"
  | "invalid_commercial_cap"
  | "invalid_partnership"
  | "partnership_outside_timeline";

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

export type SaleValueSplit = {
  residentialForwardNetOperatingIncome: number;
  commercialForwardNetOperatingIncome: number;
  residentialCapRatePercent: number;
  commercialCapRatePercent: number;
  residentialValue: number;
  commercialValue: number;
};

export type PropertyReturnsCalculationResult = {
  sale: {
    forwardEffectiveGrossRevenue: number;
    forwardOperatingExpenses: number;
    forwardNetOperatingIncome: number;
    abatementValue: number;
    /** Forward NOI and value by use. Present only with a commercial exit cap (LA-1870). The two values and the abatement value add to gross sale value. */
    valueSplit?: SaleValueSplit;
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
  /** Largest cumulative net equity out on levered cash flow, and the first month it is reached (LA-1863). Runs saved earlier read it as absent. */
  peakEquity?: PeakEquity;
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
  /** Present when the operating tax schedule carries an abatement. */
  saleTax: SaleTaxResult | null;
  /** The operating run's tax by fiscal year, when the case has a tax schedule. */
  propertyTax: PropertyTaxResult | null;
  /** The LP and GP waterfall when the case carries one (LA-1863). Runs saved earlier read it as null. */
  partnership: PartnershipResult | null;
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
  const anchors = resolveMilestoneAnchors(inputSnapshot);
  if (anchors.issues.length > 0) return failedFull(inputSnapshot, anchors.issues);
  if (inputSnapshot.lenderTests !== undefined) {
    const lenderIssues = validateLenderTestPlan(inputSnapshot.lenderTests);
    if (lenderIssues.length > 0) return failedFull(inputSnapshot, lenderIssues);
  }
  if (inputSnapshot.partnership !== undefined) {
    const partnershipIssues = validatePartnershipPlan(inputSnapshot.partnership);
    if (partnershipIssues.length > 0) return failedFull(inputSnapshot, partnershipIssues);
  }
  const capIssues = commercialCapIssuesFor(inputSnapshot);
  if (capIssues.length > 0) return failedFull(inputSnapshot, capIssues);
  const firstCapitalRun = computeDevelopmentCapital(inputSnapshot);
  if (firstCapitalRun.status === "failed" || !firstCapitalRun.result) {
    return failedFull(inputSnapshot, firstCapitalRun.issues);
  }
  const forwardEndMonth = addMonths(inputSnapshot.saleMonth, 11);
  const abatementEndMonth = inputSnapshot.propertyTax ? propertyTaxScheduleEndMonth(inputSnapshot.propertyTax) : null;
  const projectionEndMonth = abatementEndMonth && monthIndex(abatementEndMonth)! > monthIndex(forwardEndMonth)!
    ? abatementEndMonth
    : forwardEndMonth;
  const allProjectedMonths = projectApartmentOperationsThrough(inputSnapshot, projectionEndMonth);
  const projectedMonths = allProjectedMonths.filter(({ month }) => monthIndex(month)! <= monthIndex(forwardEndMonth)!);
  /*
   * LA-1823: the valuation-year NOI does not depend on the loan, so lender NOI caps set a ceiling on
   * total debt and the capital plan funds again under it. The first run validated the inputs.
   */
  const sizing = inputSnapshot.lenderTests?.loanSizing;
  const ceiling = sizing ? loanSizingCeiling(inputSnapshot, projectedMonths) : null;
  if (ceiling && "code" in ceiling) return failedFull(inputSnapshot, [ceiling]);
  const capitalRun = ceiling?.maxLoanCents == null
    ? firstCapitalRun
    : computeDevelopmentCapital(inputSnapshot, { maxLoan: dollars(ceiling.maxLoanCents) });
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

  const saleTaxIssues = validateSaleTax(inputSnapshot);
  if (saleTaxIssues.length > 0) return failedFull(inputSnapshot, saleTaxIssues);

  const saleTax = inputSnapshot.saleTax;
  const forwardMonths = projectedMonths.filter((month) => monthIndex(month.month)! >= monthIndex(inputSnapshot.saleMonth)!);
  const scheduledExpenses = sum(forwardMonths, "operatingExpenses");
  const fullExpenses = dollars(forwardMonths.reduce((total, month) =>
    total + cents(month.operatingExpenses) + cents(month.fullPropertyTax) - cents(month.propertyTax), 0));
  const abatementValue = saleTax?.abatementDiscountRatePercent === undefined
    ? null
    : abatementValueAtSale(allProjectedMonths, inputSnapshot.saleMonth, saleTax.abatementDiscountRatePercent);
  /*
   * LA-1870: with a commercial exit cap, each use's forward NOI takes its own cap rate. The added tax
   * of the full tax bases lands on each use by the share of the tax its tenants reimburse.
   */
  const commercialExitCap = inputSnapshot.commercialTerminalCapRatePercent;
  const commercialTaxShare = commercialTaxSharePercentFor(inputSnapshot);
  const forwardUse = commercialExitCap === undefined
    ? null
    : {
      scheduled: splitNoiByUse(forwardMonths, "netOperatingIncome", "scheduled", commercialTaxShare),
      full: splitNoiByUse(forwardMonths, "netOperatingIncome", "full", commercialTaxShare),
    };
  const saleUse = forwardUse && (saleTax && saleTax.valueBasis !== "scheduled_tax" ? forwardUse.full : forwardUse.scheduled);
  const forwardSalePeriod: ForwardSalePeriod = {
    startMonth: inputSnapshot.saleMonth,
    endMonth: forwardEndMonth,
    monthCount: 12,
    effectiveGrossRevenue: sum(forwardMonths, "effectiveGrossRevenue"),
    operatingExpenses: saleTax && saleTax.valueBasis !== "scheduled_tax" ? fullExpenses : scheduledExpenses,
    ...(saleTax?.valueBasis === "full_tax_plus_abatement_value" ? { abatementValue: abatementValue! } : {}),
    ...(saleUse ? { residentialNetOperatingIncome: dollars(saleUse.residentialCents), commercialNetOperatingIncome: dollars(saleUse.commercialCents) } : {}),
  };
  const permanentLoan = capitalRun.result.capital.permanentLoan ?? null;
  if (inputSnapshot.lenderTests?.debtServiceBasis === "permanent_loan" && !permanentLoan) {
    return failedFull(inputSnapshot, [{ path: "lenderTests.debtServiceBasis", code: "invalid_lender_tests", message: "DSCR can read the permanent loan's debt service only when the case has a permanent loan." }]);
  }
  const permanentMonths = new Map(permanentLoan?.months.map((row) => [row.month, row]) ?? []);
  const calculation = calculatePropertyReturns(
    capitalRun.result.capital.months.map((month) => {
      const row = permanentMonths.get(month.month);
      return {
        month: month.month,
        projectCosts: month.projectCosts,
        loanFee: month.loanFee,
        grossInterest: month.grossInterest,
        totalDebtDraw: month.totalDebtDraw,
        operatingCashFlow: month.operatingCashFlow,
        repayment: month.repayment,
        otherSourcesApplied: month.otherSourcesApplied,
        softLoanRepayment: month.softLoanRepayment,
        ...(permanentLoan ? {
          permanentLoanProceeds: row?.proceeds ?? 0,
          refinanceCosts: row ? dollars(cents(row.fee) + cents(row.closingCosts)) : 0,
          permanentDebtService: row?.debtService ?? 0,
          permanentLoanPayoff: row?.payoff ?? 0,
        } : {}),
      };
    }),
    forwardSalePeriod,
    planFrom(inputSnapshot),
  );
  if (calculation.status === "failed" || !calculation.result) {
    return failedFull(inputSnapshot, calculation.issues);
  }
  const { totals } = capitalRun.result.capital;
  const sizingResult = sizing && ceiling ? loanSizingResult(sizing, ceiling, totals, inputSnapshot.targetDebtSharePercent) : null;
  const binding = sizingResult?.caps.find((cap) => cap.binding);
  // Skipped when equity is zero, because other sources then hold debt below every cap.
  const sizingChecks = sizingResult && binding && totals.equity > 0
    ? [checkUsd("loan-sizing-binding-cap", `Total debt equals the binding ${binding.label} cap`, binding.amount, sizingResult.loanAmount)]
    : [];
  const lenderTests = withLoanSizing(lenderTestsFor(inputSnapshot, totals, projectedMonths, permanentLoan), sizingResult);
  const valueSplitChecks = lenderValueSplitChecks(lenderTests);
  if (valueSplitChecks.some(({ status }) => status === "fail")) {
    return failedFull(inputSnapshot, [{ path: "lenderTests.commercialCapRatePercent", code: "derived_results", message: "The lender value by use did not add to the as-stabilized value within one cent." }]);
  }
  if (sizingChecks.some(({ status }) => status === "fail")) {
    return failedFull(inputSnapshot, [{ path: "lenderTests.loanSizing", code: "derived_results", message: "The funded loan did not settle on its binding cap within one cent." }]);
  }
  /*
   * LA-1863: the waterfall reads the reconciled levered cash flow and the capital plan's equity
   * contributions month by month, so its own checks tie LP and GP cash to both.
   */
  const partnershipRun = inputSnapshot.partnership
    ? runPartnershipWaterfall(
      calculation.result.months.map((month, index) => ({
        month: month.month,
        date: month.date,
        leveredCashFlow: month.leveredCashFlow,
        equityContribution: capitalRun.result!.capital.months[index].equityContribution,
      })),
      inputSnapshot.partnership,
      withTaxPaths(calculation.result.metrics, inputSnapshot).find(({ key }) => key === "leveredNetProfit")!.inputPaths,
    )
    : null;
  if (partnershipRun && (partnershipRun.status === "failed" || !partnershipRun.result)) {
    return failedFull(inputSnapshot, partnershipRun.issues);
  }
  return {
    formulaVersion: PROPERTY_RETURNS_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result: {
      developmentCapital: capitalRun.result.capital,
      forwardOperations: { startMonth: inputSnapshot.saleMonth, endMonth: forwardEndMonth, months: forwardMonths },
      propertyReturns: { ...calculation.result, metrics: withTaxPaths(calculation.result.metrics, inputSnapshot) },
      lenderTests,
      saleTax: saleTax && abatementEndMonth
        ? saleTaxResult(saleTax, forwardSalePeriod.effectiveGrossRevenue, scheduledExpenses, fullExpenses, abatementValue, abatementEndMonth, inputSnapshot.terminalCapRatePercent, forwardUse && commercialExitCap !== undefined ? { ...forwardUse, commercialCapRatePercent: commercialExitCap } : undefined)
        : null,
      propertyTax: capitalRun.result.apartmentOperations.propertyTax,
      partnership: partnershipRun?.result ?? null,
    },
    reconciliations: [...capitalRun.reconciliations, ...calculation.reconciliations, ...sizingChecks, ...valueSplitChecks, ...(partnershipRun?.reconciliations ?? [])],
  };
}

/** A commercial cap prices commercial NOI, so it needs a commercial block. Each cap is checked on its own. */
function commercialCapIssuesFor(input: PropertyReturnsInputs): PropertyReturnsIssue[] {
  const issues: PropertyReturnsIssue[] = [];
  if (input.commercial !== undefined) return issues;
  if (input.commercialTerminalCapRatePercent !== undefined) {
    issues.push({ path: "commercialTerminalCapRatePercent", code: "invalid_commercial_cap", message: "A commercial exit cap rate needs commercial spaces on the case. Add a commercial space or remove the cap." });
  }
  if (input.lenderTests?.commercialCapRatePercent !== undefined) {
    issues.push({ path: "lenderTests.commercialCapRatePercent", code: "invalid_commercial_cap", message: "A commercial cap rate needs commercial spaces on the case. Add a commercial space or remove the cap." });
  }
  return issues;
}

/** The value by use must add to the as-stabilized value it splits, on scheduled tax and, with an abatement, on full tax. */
function lenderValueSplitChecks(tests: LenderTestsResult | null): ReconciliationCheck[] {
  if (!tests) return [];
  const checks: ReconciliationCheck[] = [];
  const add = (suffix: string, label: string, stabilizedNoi: number, split: NonNullable<LenderTestsResult["valueSplit"]> | undefined, value: number | null | undefined) => {
    if (!split || value == null) return;
    checks.push(
      checkUsd(`lender-value-split-noi${suffix}`, `Lender residential and commercial NOI${label} add to the valuation-year NOI`, stabilizedNoi, money(split.residentialNoi, split.commercialNoi)),
      checkUsd(`lender-value-split-value${suffix}`, `Lender residential and commercial value${label} add to the as-stabilized value`, value, money(split.residentialValue, split.commercialValue)),
    );
  };
  add("", "", tests.stabilizedNoi, tests.valueSplit, tests.metrics.find(({ key }) => key === "asStabilizedValue")?.value);
  add("-full-tax", " on full tax", tests.fullTax?.stabilizedNoi ?? 0, tests.fullTax?.valueSplit, tests.fullTax?.metrics.find(({ key }) => key === "asStabilizedValue")?.value);
  return checks;
}

function withLoanSizing(tests: LenderTestsResult | null, sizing: LoanSizingResult | null) {
  return tests && sizing ? { ...tests, loanSizing: sizing } : tests;
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
  const abatementValueCents = cents(forwardSalePeriod.abatementValue ?? 0);
  // LA-1870: with a commercial exit cap, each use's forward NOI is capped on its own and the two values add.
  const commercialCap = plan.commercialTerminalCapRatePercent;
  const useValue = commercialCap === undefined
    ? null
    : valueByUse({ residentialCents: cents(forwardSalePeriod.residentialNetOperatingIncome!), commercialCents: cents(forwardSalePeriod.commercialNetOperatingIncome!) }, plan.terminalCapRatePercent, commercialCap);
  const grossSaleValueCents = (useValue ? useValue.totalValueCents : Math.round(forwardNetOperatingIncomeCents / (plan.terminalCapRatePercent / 100))) + abatementValueCents;
  const sellingCostsCents = percentOf(grossSaleValueCents, plan.sellingCostPercent);
  const netSaleProceedsCents = grossSaleValueCents - sellingCostsCents;
  // With a permanent loan the construction loan repaid at takeout, so the sale repays the permanent balance.
  const debtPayoffCents = cents(months.at(-1)!.repayment) + cents(months.at(-1)!.permanentLoanPayoff ?? 0);
  const hasPermanentLoan = months.some((month) => PERMANENT_LOAN_MONTH_KEYS.some((key) => month[key] !== undefined));
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
    const otherSourcesAppliedCents = cents(month.otherSourcesApplied ?? 0);
    const softLoanRepaymentCents = cents(month.softLoanRepayment ?? 0);
    return {
      ...month,
      date: monthEndDate(month.month),
      netSaleProceeds: dollars(saleProceedsCents),
      unleveredCashFlow: dollars(-projectCostsCents + operatingCashFlowCents + saleProceedsCents),
      leveredCashFlow: dollars(-loanFeeCents - projectCostsCents - grossInterestCents
        + totalDebtDrawCents + otherSourcesAppliedCents + operatingCashFlowCents + saleProceedsCents
        - repaymentCents - softLoanRepaymentCents + permanentLoanCashCents(month)),
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
  const developmentSpreadBasisPoints = (yieldOnCost - exitCapPercent(forwardNetOperatingIncomeCents, useValue?.totalValueCents, plan) / 100) * 10_000;
  const sale: PropertyReturnsCalculationResult["sale"] = {
    forwardEffectiveGrossRevenue: dollars(forwardEffectiveGrossRevenueCents),
    forwardOperatingExpenses: dollars(forwardOperatingExpensesCents),
    forwardNetOperatingIncome: dollars(forwardNetOperatingIncomeCents),
    abatementValue: dollars(abatementValueCents),
    ...(useValue && commercialCap !== undefined ? {
      valueSplit: {
        residentialForwardNetOperatingIncome: forwardSalePeriod.residentialNetOperatingIncome!,
        commercialForwardNetOperatingIncome: forwardSalePeriod.commercialNetOperatingIncome!,
        residentialCapRatePercent: plan.terminalCapRatePercent,
        commercialCapRatePercent: commercialCap,
        residentialValue: dollars(useValue.residentialValueCents),
        commercialValue: dollars(useValue.commercialValueCents),
      },
    } : {}),
    grossSaleValue: dollars(grossSaleValueCents),
    sellingCosts: dollars(sellingCostsCents),
    netSaleProceeds: dollars(netSaleProceedsCents),
    debtPayoff: dollars(debtPayoffCents),
    equitySaleProceeds: dollars(equitySaleProceedsCents),
  };
  const reconciliations = reconcile(datedMonths, sale, returns, plan, totalProjectCostCents, unleveredXirr, leveredXirr, yieldOnCost, developmentSpreadBasisPoints, hasPermanentLoan);
  const peakEquity = peakEquityOf(datedMonths);
  const metrics = metricsFor(sale, returns, yieldOnCost, developmentSpreadBasisPoints, peakEquity, hasPermanentLoan);
  if (![...Object.values(sale).flatMap((value) => typeof value === "number" ? [value] : Object.values(value)), yieldOnCost, developmentSpreadBasisPoints, ...metrics.map(({ value }) => value)].every(Number.isFinite)
    || reconciliations.some(({ status }) => status === "fail")) {
    return failedCalculation(inputSnapshot, [{ path: "propertyReturns", code: "derived_results", message: "The sale and property return results did not reconcile within one cent." }]);
  }
  const result = { sale, months: datedMonths, returns, yieldOnCost, developmentSpreadBasisPoints, peakEquity, metrics, reconciliations };
  return { formulaVersion: PROPERTY_RETURNS_FORMULA_VERSION, inputSnapshot, status: "complete", issues: [], result, reconciliations };
}

export function validatePropertyReturnsPlan(plan: PropertyReturnsPlan): PropertyReturnsIssue[] {
  const issues: PropertyReturnsIssue[] = [];
  if (plan.saleInputVersion !== PROPERTY_RETURNS_INPUT_VERSION) issues.push({ path: "saleInputVersion", code: "unsupported_input_version", message: `Use ${PROPERTY_RETURNS_INPUT_VERSION}.` });
  if (!Number.isFinite(plan.terminalCapRatePercent) || plan.terminalCapRatePercent <= 0 || plan.terminalCapRatePercent > 100) issues.push({ path: "terminalCapRatePercent", code: "invalid_percent", message: "Terminal cap rate must be greater than zero and no more than 100 percent." });
  const commercialCap = plan.commercialTerminalCapRatePercent;
  if (commercialCap !== undefined && (typeof commercialCap !== "number" || !Number.isFinite(commercialCap) || commercialCap <= 0 || commercialCap > 100)) {
    issues.push({ path: "commercialTerminalCapRatePercent", code: "invalid_percent", message: "Commercial exit cap rate must be greater than zero and no more than 100 percent." });
  }
  if (!Number.isFinite(plan.sellingCostPercent) || plan.sellingCostPercent < 0 || plan.sellingCostPercent > 100) issues.push({ path: "sellingCostPercent", code: "invalid_percent", message: "Selling costs must be from 0 to 100 percent." });
  if (plan.forwardNoiConvention !== FORWARD_TWELVE_MONTH_NOI_VERSION) issues.push({ path: "forwardNoiConvention", code: "unsupported_forward_noi_convention", message: `Use ${FORWARD_TWELVE_MONTH_NOI_VERSION}.` });
  if (plan.cashFlowDateConvention !== MONTH_END_CASH_FLOW_DATES_VERSION) issues.push({ path: "cashFlowDateConvention", code: "unsupported_date_convention", message: `Use ${MONTH_END_CASH_FLOW_DATES_VERSION}.` });
  if (plan.xirrConvention !== XIRR_ACTUAL_365_VERSION) issues.push({ path: "xirrConvention", code: "unsupported_xirr_convention", message: `Use ${XIRR_ACTUAL_365_VERSION}.` });
  validateEvidence(issues, plan.saleAssumptionEvidence, commercialCap !== undefined);
  if (plan.lenderTests !== undefined) issues.push(...validateLenderTestPlan(plan.lenderTests));
  if (plan.saleTax !== undefined) issues.push(...validateSaleTaxPlan(plan.saleTax));
  if (plan.partnership !== undefined) issues.push(...validatePartnershipPlan(plan.partnership));
  return issues;
}

export function validateSaleTaxPlan(value: unknown): PropertyReturnsIssue[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [{ path: "saleTax", code: "invalid_sale_tax", message: "Sale tax basis must be an object." }];
  }
  const plan = value as SaleTaxPlan;
  const issues: PropertyReturnsIssue[] = [];
  if (plan.saleTaxInputVersion !== SALE_TAX_INPUT_VERSION) issues.push({ path: "saleTax.saleTaxInputVersion", code: "unsupported_input_version", message: `Use ${SALE_TAX_INPUT_VERSION}.` });
  const bases: SaleTaxValueBasis[] = ["scheduled_tax", "full_tax", "full_tax_plus_abatement_value"];
  if (!bases.includes(plan.valueBasis)) issues.push({ path: "saleTax.valueBasis", code: "invalid_sale_tax", message: "Sale tax basis must be Scheduled Tax, Full Tax, or Full Tax Plus Abatement Value." });
  const usesRate = plan.valueBasis === "full_tax_plus_abatement_value";
  const rate = plan.abatementDiscountRatePercent;
  if (usesRate && !(typeof rate === "number" && Number.isFinite(rate) && rate > 0 && rate <= 100)) {
    issues.push({ path: "saleTax.abatementDiscountRatePercent", code: "invalid_percent", message: "Abatement discount rate must be greater than zero and no more than 100 percent." });
  } else if (!usesRate && rate !== undefined) {
    issues.push({ path: "saleTax.abatementDiscountRatePercent", code: "invalid_sale_tax", message: "Only the Full Tax Plus Abatement Value basis takes a discount rate." });
  }
  const evidence = plan.saleTaxEvidence;
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push({ path: "saleTax.saleTaxEvidence", code: "missing_evidence", message: "Add source and review details for the sale tax basis." });
    return issues;
  }
  for (const key of SALE_TAX_ASSUMPTION_KEYS) {
    if (key === "abatementDiscountRatePercent" && !usesRate) continue;
    const item = evidence[key];
    const path = `saleTax.saleTaxEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      issues.push({ path, code: "missing_evidence", message: "Add source and review details." });
      continue;
    }
    if (item.sourceLabel !== undefined && typeof item.sourceLabel !== "string") issues.push({ path: `${path}.sourceLabel`, code: "invalid_source_label", message: "Source label must be text." });
    else if (typeof item.sourceLabel === "string" && item.sourceLabel.length > MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH) issues.push({ path: `${path}.sourceLabel`, code: "text_too_long", message: `Source label cannot exceed ${MAX_PROPERTY_RETURNS_SOURCE_LABEL_LENGTH} characters.` });
    if (item.sourceDate !== undefined && (typeof item.sourceDate !== "string" || !validDate(item.sourceDate))) issues.push({ path: `${path}.sourceDate`, code: "invalid_source_date", message: "Source date must be a valid YYYY-MM-DD date." });
    if (item.reviewState !== "working" && item.reviewState !== "done") issues.push({ path: `${path}.reviewState`, code: "invalid_review_state", message: "Review state must be Working on It or Done." });
  }
  return issues;
}

/** A sale tax basis is required with an abatement and refused without one; its own fields are checked first. */
function validateSaleTax(input: PropertyReturnsInputs): PropertyReturnsIssue[] {
  const hasAbatement = input.propertyTax?.mode === "abatement";
  if (input.saleTax !== undefined) {
    const issues = validateSaleTaxPlan(input.saleTax);
    if (issues.length > 0) return issues;
    if (!hasAbatement) return [{ path: "saleTax", code: "invalid_sale_tax", message: "A sale tax basis applies only when the operating tax schedule carries an abatement." }];
    return [];
  }
  return hasAbatement
    ? [{ path: "saleTax", code: "missing_sale_tax_basis", message: "The tax schedule carries an abatement, so the sale must state which tax it prices: scheduled tax, full tax, or full tax plus the abatement value." }]
    : [];
}

function saleTaxResult(
  plan: SaleTaxPlan,
  effectiveGrossRevenue: number,
  scheduledExpenses: number,
  fullExpenses: number,
  abatementValue: number | null,
  abatementEndMonth: string,
  capRatePercent: number,
  byUse?: { scheduled: UseSplit; full: UseSplit; commercialCapRatePercent: number },
): SaleTaxResult {
  const scheduledNoiCents = cents(effectiveGrossRevenue) - cents(scheduledExpenses);
  const fullNoiCents = cents(effectiveGrossRevenue) - cents(fullExpenses);
  // With a commercial cap each use is valued at its own cap, so the tax bases compare on the same pricing as the sale.
  const valueCents = (noiCents: number, use?: UseSplit) => byUse && use
    ? valueByUse(use, capRatePercent, byUse.commercialCapRatePercent).totalValueCents
    : Math.round(noiCents / (capRatePercent / 100));
  return {
    valueBasis: plan.valueBasis,
    scheduledTaxForwardNoi: dollars(scheduledNoiCents),
    fullTaxForwardNoi: dollars(fullNoiCents),
    scheduledTaxValue: dollars(valueCents(scheduledNoiCents, byUse?.scheduled)),
    fullTaxValue: dollars(valueCents(fullNoiCents, byUse?.full)),
    abatementDiscountRatePercent: plan.abatementDiscountRatePercent ?? null,
    abatementValue,
    abatementEndMonth,
  };
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
    for (const key of ["otherSourcesApplied", "softLoanRepayment"] as const) {
      if (month[key] !== undefined && !validUsd(month[key], false)) issues.push({ path: `months.${index}.${key}`, code: "invalid_amount", message: `${labelFor(key)} must be zero or a positive safe USD amount with no more than two decimal places.` });
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
  issues.push(...validateForwardUseSplit(period, plan));
  if (period.abatementValue !== undefined && !validUsd(period.abatementValue, false)) {
    issues.push({ path: "forwardSalePeriod.abatementValue", code: "invalid_amount", message: "Abatement value at sale must be a safe, zero or positive USD amount with no more than two decimal places." });
  }
  issues.push(...validatePermanentLoanMonths(months));
  return issues;
}

/** A commercial exit cap needs the forward NOI of each use, and the two must add to the forward NOI they split. */
function validateForwardUseSplit(period: ForwardSalePeriod, plan: PropertyReturnsPlan): PropertyReturnsIssue[] {
  const { residentialNetOperatingIncome: residential, commercialNetOperatingIncome: commercial } = period;
  if (plan.commercialTerminalCapRatePercent === undefined && residential === undefined && commercial === undefined) return [];
  const path = "forwardSalePeriod";
  if (residential === undefined || commercial === undefined) {
    return [{ path, code: "invalid_forward_period", message: "A commercial exit cap needs the forward NOI of both the residential and the commercial use." }];
  }
  if (!validUsd(residential, true) || !validUsd(commercial, true)) {
    return [{ path, code: "invalid_amount", message: "Forward NOI by use must be a safe USD amount with no more than two decimal places." }];
  }
  if (!validUsd(period.effectiveGrossRevenue, false) || !validUsd(period.operatingExpenses, false)) return [];
  if (cents(residential) + cents(commercial) !== cents(period.effectiveGrossRevenue) - cents(period.operatingExpenses)) {
    return [{ path, code: "invalid_forward_period", message: "Residential and commercial forward NOI must add to forward revenue less forward operating expenses." }];
  }
  return [];
}

/**
 * Without a permanent loan, construction debt repays in the sale month only. With one (LA-1867), it
 * repays in the one takeout month, where the permanent loan funds; debt service runs after it, and the
 * permanent balance repays in the sale month.
 */
function validatePermanentLoanMonths(months: MonthlyPropertyReturnsInput[]): PropertyReturnsIssue[] {
  const issues: PropertyReturnsIssue[] = [];
  months.forEach((month, index) => {
    for (const key of PERMANENT_LOAN_MONTH_KEYS) {
      if (month[key] !== undefined && !validUsd(month[key], false)) issues.push({ path: `months.${index}.${key}`, code: "invalid_amount", message: `${labelFor(key)} must be zero or a positive safe USD amount with no more than two decimal places.` });
    }
  });
  const last = months.length - 1;
  const funding = months.flatMap((month, index) => (month.permanentLoanProceeds ?? 0) > 0 ? [index] : []);
  const mismatch = (message: string) => issues.push({ path: "months.repayment", code: "sale_payoff_mismatch", message });
  if (funding.length === 0) {
    if (months.slice(0, -1).some(({ repayment }) => repayment !== 0)) mismatch("This formula version repays construction debt in the sale month only.");
    if (months.some((month) => (month.refinanceCosts ?? 0) !== 0 || (month.permanentDebtService ?? 0) !== 0 || (month.permanentLoanPayoff ?? 0) !== 0)) {
      mismatch("Permanent loan costs, debt service and payoff need permanent loan proceeds in a takeout month.");
    }
    return issues;
  }
  const takeout = funding[0];
  if (funding.length > 1 || takeout === last) {
    mismatch("A permanent loan funds in one month before the sale month.");
    return issues;
  }
  if (months.some(({ repayment }, index) => repayment !== 0 && index !== takeout)) mismatch("With a permanent loan, construction debt repays in the takeout month only.");
  if (months.some((month, index) => (month.refinanceCosts ?? 0) !== 0 && index !== takeout)) mismatch("Permanent loan costs are paid in the takeout month only.");
  if (months.some((month, index) => (month.permanentDebtService ?? 0) !== 0 && index <= takeout)) mismatch("Permanent loan debt service starts after the takeout month.");
  if (months.some((month, index) => (month.permanentLoanPayoff ?? 0) !== 0 && index !== last)) mismatch("The permanent loan repays in the sale month only.");
  return issues;
}

/** Permanent loan proceeds less fee and closing costs, debt service and payoff at sale. Zero with no permanent loan. */
function permanentLoanCashCents(month: MonthlyPropertyReturnsInput) {
  return cents(month.permanentLoanProceeds ?? 0) - cents(month.refinanceCosts ?? 0)
    - cents(month.permanentDebtService ?? 0) - cents(month.permanentLoanPayoff ?? 0);
}

function validateEvidence(issues: PropertyReturnsIssue[], evidence: PropertyReturnsPlan["saleAssumptionEvidence"], withCommercialCap: boolean) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    issues.push({ path: "saleAssumptionEvidence", code: "missing_evidence", message: "Add source and review details for the sale assumptions." });
    return;
  }
  const keys: readonly (PropertyReturnsAssumptionKey | typeof PROPERTY_RETURNS_COMMERCIAL_CAP_KEY)[] = withCommercialCap
    ? [...PROPERTY_RETURNS_ASSUMPTION_KEYS, PROPERTY_RETURNS_COMMERCIAL_CAP_KEY]
    : PROPERTY_RETURNS_ASSUMPTION_KEYS;
  for (const key of keys) {
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
  hasPermanentLoan = false,
) {
  const unleveredCents = months.map((month) => cents(month.unleveredCashFlow));
  const leveredCents = months.map((month) => cents(month.leveredCashFlow));
  const datedUnlevered = months.map((month) => ({ amountCents: cents(month.unleveredCashFlow), years: yearsFrom(months[0].date, month.date) }));
  const datedLevered = months.map((month) => ({ amountCents: cents(month.leveredCashFlow), years: yearsFrom(months[0].date, month.date) }));
  return [
    checkUsd("forward-noi", "Forward sale NOI equals effective gross revenue less operating expenses", sale.forwardNetOperatingIncome, dollars(cents(sale.forwardEffectiveGrossRevenue) - cents(sale.forwardOperatingExpenses))),
    ...(sale.valueSplit ? [
      checkUsd("sale-noi-by-use", "Residential and commercial forward NOI add to forward sale NOI", sale.forwardNetOperatingIncome, money(sale.valueSplit.residentialForwardNetOperatingIncome, sale.valueSplit.commercialForwardNetOperatingIncome)),
      checkUsd("residential-sale-value", "Residential sale value equals residential forward NOI divided by the terminal cap rate", sale.valueSplit.residentialValue, dollars(Math.round(cents(sale.valueSplit.residentialForwardNetOperatingIncome) / (plan.terminalCapRatePercent / 100)))),
      checkUsd("commercial-sale-value", "Commercial sale value equals commercial forward NOI divided by the commercial terminal cap rate", sale.valueSplit.commercialValue, dollars(Math.round(cents(sale.valueSplit.commercialForwardNetOperatingIncome) / (sale.valueSplit.commercialCapRatePercent / 100)))),
      checkUsd("gross-sale-value", "Gross sale value equals residential sale value plus commercial sale value, plus any abatement value at sale", sale.grossSaleValue, money(sale.valueSplit.residentialValue, sale.valueSplit.commercialValue, sale.abatementValue)),
    ] : [
      checkUsd("gross-sale-value", "Gross sale value equals forward sale NOI divided by terminal cap rate, plus any abatement value at sale", sale.grossSaleValue, dollars(Math.round(cents(sale.forwardNetOperatingIncome) / (plan.terminalCapRatePercent / 100)) + cents(sale.abatementValue))),
    ]),
    checkUsd("selling-costs", "Selling costs equal gross sale value times selling cost percent", sale.sellingCosts, dollars(percentOf(cents(sale.grossSaleValue), plan.sellingCostPercent))),
    checkUsd("net-sale-proceeds", "Net sale proceeds equal gross sale value less selling costs", sale.netSaleProceeds, dollars(cents(sale.grossSaleValue) - cents(sale.sellingCosts))),
    hasPermanentLoan
      ? checkUsd("debt-payoff", "Debt payoff at sale equals the permanent loan balance repaid in the sale month", sale.debtPayoff, money(months.at(-1)!.repayment, months.at(-1)!.permanentLoanPayoff ?? 0))
      : checkUsd("debt-payoff", "Construction debt payoff equals sale-month repayment", sale.debtPayoff, months.at(-1)!.repayment),
    checkUsd("equity-sale-proceeds", hasPermanentLoan ? "Equity sale proceeds equal net sale proceeds less the permanent loan payoff" : "Equity sale proceeds equal net sale proceeds less construction debt payoff", sale.equitySaleProceeds, dollars(cents(sale.netSaleProceeds) - cents(sale.debtPayoff))),
    ...months.flatMap((month) => [
      checkUsd(`unlevered-cash-flow:${month.month}`, `${month.month} unlevered cash flow equals operating cash and sale proceeds less project costs`, month.unleveredCashFlow, dollars(-cents(month.projectCosts) + cents(month.operatingCashFlow) + cents(month.netSaleProceeds))),
      checkUsd(
        `levered-cash-flow:${month.month}`,
        `${month.month} levered cash flow equals operating cash, debt funding, grant and soft loan cash applied, sale proceeds, costs, interest, debt repayment, and soft loan repayment${hasPermanentLoan ? ", plus permanent loan proceeds less refinance costs, debt service and payoff" : ""}`,
        month.leveredCashFlow,
        dollars(-cents(month.loanFee) - cents(month.projectCosts) - cents(month.grossInterest) + cents(month.totalDebtDraw) + cents(month.otherSourcesApplied ?? 0) + cents(month.operatingCashFlow) + cents(month.netSaleProceeds) - cents(month.repayment) - cents(month.softLoanRepayment ?? 0)
          + cents(month.permanentLoanProceeds ?? 0) - cents(month.refinanceCosts ?? 0) - cents(month.permanentDebtService ?? 0) - cents(month.permanentLoanPayoff ?? 0)),
      ),
    ]),
    checkMetric("unlevered-equity-multiple", "Unlevered equity multiple equals positive cash flow divided by negative cash flow", returns.unlevered.equityMultiple, equityMultiple(unleveredCents), 1e-10, "multiple"),
    checkMetric("levered-equity-multiple", "Levered equity multiple equals positive cash flow divided by negative cash flow", returns.levered.equityMultiple, equityMultiple(leveredCents), 1e-10, "multiple"),
    checkMetric("unlevered-xirr-residual", "Unlevered XIRR has a scale-aware XNPV residual", 0, dollars(xnpv(datedUnlevered, unleveredXirr.rate)), dollars(unleveredXirr.toleranceCents), "usd"),
    checkMetric("levered-xirr-residual", "Levered XIRR has a scale-aware XNPV residual", 0, dollars(xnpv(datedLevered, leveredXirr.rate)), dollars(leveredXirr.toleranceCents), "usd"),
    checkMetric("yield-on-cost", "Yield on cost equals forward NOI divided by total project cost", yieldOnCost, cents(sale.forwardNetOperatingIncome) / totalProjectCostCents, 1e-10, "ratio"),
    checkMetric("development-spread", sale.valueSplit ? "Development spread equals yield on cost less the blended exit cap rate, which is forward sale NOI over the value of both uses" : "Development spread equals yield on cost less terminal cap rate", developmentSpreadBasisPoints, (yieldOnCost - exitCapPercent(cents(sale.forwardNetOperatingIncome), sale.valueSplit ? cents(sale.valueSplit.residentialValue) + cents(sale.valueSplit.commercialValue) : undefined, plan) / 100) * 10_000, 1e-6, "basis_points"),
    checkUsd("unlevered-net-profit", "Unlevered net profit equals dated unlevered cash flow", returns.unlevered.netProfit, dollars(unleveredCents.reduce((sum, value) => sum + value, 0))),
    checkUsd("levered-net-profit", "Levered net profit equals dated levered cash flow", returns.levered.netProfit, dollars(leveredCents.reduce((sum, value) => sum + value, 0))),
  ];
}

function metricsFor(
  sale: PropertyReturnsCalculationResult["sale"],
  returns: PropertyReturnsCalculationResult["returns"],
  yieldOnCost: number,
  developmentSpreadBasisPoints: number,
  peakEquity: PeakEquity,
  hasPermanentLoan = false,
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
    ...(hasPermanentLoan ? ["permanentLoan"] : []),
  ];
  const { valueSplit } = sale;
  const saleValuePaths = ["saleInputVersion", "terminalCapRatePercent", ...(valueSplit ? ["commercialTerminalCapRatePercent"] : []), "forwardNoiConvention"];
  const saleProceedsPaths = [...saleValuePaths, "sellingCostPercent"];
  const returnTimingPaths = ["cashFlowDateConvention", "xirrConvention"];
  return [
    { key: "forwardNetOperatingIncome", label: "Forward Sale NOI", value: sale.forwardNetOperatingIncome, unit: "usd", formula: "forward twelve-month effective gross revenue less forward twelve-month operating expenses", inputPaths: rootPaths(operationPaths, ["forwardNoiConvention"]) },
    { key: "grossSaleValue", label: "Gross Sale Value", value: sale.grossSaleValue, unit: "usd", formula: valueSplit
      ? `residential forward NOI divided by terminal cap rate, plus commercial forward NOI divided by the commercial terminal cap rate${sale.abatementValue > 0 ? ", plus the present value of the tax abatement left at sale" : ""}`
      : sale.abatementValue > 0 ? "forward sale NOI divided by terminal cap rate, plus the present value of the tax abatement left at sale" : "forward sale NOI divided by terminal cap rate", inputPaths: rootPaths(operationPaths, saleValuePaths) },
    ...(valueSplit ? [
      { key: "residentialForwardNetOperatingIncome", label: "Residential Forward Sale NOI", value: valueSplit.residentialForwardNetOperatingIncome, unit: "usd" as const, formula: "forward twelve-month residential effective gross revenue less the forward twelve-month expenses the residential use carries; with a full tax sale basis, the added tax is shared by each use's tenant tax recovery share", inputPaths: rootPaths(operationPaths, ["forwardNoiConvention"]) },
      { key: "commercialForwardNetOperatingIncome", label: "Commercial Forward Sale NOI", value: valueSplit.commercialForwardNetOperatingIncome, unit: "usd" as const, formula: "forward twelve-month commercial effective gross revenue less the forward twelve-month expenses the commercial spaces carry; with a full tax sale basis, the added tax is shared by each use's tenant tax recovery share", inputPaths: rootPaths(operationPaths, ["forwardNoiConvention"]) },
      { key: "residentialSaleValue", label: "Residential Sale Value", value: valueSplit.residentialValue, unit: "usd" as const, formula: "residential forward sale NOI divided by terminal cap rate", inputPaths: rootPaths(operationPaths, saleValuePaths.filter((path) => path !== "commercialTerminalCapRatePercent")) },
      { key: "commercialSaleValue", label: "Commercial Sale Value", value: valueSplit.commercialValue, unit: "usd" as const, formula: "commercial forward sale NOI divided by the commercial terminal cap rate", inputPaths: rootPaths(operationPaths, saleValuePaths.filter((path) => path !== "terminalCapRatePercent")) },
    ] : []),
    { key: "sellingCosts", label: "Selling Costs", value: sale.sellingCosts, unit: "usd", formula: "gross sale value times selling cost percent", inputPaths: rootPaths(operationPaths, saleProceedsPaths) },
    { key: "netSaleProceeds", label: "Net Sale Proceeds", value: sale.netSaleProceeds, unit: "usd", formula: "gross sale value less selling costs", inputPaths: rootPaths(operationPaths, saleProceedsPaths) },
    hasPermanentLoan
      ? { key: "debtPayoff", label: "Permanent Loan Payoff", value: sale.debtPayoff, unit: "usd", formula: "the permanent loan balance repaid in the sale month; the construction loan repaid at takeout", inputPaths: rootPaths(costPaths, operationPaths, capitalPaths) }
      : { key: "debtPayoff", label: "Construction Debt Payoff", value: sale.debtPayoff, unit: "usd", formula: "construction debt repayment in the sale month", inputPaths: rootPaths(costPaths, operationPaths, capitalPaths) },
    { key: "equitySaleProceeds", label: "Equity Sale Proceeds", value: sale.equitySaleProceeds, unit: "usd", formula: hasPermanentLoan ? "net sale proceeds less the permanent loan payoff" : "net sale proceeds less construction debt payoff", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "unleveredXirr", label: "Unlevered XIRR", value: returns.unlevered.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly unlevered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, returnTimingPaths) },
    { key: "unleveredEquityMultiple", label: "Unlevered Equity Multiple", value: returns.unlevered.equityMultiple, unit: "multiple", formula: "positive unlevered cash flow divided by negative unlevered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths) },
    { key: "unleveredNetProfit", label: "Unlevered Net Profit", value: returns.unlevered.netProfit, unit: "usd", formula: "sum dated monthly unlevered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths) },
    { key: "leveredXirr", label: "Levered XIRR", value: returns.levered.xirr, unit: "ratio", formula: "actual-day XIRR of dated monthly levered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, returnTimingPaths, capitalPaths) },
    { key: "leveredEquityMultiple", label: "Levered Equity Multiple", value: returns.levered.equityMultiple, unit: "multiple", formula: "positive levered cash flow divided by negative levered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "leveredNetProfit", label: "Levered Net Profit", value: returns.levered.netProfit, unit: "usd", formula: "sum dated monthly levered cash flow", inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "peakEquity", label: "Peak Equity", value: peakEquity.amount, unit: "usd", formula: `largest running total of negative levered cash flow less positive levered cash flow${peakEquity.month ? `, first reached ${peakEquity.month}` : ""}`, inputPaths: rootPaths(costPaths, operationPaths, saleProceedsPaths, capitalPaths) },
    { key: "yieldOnCost", label: "Sale Yield on Cost", value: yieldOnCost, unit: "ratio", formula: "forward sale NOI divided by total project cost including carry", inputPaths: rootPaths(costPaths, operationPaths, ["forwardNoiConvention"], capitalPaths) },
    { key: "developmentSpread", label: "Development Spread", value: developmentSpreadBasisPoints, unit: "basis_points", formula: valueSplit ? "sale yield on cost less the blended exit cap rate, which is forward sale NOI over the value of both uses, in basis points" : "sale yield on cost less terminal cap rate, in basis points", inputPaths: rootPaths(costPaths, operationPaths, saleValuePaths, capitalPaths) },
  ];
}

/** The tax inputs join a metric's trace only when the run carries them, so every path resolves in the snapshot. */
function withTaxPaths(metrics: PropertyReturnMetric[], input: PropertyReturnsInputs): PropertyReturnMetric[] {
  return metrics.map((metric) => {
    const paths = [...metric.inputPaths];
    if (input.propertyTax && paths.includes("operatingExpenseLines")) paths.push("propertyTax");
    if (input.commercial && paths.includes("operatingExpenseLines")) paths.push("commercial");
    if (input.saleTax && paths.includes("terminalCapRatePercent")) paths.push("saleTax");
    return { ...metric, inputPaths: paths };
  });
}

/** The cap rate the sale's forward NOI implies: the stated terminal cap, or with a commercial cap the forward NOI over the value of both uses. */
function exitCapPercent(forwardNoiCents: number, useValueCents: number | undefined, plan: PropertyReturnsPlan) {
  return useValueCents === undefined ? plan.terminalCapRatePercent : forwardNoiCents / useValueCents * 100;
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
    ...(input.commercialTerminalCapRatePercent === undefined ? {} : { commercialTerminalCapRatePercent: input.commercialTerminalCapRatePercent }),
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

function validUsd(value: number, allowNegative: boolean) {
  if (!Number.isFinite(value) || (!allowNegative && value < 0)) return false;
  const valueCents = Math.round(value * 100);
  return Number.isSafeInteger(valueCents) && Math.abs(value - valueCents / 100) <= 1e-9;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function money(...values: number[]) {
  return dollars(values.reduce((total, value) => total + cents(value), 0));
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
