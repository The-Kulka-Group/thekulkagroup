import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  saveApartmentOperations,
  saveUnderwritingCostSchedule,
  updateUnderwritingCase,
  type CaseDraft,
} from "./cases";
import {
  countUnderwritingRuns,
  getLatestUnderwritingRun,
  getUnderwritingRun,
  listUnderwritingRuns,
  runUnderwritingCase,
} from "./runs";

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
    const run = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);

    expect(run).toMatchObject({
      caseId: savedCase!.id,
      formulaVersion: "underwriting.preliminary_annual.v1",
      status: "complete",
      caseRevision: 1,
      inputSnapshot: {
        grossBuildingSquareFeet: 60000.125,
        monthlyRent: 2200.125,
        softCostPercent: 12.25,
      },
      issues: [],
      evidenceSnapshot: {
        caseId: savedCase!.id,
        caseRevision: 1,
        name: completeDraft.name,
        address: completeDraft.address,
        grossBuildingSquareFeet: 60000.125,
        factMetadata: {
          proposedUnits: expect.objectContaining({ reviewState: "working", caseRevision: 1 }),
          grossBuildingSquareFeet: expect.objectContaining({ reviewState: "working", caseRevision: 1 }),
        },
      },
    });
    expect(run!.results).toHaveLength(14);
    expect(run!.results[0]).toMatchObject({
      key: "hardCost",
      formula: "gross building area × hard cost per GSF",
      inputKeys: ["grossBuildingSquareFeet", "hardCostPerGrossSquareFoot"],
    });
    const rentEvidence = run!.evidenceSnapshot.assumptions.find(
      ({ name }) => name === "monthlyRent",
    );
    expect(rentEvidence).toMatchObject({
      name: "monthlyRent",
      value: 2200.125,
      unit: "usd_per_month",
      reviewState: "working",
      lastChangedAt: expect.any(String),
    });
    expect(rentEvidence).not.toHaveProperty("sourceLabel");
    expect(rentEvidence).not.toHaveProperty("sourceDate");

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
    const run = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);

    expect(run!.status).toBe("failed");
    expect(run!.results).toEqual([]);
    expect(run!.issues).toContainEqual(expect.objectContaining({
      inputKey: "grossBuildingSquareFeet",
      code: "missing",
    }));
  });

  it("stores a complete all-equity run with zero debt and interest", async () => {
    const savedCase = await createUnderwritingCase(db, {
      ...completeDraft,
      assumptions: {
        ...completeDraft.assumptions,
        debtPercent: 0,
        interestRatePercent: undefined,
      },
    });
    const run = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);

    expect(run!.status).toBe("complete");
    expect(run!.results.find(({ key }) => key === "loanAmount")?.value).toBe(0);
    expect(run!.results.find(({ key }) => key === "annualDebtInterestEstimate")?.value).toBe(0);
  });

  it("rejects updates and deletes to saved runs and results", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const run = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);

    await expect(
      db.query(`update underwriting_calculation_runs set status = 'failed' where id = $1`, [run!.id]),
    ).rejects.toThrow("Underwriting calculation runs are immutable");
    await expect(
      db.query(`update underwriting_calculation_runs set result_snapshot = '[]' where id = $1`, [run!.id]),
    ).rejects.toThrow("Underwriting calculation runs are immutable");
    await expect(
      db.query(`delete from underwriting_calculation_runs where id = $1`, [run!.id]),
    ).rejects.toThrow("Underwriting calculation runs are immutable");
  });

  it("keeps the first snapshot and results unchanged after an edit and rerun", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const firstRun = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);
    const firstSnapshot = structuredClone(firstRun);

    const updatedCase = await updateUnderwritingCase(db, savedCase!.id, {
      ...completeDraft,
      grossBuildingSquareFeet: 64000.5,
      assumptions: {
        ...completeDraft.assumptions,
        purchasePrice: 4500000.75,
      },
    }, savedCase!.caseRevision);
    const secondRun = await runUnderwritingCase(db, savedCase!.id, updatedCase!.caseRevision);
    const history = await listUnderwritingRuns(db, savedCase!.id, 2);
    const reopenedFirst = await getUnderwritingRun(db, firstRun!.id);

    expect(secondRun!.id).not.toBe(firstRun!.id);
    expect(history.map((run) => run.id)).toEqual([secondRun!.id, firstRun!.id]);
    expect(history[0].inputSnapshot.grossBuildingSquareFeet).toBe(64000.5);
    expect(history[0].caseRevision).toBe(2);
    expect(history[1].caseRevision).toBe(1);
    expect(reopenedFirst).toEqual(firstSnapshot);
    expect(reopenedFirst!.inputSnapshot.purchasePrice).toBe(4000000.25);
    expect(reopenedFirst!.results).toEqual(firstRun!.results);
  });

  it("pages run history without making older runs unreachable", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const first = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);
    const second = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);
    const third = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);

    expect(await countUnderwritingRuns(db, savedCase!.id)).toBe(3);
    expect((await listUnderwritingRuns(db, savedCase!.id, 2, 0)).map((run) => run.id)).toEqual([
      third!.id,
      second!.id,
    ]);
    expect((await listUnderwritingRuns(db, savedCase!.id, 2, 2)).map((run) => run.id)).toEqual([
      first!.id,
    ]);
  });

  it("returns null when the case does not exist", async () => {
    expect(await runUnderwritingCase(db, "00000000-0000-4000-8000-0000000000ff", 1)).toBeNull();
  });

  it("rejects a stale expected revision without saving a run", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const updatedCase = await updateUnderwritingCase(
      db,
      savedCase!.id,
      completeDraft,
      savedCase!.caseRevision,
    );

    await expect(
      runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision),
    ).rejects.toThrow("The case changed before the calculation ran");
    expect(await getLatestUnderwritingRun(db, updatedCase!.id)).toBeNull();
  });

  it("persists an overflow as an immutable failed run", async () => {
    const savedCase = await createUnderwritingCase(db, {
      ...completeDraft,
      grossBuildingSquareFeet: Number.MAX_VALUE,
      assumptions: {
        ...completeDraft.assumptions,
        hardCostPerGrossSquareFoot: 2,
      },
    });
    const run = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);
    const reopened = await getUnderwritingRun(db, run!.id);

    expect(reopened).toEqual(run);
    expect(reopened).toMatchObject({
      status: "failed",
      caseRevision: 1,
      results: [],
      issues: [{ inputKey: "derivedResults", code: "not_finite" }],
    });
  });

  it("stores the full monthly cost input, result, issues, and reconciliations under a new formula version", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const annualRun = await runUnderwritingCase(db, savedCase!.id, savedCase!.caseRevision);
    const scheduledCase = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2027-12",
      costLines: [
        {
          id: "land",
          name: "Land",
          category: "land",
          amount: 8_230_000,
          unit: "usd",
          startMonth: "2026-01",
          endMonth: "2026-01",
          distributionMethod: "straight_line",
          distributionVersion: "straight_line.v1",
          sourceLabel: "Workbook fixture",
          sourceDate: "2026-09-02",
          reviewState: "done",
        },
        {
          id: "hard",
          name: "Hard cost",
          category: "hard_cost",
          amount: 42_630_000,
          unit: "usd",
          startMonth: "2026-02",
          endMonth: "2027-06",
          distributionMethod: "s_curve",
          distributionVersion: "s_curve.smoothstep.v1",
          reviewState: "working",
        },
        {
          id: "soft",
          name: "Soft cost",
          category: "soft_cost",
          amount: 5_115_762,
          unit: "usd",
          startMonth: "2026-01",
          endMonth: "2027-06",
          distributionMethod: "straight_line",
          distributionVersion: "straight_line.v1",
          reviewState: "working",
        },
      ],
    });
    const run = await runUnderwritingCase(db, savedCase!.id, scheduledCase!.caseRevision);
    const reopenedAnnual = await getUnderwritingRun(db, annualRun!.id);
    const reopenedMonthly = await getUnderwritingRun(db, run!.id);

    expect(run).toMatchObject({
      formulaVersion: "underwriting.monthly_cost_schedule.v1",
      status: "complete",
      inputSnapshot: {
        analysisStartMonth: "2026-01",
        saleMonth: "2027-12",
        costLines: expect.arrayContaining([expect.objectContaining({ id: "land", amount: 8_230_000 })]),
      },
      results: [],
      issues: [],
      evidenceSnapshot: { costSchedule: {
        analysisStartMonth: "2026-01",
        saleMonth: "2027-12",
        costLines: expect.arrayContaining([expect.objectContaining({
          id: "land",
          sourceLabel: "Workbook fixture",
          lastChangedAt: expect.any(String),
        })]),
      } },
      monthlyCostResult: {
        totalsByCategory: {
          land: 8_230_000,
          hard_cost: 42_630_000,
          soft_cost: 5_115_762,
        },
        totalUses: 55_975_762,
      },
    });
    expect(run!.monthlyCostResult!.costLineSchedules.find(({ lineId }) => lineId === "hard")!
      .monthlyAmounts.reduce((sum, amount) => sum + amount, 0)).toBe(42_630_000);
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(reopenedMonthly).toEqual(run);
    expect(reopenedAnnual).toEqual(annualRun);
    expect(reopenedAnnual!.formulaVersion).toBe("underwriting.preliminary_annual.v1");
  });

  it("stores an immutable apartment operations run and keeps rent and other income separate", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{
        id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd",
        startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line",
        distributionVersion: "straight_line.v1", reviewState: "working",
      }],
    });
    const operating = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1",
      operationStartMonth: "2026-01",
      growthStartMonth: "2026-01",
      preleasedUnits: 10,
      leaseUpUnitsPerMonth: 1,
      annualIncomeGrowthPercent: 3,
      annualExpenseGrowthPercent: 3,
      rentAdjustmentLossPercent: 0,
      freeRentPercent: 0,
      vacancyPercent: 5,
      creditLossPercent: 1,
      assumptionEvidence: workingAssumptionEvidence(),
      residentialUnitTypes: [{
        id: "one-bedroom", name: "One Bedroom", units: 10, nonRevenueUnits: 0,
        averageAreaSf: 800,
        monthlyMarketRent: 2_000, reviewState: "working",
      }],
      otherIncomeLines: [{
        id: "parking", name: "Parking", amount: 100, unit: "usd_per_occupied_unit_month",
        reviewState: "working",
      }],
      operatingExpenseLines: [],
      capitalExpenditureLines: [],
    });
    const run = await runUnderwritingCase(db, savedCase!.id, operating!.caseRevision);
    const reopened = await getUnderwritingRun(db, run!.id);

    expect(run).toMatchObject({
      formulaVersion: "underwriting.apartment_operations.v1",
      status: "complete",
      caseRevision: 3,
      apartmentOperationsResult: {
        months: expect.arrayContaining([expect.objectContaining({
          residentialGrossRent: 20_000,
          totalResidentialRent: 20_000,
          otherIncome: 1_000,
          vacancyLoss: -1_050,
          creditLoss: -210,
          effectiveGrossRevenue: 19_740,
        })]),
        totals: expect.objectContaining({
          residentialGrossRent: 240_000,
          otherIncome: 12_000,
        }),
        firstStabilizedMonth: "2026-01",
        formulaTraces: expect.arrayContaining([
          expect.objectContaining({ key: "otherIncome" }),
        ]),
      },
      evidenceSnapshot: {
        apartmentOperations: expect.objectContaining({
          inputVersion: "apartment_operations_inputs.v1",
          lastChangedAt: expect.any(String),
        }),
      },
    });
    expect(run!.monthlyCostResult).toBeUndefined();
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(reopened).toEqual(run);
  });
});

describe("underwriting calculation migration", () => {
  it("enables row level security with no browser policies", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
       from pg_class
       where relname = 'underwriting_calculation_runs'
       order by relname`,
    );
    expect(rows).toEqual([{ relname: "underwriting_calculation_runs", relrowsecurity: true }]);
    const policies = await db.query(
      `select * from pg_policies where tablename = 'underwriting_calculation_runs'`,
    );
    expect(policies.rows).toEqual([]);
  });
});

function workingAssumptionEvidence() {
  return {
    operationStartMonth: { reviewState: "working" as const },
    growthStartMonth: { reviewState: "working" as const },
    preleasedUnits: { reviewState: "working" as const },
    leaseUpUnitsPerMonth: { reviewState: "working" as const },
    annualIncomeGrowthPercent: { reviewState: "working" as const },
    annualExpenseGrowthPercent: { reviewState: "working" as const },
    rentAdjustmentLossPercent: { reviewState: "working" as const },
    freeRentPercent: { reviewState: "working" as const },
    vacancyPercent: { reviewState: "working" as const },
    creditLossPercent: { reviewState: "working" as const },
  };
}
