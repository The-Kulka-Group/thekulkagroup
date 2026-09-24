import type { Answers, Rom } from "@kulka/engine";

import type { Db } from "@/lib/db";
import type { FlowRecord } from "@/lib/rom/question-flow";

/**
 * What `runs.answers` actually holds. A run driven by the question flow records
 * the answers plus the flow that produced them (LA-20); a run off the project
 * record has no flow, so the key is absent. A run since LA-1016 also records
 * its markup choices under `markups`, which Answers already carries.
 */
export type RecordedAnswers = Answers & { flow?: FlowRecord };

// Reading side of the run record (LA-16). lib/rom/run.ts writes the run and its
// steps; nothing here writes anything. A run that is still going reads the same
// way a finished one does, which is what lets the run page poll one shape and
// show a step appear the moment it is recorded.

export type RunStatus = "running" | "succeeded" | "failed";

export type RunStepRecord = {
  seq: number;
  name: string;
  status: RunStatus;
  detail: unknown;
  startedAt: string;
  finishedAt: string | null;
};

export type RunSummary = {
  id: string;
  projectId: string;
  projectName: string;
  skill: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
  stepCount: number;
};

export type RunRecord = RunSummary & {
  answers: RecordedAnswers | null;
  rom: Rom | null;
  snapshotHash: string | null;
  steps: RunStepRecord[];
};

/** There is no such run, so there is nothing to show. */
export class RunNotFound extends Error {
  constructor(readonly runId: string) {
    super(`No run ${runId}.`);
    this.name = "RunNotFound";
  }
}

type SummaryRow = {
  id: string;
  project_id: string;
  project_name: string;
  skill: string;
  status: RunStatus;
  started_at: Date | string;
  finished_at: Date | string | null;
  error: string | null;
  step_count: string | number;
};

type DetailRow = SummaryRow & {
  answers: RecordedAnswers | null;
  rom: Rom | null;
  snapshot_hash: string | null;
};

type StepRow = {
  seq: string | number;
  name: string;
  status: RunStatus;
  detail: unknown;
  started_at: Date | string;
  finished_at: Date | string | null;
};

const SUMMARY_COLUMNS = `r.id, r.project_id, p.name as project_name, r.skill, r.status,
         r.started_at, r.finished_at, r.error,
         (select count(*) from run_steps s where s.run_id = r.id) as step_count`;

/** Past runs, newest first, so one can be picked out and reopened. */
export async function listRuns(db: Db, limit = 50): Promise<RunSummary[]> {
  const { rows } = await db.query<SummaryRow>(
    `select ${SUMMARY_COLUMNS}
       from runs r
       join projects p on p.id = r.project_id
      order by r.started_at desc, r.id desc
      limit $1`,
    [limit],
  );
  return rows.map(toSummary);
}

/** One run and every step it has recorded so far, in the order they happened. */
export async function getRun(db: Db, runId: string): Promise<RunRecord> {
  const { rows } = await db.query<DetailRow>(
    `select ${SUMMARY_COLUMNS}, r.answers, r.rom, r.snapshot_hash
       from runs r
       join projects p on p.id = r.project_id
      where r.id = $1`,
    [runId],
  );
  const run = rows[0];
  if (!run) throw new RunNotFound(runId);

  const { rows: steps } = await db.query<StepRow>(
    `select seq, name, status, detail, started_at, finished_at
       from run_steps where run_id = $1 order by seq`,
    [runId],
  );

  return {
    ...toSummary(run),
    answers: run.answers,
    rom: run.rom,
    snapshotHash: run.snapshot_hash,
    steps: steps.map((step) => ({
      seq: Number(step.seq),
      name: step.name,
      status: step.status,
      detail: step.detail ?? null,
      startedAt: isoTime(step.started_at),
      finishedAt: step.finished_at === null ? null : isoTime(step.finished_at),
    })),
  };
}

function toSummary(row: SummaryRow): RunSummary {
  return {
    id: row.id,
    projectId: row.project_id,
    projectName: row.project_name,
    skill: row.skill,
    status: row.status,
    startedAt: isoTime(row.started_at),
    finishedAt: row.finished_at === null ? null : isoTime(row.finished_at),
    error: row.error,
    stepCount: Number(row.step_count),
  };
}

function isoTime(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
