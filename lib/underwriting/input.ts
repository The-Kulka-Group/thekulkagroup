import {
  ASSUMPTION_DEFINITIONS,
  FACT_DEFINITIONS,
  type AssumptionName,
  type AssumptionMetadata,
  type CaseDraft,
  type EvidenceMetadata,
  type FactName,
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

function optionalSourceLabel(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || value.trim().length === 0) return undefined;
  if (value.trim().length > 200) {
    const message = "Source label is too long.";
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  return value.trim();
}

function optionalSourceDate(value: unknown, field: string) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "string" ? new Date(`${value}T00:00:00.000Z`) : null;
  if (
    typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || !parsed
    || Number.isNaN(parsed.getTime())
    || parsed.toISOString().slice(0, 10) !== value
  ) {
    const message = "Source date must be a valid date.";
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  return value;
}

function sourceMetadata(value: unknown, field: string): EvidenceMetadata | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    const message = "Source details must be an object.";
    throw new InvalidCaseDraft(message, { [field]: message });
  }
  const candidate = value as Record<string, unknown>;
  const sourceLabel = optionalSourceLabel(candidate.sourceLabel, `${field}.sourceLabel`);
  const sourceDate = optionalSourceDate(candidate.sourceDate, `${field}.sourceDate`);
  const reviewState = candidate.reviewState ?? "working";
  if (reviewState !== "working" && reviewState !== "done") {
    const message = "Review state must be Working on It or Done.";
    throw new InvalidCaseDraft(message, { [`${field}.reviewState`]: message });
  }
  return { sourceLabel, sourceDate, reviewState };
}

export function parseCaseDraft(body: unknown): CaseDraft {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidCaseDraft("Send a project object.");
  }
  const candidate = body as Record<string, unknown>;
  const supplied = candidate.assumptions;
  if (supplied !== undefined && (!supplied || typeof supplied !== "object" || Array.isArray(supplied))) {
    throw new InvalidCaseDraft("Assumptions must be an object.");
  }

  const assumptions: CaseDraft["assumptions"] = {};
  const assumptionMetadata: NonNullable<CaseDraft["assumptionMetadata"]> = {};
  const factMetadata: NonNullable<CaseDraft["factMetadata"]> = {};
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
          "debtPercent",
          "interestRatePercent",
        ].includes(name),
      },
    );
    if (value !== undefined) {
      assumptions[name] = value;
      const metadata = sourceMetadata(
        (suppliedMetadata as Record<string, unknown> | undefined)?.[name],
        `assumptionMetadata.${name}`,
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

  if (
    assumptions.debtPercent !== undefined
    && assumptions.debtPercent > 0
    && !(assumptions.interestRatePercent !== undefined && assumptions.interestRatePercent > 0)
  ) {
    const message = "Interest rate must be greater than zero when debt is greater than zero.";
    throw new InvalidCaseDraft(message, { "assumptions.interestRatePercent": message });
  }

  const facts = {
    proposedUnits: optionalNumber(candidate.proposedUnits, "Proposed units", "proposedUnits", { integer: true }),
    averageUnitSquareFeet: optionalNumber(candidate.averageUnitSquareFeet, "Average unit size", "averageUnitSquareFeet"),
    grossBuildingSquareFeet: optionalNumber(candidate.grossBuildingSquareFeet, "Gross building area", "grossBuildingSquareFeet"),
  };
  const suppliedFactMetadata = candidate.factMetadata;
  if (
    suppliedFactMetadata !== undefined
    && (!suppliedFactMetadata || typeof suppliedFactMetadata !== "object" || Array.isArray(suppliedFactMetadata))
  ) {
    throw new InvalidCaseDraft("Project fact source details must be an object.");
  }
  const commonSourceLabel = optionalSourceLabel(candidate.commonSourceLabel, "commonSourceLabel");
  const commonSourceDate = optionalSourceDate(candidate.commonSourceDate, "commonSourceDate");
  const commonMetadata: EvidenceMetadata | undefined = commonSourceLabel || commonSourceDate
    ? { sourceLabel: commonSourceLabel, sourceDate: commonSourceDate, reviewState: "working" }
    : undefined;
  for (const name of Object.keys(FACT_DEFINITIONS) as FactName[]) {
    if (facts[name] === undefined) continue;
    const metadata = sourceMetadata(
      (suppliedFactMetadata as Record<string, unknown> | undefined)?.[name],
      `factMetadata.${name}`,
    ) ?? commonMetadata;
    if (metadata) factMetadata[name] = metadata;
  }
  if (commonMetadata) {
    for (const name of Object.keys(assumptions) as AssumptionName[]) {
      if (!assumptionMetadata[name]) assumptionMetadata[name] = commonMetadata as AssumptionMetadata;
    }
  }

  return {
    name: requiredText(candidate.name, "Project name", "name"),
    address: requiredText(candidate.address, "Property address", "address"),
    ...facts,
    assumptions,
    ...(Object.keys(assumptionMetadata).length > 0 ? { assumptionMetadata } : {}),
    ...(Object.keys(factMetadata).length > 0 ? { factMetadata } : {}),
  };
}
