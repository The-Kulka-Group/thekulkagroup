import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";
import { sourceRuns } from "@/test/source-runs";

// LA-3049. The one refresh schedule against a seeded Postgres. `fetch` is
// stubbed, so the real Fireflies client runs with no network, and Autodesk is
// left unset, so its two sources log why they could not run.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { setBriefClientForTests } = await import("@/lib/meetings/brief");
const cron = await import("./route");
const fireflies = vi.fn();

const run = (auth?: string) =>
  cron.GET(new Request("http://localhost/api/sources/cron", { headers: auth ? { authorization: auth } : {} }));

const answer = (data: unknown) =>
  new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`delete from source_runs`);
  await db.query(`update data_sources set lease_token = null, lease_until = null`);
  vi.stubEnv("CRON_SECRET", "test-cron-secret");
  vi.stubEnv("FIREFLIES_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  for (const name of ["APS_CLIENT_ID", "APS_CLIENT_SECRET", "ACC_ACCOUNT_ID", "APS_USER_CLIENT_ID", "APS_USER_CLIENT_SECRET"]) {
    vi.stubEnv(name, "");
  }
  setBriefClientForTests(null);
  fireflies.mockReset();
  fireflies.mockImplementation(async () => answer({ transcripts: [] }));
  vi.stubGlobal("fetch", fireflies);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => db?.close());

describe("GET /api/sources/cron", () => {
  it("runs only with Vercel's cron secret", async () => {
    expect((await run()).status).toBe(401);
    expect((await run("Bearer wrong")).status).toBe(401);
    expect(await sourceRuns(db)).toEqual([]);
  });

  it("runs every due source once, logs a run for each, and leaves the source that is off alone", async () => {
    const response = await run("Bearer test-cron-secret");
    expect(response.status).toBe(200);
    expect((await response.json()).sources).toEqual([
      { source: "autodesk_projects", status: "failed", error: "Autodesk is not set up." },
      { source: "autodesk_connection", status: "failed", error: "The Autodesk sign-in is not set up." },
      { source: "fireflies_meetings", status: "ran", result: { found: 0, added: 0, briefed: 0 } },
    ]);
    expect(await sourceRuns(db)).toEqual(
      expect.arrayContaining([
        { source_key: "autodesk_projects", trigger: "schedule", outcome: "failed", rows_added: null, rows_changed: null, error: "Autodesk is not set up.", finished: true },
        { source_key: "autodesk_connection", trigger: "schedule", outcome: "failed", rows_added: null, rows_changed: null, error: "The Autodesk sign-in is not set up.", finished: true },
        { source_key: "fireflies_meetings", trigger: "schedule", outcome: "ok", rows_added: 0, rows_changed: 0, error: null, finished: true },
      ]),
    );
    expect(await sourceRuns(db)).toHaveLength(3);
  });

  it("skips every source on the next hour, since none is due again for a day", async () => {
    await run("Bearer test-cron-secret");
    fireflies.mockClear();
    const response = await run("Bearer test-cron-secret");
    expect((await response.json()).sources).toEqual([
      { source: "autodesk_projects", status: "not_due" },
      { source: "autodesk_connection", status: "not_due" },
      { source: "fireflies_meetings", status: "not_due" },
    ]);
    expect(fireflies).not.toHaveBeenCalled();
    expect(await sourceRuns(db)).toHaveLength(3);
  });
});
