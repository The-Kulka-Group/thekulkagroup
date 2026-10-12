import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { answersFromProject, readCanonicalDivisions, readProject, runRom } from "./run";

// LA-1199. A run with no `responses` (the ROM screen, Run settings, the
// backtest) reads its facts off the project record through `answersFromProject`
// rather than the tier-1 flow. Stories Above Grade, Unit Count, Building Count
// and ZIP have to carry through that path too, under the same intake-field
// names config/rom/tier1-flow.json gives them, or a project edited through
// Edit project (rather than run through New budget's flow) would never see
// them in a run's facts.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("stories above grade, unit count, building count, zip on the project record", () => {
  it("carries all four into answersFromProject's facts when set", async () => {
    await db.query(
      `update projects
          set stories_above_grade = 4, unit_count = 120, building_count = 3, zip = '10956'
        where id = $1`,
      [TEST_PROJECT_ID],
    );
    const project = await readProject(db as Db, TEST_PROJECT_ID);
    const answers = answersFromProject(project);
    expect(answers.facts).toMatchObject({
      storiesAboveGrade: 4,
      unitCount: 120,
      buildingCount: 3,
      zip: "10956",
    });
  });

  it("still carries building count (its own NOT NULL default) with the other three left out when unset", async () => {
    const project = await readProject(db as Db, TEST_PROJECT_ID);
    const answers = answersFromProject(project);
    expect(answers.facts?.buildingCount).toBe(1);
    expect(answers.facts?.storiesAboveGrade).toBeUndefined();
    expect(answers.facts?.unitCount).toBeUndefined();
    expect(answers.facts?.zip).toBeUndefined();
  });

  it("a project saved before LA-1199 (all four at their column defaults) still runs a ROM", async () => {
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    expect(rom.total.low).toBeLessThanOrEqual(rom.total.high);
  });
});

// LA-1212: Elevator Count carries the same way, but reads `!== null` rather
// than the truthy check the other four use, because zero is itself a legal,
// meaningful answer (no elevator) and must not read back as unset.
// LA-2274: a run off the project record (Run Settings, Edit Project) keeps
// the balcony answers New Budget saved, under the names the engine reads.
describe("balcony answers on the project record", () => {
  it("carries the type and numbers into answersFromProject's facts", async () => {
    await db.query(
      `update projects set balcony_type = 'juliet', juliet_count = 12, juliet_rail_linear_feet = 6.5 where id = $1`,
      [TEST_PROJECT_ID],
    );
    const answers = answersFromProject(await readProject(db as Db, TEST_PROJECT_ID));
    expect(answers.facts).toMatchObject({ balconyType: "juliet", julietCount: 12, julietRailLinearFeet: 6.5 });
    expect(answers.facts?.balconyCount).toBeUndefined();
  });
});

describe("elevator count on the project record", () => {
  it("carries into answersFromProject's facts when set, including zero", async () => {
    await db.query(`update projects set stories_above_grade = 4, elevator_count = 2 where id = $1`, [
      TEST_PROJECT_ID,
    ]);
    const withCount = answersFromProject(await readProject(db as Db, TEST_PROJECT_ID));
    expect(withCount.facts).toMatchObject({ elevatorCount: 2 });

    await db.query(`update projects set elevator_count = 0 where id = $1`, [TEST_PROJECT_ID]);
    const withZero = answersFromProject(await readProject(db as Db, TEST_PROJECT_ID));
    expect(withZero.facts?.elevatorCount).toBe(0);
  });

  it("leaves elevatorCount out of facts when unset", async () => {
    const answers = answersFromProject(await readProject(db as Db, TEST_PROJECT_ID));
    expect(answers.facts?.elevatorCount).toBeUndefined();
  });

  // LA-1212's own done bar: a saved project with Stories Above Grade and
  // Elevator Count set prices item 26 (Elevators) per stop and item 26a (the
  // bulkhead) through the Run ROM path -- not the tier-1 flow's `responses`,
  // which is how LA-1205 alone was ever exercised end to end.
  it("prices item 26 per stop and item 26a as a bulkhead through runRom", async () => {
    // This test needs Matt's real elevator rates (20260927210000's per-stop
    // rows and 20260927220000's bulkhead rows), which `seededDatabase`'s
    // default drops so most tests see only the synthetic TEST benchmark.
    await db.close();
    db = await seededDatabase({ elevatorRates: true });
    // V-1 (packages/elevator-criterion.ts) only derives a type once the
    // elevator gate itself answers "yes" -- an unanswered gate short-circuits
    // applyElevatorCriterion before it ever reads Stories Above Grade, the
    // same way New budget's guided flow always answers it before its Review
    // step. With no type derived, item 26 would price the full
    // hydraulic-to-traction span instead of the single matched rate.
    await db.query(
      `update projects set stories_above_grade = 4, elevator_count = 2, elevator_gate = 'yes' where id = $1`,
      [TEST_PROJECT_ID],
    );
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const elevatorLine = rom.lines.find((l) => l.costCode === "26");
    const bulkheadLine = rom.lines.find((l) => l.costCode === "26a");
    // 4 stories, no served below-grade level: 4 stops per elevator, 2
    // elevators, 8 stops total. Travel of (4 - 1) x 10' = 30' sits inside the
    // hydraulic band (35' or less), so V-1 derives Hydraulic with no Jev
    // client needed, and item 26 blends the single matched rate rather than
    // the full hydraulic-to-traction span a null type would price
    // (rom-elevator.test.ts's own midpoint check follows the same math). The
    // stated rate carries no source project, so it blends at the engine's own
    // low-confidence spread around that midpoint, the same as every other
    // stated rate with one comparable -- this only checks the midpoint LA-1205's
    // per-stop math is responsible for, not the confidence band.
    expect(elevatorLine).toBeDefined();
    const midpoint = elevatorLine ? (elevatorLine.low + elevatorLine.high) / 2 : 0;
    expect(midpoint).toBe(35000 * 8);
    // Two elevators pair into one shared bulkhead: item 26a's own stated
    // build-up, no spread, no held-for-review.
    expect(bulkheadLine).toMatchObject({ low: 28700, high: 28700, confidence: "high", heldForReview: false });
  });

  it("still prices item 26 per GSF when the project has no Elevator Count", async () => {
    // Production carries an older item 26 row on usd_per_gsf (Jefferson's
    // Ferry) beside the newer per-stop rates
    // (packages/engine/src/elevator.test.ts: "priceElevator with an older
    // per-GSF row beside the per-stop rates"). A project with Stories Above
    // Grade but no Elevator Count keeps that per-GSF line rather than losing
    // it, exactly as it did before LA-1205 ever added per-stop pricing.
    await db.query(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind,
          comparable_count, scope_side, contract_side, provenance_kind,
          provenance_export_label, provenance_recorded_by, provenance_recorded_at)
       values
         ('26', 'Elevators', 'usd_per_gsf', 1.71, 'multifamily', 'new',
          1, 'building', 'kulka', 'proest_budget',
          'Jefferson''s Ferry (example)', 'automated test', date '2026-09-27')`,
    );
    await db.query(`update projects set stories_above_grade = 4 where id = $1`, [TEST_PROJECT_ID]);
    const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
    const elevatorLine = rom.lines.find((l) => l.costCode === "26");
    expect(elevatorLine).toBeDefined();
    // One comparable blends at the engine's own low-confidence spread
    // (spread.low = 0.35) around the per-GSF midpoint, the same as every
    // other stated rate with a single comparable (rom-elevator.test.ts's own
    // "priceElevator with an older per-GSF row" tests read the un-ranged
    // shell directly; runRom goes through the ordinary ranged blend). The
    // midpoint itself, $1.71 x 1,000 GSF = $1,710, is what proves this priced
    // per GSF rather than per stop -- a per-stop price at these facts would
    // land in the hundreds of thousands, not here.
    const midpoint = elevatorLine ? (elevatorLine.low + elevatorLine.high) / 2 : 0;
    expect(Math.abs(midpoint - 1.71 * 1000)).toBeLessThan(2);
  });
});

// LA-1214. Matt confirmed docs/precon/masterformat-divisions.md on
// 2026-09-27, and 20260927240000_canonical_item_divisions.sql stores it on
// `canonical_work_items.masterformat_division`. This is the expected map,
// hard-coded here rather than read from the doc, so a future migration that
// silently drifts from what Matt confirmed fails this test.
const EXPECTED_DIVISIONS: Record<string, string> = {
  "1": "02",
  "2": "03",
  "3": "03",
  "3a": "03",
  "4": "03",
  "5": "04",
  "6": "04",
  "7": "05",
  "7a": "05",
  "7b": "05", // LA-2220, Matt 2026-10-11: Juliet rail.
  "8": "06",
  "8a": "06",
  "9": "06",
  "10": "06",
  "11": "06",
  "12": "07",
  "13": "07",
  "14": "07",
  "14a": "07",
  "15": "08",
  "15a": "08",
  "15b": "08", // LA-2219, Matt 2026-10-11: sliding glass doors.
  "16": "08",
  "16a": "08",
  "17": "09",
  "18": "09",
  "19": "09",
  "19a": "09",
  "20": "09",
  "21": "10",
  "22": "11", // Matt, 2026-09-27: Equipment, not the doc's proposed 10.
  "23": "14", // Matt, 2026-09-27: Conveying Systems, not the doc's proposed 10.
  "24": "12",
  "24a": "12",
  "24b": "12",
  "25": "13",
  "26": "14",
  "27": "21",
  "27a": "21", // LA-2216, Matt 2026-10-11: garage-level fire sprinklers.
  "28": "22",
  "29": "22",
  "30": "23",
  "31": "26",
  "31a": "27", // Matt, 2026-09-27: Communications, not the doc's proposed 26.
  "31b": "26",
  "31c": "26",
  "31d": "26",
  "31e": "26",
  "31g": "26", // LA-2216, Matt 2026-10-11: garage-level electrical.
  "32": "28",
  "32a": "28",
  "33": "31",
  "34": "31",
  "34a": "31",
  "35": "33", // Matt, 2026-09-27: Utilities, not the doc's proposed 31.
  "36": "33", // Matt, 2026-09-27: Utilities, not the doc's proposed 31.
  "37": "32", // Stored since 2026-09-24 (LA-1015); the doc's table was stale.
  "38": "32",
  "39": "32",
};

describe("LA-1214: every canonical item's stored MasterFormat division", () => {
  it("matches Matt's confirmed division for every item, and no other items exist", async () => {
    const rows = await readCanonicalDivisions(db as Db);
    const actual = Object.fromEntries(rows.map((row) => [row.itemNumber, row.division]));
    expect(actual).toEqual(EXPECTED_DIVISIONS);
  });

  it("does not yet carry the five items LA-1214 left off canonical_work_items", async () => {
    // 1a, 28a, 28b, 31f and 36a are classified on block_classification, keyed
    // by cost code, but are not rows here (20260927160000_demolition_pilot_classification.sql
    // states this directly). Adding them is a decision of its own.
    const rows = await readCanonicalDivisions(db as Db);
    const itemNumbers = new Set(rows.map((row) => row.itemNumber));
    for (const missing of ["1a", "28a", "28b", "31f", "36a"]) {
      expect(itemNumbers.has(missing)).toBe(false);
    }
  });
});
