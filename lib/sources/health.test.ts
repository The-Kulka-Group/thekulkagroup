import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seededDatabase } from "@/test/database";
import { sourceRuns } from "@/test/source-runs";

import { GRACE_MS, readSourceHealth, sourceHealth } from "./health";
import { recordRun } from "./runs";

// LA-3048. The health rule on its own, then the run helper and the health read
// against a seeded Postgres built from the migrations.

const DAY = 86_400_000;
const NOW = new Date("2026-10-24T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("sourceHealth", () => {
  const daily = { intervalMs: DAY, connectionStatus: null, lastOutcome: "ok", lastGoodAt: ago(DAY) } as const;

  it("is Current when the last good run is inside the interval and its grace", () => {
    expect(sourceHealth(daily, NOW)).toBe("Current");
    expect(sourceHealth({ ...daily, lastGoodAt: ago(DAY + GRACE_MS) }, NOW)).toBe("Current");
  });

  it("is Late past the interval, or when a scheduled source has never run", () => {
    expect(sourceHealth({ ...daily, lastGoodAt: ago(DAY + GRACE_MS + 1) }, NOW)).toBe("Late");
    expect(sourceHealth({ ...daily, lastOutcome: null, lastGoodAt: null }, NOW)).toBe("Late");
  });

  it("is Failing when the newest run failed, even with a good run inside the interval", () => {
    expect(sourceHealth({ ...daily, lastOutcome: "failed", lastGoodAt: ago(60_000) }, NOW)).toBe("Failing");
  });

  it("is Not Connected when the sign-in is missing or expired, before anything else", () => {
    expect(sourceHealth({ ...daily, connectionStatus: "missing" }, NOW)).toBe("Not Connected");
    expect(sourceHealth({ ...daily, connectionStatus: "expired", lastOutcome: "failed" }, NOW)).toBe("Not Connected");
    expect(sourceHealth({ ...daily, connectionStatus: "connected" }, NOW)).toBe("Current");
  });

  it("counts a partial run as good and never calls a hand-run source late", () => {
    expect(sourceHealth({ ...daily, lastOutcome: "partial" }, NOW)).toBe("Current");
    expect(sourceHealth({ intervalMs: null, connectionStatus: null, lastOutcome: null, lastGoodAt: null }, NOW)).toBe("Current");
  });
});

describe("recordRun and readSourceHealth", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;

  beforeAll(async () => {
    db = await seededDatabase();
  }, 60_000);
  beforeEach(async () => {
    await db.query(`delete from source_runs`);
    await db.query(`update data_sources set connection_status = 'connected' where key = 'autodesk_connection'`);
  });
  afterAll(async () => db?.close());

  const run = (key: string, outcome: string, finishedAgo: number) =>
    db.query(
      `insert into source_runs (source_key, trigger, started_at, finished_at, outcome)
       values ($1, 'schedule', $2, $2, $3)`,
      [key, ago(finishedAgo).toISOString(), outcome],
    );

  it("lists the five sources the migration seeds", async () => {
    const sources = await readSourceHealth(db, NOW);
    expect(sources.map((one) => [one.key, one.kind, one.enabled, one.schedule])).toEqual([
      ["autodesk_connection", "scheduled", true, "0 10 * * *"],
      ["autodesk_projects", "scheduled", true, "0 10 * * *"],
      ["fireflies_meetings", "webhook", true, "0 10 * * *"],
      ["proest_imports", "manual", true, null],
      ["vision_discovery", "scheduled", false, null],
    ]);
  });

  it("gives each source its health from its own runs", async () => {
    await run("autodesk_projects", "ok", 3 * 3600_000);
    await run("fireflies_meetings", "ok", 3 * DAY);
    await run("proest_imports", "ok", 2 * 3600_000);
    await run("proest_imports", "failed", 3600_000);
    await db.query(`update data_sources set connection_status = 'expired' where key = 'autodesk_connection'`);
    const health = Object.fromEntries((await readSourceHealth(db, NOW)).map((one) => [one.key, one.health]));
    expect(health).toEqual({
      autodesk_connection: "Not Connected",
      autodesk_projects: "Current",
      fireflies_meetings: "Late",
      proest_imports: "Failing",
      vision_discovery: "Late",
    });
  });

  it("writes an ok run with its counts and hands back the result", async () => {
    const result = await recordRun(db, "autodesk_projects", "button", async () => ({ jobs: 3 }), ({ jobs }) => ({ added: jobs, changed: 0 }));
    expect(result).toEqual({ jobs: 3 });
    expect(await sourceRuns(db)).toEqual([
      { source_key: "autodesk_projects", trigger: "button", outcome: "ok", rows_added: 3, rows_changed: 0, error: null, finished: true },
    ]);
  });

  it("writes a failed run with the error and throws the same error again", async () => {
    const cause = new Error("Autodesk said no.");
    await expect(recordRun(db, "autodesk_projects", "schedule", async () => Promise.reject(cause))).rejects.toBe(cause);
    expect(await sourceRuns(db)).toEqual([
      { source_key: "autodesk_projects", trigger: "schedule", outcome: "failed", rows_added: null, rows_changed: null, error: "Autodesk said no.", finished: true },
    ]);
  });

  it("still runs the work and returns its result when the log cannot be written", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await recordRun(db, "not_a_source" as never, "button", async () => "done");
    expect(result).toBe("done");
    expect(await sourceRuns(db)).toEqual([]);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
