import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";

import { TEST_PROJECT_ID, seededDatabase } from "./database";

// LA-2214. The WS piles allowance is the only pile figure on record, so it
// sits on item 34a as a stated rate and prices only when the soil answer
// brings 34a into the run.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase({ pileRates: true });
});

afterEach(async () => {
  await db.close();
});

async function answer(siteConditions: string, belowGrade: string) {
  await db.query(
    `update projects set site_conditions_gate = $2, levels_below_grade_gate = $3 where id = $1`,
    [TEST_PROJECT_ID, siteConditions, belowGrade],
  );
  const { rom } = await runRom(db as Db, TEST_PROJECT_ID);
  return rom.lines.find((l) => l.costCode === "34a");
}

describe("item 34a, deep foundations", () => {
  it("prices the WS piles allowance, $350,000 lump sum, for poor soil", async () => {
    const line = await answer("yes", "no");
    expect(line).toBeDefined();
    expect((line!.low + line!.high) / 2).toBe(350000);
    expect(line!.comparables[0].exportLabel).toContain("WS");
  });

  it("leaves 34a out of the run for good soil with no basement", async () => {
    const line = await answer("no", "no");
    expect(line === undefined || line.gateStatus === "not_in_job").toBe(true);
  });
});
