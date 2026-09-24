import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1028 follow-up: the seeded branch_gate_items rows name the parking rule's
// section "parking_type", the projects column's own name, while the engine
// reads the answer from facts under "parkingType". This runs the real seeded
// rows end to end, so a spelling mismatch between the two shows up here.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeAll(async () => {
  db = await seededDatabase();
  await db.query(
    `insert into benchmarks
       (cost_code, label, unit, value, project_type, construction_kind,
        comparable_count, provenance_kind, provenance_export_label,
        provenance_recorded_by, provenance_recorded_at)
     values ('15a', 'Overhead Doors', 'usd_per_gsf', 1, 'multifamily', 'new',
             1, 'actuals', 'synthetic', 'test@kulka.invalid', '2026-09-24')`,
  );
});

afterAll(async () => {
  await db.close();
});

describe("parking on the project record", () => {
  it("turns off garage doors when the project has surface parking", async () => {
    await db.query(`update projects set parking_type = 'surface' where id = $1`, [TEST_PROJECT_ID]);
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    expect(rom.notInThisJob?.map((item) => item.costCode)).toContain("15a");
    expect(rom.assumedPresentItems?.map((item) => item.costCode) ?? []).not.toContain("15a");
  });

  it("prices garage doors when the project has structured parking", async () => {
    await db.query(`update projects set parking_type = 'structured' where id = $1`, [TEST_PROJECT_ID]);
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    expect(rom.notInThisJob?.map((item) => item.costCode) ?? []).not.toContain("15a");
    expect(rom.assumedPresentItems?.map((item) => item.costCode) ?? []).not.toContain("15a");
  });
});
