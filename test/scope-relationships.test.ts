import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1154: supabase/migrations/20260927130000_scope_relationships.sql. The
// table holds Matt's stated relationships, and a run reads them into its
// snapshot so a driver brings its supporting items in.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

function insertRelationship(driver: string, supporting: string, quantityRule = "one_per_structure") {
  return db.query(
    `insert into scope_relationships
       (driver_cost_code, supporting_cost_code, supporting_label, quantity_rule,
        stated_by, stated_on, reason)
     values ($1, $2, 'Synthetic', $3, 'automated test', date '2026-09-27', 'synthetic')`,
    [driver, supporting, quantityRule],
  );
}

describe("scope_relationships", () => {
  it("seeds Matt's statement of 2026-09-26: 1a brings in the four disconnects, one per structure", async () => {
    const { rows } = await db.query<{
      driver_cost_code: string;
      supporting_cost_code: string;
      quantity_rule: string;
      stated_by: string;
      stated_on: Date;
    }>(
      `select driver_cost_code, supporting_cost_code, quantity_rule, stated_by, stated_on
         from scope_relationships order by supporting_cost_code`,
    );

    expect(rows.map((r) => [r.driver_cost_code, r.supporting_cost_code])).toEqual([
      ["1a", "28a"],
      ["1a", "28b"],
      ["1a", "31f"],
      ["1a", "36a"],
    ]);
    expect(new Set(rows.map((r) => r.quantity_rule))).toEqual(new Set(["one_per_structure"]));
    expect(new Set(rows.map((r) => r.stated_by))).toEqual(new Set(["mnicosia@thekulkagroup.com"]));
    expect(new Set(rows.map((r) => new Date(r.stated_on).toISOString().slice(0, 10)))).toEqual(
      new Set(["2026-09-26"]),
    );
  });

  it("refuses a second row for the same pairing", async () => {
    await expect(insertRelationship("1a", "31f")).rejects.toThrow();
  });

  it("refuses a quantity rule it does not know", async () => {
    await expect(insertRelationship("1a", "99", "per_gsf")).rejects.toThrow();
  });

  it("refuses an item that brings in itself", async () => {
    await expect(insertRelationship("1a", "1a")).rejects.toThrow();
  });
});

describe("a run over the seeded relationships", () => {
  async function withDriver() {
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, provenance_kind, provenance_export_label,
          provenance_recorded_by, provenance_recorded_at)
       values ('1a', 'Structure Demolition', 'usd_per_gsf', 2, 'multifamily', 'new', 1,
               'reviewed_judgment', null, 'automated test', date '2026-09-27')`,
    );
    await db.query(
      `insert into branch_gate_items
         (section, cost_code, closes_on, stated_by, stated_on, reason)
       values ('demolition', '1a', array['no'], 'automated test', date '2026-09-27',
               'A synthetic fixture so demolition brings in item 1a. Not a Kulka rule.')`,
    );
  }

  it("brings the four disconnects in as unpriced, naming the driver, when demolition is yes", async () => {
    await withDriver();
    await db.query(`update projects set demolition_gate = 'yes' where id = $1`, [TEST_PROJECT_ID]);

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);

    expect(rom.unpricedItems).toEqual([
      { costCode: "28a", label: "Plumbing Disconnect and Cap", driverCostCode: "1a" },
      { costCode: "28b", label: "Gas Meter and Service Disconnect", driverCostCode: "1a" },
      { costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" },
      { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
    ]);
  });

  it("leaves them out when demolition is no", async () => {
    await withDriver();
    await db.query(`update projects set demolition_gate = 'no' where id = $1`, [TEST_PROJECT_ID]);

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);

    expect(rom.unpricedItems).toEqual([]);
  });

  it("changes nothing while no driver has a line", async () => {
    await db.query(`update projects set demolition_gate = 'yes' where id = $1`, [TEST_PROJECT_ID]);

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);

    expect(rom.unpricedItems).toEqual([]);
    expect(rom.lines.map((line) => line.costCode)).toEqual(["TEST"]);
  });
});
