import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-18's API seam: the drill-down payload for a finished run, read against a
// real Postgres built from this repo's migrations.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("../route");
const { GET } = await import("./route");

async function runRom(projectId = TEST_PROJECT_ID): Promise<string> {
  const response = await POST(
    new Request("http://localhost/api/rom", {
      method: "POST",
      body: JSON.stringify({ projectId }),
    }),
  );
  const { runId } = await response.json();
  return runId;
}

function get(runId: string, headers: HeadersInit = {}) {
  return GET(
    new Request(`http://localhost/api/rom/provenance?runId=${runId}`, { headers }),
  );
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("GET /api/rom/provenance", () => {
  it("rejects a signed-out request", async () => {
    const response = await get(await runRom(), { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
  });

  it("names the project, the source kind, the date and the weight behind every line", async () => {
    const response = await get(await runRom());
    expect(response.status).toBe(200);

    const { provenance } = await response.json();
    expect(provenance.lines).toHaveLength(1);

    const [line] = provenance.lines;
    expect(line.costCode).toBe("TEST");
    expect(line.comparableCount).toBe(1);
    expect(line.signals).toHaveLength(1);

    const [signal] = line.signals;
    expect(signal.kind).toBe("reviewed_judgment");
    expect(signal.recordedAt).toBe("2026-08-27");
    expect(signal.recordedBy).toBe("automated test");
    expect(signal.exportLabel).toBeNull();
    expect(signal.weight).toBe(2);
    expect(signal.weightShare).toBe(1);
    expect(signal.projects).toEqual([
      { id: TEST_PROJECT_ID, name: "Synthetic test project" },
    ]);
  });

  it("gives each signal its share of the blend when a line has more than one", async () => {
    const { rows } = await db.query<{ id: string }>(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_export_label,
          provenance_recorded_by, provenance_recorded_at)
       values
         ('TEST', 'Synthetic test line', 'usd_per_gsf', 2,
          'multifamily', 'new', 1, 'actuals', 'synthetic export',
          'automated test', date '2026-09-01')
       returning id`,
    );
    await db.query(
      `insert into benchmark_source_projects (benchmark_id, project_id) values ($1, $2)`,
      [rows[0].id, TEST_PROJECT_ID],
    );

    const { provenance } = await (await get(await runRom())).json();
    const [line] = provenance.lines;

    expect(line.signals).toHaveLength(2);
    const shares = Object.fromEntries(
      line.signals.map((s: { kind: string; weightShare: number }) => [s.kind, s.weightShare]),
    );
    // weight.actuals is 5 and weight.reviewed_judgment is 2 in the migration.
    expect(shares.actuals).toBeCloseTo(5 / 7);
    expect(shares.reviewed_judgment).toBeCloseTo(2 / 7);
    expect(shares.actuals + shares.reviewed_judgment).toBeCloseTo(1);

    const actuals = line.signals.find((s: { kind: string }) => s.kind === "actuals");
    expect(actuals.exportLabel).toBe("synthetic export");
    expect(actuals.recordedAt).toBe("2026-09-01");
  });

  it("returns no projects for a line with no comparable behind it", async () => {
    // A stated rule with no past project linked to it. The line is real and
    // the drill-down says outright that no Kulka job stands behind it.
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_recorded_by,
          provenance_recorded_at)
       values
         ('TEST-RULE', 'Stated rule line', 'usd_per_gsf', 4,
          'multifamily', 'new', 0, 'reviewed_judgment', 'automated test',
          date '2026-09-01')`,
    );

    const { provenance } = await (await get(await runRom())).json();
    const line = provenance.lines.find(
      (l: { costCode: string }) => l.costCode === "TEST-RULE",
    );

    expect(line.comparableCount).toBe(0);
    expect(line.signals[0].projects).toEqual([]);
  });

  it("gives 404 for a run that does not exist and for a run that failed", async () => {
    expect((await get("00000000-0000-4000-8000-0000000000ff")).status).toBe(404);

    const { rows } = await db.query<{ id: string }>(
      `insert into projects (name, project_type, construction_kind)
       values ('Area unknown (example)', 'multifamily', 'new') returning id`,
    );
    const failedRunId = await runRom(rows[0].id);
    expect((await get(failedRunId)).status).toBe(404);
  });

  it("gives 404 for a runId that is not a uuid, without touching the database", async () => {
    expect((await get("not-a-uuid")).status).toBe(404);
  });
});
