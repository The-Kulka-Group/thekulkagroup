import {
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type MonthlyCostLine,
  type ResidentialUnitType,
} from "@kulka/engine";

import type { AssumptionName, UnderwritingCase } from "@/lib/underwriting/cases";

/** The source the intake screen applied to every value it saved. New lines in any section default to it. */
export type CommonSource = { sourceLabel?: string; sourceDate?: string };

export type SeededEvidence = CommonSource & { reviewState: "working" };

/**
 * What the intake screen supplies to each detailed section. A section reads this only while it has
 * never been saved; after the first save the section owns its values and intake no longer feeds it.
 */
export type IntakeSeed = {
  costLines: MonthlyCostLine[];
  residentialUnitTypes: ResidentialUnitType[];
  vacancyPercent?: { value: number; evidence: SeededEvidence };
  targetDebtSharePercent?: { value: number; evidence: SeededEvidence };
  annualInterestRatePercent?: { value: number; evidence: SeededEvidence };
  terminalCapRatePercent?: { value: number; evidence: SeededEvidence };
};

type IntakeCase = Pick<UnderwritingCase,
  "assumptions" | "factMetadata" | "proposedUnits" | "averageUnitSquareFeet">;

export const INTAKE_LINE_IDS = {
  land: "intake-land",
  hardCost: "intake-hard-cost",
  softCost: "intake-soft-cost",
  unitType: "intake-unit-type",
} as const;

/** Intake values each section takes over. The Financial Assumptions table hides a value once its section is saved. */
export const SECTION_OWNED_ASSUMPTIONS: Record<
  "costSchedule" | "apartmentOperations" | "developmentCapital" | "propertyReturns",
  AssumptionName[]
> = {
  costSchedule: ["purchasePrice", "hardCostPerGrossSquareFoot", "softCostPercent", "constructionMonths"],
  apartmentOperations: ["monthlyRent", "vacancyPercent"],
  developmentCapital: ["debtPercent", "interestRatePercent"],
  propertyReturns: ["exitCapRatePercent"],
};

export function ownedAssumptions(savedCase: Pick<UnderwritingCase,
  "costSchedule" | "apartmentOperations" | "developmentCapital" | "propertyReturns">) {
  return new Set((Object.keys(SECTION_OWNED_ASSUMPTIONS) as Array<keyof typeof SECTION_OWNED_ASSUMPTIONS>)
    .flatMap((section) => savedCase[section] ? SECTION_OWNED_ASSUMPTIONS[section] : []));
}

/**
 * Intake copies its one source onto every value, so the common source is the source all sourced values share.
 * Values typed later with a different source mean there is no common source left to default to.
 */
export function commonSource(savedCase: Pick<UnderwritingCase, "assumptions" | "factMetadata">): CommonSource {
  const sources = [
    ...(savedCase.assumptions ?? []),
    ...Object.values(savedCase.factMetadata ?? {}),
  ].filter((item) => item?.sourceLabel || item?.sourceDate);
  const first = sources[0];
  if (!first || sources.some((item) => item?.sourceLabel !== first.sourceLabel || item?.sourceDate !== first.sourceDate)) {
    return {};
  }
  return {
    ...(first.sourceLabel ? { sourceLabel: first.sourceLabel } : {}),
    ...(first.sourceDate ? { sourceDate: first.sourceDate } : {}),
  };
}

/** One evidence row per key, each starting as a working row with the common source. */
export function blankEvidenceRows<K extends string>(keys: readonly K[], source: CommonSource) {
  return Object.fromEntries(keys.map((key) => [key, { ...source, reviewState: "working" as const }])) as Record<K, SeededEvidence>;
}

/** Adds months to a YYYY-MM month. Returns "" for a blank or malformed month. */
export function addMonths(month: string, count: number) {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return "";
  const index = Number(match[1]) * 12 + Number(match[2]) - 1 + count;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/**
 * Months for the seeded cost lines. Land closes in the analysis start month. Hard and soft cost start the month
 * after and run for the intake construction duration. Without a start month or a duration the months stay blank.
 */
export function seededCostLineMonths(id: string, analysisStartMonth: string, constructionMonths?: number) {
  if (!analysisStartMonth || !addMonths(analysisStartMonth, 0)) return { startMonth: "", endMonth: "" };
  if (id === INTAKE_LINE_IDS.land) return { startMonth: analysisStartMonth, endMonth: analysisStartMonth };
  if (!constructionMonths) return { startMonth: "", endMonth: "" };
  const startMonth = addMonths(analysisStartMonth, 1);
  return { startMonth, endMonth: addMonths(startMonth, constructionMonths - 1) };
}

/** Editing any of these on a seeded line means the user set its timing or nature, so it stops following the analysis start. */
const DETACHING_FIELDS = ["startMonth", "endMonth", "startAnchor", "endAnchor", "category", "basis"] as const;

export function detachesFromAnalysisStart(update: Partial<MonthlyCostLine>) {
  return DETACHING_FIELDS.some((field) => field in update);
}

/** Moves only the seeded lines still in `following` to the months a new analysis start gives them. */
export function followAnalysisStart<T extends MonthlyCostLine>(
  lines: T[],
  following: ReadonlySet<string>,
  analysisStartMonth: string,
  constructionMonths?: number,
): T[] {
  return lines.map((line) => following.has(line.id)
    ? { ...line, ...seededCostLineMonths(line.id, analysisStartMonth, constructionMonths) }
    : line);
}

export function seedFromIntake(savedCase: IntakeCase, analysisStartMonth = ""): IntakeSeed {
  const byName = new Map((savedCase.assumptions ?? []).map((assumption) => [assumption.name, assumption]));
  const value = (name: AssumptionName) => byName.get(name)?.value;
  const evidence = (name: AssumptionName): SeededEvidence => {
    const assumption = byName.get(name);
    return {
      ...(assumption?.sourceLabel ? { sourceLabel: assumption.sourceLabel } : {}),
      ...(assumption?.sourceDate ? { sourceDate: assumption.sourceDate } : {}),
      reviewState: "working",
    };
  };
  const seeded = (name: AssumptionName) => {
    const found = value(name);
    return found === undefined ? undefined : { value: found, evidence: evidence(name) };
  };
  const constructionMonths = value("constructionMonths");
  const line = (id: string, name: string, category: MonthlyCostLine["category"], from: AssumptionName) => ({
    id,
    name,
    category,
    unit: "usd" as const,
    ...seededCostLineMonths(id, analysisStartMonth, constructionMonths),
    distributionMethod: "straight_line" as const,
    distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
    ...evidence(from),
  });

  const costLines: MonthlyCostLine[] = [];
  const purchasePrice = value("purchasePrice");
  if (purchasePrice !== undefined && purchasePrice > 0) {
    costLines.push({ ...line(INTAKE_LINE_IDS.land, "Land Purchase", "land", "purchasePrice"), amount: purchasePrice });
  }
  const hardCost = value("hardCostPerGrossSquareFoot");
  if (hardCost !== undefined) {
    // Priced per gross SF so the case's Gross Building Area stays the one place that area is entered.
    costLines.push({
      ...line(INTAKE_LINE_IDS.hardCost, "Hard Cost", "hard_cost", "hardCostPerGrossSquareFoot"),
      basis: { type: "per_gross_square_foot", rate: hardCost },
    });
    const softCost = value("softCostPercent");
    if (softCost !== undefined) {
      costLines.push({
        ...line(INTAKE_LINE_IDS.softCost, "Soft Cost", "soft_cost", "softCostPercent"),
        basis: { type: "percent_of_line", baseLineId: INTAKE_LINE_IDS.hardCost, percent: softCost },
      });
    }
  }

  const rent = value("monthlyRent");
  const residentialUnitTypes: ResidentialUnitType[] = savedCase.proposedUnits !== undefined || rent !== undefined ? [{
    id: INTAKE_LINE_IDS.unitType,
    name: "Average Unit",
    units: savedCase.proposedUnits ?? 0,
    nonRevenueUnits: 0,
    averageAreaSf: savedCase.averageUnitSquareFeet ?? 0,
    monthlyMarketRent: rent ?? 0,
    affordabilityTier: "market",
    ...(rent !== undefined ? evidence("monthlyRent") : unitFactEvidence(savedCase)),
  }] : [];

  return {
    costLines,
    residentialUnitTypes,
    ...optional("vacancyPercent", seeded("vacancyPercent")),
    ...optional("targetDebtSharePercent", seeded("debtPercent")),
    ...optional("annualInterestRatePercent", seeded("interestRatePercent")),
    ...optional("terminalCapRatePercent", seeded("exitCapRatePercent")),
  };
}

function unitFactEvidence(savedCase: IntakeCase): SeededEvidence {
  const metadata = savedCase.factMetadata?.proposedUnits;
  return {
    ...(metadata?.sourceLabel ? { sourceLabel: metadata.sourceLabel } : {}),
    ...(metadata?.sourceDate ? { sourceDate: metadata.sourceDate } : {}),
    reviewState: "working",
  };
}

function optional<K extends string, V>(key: K, item: V | undefined) {
  return (item === undefined ? {} : { [key]: item }) as Partial<Record<K, V>>;
}
