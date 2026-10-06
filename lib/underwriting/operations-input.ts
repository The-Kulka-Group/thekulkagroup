import {
  PROPERTY_TAX_ASSUMPTION_KEYS,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type ApartmentOperationsIssue,
  type MonthlyCostScheduleInputs,
} from "@kulka/engine";

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
    growthStartMonth: candidate.growthStartMonth,
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
  } as ApartmentOperationsInputs);
  if (checked.status === "failed") {
    const issues = checked.issues.filter((item) => !item.path.startsWith("costLines")
      && item.path !== "analysisStartMonth" && item.path !== "saleMonth");
    throw new InvalidApartmentOperations(
      "Review the apartment operations fields.",
      issues,
      Object.fromEntries(issues.map((item) => [item.path, item.message])),
    );
  }
  return {
    inputVersion: checked.inputSnapshot.inputVersion,
    operationStartMonth: checked.inputSnapshot.operationStartMonth,
    growthStartMonth: checked.inputSnapshot.growthStartMonth,
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
  };
}
