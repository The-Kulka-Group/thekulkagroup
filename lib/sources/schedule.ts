import { randomUUID } from "node:crypto";

import type { Db } from "@/lib/db";

import type { RunTrigger, SourceKey } from "./runs";

// LA-3049. Every refresh of a source, from the schedule or a button, goes
// through refreshSource. It claims a lease on the source's data_sources row
// with one conditional update, which Postgres serializes across serverless
// instances, so two runs of one source never overlap. A Fireflies webhook
// delivery saves one meeting and skips the lease, so a delivery that lands
// during a backfill is never turned away.

/** Longer than any refresh route's time limit, so a run that dies frees its source by itself. */
const LEASE = "10 minutes";

/**
 * The hourly cron fires within seconds of the hour, so a source is due a few
 * minutes before its interval has fully passed. Without this a daily source
 * would slip an hour each day.
 */
const EARLY = "10 minutes";

export type Refresh<T> = { status: "ran"; result: T } | { status: "busy" } | { status: "not_due" };

/**
 * Claims the source unless a run holds it. A scheduled claim also needs the
 * source on, with an interval, and no scheduled run inside that interval.
 * Button runs do not count toward it, so a refresh by hand never moves the
 * time of day the schedule runs.
 */
async function claim(db: Db, source: SourceKey, token: string, scheduled: boolean): Promise<boolean> {
  const { rows } = await db.query(
    `update data_sources s set lease_token = $2, lease_until = now() + interval '${LEASE}'
      where s.key = $1
        and (s.lease_until is null or s.lease_until <= now())
        and (not $3::boolean or (
          s.enabled and s.refresh_interval is not null and not exists (
            select 1 from source_runs r
             where r.source_key = s.key and r.trigger = 'schedule'
               and r.started_at > now() - s.refresh_interval + interval '${EARLY}')))
      returning s.key`,
    [source, token, scheduled],
  );
  return rows.length > 0;
}

async function release(db: Db, source: SourceKey, token: string): Promise<void> {
  try {
    await db.query(`update data_sources set lease_token = null, lease_until = null where key = $1 and lease_token = $2`, [
      source,
      token,
    ]);
  } catch (cause) {
    // The lease lapses by itself, so the run's own result still stands.
    console.error(`Could not release the ${source} lease.`, cause);
  }
}

/**
 * The one way to refresh a source. Runs `work` while holding the source's
 * lease and returns its result, or says the source is busy or, for the
 * schedule, not due. `work` logs its own run (lib/sources/runs.ts); a
 * request turned away logs nothing. A throw from `work` is thrown again.
 */
export async function refreshSource<T>(
  db: Db,
  source: SourceKey,
  trigger: Exclude<RunTrigger, "webhook">,
  work: () => Promise<T>,
): Promise<Refresh<T>> {
  const token = randomUUID();
  const scheduled = trigger === "schedule";
  if (!(await claim(db, source, token, scheduled))) {
    if (!scheduled) return { status: "busy" };
    const { rows } = await db.query(`select 1 from data_sources where key = $1 and lease_until > now()`, [source]);
    return { status: rows.length > 0 ? "busy" : "not_due" };
  }
  try {
    return { status: "ran", result: await work() };
  } finally {
    await release(db, source, token);
  }
}

/** A scheduled source's refresh. It logs its own run and throws when the refresh fails. */
export type Runner = (db: Db) => Promise<unknown>;

export type SourceReport =
  | { source: string; status: "ran"; result: unknown }
  | { source: string; status: "busy" | "not_due" | "no_runner" }
  | { source: string; status: "failed"; error: string };

/**
 * One pass of the schedule: every enabled source with an interval, in the
 * order of `runners`, so the Autodesk project list lands before meetings are
 * matched to jobs. A failing source never stops the ones after it.
 */
export async function runDueSources(db: Db, runners: Partial<Record<SourceKey, Runner>>): Promise<SourceReport[]> {
  const { rows } = await db.query<{ key: string }>(
    `select key from data_sources where enabled and refresh_interval is not null order by key`,
  );
  const scheduled = new Set(rows.map((row) => row.key));
  const order = Object.keys(runners) as SourceKey[];
  const reports: SourceReport[] = [];
  for (const source of order) {
    if (!scheduled.has(source)) continue;
    const run = runners[source]!;
    try {
      const outcome = await refreshSource(db, source, "schedule", () => run(db));
      reports.push(outcome.status === "ran" ? { source, status: "ran", result: outcome.result } : { source, status: outcome.status });
    } catch (cause) {
      console.error(`The scheduled ${source} refresh failed.`, cause);
      reports.push({ source, status: "failed", error: cause instanceof Error ? cause.message : String(cause) });
    }
  }
  for (const key of scheduled) {
    if (!order.includes(key as SourceKey)) reports.push({ source: key, status: "no_runner" });
  }
  return reports;
}
