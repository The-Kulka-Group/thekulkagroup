import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { saveJobConfidence } from "./job-confidence";
import { runRom } from "./run";

// LA-2967. A score saved on a past job reaches the next run: its ProEst
// figure counts the score out of 10, and a job scored at or below the cutoff
// (1, from 20261021120000_estimator_confidence.sql) stays out of the blend.

const JOB_10 = "10000000-0000-4000-8000-000000002967";
const JOB_6 = "20000000-0000-4000-8000-000000002967";
const JOB_1 = "30000000-0000-4000-8000-000000002967";

let db: Awaited<ReturnType<typeof seededDatabase>>;

async function pastJob(id: string, name: string, rate: number) {
  await db.query(
    `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
     values ($1, $2, 'multifamily', 'new', 100000)`,
    [id, name],
  );
  const { rows } = await db.query<{ id: string }>(
    `insert into benchmarks
       (cost_code, label, unit, value, project_type, construction_kind,
        comparable_count, scope_side, contract_side, provenance_kind,
        provenance_export_label, provenance_recorded_by, provenance_recorded_at)
     values
       ('TEST2', 'Synthetic scored line', 'usd_per_gsf', $1, 'multifamily', 'new',
        1, 'building', 'kulka', 'proest_budget', $2, 'automated test', date '2026-10-21')
     returning id`,
    [rate, `${name} export`],
  );
  await db.query(`insert into benchmark_source_projects (benchmark_id, project_id) values ($1, $2)`, [rows[0].id, id]);
}

beforeEach(async () => {
  db = await seededDatabase();
  await pastJob(JOB_10, "Scored ten", 100);
  await pastJob(JOB_6, "Scored six", 20);
  await pastJob(JOB_1, "Scored one", 5);
});

afterEach(async () => {
  await db.close();
});

describe("estimator confidence in a run", () => {
  it("blends every job equally while none is scored", async () => {
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const line = rom.lines.find((l) => l.costCode === "TEST2")!;
    expect(line.comparables.map((c) => c.weight)).toEqual([1, 1, 1]);
    expect(line.scoreExcluded).toBeUndefined();
  });

  it("weights by score and leaves out the job scored 1 once the scores are saved", async () => {
    const jesse = { scoredBy: "Jesse Snizek", scoredOn: "2026-10-15" };
    await saveJobConfidence(db as Db, JOB_10, { score: 10, ...jesse });
    await saveJobConfidence(db as Db, JOB_6, { score: 6, ...jesse });
    await saveJobConfidence(db as Db, JOB_1, { score: 1, ...jesse });

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const line = rom.lines.find((l) => l.costCode === "TEST2")!;
    const bySource = Object.fromEntries(line.comparables.map((c) => [c.sourceProjectIds[0], c]));
    expect(Object.keys(bySource).sort()).toEqual([JOB_10, JOB_6]);
    expect(bySource[JOB_10].weight).toBe(1);
    expect(bySource[JOB_6].weight).toBeCloseTo(0.6);
    expect(line.scoreExcluded?.map((c) => c.sourceProjectIds)).toEqual([[JOB_1]]);
    // (10 x $100 + 6 x $20) / 16 = $70 per GSF over the test project's 1,000 GSF.
    expect((line.low + line.high) / 2).toBeCloseTo(70_000, -1);
    expect(rom.parameters["confidence.exclude_at_or_below"]?.value).toBe(1);
  });
});
