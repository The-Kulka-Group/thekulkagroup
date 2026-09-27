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
