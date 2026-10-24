import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { seededDatabase } from "@/test/database";
import { sourceRuns } from "@/test/source-runs";

import { recordRun } from "./runs";
import { refreshSource, runDueSources, type Runner } from "./schedule";

// LA-3049. The one refresh schedule and its lease, against a seeded Postgres
// carrying the five data_sources rows from LA-3048.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`delete from source_runs`);
  await db.query(`update data_sources set lease_token = null, lease_until = null`);
  await db.query(`update data_sources set enabled = (key <> 'vision_discovery'), refresh_interval = interval '1 day' where key <> 'proest_imports'`);
});
afterAll(async () => db?.close());

/** A runner that logs one ok run of `source`, as the real ones do. */
const logging = (source: "autodesk_projects" | "autodesk_connection" | "fireflies_meetings" | "vision_discovery") =>
  vi.fn<Runner>((dbIn) => recordRun(dbIn, source, "schedule", async () => "done"));

async function pastRun(source: string, trigger: string, hoursAgo: number) {
  await db.query(
    `insert into source_runs (source_key, trigger, started_at, finished_at, outcome)
     values ($1, $2, now() - make_interval(hours => $3), now() - make_interval(hours => $3), 'ok')`,
    [source, trigger, hoursAgo],
  );
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => (resolve = done));
  return { promise, resolve };
}

describe("runDueSources", () => {
  it("runs a due source and logs one run for it", async () => {
    const projects = logging("autodesk_projects");
    const reports = await runDueSources(db, { autodesk_projects: projects });
    expect(projects).toHaveBeenCalledTimes(1);
    expect(reports).toContainEqual({ source: "autodesk_projects", status: "ran", result: "done" });
    expect(await sourceRuns(db)).toEqual([
      { source_key: "autodesk_projects", trigger: "schedule", outcome: "ok", rows_added: null, rows_changed: null, error: null, finished: true },
    ]);
  });

  it("skips a source whose interval has not passed since its last scheduled run", async () => {
    await pastRun("autodesk_projects", "schedule", 3);
    const projects = logging("autodesk_projects");
    expect(await runDueSources(db, { autodesk_projects: projects })).toContainEqual({ source: "autodesk_projects", status: "not_due" });
    expect(projects).not.toHaveBeenCalled();
    expect(await sourceRuns(db)).toHaveLength(1);
  });

  it("reads the interval from the source's row, not from code", async () => {
    await pastRun("autodesk_projects", "schedule", 3);
    await db.query(`update data_sources set refresh_interval = interval '2 hours' where key = 'autodesk_projects'`);
    const projects = logging("autodesk_projects");
    await runDueSources(db, { autodesk_projects: projects });
    expect(projects).toHaveBeenCalledTimes(1);
  });

  it("runs a daily source when the hourly cron lands a little before 24 hours have passed", async () => {
    await db.query(
      `insert into source_runs (source_key, trigger, started_at, finished_at, outcome)
       values ('autodesk_projects', 'schedule', now() - interval '23 hours 55 minutes', now() - interval '23 hours 54 minutes', 'ok')`,
    );
    const projects = logging("autodesk_projects");
    await runDueSources(db, { autodesk_projects: projects });
    expect(projects).toHaveBeenCalledTimes(1);
  });

  it("does not count a button run, so a refresh by hand never moves the schedule", async () => {
    await pastRun("autodesk_projects", "button", 1);
    const projects = logging("autodesk_projects");
    await runDueSources(db, { autodesk_projects: projects });
    expect(projects).toHaveBeenCalledTimes(1);
  });

  it("skips a source that is turned off or has no interval", async () => {
    const vision = logging("vision_discovery");
    await db.query(`update data_sources set refresh_interval = null where key = 'autodesk_connection'`);
    const connection = logging("autodesk_connection");
    const reports = await runDueSources(db, { vision_discovery: vision, autodesk_connection: connection });
    expect(vision).not.toHaveBeenCalled();
    expect(connection).not.toHaveBeenCalled();
    expect(reports.map((one) => one.source)).not.toContain("vision_discovery");
  });

  it("keeps going after a source fails, and the failure is logged", async () => {
    const projects = vi.fn<Runner>((dbIn) =>
      recordRun(dbIn, "autodesk_projects", "schedule", () => Promise.reject(new Error("Autodesk said no"))),
    );
    const meetings = logging("fireflies_meetings");
    const reports = await runDueSources(db, { autodesk_projects: projects, fireflies_meetings: meetings });
    expect(reports).toContainEqual({ source: "autodesk_projects", status: "failed", error: "Autodesk said no" });
    expect(reports).toContainEqual({ source: "fireflies_meetings", status: "ran", result: "done" });
    // The lease went back, so a button can run the failed source at once.
    expect((await refreshSource(db, "autodesk_projects", "button", async () => "again")).status).toBe("ran");
  });

  it("names a scheduled source that has no runner instead of passing over it in silence", async () => {
    const reports = await runDueSources(db, {});
    expect(reports).toContainEqual({ source: "autodesk_projects", status: "no_runner" });
  });
});

describe("refreshSource", () => {
  it("makes one run from two overlapping requests for one source", async () => {
    const gate = deferred();
    const work = vi.fn(() => recordRun(db, "fireflies_meetings", "button", () => gate.promise.then(() => "saved")));
    const first = refreshSource(db, "fireflies_meetings", "button", work);
    // The second request arrives once the first holds the lease and is still working.
    await vi.waitFor(() => expect(work).toHaveBeenCalledTimes(1));
    const second = await refreshSource(db, "fireflies_meetings", "button", work);
    expect(second).toEqual({ status: "busy" });
    gate.resolve();
    expect(await first).toEqual({ status: "ran", result: "saved" });
    expect(work).toHaveBeenCalledTimes(1);
    expect(await sourceRuns(db)).toHaveLength(1);
  });

  it("turns the schedule away as busy while a button run holds the source", async () => {
    const gate = deferred();
    const running = refreshSource(db, "autodesk_projects", "button", () => gate.promise);
    await vi.waitFor(async () => {
      const { rows } = await db.query(`select 1 from data_sources where key = 'autodesk_projects' and lease_until > now()`);
      expect(rows).toHaveLength(1);
    });
    const projects = logging("autodesk_projects");
    expect(await runDueSources(db, { autodesk_projects: projects })).toContainEqual({ source: "autodesk_projects", status: "busy" });
    expect(projects).not.toHaveBeenCalled();
    gate.resolve();
    await running;
  });

  it("lets a run claim a source whose earlier lease ran out", async () => {
    await db.query(
      `update data_sources set lease_token = gen_random_uuid(), lease_until = now() - interval '1 minute' where key = 'autodesk_projects'`,
    );
    expect((await refreshSource(db, "autodesk_projects", "button", async () => "ok")).status).toBe("ran");
  });

  it("gives the lease back when the work throws", async () => {
    const cause = new Error("down");
    await expect(refreshSource(db, "autodesk_projects", "button", () => Promise.reject(cause))).rejects.toBe(cause);
    const { rows } = await db.query<{ lease_until: Date | null }>(`select lease_until from data_sources where key = 'autodesk_projects'`);
    expect(rows[0].lease_until).toBeNull();
  });
});
