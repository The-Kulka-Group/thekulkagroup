import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runRom } from "@/lib/rom/run";

import { seededDatabase, TEST_PROJECT_ID } from "./database";

// LA-2216: 20261011110000_podium_garage_rates.sql records VA's podium deck,
// garage electrical and garage sprinkler rates. computeRom against the
// seeded database, through the Run ROM path.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase({ garageRates: true });
  // Two synthetic whole-building rates, so the test can see the garage area leave them.
  await db.query(
    `insert into benchmarks
       (cost_code, label, unit, value, project_type, construction_kind,
        comparable_count, scope_side, contract_side, provenance_kind,
        provenance_export_label, provenance_recorded_by, provenance_recorded_at)
     values
       ('31', 'Electrical', 'usd_per_gsf', 24, 'multifamily', 'new', 1, 'building', 'kulka',
        'proest_budget', 'synthetic', 'automated test', date '2026-10-11'),
       ('27', 'Fire Sprinklers', 'usd_per_gsf', 6, 'multifamily', 'new', 1, 'building', 'kulka',
        'proest_budget', 'synthetic', 'automated test', date '2026-10-11')`,
  );
});

afterEach(async () => {
  await db.close();
});

const midpoint = (line: { low: number; high: number } | undefined) => (line ? (line.low + line.high) / 2 : null);

async function run(project: { parking: string; stories: number | null }) {
  await db.query(
    `update projects set gross_square_feet = 100000, parking_type = $2, stories_above_grade = $3 where id = $1`,
    [TEST_PROJECT_ID, project.parking, project.stories],
  );
  const { rom } = await runRom(db, TEST_PROJECT_ID);
  return { rom, line: (code: string) => rom.lines.find((l) => l.costCode === code) };
}

describe("the podium garage priced from VA's rates (LA-2216)", () => {
  it("records each rate with VA as its source", async () => {
    const { rows } = await db.query<{ cost_code: string; value: string; unit: string; provenance_export_label: string }>(
      `select cost_code, value::text, unit, provenance_export_label
         from benchmarks where unit = 'usd_per_sf_of_garage' and construction_kind = 'new'
        order by cost_code`,
    );
    expect(rows.map((r) => [r.cost_code, Number(r.value)])).toEqual([
      ["27a", 6],
      ["3", 34.13],
      ["31g", 18],
    ]);
    for (const row of rows) expect(row.provenance_export_label).toMatch(/^VA: /);
  });

  it("prices all three on a podium garage, 100,000 SF over 5 stories", async () => {
    const { line } = await run({ parking: "structured", stories: 5 });
    expect(midpoint(line("3"))).toBeCloseTo(20000 * 34.13);
    expect(midpoint(line("31g"))).toBe(20000 * 18);
    expect(midpoint(line("27a"))).toBe(20000 * 6);
  });

  it("takes the garage area out of the whole-building electrical and sprinklers", async () => {
    const { line } = await run({ parking: "structured", stories: 5 });
    expect(midpoint(line("31"))).toBe(80000 * 24);
    expect(midpoint(line("27"))).toBe(80000 * 6);
  });

  it("removes all three for a surface lot and keeps the whole building on full gross area", async () => {
    const { rom, line } = await run({ parking: "surface", stories: 5 });
    expect(rom.notInThisJob.map((i) => i.costCode).sort()).toEqual(["27a", "3", "31g"]);
    expect(midpoint(line("31"))).toBe(100000 * 24);
    expect(midpoint(line("27"))).toBe(100000 * 6);
  });

  it("leaves a named blank when the podium footprint is missing", async () => {
    const { rom, line } = await run({ parking: "structured", stories: null });
    expect(line("31g")).toBeUndefined();
    const blanks = rom.unpricedItems.filter((item) => ["3", "27a", "31g"].includes(item.costCode));
    expect(blanks.map((item) => [item.costCode, item.missing])).toEqual([
      ["27a", ["Stories Above Grade"]],
      ["3", ["Stories Above Grade"]],
      ["31g", ["Stories Above Grade"]],
    ]);
    expect(midpoint(line("31"))).toBe(100000 * 24);
  });
});
