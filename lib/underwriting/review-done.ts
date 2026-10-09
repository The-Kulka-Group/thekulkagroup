import type { ApartmentScenarioDefinition, MonthlyCostScheduleInputs } from "@kulka/engine";

import type { ApartmentOperationsDraft } from "@/lib/underwriting/operations-input";
import type { DevelopmentCapitalDraft } from "@/lib/underwriting/capital-input";
import type { PropertyReturnsDraft } from "@/lib/underwriting/returns-input";
import type {
  AssumptionName,
  CaseDraft,
  FactName,
  UnderwritingCase,
} from "@/lib/underwriting/cases";
import type { ReviewSectionKey } from "@/lib/underwriting/presentation";

// LA-2054. Mark Section Done. For one section of a saved case this builds the same input the section's editor
// would save, with every review state set to Done. The route then saves it through the section's existing save
// function, so one click is one save and one revision. Nothing else about the input changes.

export const REVIEW_SECTION_KEYS: readonly ReviewSectionKey[] = [
  "facts", "assumptions", "costs", "operations", "capital", "returns", "scenarios",
];

export function isReviewSectionKey(value: unknown): value is ReviewSectionKey {
  return typeof value === "string" && (REVIEW_SECTION_KEYS as readonly string[]).includes(value);
}

/** Copies the value with every `reviewState` of "working" set to "done", at any depth. */
export function withReviewDone<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => withReviewDone(item)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      key === "reviewState" && item === "working" ? "done" : withReviewDone(item),
    ])) as T;
  }
  return value;
}

function withoutLastChangedAt<T extends { lastChangedAt: string }>(value: T): Omit<T, "lastChangedAt"> {
  const rest: Partial<T> = { ...value };
  delete rest.lastChangedAt;
  return rest as Omit<T, "lastChangedAt">;
}

export type SectionDonePlan =
  | { section: "facts" | "assumptions"; save: "case"; draft: CaseDraft }
  | { section: "costs"; save: "schedule"; schedule: MonthlyCostScheduleInputs }
  | { section: "operations"; save: "operations"; operations: ApartmentOperationsDraft }
  | { section: "capital"; save: "capital"; capital: DevelopmentCapitalDraft }
  | { section: "returns"; save: "returns"; propertyReturns: PropertyReturnsDraft }
  | { section: "scenarios"; save: "scenarios"; scenarios: ApartmentScenarioDefinition[] };

function caseDraft(savedCase: UnderwritingCase, section: "facts" | "assumptions"): CaseDraft {
  const factNames = ["proposedUnits", "averageUnitSquareFeet", "grossBuildingSquareFeet"] as const satisfies readonly FactName[];
  const factMetadata: NonNullable<CaseDraft["factMetadata"]> = {};
  for (const name of factNames) {
    if (savedCase[name] === undefined) continue;
    const saved = savedCase.factMetadata[name];
    factMetadata[name] = {
      ...(saved?.sourceLabel !== undefined ? { sourceLabel: saved.sourceLabel } : {}),
      ...(saved?.sourceDate !== undefined ? { sourceDate: saved.sourceDate } : {}),
      reviewState: section === "facts" ? "done" : saved?.reviewState ?? "working",
    };
  }
  const assumptions: CaseDraft["assumptions"] = {};
  const assumptionMetadata: NonNullable<CaseDraft["assumptionMetadata"]> = {};
  for (const assumption of savedCase.assumptions) {
    const name: AssumptionName = assumption.name;
    assumptions[name] = assumption.value;
    assumptionMetadata[name] = {
      ...(assumption.sourceLabel !== undefined ? { sourceLabel: assumption.sourceLabel } : {}),
      ...(assumption.sourceDate !== undefined ? { sourceDate: assumption.sourceDate } : {}),
      reviewState: section === "assumptions" ? "done" : assumption.reviewState,
    };
  }
  return {
    name: savedCase.name,
    address: savedCase.address,
    ...(savedCase.proposedUnits !== undefined ? { proposedUnits: savedCase.proposedUnits } : {}),
    ...(savedCase.averageUnitSquareFeet !== undefined ? { averageUnitSquareFeet: savedCase.averageUnitSquareFeet } : {}),
    ...(savedCase.grossBuildingSquareFeet !== undefined ? { grossBuildingSquareFeet: savedCase.grossBuildingSquareFeet } : {}),
    assumptions,
    assumptionMetadata,
    factMetadata,
  };
}

/** Returns undefined when the case has nothing saved in that section. */
export function planSectionDone(savedCase: UnderwritingCase, section: ReviewSectionKey): SectionDonePlan | undefined {
  switch (section) {
    case "facts":
    case "assumptions":
      return { section, save: "case", draft: caseDraft(savedCase, section) };
    case "costs":
      return savedCase.costSchedule
        ? { section, save: "schedule", schedule: withReviewDone(savedCase.costSchedule) }
        : undefined;
    case "operations":
      return savedCase.apartmentOperations
        ? { section, save: "operations", operations: withReviewDone(withoutLastChangedAt(savedCase.apartmentOperations)) }
        : undefined;
    case "capital":
      return savedCase.developmentCapital
        ? { section, save: "capital", capital: withReviewDone(withoutLastChangedAt(savedCase.developmentCapital)) }
        : undefined;
    case "returns":
      return savedCase.propertyReturns
        ? { section, save: "returns", propertyReturns: withReviewDone(withoutLastChangedAt(savedCase.propertyReturns)) }
        : undefined;
    case "scenarios":
      return savedCase.scenarios?.length
        ? { section, save: "scenarios", scenarios: withReviewDone(savedCase.scenarios.map(withoutLastChangedAt)) }
        : undefined;
  }
}
