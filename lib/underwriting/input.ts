import {
  ASSUMPTION_DEFINITIONS,
  type AssumptionName,
  type CaseDraft,
} from "@/lib/underwriting/cases";

export class InvalidCaseDraft extends Error {}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new InvalidCaseDraft(`${label} is required.`);
  }
  if (value.trim().length > 200) throw new InvalidCaseDraft(`${label} is too long.`);
  return value.trim();
}

function optionalPositive(value: unknown, label: string, integer = false) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new InvalidCaseDraft(`${label} must be greater than zero.`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new InvalidCaseDraft(`${label} must be a whole number.`);
  }
  return value;
}

export function parseCaseDraft(body: unknown): CaseDraft {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidCaseDraft("Send a case object.");
  }
  const candidate = body as Record<string, unknown>;
  const supplied = candidate.assumptions;
  if (supplied !== undefined && (!supplied || typeof supplied !== "object" || Array.isArray(supplied))) {
    throw new InvalidCaseDraft("Assumptions must be an object.");
  }

  const assumptions: CaseDraft["assumptions"] = {};
  for (const name of Object.keys(ASSUMPTION_DEFINITIONS) as AssumptionName[]) {
    const value = optionalPositive(
      (supplied as Record<string, unknown> | undefined)?.[name],
      ASSUMPTION_DEFINITIONS[name].label,
      name === "constructionMonths" || name === "holdYears",
    );
    if (value !== undefined) assumptions[name] = value;
  }
  for (const name of ["debtPercent", "interestRatePercent", "exitCapRatePercent"] as const) {
    if (assumptions[name] !== undefined && assumptions[name]! > 100) {
      throw new InvalidCaseDraft(`${ASSUMPTION_DEFINITIONS[name].label} cannot exceed 100 percent.`);
    }
  }

  return {
    name: requiredText(candidate.name, "Case name"),
    address: requiredText(candidate.address, "Property address"),
    proposedUnits: optionalPositive(candidate.proposedUnits, "Proposed units", true),
    averageUnitSquareFeet: optionalPositive(candidate.averageUnitSquareFeet, "Average unit size"),
    grossBuildingSquareFeet: optionalPositive(candidate.grossBuildingSquareFeet, "Gross building area"),
    assumptions,
  };
}
