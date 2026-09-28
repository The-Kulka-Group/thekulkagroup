import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { answersFromProject, readProject, runRom } from "./run";

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
          set stories_above_grade = 4, unit_count = 120, building_count = 3, zip = '212'
        where id = $1`,
      [TEST_PROJECT_ID],
    );
    const project = await readProject(db as Db, TEST_PROJECT_ID);
    const answers = answersFromProject(project);
    expect(answers.facts).toMatchObject({
      storiesAboveGrade: 4,
      unitCount: 120,
      buildingCount: 3,
      zip: "212",
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
