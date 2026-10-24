import type { Db } from "@/lib/db";

/** The run log (LA-3048), oldest first, with the timestamps reduced to whether the run finished. */
export async function sourceRuns(db: Db) {
  const { rows } = await db.query<{
    source_key: string;
    trigger: string;
    outcome: string | null;
    rows_added: number | null;
    rows_changed: number | null;
    error: string | null;
    finished: boolean;
  }>(
    `select source_key, trigger, outcome, rows_added, rows_changed, error, finished_at is not null as finished
       from source_runs order by started_at, id`,
  );
  return rows;
}
