import type { DerivedAssumption, Rom, RomLine, ScopeEntry, UnpricedItem } from "@kulka/engine";
import { DAYS_PER_MONTH } from "@kulka/engine";

import { entriesFor, isApproved, raisedByFor, type StoredScopeEntry } from "@/lib/rom/line-details";
import type { RecordedAnswers, RunRecord } from "@/lib/rom/run-records";

// LA-1417. What a published budget freezes. Pure: no clock, no network, no database. The
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

/**
 * LA-1566. The construction duration estimated once, at publishing, for a
 * budget with no schedule. Whole months, 1 to 120. A schedule always wins
 * over it, so a snapshot never carries both.
 */
export type DurationEstimate = { months: number };

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
  /**
   * The run's ROM, with lists a pre-LA-1209 run lacked filled in as empty.
   * LA-1502: every line's Inclusions and Exclusions are the approved ones
   * only, and its owner items are worked out against `criteria` below. A
   * snapshot published before LA-1502 has neither, nor a line's division,
   * inputs or quantity, and the page reads each as absent.
   */
  rom: Rom;
  /** The recorded answers, facts included under `facts`, exactly as the run recorded them. */
  answers: RecordedAnswers;
  /** The Design and Engineering criteria on the project at the moment of publishing. */
  criteria: PublishedCriterion[];
  /** Present only when the run recorded an Allocated Resources plan. */
  allocatedResources?: AllocatedResourcesPlan;
  /** Present only when the budget had no schedule and the estimate came back. */
  durationEstimate?: DurationEstimate;
  copy: PresentationCopy;
  /** The engine data snapshot hash the run was computed against, or null for a run recorded before runs kept one. */
  engineSnapshotHash: string | null;
  /**
   * The name of each job the comparables cite, by project id, as it read when
   * the budget was published. Absent on a snapshot published before
   * publishing froze the names; that page counts the jobs and does not name them.
   */
  sourceJobNames?: Readonly<Record<string, string>>;
};

export type SnapshotSource = {
  run: Pick<RunRecord, "id" | "projectId" | "projectName" | "skill" | "startedAt" | "finishedAt" | "answers" | "snapshotHash"> & {
    rom: Rom;
  };
  issuedAt: string;
  criteria: readonly (DerivedAssumption & { id?: string; correctionId?: string | null })[];
  copy: PresentationCopy;
  /** The names publishing looked up for the jobs the comparables cite. */
  sourceJobNames?: Readonly<Record<string, string>>;
  /**
   * LA-1502: the project's Inclusions and Exclusions as they stand when
   * publishing, approved or not. Only approved ones are frozen. Absent means
   * the snapshot keeps the run's own entries, approved ones only.
   */
  scopeEntries?: readonly StoredScopeEntry[];
  /** The estimate publishing made, dropped when the run's plan has a schedule. */
  durationEstimate?: DurationEstimate;
};

/** Everything a published page needs, copied out of the run so the page never reads the run again. */
export function assembleSnapshot(source: SnapshotSource): PublishedBudgetSnapshot {
  const { run } = source;
  const answers = (run.answers ?? {}) as RecordedAnswers;
  const plan = allocatedResourcesOf(answers);
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
    rom: frozenRom(run.rom, answers, source),
    answers,
    criteria: source.criteria.map(frozenCriterion),
    copy: source.copy,
    engineSnapshotHash: run.snapshotHash,
  };
  if (plan) snapshot.allocatedResources = plan;
  if (source.durationEstimate && scheduledMonths(plan) === null) snapshot.durationEstimate = { months: source.durationEstimate.months };
  if (source.sourceJobNames) snapshot.sourceJobNames = source.sourceJobNames;
  return snapshot;
}

/** The run's Allocated Resources plan, when it recorded one as an object. */
export function allocatedResourcesOf(answers: RecordedAnswers | null): AllocatedResourcesPlan | undefined {
  const plan = (answers as { allocatedResources?: unknown } | null)?.allocatedResources;
  return plan && typeof plan === "object" && !Array.isArray(plan) ? (plan as AllocatedResourcesPlan) : undefined;
}

/**
 * The construction phase in whole months, when the Allocated Resources plan
 * has a schedule: its priced weeks (`weeks.construction`) or its plan figure
 * (`schedule.construction.value`), converted the way the plan prices by the
 * month (resource-plan.ts monthsIn). The plan is typed loosely until LA-1394,
 * so anything else reads as no schedule.
 */
export function scheduledMonths(plan: AllocatedResourcesPlan | undefined): number | null {
  const read = plan as { weeks?: { construction?: unknown }; schedule?: { construction?: { value?: unknown } } } | undefined;
  const weeks = read?.weeks?.construction ?? read?.schedule?.construction?.value;
  if (typeof weeks !== "number" || !Number.isFinite(weeks) || weeks <= 0) return null;
  const months = Math.round((weeks * 7) / DAYS_PER_MONTH);
  return months > 0 ? months : null;
}

/**
 * LA-1502: the run's ROM as a client may read it. An Inclusion or Exclusion
 * the estimator has not approved never reaches the snapshot. A line's owner
 * items are worked out again against the criteria this snapshot freezes, so
 * the two never disagree; a line from a run recorded before LA-1502 has no
 * inputs to work them from and keeps none.
 */
function frozenRom(rom: Rom, answers: RecordedAnswers, source: SnapshotSource): Rom {
  const approved = (entries: readonly ScopeEntry[]) => entries.filter(isApproved).map((entry) => ({ ...entry }));
  const scope = <T extends RomLine | UnpricedItem>(item: T): T => {
    if (source.scopeEntries) {
      return {
        ...item,
        includes: approved(entriesFor(item.costCode, "include", source.scopeEntries)),
        excludes: approved(entriesFor(item.costCode, "exclude", source.scopeEntries)),
      };
    }
    return {
      ...item,
      ...(item.includes ? { includes: approved(item.includes) } : {}),
      ...(item.excludes ? { excludes: approved(item.excludes) } : {}),
    };
  };
  return {
    ...rom,
    lines: rom.lines.map((line) => {
      const scoped = scope(line);
      return line.inputs ? { ...scoped, raisedBy: raisedByFor(line, answers, source.criteria) } : scoped;
    }),
    unpricedItems: (rom.unpricedItems ?? []).map(scope),
  };
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
