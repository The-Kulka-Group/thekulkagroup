import {
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
  };
}
