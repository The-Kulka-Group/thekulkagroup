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

export type UnderwritingReviewItem = {
  id: string;
  message: string;
  severity: "waiting" | "stuck";
};

export function buildUnderwritingReviewItems(
  savedCase: UnderwritingCase,
  currentRun: SavedUnderwritingRun | undefined,
  hasRunHistory: boolean,
): UnderwritingReviewItem[] {
  const items: UnderwritingReviewItem[] = [];
  const facts = [
    ["proposedUnits", "Proposed units", savedCase.proposedUnits],
    ["averageUnitSquareFeet", "Average unit size", savedCase.averageUnitSquareFeet],
    ["grossBuildingSquareFeet", "Gross building area", savedCase.grossBuildingSquareFeet],
  ] as const;

  for (const [id, label, value] of facts) {
    if (value === undefined) {
      items.push({ id: `fact-${id}`, message: `${label} is missing.`, severity: "waiting" });
      continue;
    }
    const metadata = savedCase.factMetadata[id];
    if (!metadata?.sourceLabel?.trim()) {
      items.push({ id: `fact-source-label-${id}`, message: `${label} needs a source label.`, severity: "waiting" });
    }
    if (!metadata?.sourceDate?.trim()) {
      items.push({ id: `fact-source-date-${id}`, message: `${label} needs a source date.`, severity: "waiting" });
    }
    if (!metadata || metadata.reviewState === "working") {
      items.push({ id: `fact-review-state-${id}`, message: `${label} is still Working on It.`, severity: "waiting" });
    }
  }

  if (!currentRun) {
    items.push({
      id: "calculation-current-revision",
      message: hasRunHistory
        ? "The project changed after the latest calculation. Recalculate this revision before reviewing results."
        : "This project has not been calculated. Run the calculation before reviewing results.",
      severity: "waiting",
    });
  } else {
    for (const issue of currentRun.issues) {
      items.push({
        id: `calculation-${"inputKey" in issue ? issue.inputKey : issue.path}-${issue.code}`,
        message: issue.message,
        severity: "stuck",
      });
    }
  }

  for (const assumption of savedCase.assumptions) {
    if (!assumption.sourceLabel?.trim()) {
      items.push({
        id: `source-label-${assumption.name}`,
        message: `${assumption.label} needs a source label.`,
        severity: "waiting",
      });
    }
    if (!assumption.sourceDate?.trim()) {
      items.push({
        id: `source-date-${assumption.name}`,
        message: `${assumption.label} needs a source date.`,
        severity: "waiting",
      });
    }
    if (assumption.reviewState === "working") {
      items.push({
        id: `review-state-${assumption.name}`,
        message: `${assumption.label} is still Working on It.`,
        severity: "waiting",
      });
    }
  }

  for (const line of savedCase.costSchedule?.costLines ?? []) {
    if (!line.sourceLabel?.trim()) {
      items.push({
        id: `cost-source-label-${line.id}`,
        message: `${line.name} needs a source label.`,
        severity: "waiting",
      });
    }
    if (!line.sourceDate?.trim()) {
      items.push({
        id: `cost-source-date-${line.id}`,
        message: `${line.name} needs a source date.`,
        severity: "waiting",
      });
    }
    if (line.reviewState === "working") {
      items.push({
        id: `cost-review-state-${line.id}`,
        message: `${line.name} is still Working on It.`,
        severity: "waiting",
      });
    }
  }

  const operationLines = savedCase.apartmentOperations ? [
    ...savedCase.apartmentOperations.residentialUnitTypes,
    ...savedCase.apartmentOperations.otherIncomeLines,
    ...savedCase.apartmentOperations.operatingExpenseLines,
    ...savedCase.apartmentOperations.capitalExpenditureLines,
  ] : [];
  for (const line of operationLines) {
    if (!line.sourceLabel?.trim()) {
      items.push({
        id: `operations-source-label-${line.id}`,
        message: `${line.name} needs a source label.`,
        severity: "waiting",
      });
    }
    if (!line.sourceDate?.trim()) {
      items.push({
        id: `operations-source-date-${line.id}`,
        message: `${line.name} needs a source date.`,
        severity: "waiting",
      });
    }
    if (line.reviewState === "working") {
      items.push({
        id: `operations-review-state-${line.id}`,
        message: `${line.name} is still Working on It.`,
        severity: "waiting",
      });
    }
  }

  if (savedCase.apartmentOperations) {
    for (const key of APARTMENT_OPERATIONS_ASSUMPTION_KEYS) {
      const evidence = savedCase.apartmentOperations.assumptionEvidence[key];
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
      if (!evidence.sourceLabel?.trim()) {
        items.push({ id: `operations-assumption-source-label-${key}`, message: `${label} needs a source label.`, severity: "waiting" });
      }
      if (!evidence.sourceDate?.trim()) {
        items.push({ id: `operations-assumption-source-date-${key}`, message: `${label} needs a source date.`, severity: "waiting" });
      }
      if (evidence.reviewState === "working") {
        items.push({ id: `operations-assumption-review-state-${key}`, message: `${label} is still Working on It.`, severity: "waiting" });
      }
    }
  }

  if (savedCase.developmentCapital) {
    for (const key of DEVELOPMENT_CAPITAL_ASSUMPTION_KEYS) {
      const evidence = savedCase.developmentCapital.capitalAssumptionEvidence[key];
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
      if (!evidence.sourceLabel?.trim()) {
        items.push({ id: `capital-assumption-source-label-${key}`, message: `${label} needs a source label.`, severity: "waiting" });
      }
      if (!evidence.sourceDate?.trim()) {
        items.push({ id: `capital-assumption-source-date-${key}`, message: `${label} needs a source date.`, severity: "waiting" });
      }
      if (evidence.reviewState === "working") {
        items.push({ id: `capital-assumption-review-state-${key}`, message: `${label} is still Working on It.`, severity: "waiting" });
      }
    }
  }

  if (savedCase.propertyReturns) {
    const saleKeys = savedCase.propertyReturns.commercialTerminalCapRatePercent === undefined
      ? [...PROPERTY_RETURNS_ASSUMPTION_KEYS]
      : [...PROPERTY_RETURNS_ASSUMPTION_KEYS, PROPERTY_RETURNS_COMMERCIAL_CAP_KEY];
    for (const key of saleKeys) {
      const evidence = savedCase.propertyReturns.saleAssumptionEvidence[key]!;
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
      if (!evidence.sourceLabel?.trim()) {
        items.push({ id: `returns-assumption-source-label-${key}`, message: `${label} needs a source label.`, severity: "waiting" });
      }
      if (!evidence.sourceDate?.trim()) {
        items.push({ id: `returns-assumption-source-date-${key}`, message: `${label} needs a source date.`, severity: "waiting" });
      }
      if (evidence.reviewState === "working") {
        items.push({ id: `returns-assumption-review-state-${key}`, message: `${label} is still Working on It.`, severity: "waiting" });
      }
    }
  }

  for (const scenario of savedCase.scenarios ?? []) {
    for (const [key, evidence] of Object.entries(scenario.evidence)) {
      const label = key.replace(/([A-Z])/g, " $1").replace(/^./, (character) => character.toUpperCase());
      if (typeof evidence?.sourceLabel !== "string" || !evidence.sourceLabel.trim()) items.push({ id: `scenario-source-label-${scenario.id}-${key}`, message: `${scenario.name} ${label} needs a source label.`, severity: "waiting" });
      if (typeof evidence?.sourceDate !== "string" || !evidence.sourceDate.trim()) items.push({ id: `scenario-source-date-${scenario.id}-${key}`, message: `${scenario.name} ${label} needs a source date.`, severity: "waiting" });
      if (evidence?.reviewState === "working") items.push({ id: `scenario-review-state-${scenario.id}-${key}`, message: `${scenario.name} ${label} is still Working on It.`, severity: "waiting" });
    }
  }

  return items;
}
