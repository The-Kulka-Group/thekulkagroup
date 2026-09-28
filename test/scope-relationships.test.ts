import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { tier1Flow, visibleQuestions, type Responses } from "@/lib/rom/question-flow";
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
         from scope_relationships where driver_cost_code = '1a' order by supporting_cost_code`,
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

  it("seeds Matt's Elevator element of 2026-09-28 (LA-1257, LA-1265): item 26 brings in 26b to 26i, three on a condition", async () => {
    const { rows } = await db.query<{
      supporting_cost_code: string;
      quantity_rule: string;
      condition_fact: string | null;
      condition_equals: string | null;
    }>(
      `select supporting_cost_code, quantity_rule, condition_fact, condition_equals
         from scope_relationships where driver_cost_code = '26' order by supporting_cost_code`,
    );

    expect(rows.map((r) => [r.supporting_cost_code, r.quantity_rule, r.condition_fact, r.condition_equals])).toEqual([
      ["26b", "one_per_elevator", null, null],
      ["26c", "one_per_elevator", null, null],
      ["26d", "one_per_elevator", "levels_below_grade", "yes"],
      ["26e", "one_per_elevator", null, null],
      ["26f", "one_per_elevator", null, null],
      ["26g", "one_per_machine_room", "elevatorMachineRoomHvac", "yes"],
      ["26h", "one_per_stop", null, null],
      ["26i", "one_per_elevator", "hydraulicJackType", "in_ground"],
    ]);
  });

  it("refuses half a condition", async () => {
    await expect(
      db.query(
        `insert into scope_relationships
           (driver_cost_code, supporting_cost_code, supporting_label, quantity_rule,
            condition_fact, stated_by, stated_on, reason)
         values ('26', '99', 'Synthetic', 'one_per_elevator', 'elevatorType', 'automated test', date '2026-09-28', 'synthetic')`,
      ),
    ).rejects.toThrow();
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

/** The seeded project is multifamily and new, the same as the synthetic benchmarks. */
const ENGINE_ANSWER: Record<string, string> = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: "1000",
};

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

  /**
   * Answers to the whole tier-1 flow with demolition yes and one 1,000 SF
   * wood-frame structure coming down. Item 1a prices only once the structure
   * square footage is known (LA-1156), and only the flow's answers carry it.
   */
  function demolitionYes(): Responses {
    const definition = tier1Flow();
    const responses: Responses = {};
    let added = true;
    while (added) {
      added = false;
      for (const question of visibleQuestions(definition, responses)) {
        if (question.id in responses) continue;
        added = true;
        if (question.id === "demolition") responses[question.id] = "yes";
        else if (question.id === "demolition_structure_count") responses[question.id] = "1";
        else if (question.id === "demolition_structure_square_feet") responses[question.id] = "1000";
        else if (question.id === "demolition_structure_type") responses[question.id] = "wood_frame_type_v";
        else if (question.kind === "branch_gate") responses[question.id] = "no";
        else if (question.mapsTo.target === "engine_input") responses[question.id] = ENGINE_ANSWER[question.mapsTo.name];
        else if (question.kind === "number") responses[question.id] = "1";
        // LA-1199: ZIP is the flow's one text question, validated as five
        // digits. Falling into the choice branch below would crash on a
        // question with no choices; leaving it unanswered (`continue` with no
        // assignment) would keep `added` true forever, since this loop's
        // `added = true` above already ran for this question every pass.
        else if (question.kind === "text") responses[question.id] = "10956";
        else responses[question.id] = question.choices![0].value;
      }
    }
    return responses;
  }

  it("brings the four disconnects in as unpriced, naming the driver, when demolition is yes", async () => {
    await withDriver();

    const { rom } = await runRom(db as Db, TEST_PROJECT_ID, demolitionYes());

    expect(rom.lines.map((line) => line.costCode)).toContain("1a");

    expect(rom.unpricedItems).toEqual([
      { costCode: "28a", label: "Plumbing Disconnect and Cap", driverCostCode: "1a" },
      { costCode: "28b", label: "Gas Meter and Service Disconnect", driverCostCode: "1a" },
      { costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" },
      { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
    ]);
  });

  it("prices Structure Demolition from Matt's stated rate and brings its disconnects in, on shipped data alone", async () => {
    const shipped = await seededDatabase({ statedRates: true });
    try {
      const { rom } = await runRom(shipped as Db, TEST_PROJECT_ID, demolitionYes());
      const structure = rom.lines.find((line) => line.costCode === "1a")!;

      // 1,000 SF of wood frame at Matt's $6.60 midpoint.
      expect((structure.low + structure.high) / 2).toBeCloseTo(6600, 6);
      expect(rom.unpricedItems.map((item) => [item.costCode, item.driverCostCode])).toEqual([
        ["28a", "1a"],
        ["28b", "1a"],
        ["31f", "1a"],
        ["36a", "1a"],
      ]);
    } finally {
      await shipped.close();
    }
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
