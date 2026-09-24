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
      { seq: 4, name: "read_judgment_rules", status: "succeeded" },
      { seq: 5, name: "compute_rom", status: "succeeded" },
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

// LA-1016: the markup choices ride on the ROM request, are recorded with the
// run's answers, and price the waterfall below the trade subtotal.
describe("POST /api/rom markups", () => {
  type MarkupRun = { answers: { markups?: Record<string, unknown> } };
  const markupRuns = () =>
    db.query<MarkupRun>(`select answers from runs order by started_at`).then((r) => r.rows);

  it("records the default choices when the request names none", async () => {
    const response = await post({ projectId: TEST_PROJECT_ID });
    expect(response.status).toBe(200);
    const { rom } = await response.json();

    const [run] = await markupRuns();
    expect(run.answers.markups).toEqual({ setup: "both", method: "pct_of_subtotal" });

    // No imported budget records GRs/GCs yet, so the line is TBD, not guessed.
    expect(rom.markups.generalConditions.tbd).toBe(true);
    // Fee reads Matt's recorded 3.25 percent.
    expect(rom.markups.fee.source).toBe("parameter");
    expect(rom.markups.fee.low).toBe(Math.round(rom.markups.subtotal.low * 0.0325));
    expect(rom.parameters["insurance.rate"].value).toBe(0.054);
  });

  it("records the user's choices and overrides with the run", async () => {
    const markups = {
      setup: "gc_only",
      method: "pct_of_subtotal",
      overrideRate: 0.08,
      feeRate: 0.04,
      insuranceRate: 0.02,
    };
    const response = await post({ projectId: TEST_PROJECT_ID, markups });
    expect(response.status).toBe(200);
    const { rom } = await response.json();

    const [run] = await markupRuns();
    expect(run.answers.markups).toEqual(markups);
    expect(rom.markups.generalConditions.label).toBe("General Conditions");
    expect(rom.markups.generalConditions.source).toBe("override");
    expect(rom.markups.fee.source).toBe("override");
  });

  it("prices the staffing method off the rate tables and records the plan", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from gc_staffing_rates where role = 'Project Manager' and days_per_week = 5`,
    );
    const markups = {
      setup: "both",
      method: "staffing_duration",
      durationWeeks: 10,
      staff: [{ rateId: rows[0].id }],
      fieldOffice: [],
    };
    const response = await post({ projectId: TEST_PROJECT_ID, markups });
    expect(response.status).toBe(200);
    const { rom } = await response.json();

    // Project Manager, 5 days a week, $5,200 a week, for 10 weeks.
    expect(rom.markups.generalConditions.low).toBe(52_000);
    const [run] = await markupRuns();
    expect(run.answers.markups).toEqual(markups);
  });

  it("uses recorded GRs/GCs history for the chosen setup", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select id from canonical_work_items order by sort_order limit 1`,
    );
    const { rows: imports } = await db.query<{ id: string }>(
      `insert into cost_imports (source_project_id, export_label, provenance_kind, uploaded_by)
       values ($1, 'synthetic export', 'actuals', 'automated test') returning id`,
      [TEST_PROJECT_ID],
    );
    const { rows: lines } = await db.query<{ id: string }>(
      `insert into cost_import_lines
         (cost_import_id, row_number, raw_description, value_usd_per_gsf,
          candidate_canonical_item_id, candidate_score, status)
       values ($1, 1, 'General Conditions & General Requirements', 0.25, $2, 0, 'markup')
       returning id`,
      [imports[0].id, rows[0].id],
    );
    await db.query(
      `insert into markup_history
         (project_id, setup, usd_per_gsf, pct_of_subtotal, cost_import_line_id, recorded_by, export_label)
       values ($1, 'both', 0.25, 0.25, $2, 'automated test', 'synthetic export')`,
      [TEST_PROJECT_ID, lines[0].id],
    );

    const { rom } = await (await post({ projectId: TEST_PROJECT_ID })).json();
    expect(rom.markups.generalConditions.tbd).toBe(false);
    expect(rom.markups.generalConditions.low).toBe(Math.round(rom.markups.subtotal.low * 0.25));
    expect(rom.markups.generalConditions.basis).toBe(
      "25.00% of subtotal, from 1 job: Synthetic test project",
    );
  });

  it("refuses bad markup choices without opening a run", async () => {
    for (const markups of [
      { setup: "everything" },
      { method: "guess" },
      { feeRate: 3.25 },
      { method: "staffing_duration" },
      { method: "pct_of_subtotal", overrideRate: 15 },
    ]) {
      const response = await post({ projectId: TEST_PROJECT_ID, markups });
      expect(response.status).toBe(400);
    }
    expect(await runs()).toEqual([]);
  });

  it("keeps the five recorded steps", async () => {
    await post({ projectId: TEST_PROJECT_ID, markups: { setup: "gr_only", method: "usd_per_gsf" } });
    expect((await steps()).map((s) => s.name)).toEqual([
      "read_answers",
      "read_benchmarks",
      "read_parameters",
      "read_judgment_rules",
      "compute_rom",
    ]);
  });
});

// LA-1028: the intake's yes/no scope questions actually switch a canonical
// item on or off. The seeded migrations already carry the real map
// (branch_gate_items), so these tests give a project a benchmark on a real
// gated cost code (demolition closes item 1) rather than the synthetic
// "TEST" code the other tests in this file use.
describe("POST /api/rom scope gates", () => {
  async function benchmarkOnItemOne(): Promise<void> {
    const { rows } = await db.query<{ id: string }>(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_recorded_by, provenance_recorded_at)
       values
         ('1', 'Demolition — site and structure', 'usd_per_gsf', 1,
          'multifamily', 'new', 1, 'reviewed_judgment', 'automated test', date '2026-08-27')
       returning id`,
    );
    await db.query(
      `insert into benchmark_source_projects (benchmark_id, project_id) values ($1, $2)`,
      [rows[0].id, TEST_PROJECT_ID],
    );
  }

  it("prices the item present when the project record has never been asked", async () => {
    await benchmarkOnItemOne();

    const { rom } = await (await post({ projectId: TEST_PROJECT_ID })).json();
    const item1 = rom.lines.find((l: { costCode: string }) => l.costCode === "1");

    expect(item1.gateStatus).toBe("assumed_present");
    expect(item1.low).toBeGreaterThan(0);
    expect(rom.assumedPresentItems.map((i: { costCode: string }) => i.costCode)).toContain("1");
  });

  it("removes the item from the total when the project record says no", async () => {
    await benchmarkOnItemOne();
    await db.query(`update projects set demolition_gate = 'no' where id = $1`, [TEST_PROJECT_ID]);

    const { rom } = await (await post({ projectId: TEST_PROJECT_ID })).json();
    const item1 = rom.lines.find((l: { costCode: string }) => l.costCode === "1");

    expect(item1.gateStatus).toBe("not_in_job");
    expect(item1.low).toBe(0);
    expect(rom.notInThisJob.map((i: { costCode: string }) => i.costCode)).toContain("1");
  });

  it("lets the Scope module's gates override the project record for one run", async () => {
    await benchmarkOnItemOne();
    await db.query(`update projects set demolition_gate = 'no' where id = $1`, [TEST_PROJECT_ID]);

    const { rom } = await (
      await post({ projectId: TEST_PROJECT_ID, gates: { demolition: "yes" } })
    ).json();
    const item1 = rom.lines.find((l: { costCode: string }) => l.costCode === "1");

    expect(item1.gateStatus).toBe("priced");

    const [run] = await runs();
    expect((run.answers as { branchGates?: Record<string, string> }).branchGates?.demolition).toBe(
      "yes",
    );
  });

  it("shows the item as TBD when the Scope module sends don't know", async () => {
    await benchmarkOnItemOne();

    const { rom } = await (
      await post({ projectId: TEST_PROJECT_ID, gates: { demolition: "dont_know" } })
    ).json();
    const item1 = rom.lines.find((l: { costCode: string }) => l.costCode === "1");

    expect(item1.gateStatus).toBe("tbd");
    expect(item1.low).toBe(0);
  });

  it("refuses a gate answer that is not yes, no, or don't know", async () => {
    const response = await post({ projectId: TEST_PROJECT_ID, gates: { demolition: "maybe" } });
    expect(response.status).toBe(400);
    expect(await runs()).toEqual([]);
  });
});
