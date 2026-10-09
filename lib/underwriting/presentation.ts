import {
  APARTMENT_OPERATIONS_ASSUMPTION_KEYS,
  DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS,
  PROPERTY_RETURNS_ASSUMPTION_KEYS,
  PROPERTY_RETURNS_COMMERCIAL_CAP_KEY,
  type UnderwritingInputKey,
} from "@kulka/engine";

import type { UnderwritingCase } from "@/lib/underwriting/cases";
import type { SavedUnderwritingRun } from "@/lib/underwriting/runs";

export const UNDERWRITING_INPUT_LABELS: Record<UnderwritingInputKey, string> = {
  grossBuildingSquareFeet: "Gross building area",
  proposedUnits: "Proposed units",
  purchasePrice: "Purchase price",
  monthlyRent: "Average monthly rent",
  hardCostPerGrossSquareFoot: "Hard cost per GSF",
  softCostPercent: "Soft cost percent",
  contingencyPercent: "Contingency percent",
  vacancyPercent: "Vacancy percent",
  operatingExpensePercent: "Operating expense percent",
  debtPercent: "Debt percent",
  interestRatePercent: "Interest rate percent",
  exitCapRatePercent: "Exit cap rate",
};

export const UNDERWRITING_INPUT_KEYS = Object.keys(
  UNDERWRITING_INPUT_LABELS,
) as UnderwritingInputKey[];

export const UNDERWRITING_LIMITATIONS = [
  "Stabilized net operating income is capitalized in the same annual period.",
  "The interest estimate assumes the full loan balance for one year.",
  "The model does not include construction draws, lease-up, terminal forward net operating income, debt service, or investor returns.",
  "These preliminary results do not record a finance approval.",
] as const;

export type ReviewSectionKey =
  | "facts"
  | "assumptions"
  | "costs"
  | "operations"
  | "capital"
  | "returns"
  | "scenarios";

// LA-2054. Sections in page order. The title is what the list shows over each group.
export const REVIEW_SECTIONS: ReadonlyArray<{ key: ReviewSectionKey; title: string }> = [
  { key: "facts", title: "Project Facts" },
  { key: "assumptions", title: "Financial Assumptions" },
  { key: "costs", title: "Development Cost Schedule" },
  { key: "operations", title: "Apartment Operations" },
  { key: "capital", title: "Development Capital" },
  { key: "returns", title: "Property Sale and Returns" },
  { key: "scenarios", title: "Scenario Comparison" },
];

export type ReviewGap = "Missing" | "No Source Label" | "No Source Date" | "Working on It";

/** One input with everything still open on it. */
export type UnderwritingReviewRow = {
  id: string;
  label: string;
  gaps: ReviewGap[];
  /** The row text, for example "Payroll: No Source Date, Working on It". */
  message: string;
};

export type UnderwritingReviewGroup = {
  key: ReviewSectionKey;
  title: string;
  rows: UnderwritingReviewRow[];
  /** Rows still Working on It, which is what Mark Section Done clears. */
  workingCount: number;
};

/** A calculation problem. These stay apart from the input rows and sit above them. */
export type UnderwritingReviewItem = {
  id: string;
  message: string;
  severity: "waiting" | "stuck";
};

export type UnderwritingReview = {
  calculation: UnderwritingReviewItem[];
  groups: UnderwritingReviewGroup[];
  /** Calculation items plus input rows. */
  count: number;
};

export function titleCase(text: string): string {
  return text.replace(/\b([a-z])([a-z]*)/g, (word, first: string, rest: string) =>
    /^(and|of|on|in|per|to|for|the|a)$/.test(word) ? word : first.toUpperCase() + rest);
}

function humanKey(key: string): string {
  return titleCase(key.replace(/([A-Z])/g, " $1").trim());
}

export function buildUnderwritingReview(
  savedCase: UnderwritingCase,
  currentRun: SavedUnderwritingRun | undefined,
  hasRunHistory: boolean,
): UnderwritingReview {
  const calculation: UnderwritingReviewItem[] = [];
  const bySection = new Map<ReviewSectionKey, UnderwritingReviewRow[]>();

  function addRow(section: ReviewSectionKey, id: string, label: string, gaps: ReviewGap[]) {
    if (gaps.length === 0) return;
    const rows = bySection.get(section) ?? [];
    rows.push({ id, label, gaps, message: `${label}: ${gaps.join(", ")}` });
    bySection.set(section, rows);
  }

  function evidenceGaps(evidence: { sourceLabel?: unknown; sourceDate?: unknown; reviewState?: unknown } | undefined): ReviewGap[] {
    const gaps: ReviewGap[] = [];
    if (typeof evidence?.sourceLabel !== "string" || !evidence.sourceLabel.trim()) gaps.push("No Source Label");
    if (typeof evidence?.sourceDate !== "string" || !evidence.sourceDate.trim()) gaps.push("No Source Date");
    if (!evidence || evidence.reviewState === "working") gaps.push("Working on It");
    return gaps;
  }

  const facts = [
    ["proposedUnits", "Proposed Units", savedCase.proposedUnits],
    ["averageUnitSquareFeet", "Average Unit Size", savedCase.averageUnitSquareFeet],
    ["grossBuildingSquareFeet", "Gross Building Area", savedCase.grossBuildingSquareFeet],
  ] as const;
  for (const [id, label, value] of facts) {
    if (value === undefined) {
      addRow("facts", `fact-${id}`, label, ["Missing"]);
      continue;
    }
    addRow("facts", `fact-${id}`, label, evidenceGaps(savedCase.factMetadata[id]));
  }

  if (!currentRun) {
    calculation.push({
      id: "calculation-current-revision",
      message: hasRunHistory
        ? "The project changed after the latest calculation. Recalculate this revision before reviewing results."
        : "This project has not been calculated. Run the calculation before reviewing results.",
      severity: "waiting",
    });
  } else {
    for (const issue of currentRun.issues) {
      calculation.push({
        id: `calculation-${"inputKey" in issue ? issue.inputKey : issue.path}-${issue.code}`,
        message: issue.message,
        severity: "stuck",
      });
    }
  }

  for (const assumption of savedCase.assumptions) {
    addRow("assumptions", `assumption-${assumption.name}`, titleCase(assumption.label), evidenceGaps(assumption));
  }

  for (const line of savedCase.costSchedule?.costLines ?? []) {
    addRow("costs", `cost-${line.id}`, titleCase(line.name), evidenceGaps(line));
  }

  const commercial = savedCase.apartmentOperations?.commercial;
  const operationLines = savedCase.apartmentOperations ? [
    ...savedCase.apartmentOperations.residentialUnitTypes,
    ...savedCase.apartmentOperations.otherIncomeLines,
    ...savedCase.apartmentOperations.operatingExpenseLines,
    ...savedCase.apartmentOperations.capitalExpenditureLines,
    ...(commercial ? [{ ...commercial, id: "commercial", name: "Commercial Vacancy and Credit Loss" }, ...commercial.spaces] : []),
  ] : [];
  for (const line of operationLines) {
    addRow("operations", `operations-${line.id}`, titleCase(line.name), evidenceGaps(line));
  }

  if (savedCase.apartmentOperations) {
    for (const key of APARTMENT_OPERATIONS_ASSUMPTION_KEYS) {
      addRow("operations", `operations-assumption-${key}`, humanKey(key), evidenceGaps(savedCase.apartmentOperations.assumptionEvidence[key]));
    }
  }

  if (savedCase.developmentCapital) {
    for (const key of DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS) {
      addRow("capital", `capital-assumption-${key}`, humanKey(key), evidenceGaps(savedCase.developmentCapital.capitalAssumptionEvidence[key]));
    }
  }

  if (savedCase.propertyReturns) {
    const saleKeys = savedCase.propertyReturns.commercialTerminalCapRatePercent === undefined
      ? [...PROPERTY_RETURNS_ASSUMPTION_KEYS]
      : [...PROPERTY_RETURNS_ASSUMPTION_KEYS, PROPERTY_RETURNS_COMMERCIAL_CAP_KEY];
    for (const key of saleKeys) {
      addRow("returns", `returns-assumption-${key}`, humanKey(key), evidenceGaps(savedCase.propertyReturns.saleAssumptionEvidence[key]!));
    }
  }

  for (const scenario of savedCase.scenarios ?? []) {
    for (const [key, evidence] of Object.entries(scenario.evidence)) {
      addRow("scenarios", `scenario-${scenario.id}-${key}`, `${titleCase(scenario.name)} ${humanKey(key)}`, evidenceGaps(evidence));
    }
  }

  const groups = REVIEW_SECTIONS.flatMap(({ key, title }) => {
    const rows = bySection.get(key);
    if (!rows?.length) return [];
    return [{ key, title, rows, workingCount: rows.filter((row) => row.gaps.includes("Working on It")).length }];
  });
  const count = calculation.length + groups.reduce((total, group) => total + group.rows.length, 0);
  return { calculation, groups, count };
}
