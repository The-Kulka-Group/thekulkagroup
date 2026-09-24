import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runLeaveOneOutBacktest } from "@/lib/rom/backtest";
import { JOB_A, JOB_B, loadTwoJobs, tableCounts } from "@/test/backtest-fixture";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-23's library test: two synthetic jobs loaded as approved imports, each
// backtested against a snapshot that leaves the job itself out.

let db: Awaited<ReturnType<typeof seededDatabase>>;

// Building an in-process Postgres and applying every migration to it takes
// longer than vitest's default hook timeout on a cold start.
const DATABASE_SETUP_MS = 60_000;

beforeEach(async () => {
  db = await seededDatabase();
}, DATABASE_SETUP_MS);

afterEach(async () => {
  await db.close();
}, DATABASE_SETUP_MS);

describe("runLeaveOneOutBacktest", () => {
  it("prices each job only from the others and compares it to its own budget", async () => {
    await loadTwoJobs(db);
    const report = await runLeaveOneOutBacktest(db);

    // The seeded test project has a benchmark but no import, so it is not a job.
    expect(report.projects.map((p) => p.projectId)).toEqual([JOB_A, JOB_B]);
    const [a, b] = report.projects;

    // A's X1 comes from B's $70/SF on A's 2,000 SF, never from A's own $50.
    const aX1 = a.lines.find((l) => l.costCode === "X1")!;
    expect(aX1.predicted.midpoint).toBe(140000);
    expect(aX1.actual).toBe(100000);
    expect(a.pricedFrom).toEqual([TEST_PROJECT_ID, JOB_B].sort());
    expect(a.pricedFrom).not.toContain(JOB_A);
    // X2 is only B's, so A's ROM predicts it and A's budget has no such line.
    expect(a.lines.find((l) => l.costCode === "X2")).toMatchObject({
      presence: "predicted_only",
      predicted: { midpoint: 20000 },
      actual: 0,
    });
    // The GRs/GCs line was routed to markup, so it is not trade cost.
    expect(a.actual).toBe(100000);

    // B's X1 comes from A's $50/SF on B's 1,000 SF.
    expect(b.lines.find((l) => l.costCode === "X1")!.predicted.midpoint).toBe(50000);
    expect(b.pricedFrom).toEqual([TEST_PROJECT_ID, JOB_A].sort());
    // Nobody else has X2, so B's budget carries it with nothing predicting it.
    expect(b.lines.find((l) => l.costCode === "X2")).toMatchObject({
      presence: "budget_only",
      predictedStatus: "not_predicted",
      actual: 10000,
    });
    expect(b.actual).toBe(80000);

    expect(report.projectCount).toBe(2);
    expect(report.passBarPercent).toBe(10);
    expect(report.projectNames[JOB_A]).toBe("Job A (synthetic)");
    expect(report.projectNames[TEST_PROJECT_ID]).toBe("Synthetic test project");
  }, DATABASE_SETUP_MS);

  it("writes nothing", async () => {
    await loadTwoJobs(db);
    const before = await tableCounts(db);

    await runLeaveOneOutBacktest(db);

    expect(await tableCounts(db)).toEqual(before);
  }, DATABASE_SETUP_MS);

  it("gives the same report and hash for the same rows", async () => {
    await loadTwoJobs(db);

    const first = await runLeaveOneOutBacktest(db);
    const second = await runLeaveOneOutBacktest(db);

    expect(first.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toEqual(first);
  }, DATABASE_SETUP_MS);

  it("reports no jobs when no import has been approved", async () => {
    const report = await runLeaveOneOutBacktest(db);

    expect(report.projectCount).toBe(0);
    expect(report.passingCount).toBe(0);
    expect(report.worstMisses).toEqual([]);
  }, DATABASE_SETUP_MS);
});
