import type { UnderwritingInputKey } from "@kulka/engine";

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
      items.push({ id: `fact-review-state-${id}`, message: `${label} is still Working on it.`, severity: "waiting" });
    }
  }

  if (!currentRun) {
    items.push({
      id: "calculation-current-revision",
      message: hasRunHistory
        ? "The case changed after the latest calculation. Recalculate this revision before reviewing results."
        : "This case has not been calculated. Run the calculation before reviewing results.",
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
        message: `${assumption.label} is still Working on it.`,
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
        message: `${line.name} is still Working on it.`,
        severity: "waiting",
      });
    }
  }

  return items;
}
