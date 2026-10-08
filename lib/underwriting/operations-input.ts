import {
  GROWTH_CATEGORIES,
  PROPERTY_TAX_ASSUMPTION_KEYS,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type ApartmentOperationsIssue,
  type MonthlyCostScheduleInputs,
} from "@kulka/engine";
import { saveMessage } from "./save-message";

export type ApartmentOperationsDraft = Omit<ApartmentOperationsInputs,
  "analysisStartMonth" | "saleMonth" | "costLines">;

export class InvalidApartmentOperations extends Error {
  constructor(
    message: string,
    readonly issues: ApartmentOperationsIssue[],
    readonly fieldErrors: Record<string, string>,
  ) {
    super(message);
  }
}

function knownEvidenceFields(item: Record<string, unknown>) {
  const { sourceLabel, sourceDate, reviewState } = item;
  return { sourceLabel, sourceDate, reviewState };
}

/** Keeps only the fields an optional block defines, so stray keys never reach the stored case. */
function knownLeaseUpFields(value: unknown, fields: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const block = value as Record<string, unknown>;
  return { ...Object.fromEntries(fields.map((key) => [key, block[key]])), ...knownEvidenceFields(block) };
}

function knownPropertyTaxFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const plan = value as Record<string, unknown>;
  const optional = (key: string) => plan[key] === undefined ? {} : { [key]: plan[key] };
  const evidence = plan.taxEvidence;
  return {
    taxInputVersion: plan.taxInputVersion,
    mode: plan.mode,
    assessmentBasis: plan.assessmentBasis,
    firstFiscalYearStartMonth: plan.firstFiscalYearStartMonth,
    ...optional("landAssessedValue"),
    ...optional("improvementAssessedValue"),
    ...optional("assessorExpenseRatioPercent"),
    ...optional("assessmentCapRatePercent"),
    ...optional("leaseUpAssessmentCapRatePercent"),
    ...optional("assessmentRatioPercent"),
    rateUnit: plan.rateUnit,
    fiscalYears: Array.isArray(plan.fiscalYears)
      ? plan.fiscalYears.map((year) => {
        if (!year || typeof year !== "object" || Array.isArray(year)) return year;
        const { rate, exemptionPercent, statedPayment } = year as Record<string, unknown>;
        return { rate, exemptionPercent, ...(statedPayment === undefined ? {} : { statedPayment }) };
      })
      : plan.fiscalYears,
    annualRateGrowthPercent: plan.annualRateGrowthPercent,
    taxEvidence: evidence && typeof evidence === "object" && !Array.isArray(evidence)
      ? Object.fromEntries(PROPERTY_TAX_ASSUMPTION_KEYS.map((key) => {
        const item = (evidence as Record<string, unknown>)[key];
        if (!item || typeof item !== "object" || Array.isArray(item)) return [key, item];
        const { sourceLabel, sourceDate, reviewState } = item as Record<string, unknown>;
        return [key, { sourceLabel, sourceDate, reviewState }];
      }))
      : evidence,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function knownRecoveryFields(value: unknown) {
  if (!isPlainObject(value)) return value;
  const basis = value.basis;
  return {
    basis: isPlainObject(basis)
      ? { kind: basis.kind, ...(basis.lineIds === undefined ? {} : { lineIds: basis.lineIds }) }
      : basis,
    ...(value.sharePercent === undefined || value.sharePercent === null ? {} : { sharePercent: value.sharePercent }),
  };
}

function knownSpaceFields(value: unknown) {
  if (!isPlainObject(value)) return value;
  const optional = (key: string) => value[key] === undefined || value[key] === null ? {} : { [key]: value[key] };
  return {
    id: value.id,
    name: value.name,
    areaSf: value.areaSf,
    annualRentPerSf: value.annualRentPerSf,
    ...optional("leaseStartMonth"),
    ...optional("leaseStartAnchor"),
    freeRentMonths: value.freeRentMonths,
    recoveries: Array.isArray(value.recoveries) ? value.recoveries.map(knownRecoveryFields) : value.recoveries,
    tenantImprovementPerSf: value.tenantImprovementPerSf,
    leasingCommissionPercent: value.leasingCommissionPercent,
    leaseTermMonths: value.leaseTermMonths,
    ...knownEvidenceFields(value),
  };
}

/** Keeps only the fields the commercial block defines, so stray keys never reach the stored case. */
function knownCommercialFields(value: unknown) {
  if (!isPlainObject(value)) return value;
  return {
    spaces: Array.isArray(value.spaces) ? value.spaces.map(knownSpaceFields) : value.spaces,
    vacancyPercent: value.vacancyPercent,
    creditLossPercent: value.creditLossPercent,
    ...knownEvidenceFields(value),
  };
}

export function parseApartmentOperations(
  body: unknown,
  costSchedule: MonthlyCostScheduleInputs,
): ApartmentOperationsDraft {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidApartmentOperations("Send an apartment operations object.", [], {});
  }
  const candidate = body as Record<string, unknown>;
  const checked = computeApartmentOperations({
    ...costSchedule,
    inputVersion: candidate.inputVersion,
    operationStartMonth: candidate.operationStartMonth,
    ...(candidate.operationStartAnchor === null || candidate.operationStartAnchor === undefined ? {} : { operationStartAnchor: candidate.operationStartAnchor }),
    growthStartMonth: candidate.growthStartMonth,
    ...(candidate.growthStartAnchor === null || candidate.growthStartAnchor === undefined ? {} : { growthStartAnchor: candidate.growthStartAnchor }),
    preleasedUnits: candidate.preleasedUnits,
    leaseUpUnitsPerMonth: candidate.leaseUpUnitsPerMonth,
    annualIncomeGrowthPercent: candidate.annualIncomeGrowthPercent,
    annualExpenseGrowthPercent: candidate.annualExpenseGrowthPercent,
    rentAdjustmentLossPercent: candidate.rentAdjustmentLossPercent,
    freeRentPercent: candidate.freeRentPercent,
    vacancyPercent: candidate.vacancyPercent,
    creditLossPercent: candidate.creditLossPercent,
    assumptionEvidence: candidate.assumptionEvidence,
    residentialUnitTypes: candidate.residentialUnitTypes,
    otherIncomeLines: candidate.otherIncomeLines,
    operatingExpenseLines: candidate.operatingExpenseLines,
    capitalExpenditureLines: candidate.capitalExpenditureLines,
    ...(candidate.propertyTax === undefined ? {} : { propertyTax: knownPropertyTaxFields(candidate.propertyTax) }),
    ...(candidate.leaseUpConcession === undefined ? {} : {
      leaseUpConcession: knownLeaseUpFields(candidate.leaseUpConcession, ["monthsFree", "leaseTermMonths", "timing"]),
    }),
    ...(candidate.seasonalAbsorption === undefined ? {} : {
      seasonalAbsorption: knownLeaseUpFields(candidate.seasonalAbsorption, ["monthlyFactors"]),
    }),
    ...(candidate.occupancyCap === undefined || candidate.occupancyCap === null ? {} : {
      occupancyCap: knownLeaseUpFields(candidate.occupancyCap, []),
    }),
    ...(candidate.stabilizationRule === undefined ? {} : {
      stabilizationRule: knownLeaseUpFields(candidate.stabilizationRule, ["targetOccupancyPercent", "holdMonths"]),
    }),
    ...(candidate.leaseTurnover === undefined ? {} : {
      leaseTurnover: knownLeaseUpFields(candidate.leaseTurnover, ["turnoverPercent", "leaseTermMonths", "vacantMonths", "basis"]),
    }),
    ...(candidate.categoryGrowth === undefined ? {} : {
      categoryGrowth: knownLeaseUpFields(candidate.categoryGrowth, [...GROWTH_CATEGORIES]),
    }),
    ...(candidate.commercial === undefined || candidate.commercial === null ? {} : {
      commercial: knownCommercialFields(candidate.commercial),
    }),
  } as ApartmentOperationsInputs);
  if (checked.status === "failed") {
    const issues = checked.issues.filter((item) => !item.path.startsWith("costLines")
      && !item.path.startsWith("milestones") && item.path !== "saleAnchor"
      && item.path !== "analysisStartMonth" && item.path !== "saleMonth");
    throw new InvalidApartmentOperations(
      saveMessage("Review the apartment operations fields.", issues),
      issues,
      Object.fromEntries(issues.map((item) => [item.path, item.message])),
    );
  }
  return {
    inputVersion: checked.inputSnapshot.inputVersion,
    operationStartMonth: checked.inputSnapshot.operationStartMonth,
    ...(checked.inputSnapshot.operationStartAnchor ? { operationStartAnchor: checked.inputSnapshot.operationStartAnchor } : {}),
    growthStartMonth: checked.inputSnapshot.growthStartMonth,
    ...(checked.inputSnapshot.growthStartAnchor ? { growthStartAnchor: checked.inputSnapshot.growthStartAnchor } : {}),
    preleasedUnits: checked.inputSnapshot.preleasedUnits,
    leaseUpUnitsPerMonth: checked.inputSnapshot.leaseUpUnitsPerMonth,
    annualIncomeGrowthPercent: checked.inputSnapshot.annualIncomeGrowthPercent,
    annualExpenseGrowthPercent: checked.inputSnapshot.annualExpenseGrowthPercent,
    rentAdjustmentLossPercent: checked.inputSnapshot.rentAdjustmentLossPercent,
    freeRentPercent: checked.inputSnapshot.freeRentPercent,
    vacancyPercent: checked.inputSnapshot.vacancyPercent,
    creditLossPercent: checked.inputSnapshot.creditLossPercent,
    assumptionEvidence: checked.inputSnapshot.assumptionEvidence,
    residentialUnitTypes: checked.inputSnapshot.residentialUnitTypes,
    otherIncomeLines: checked.inputSnapshot.otherIncomeLines,
    operatingExpenseLines: checked.inputSnapshot.operatingExpenseLines,
    capitalExpenditureLines: checked.inputSnapshot.capitalExpenditureLines,
    ...(checked.inputSnapshot.propertyTax ? { propertyTax: checked.inputSnapshot.propertyTax } : {}),
    ...(checked.inputSnapshot.leaseUpConcession ? { leaseUpConcession: checked.inputSnapshot.leaseUpConcession } : {}),
    ...(checked.inputSnapshot.seasonalAbsorption ? { seasonalAbsorption: checked.inputSnapshot.seasonalAbsorption } : {}),
    ...(checked.inputSnapshot.occupancyCap ? { occupancyCap: checked.inputSnapshot.occupancyCap } : {}),
    ...(checked.inputSnapshot.stabilizationRule ? { stabilizationRule: checked.inputSnapshot.stabilizationRule } : {}),
    ...(checked.inputSnapshot.leaseTurnover ? { leaseTurnover: checked.inputSnapshot.leaseTurnover } : {}),
    ...(checked.inputSnapshot.categoryGrowth ? { categoryGrowth: checked.inputSnapshot.categoryGrowth } : {}),
    ...(checked.inputSnapshot.commercial ? { commercial: checked.inputSnapshot.commercial } : {}),
  };
}
