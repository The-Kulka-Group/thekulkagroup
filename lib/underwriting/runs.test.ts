import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  saveApartmentOperations,
  saveDevelopmentCapital,
  savePropertyReturns,
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
    ).rejects.toThrow("The project changed before the calculation ran");
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
      formulaVersion: "underwriting.apartment_operations.v3",
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

  async function caseWithLeaseUp(extra: Record<string, unknown>) {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    return saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-04", growthStartMonth: "2026-04",
      preleasedUnits: 2, leaseUpUnitsPerMonth: 2, annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0,
      rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(),
      residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [],
      operatingExpenseLines: [{ id: "payroll", name: "Payroll", amount: 12_000, unit: "usd_per_year", variablePercent: 50, leadMonths: 2, reviewState: "working" }],
      capitalExpenditureLines: [],
      ...extra,
    } as Parameters<typeof saveApartmentOperations>[3]);
  }

  it("stores lease-up inputs with their evidence and runs them under v3", async () => {
    const evidence = { sourceLabel: "Leasing plan", sourceDate: "2026-09-01", reviewState: "working" };
    const operating = await caseWithLeaseUp({
      leaseUpConcession: { monthsFree: 1, leaseTermMonths: 12, timing: "at_move_in", ...evidence },
      seasonalAbsorption: { monthlyFactors: Array(12).fill(1), ...evidence },
      stabilizationRule: { targetOccupancyPercent: 90, holdMonths: 2, ...evidence },
    });
    expect(operating!.apartmentOperations!.leaseUpConcession).toEqual({ monthsFree: 1, leaseTermMonths: 12, timing: "at_move_in", ...evidence });
    expect(operating!.apartmentOperations!.operatingExpenseLines[0]).toMatchObject({ variablePercent: 50, leadMonths: 2 });
    const run = await runUnderwritingCase(db, operating!.id, operating!.caseRevision);
    expect(run!.formulaVersion).toBe("underwriting.apartment_operations.v3");
    const months = run!.apartmentOperationsResult!.months;
    const month = (label: string) => months.find((item) => item.month === label)!;
    expect(month("2026-02")).toMatchObject({ operatingExpenses: 500, operatingCashFlow: -500 });
    expect(month("2026-04")).toMatchObject({ leasedUnits: 2, leaseUpConcessionLoss: -4_000, operatingExpenses: 600 });
    // 2 leased in April, then 2 more a month: 9 of 10 is first reached in August with all 10, held two months to September.
    expect(run!.apartmentOperationsResult!.firstStabilizedMonth).toBe("2026-09");
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });

  it("returns a changed lease-up block to Working on It", async () => {
    const done = { sourceLabel: "Leasing plan", reviewState: "done" };
    const operating = await caseWithLeaseUp({ stabilizationRule: { targetOccupancyPercent: 95, holdMonths: 3, ...done } });
    const unchanged = await saveApartmentOperations(db, operating!.id, operating!.caseRevision, operating!.apartmentOperations!);
    expect(unchanged!.apartmentOperations!.stabilizationRule!.reviewState).toBe("done");
    const changed = await saveApartmentOperations(db, unchanged!.id, unchanged!.caseRevision, {
      ...unchanged!.apartmentOperations!,
      stabilizationRule: { ...unchanged!.apartmentOperations!.stabilizationRule!, holdMonths: 4 },
    });
    expect(changed!.apartmentOperations!.stabilizationRule!.reviewState).toBe("working");
  });

  it("keeps an operations run saved under v2 readable, with no concession line", async () => {
    const operating = await caseWithLeaseUp({});
    const run = await runUnderwritingCase(db, operating!.id, operating!.caseRevision);
    const { rows: columns } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'underwriting_calculation_runs' and column_name not in ('id', 'created_at')
       order by ordinal_position`,
    );
    const names = columns.map(({ column_name }) => column_name);
    const values = names.map((name) => name === "formula_version"
      ? "'underwriting.apartment_operations.v2'"
      : name === "result_snapshot"
        ? `jsonb_set(result_snapshot, '{months}', (select jsonb_agg(item - 'leaseUpConcessionLoss') from jsonb_array_elements(result_snapshot -> 'months') item)) #- '{totals,leaseUpConcessionLoss}'`
        : name);
    const { rows } = await db.query<{ id: string }>(
      `insert into underwriting_calculation_runs (${names.join(", ")})
       select ${values.join(", ")} from underwriting_calculation_runs where id = $1
       returning id`,
      [run!.id],
    );
    const legacy = await getUnderwritingRun(db, rows[0].id);
    expect(legacy!.formulaVersion).toBe("underwriting.apartment_operations.v2");
    expect(legacy!.apartmentOperationsResult).toEqual(run!.apartmentOperationsResult);
  });

  it("stores an immutable capital run with sources, uses, reserves, and debt roll-forward", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01",
      preleasedUnits: 10, leaseUpUnitsPerMonth: 1, annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0,
      rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(),
      residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
    });
    const capital = await saveDevelopmentCapital(db, savedCase!.id, operating!.caseRevision, {
      capitalInputVersion: "development_capital_inputs.v1",
      targetDebtSharePercent: 65,
      annualInterestRatePercent: 8,
      loanFeePercent: 1,
      fundingOrder: "equity_first.v1",
      interestTreatment: "capitalized_net_operating_cash.v1",
      interestConvention: "opening_balance_monthly.v1",
      feeMonth: "2026-01",
      payoffMonth: "2026-12",
      capitalAssumptionEvidence: workingCapitalEvidence(),
    });
    const run = await runUnderwritingCase(db, savedCase!.id, capital!.caseRevision);
    const reopened = await getUnderwritingRun(db, run!.id);

    expect(run).toMatchObject({
      formulaVersion: "underwriting.development_capital.v2",
      status: "complete",
      caseRevision: 4,
      inputSnapshot: {
        capitalInputVersion: "development_capital_inputs.v1",
        targetDebtSharePercent: 65,
      },
      evidenceSnapshot: {
        developmentCapital: expect.objectContaining({
          targetDebtSharePercent: 65,
          lastChangedAt: expect.any(String),
        }),
      },
      developmentCapitalResult: {
        capital: {
          totals: expect.objectContaining({ totalUses: expect.any(Number), totalDebt: expect.any(Number) }),
          months: expect.arrayContaining([expect.objectContaining({ month: "2026-12", closingDebtBalance: 0 })]),
        },
      },
    });
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(reopened).toEqual(run);
  });

  it("stores an immutable property sale and dated return run", async () => {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1,
      annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
    });
    const capital = await saveDevelopmentCapital(db, savedCase!.id, operating!.caseRevision, {
      capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
      fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
      feeMonth: "2026-01", payoffMonth: "2026-12", capitalAssumptionEvidence: workingCapitalEvidence(),
    });
    const property = await savePropertyReturns(db, savedCase!.id, capital!.caseRevision, {
      saleInputVersion: "property_returns_inputs.v1", terminalCapRatePercent: 5.75, sellingCostPercent: 1.5,
      forwardNoiConvention: "forward_twelve_month_noi.v1", cashFlowDateConvention: "month_end_dates.v1", xirrConvention: "xirr_actual_365.v1",
      saleAssumptionEvidence: workingSaleEvidence(),
    });
    const run = await runUnderwritingCase(db, savedCase!.id, property!.caseRevision);
    const reopened = await getUnderwritingRun(db, run!.id);

    expect(run).toMatchObject({
      formulaVersion: "underwriting.property_returns.v3", status: "complete", caseRevision: 5,
      inputSnapshot: { terminalCapRatePercent: 5.75, sellingCostPercent: 1.5 },
      evidenceSnapshot: { propertyReturns: expect.objectContaining({ saleInputVersion: "property_returns_inputs.v1", lastChangedAt: expect.any(String) }) },
      propertyReturnsResult: {
        forwardOperations: { startMonth: "2026-12", endMonth: "2027-11", months: expect.any(Array) },
        propertyReturns: {
          sale: expect.objectContaining({ forwardNetOperatingIncome: 240_000, debtPayoff: expect.any(Number), equitySaleProceeds: expect.any(Number) }),
          months: expect.arrayContaining([expect.objectContaining({ month: "2026-12", date: "2026-12-31" })]),
          returns: { unlevered: expect.objectContaining({ xirr: expect.any(Number) }), levered: expect.objectContaining({ xirr: expect.any(Number) }) },
        },
      },
    });
    expect(run!.propertyReturnsResult!.forwardOperations.months).toHaveLength(12);
    expect(run!.propertyReturnsResult!.lenderTests).toBeNull();
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(reopened).toEqual(run);
  });

  async function caseWithPropertyReturns(lenderTests?: Record<string, unknown>) {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1,
      annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
    });
    const capital = await saveDevelopmentCapital(db, savedCase!.id, operating!.caseRevision, {
      capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
      fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
      feeMonth: "2026-01", payoffMonth: "2026-12", capitalAssumptionEvidence: workingCapitalEvidence(),
    });
    return savePropertyReturns(db, savedCase!.id, capital!.caseRevision, {
      saleInputVersion: "property_returns_inputs.v1", terminalCapRatePercent: 5.75, sellingCostPercent: 1.5,
      forwardNoiConvention: "forward_twelve_month_noi.v1", cashFlowDateConvention: "month_end_dates.v1", xirrConvention: "xirr_actual_365.v1",
      saleAssumptionEvidence: workingSaleEvidence(),
      ...(lenderTests ? { lenderTests } : {}),
    } as Parameters<typeof savePropertyReturns>[3]);
  }

  const lenderEvidence = (reviewState: "working" | "done") => ({ sourceLabel: "Term sheet", sourceDate: "2026-10-05", reviewState });
  const lenderPlan = (overrides: Record<string, unknown> = {}) => ({
    lenderTestInputVersion: "lender_tests_inputs.v1", valuationMonth: "2026-01", asStabilizedCapRatePercent: 6,
    annualDebtService: 100_000, noiBasis: "noi_before_reserves",
    lenderTestEvidence: {
      valuationMonth: lenderEvidence("done"), asStabilizedCapRatePercent: lenderEvidence("done"),
      annualDebtService: lenderEvidence("done"), noiBasis: lenderEvidence("done"),
    },
    ...overrides,
  });

  it("stores lender tests with the property run and reopens them unchanged", async () => {
    const property = await caseWithPropertyReturns(lenderPlan());
    expect(property!.propertyReturns!.lenderTests).toMatchObject({ valuationMonth: "2026-01", annualDebtService: 100_000 });
    const run = await runUnderwritingCase(db, property!.id, property!.caseRevision);
    const reopened = await getUnderwritingRun(db, run!.id);

    const tests = run!.propertyReturnsResult!.lenderTests!;
    expect(tests).toMatchObject({ valuationStartMonth: "2026-01", valuationEndMonth: "2026-12", stabilizedNoi: 240_000, issues: [] });
    const value = (key: string) => tests.metrics.find((item) => item.key === key)!.value;
    expect(value("asStabilizedValue")).toBe(4_000_000);
    expect(value("debtServiceCoverage")).toBeCloseTo(2.4, 12);
    expect(value("loanToValue")).toBeCloseTo(tests.loanAmount / 4_000_000, 12);
    expect(reopened).toEqual(run);
  });

  it("stores only the known lender test fields", async () => {
    const property = await caseWithPropertyReturns({ ...lenderPlan(), extra: { nested: "value" } });
    expect(property!.propertyReturns!.lenderTests).not.toHaveProperty("extra");
  });

  it("returns a lender test input to Working on It when its value changes", async () => {
    const property = await caseWithPropertyReturns(lenderPlan());
    const changed = await savePropertyReturns(db, property!.id, property!.caseRevision, {
      ...property!.propertyReturns!,
      lenderTests: lenderPlan({ asStabilizedCapRatePercent: 6.5 }),
    } as Parameters<typeof savePropertyReturns>[3]);
    const evidence = changed!.propertyReturns!.lenderTests!.lenderTestEvidence;
    expect(evidence.asStabilizedCapRatePercent.reviewState).toBe("working");
    expect(evidence.annualDebtService.reviewState).toBe("done");
  });

  it("keeps a property run saved under v1 readable", async () => {
    const property = await caseWithPropertyReturns();
    const run = await runUnderwritingCase(db, property!.id, property!.caseRevision);
    const { rows: columns } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'underwriting_calculation_runs' and column_name not in ('id', 'created_at')
       order by ordinal_position`,
    );
    const names = columns.map(({ column_name }) => column_name);
    const values = names.map((name) => name === "formula_version"
      ? "'underwriting.property_returns.v1'"
      : name === "result_snapshot" ? "result_snapshot - 'lenderTests'" : name);
    const { rows } = await db.query<{ id: string }>(
      `insert into underwriting_calculation_runs (${names.join(", ")})
       select ${values.join(", ")} from underwriting_calculation_runs where id = $1
       returning id`,
      [run!.id],
    );
    const legacy = await getUnderwritingRun(db, rows[0].id);
    expect(legacy!.formulaVersion).toBe("underwriting.property_returns.v1");
    expect(legacy!.propertyReturnsResult!.propertyReturns).toEqual(run!.propertyReturnsResult!.propertyReturns);
    expect(legacy!.propertyReturnsResult!.lenderTests).toBeNull();
  });

  async function caseWithCapital(ratePath?: Record<string, unknown>) {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1,
      annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
    });
    return saveDevelopmentCapital(db, savedCase!.id, operating!.caseRevision, {
      capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
      fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
      feeMonth: "2026-01", payoffMonth: "2026-12", ...(ratePath ? { ratePath } : {}), capitalAssumptionEvidence: workingCapitalEvidence(),
    } as unknown as Parameters<typeof saveDevelopmentCapital>[3]);
  }

  it("runs the construction loan on a dated rate path and shows the rate used each month", async () => {
    const capital = await caseWithCapital({
      baseRates: [{ month: "2026-03", baseRatePercent: 4 }, { month: "2026-04", baseRatePercent: 4.5 }],
      spreadPercent: 3, curveSourceLabel: "Forward SOFR, lender quote", asOfDate: "2026-01-10",
    });
    const run = await runUnderwritingCase(db, capital!.id, capital!.caseRevision);
    const months = run!.developmentCapitalResult!.capital.months;
    expect(run!.formulaVersion).toBe("underwriting.development_capital.v2");
    expect(months[0]).toMatchObject({ annualRatePercent: 7, rateSource: "before_curve" });
    expect(months[2]).toMatchObject({ annualRatePercent: 7, rateSource: "curve" });
    expect(months[3]).toMatchObject({ annualRatePercent: 7.5, rateSource: "curve" });
    expect(months[11]).toMatchObject({ annualRatePercent: 7.5, rateSource: "after_curve" });
    expect(run!.developmentCapitalResult!.capital.rateSchedule).toMatchObject({ monthsBeforeCurve: 2, monthsAfterCurve: 8 });
    expect(await getUnderwritingRun(db, run!.id)).toEqual(run);
  });

  it("fails the run on a rate path whose as-of date is far from the analysis start", async () => {
    const capital = await caseWithCapital({
      baseRates: [{ month: "2026-01", baseRatePercent: 4 }], spreadPercent: 3, curveSourceLabel: "Forward SOFR", asOfDate: "2025-01-10",
    });
    const run = await runUnderwritingCase(db, capital!.id, capital!.caseRevision);
    expect(run!.status).toBe("failed");
    expect(run!.issues).toEqual([expect.objectContaining({ path: "ratePath.asOfDate", code: "stale_rate_curve" })]);
  });

  it("keeps a capital run saved under v1 readable at its fixed rate", async () => {
    const capital = await caseWithCapital();
    const run = await runUnderwritingCase(db, capital!.id, capital!.caseRevision);
    const { rows: columns } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'underwriting_calculation_runs' and column_name not in ('id', 'created_at')
       order by ordinal_position`,
    );
    const names = columns.map(({ column_name }) => column_name);
    const stripped = `jsonb_set(result_snapshot, '{capital}', (result_snapshot->'capital') - 'rateSchedule')`;
    const values = names.map((name) => name === "formula_version"
      ? "'underwriting.development_capital.v1'"
      : name === "result_snapshot" ? stripped : name);
    const { rows } = await db.query<{ id: string }>(
      `insert into underwriting_calculation_runs (${names.join(", ")})
       select ${values.join(", ")} from underwriting_calculation_runs where id = $1
       returning id`,
      [run!.id],
    );
    const legacy = await getUnderwritingRun(db, rows[0].id);
    expect(legacy!.formulaVersion).toBe("underwriting.development_capital.v1");
    expect(legacy!.developmentCapitalResult!.capital.rateSchedule).toBeNull();
    expect(legacy!.developmentCapitalResult!.capital.months.every(({ annualRatePercent, rateSource }) => annualRatePercent === 8 && rateSource === "fixed")).toBe(true);
    expect(legacy!.developmentCapitalResult!.capital.totals).toEqual(run!.developmentCapitalResult!.capital.totals);
  });

  const taxEvidence = (reviewState: "working" | "done") => ({ sourceLabel: "PILOT agreement", sourceDate: "2026-10-05", reviewState });
  const taxPlan = (overrides: Record<string, unknown> = {}) => ({
    taxInputVersion: "property_tax_inputs.v1", mode: "abatement", assessmentBasis: "stated_assessed_value",
    firstFiscalYearStartMonth: "2026-01", landAssessedValue: 100_000, improvementAssessedValue: 900_000, rateUnit: "mills",
    fiscalYears: [{ rate: 20, exemptionPercent: 100 }, { rate: 20, exemptionPercent: 0 }], annualRateGrowthPercent: 2,
    taxEvidence: {
      firstFiscalYearStartMonth: taxEvidence("done"), assessment: taxEvidence("done"),
      fiscalYears: taxEvidence("done"), annualRateGrowthPercent: taxEvidence("done"),
    },
    ...overrides,
  });

  async function caseWithTax(propertyTax: Record<string, unknown>) {
    const savedCase = await createUnderwritingCase(db, completeDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, savedCase!.id, savedCase!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, savedCase!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1,
      annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
      propertyTax,
    } as unknown as Parameters<typeof saveApartmentOperations>[3]);
    const capital = await saveDevelopmentCapital(db, savedCase!.id, operating!.caseRevision, {
      capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
      fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1",
      feeMonth: "2026-01", payoffMonth: "2026-12", capitalAssumptionEvidence: workingCapitalEvidence(),
    });
    return savePropertyReturns(db, savedCase!.id, capital!.caseRevision, {
      saleInputVersion: "property_returns_inputs.v1", terminalCapRatePercent: 5.75, sellingCostPercent: 1.5,
      forwardNoiConvention: "forward_twelve_month_noi.v1", cashFlowDateConvention: "month_end_dates.v1", xirrConvention: "xirr_actual_365.v1",
      saleAssumptionEvidence: workingSaleEvidence(),
      lenderTests: lenderPlan(),
      saleTax: {
        saleTaxInputVersion: "sale_tax_inputs.v1", valueBasis: "full_tax_plus_abatement_value", abatementDiscountRatePercent: 6,
        saleTaxEvidence: { valueBasis: taxEvidence("done"), abatementDiscountRatePercent: taxEvidence("done") },
      },
    } as Parameters<typeof savePropertyReturns>[3]);
  }

  it("stores a PILOT schedule and sale tax basis, then reports NOI, value and lender tests on both tax bases", async () => {
    const property = await caseWithTax(taxPlan());
    expect(property!.apartmentOperations!.propertyTax).toMatchObject({ mode: "abatement", firstFiscalYearStartMonth: "2026-01" });
    const run = await runUnderwritingCase(db, property!.id, property!.caseRevision);
    const reopened = await getUnderwritingRun(db, run!.id);

    expect(run).toMatchObject({ formulaVersion: "underwriting.property_returns.v3", status: "complete" });
    const result = run!.propertyReturnsResult!;
    // Fiscal year one exempts the improvements: 100,000 of land at 20 mills, against 1,000,000 in full.
    expect(result.lenderTests).toMatchObject({ stabilizedNoi: 238_000, fullTax: { stabilizedNoi: 220_000 } });
    expect(result.saleTax).toMatchObject({ valueBasis: "full_tax_plus_abatement_value", abatementEndMonth: "2027-12" });
    expect(result.saleTax!.abatementValue).toBeGreaterThan(0);
    expect(result.propertyReturns.sale.grossSaleValue).toBeCloseTo(result.saleTax!.fullTaxValue + result.saleTax!.abatementValue!, 2);
    expect(result.propertyTax!.fiscalYears[0]).toMatchObject({ annualScheduledTax: 2_000, annualFullTax: 20_000, chargedMonths: 12 });
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(reopened).toEqual(run);
  });

  it("returns changed tax evidence to Working on It and leaves the rest", async () => {
    const property = await caseWithTax(taxPlan());
    const { lastChangedAt, ...operations } = property!.apartmentOperations!;
    void lastChangedAt;
    const changed = await saveApartmentOperations(db, property!.id, property!.caseRevision, {
      ...operations,
      propertyTax: taxPlan({ fiscalYears: [{ rate: 21, exemptionPercent: 100 }, { rate: 21, exemptionPercent: 0 }] }),
    } as Parameters<typeof saveApartmentOperations>[3]);
    const evidence = changed!.apartmentOperations!.propertyTax!.taxEvidence;
    expect(evidence.fiscalYears.reviewState).toBe("working");
    expect(evidence.assessment.reviewState).toBe("done");
  });

  const incomeTaxPlan = (overrides: Record<string, unknown> = {}) => taxPlan({
    mode: "abatement", assessmentBasis: "income", landAssessedValue: undefined, improvementAssessedValue: undefined,
    assessorExpenseRatioPercent: 30, assessmentCapRatePercent: 8.6, assessmentRatioPercent: 100,
    fiscalYears: [{ rate: 18.8172, exemptionPercent: 50 }], annualRateGrowthPercent: 0,
    ...overrides,
  });

  it("stores a lease-up cap rate, runs it, and reports both rates", async () => {
    const property = await caseWithTax(incomeTaxPlan({ leaseUpAssessmentCapRatePercent: 7 }));
    expect(property!.apartmentOperations!.propertyTax).toMatchObject({ assessmentCapRatePercent: 8.6, leaseUpAssessmentCapRatePercent: 7 });
    const run = await runUnderwritingCase(db, property!.id, property!.caseRevision);
    expect(run!.issues, JSON.stringify(run!.issues)).toEqual([]);
    expect(run).toMatchObject({ status: "complete" });
    expect(run!.propertyReturnsResult!.propertyTax!.capRates).toEqual({ leaseUpPercent: 7, stabilizedPercent: 8.6, stabilizedFromMonth: "2026-01" });
    expect((await getUnderwritingRun(db, run!.id))).toEqual(run);
  });

  it("returns the assessment evidence to Working on It when the lease-up cap rate changes or is removed", async () => {
    const property = await caseWithTax(incomeTaxPlan({ leaseUpAssessmentCapRatePercent: 7 }));
    const { lastChangedAt, ...operations } = property!.apartmentOperations!;
    void lastChangedAt;
    const save = (revision: number, propertyTax: Record<string, unknown>) => saveApartmentOperations(db, property!.id, revision, {
      ...operations, propertyTax,
    } as Parameters<typeof saveApartmentOperations>[3]);
    const unchanged = await save(property!.caseRevision, incomeTaxPlan({ leaseUpAssessmentCapRatePercent: 7 }));
    expect(unchanged!.apartmentOperations!.propertyTax!.taxEvidence.assessment.reviewState).toBe("done");
    const changed = await save(unchanged!.caseRevision, incomeTaxPlan({ leaseUpAssessmentCapRatePercent: 6.5 }));
    expect(changed!.apartmentOperations!.propertyTax!.taxEvidence.assessment.reviewState).toBe("working");
    expect(changed!.apartmentOperations!.propertyTax!.taxEvidence.fiscalYears.reviewState).toBe("done");
    const removed = await save(changed!.caseRevision, incomeTaxPlan());
    expect(removed!.apartmentOperations!.propertyTax).not.toHaveProperty("leaseUpAssessmentCapRatePercent");
  });

  it("keeps runs saved before the tax schedule readable", async () => {
    const property = await caseWithPropertyReturns();
    const run = await runUnderwritingCase(db, property!.id, property!.caseRevision);
    const { rows: columns } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'underwriting_calculation_runs' and column_name not in ('id', 'created_at')
       order by ordinal_position`,
    );
    const names = columns.map(({ column_name }) => column_name);
    const values = names.map((name) => name === "formula_version"
      ? "'underwriting.property_returns.v2'"
      : name === "result_snapshot" ? "result_snapshot - 'saleTax' - 'propertyTax'" : name);
    const { rows } = await db.query<{ id: string }>(
      `insert into underwriting_calculation_runs (${names.join(", ")})
       select ${values.join(", ")} from underwriting_calculation_runs where id = $1
       returning id`,
      [run!.id],
    );
    const legacy = await getUnderwritingRun(db, rows[0].id);
    expect(legacy!.formulaVersion).toBe("underwriting.property_returns.v2");
    expect(legacy!.propertyReturnsResult!.saleTax).toBeNull();
    expect(legacy!.propertyReturnsResult!.propertyTax).toBeNull();
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

function workingCapitalEvidence() {
  const item = () => ({ reviewState: "working" as const });
  return {
    targetDebtSharePercent: item(), annualInterestRatePercent: item(), loanFeePercent: item(), fundingOrder: item(),
    interestTreatment: item(), interestConvention: item(), feeMonth: item(), payoffMonth: item(),
  };
}

function workingSaleEvidence() {
  const item = () => ({ reviewState: "working" as const });
  return {
    saleMonth: item(), terminalCapRatePercent: item(), sellingCostPercent: item(),
    forwardNoiConvention: item(), cashFlowDateConvention: item(), xirrConvention: item(),
  };
}
