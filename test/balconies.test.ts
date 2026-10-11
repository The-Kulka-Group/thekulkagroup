import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { tier1Flow, visibleQuestions, type Responses } from "@/lib/rom/question-flow";
import { runRom } from "@/lib/rom/run";

import { seededDatabase, TEST_PROJECT_ID } from "./database";

// LA-2219: 20261011120000_balcony_rates.sql adds the per-LF unit, the sliding
// door item (15b) and VA's balcony deck and rail rates. computeRom against the
// seeded database, through the Run ROM path with New Budget's answers.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase({ balconyRates: true });
});

afterEach(async () => {
  await db.close();
});

const midpoint = (line: { low: number; high: number } | undefined) => (line ? (line.low + line.high) / 2 : null);

/** Every question the flow shows answered, every scope gate "no", then the given answers on top. */
function answered(given: Responses): Responses {
  const engine: Record<string, string> = { project_type: "multifamily", construction_kind: "new", gross_square_feet: "100000" };
  const responses: Responses = { ...given };
  for (let pass = 0; pass < 3; pass++) {
    for (const question of visibleQuestions(tier1Flow(), responses)) {
      if (responses[question.id] !== undefined || question.kind === "text") continue;
      if (question.mapsTo.target === "engine_input") responses[question.id] = engine[question.id];
      else if (question.kind === "branch_gate") responses[question.id] = "no";
      else if (question.kind === "number") responses[question.id] = "4";
      else responses[question.id] = question.choices![0].value;
    }
  }
  return responses;
}

const FULL: Responses = {
  balconies: "yes",
  balcony_type: "full",
  balcony_count: "25",
  balcony_deck_square_feet: "110",
  balcony_rail_linear_feet: "26",
};

async function run(given: Responses) {
  const { rom } = await runRom(db, TEST_PROJECT_ID, answered(given));
  return { rom, line: (code: string) => rom.lines.find((l) => l.costCode === code) };
}

describe("full balconies priced from the rates on record (LA-2219)", () => {
  it("records the deck and rail with VA as their source and the doors with the jobs behind the range", async () => {
    const { rows } = await db.query<{ cost_code: string; unit: string; value: string; provenance_export_label: string }>(
      `select cost_code, unit, value::text, provenance_export_label
         from benchmarks where cost_code in ('11', '11a', '15b') and construction_kind = 'new'
        order by cost_code, value`,
    );
    expect(rows.map((r) => [r.cost_code, r.unit, Number(r.value)])).toEqual([
      ["11", "usd_per_sf_of_balcony", 60],
      ["11a", "usd_per_lf_of_rail", 300],
      ["15b", "usd_each_balcony_door", 1800],
      ["15b", "usd_each_balcony_door", 2537],
    ]);
    expect(rows[0].provenance_export_label).toMatch(/^Source job: VA\. /);
    expect(rows[1].provenance_export_label).toMatch(/^Source job: VA\. /);
    for (const door of rows.slice(2)) expect(door.provenance_export_label).toMatch(/^Source jobs: VA, V64, VR\. /);
  });

  it("adds sliding doors as canonical item 15b", async () => {
    const { rows } = await db.query<{ name: string; masterformat_division: string }>(
      `select name, masterformat_division from canonical_work_items where item_number = '15b'`,
    );
    expect(rows).toEqual([{ name: "Sliding glass doors", masterformat_division: "08" }]);
  });

  it("prices the deck per SF, the rail per LF and the doors from their low and high", async () => {
    const { line } = await run(FULL);
    expect(line("11")!.quantity).toEqual({ amount: 2750, unit: "usd_per_sf_of_balcony" });
    expect(midpoint(line("11"))).toBe(2750 * 60);
    expect(line("11a")!.quantity).toEqual({ amount: 650, unit: "usd_per_lf_of_rail" });
    expect(midpoint(line("11a"))).toBe(650 * 300);
    expect({ low: line("15b")!.low, high: line("15b")!.high }).toEqual({ low: 25 * 1800, high: 25 * 2537 });
  });

  it("leaves a named blank when the rail per balcony is missing", async () => {
    // Left blank, the way New Budget sends an optional question nobody answered.
    const { rom, line } = await run({ ...FULL, balcony_rail_linear_feet: "" });
    expect(line("11a")).toBeUndefined();
    const blank = rom.unpricedItems.filter((item) => item.costCode === "11a");
    expect(blank.map((item) => [item.label, item.missing])).toEqual([["Balcony Posts and Rail", ["Rail per Balcony"]]]);
    expect(midpoint(line("11"))).toBe(2750 * 60);
  });

  it("takes all three out when the units have no balconies", async () => {
    const { rom } = await run({ balconies: "no" });
    expect(rom.notInThisJob.map((item) => item.costCode).filter((code) => ["11", "11a", "15b"].includes(code)).sort()).toEqual([
      "11",
      "11a",
      "15b",
    ]);
  });
});

// LA-2220: 20261011130000_juliet_rail.sql adds item 7b, the Juliet rail, at
// $225/LF from V64 and VA. Juliet balconies ask a Juliet count and the rail
// across one, and each Juliet has one sliding door.
const JULIET: Responses = {
  balconies: "yes",
  balcony_type: "juliet",
  juliet_count: "40",
  juliet_rail_linear_feet: "6",
};

describe("Juliet balconies priced from the rate on record (LA-2220)", () => {
  it("records the Juliet rail at $225 per LF with V64 and VA as its source", async () => {
    const { rows } = await db.query<{ unit: string; value: string; provenance_export_label: string }>(
      `select unit, value::text, provenance_export_label
         from benchmarks where cost_code = '7b' and construction_kind = 'new'`,
    );
    expect(rows.map((r) => [r.unit, Number(r.value)])).toEqual([["usd_per_lf_of_rail", 225]]);
    expect(rows[0].provenance_export_label).toMatch(/^Source jobs: V64, VA\. /);
  });

  it("adds the Juliet rail as canonical item 7b, after the structural steel", async () => {
    const { rows } = await db.query<{ item_number: string; name: string; masterformat_division: string }>(
      `select item_number, name, masterformat_division from canonical_work_items
        where sort_order > (select sort_order from canonical_work_items where item_number = '7a') order by sort_order limit 1`,
    );
    expect(rows).toEqual([{ item_number: "7b", name: "Juliet rail", masterformat_division: "05" }]);
  });

  it("prices the rail per LF and one sliding door to each Juliet", async () => {
    const { line } = await run(JULIET);
    expect(line("7b")!.quantity).toEqual({ amount: 240, unit: "usd_per_lf_of_rail" });
    expect(midpoint(line("7b"))).toBe(240 * 225);
    expect({ low: line("15b")!.low, high: line("15b")!.high }).toEqual({ low: 40 * 1800, high: 40 * 2537 });
    expect(line("11")?.gateStatus).toBe("not_in_job");
    expect(line("11a")?.gateStatus).toBe("not_in_job");
  });

  it("leaves a named blank when the rail per Juliet is missing", async () => {
    const { rom, line } = await run({ ...JULIET, juliet_rail_linear_feet: "" });
    expect(line("7b")).toBeUndefined();
    expect(rom.unpricedItems.filter((item) => item.costCode === "7b").map((item) => [item.label, item.missing])).toEqual([
      ["Juliet Rail", ["Rail per Juliet"]],
    ]);
    expect(midpoint(line("15b"))).toBe((40 * (1800 + 2537)) / 2);
  });

  it("prices no Juliet rail for full balconies or for no balconies", async () => {
    const fullRun = await run(FULL);
    expect(fullRun.rom.notInThisJob.map((item) => item.costCode)).toContain("7b");
    const none = await run({ balconies: "no" });
    expect(none.rom.notInThisJob.map((item) => item.costCode)).toContain("7b");
  });
});
