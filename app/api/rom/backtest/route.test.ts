import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import type { BacktestResult } from "@/lib/rom/backtest";
import { JOB_A, JOB_B, loadTwoJobs, tableCounts } from "@/test/backtest-fixture";
import { seededDatabase } from "@/test/database";

// LA-23's API test: the shipped GET route returns the leave-one-out report.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET } = await import("./route");

function request(headers: HeadersInit = {}) {
  return GET(new Request("http://localhost/api/rom/backtest", { headers }));
}

const DATABASE_SETUP_MS = 60_000;

beforeEach(async () => {
  db = await seededDatabase();
}, DATABASE_SETUP_MS);

afterEach(async () => {
  await db.close();
}, DATABASE_SETUP_MS);

describe("GET /api/rom/backtest", () => {
  it("returns the report for every job with an approved import, and writes nothing", async () => {
    await loadTwoJobs(db);
    const before = await tableCounts(db);

    const response = await request();
    expect(response.status).toBe(200);
    const { backtest } = (await response.json()) as { backtest: BacktestResult };

    expect(backtest.projects.map((p) => p.projectId)).toEqual([JOB_A, JOB_B]);
    expect(backtest.projectCount).toBe(2);
    expect(backtest.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(await tableCounts(db)).toEqual(before);
  }, DATABASE_SETUP_MS);

  it("rejects a signed-out request", async () => {
    const response = await request({ "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });
});
