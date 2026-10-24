import type { Db } from "@/lib/db";

// LA-3048. One row in source_runs for each refresh of a data source, written
// whether the refresh works or throws. The log must never change what the
// refresh itself does, so a failed log write is reported to the console and
// the refresh's own result or error goes back to the caller untouched.

export type SourceKey =
  | "autodesk_projects"
  | "autodesk_connection"
  | "fireflies_meetings"
  | "proest_imports"
  | "vision_discovery";

export type RunTrigger = "schedule" | "button" | "webhook";

export type RunOutcome = "ok" | "failed" | "partial";

export type ConnectionStatus = "connected" | "missing" | "expired";

/** What a finished refresh reports. The outcome is "ok" unless stated. */
export type RunTally = {
  outcome?: RunOutcome;
  added?: number | null;
  changed?: number | null;
  error?: string | null;
};

const ERROR_LIMIT = 4000;

const errorText = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause)).slice(0, ERROR_LIMIT);

async function startRun(db: Db, source: SourceKey, trigger: RunTrigger): Promise<string | null> {
  try {
    const { rows } = await db.query<{ id: string }>(
      `insert into source_runs (source_key, trigger) values ($1, $2) returning id`,
      [source, trigger],
    );
    return rows[0].id;
  } catch (cause) {
    console.error(`Could not start the ${source} run log.`, cause);
    return null;
  }
}

async function finishRun(db: Db, id: string | null, tally: RunTally): Promise<void> {
  if (!id) return;
  try {
    await db.query(
      `update source_runs set finished_at = now(), outcome = $2, rows_added = $3, rows_changed = $4, error = $5
        where id = $1`,
      [id, tally.outcome ?? "ok", tally.added ?? null, tally.changed ?? null, tally.error?.slice(0, ERROR_LIMIT) ?? null],
    );
  } catch (cause) {
    console.error("Could not finish the run log.", cause);
  }
}

/**
 * Runs `work` and logs it as one run of `source`. `tally` reads the counts
 * from the result. A throw is logged as a failed run and thrown again.
 */
export async function recordRun<T>(
  db: Db,
  source: SourceKey,
  trigger: RunTrigger,
  work: () => Promise<T>,
  tally: (result: T) => RunTally | Promise<RunTally> = () => ({}),
): Promise<T> {
  const id = await startRun(db, source, trigger);
  let result: T;
  try {
    result = await work();
  } catch (cause) {
    await finishRun(db, id, { outcome: "failed", error: errorText(cause) });
    throw cause;
  }
  let counts: RunTally;
  try {
    counts = await tally(result);
  } catch (cause) {
    console.error(`Could not count the ${source} run.`, cause);
    counts = {};
  }
  await finishRun(db, id, counts);
  return result;
}

/** Records whether a source's saved sign-in is there. Like the run log, it never throws. */
export async function setConnectionStatus(db: Db, source: SourceKey, status: ConnectionStatus): Promise<void> {
  try {
    await db.query(`update data_sources set connection_status = $2 where key = $1`, [source, status]);
  } catch (cause) {
    console.error(`Could not record the ${source} connection.`, cause);
  }
}
