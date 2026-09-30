import type { DerivedAssumption, Rom } from "@kulka/engine";

import type { RecordedAnswers, RunRecord } from "@/lib/rom/run-records";

// LA-1417. What a published budget freezes, and the few figures the
// placeholder page reads off it. Pure: no clock, no network, no database. The
// published page renders from this shape alone, so nothing in it may point
// back at a live table.

/** The stage bar's four stages (LA-1309). Only a conceptual budget can be published today. */
export type PublishedStage = "conceptual" | "design_development" | "pre_construction" | "final";

/** What the estimator writes for the page. Every field is optional; null means not stated. */
export type PresentationCopy = {
  preparedFor: string | null;
  preparedBy: string | null;
  /** How many days the figures stay valid from issue. Null until the estimator states it. */
  validityDays: number | null;
  /** One sentence the estimator writes for the cover. */
  coverSentence: string | null;
};

/**
 * The Allocated Resources plan for General Conditions and General
 * Requirements (LA-1394). Main has no such plan yet, so this slot is typed
 * loosely and filled only when a run records one under
 * `answers.allocatedResources`. LA-1394 narrows the type once it lands.
 */
export type AllocatedResourcesPlan = { readonly [key: string]: unknown };

/** A criterion as frozen: the engine's record without the database ids it was stored under. */
export type PublishedCriterion = DerivedAssumption;

export type PublishedBudgetSnapshot = {
  /** Bumped only if the shape ever changes, so an old snapshot can still be read. */
  format: 1;
  run: {
    id: string;
    skill: string;
    startedAt: string;
    finishedAt: string | null;
    /** When the run was first issued (lib/rom/issue.ts keeps the first stamp). */
    issuedAt: string;
  };
  project: { id: string; name: string };
  /** The run's ROM, with lists a pre-LA-1209 run lacked filled in as empty. */
  rom: Rom;
  /** The recorded answers, facts included under `facts`, exactly as the run recorded them. */
  answers: RecordedAnswers;
  /** The Design and Engineering criteria on the project at the moment of publishing. */
  criteria: PublishedCriterion[];
  /** Present only when the run recorded an Allocated Resources plan. */
  allocatedResources?: AllocatedResourcesPlan;
  copy: PresentationCopy;
  /** The engine data snapshot hash the run was computed against, or null for a run recorded before runs kept one. */
  engineSnapshotHash: string | null;
};

export type SnapshotSource = {
  run: Pick<RunRecord, "id" | "projectId" | "projectName" | "skill" | "startedAt" | "finishedAt" | "answers" | "snapshotHash"> & {
    rom: Rom;
  };
  issuedAt: string;
  criteria: readonly (DerivedAssumption & { id?: string; correctionId?: string | null })[];
  copy: PresentationCopy;
};

/** Everything a published page needs, copied out of the run so the page never reads the run again. */
export function assembleSnapshot(source: SnapshotSource): PublishedBudgetSnapshot {
  const { run } = source;
  const answers = (run.answers ?? {}) as RecordedAnswers;
  const plan = (answers as { allocatedResources?: unknown }).allocatedResources;
  const snapshot: PublishedBudgetSnapshot = {
    format: 1,
    run: {
      id: run.id,
      skill: run.skill,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      issuedAt: source.issuedAt,
    },
    project: { id: run.projectId, name: run.projectName },
    rom: run.rom,
    answers,
    criteria: source.criteria.map(frozenCriterion),
    copy: source.copy,
    engineSnapshotHash: run.snapshotHash,
  };
  if (plan && typeof plan === "object" && !Array.isArray(plan)) {
    snapshot.allocatedResources = plan as AllocatedResourcesPlan;
  }
  return snapshot;
}

/** The engine's criterion record, field by field, so no storage id rides along. */
function frozenCriterion(criterion: DerivedAssumption): PublishedCriterion {
  return {
    kind: criterion.kind,
    code: criterion.code,
    label: criterion.label,
    value: criterion.value,
    method: criterion.method,
    inputs: criterion.inputs,
    steps: criterion.steps,
    confidence: criterion.confidence,
    confidenceReason: criterion.confidenceReason,
    costCodes: criterion.costCodes,
    correction: criterion.correction,
  };
}

type Range = { low: number; high: number };

export type HeadlineFigures = {
  /** Kulka's contract: with markups when the run priced them, trade cost otherwise. */
  kulkaContract: Range & { likely: number };
  /** Kulka's contract plus owner-direct scope. Equal to the contract when there is none. */
  totalProjectCost: Range & { likely: number };
  /** Likely Kulka contract per gross square foot, or null when the run has no area. */
  perGrossSquareFoot: number | null;
  grossSquareFeet: number | null;
};

/** The figures the placeholder page prints. The likely figure is the middle of the range. */
export function headlineFigures(snapshot: PublishedBudgetSnapshot): HeadlineFigures {
  const { rom, answers } = snapshot;
  const contract = rom.markups ? rom.markups.total : rom.kulkaContractTotal;
  const project = rom.markups ? rom.markups.totalProjectCost : rom.total;
  const likelyContract = likely(contract);
  const area = answers.grossSquareFeet > 0 ? answers.grossSquareFeet : null;
  return {
    kulkaContract: { low: contract.low, high: contract.high, likely: likelyContract },
    totalProjectCost: { low: project.low, high: project.high, likely: likely(project) },
    perGrossSquareFoot: area ? likelyContract / area : null,
    grossSquareFeet: area,
  };
}

function likely(range: Range): number {
  return (range.low + range.high) / 2;
}
