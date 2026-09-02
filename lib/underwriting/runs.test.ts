import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import { createUnderwritingCase, updateUnderwritingCase, type CaseDraft } from "./cases";
import { getLatestUnderwritingRun, getUnderwritingRun, listUnderwritingRuns, runUnderwritingCase } from "./runs";

let db: Awaited<ReturnType<typeof seededDatabase>>;

const completeDraft: CaseDraft = {
  name: "Calculation test case",
  address: "500 Test Avenue",
  proposedUnits: 50,
  grossBuildingSquareFeet: 60000.125,
  assumptions: {
    purchasePrice: 4000000.25,
    monthlyRent: 2200.125,
    hardCostPerGrossSquareFoot: 210.375,
    softCostPercent: 12.25,
    contingencyPercent: 5.125,
    vacancyPercent: 4.75,
    operatingExpensePercent: 31.5,
    debtPercent: 65.25,
    interestRatePercent: 7.125,
    exitCapRatePercent: 5.375,
  },
};

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

describe("underwriting calculation repository", () => {
  it("stores a complete immutable input and result snapshot", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const run = await runUnderwritingCase(db, savedCase!.id);

    expect(run).toMatchObject({
      caseId: savedCase!.id,
      formulaVersion: "underwriting.preliminary_annual.v1",
      status: "complete",
      inputSnapshot: {
        grossBuildingSquareFeet: 60000.125,
        monthlyRent: 2200.125,
        softCostPercent: 12.25,
      },
      issues: [],
    });
    expect(run!.results).toHaveLength(14);
    expect(run!.results[0]).toMatchObject({
      key: "hardCost",
      formula: "gross building area × hard cost per GSF",
      inputKeys: ["grossBuildingSquareFeet", "hardCostPerGrossSquareFoot"],
    });

    await db.query(
      `update underwriting_cases set gross_building_square_feet = 70000 where id = $1`,
      [savedCase!.id],
    );
    const original = await getLatestUnderwritingRun(db, savedCase!.id);
    expect(original!.id).toBe(run!.id);
    expect(original!.inputSnapshot.grossBuildingSquareFeet).toBe(60000.125);
  });

  it("stores an incomplete failed run with issues and no results", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Incomplete case",
      address: "501 Test Avenue",
      assumptions: {},
    });
    const run = await runUnderwritingCase(db, savedCase!.id);

    expect(run!.status).toBe("failed");
    expect(run!.results).toEqual([]);
    expect(run!.issues).toContainEqual(expect.objectContaining({
      inputKey: "grossBuildingSquareFeet",
      code: "missing",
    }));
  });

  it("rejects updates and deletes to saved runs and results", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const run = await runUnderwritingCase(db, savedCase!.id);

    await expect(
      db.query(`update underwriting_calculation_runs set status = 'failed' where id = $1`, [run!.id]),
    ).rejects.toThrow("Underwriting calculation runs are immutable");
    await expect(
      db.query(`delete from underwriting_calculation_results where run_id = $1`, [run!.id]),
    ).rejects.toThrow("Underwriting calculation runs are immutable");
  });

  it("keeps the first snapshot and results unchanged after an edit and rerun", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const firstRun = await runUnderwritingCase(db, savedCase!.id);
    const firstSnapshot = structuredClone(firstRun);

    await updateUnderwritingCase(db, savedCase!.id, {
      ...completeDraft,
      grossBuildingSquareFeet: 64000.5,
      assumptions: {
        ...completeDraft.assumptions,
        purchasePrice: 4500000.75,
      },
    });
    const secondRun = await runUnderwritingCase(db, savedCase!.id);
    const history = await listUnderwritingRuns(db, savedCase!.id, 2);
    const reopenedFirst = await getUnderwritingRun(db, firstRun!.id);

    expect(secondRun!.id).not.toBe(firstRun!.id);
    expect(history.map((run) => run.id)).toEqual([secondRun!.id, firstRun!.id]);
    expect(history[0].inputSnapshot.grossBuildingSquareFeet).toBe(64000.5);
    expect(reopenedFirst).toEqual(firstSnapshot);
    expect(reopenedFirst!.inputSnapshot.purchasePrice).toBe(4000000.25);
    expect(reopenedFirst!.results).toEqual(firstRun!.results);
  });

  it("returns null when the case does not exist", async () => {
    expect(await runUnderwritingCase(db, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
  });
});

describe("underwriting calculation migration", () => {
  it("enables row level security with no browser policies", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
       from pg_class
       where relname in ('underwriting_calculation_runs', 'underwriting_calculation_results')
       order by relname`,
    );
    expect(rows).toEqual([
      { relname: "underwriting_calculation_results", relrowsecurity: true },
      { relname: "underwriting_calculation_runs", relrowsecurity: true },
    ]);
    const policies = await db.query(
      `select * from pg_policies where tablename in ('underwriting_calculation_runs', 'underwriting_calculation_results')`,
    );
    expect(policies.rows).toEqual([]);
  });
});
