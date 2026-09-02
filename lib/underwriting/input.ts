import {
  ASSUMPTION_DEFINITIONS,
  type AssumptionName,
  type AssumptionMetadata,
  type CaseDraft,
} from "@/lib/underwriting/cases";

export class InvalidCaseDraft extends Error {
  constructor(message: string, readonly fieldErrors: Record<string, string> = {}) {
    super(message);
  }
}

function requiredText(value: unknown, label: string, field: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    const message = `${label} is required.`;
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  if (value.trim().length > 200) {
    const message = `${label} is too long.`;
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  return value.trim();
}

function optionalNumber(
  value: unknown,
  label: string,
  field: string,
  { integer = false, allowZero = false }: { integer?: boolean; allowZero?: boolean } = {},
) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    const message = allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`;
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  if (integer && !Number.isInteger(value)) {
    const message = `${label} must be a whole number.`;
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  return value;
}

function sourceMetadata(value: unknown, name: AssumptionName): AssumptionMetadata | undefined {
  if (value === undefined) return undefined;
  const field = `assumptionMetadata.${name}`;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const message = "Source details must be an object.";
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  const candidate = value as Record<string, unknown>;
  const sourceLabel = requiredText(candidate.sourceLabel, "Source label", `${field}.sourceLabel`);
  const sourceDate = candidate.sourceDate;
  const parsedSourceDate = typeof sourceDate === "string"
    ? new Date(`${sourceDate}T00:00:00.000Z`)
    : null;
  if (
    typeof sourceDate !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)
    || !parsedSourceDate
    || Number.isNaN(parsedSourceDate.getTime())
    || parsedSourceDate.toISOString().slice(0, 10) !== sourceDate
  ) {
    const message = "Source date is required.";
    throw new InvalidCaseDraft(message, { [`${field}.sourceDate`]: message });
  }
  if (candidate.reviewState !== "working" && candidate.reviewState !== "done") {
    const message = "Review state must be Working on it or Done.";
    throw new InvalidCaseDraft(message, { [`${field}.reviewState`]: message });
  }
  return { sourceLabel, sourceDate, reviewState: candidate.reviewState };
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
  const assumptionMetadata: NonNullable<CaseDraft["assumptionMetadata"]> = {};
  const suppliedMetadata = candidate.assumptionMetadata;
  if (
    suppliedMetadata !== undefined
    && (!suppliedMetadata || typeof suppliedMetadata !== "object" || Array.isArray(suppliedMetadata))
  ) {
    throw new InvalidCaseDraft("Assumption source details must be an object.");
  }
  for (const name of Object.keys(ASSUMPTION_DEFINITIONS) as AssumptionName[]) {
    const value = optionalNumber(
      (supplied as Record<string, unknown> | undefined)?.[name],
      ASSUMPTION_DEFINITIONS[name].label,
      `assumptions.${name}`,
      {
        integer: name === "constructionMonths" || name === "holdYears",
        allowZero: name === "purchasePrice" || [
          "softCostPercent",
          "contingencyPercent",
          "vacancyPercent",
          "operatingExpensePercent",
        ].includes(name),
      },
    );
    if (value !== undefined) {
      assumptions[name] = value;
      const metadata = sourceMetadata(
        (suppliedMetadata as Record<string, unknown> | undefined)?.[name],
        name,
      );
      if (metadata) assumptionMetadata[name] = metadata;
    }
  }
  for (const name of [
    "softCostPercent",
    "contingencyPercent",
    "vacancyPercent",
    "operatingExpensePercent",
    "debtPercent",
    "interestRatePercent",
    "exitCapRatePercent",
  ] as const) {
    if (assumptions[name] !== undefined && assumptions[name]! > 100) {
      const message = `${ASSUMPTION_DEFINITIONS[name].label} cannot exceed 100 percent.`;
      throw new InvalidCaseDraft(message, { [`assumptions.${name}`]: message });
    }
  }

  return {
    name: requiredText(candidate.name, "Case name", "name"),
    address: requiredText(candidate.address, "Property address", "address"),
    proposedUnits: optionalNumber(candidate.proposedUnits, "Proposed units", "proposedUnits", { integer: true }),
    averageUnitSquareFeet: optionalNumber(candidate.averageUnitSquareFeet, "Average unit size", "averageUnitSquareFeet"),
    grossBuildingSquareFeet: optionalNumber(candidate.grossBuildingSquareFeet, "Gross building area", "grossBuildingSquareFeet"),
    assumptions,
    ...(Object.keys(assumptionMetadata).length > 0 ? { assumptionMetadata } : {}),
  };
}
