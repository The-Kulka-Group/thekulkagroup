import type { Db } from "@/lib/db";

import type { ConnectionStatus, RunOutcome } from "./runs";

// LA-3048. How each data source stands, from its last runs in source_runs.
// The Data Sources page (LA-3050) reads this.

export type SourceHealth = "Current" | "Late" | "Failing" | "Not Connected";

/**
 * A daily cron fires at about the same time each day, so a run a few minutes
 * past 24 hours after the last one is on time. Two hours covers that and a
 * slow run.
 */
export const GRACE_MS = 2 * 60 * 60 * 1000;

export type HealthInput = {
  /** Null for a source run by hand. */
  intervalMs: number | null;
  connectionStatus: ConnectionStatus | null;
  /** The newest finished run's outcome, or null when it has never run. */
  lastOutcome: RunOutcome | null;
  /** When the newest ok or partial run finished. */
  lastGoodAt: Date | null;
};

/**
 * Not Connected when the saved sign-in is missing or expired. Failing when
 * the newest run failed. Current when the newest good run is inside the
 * interval, or the source has no interval. Late otherwise, including a
 * scheduled source that has never run. A partial run counts as good: it
 * brought data in, and its error text says what it left out.
 */
export function sourceHealth(input: HealthInput, now: Date = new Date()): SourceHealth {
  if (input.connectionStatus === "missing" || input.connectionStatus === "expired") return "Not Connected";
  if (input.lastOutcome === "failed") return "Failing";
  if (input.intervalMs === null) return "Current";
  if (input.lastGoodAt && now.getTime() - input.lastGoodAt.getTime() <= input.intervalMs + GRACE_MS) return "Current";
  return "Late";
}

export type SourceStatus = {
  key: string;
  name: string;
  kind: "scheduled" | "webhook" | "manual";
  owner: string | null;
  schedule: string | null;
  enabled: boolean;
  connectionStatus: ConnectionStatus | null;
  lastRunAt: string | null;
  lastOutcome: RunOutcome | null;
  lastError: string | null;
  lastGoodAt: string | null;
  health: SourceHealth;
};

type Row = {
  key: string;
  name: string;
  kind: SourceStatus["kind"];
  owner: string | null;
  schedule: string | null;
  enabled: boolean;
  connection_status: ConnectionStatus | null;
  interval_ms: string | number | null;
  last_run_at: Date | string | null;
  last_outcome: RunOutcome | null;
  last_error: string | null;
  last_good_at: Date | string | null;
};

const isoOrNull = (value: Date | string | null) => (value === null ? null : new Date(value).toISOString());

/** Every data source with its newest run and its health, in name order. */
export async function readSourceHealth(db: Db, now: Date = new Date()): Promise<SourceStatus[]> {
  const { rows } = await db.query<Row>(
    `select s.key, s.name, s.kind, s.owner, s.schedule, s.enabled, s.connection_status,
            extract(epoch from s.refresh_interval) * 1000 as interval_ms,
            last.finished_at as last_run_at, last.outcome as last_outcome, last.error as last_error,
            good.finished_at as last_good_at
       from data_sources s
       left join lateral (
         select finished_at, outcome, error from source_runs
          where source_key = s.key and finished_at is not null
          order by finished_at desc limit 1
       ) last on true
       left join lateral (
         select finished_at from source_runs
          where source_key = s.key and outcome in ('ok', 'partial')
          order by finished_at desc limit 1
       ) good on true
      order by s.name`,
  );
  return rows.map((row) => {
    const lastGoodAt = isoOrNull(row.last_good_at);
    return {
      key: row.key,
      name: row.name,
      kind: row.kind,
      owner: row.owner,
      schedule: row.schedule,
      enabled: row.enabled,
      connectionStatus: row.connection_status,
      lastRunAt: isoOrNull(row.last_run_at),
      lastOutcome: row.last_outcome,
      lastError: row.last_error,
      lastGoodAt,
      health: sourceHealth(
        {
          intervalMs: row.interval_ms === null ? null : Number(row.interval_ms),
          connectionStatus: row.connection_status,
          lastOutcome: row.last_outcome,
          lastGoodAt: lastGoodAt ? new Date(lastGoodAt) : null,
        },
        now,
      ),
    };
  });
}
