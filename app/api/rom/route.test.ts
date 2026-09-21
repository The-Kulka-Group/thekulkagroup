import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// The integration seam LA-9 names: the site's API route against a seeded test
// database, asserting the run lifecycle. The database is a real Postgres built
// from this repo's migrations, so the schema under test is the shipped one.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

// Imported after the mock so the route picks it up.
const { POST } = await import("./route");

function post(body: unknown) {
  return POST(
    new Request("http://localhost/api/rom", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  );
}

function unauthenticatedPost() {
  return POST(
    new Request("http://localhost/api/rom", {
      method: "POST",
      headers: { "x-kulka-test-auth": "signed-out" },
      body: JSON.stringify({ projectId: TEST_PROJECT_ID }),
    }),
  );
}

type RunRow = {
  id: string;
  status: string;
  skill: string;
  rom: { lines: unknown[] } | null;
  answers: { grossSquareFeet?: number };
  error: string | null;
  finished_at: Date | null;
  snapshot_hash: string | null;
};

const runs = () =>
  db.query<RunRow>(`select * from runs order by started_at`).then((r) => r.rows);
const steps = () =>
  db
    .query<{ name: string; status: string; seq: number }>(
      `select name, status, seq from run_steps order by seq`,
    )
    .then((r) => r.rows);

/** A real project the engine cannot budget, because nobody recorded its area. */
async function unbudgetableProject(): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into projects (name, project_type, construction_kind)
     values ('Area unknown (example)', 'multifamily', 'new')
     returning id`,
  );
  return rows[0].id;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom", () => {
  it("rejects a signed-out request before opening the database", async () => {
    const response = await unauthenticatedPost();
    expect(response.status).toBe(401);
    expect(await runs()).toEqual([]);
  });

  it("returns a ranged line with a confidence flag for the test project", async () => {
    const response = await post({ projectId: TEST_PROJECT_ID });
    expect(response.status).toBe(200);

    const { rom } = await response.json();
    expect(rom.lines).toHaveLength(1);

    const [line] = rom.lines;
    expect(line.low).toBeLessThan(line.high);
    expect(["high", "medium", "low"]).toContain(line.confidence);
    expect(line.comparableCount).toBe(1);
    expect(line.comparables).toHaveLength(1);
    expect(line.comparables[0].kind).toBe("reviewed_judgment");
    expect(line.comparables[0].sourceProjectIds).toEqual([TEST_PROJECT_ID]);
  });

  it("computes with the recorded engine parameters and lists them on the ROM", async () => {
    const { rom } = await (await post({ projectId: TEST_PROJECT_ID })).json();

    expect(rom.parameters["weight.actuals"].value).toBe(5);
    expect(rom.parameters["weight.actuals"].provenance.recordedBy).toBe("Matt Nicosia");
    expect(rom.parameters["spread.low"].provenance.kind).toBe("reviewed_judgment");
  });

  it("records the snapshot hash on the run, the same for the same data", async () => {
    await post({ projectId: TEST_PROJECT_ID });
    await post({ projectId: TEST_PROJECT_ID });

    const [first, second] = await runs();
    expect(first.snapshot_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(second.snapshot_hash).toBe(first.snapshot_hash);
  });

  it("changes the snapshot hash when the data behind the ROM changes", async () => {
    await post({ projectId: TEST_PROJECT_ID });
    await db.query(`update engine_parameters set value = 0.11 where name = 'spread.high'`);
    await post({ projectId: TEST_PROJECT_ID });

    const [first, second] = await runs();
    expect(second.snapshot_hash).not.toBe(first.snapshot_hash);
  });

  it("fails the run, naming the parameter, when a needed engine parameter is missing", async () => {
    await db.query(`delete from engine_parameters where name = 'weight.reviewed_judgment'`);

    const response = await post({ projectId: TEST_PROJECT_ID });
    expect(response.status).toBe(422);

    const [run] = await runs();
    expect(run.status).toBe("failed");
    expect(run.error).toContain("weight.reviewed_judgment");
  });

  it("writes a finished run record holding the ROM and the answers it used", async () => {
    const { runId } = await (await post({ projectId: TEST_PROJECT_ID })).json();

    const [run] = await runs();
    expect(run).toMatchObject({ status: "succeeded", skill: "rom_tier1", error: null });
    expect(run.rom?.lines).toHaveLength(1);
    expect(run.answers.grossSquareFeet).toBe(1000);
    expect(run.finished_at).not.toBeNull();
    expect(runId).toBeTruthy();
  });

  it("records every step in order, each one succeeded", async () => {
    await post({ projectId: TEST_PROJECT_ID });

    expect(await steps()).toEqual([
      { seq: 1, name: "read_answers", status: "succeeded" },
      { seq: 2, name: "read_benchmarks", status: "succeeded" },
      { seq: 3, name: "read_parameters", status: "succeeded" },
      { seq: 4, name: "compute_rom", status: "succeeded" },
    ]);
  });

  it("opens no run at all for a project that does not exist", async () => {
    const missing = "00000000-0000-4000-8000-0000000000ff";
    const response = await post({ projectId: missing });

    expect(response.status).toBe(404);
    expect(await runs()).toEqual([]);
  });

  it("leaves a failed run record behind when the project cannot be budgeted", async () => {
    const projectId = await unbudgetableProject();

    const response = await post({ projectId });
    expect(response.status).toBe(422);

    const [run] = await runs();
    expect(run.status).toBe("failed");
    expect(run.error).toContain("gross square feet");
    expect(run.finished_at).not.toBeNull();
    expect(run.rom).toBeNull();
  });

  it("marks the step that failed and does not run the ones after it", async () => {
    await post({ projectId: await unbudgetableProject() });

    expect(await steps()).toEqual([{ seq: 1, name: "read_answers", status: "failed" }]);
  });

  it("hands back the run id on a failure so the caller can go and read it", async () => {
    const response = await post({ projectId: await unbudgetableProject() });
    const { runId } = await response.json();

    const [run] = await runs();
    expect(runId).toBe(run.id);
  });

  it("rejects a body with no projectId without opening a run", async () => {
    const response = await post({});

    expect(response.status).toBe(400);
    expect(await runs()).toEqual([]);
  });

  it("rejects a body that is not JSON without opening a run", async () => {
    const response = await POST(
      new Request("http://localhost/api/rom", { method: "POST", body: "not json" }),
    );

    expect(response.status).toBe(400);
    expect(await runs()).toEqual([]);
  });
});

describe("benchmark provenance schema", () => {
  it("rejects imported cost data with no export named", async () => {
    await expect(
      db.query(
        `insert into benchmarks
           (cost_code, label, unit, value, project_type, construction_kind,
            comparable_count, provenance_kind, provenance_recorded_by,
            provenance_recorded_at)
         values
           ('TEST-B', 'Synthetic test line', 'usd_per_gsf', 1,
            'multifamily', 'new', 1, 'actuals', 'automated test',
            date '2026-08-27')`,
      ),
    ).rejects.toThrow();
  });

  it("rejects a benchmark source that names a project that does not exist", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_recorded_by,
          provenance_recorded_at)
       values
         ('TEST-B', 'Synthetic test line', 'usd_per_gsf', 1,
          'multifamily', 'new', 1, 'reviewed_judgment', 'automated test',
          date '2026-08-27')
       returning id`,
    );

    await expect(
      db.query(
        `insert into benchmark_source_projects (benchmark_id, project_id)
         values ($1, '00000000-0000-4000-8000-0000000000ff')`,
        [rows[0].id],
      ),
    ).rejects.toThrow();
  });
});
