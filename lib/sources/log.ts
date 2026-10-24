import type { Db } from "@/lib/db";

import type { RunOutcome, RunTrigger } from "./runs";

// LA-3050. One source's run log, newest first, for its page under Data Sources.

export type SourceRun = {
  id: string;
  trigger: RunTrigger;
  startedAt: string;
  /** Null while the run is still going. */
  finishedAt: string | null;
  outcome: RunOutcome | null;
  rowsAdded: number | null;
  rowsChanged: number | null;
  error: string | null;
};

type Row = {
  id: string;
  trigger: RunTrigger;
  started_at: Date | string;
  finished_at: Date | string | null;
  outcome: RunOutcome | null;
  rows_added: number | null;
  rows_changed: number | null;
  error: string | null;
};

export const RUN_LOG_LIMIT = 50;

export async function readSourceRuns(db: Db, source: string, limit: number = RUN_LOG_LIMIT): Promise<SourceRun[]> {
  const { rows } = await db.query<Row>(
    `select id, trigger, started_at, finished_at, outcome, rows_added, rows_changed, error
       from source_runs where source_key = $1
      order by started_at desc, id desc limit $2`,
    [source, limit],
  );
  return rows.map((row) => ({
    id: row.id,
    trigger: row.trigger,
    startedAt: new Date(row.started_at).toISOString(),
    finishedAt: row.finished_at === null ? null : new Date(row.finished_at).toISOString(),
    outcome: row.outcome,
    rowsAdded: row.rows_added,
    rowsChanged: row.rows_changed,
    error: row.error,
  }));
}
