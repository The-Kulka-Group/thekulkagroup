import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import type { RunRecord, RunSummary } from "@/lib/rom/run-records";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-16's API test. A run is started through the shipped POST route, then read
// back through the GET routes the run view uses, so what the screens read is
// what the run actually recorded.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("../route");
const { GET: listRunsRoute } = await import("./route");
const { GET: readRunRoute } = await import("./[runId]/route");

function startRun(projectId = TEST_PROJECT_ID) {
  return POST(
    new Request("http://localhost/api/rom", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),
  ).then((response) => response.json() as Promise<{ runId: string }>);
}

function listRequest(query = "", headers: HeadersInit = {}) {
  return listRunsRoute(new Request(`http://localhost/api/rom/runs${query}`, { headers }));
}

function readRequest(runId: string, headers: HeadersInit = {}) {
  return readRunRoute(new Request(`http://localhost/api/rom/runs/${runId}`, { headers }), {
    params: Promise.resolve({ runId }),
  });
}

async function listed(query = ""): Promise<RunSummary[]> {
  const response = await listRequest(query);
  expect(response.status).toBe(200);
  return (await response.json()).runs;
}

async function read(runId: string): Promise<RunRecord> {
  const response = await readRequest(runId);
  expect(response.status).toBe(200);
  return (await response.json()).run;
}

/** A real project the engine cannot budget, because nobody recorded its area. */
async function unbudgetableProject(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into projects (name, project_type, construction_kind)
     values ('Area unknown (example)', 'multifamily', 'new')
     returning id`,
  );
  return rows[0].id;
}

// Building an in-process Postgres and applying every migration to it takes
// longer than vitest's default hook timeout on a cold start.
const DATABASE_SETUP_MS = 60_000;

beforeEach(async () => {
  db = await seededDatabase();
}, DATABASE_SETUP_MS);

afterEach(async () => {
  await db.close();
}, DATABASE_SETUP_MS);

describe("GET /api/rom/runs/[runId]", () => {
  it("holds every step of a finished run, complete and in order", async () => {
    const { runId } = await startRun();
    const run = await read(runId);

    expect(run.steps.map((step) => [step.seq, step.name, step.status])).toEqual([
      [1, "read_answers", "succeeded"],
      [2, "read_benchmarks", "succeeded"],
      [3, "read_parameters", "succeeded"],
      [4, "read_judgment_rules", "succeeded"],
      [5, "compute_rom", "succeeded"],
    ]);

    for (const step of run.steps) {
      expect(step.finishedAt).not.toBeNull();
      expect(new Date(step.finishedAt!).getTime()).toBeGreaterThanOrEqual(
        new Date(step.startedAt).getTime(),
      );
    }

    const starts = run.steps.map((step) => new Date(step.startedAt).getTime());
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it("holds the inputs and the outputs of a finished run", async () => {
    const { runId } = await startRun();
    const run = await read(runId);

    expect(run).toMatchObject({
      id: runId,
      projectId: TEST_PROJECT_ID,
      projectName: "Synthetic test project",
      skill: "rom_tier1",
      status: "succeeded",
      error: null,
      stepCount: 5,
    });
    expect(run.finishedAt).not.toBeNull();
    expect(run.answers?.grossSquareFeet).toBe(1000);
    expect(run.rom?.lines).toHaveLength(1);
    expect(run.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the failed step and the reason on a run that stopped", async () => {
    const { runId } = await startRun(await unbudgetableProject());
    const run = await read(runId);

    expect(run.status).toBe("failed");
    expect(run.error).toContain("gross square feet");
    expect(run.steps.map((step) => [step.seq, step.name, step.status])).toEqual([
      [1, "read_answers", "failed"],
    ]);
    expect(run.rom).toBeNull();
  });

  it("gives 404 for a run id that names no run", async () => {
    const response = await readRequest("00000000-0000-4000-8000-0000000000ff");
    expect(response.status).toBe(404);
  });

  it("gives 404 for an id that is not a run id at all", async () => {
    const response = await readRequest("not-a-run");
    expect(response.status).toBe(404);
  });

  it("rejects a signed-out request", async () => {
    const response = await readRequest(TEST_PROJECT_ID, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });
});

describe("GET /api/rom/runs", () => {
  it("lists nothing before any ROM has run", async () => {
    expect(await listed()).toEqual([]);
  });

  it("lists past runs newest first, so any one can be reopened", async () => {
    const first = await startRun();
    const second = await startRun();

    const runs = await listed();
    expect(runs.map((run) => run.id)).toEqual([second.runId, first.runId]);
    expect(runs[0]).toMatchObject({
      projectName: "Synthetic test project",
      status: "succeeded",
      stepCount: 5,
    });

    expect((await read(runs[1].id)).id).toBe(first.runId);
  });

  // LA-1335: a run is named by how many questions its flow recorded.
  it("counts the answers a run's flow recorded, and gives null for a run with no flow", async () => {
    const plain = await startRun();
    const flowed = await startRun();
    await db.query(
      `update runs set answers = jsonb_set(answers, '{flow}', '{"responses": {"a": "1", "b": "2", "c": "3"}}')
        where id = $1`,
      [flowed.runId],
    );

    const byId = new Map((await listed()).map((run) => [run.id, run.answerCount]));
    expect(byId.get(plain.runId)).toBeNull();
    expect(byId.get(flowed.runId)).toBe(3);
  });

  it("lists a failed run beside a finished one", async () => {
    await startRun();
    await startRun(await unbudgetableProject());

    expect((await listed()).map((run) => run.status)).toEqual(["failed", "succeeded"]);
  });

  it("returns no more runs than the limit asks for", async () => {
    await startRun();
    await startRun();

    expect(await listed("?limit=1")).toHaveLength(1);
  });

  it("rejects a signed-out request", async () => {
    const response = await listRequest("", { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });
});
