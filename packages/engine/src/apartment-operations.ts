import {
  computeMonthlyCostSchedule,
  type CostScheduleOptions,
  type DerivedCostLine,
  type MonthlyCostIssueCode,
  type MonthlyCostScheduleInputs,
  type MonthlyCostScheduleResult,
  type ReconciliationCheck,
} from "./monthly-cost-schedule";
import {
  commercialAreaSf,
  commercialCostLines,
  firstLeaseStartIndex,
  leasingCommissionLineId,
  leasingCommissionCents,
  recoveryBasisLabel,
  resolveLeaseStarts,
  resolveSpaces,
  scheduledRentOverTerm,
  spaceRentForMonth,
  tenantImprovementCents,
  tenantImprovementLineId,
  validateCommercialOperations,
  type CommercialIssueCode,
  type CommercialOperations,
} from "./commercial-operations";
import { resolveMilestoneAnchors, type MilestoneAnchor, type MilestoneResolution } from "./milestones";
import {
  propertyTaxForMonth,
  propertyTaxResult,
  validatePropertyTaxPlan,
  type PropertyTaxIssueCode,
  type PropertyTaxPlan,
  type PropertyTaxResult,
} from "./property-tax";

export const APARTMENT_OPERATIONS_INPUT_VERSION = "apartment_operations_inputs.v1" as const;
/**
 * v3 adds the lease-up expense ramp, lease-up concessions, seasonal absorption and the stabilization
 * rule (LA-1704). v2 added the dated property tax schedule (LA-1690). Earlier runs stay readable:
 * v2 runs carry no concession line, and v1 runs carry no tax line either. Lease turnover (LA-1784)
 * is optional and leaves a run without it unchanged, so it stays v3; earlier runs read as turning no units.
 */
export const APARTMENT_OPERATIONS_FORMULA_VERSION = "underwriting.apartment_operations.v3" as const;
export const APARTMENT_OPERATIONS_V2_FORMULA_VERSION = "underwriting.apartment_operations.v2" as const;
export const APARTMENT_OPERATIONS_V1_FORMULA_VERSION = "underwriting.apartment_operations.v1" as const;
export const MAX_EXPENSE_LEAD_MONTHS = 24;
export const MAX_CONCESSION_LEASE_TERM_MONTHS = 36;
export const MAX_STABILIZATION_HOLD_MONTHS = 24;
export const MAX_TURNOVER_VACANT_MONTHS = 12;
export const MAX_SEASONAL_ABSORPTION_FACTOR = 10;
export const MAX_GROWTH_YEARS = 30;
export const MAX_APARTMENT_OPERATION_LINES = 250;
export const MAX_OPERATION_LINE_ID_LENGTH = 100;
export const MAX_OPERATION_LINE_NAME_LENGTH = 200;
export const MAX_OPERATION_SOURCE_LABEL_LENGTH = 500;

type ReviewState = "working" | "done";

export const APARTMENT_OPERATIONS_ASSUMPTION_KEYS = [
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
] as const;

export type ApartmentOperationsAssumptionKey = typeof APARTMENT_OPERATIONS_ASSUMPTION_KEYS[number];

export type ApartmentOperationsAssumptionEvidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

type SourcedLine = {
  id: string;
  name: string;
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export const AFFORDABILITY_TIERS = ["market", "workforce", "affordable"] as const;
export type AffordabilityTier = typeof AFFORDABILITY_TIERS[number];

export type ResidentialUnitType = SourcedLine & {
  units: number;
  nonRevenueUnits: number;
  averageAreaSf: number;
  monthlyMarketRent: number;
  /** Absent reads as market. The rent entered is the rent the unit charges, whatever its tier. */
  affordabilityTier?: AffordabilityTier;
  /** Area median income percent the rent is tied to. Only workforce and affordable units carry one. */
  amiPercent?: number;
};

export type OtherIncomeLine = SourcedLine & {
  amount: number;
  unit: "usd_per_year" | "usd_per_occupied_unit_month";
};

export type OperatingExpenseLine = SourcedLine & {
  amount: number;
  unit: "usd_per_year" | "usd_per_unit_year" | "percent_effective_gross_revenue";
  /** Share of the line that scales with leased units during lease-up. Absent reads as zero, a fully fixed line. */
  variablePercent?: number;
  /** Months the line starts before operation start, at its fixed share. Absent reads as zero. */
  leadMonths?: number;
  /**
   * Marks a cost that belongs to the commercial spaces, such as their common area maintenance (LA-1868).
   * A line without it belongs to the residential use. A tagged line starts its lead months before the
   * first commercial lease, not before operation start, takes no per-unit amount and no variable
   * share, and as a percent of revenue reads commercial effective gross revenue.
   */
  appliesTo?: "commercial";
};

export type CapitalExpenditureLine = SourcedLine & {
  amount: number;
  unit: "usd_per_year" | "usd_per_unit_year";
  /** Share of the line that scales with leased units during lease-up. Absent reads as zero, a fully fixed line. */
  variablePercent?: number;
};

type Evidence = {
  sourceLabel?: string;
  sourceDate?: string;
  reviewState: ReviewState;
};

export const LEASE_UP_CONCESSION_TIMINGS = ["at_move_in", "spread_over_term"] as const;
export type LeaseUpConcessionTiming = typeof LEASE_UP_CONCESSION_TIMINGS[number];

/**
 * Free rent on each lease signed during lease-up, apart from the stabilized free-rent percent.
 * At move-in, the lease's first months are free. Spread over the term, each month of the first
 * lease term carries months free over the term.
 */
export type LeaseUpConcession = Evidence & {
  monthsFree: number;
  leaseTermMonths: number;
  timing: LeaseUpConcessionTiming;
};

/** Twelve factors on the lease-up pace, January first. A factor of one keeps the base pace. */
export type SeasonalAbsorption = Evidence & {
  monthlyFactors: number[];
};

export const LEASE_TURNOVER_BASES = ["each_new_lease_once", "every_expiring_lease", "net_units_gained"] as const;
export type LeaseTurnoverBasis = typeof LEASE_TURNOVER_BASES[number];

/**
 * Leases that end without renewal while the property leases up. Each month the turnover share of the
 * expiring leases moves out, and those units can be leased again after the vacant months. The basis
 * says which leases expire: each lease signed during lease-up once at the end of its term; every
 * lease at the end of every term, renewals included; or the units the building gained one term earlier.
 */
export type LeaseTurnover = Evidence & {
  turnoverPercent: number;
  leaseTermMonths: number;
  vacantMonths: number;
  basis: LeaseTurnoverBasis;
};

/**
 * Treats vacancy as units that are not leased. Leased units stop at revenue units times one less
 * the vacancy percent, lease-up loss carries every unleased unit, and no vacancy loss is charged on
 * top. Without it, every revenue unit leases and the vacancy percent comes off potential income in
 * every month, lease-up included. Credit loss stays on potential income either way.
 */
export type OccupancyCap = Evidence;

/** The property stabilizes once leased units hold at or above the target for the stated months. */
export type StabilizationRule = Evidence & {
  targetOccupancyPercent: number;
  holdMonths: number;
};

export const GROWTH_CATEGORIES = ["marketRentPercent", "affordableRentPercent", "otherIncomePercent", "operatingExpensePercent", "commercialRentPercent"] as const;
export type GrowthCategory = typeof GROWTH_CATEGORIES[number];
/** The categories every saved block carries. Commercial rent came later (LA-1868), so a block saved before it has none. */
export type RequiredGrowthCategory = Exclude<GrowthCategory, "commercialRentPercent">;

/**
 * Separate annual growth for each category, in place of the income and expense rates. Each list
 * gives the percent for each year after the growth start month, and its last rate carries forward.
 * Affordable rent covers workforce and affordable unit types. Capital expenditures grow with
 * operating expenses, and a property tax plan keeps its own rate growth. Commercial rent is
 * optional: a block without it grows commercial rent at the market rent rates.
 */
export type CategoryGrowth = Evidence & Record<RequiredGrowthCategory, number[]> & { commercialRentPercent?: number[] };

export type ApartmentOperationsInputs = MonthlyCostScheduleInputs & {
  inputVersion: typeof APARTMENT_OPERATIONS_INPUT_VERSION;
  operationStartMonth: string;
  /** Puts the operation start at a milestone plus an offset, in place of the typed month. */
  operationStartAnchor?: MilestoneAnchor;
  growthStartMonth: string;
  /** Puts the growth start at a milestone plus an offset, in place of the typed month. */
  growthStartAnchor?: MilestoneAnchor;
  preleasedUnits: number;
  leaseUpUnitsPerMonth: number;
  annualIncomeGrowthPercent: number;
  annualExpenseGrowthPercent: number;
  rentAdjustmentLossPercent: number;
  freeRentPercent: number;
  vacancyPercent: number;
  creditLossPercent: number;
  assumptionEvidence: Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>;
  residentialUnitTypes: ResidentialUnitType[];
  otherIncomeLines: OtherIncomeLine[];
  operatingExpenseLines: OperatingExpenseLine[];
  capitalExpenditureLines: CapitalExpenditureLine[];
  /** Replaces a flat tax expense line. Its scheduled tax joins operating expenses. */
  propertyTax?: PropertyTaxPlan;
  /** Absent means no lease-up free rent beyond the stabilized free-rent percent. */
  leaseUpConcession?: LeaseUpConcession;
  /** Absent means the same pace every month. */
  seasonalAbsorption?: SeasonalAbsorption;
  /** Absent means the vacancy percent comes off potential income in every month. */
  occupancyCap?: OccupancyCap;
  /** Absent means the first month every revenue unit is leased, or the first month at the occupancy cap. */
  stabilizationRule?: StabilizationRule;
  /** Absent means no lease ends during lease-up. */
  leaseTurnover?: LeaseTurnover;
  /** Absent means rent and other income grow at the income rate and expenses at the expense rate. */
  categoryGrowth?: CategoryGrowth;
  /** Absent means no commercial space, and every month matches a run that never had the block. */
  commercial?: CommercialOperations;
};

export type ApartmentOperationsIssueCode = MonthlyCostIssueCode
  | CommercialIssueCode
  | "invalid_affordability_tier"
  | "invalid_absorption_factor"
  | "invalid_concession_timing"
  | "invalid_turnover_basis"
  | "occupancy_cap_conflict"
  | PropertyTaxIssueCode
  | "unsupported_input_version"
  | "outside_timeline"
  | "invalid_units"
  | "invalid_percent"
  | "invalid_amount"
  | "invalid_month"
  | "missing_lines"
  | "missing_text"
  | "duplicate_id"
  | "unsupported_unit"
  | "invalid_source_date"
  | "invalid_review_state"
  | "invalid_line"
  | "too_many_lines"
  | "text_too_long"
  | "derived_results";

export type ApartmentOperationsIssue = {
  path: string;
  code: ApartmentOperationsIssueCode;
  message: string;
};

export type OperationsFormulaTrace = {
  key: keyof ApartmentOperationsTotals | "monthlyLeaseUp" | "leaseTurnover" | "firstStabilizedMonth"
    | "commercialTenantImprovements" | "commercialLeasingCommissions" | "commercialRecoveryShare";
  label: string;
  formula: string;
  inputPaths: string[];
};

export type MonthlyApartmentOperations = {
  month: string;
  totalUses: number;
  revenueUnits: number;
  leasedUnits: number;
  /** Units whose leases ended without renewal this month. Zero with no lease turnover. */
  turnedUnits: number;
  occupiedUnits: number;
  leaseUpPercent: number;
  residentialGrossRent: number;
  nonRevenueRentAdjustment: number;
  leaseUpLoss: number;
  rentAdjustmentLoss: number;
  freeRentLoss: number;
  /** Free rent on leases signed during lease-up. Zero with no lease-up concession. */
  leaseUpConcessionLoss: number;
  totalResidentialRent: number;
  otherIncome: number;
  /** Residential rent plus other income. Commercial income sits on its own lines below. */
  totalPotentialIncome: number;
  /** Residential vacancy. Commercial vacancy is its own line. */
  vacancyLoss: number;
  /** Residential credit loss. Commercial credit loss is its own line. */
  creditLoss: number;
  /** The whole property: residential effective gross revenue plus commercial effective gross revenue. */
  effectiveGrossRevenue: number;
  /** The whole property: residential and commercial operating expenses. */
  operatingExpenses: number;
  /** Tax the property pays under its schedule, inside operating expenses. Zero with no tax schedule. */
  propertyTax: number;
  /** Tax with no abatement. NOI on full tax is NOI less this and plus property tax. */
  fullPropertyTax: number;
  /** The whole property, residential and commercial together. Loan sizing, value and lender tests read this. */
  netOperatingIncome: number;
  capitalExpenditures: number;
  operatingCashFlow: number;
  /** Scheduled base rent from commercial spaces whose lease has started. Zero with no commercial block. */
  commercialBaseRent: number;
  /** Base rent forgiven during free-rent months, negative. */
  commercialFreeRent: number;
  /** What tenants reimburse of the expense lines and property tax their recoveries name. */
  commercialRecoveries: number;
  /** Negative: the commercial vacancy percent of commercial income. */
  commercialVacancyLoss: number;
  /** Negative: the commercial credit loss percent of commercial income. */
  commercialCreditLoss: number;
  commercialEffectiveGrossRevenue: number;
  /** Expense lines tagged commercial plus the billed share of shared costs that tenants reimburse. */
  commercialOperatingExpenses: number;
  commercialNetOperatingIncome: number;
  /** Net operating income less commercial net operating income. */
  residentialNetOperatingIncome: number;
};

export type ApartmentOperationsTotals = Omit<MonthlyApartmentOperations,
  "month" | "revenueUnits" | "leasedUnits" | "turnedUnits" | "occupiedUnits" | "leaseUpPercent" | "totalUses">;

export type CommercialRecoverySummary = {
  basis: string;
  sharePercent: number;
  shareSource: "entered" | "area_share";
  /** Total reimbursed over the run, in dollars, each month rounded to the cent. */
  total: number;
  /** The share times the basis each month, summed without rounding. The total is checked against it. */
  shareOfBasis: number;
};

export type CommercialSpaceSummary = {
  id: string;
  name: string;
  areaSf: number;
  leaseStartMonth: string;
  /** Area times the entered annual rent per square foot, before growth and free rent. */
  annualRentRoll: number;
  tenantImprovements: number;
  leasingCommission: number;
  baseRentTotal: number;
  freeRentTotal: number;
  recoveries: CommercialRecoverySummary[];
};

export type CommercialOperationsResult = {
  spaces: CommercialSpaceSummary[];
  /** Commercial area. It never enters the unit summary or any per-unit figure. */
  commercialAreaSf: number;
  /** Residential unit area plus commercial area, the base an unstated recovery share divides by. */
  allocationAreaSf: number;
  annualRentRoll: number;
  tenantImprovements: number;
  leasingCommissions: number;
};

export type ApartmentOperationsResult = {
  costSchedule: MonthlyCostScheduleResult;
  unitTypeSummaries: Array<{
    id: string;
    units: number;
    nonRevenueUnits: number;
    revenueUnits: number;
    averageAreaSf: number;
    areaSf: number;
  }>;
  unitSummary: {
    totalUnits: number;
    revenueUnits: number;
    nonRevenueUnits: number;
    totalAreaSf: number;
  };
  months: MonthlyApartmentOperations[];
  totals: ApartmentOperationsTotals;
  firstStabilizedMonth?: string;
  propertyTax: PropertyTaxResult | null;
  /** The commercial spaces' rent roll, first-generation costs and recoveries. Absent with no commercial block, as on runs saved before it. */
  commercial?: CommercialOperationsResult;
  formulaTraces: OperationsFormulaTrace[];
  /** Operation start and growth start months resolved from milestones. Cost line and sale anchors sit on the cost schedule result. */
  anchors?: MilestoneResolution[];
};

export type ApartmentOperationsRun = {
  formulaVersion: typeof APARTMENT_OPERATIONS_FORMULA_VERSION;
  inputSnapshot: ApartmentOperationsInputs;
  status: "complete" | "failed";
  issues: ApartmentOperationsIssue[];
  result: ApartmentOperationsResult | null;
  reconciliations: ReconciliationCheck[];
};

const OTHER_INCOME_UNITS = ["usd_per_year", "usd_per_occupied_unit_month"];
const OPERATING_EXPENSE_UNITS = ["usd_per_year", "usd_per_unit_year", "percent_effective_gross_revenue"];
const CAPITAL_EXPENDITURE_UNITS = ["usd_per_year", "usd_per_unit_year"];

export function computeApartmentOperations(input: ApartmentOperationsInputs, options: CostScheduleOptions = {}): ApartmentOperationsRun {
  const inputSnapshot = structuredClone(input);
  const anchors = resolveMilestoneAnchors(inputSnapshot);
  if (anchors.issues.length > 0) return failed(inputSnapshot, anchors.issues);
  const issues = validate(inputSnapshot);
  const commercial = prepareCommercial(inputSnapshot, issues);
  const costRun = computeMonthlyCostSchedule(inputSnapshot, commercial.derivedLines.length > 0
    ? { ...options, derivedLines: commercial.derivedLines }
    : options);
  if (inputSnapshot.propertyTax !== undefined) {
    issues.push(...validatePropertyTaxPlan(inputSnapshot.propertyTax, {
      operationStartMonth: inputSnapshot.operationStartMonth,
      costBeforeFinancing: costRun.result?.totalUses ?? 0,
    }));
  }
  if (costRun.status === "failed") {
    issues.unshift(...costRun.issues.map((item) => ({ ...item })));
  }
  if (issues.length > 0 || !costRun.result) return failed(inputSnapshot, issues);

  const result = calculate(inputSnapshot, costRun.result);
  const projectAnchors = [
    ...anchors.resolutions.filter(({ path }) => path === "operationStartMonth" || path === "growthStartMonth"),
    ...commercial.resolutions,
  ];
  if (result && projectAnchors.length > 0) result.anchors = projectAnchors;
  if (!result || !resultNumbersAreSafe(result)) {
    return failed(inputSnapshot, [{
      path: "operations",
      code: "derived_results",
      message: "The monthly operating result is outside the supported numeric range.",
    }]);
  }
  const reconciliations = [
    ...costRun.reconciliations,
    ...operationReconciliations(result, inputSnapshot),
  ];
  if (reconciliations.some(({ status }) => status === "fail")) {
    return failed(inputSnapshot, [{
      path: "operations",
      code: "derived_results",
      message: "The monthly operating cash flow did not reconcile to its parts.",
    }]);
  }
  return {
    formulaVersion: APARTMENT_OPERATIONS_FORMULA_VERSION,
    inputSnapshot,
    status: "complete",
    issues: [],
    result,
    reconciliations,
  };
}

/**
 * Checks the commercial block and the expense lines tagged for it, then, on a case with no other
 * issue, writes anchored lease start months into the snapshot and derives the first-generation
 * cost lines. Issues go onto the caller's list. A case without the block returns nothing.
 */
function prepareCommercial(input: ApartmentOperationsInputs, issues: ApartmentOperationsIssue[]) {
  const nothing = { derivedLines: [] as DerivedCostLine[], resolutions: [] as MilestoneResolution[] };
  const tagged = Array.isArray(input.operatingExpenseLines)
    ? input.operatingExpenseLines.map((line, index) => ({ line, index })).filter(({ line }) => isLineObject(line) && line.appliesTo !== undefined)
    : [];
  if (input.commercial === undefined) {
    for (const { index } of tagged) {
      addIssue(issues, `operatingExpenseLines.${index}.appliesTo`, "invalid_line", "A line tagged commercial needs a commercial block on the case.");
    }
    return nothing;
  }
  const evidenceIssues: ApartmentOperationsIssue[] = [];
  const commercial = input.commercial;
  if (isEvidenceObject(commercial)) {
    validateEvidence(evidenceIssues, "commercial", commercial);
    if (Array.isArray(commercial.spaces)) {
      validateSourcedLines(evidenceIssues, commercial.spaces, "commercial.spaces");
    }
  }
  issues.push(...evidenceIssues);
  issues.push(...validateCommercialOperations(commercial, {
    analysisStartMonth: input.analysisStartMonth,
    saleMonth: input.saleMonth,
    operationStartMonth: input.operationStartMonth,
    milestones: input.milestones,
    expenseLines: Array.isArray(input.operatingExpenseLines) ? input.operatingExpenseLines : [],
    hasPropertyTax: input.propertyTax !== undefined,
    residentialAreaSf: residentialAreaSf(input),
  }));
  for (const { line, index } of tagged) {
    const path = `operatingExpenseLines.${index}`;
    if ((line.appliesTo as unknown) !== "commercial") {
      addIssue(issues, `${path}.appliesTo`, "invalid_line", "A line can be tagged commercial, or left untagged for the residential use.");
    } else if (line.unit === "usd_per_unit_year") {
      addIssue(issues, `${path}.unit`, "unsupported_unit", "A commercial line has no units to multiply by. Enter it as a yearly amount or a percent of commercial revenue.");
    } else if (line.variablePercent !== undefined && line.variablePercent > 0) {
      addIssue(issues, `${path}.variablePercent`, "unsupported_unit", "A commercial line does not move with residential leasing, so it takes no variable share.");
    }
  }
  if (issues.length > 0) return nothing;

  const spaces = resolveSpaces(commercial, input.milestones, residentialAreaSf(input));
  const { resolutions } = resolveLeaseStarts(commercial.spaces, input.milestones);
  for (const resolved of spaces) commercial.spaces[resolved.index].leaseStartMonth = resolved.leaseStartMonth;
  const operationStart = monthIndex(input.operationStartMonth)!;
  const growth = growthRates(input);
  const growthStart = monthIndex(input.growthStartMonth)!;
  const rentFactorFor = (month: number) => growthFactor(growth.commercialRentPercent, annualGrowthPeriods(month, growthStart));
  return { derivedLines: commercialCostLines(spaces, operationStart, rentFactorFor), resolutions };
}

function residentialAreaSf(input: ApartmentOperationsInputs) {
  return Array.isArray(input.residentialUnitTypes)
    ? input.residentialUnitTypes.filter(isLineObject).reduce((sum, line) => (
      Number.isFinite(line.averageAreaSf) && Number.isFinite(line.units) ? sum + line.averageAreaSf * line.units : sum
    ), 0)
    : 0;
}

export function projectApartmentOperationsThrough(
  input: ApartmentOperationsInputs,
  endMonth: string,
): MonthlyApartmentOperations[] {
  const start = monthIndex(input.analysisStartMonth);
  const end = monthIndex(endMonth);
  if (start === null || end === null || end < start) return [];
  const months = Array.from({ length: end - start + 1 }, (_, offset) => {
    const index = start + offset;
    const month = `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
    return {
      month,
      lineAmounts: {},
      usesByCategory: {
        land: 0,
        hard_cost: 0,
        soft_cost: 0,
        development_fee: 0,
        financing_fee: 0,
      },
      totalUses: 0,
    };
  });
  const costSchedule: MonthlyCostScheduleResult = {
    months,
    costLineSchedules: [],
    totalsByCategory: {
      land: 0,
      hard_cost: 0,
      soft_cost: 0,
      development_fee: 0,
      financing_fee: 0,
    },
    totalUses: 0,
    aggregateFormulaTraces: [],
  };
  return calculate(input, costSchedule).months;
}

function validate(input: ApartmentOperationsInputs) {
  const issues: ApartmentOperationsIssue[] = [];
  if (input.inputVersion !== APARTMENT_OPERATIONS_INPUT_VERSION) {
    addIssue(issues, "inputVersion", "unsupported_input_version", `Use ${APARTMENT_OPERATIONS_INPUT_VERSION}.`);
  }
  const operation = monthIndex(input.operationStartMonth);
  const growthStart = monthIndex(input.growthStartMonth);
  const analysis = monthIndex(input.analysisStartMonth);
  const sale = monthIndex(input.saleMonth);
  if (operation === null) {
    addIssue(issues, "operationStartMonth", "invalid_month", "Operation start month must use YYYY-MM.");
  } else if (analysis !== null && sale !== null && (operation < analysis || operation > sale)) {
    addIssue(issues, "operationStartMonth", "outside_timeline", "Operation start month must stay within the analysis timeline.");
  }
  if (growthStart === null) {
    addIssue(issues, "growthStartMonth", "invalid_month", "Growth start month must use YYYY-MM.");
  } else if (analysis !== null && sale !== null && (growthStart < analysis || growthStart > sale)) {
    addIssue(issues, "growthStartMonth", "outside_timeline", "Growth start month must stay within the analysis timeline.");
  }
  validateWholeNumber(issues, "preleasedUnits", input.preleasedUnits, true);
  validateWholeNumber(issues, "leaseUpUnitsPerMonth", input.leaseUpUnitsPerMonth, false);
  for (const key of ["annualIncomeGrowthPercent", "annualExpenseGrowthPercent", "rentAdjustmentLossPercent", "freeRentPercent", "vacancyPercent", "creditLossPercent"] as const) {
    if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 100) {
      addIssue(issues, key, "invalid_percent", `${labelFor(key)} must be from 0 to 100 percent.`);
    }
  }
  validateAssumptionEvidence(issues, input.assumptionEvidence);

  const operationLineCount = [
    input.residentialUnitTypes,
    input.otherIncomeLines,
    input.operatingExpenseLines,
    input.capitalExpenditureLines,
    input.commercial?.spaces,
  ].reduce((total, lines) => total + (Array.isArray(lines) ? lines.length : 0), 0);
  if (operationLineCount > MAX_APARTMENT_OPERATION_LINES) {
    addIssue(issues, "operationsLines", "too_many_lines", `Apartment operations cannot contain more than ${MAX_APARTMENT_OPERATION_LINES} lines.`);
  }

  if (!Array.isArray(input.residentialUnitTypes) || input.residentialUnitTypes.length === 0) {
    addIssue(issues, "residentialUnitTypes", "missing_lines", "Add at least one residential unit type.");
  } else {
    validateSourcedLines(issues, input.residentialUnitTypes, "residentialUnitTypes");
    input.residentialUnitTypes.forEach((line, index) => {
      if (!isLineObject(line)) return;
      validateWholeNumber(issues, `residentialUnitTypes.${index}.units`, line.units, false);
      validateWholeNumber(issues, `residentialUnitTypes.${index}.nonRevenueUnits`, line.nonRevenueUnits, true);
      validateArea(issues, `residentialUnitTypes.${index}.averageAreaSf`, line.averageAreaSf);
      if (Number.isSafeInteger(line.units) && Number.isSafeInteger(line.nonRevenueUnits) && line.nonRevenueUnits > line.units) {
        addIssue(issues, `residentialUnitTypes.${index}.nonRevenueUnits`, "invalid_units", "Non-revenue units cannot exceed this unit type's units.");
      }
      validateMoney(issues, `residentialUnitTypes.${index}.monthlyMarketRent`, line.monthlyMarketRent, false);
      validateAffordability(issues, `residentialUnitTypes.${index}`, line);
    });
    const validLines = input.residentialUnitTypes.filter(isLineObject);
    const totalUnits = validLines.reduce((sum, line) => sum + line.units, 0);
    const revenueUnits = validLines.reduce((sum, line) => sum + line.units - line.nonRevenueUnits, 0);
    if (Number.isFinite(input.preleasedUnits) && input.preleasedUnits > revenueUnits) {
      addIssue(issues, "preleasedUnits", "invalid_units", "Pre-leased units cannot exceed revenue units.");
    }
    if (!Number.isSafeInteger(totalUnits) || totalUnits <= 0 || revenueUnits <= 0) {
      addIssue(issues, "residentialUnitTypes", "invalid_units", "Residential unit types must include at least one revenue unit.");
    }
  }

  validateMoneyLines(issues, input.otherIncomeLines, "otherIncomeLines", OTHER_INCOME_UNITS);
  validateMoneyLines(issues, input.operatingExpenseLines, "operatingExpenseLines", OPERATING_EXPENSE_UNITS);
  validateMoneyLines(issues, input.capitalExpenditureLines, "capitalExpenditureLines", CAPITAL_EXPENDITURE_UNITS);
  validateExpenseRamp(issues, input, operation, analysis);
  validateLeaseUpConcession(issues, input.leaseUpConcession);
  validateSeasonalAbsorption(issues, input.seasonalAbsorption);
  validateStabilizationRule(issues, input.stabilizationRule);
  validateOccupancyCap(issues, input);
  validateLeaseTurnover(issues, input.leaseTurnover);
  validateCategoryGrowth(issues, input.categoryGrowth);
  return issues;
}

function validateExpenseRamp(
  issues: ApartmentOperationsIssue[],
  input: ApartmentOperationsInputs,
  operation: number | null,
  analysis: number | null,
) {
  const sections = [
    ["operatingExpenseLines", input.operatingExpenseLines],
    ["capitalExpenditureLines", input.capitalExpenditureLines],
  ] as const;
  for (const [path, lines] of sections) {
    if (!Array.isArray(lines)) continue;
    lines.forEach((line, index) => {
      if (!isLineObject(line)) return;
      const linePath = `${path}.${index}`;
      const { variablePercent } = line;
      if (variablePercent !== undefined) {
        if (!(typeof variablePercent === "number" && Number.isFinite(variablePercent) && variablePercent >= 0 && variablePercent <= 100)) {
          addIssue(issues, `${linePath}.variablePercent`, "invalid_percent", "Variable share must be from 0 to 100 percent.");
        } else if (line.unit === "percent_effective_gross_revenue" && variablePercent > 0) {
          addIssue(issues, `${linePath}.variablePercent`, "unsupported_unit", "A percent-of-revenue line already moves with revenue, so it takes no variable share.");
        }
      }
      const leadMonths = (line as OperatingExpenseLine).leadMonths;
      if (leadMonths === undefined) return;
      if (path !== "operatingExpenseLines") {
        addIssue(issues, `${linePath}.leadMonths`, "invalid_line", "Only operating expense lines can start before operation start.");
      } else if (!Number.isSafeInteger(leadMonths) || leadMonths < 0 || leadMonths > MAX_EXPENSE_LEAD_MONTHS) {
        addIssue(issues, `${linePath}.leadMonths`, "invalid_units", `Lead months must be a whole number from 0 to ${MAX_EXPENSE_LEAD_MONTHS}.`);
      } else if (line.unit === "percent_effective_gross_revenue" && leadMonths > 0) {
        addIssue(issues, `${linePath}.leadMonths`, "unsupported_unit", "A percent-of-revenue line has nothing to charge before revenue starts.");
      } else if (operation !== null && analysis !== null && operation - leadMonths < analysis && (line as OperatingExpenseLine).appliesTo !== "commercial") {
        addIssue(issues, `${linePath}.leadMonths`, "outside_timeline", "Lead months cannot start the line before the analysis start month.");
      }
    });
  }
}

function validateLeaseUpConcession(issues: ApartmentOperationsIssue[], concession: LeaseUpConcession | undefined) {
  if (concession === undefined) return;
  const path = "leaseUpConcession";
  if (!isEvidenceObject(concession)) {
    addIssue(issues, path, "invalid_line", "Lease-up concession must be an object.");
    return;
  }
  const { leaseTermMonths, monthsFree, timing } = concession;
  if (!Number.isSafeInteger(leaseTermMonths) || leaseTermMonths < 1 || leaseTermMonths > MAX_CONCESSION_LEASE_TERM_MONTHS) {
    addIssue(issues, `${path}.leaseTermMonths`, "invalid_units", `Lease term must be a whole number of months from 1 to ${MAX_CONCESSION_LEASE_TERM_MONTHS}.`);
  }
  if (!(typeof monthsFree === "number" && Number.isFinite(monthsFree) && monthsFree > 0 && hasAtMostDecimals(monthsFree, 2))) {
    addIssue(issues, `${path}.monthsFree`, "invalid_amount", "Months free must be above zero with no more than two decimal places.");
  } else if (Number.isSafeInteger(leaseTermMonths) && monthsFree > leaseTermMonths) {
    addIssue(issues, `${path}.monthsFree`, "invalid_amount", "Months free cannot exceed the lease term.");
  }
  if (!(LEASE_UP_CONCESSION_TIMINGS as readonly string[]).includes(timing)) {
    addIssue(issues, `${path}.timing`, "invalid_concession_timing", "Concession timing must be at move-in or spread over the lease term.");
  }
  validateEvidence(issues, path, concession);
}

function validateSeasonalAbsorption(issues: ApartmentOperationsIssue[], seasonal: SeasonalAbsorption | undefined) {
  if (seasonal === undefined) return;
  const path = "seasonalAbsorption";
  if (!isEvidenceObject(seasonal)) {
    addIssue(issues, path, "invalid_line", "Seasonal absorption must be an object.");
    return;
  }
  if (!Array.isArray(seasonal.monthlyFactors) || seasonal.monthlyFactors.length !== 12) {
    addIssue(issues, `${path}.monthlyFactors`, "invalid_absorption_factor", "Seasonal absorption needs twelve monthly factors, January first.");
  } else {
    seasonal.monthlyFactors.forEach((factor, index) => {
      if (!(typeof factor === "number" && Number.isFinite(factor) && factor >= 0 && factor <= MAX_SEASONAL_ABSORPTION_FACTOR && hasAtMostDecimals(factor, 4))) {
        addIssue(issues, `${path}.monthlyFactors.${index}`, "invalid_absorption_factor", `Each factor must be from 0 to ${MAX_SEASONAL_ABSORPTION_FACTOR} with no more than four decimal places.`);
      }
    });
  }
  validateEvidence(issues, path, seasonal);
}

function validateCategoryGrowth(issues: ApartmentOperationsIssue[], growth: CategoryGrowth | undefined) {
  if (growth === undefined) return;
  const path = "categoryGrowth";
  if (!isEvidenceObject(growth)) {
    addIssue(issues, path, "invalid_line", "Growth by category must be an object.");
    return;
  }
  for (const category of GROWTH_CATEGORIES) {
    const rates = growth[category];
    if (category === "commercialRentPercent" && (rates === undefined || rates === null)) continue;
    if (!Array.isArray(rates) || rates.length === 0 || rates.length > MAX_GROWTH_YEARS) {
      addIssue(issues, `${path}.${category}`, "invalid_percent", `${GROWTH_CATEGORY_LABELS[category]} needs from 1 to ${MAX_GROWTH_YEARS} yearly rates.`);
      continue;
    }
    rates.forEach((rate, index) => {
      if (!(typeof rate === "number" && Number.isFinite(rate) && rate >= 0 && rate <= 100 && hasAtMostDecimals(rate, 4))) {
        addIssue(issues, `${path}.${category}.${index}`, "invalid_percent", `${GROWTH_CATEGORY_LABELS[category]} for year ${index + 1} must be from 0 to 100 percent with no more than four decimal places.`);
      }
    });
  }
  validateEvidence(issues, path, growth);
}

export const GROWTH_CATEGORY_LABELS: Record<GrowthCategory, string> = {
  marketRentPercent: "Market Rent Growth",
  affordableRentPercent: "Affordable Rent Growth",
  otherIncomePercent: "Other Income Growth",
  operatingExpensePercent: "Operating Expense Growth",
  commercialRentPercent: "Commercial Rent Growth",
};

function validateStabilizationRule(issues: ApartmentOperationsIssue[], rule: StabilizationRule | undefined) {
  if (rule === undefined) return;
  const path = "stabilizationRule";
  if (!isEvidenceObject(rule)) {
    addIssue(issues, path, "invalid_line", "Stabilization rule must be an object.");
    return;
  }
  const { targetOccupancyPercent, holdMonths } = rule;
  if (!(typeof targetOccupancyPercent === "number" && Number.isFinite(targetOccupancyPercent) && targetOccupancyPercent > 0 && targetOccupancyPercent <= 100)) {
    addIssue(issues, `${path}.targetOccupancyPercent`, "invalid_percent", "Target occupancy must be above 0 and at most 100 percent.");
  }
  if (!Number.isSafeInteger(holdMonths) || holdMonths < 1 || holdMonths > MAX_STABILIZATION_HOLD_MONTHS) {
    addIssue(issues, `${path}.holdMonths`, "invalid_units", `Hold months must be a whole number from 1 to ${MAX_STABILIZATION_HOLD_MONTHS}.`);
  }
  validateEvidence(issues, path, rule);
}

function validateOccupancyCap(issues: ApartmentOperationsIssue[], input: ApartmentOperationsInputs) {
  const cap = input.occupancyCap;
  if (cap === undefined) return;
  if (!isEvidenceObject(cap)) {
    addIssue(issues, "occupancyCap", "invalid_line", "Occupancy cap must be an object.");
    return;
  }
  validateEvidence(issues, "occupancyCap", cap);
  if (!(typeof input.vacancyPercent === "number" && Number.isFinite(input.vacancyPercent) && input.vacancyPercent >= 0 && input.vacancyPercent < 100)) return;
  const capPercent = 100 - input.vacancyPercent;
  const rule = input.stabilizationRule;
  if (rule && isEvidenceObject(rule) && typeof rule.targetOccupancyPercent === "number" && rule.targetOccupancyPercent > capPercent + 1e-9) {
    addIssue(
      issues,
      "stabilizationRule.targetOccupancyPercent",
      "occupancy_cap_conflict",
      `With the occupancy cap on, leased units stop at ${capPercent} percent of revenue units, so the stabilization target cannot be higher.`,
    );
  }
  const revenueUnits = Array.isArray(input.residentialUnitTypes)
    ? input.residentialUnitTypes.filter(isLineObject).reduce((sum, line) => sum + line.units - line.nonRevenueUnits, 0)
    : 0;
  if (typeof input.preleasedUnits === "number" && revenueUnits > 0 && input.preleasedUnits > revenueUnits * capPercent / 100 + 1e-9) {
    addIssue(
      issues,
      "preleasedUnits",
      "occupancy_cap_conflict",
      `With the occupancy cap on, pre-leased units cannot exceed ${capPercent} percent of revenue units.`,
    );
  }
}

function validateLeaseTurnover(issues: ApartmentOperationsIssue[], turnover: LeaseTurnover | undefined) {
  if (turnover === undefined) return;
  const path = "leaseTurnover";
  if (!isEvidenceObject(turnover)) {
    addIssue(issues, path, "invalid_line", "Lease turnover must be an object.");
    return;
  }
  const { turnoverPercent, leaseTermMonths, vacantMonths, basis } = turnover;
  if (!(typeof turnoverPercent === "number" && Number.isFinite(turnoverPercent) && turnoverPercent >= 0 && turnoverPercent <= 100 && hasAtMostDecimals(turnoverPercent, 2))) {
    addIssue(issues, `${path}.turnoverPercent`, "invalid_percent", "Turnover must be from 0 to 100 percent with no more than two decimal places.");
  }
  if (!Number.isSafeInteger(leaseTermMonths) || leaseTermMonths < 1 || leaseTermMonths > MAX_CONCESSION_LEASE_TERM_MONTHS) {
    addIssue(issues, `${path}.leaseTermMonths`, "invalid_units", `Lease term must be a whole number of months from 1 to ${MAX_CONCESSION_LEASE_TERM_MONTHS}.`);
  }
  if (!Number.isSafeInteger(vacantMonths) || vacantMonths < 0 || vacantMonths > MAX_TURNOVER_VACANT_MONTHS) {
    addIssue(issues, `${path}.vacantMonths`, "invalid_units", `Vacant months must be a whole number from 0 to ${MAX_TURNOVER_VACANT_MONTHS}.`);
  }
  if (!(LEASE_TURNOVER_BASES as readonly string[]).includes(basis)) {
    addIssue(issues, `${path}.basis`, "invalid_turnover_basis", "Turnover basis must be each new lease once, every expiring lease, or net units gained.");
  }
  validateEvidence(issues, path, turnover);
}

function isEvidenceObject(value: unknown): value is Evidence {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function validateEvidence(issues: ApartmentOperationsIssue[], path: string, item: Evidence) {
  validateSourceLabel(issues, `${path}.sourceLabel`, item.sourceLabel);
  if (item.sourceDate !== undefined && !validDate(item.sourceDate)) {
    addIssue(issues, `${path}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
  }
  if (item.reviewState !== "working" && item.reviewState !== "done") {
    addIssue(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on It or Done.");
  }
}

function hasAtMostDecimals(value: number, places: number) {
  const scale = 10 ** places;
  return Math.abs(value * scale - Math.round(value * scale)) < 1e-6;
}

function validateAssumptionEvidence(
  issues: ApartmentOperationsIssue[],
  evidence: Record<ApartmentOperationsAssumptionKey, ApartmentOperationsAssumptionEvidence>,
) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    addIssue(issues, "assumptionEvidence", "missing_lines", "Add source and review details for the operating assumptions.");
    return;
  }
  for (const key of APARTMENT_OPERATIONS_ASSUMPTION_KEYS) {
    const item = evidence[key];
    const path = `assumptionEvidence.${key}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      addIssue(issues, path, "missing_lines", `${labelFor(key)} needs source and review details.`);
      continue;
    }
    if (item.sourceDate !== undefined && !validDate(item.sourceDate)) {
      addIssue(issues, `${path}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
    }
    validateSourceLabel(issues, `${path}.sourceLabel`, item.sourceLabel);
    if (item.reviewState !== "working" && item.reviewState !== "done") {
      addIssue(issues, `${path}.reviewState`, "invalid_review_state", "Review state must be Working on It or Done.");
    }
  }
}

function validateWholeNumber(issues: ApartmentOperationsIssue[], path: string, value: number, allowZero: boolean) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    addIssue(issues, path, "invalid_units", `${labelFor(path)} must be ${allowZero ? "zero or a positive" : "a positive"} whole number.`);
  }
}

function validateMoneyLines(
  issues: ApartmentOperationsIssue[],
  lines: Array<SourcedLine & { amount: number; unit: string }>,
  path: string,
  units: string[],
) {
  if (!Array.isArray(lines)) {
    addIssue(issues, path, "missing_lines", `${labelFor(path)} must be an array.`);
    return;
  }
  validateSourcedLines(issues, lines, path);
  lines.forEach((line, index) => {
    if (!isLineObject(line)) return;
    validateMoney(issues, `${path}.${index}.amount`, line.amount, true);
    if (!units.includes(line.unit)) {
      addIssue(issues, `${path}.${index}.unit`, "unsupported_unit", `${labelFor(path)} unit is not supported.`);
    }
    if (line.unit === "percent_effective_gross_revenue" && line.amount > 100) {
      addIssue(issues, `${path}.${index}.amount`, "invalid_percent", "Expense percent must be from 0 to 100 percent.");
    }
  });
}

function validateSourcedLines(issues: ApartmentOperationsIssue[], lines: SourcedLine[], path: string) {
  const ids = new Set<string>();
  lines.forEach((line, index) => {
    const linePath = `${path}.${index}`;
    if (!isLineObject(line)) {
      addIssue(issues, linePath, "invalid_line", "Line must be an object.");
      return;
    }
    if (typeof line.id !== "string" || line.id.trim() === "") {
      addIssue(issues, `${linePath}.id`, "missing_text", "Line ID is required.");
    } else if (line.id.length > MAX_OPERATION_LINE_ID_LENGTH) {
      addIssue(issues, `${linePath}.id`, "text_too_long", `Line ID cannot exceed ${MAX_OPERATION_LINE_ID_LENGTH} characters.`);
    } else if (ids.has(line.id)) {
      addIssue(issues, `${linePath}.id`, "duplicate_id", "Line IDs must be unique within this section.");
    } else {
      ids.add(line.id);
    }
    if (typeof line.name !== "string" || line.name.trim() === "") {
      addIssue(issues, `${linePath}.name`, "missing_text", "Line name is required.");
    } else if (line.name.length > MAX_OPERATION_LINE_NAME_LENGTH) {
      addIssue(issues, `${linePath}.name`, "text_too_long", `Line name cannot exceed ${MAX_OPERATION_LINE_NAME_LENGTH} characters.`);
    }
    validateSourceLabel(issues, `${linePath}.sourceLabel`, line.sourceLabel);
    if (line.sourceDate !== undefined && !validDate(line.sourceDate)) {
      addIssue(issues, `${linePath}.sourceDate`, "invalid_source_date", "Source date must be a valid YYYY-MM-DD date.");
    }
    if (line.reviewState !== "working" && line.reviewState !== "done") {
      addIssue(issues, `${linePath}.reviewState`, "invalid_review_state", "Review state must be Working on It or Done.");
    }
  });
}

function isLineObject<T extends object>(line: T): line is T & SourcedLine {
  return Boolean(line && typeof line === "object" && !Array.isArray(line));
}

function validateSourceLabel(issues: ApartmentOperationsIssue[], path: string, value: unknown) {
  if (value !== undefined && typeof value !== "string") {
    addIssue(issues, path, "missing_text", "Source label must be text.");
  } else if (typeof value === "string" && value.length > MAX_OPERATION_SOURCE_LABEL_LENGTH) {
    addIssue(issues, path, "text_too_long", `Source label cannot exceed ${MAX_OPERATION_SOURCE_LABEL_LENGTH} characters.`);
  }
}

function validateMoney(issues: ApartmentOperationsIssue[], path: string, value: number, allowZero: boolean) {
  const cents = Math.round(value * 100);
  if (!Number.isFinite(value) || value < (allowZero ? 0 : 0.01) || !Number.isSafeInteger(cents) || Math.abs(value - cents / 100) > 1e-9) {
    addIssue(issues, path, "invalid_amount", `${labelFor(path)} must be ${allowZero ? "zero or " : ""}a positive amount with no more than two decimal places.`);
  }
}

function validateAffordability(issues: ApartmentOperationsIssue[], path: string, line: ResidentialUnitType) {
  const tier = line.affordabilityTier;
  if (tier !== undefined && !(AFFORDABILITY_TIERS as readonly string[]).includes(tier)) {
    addIssue(issues, `${path}.affordabilityTier`, "invalid_affordability_tier", "Affordability tier must be market, workforce, or affordable.");
    return;
  }
  const ami = line.amiPercent;
  if (ami === undefined) return;
  if (!(typeof ami === "number" && Number.isFinite(ami) && ami > 0 && ami <= 200)) {
    addIssue(issues, `${path}.amiPercent`, "invalid_percent", "AMI percent must be above 0 and at most 200.");
  } else if ((tier ?? "market") === "market") {
    addIssue(issues, `${path}.amiPercent`, "invalid_affordability_tier", "Only workforce and affordable unit types carry an AMI percent.");
  }
}

function validateArea(issues: ApartmentOperationsIssue[], path: string, value: number) {
  if (!Number.isFinite(value) || value <= 0 || !Number.isSafeInteger(Math.round(value * 100))) {
    addIssue(issues, path, "invalid_units", `${labelFor(path)} must be a positive area.`);
  }
}

function calculate(input: ApartmentOperationsInputs, costSchedule: MonthlyCostScheduleResult): ApartmentOperationsResult {
  const operationStart = monthIndex(input.operationStartMonth)!;
  const growthStart = monthIndex(input.growthStartMonth)!;
  const totalUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units, 0);
  const nonRevenueUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.nonRevenueUnits, 0);
  const revenueUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units - line.nonRevenueUnits, 0);
  const totalAreaSf = input.residentialUnitTypes.reduce((sum, line) => sum + line.averageAreaSf * line.units, 0);
  const unitTypeSummaries = input.residentialUnitTypes.map((line) => ({
    id: line.id,
    units: line.units,
    nonRevenueUnits: line.nonRevenueUnits,
    revenueUnits: line.units - line.nonRevenueUnits,
    averageAreaSf: line.averageAreaSf,
    areaSf: line.averageAreaSf * line.units,
  }));

  let potentialIncomeYearToDate = 0;
  let vacancyLossYearToDate = 0;
  let creditLossYearToDate = 0;
  const lastOffset = monthIndex(costSchedule.months.at(-1)?.month ?? input.operationStartMonth)! - operationStart;
  const leasing = leasingPath(input, revenueUnits, operationStart, lastOffset);
  const leasedByOffset = leasing.leased;
  const stabilizedOffset = firstStabilizedOffset(leasedByOffset, input.stabilizationRule, revenueUnits, occupancyCapPercent(input));
  // A line tagged commercial leads the first commercial lease, not operation start, so it sets no pre-operation lead.
  const leadMonths = Math.max(0, ...input.operatingExpenseLines.filter(isResidentialLine).map((line) => line.leadMonths ?? 0));
  const growth = growthRates(input);
  const spaces = input.commercial ? resolveSpaces(input.commercial, input.milestones, totalAreaSf) : [];
  const firstLease = input.commercial ? firstLeaseStartIndex(input.commercial.spaces, input.milestones) : null;
  const expenseLineIndex = new Map(input.operatingExpenseLines.map((line, index) => [line.id, index]));
  const spaceTotals = spaces.map((space) => ({
    baseRent: 0,
    freeRent: 0,
    recoveries: space.recoveries.map(() => ({ total: 0, shareOfBasis: 0 })),
  }));

  const months = costSchedule.months.map((costMonth) => {
    const operationOffset = monthIndex(costMonth.month)! - operationStart;
    const currentMonth = monthIndex(costMonth.month)!;
    const growthPeriods = annualGrowthPeriods(currentMonth, growthStart);
    const expenseGrowth = growthFactor(growth.operatingExpensePercent, growthPeriods);
    if (operationOffset < -leadMonths) return emptyMonth(costMonth.month, costMonth.totalUses);
    if (operationOffset < 0) {
      const operatingExpenses = input.operatingExpenseLines
        .filter((line) => isResidentialLine(line) && (line.leadMonths ?? 0) >= -operationOffset)
        .reduce((sum, line) => sum + lineAmountCents(line, operationOffset, 0, 0, totalUnits, 0, expenseGrowth), 0);
      return moneyMonth({
        ...emptyMonth(costMonth.month, costMonth.totalUses),
        operatingExpenses,
        netOperatingIncome: -operatingExpenses,
        operatingCashFlow: -operatingExpenses,
        residentialNetOperatingIncome: -operatingExpenses,
      });
    }
    const rentGrowth = {
      market: growthFactor(growth.marketRentPercent, growthPeriods),
      affordable: growthFactor(growth.affordableRentPercent, growthPeriods),
    };
    const rentGrowthFor = (line: ResidentialUnitType) => (line.affordabilityTier ?? "market") === "market" ? rentGrowth.market : rentGrowth.affordable;
    const leasedUnits = leasedByOffset[operationOffset];
    const occupancy = leasedUnits / revenueUnits;
    const residentialGrossRent = input.residentialUnitTypes.reduce(
      (sum, line) => sum + grownCents(cents(line.monthlyMarketRent), rentGrowthFor(line)) * line.units,
      0,
    );
    const nonRevenueRentAdjustment = -input.residentialUnitTypes.reduce(
      (sum, line) => sum + grownCents(cents(line.monthlyMarketRent), rentGrowthFor(line)) * line.nonRevenueUnits,
      0,
    );
    const revenueRentCents = residentialGrossRent + nonRevenueRentAdjustment;
    const leaseUpLoss = -Math.round(revenueRentCents * (revenueUnits - leasedUnits) / revenueUnits);
    const occupiedResidentialRent = residentialGrossRent + nonRevenueRentAdjustment + leaseUpLoss;
    const rentAdjustmentLoss = -percentOf(occupiedResidentialRent, input.rentAdjustmentLossPercent);
    const freeRentLoss = -percentOf(occupiedResidentialRent, input.freeRentPercent);
    const leaseUpConcessionLoss = input.leaseUpConcession
      ? 0 - Math.round(revenueRentCents * concessionUnits(input.leaseUpConcession, leasing.signed, operationOffset) / revenueUnits)
      : 0;
    const totalResidentialRent = occupiedResidentialRent + rentAdjustmentLoss + freeRentLoss + leaseUpConcessionLoss;
    const otherIncome = input.otherIncomeLines.reduce((sum, line) => sum + lineAmountCents(
      line,
      operationOffset,
      occupancy,
      leasedUnits,
      totalUnits,
      0,
      growthFactor(growth.otherIncomePercent, growthPeriods),
    ), 0);
    const totalPotentialIncome = totalResidentialRent + otherIncome;
    if (operationOffset % 12 === 0) {
      potentialIncomeYearToDate = 0;
      vacancyLossYearToDate = 0;
      creditLossYearToDate = 0;
    }
    potentialIncomeYearToDate += totalPotentialIncome;
    const cumulativeVacancyLoss = input.occupancyCap ? 0 : percentOf(potentialIncomeYearToDate, input.vacancyPercent);
    const cumulativeCreditLoss = percentOf(potentialIncomeYearToDate, input.creditLossPercent);
    const vacancyLoss = -(cumulativeVacancyLoss - vacancyLossYearToDate);
    const creditLoss = -(cumulativeCreditLoss - creditLossYearToDate);
    vacancyLossYearToDate = cumulativeVacancyLoss;
    creditLossYearToDate = cumulativeCreditLoss;
    const residentialEffectiveGrossRevenue = totalPotentialIncome + vacancyLoss + creditLoss;
    /*
     * Commercial rent comes first because the income-basis tax reads it. Recoveries come after the
     * tax and the expense lines they reimburse, and they stay out of the tax's revenue, which
     * would otherwise loop: tax sets the recovery, and the recovery would set the tax.
     */
    const rentFactor = growthFactor(growth.commercialRentPercent, growthPeriods);
    const spaceRents = spaces.map((space) => spaceRentForMonth(space, currentMonth, operationOffset, rentFactor));
    const commercialBaseRent = spaceRents.reduce((sum, rent) => sum + rent.baseRent, 0);
    const commercialFreeRent = spaceRents.reduce((sum, rent) => sum + rent.freeRent, 0);
    const commercialRent = commercialBaseRent + commercialFreeRent;
    const commercialRentLoss = input.commercial
      ? percentOf(commercialRent, input.commercial.vacancyPercent) + percentOf(commercialRent, input.commercial.creditLossPercent)
      : 0;
    const tax = input.propertyTax
      ? propertyTaxForMonth(input.propertyTax, currentMonth, residentialEffectiveGrossRevenue + commercialRent - commercialRentLoss, stabilizedOffset !== null && operationOffset >= stabilizedOffset)
      : { full: 0, scheduled: 0 };
    const commercialLineActive = (line: OperatingExpenseLine) => firstLease !== null && currentMonth >= firstLease - (line.leadMonths ?? 0);
    // A line tagged commercial that is a percent of revenue waits for commercial revenue, so it stays null here.
    const lineCents = input.operatingExpenseLines.map((line): number | null => {
      if (isResidentialLine(line)) {
        return lineAmountCents(line, operationOffset, occupancy, leasedUnits, totalUnits, residentialEffectiveGrossRevenue, expenseGrowth);
      }
      if (line.unit === "percent_effective_gross_revenue") return null;
      return commercialLineActive(line) ? lineAmountCents(line, operationOffset, 0, 0, 0, 0, expenseGrowth) : 0;
    });
    let commercialRecoveries = 0;
    let billedSharedCosts = 0;
    spaces.forEach((space, spaceIndex) => {
      if (currentMonth < space.leaseStartIndex) return;
      space.recoveries.forEach((resolved, position) => {
        const { basis } = resolved.recovery;
        let basisCents = 0;
        let sharedCents = 0;
        if (basis.kind === "property_tax") {
          basisCents = tax.scheduled;
          sharedCents = tax.scheduled;
        } else {
          for (const lineId of basis.lineIds) {
            const lineIndex = expenseLineIndex.get(lineId)!;
            const amount = lineCents[lineIndex] ?? 0;
            basisCents += amount;
            if (isResidentialLine(input.operatingExpenseLines[lineIndex])) sharedCents += amount;
          }
        }
        const recovered = Math.round(basisCents * resolved.sharePercent / 100);
        commercialRecoveries += recovered;
        billedSharedCosts += Math.min(recovered, Math.round(sharedCents * resolved.sharePercent / 100));
        spaceTotals[spaceIndex].recoveries[position].total += recovered;
        spaceTotals[spaceIndex].recoveries[position].shareOfBasis += basisCents * resolved.sharePercent / 100;
      });
    });
    spaces.forEach((_, spaceIndex) => {
      spaceTotals[spaceIndex].baseRent += spaceRents[spaceIndex].baseRent;
      spaceTotals[spaceIndex].freeRent += spaceRents[spaceIndex].freeRent;
    });
    const commercialPotentialIncome = commercialRent + commercialRecoveries;
    const commercialVacancyLoss = input.commercial ? 0 - percentOf(commercialPotentialIncome, input.commercial.vacancyPercent) : 0;
    const commercialCreditLoss = input.commercial ? 0 - percentOf(commercialPotentialIncome, input.commercial.creditLossPercent) : 0;
    const commercialEffectiveGrossRevenue = commercialPotentialIncome + commercialVacancyLoss + commercialCreditLoss;
    input.operatingExpenseLines.forEach((line, index) => {
      if (lineCents[index] === null) {
        lineCents[index] = commercialLineActive(line) ? percentOf(commercialEffectiveGrossRevenue, line.amount) : 0;
      }
    });
    const taggedExpenses = input.operatingExpenseLines.reduce((sum, line, index) => isResidentialLine(line) ? sum : sum + lineCents[index]!, 0);
    const residentialLineExpenses = input.operatingExpenseLines.reduce((sum, line, index) => isResidentialLine(line) ? sum + lineCents[index]! : sum, 0);
    const operatingExpenses = tax.scheduled + residentialLineExpenses + taggedExpenses;
    const commercialOperatingExpenses = taggedExpenses + billedSharedCosts;
    const effectiveGrossRevenue = residentialEffectiveGrossRevenue + commercialEffectiveGrossRevenue;
    const netOperatingIncome = effectiveGrossRevenue - operatingExpenses;
    const commercialNetOperatingIncome = commercialEffectiveGrossRevenue - commercialOperatingExpenses;
    const residentialNetOperatingIncome = residentialEffectiveGrossRevenue - (tax.scheduled + residentialLineExpenses - billedSharedCosts);
    const capitalExpenditures = input.capitalExpenditureLines.reduce((sum, line) => sum + lineAmountCents(
      line,
      operationOffset,
      occupancy,
      leasedUnits,
      totalUnits,
      0,
      expenseGrowth,
    ), 0);
    const operatingCashFlow = netOperatingIncome - capitalExpenditures;
    return moneyMonth({
      month: costMonth.month,
      totalUses: costMonth.totalUses,
      revenueUnits,
      leasedUnits,
      turnedUnits: leasing.turned[operationOffset],
      occupiedUnits: leasedUnits,
      leaseUpPercent: leasedUnits / revenueUnits,
      residentialGrossRent,
      nonRevenueRentAdjustment,
      leaseUpLoss,
      rentAdjustmentLoss,
      freeRentLoss,
      leaseUpConcessionLoss,
      totalResidentialRent,
      otherIncome,
      totalPotentialIncome,
      vacancyLoss,
      creditLoss,
      effectiveGrossRevenue,
      operatingExpenses,
      propertyTax: tax.scheduled,
      fullPropertyTax: tax.full,
      netOperatingIncome,
      capitalExpenditures,
      operatingCashFlow,
      commercialBaseRent,
      commercialFreeRent,
      commercialRecoveries,
      commercialVacancyLoss,
      commercialCreditLoss,
      commercialEffectiveGrossRevenue,
      commercialOperatingExpenses,
      commercialNetOperatingIncome,
      residentialNetOperatingIncome,
    });
  });
  const totals = totalOperations(months);
  const stabilizedMonth = stabilizedOffset === null ? undefined : monthLabelFor(operationStart + stabilizedOffset);
  const expenseNames = new Map(input.operatingExpenseLines.map((line) => [line.id, line.name]));
  const commercial: CommercialOperationsResult | undefined = input.commercial
    ? (() => {
      const rentFactorFor = (month: number) => growthFactor(growth.commercialRentPercent, annualGrowthPeriods(month, growthStart));
      const summaries = spaces.map((space, index): CommercialSpaceSummary => ({
        id: space.space.id,
        name: space.space.name,
        areaSf: space.space.areaSf,
        leaseStartMonth: space.leaseStartMonth,
        annualRentRoll: dollars(space.annualRentCents),
        tenantImprovements: dollars(tenantImprovementCents(space.space)),
        leasingCommission: dollars(leasingCommissionCents(space.space, scheduledRentOverTerm(space, operationStart, rentFactorFor))),
        baseRentTotal: dollars(spaceTotals[index].baseRent),
        freeRentTotal: dollars(spaceTotals[index].freeRent),
        recoveries: space.recoveries.map((resolved, position) => ({
          basis: recoveryBasisLabel(resolved.recovery, expenseNames),
          sharePercent: resolved.sharePercent,
          shareSource: resolved.shareSource,
          total: dollars(spaceTotals[index].recoveries[position].total),
          shareOfBasis: dollars(spaceTotals[index].recoveries[position].shareOfBasis),
        })),
      }));
      return {
        spaces: summaries,
        commercialAreaSf: commercialAreaSf(input.commercial!),
        allocationAreaSf: totalAreaSf + commercialAreaSf(input.commercial!),
        annualRentRoll: dollars(spaces.reduce((sum, space) => sum + space.annualRentCents, 0)),
        tenantImprovements: dollars(summaries.reduce((sum, space) => sum + cents(space.tenantImprovements), 0)),
        leasingCommissions: dollars(summaries.reduce((sum, space) => sum + cents(space.leasingCommission), 0)),
      };
    })()
    : undefined;
  return {
    costSchedule,
    unitTypeSummaries,
    unitSummary: { totalUnits, revenueUnits, nonRevenueUnits, totalAreaSf },
    months,
    totals,
    firstStabilizedMonth: stabilizedMonth,
    propertyTax: input.propertyTax ? propertyTaxResult(input.propertyTax, months, input.operationStartMonth, stabilizedMonth) : null,
    ...(commercial ? { commercial } : {}),
    formulaTraces: formulaTraces(input),
  };
}

function isResidentialLine(line: OperatingExpenseLine) {
  return line.appliesTo !== "commercial";
}

function lineAmountCents(
  line: { amount: number; unit: string; variablePercent?: number },
  operationOffset: number,
  occupancy: number,
  leasedUnits: number,
  totalUnits: number,
  effectiveGrossRevenueCents: number,
  growth: number,
) {
  const { amount, unit } = line;
  // The occupancy cap can leave a fraction of a unit leased, so the month rounds to whole cents.
  if (unit === "usd_per_occupied_unit_month") return Math.round(grownCents(cents(amount), growth) * leasedUnits);
  if (unit === "percent_effective_gross_revenue") return percentOf(effectiveGrossRevenueCents, amount);
  const annualCents = grownCents(cents(amount), growth) * (unit === "usd_per_unit_year" ? totalUnits : 1);
  const monthCents = annualAllocation(annualCents, operationOffset);
  const variableShare = (line.variablePercent ?? 0) / 100;
  if (variableShare === 0 || occupancy >= 1) return monthCents;
  return Math.round(monthCents * (1 - variableShare + variableShare * occupancy));
}

type LeasingPath = {
  /** Leased units at the end of each month from operation start. */
  leased: number[];
  /** New leases signed each month, pre-leased units in the first. */
  signed: number[];
  /** Leases that ended without renewal each month. */
  turned: number[];
};

/**
 * Leased units at each month from operation start. Pre-leased units lease in the first month. Each
 * later month signs the pace, times that calendar month's factor when seasonal factors are set, with
 * the running total rounded to whole units, and never more leases than the units free to lease. With
 * lease turnover, the turnover share of the leases expiring that month moves out first, with the
 * running total rounded the same way, and those units are free again after the vacant months.
 * Turnover stops once leased units have reached the stabilization target, or every revenue unit with
 * no rule; from then the vacancy percent carries it.
 */
function leasingPath(input: ApartmentOperationsInputs, revenueUnits: number, operationStart: number, lastOffset: number): LeasingPath {
  const factors = input.seasonalAbsorption?.monthlyFactors;
  const turnover = input.leaseTurnover;
  const targetPercent = input.stabilizationRule?.targetOccupancyPercent ?? occupancyCapPercent(input);
  const unitCeiling = revenueUnits * occupancyCapPercent(input) / 100;
  const leased = [input.preleasedUnits];
  const signed = [input.preleasedUnits];
  const turned = [0];
  const renewed = [0];
  let absorbedTenThousandths = 0;
  let turnedTenThousandths = 0;
  let reachedTarget = atTarget(input.preleasedUnits, targetPercent, revenueUnits);
  for (let offset = 1; offset <= lastOffset; offset += 1) {
    const factor = factors ? factors[(operationStart + offset) % 12] : 1;
    const absorbedBefore = Math.round(absorbedTenThousandths / 10_000);
    absorbedTenThousandths += Math.round(input.leaseUpUnitsPerMonth * factor * 10_000);
    const pace = Math.round(absorbedTenThousandths / 10_000) - absorbedBefore;
    const expiring = turnover ? expiringLeases(turnover, offset, leased, signed, renewed) : 0;
    let turnedNow = 0;
    if (turnover && !reachedTarget && expiring > 0) {
      const turnedBefore = Math.round(turnedTenThousandths / 10_000);
      turnedTenThousandths += Math.round(expiring * turnover.turnoverPercent * 100);
      turnedNow = Math.round(turnedTenThousandths / 10_000) - turnedBefore;
    }
    const stillVacant = turnover && turnover.vacantMonths > 0
      ? turnedNow + turned.slice(Math.max(1, offset - turnover.vacantMonths + 1)).reduce((sum, units) => sum + units, 0)
      : 0;
    const staying = leased[offset - 1] - turnedNow;
    const newLeases = Math.min(pace, Math.max(0, unitCeiling - staying - stillVacant));
    // A capped month can leave a fraction of a unit, so the last lease lands on the ceiling to the cent of a unit.
    leased.push(Math.abs(staying + newLeases - unitCeiling) < 1e-9 ? unitCeiling : staying + newLeases);
    signed.push(newLeases);
    turned.push(turnedNow);
    renewed.push(expiring - turnedNow);
    reachedTarget ||= atTarget(leased[offset], targetPercent, revenueUnits);
  }
  return { leased, signed, turned };
}

/** Leases that reach the end of a term this month under the turnover basis. */
function expiringLeases(turnover: LeaseTurnover, offset: number, leased: number[], signed: number[], renewed: number[]) {
  const start = offset - turnover.leaseTermMonths;
  if (start < 0) return 0;
  if (turnover.basis === "each_new_lease_once") return signed[start];
  if (turnover.basis === "every_expiring_lease") return signed[start] + renewed[start];
  return Math.max(0, leased[start] - (start === 0 ? 0 : leased[start - 1]));
}

/** The share of revenue units that can lease: every unit, or one less the vacancy percent with the occupancy cap on. */
function occupancyCapPercent(input: ApartmentOperationsInputs) {
  return input.occupancyCap ? 100 - input.vacancyPercent : 100;
}

function atTarget(leasedUnits: number, targetPercent: number, revenueUnits: number) {
  return revenueUnits > 0 && leasedUnits * 100 >= targetPercent * revenueUnits - 1e-9;
}

/** Leased units whose rent the concession forgoes this month, summed over each month's new leases. */
function concessionUnits(concession: LeaseUpConcession, signedByOffset: number[], operationOffset: number) {
  let units = 0;
  for (let signed = 0; signed <= operationOffset; signed += 1) {
    const newLeases = signedByOffset[signed];
    if (newLeases === 0) continue;
    const age = operationOffset - signed;
    const share = concession.timing === "at_move_in"
      ? Math.min(Math.max(concession.monthsFree - age, 0), 1)
      : age < concession.leaseTermMonths ? concession.monthsFree / concession.leaseTermMonths : 0;
    units += newLeases * share;
  }
  return units;
}

/**
 * The offset from operation start of the month leased units have held at or above the target for the
 * hold months, counting the first. Null when the run never gets there. Tax reads this before the
 * monthly loop, so it depends on leasing alone.
 */
function firstStabilizedOffset(leasedByOffset: number[], rule: StabilizationRule | undefined, revenueUnits: number, capPercent: number) {
  const target = rule?.targetOccupancyPercent ?? capPercent;
  const hold = rule?.holdMonths ?? 1;
  let held = 0;
  for (let offset = 0; offset < leasedByOffset.length; offset += 1) {
    held = atTarget(leasedByOffset[offset], target, revenueUnits) ? held + 1 : 0;
    if (held >= hold) return offset;
  }
  return null;
}

function monthLabelFor(index: number) {
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
}

function annualGrowthPeriods(month: number, growthStart: number) {
  return month < growthStart ? 0 : Math.floor((month - growthStart) / 12);
}

/** Each category's yearly rates: the block's lists, or the income and expense rates when it is absent. */
function growthRates(input: ApartmentOperationsInputs): Record<GrowthCategory, number[]> {
  // A block saved before commercial rent existed has no commercial list, so commercial rent follows market rent.
  if (input.categoryGrowth) return { ...input.categoryGrowth, commercialRentPercent: input.categoryGrowth.commercialRentPercent ?? input.categoryGrowth.marketRentPercent };
  const income = [input.annualIncomeGrowthPercent];
  return { marketRentPercent: income, affordableRentPercent: income, otherIncomePercent: income, operatingExpensePercent: [input.annualExpenseGrowthPercent], commercialRentPercent: income };
}

/** Compounds year one's rate, then year two's, and so on, with the last rate carrying forward. */
function growthFactor(rates: number[], periods: number) {
  const listed = Math.min(periods, rates.length - 1);
  let factor = 1;
  for (let year = 0; year < listed; year += 1) factor *= 1 + rates[year] / 100;
  return factor * (1 + rates[rates.length - 1] / 100) ** (periods - listed);
}

function grownCents(baseCents: number, factor: number) {
  return Math.round(baseCents * factor);
}

function annualAllocation(annualCents: number, operationOffset: number) {
  const position = ((operationOffset % 12) + 12) % 12;
  const prior = Math.round(annualCents * position / 12);
  const next = position === 11 ? annualCents : Math.round(annualCents * (position + 1) / 12);
  return next - prior;
}

function percentOf(baseCents: number, percent: number) {
  return Math.round(baseCents * percent / 100);
}

/** Every dollar field of a month. A month is built in cents and converted once, in moneyMonth. */
const MONEY_KEYS = [
  "residentialGrossRent", "nonRevenueRentAdjustment", "leaseUpLoss", "rentAdjustmentLoss",
  "freeRentLoss", "leaseUpConcessionLoss", "totalResidentialRent", "otherIncome", "totalPotentialIncome", "vacancyLoss",
  "creditLoss", "effectiveGrossRevenue", "operatingExpenses", "propertyTax", "fullPropertyTax", "netOperatingIncome",
  "capitalExpenditures", "operatingCashFlow",
  "commercialBaseRent", "commercialFreeRent", "commercialRecoveries", "commercialVacancyLoss", "commercialCreditLoss",
  "commercialEffectiveGrossRevenue", "commercialOperatingExpenses", "commercialNetOperatingIncome", "residentialNetOperatingIncome",
] as const satisfies ReadonlyArray<keyof ApartmentOperationsTotals>;

function moneyMonth(month: MonthlyApartmentOperations): MonthlyApartmentOperations {
  return {
    ...month,
    ...(Object.fromEntries(MONEY_KEYS.map((key) => [key, dollars(month[key])])) as Pick<MonthlyApartmentOperations, typeof MONEY_KEYS[number]>),
  };
}

function emptyMonth(month: string, totalUses: number): MonthlyApartmentOperations {
  return {
    month,
    totalUses,
    revenueUnits: 0,
    leasedUnits: 0,
    turnedUnits: 0,
    occupiedUnits: 0,
    leaseUpPercent: 0,
    ...(Object.fromEntries(MONEY_KEYS.map((key) => [key, 0])) as Pick<MonthlyApartmentOperations, typeof MONEY_KEYS[number]>),
  };
}

function totalOperations(months: MonthlyApartmentOperations[]): ApartmentOperationsTotals {
  return Object.fromEntries(MONEY_KEYS.map((key) => [
    key,
    dollars(months.reduce((sum, month) => sum + cents(month[key]), 0)),
  ])) as ApartmentOperationsTotals;
}

function operationReconciliations(result: ApartmentOperationsResult, input: ApartmentOperationsInputs) {
  const unitChecks = [
    check(
      "unit-total",
      "Unit total equals revenue units plus non-revenue units",
      result.unitSummary.totalUnits,
      result.unitSummary.revenueUnits + result.unitSummary.nonRevenueUnits,
      "count",
    ),
    check(
      "area-total",
      "Area total equals unit-type units times average area",
      result.unitSummary.totalAreaSf,
      result.unitTypeSummaries.reduce((sum, line) => sum + line.areaSf, 0),
      "sf",
    ),
  ];
  const monthlyChecks = result.months.flatMap((month) => [
    check(
      `potential-income:${month.month}`,
      `${month.month} potential income equals residential rent plus other income`,
      month.totalPotentialIncome,
      sumMoney(month.totalResidentialRent, month.otherIncome),
    ),
    check(
      `residential-rent:${month.month}`,
      `${month.month} residential rent equals its separate rent lines`,
      month.totalResidentialRent,
      sumMoney(month.residentialGrossRent, month.nonRevenueRentAdjustment, month.leaseUpLoss, month.rentAdjustmentLoss, month.freeRentLoss, month.leaseUpConcessionLoss),
    ),
    check(
      `effective-gross-revenue:${month.month}`,
      `${month.month} effective gross revenue equals potential income less vacancy and credit loss${result.commercial ? ", plus commercial effective gross revenue" : ""}`,
      month.effectiveGrossRevenue,
      sumMoney(month.totalPotentialIncome, month.vacancyLoss, month.creditLoss, month.commercialEffectiveGrossRevenue),
    ),
    check(
      `net-operating-income:${month.month}`,
      `${month.month} net operating income equals effective gross revenue less operating expenses`,
      month.netOperatingIncome,
      sumMoney(month.effectiveGrossRevenue, -month.operatingExpenses),
    ),
    check(
      `operating-cash-flow:${month.month}`,
      `${month.month} operating cash flow equals net operating income less capital expenditures`,
      month.operatingCashFlow,
      sumMoney(month.netOperatingIncome, -month.capitalExpenditures),
    ),
  ]);
  return [
    ...unitChecks,
    ...monthlyChecks,
    check(
      "residential-rent-total",
      "Residential rent total equals its separate rent totals",
      result.totals.totalResidentialRent,
      sumMoney(result.totals.residentialGrossRent, result.totals.nonRevenueRentAdjustment, result.totals.leaseUpLoss, result.totals.rentAdjustmentLoss, result.totals.freeRentLoss, result.totals.leaseUpConcessionLoss),
    ),
    check(
      "potential-income-total",
      "Potential income total equals residential rent plus other income",
      result.totals.totalPotentialIncome,
      sumMoney(result.totals.totalResidentialRent, result.totals.otherIncome),
    ),
    check(
      "effective-gross-revenue-total",
      `Effective gross revenue total equals potential income less vacancy and credit loss${result.commercial ? ", plus commercial effective gross revenue" : ""}`,
      result.totals.effectiveGrossRevenue,
      sumMoney(result.totals.totalPotentialIncome, result.totals.vacancyLoss, result.totals.creditLoss, result.totals.commercialEffectiveGrossRevenue),
    ),
    check(
      "net-operating-income-total",
      "Net operating income total equals effective gross revenue less operating expenses",
      result.totals.netOperatingIncome,
      sumMoney(result.totals.effectiveGrossRevenue, -result.totals.operatingExpenses),
    ),
    check(
      "operating-cash-flow-total",
      "Operating cash flow total equals net operating income less capital expenditures",
      result.totals.operatingCashFlow,
      sumMoney(result.totals.netOperatingIncome, -result.totals.capitalExpenditures),
    ),
    monthlyTotalCheck(result, "totalResidentialRent", "monthly-residential-rent-total", "Residential rent"),
    monthlyTotalCheck(result, "otherIncome", "monthly-other-income-total", "Other income"),
    monthlyTotalCheck(result, "effectiveGrossRevenue", "monthly-effective-gross-revenue-total", "Effective gross revenue"),
    monthlyTotalCheck(result, "propertyTax", "monthly-property-tax-total", "Property tax"),
    monthlyTotalCheck(result, "fullPropertyTax", "monthly-full-property-tax-total", "Full property tax"),
    monthlyTotalCheck(result, "netOperatingIncome", "monthly-net-operating-income-total", "Net operating income"),
    monthlyTotalCheck(result, "capitalExpenditures", "monthly-capital-expenditures-total", "Capital expenditures"),
    monthlyTotalCheck(result, "operatingCashFlow", "monthly-operating-cash-flow-total", "Operating cash flow"),
    ...commercialReconciliations(result, input),
  ];
}

/**
 * Checks that exist only on a case with commercial spaces: the commercial income and NOI lines
 * add up, the two uses add to the whole property, each recovery matches its basis to within the
 * monthly rounding, and the cost schedule carries each space's improvements and commission in its
 * lease start month.
 */
function commercialReconciliations(result: ApartmentOperationsResult, input: ApartmentOperationsInputs): ReconciliationCheck[] {
  const commercial = result.commercial;
  if (!commercial || !input.commercial) return [];
  const firstLease = firstLeaseStartIndex(input.commercial.spaces, input.milestones);
  const monthly = result.months.filter(({ month }) => firstLease !== null && monthIndex(month)! >= firstLease);
  const monthlyChecks = monthly.flatMap((month) => [
    check(
      `commercial-effective-gross-revenue:${month.month}`,
      `${month.month} commercial effective gross revenue equals base rent less free rent, plus recoveries, less commercial vacancy and credit loss`,
      month.commercialEffectiveGrossRevenue,
      sumMoney(month.commercialBaseRent, month.commercialFreeRent, month.commercialRecoveries, month.commercialVacancyLoss, month.commercialCreditLoss),
    ),
    check(
      `commercial-net-operating-income:${month.month}`,
      `${month.month} commercial net operating income equals commercial effective gross revenue less commercial operating expenses`,
      month.commercialNetOperatingIncome,
      sumMoney(month.commercialEffectiveGrossRevenue, -month.commercialOperatingExpenses),
    ),
    check(
      `net-operating-income-by-use:${month.month}`,
      `${month.month} net operating income equals residential plus commercial net operating income`,
      month.netOperatingIncome,
      sumMoney(month.residentialNetOperatingIncome, month.commercialNetOperatingIncome),
    ),
  ]);
  const rounding = 0.005 * result.months.length + 0.01;
  const recoveryChecks = commercial.spaces.flatMap((space) => space.recoveries.map((recovery, position) => checkWithin(
    `commercial-recovery:${space.id}:${position}`,
    `${space.name} recovery of ${recovery.basis} equals its share of the basis, within monthly rounding`,
    recovery.shareOfBasis,
    recovery.total,
    rounding,
  )));
  const costChecks = commercial.spaces.flatMap((space) => {
    const source = input.commercial!.spaces.find(({ id }) => id === space.id)!;
    const lines = [
      { id: tenantImprovementLineId(space.id), label: "tenant improvements", expected: dollars(tenantImprovementCents(source)) },
      { id: leasingCommissionLineId(space.id), label: "leasing commission", expected: space.leasingCommission },
    ];
    return lines.flatMap((line) => {
      const schedule = result.costSchedule.costLineSchedules.find(({ lineId }) => lineId === line.id);
      const leaseMonth = result.costSchedule.months.find(({ month }) => month === space.leaseStartMonth);
      return [
        check(`commercial-cost:${line.id}`, `${space.name} ${line.label} in the cost schedule equal the amount the space derives`, line.expected, schedule?.total ?? 0),
        check(`commercial-cost-month:${line.id}`, `${space.name} ${line.label} fall in the lease start month, ${space.leaseStartMonth}`, line.expected, leaseMonth?.lineAmounts[line.id] ?? 0),
      ];
    });
  });
  return [
    ...monthlyChecks,
    check(
      "commercial-effective-gross-revenue-total",
      "Commercial effective gross revenue total equals its base rent, free rent, recoveries, vacancy and credit loss totals",
      result.totals.commercialEffectiveGrossRevenue,
      sumMoney(result.totals.commercialBaseRent, result.totals.commercialFreeRent, result.totals.commercialRecoveries, result.totals.commercialVacancyLoss, result.totals.commercialCreditLoss),
    ),
    check(
      "net-operating-income-by-use-total",
      "Net operating income total equals residential plus commercial net operating income",
      result.totals.netOperatingIncome,
      sumMoney(result.totals.residentialNetOperatingIncome, result.totals.commercialNetOperatingIncome),
    ),
    check(
      "commercial-recoveries-by-space",
      "Commercial recoveries total equals the sum of every space's recoveries",
      result.totals.commercialRecoveries,
      sumMoney(...commercial.spaces.flatMap((space) => space.recoveries.map(({ total }) => total))),
    ),
    check(
      "commercial-base-rent-by-space",
      "Commercial base rent total equals the sum of every space's base rent",
      result.totals.commercialBaseRent,
      sumMoney(...commercial.spaces.map(({ baseRentTotal }) => baseRentTotal)),
    ),
    monthlyTotalCheck(result, "commercialEffectiveGrossRevenue", "monthly-commercial-effective-gross-revenue-total", "Commercial effective gross revenue"),
    monthlyTotalCheck(result, "commercialNetOperatingIncome", "monthly-commercial-net-operating-income-total", "Commercial net operating income"),
    monthlyTotalCheck(result, "residentialNetOperatingIncome", "monthly-residential-net-operating-income-total", "Residential net operating income"),
    ...recoveryChecks,
    ...costChecks,
  ];
}

function checkWithin(id: string, label: string, expected: number, actual: number, tolerance: number): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance, status: Math.abs(difference) <= tolerance + 1e-9 ? "pass" : "fail", unit: "usd" };
}

function monthlyTotalCheck(
  result: ApartmentOperationsResult,
  key: keyof ApartmentOperationsTotals,
  id: string,
  label: string,
) {
  return check(
    id,
    `${label} total equals the sum of displayed monthly rows`,
    result.totals[key],
    sumMoney(...result.months.map((month) => month[key])),
  );
}

function check(
  id: string,
  label: string,
  expected: number,
  actual: number,
  unit: ReconciliationCheck["unit"] = "usd",
): ReconciliationCheck {
  const difference = dollars(cents(actual) - cents(expected));
  return { id, label, expected, actual, difference, tolerance: 0.01, status: Math.abs(difference) <= 0.01 ? "pass" : "fail", unit };
}

function formulaTraces(input: ApartmentOperationsInputs): OperationsFormulaTrace[] {
  const capped = input.occupancyCap !== undefined;
  const traces: OperationsFormulaTrace[] = [
    { key: "monthlyLeaseUp", label: "Monthly Lease-Up", formula: "pre-leased units in the first month; each later month, last month's leased units less units turned over plus new leases, where new leases are the monthly lease pace times its calendar month's seasonal factor when factors are set, with the running total rounded to whole units, and never more than the revenue units not leased or still vacant after turnover" + (capped ? ", where with the occupancy cap on only revenue units times one less the vacancy percent can lease" : ""), inputPaths: ["operationStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth", "seasonalAbsorption", "leaseTurnover", "stabilizationRule", "residentialUnitTypes", ...(capped ? ["occupancyCap", "vacancyPercent"] : [])] },
    { key: "leaseTurnover", label: "Lease Turnover", formula: "units turned over each month: the turnover share of the leases expiring that month, with the running total rounded to whole units; each new lease expires once a lease term after signing, every lease expires at the end of every term with renewals, or the net units leased a term earlier expire, by the basis; no units turn once leased units have reached the stabilization target, and turned units stay vacant for the vacant months before they can be leased again", inputPaths: ["leaseTurnover", "operationStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth", "seasonalAbsorption", "stabilizationRule", "residentialUnitTypes"] },
    { key: "leaseUpConcessionLoss", label: "Lease-Up Concession", formula: "negative average revenue rent times the leases each month's new leases still have free, counting leases that refill turned-over units: at move-in, each lease's first months up to the months free; spread over the term, months free over the lease term for each month of the first term", inputPaths: ["leaseUpConcession", "preleasedUnits", "leaseUpUnitsPerMonth", "seasonalAbsorption", "leaseTurnover", "residentialUnitTypes"] },
    { key: "totalResidentialRent", label: "Total Residential Rent", formula: "gross residential rent, market unit types grown at the market rent rates and workforce and affordable types at the affordable rent rates (each yearly rate applies for its year after the growth start month and the last carries forward; with no growth by category every income rate is the income growth rate and the operating expense rate is the expense growth rate), plus non-revenue, lease-up, rent adjustment, free-rent, and lease-up concession losses", inputPaths: ["residentialUnitTypes", "growthStartMonth", "annualIncomeGrowthPercent", "categoryGrowth", "rentAdjustmentLossPercent", "freeRentPercent", "leaseUpConcession"] },
    { key: "otherIncome", label: "Other Income", formula: "sum of separate annual and per-occupied-unit other-income lines grown at the other income rates", inputPaths: ["otherIncomeLines", "growthStartMonth", "annualIncomeGrowthPercent", "categoryGrowth"] },
    { key: "totalPotentialIncome", label: "Total Potential Income", formula: "total residential rent plus other income", inputPaths: ["residentialUnitTypes", "otherIncomeLines", "growthStartMonth", "annualIncomeGrowthPercent", "categoryGrowth"] },
    { key: "vacancyLoss", label: "Vacancy Loss", formula: capped
      ? "zero: with the occupancy cap on, vacancy is the revenue units held back by the cap, which lease-up loss already carries, so no vacancy percent is charged on top"
      : "negative total potential income times vacancy percent", inputPaths: ["vacancyPercent", "residentialUnitTypes", "otherIncomeLines", ...(capped ? ["occupancyCap"] : [])] },
    { key: "creditLoss", label: "Credit Loss", formula: "negative total potential income times credit-loss percent", inputPaths: ["creditLossPercent", "residentialUnitTypes", "otherIncomeLines"] },
    { key: "effectiveGrossRevenue", label: "Effective Gross Revenue", formula: "total potential income plus vacancy loss and credit loss", inputPaths: ["residentialUnitTypes", "otherIncomeLines", "vacancyPercent", "creditLossPercent"] },
    { key: "operatingExpenses", label: "Operating Expenses", formula: "sum of annual and per-unit operating expense lines grown at the operating expense rates, and percent-of-revenue lines, plus scheduled property tax; each annual or per-unit line's month is its fixed share plus its variable share times leased units over revenue units, and a line with lead months runs at its fixed share for those months before operation start", inputPaths: ["operatingExpenseLines", "growthStartMonth", "annualExpenseGrowthPercent", "categoryGrowth", "propertyTax"] },
    { key: "propertyTax", label: "Property Tax", formula: "each fiscal year's tax after its exemption step, or its stated PILOT payment, spread evenly over the fiscal year's months; on the income basis, each month's revenue less the assessor's expense ratio, over the assessment cap rate, times the assessment ratio and the rate; with a lease-up cap rate, months before the first stabilized month use it, and months from the first stabilized month on use the plan's cap rate", inputPaths: ["propertyTax"] },
    { key: "fullPropertyTax", label: "Full Property Tax", formula: "the same fiscal-year tax with no exemption or PILOT payment; years after the listed schedule grow the last listed rate", inputPaths: ["propertyTax"] },
    { key: "netOperatingIncome", label: "Net Operating Income", formula: "effective gross revenue less grown operating expenses", inputPaths: ["operatingExpenseLines", "growthStartMonth", "annualExpenseGrowthPercent", "categoryGrowth"] },
    { key: "capitalExpenditures", label: "Capital Expenditures", formula: "sum of annual and per-unit capital expenditure lines grown at the operating expense rates, each month's fixed share plus its variable share times leased units over revenue units", inputPaths: ["capitalExpenditureLines", "growthStartMonth", "annualExpenseGrowthPercent", "categoryGrowth"] },
    { key: "operatingCashFlow", label: "Operating Cash Flow", formula: "net operating income less grown capital expenditures", inputPaths: ["capitalExpenditureLines", "growthStartMonth", "annualExpenseGrowthPercent", "categoryGrowth"] },
    { key: "firstStabilizedMonth", label: "First Stabilized Month", formula: "the month leased units have held at or above the target share of revenue units for the hold months, counting the first month at target; with no rule, the first month every revenue unit is leased" + (capped ? ", or with the occupancy cap on, the first month leased units reach one less the vacancy percent of revenue units" : ""), inputPaths: ["operationStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth", "seasonalAbsorption", "leaseTurnover", "stabilizationRule", "residentialUnitTypes", ...(capped ? ["occupancyCap", "vacancyPercent"] : [])] },
  ];
  if (input.commercial === undefined) return traces;
  const commercialPaths = ["commercial", "growthStartMonth", "annualIncomeGrowthPercent", "categoryGrowth"];
  const replaced = new Map<OperationsFormulaTrace["key"], Pick<OperationsFormulaTrace, "formula" | "inputPaths">>([
    ["effectiveGrossRevenue", {
      formula: "residential effective gross revenue (total potential income plus vacancy loss and credit loss) plus commercial effective gross revenue",
      inputPaths: ["residentialUnitTypes", "otherIncomeLines", "vacancyPercent", "creditLossPercent", "commercial"],
    }],
    ["operatingExpenses", {
      formula: "sum of annual and per-unit operating expense lines grown at the operating expense rates, and percent-of-revenue lines, plus scheduled property tax; an untagged line is residential, and a percent-of-revenue line reads residential effective gross revenue; a line tagged commercial is a yearly amount or a percent of commercial effective gross revenue, and starts its lead months before the first commercial lease",
      inputPaths: ["operatingExpenseLines", "growthStartMonth", "annualExpenseGrowthPercent", "categoryGrowth", "propertyTax", "commercial"],
    }],
    ["netOperatingIncome", {
      formula: "the whole property: effective gross revenue less operating expenses, which is residential net operating income plus commercial net operating income",
      inputPaths: ["operatingExpenseLines", "growthStartMonth", "annualExpenseGrowthPercent", "categoryGrowth", "commercial"],
    }],
    ["propertyTax", {
      formula: "each fiscal year's tax after its exemption step, or its stated PILOT payment, spread evenly over the fiscal year's months; on the income basis, each month's revenue less the assessor's expense ratio, over the assessment cap rate, times the assessment ratio and the rate, where revenue is residential effective gross revenue plus commercial base rent less free rent, after commercial vacancy and credit loss, and leaves out recoveries because a tax recovery would otherwise set the tax it reimburses; with a lease-up cap rate, months before the first stabilized month use it, and months from the first stabilized month on use the plan's cap rate",
      inputPaths: ["propertyTax", "commercial"],
    }],
  ]);
  return [
    ...traces.map((trace) => ({ ...trace, ...(replaced.get(trace.key) ?? {}) })),
    { key: "commercialBaseRent", label: "Commercial Base Rent", formula: "for each space from its lease start month, its area times its annual rent per square foot, grown at the commercial rent rates (each yearly rate applies for its year after the growth start month and the last carries forward; with no commercial rate the block grows at the market rent rates, and with no growth by category at the income growth rate), split into twelve months by operating month; the rent runs to the end of the model because there is no renewal or second-generation lease", inputPaths: ["commercial", ...commercialPaths.slice(1)] },
    { key: "commercialFreeRent", label: "Commercial Free Rent", formula: "negative base rent for each space's first free-rent months from its lease start; free rent forgives base rent only, and recoveries start at the lease start month", inputPaths: ["commercial"] },
    { key: "commercialRecoveries", label: "Commercial Recoveries", formula: "for each space and recovery, its share of the basis each month from the lease start month: the named operating expense lines, or the scheduled property tax the property pays; a stated share, or the space's area over residential unit area plus commercial area", inputPaths: ["commercial", "operatingExpenseLines", "propertyTax", "residentialUnitTypes"] },
    { key: "commercialVacancyLoss", label: "Commercial Vacancy Loss", formula: "negative commercial vacancy percent of commercial income, which is base rent less free rent plus recoveries; residential vacancy never applies to it", inputPaths: ["commercial.vacancyPercent", "commercial.spaces"] },
    { key: "commercialCreditLoss", label: "Commercial Credit Loss", formula: "negative commercial credit-loss percent of commercial income, which is base rent less free rent plus recoveries", inputPaths: ["commercial.creditLossPercent", "commercial.spaces"] },
    { key: "commercialEffectiveGrossRevenue", label: "Commercial Effective Gross Revenue", formula: "commercial base rent plus free rent, plus recoveries, plus commercial vacancy loss and credit loss", inputPaths: ["commercial"] },
    { key: "commercialOperatingExpenses", label: "Commercial Operating Expenses", formula: "operating expense lines tagged commercial, plus the share of each untagged expense line and of the property tax that tenants reimburse, moved from residential to commercial so a fully recovered shared cost nets to zero for the space", inputPaths: ["operatingExpenseLines", "commercial", "propertyTax"] },
    { key: "commercialNetOperatingIncome", label: "Commercial Net Operating Income", formula: "commercial effective gross revenue less commercial operating expenses", inputPaths: ["commercial", "operatingExpenseLines"] },
    { key: "residentialNetOperatingIncome", label: "Residential Net Operating Income", formula: "residential effective gross revenue less the operating expenses the residential use carries: untagged lines and property tax, less the share tenants reimburse", inputPaths: ["residentialUnitTypes", "otherIncomeLines", "operatingExpenseLines", "commercial"] },
    { key: "commercialTenantImprovements", label: "Commercial Tenant Improvements", formula: "for each space, its area times its tenant improvement per square foot, a hard cost line in the lease start month; the cost schedule funds it as a project cost, so it counts in total cost and loan to cost", inputPaths: ["commercial.spaces"] },
    { key: "commercialLeasingCommissions", label: "Commercial Leasing Commissions", formula: "for each space, its commission percent times the base rent its lease schedules over the lease term from the lease start month, before free rent and grown at the commercial rent rates, a soft cost line in the lease start month", inputPaths: ["commercial.spaces", ...commercialPaths.slice(1)] },
    { key: "commercialRecoveryShare", label: "Commercial Recovery Share", formula: "the share a recovery states, or the space's area divided by residential unit area plus commercial area; shares of one basis across spaces cannot pass 100 percent", inputPaths: ["commercial.spaces", "residentialUnitTypes"] },
  ];
}

function resultNumbersAreSafe(result: ApartmentOperationsResult) {
  return Object.values(result.unitSummary).every((value) => Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100)))
    && result.months.every((month) => Object.values(month).every((value) =>
    typeof value !== "number" || (Number.isFinite(value) && Number.isSafeInteger(Math.round(value * 100))),
  ));
}

function monthIndex(value: string) {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + month - 1;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function sumMoney(...amounts: number[]) {
  return dollars(amounts.reduce((sum, amount) => sum + cents(amount), 0));
}

function cents(amount: number) {
  return Math.round(amount * 100);
}

function dollars(value: number) {
  return value / 100;
}

function labelFor(path: string) {
  return path.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase()).replace(/\.\d+\./g, " ");
}

function addIssue(issues: ApartmentOperationsIssue[], path: string, code: ApartmentOperationsIssueCode, message: string) {
  issues.push({ path, code, message });
}

function failed(inputSnapshot: ApartmentOperationsInputs, issues: ApartmentOperationsIssue[]): ApartmentOperationsRun {
  return {
    formulaVersion: APARTMENT_OPERATIONS_FORMULA_VERSION,
    inputSnapshot,
    status: "failed",
    issues,
    result: null,
    reconciliations: [],
  };
}
