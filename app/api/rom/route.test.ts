import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { FIXTURE_PROJECT_ID, seededDatabase } from "@/test/database";

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

type RunRow = {
  id: string;
  status: string;
  skill: string;
  rom: { lines: unknown[] } | null;
  answers: { grossSquareFeet?: number };
  error: string | null;
  finished_at: Date | null;
};

const runs = () => db.query<RunRow>(`select * from runs`).then((r) => r.rows);
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
  it("returns a ranged line with a confidence flag for the fixture project", async () => {
    const response = await post({ projectId: FIXTURE_PROJECT_ID });
    expect(response.status).toBe(200);

    const { rom } = await response.json();
    expect(rom.lines).toHaveLength(1);

    const [line] = rom.lines;
    expect(line.low).toBeLessThan(line.high);
    expect(["high", "medium", "low"]).toContain(line.confidence);
    expect(line.provenance.kind).toBe("fixture");
  });

  it("says in its assumptions that the ROM rests on fixture data", async () => {
    const { rom } = await (await post({ projectId: FIXTURE_PROJECT_ID })).json();

    expect(rom.assumptions.join(" ")).toContain("fixture");
  });

  it("writes a finished run record holding the ROM and the answers it used", async () => {
    const { runId } = await (await post({ projectId: FIXTURE_PROJECT_ID })).json();

    const [run] = await runs();
    expect(run).toMatchObject({ status: "succeeded", skill: "rom_tier1", error: null });
    expect(run.rom?.lines).toHaveLength(1);
    expect(run.answers.grossSquareFeet).toBe(120000);
    expect(run.finished_at).not.toBeNull();
    expect(runId).toBeTruthy();
  });

  it("records every step in order, each one succeeded", async () => {
    await post({ projectId: FIXTURE_PROJECT_ID });

    expect(await steps()).toEqual([
      { seq: 1, name: "read_answers", status: "succeeded" },
      { seq: 2, name: "read_benchmarks", status: "succeeded" },
      { seq: 3, name: "compute_rom", status: "succeeded" },
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
