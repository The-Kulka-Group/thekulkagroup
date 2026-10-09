import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  saveApartmentOperations,
  saveUnderwritingCostSchedule,
  type CaseDraft,
} from "./cases";
import { parseApartmentOperations } from "./operations-input";
import { buildUnderwritingReview } from "./presentation";
import { monthlyInputsFor, getUnderwritingRun, runUnderwritingCase } from "./runs";
import { parseCostSchedule } from "./schedule-input";

/*
 * LA-1871. A case saved with commercial spaces runs through the real migrations: the run carries
 * the commercial result, saves the commercial sources with its evidence snapshot and reopens
 * unchanged, and a space is never a unit.
 */

let db: Awaited<ReturnType<typeof seededDatabase>>;

const draft: CaseDraft = {
  name: "Commercial run case",
  address: "100 Test Avenue",
  proposedUnits: 48,
  grossBuildingSquareFeet: 52000,
  assumptions: { purchasePrice: 4_200_000, constructionMonths: 20 },
};

const schedule = {
  analysisStartMonth: "2026-01",
  saleMonth: "2027-12",
  costLines: [{ id: "land", name: "Land", category: "land" as const, amount: 1_000_000, unit: "usd" as const, startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line" as const, distributionVersion: "straight_line.v1" as const, reviewState: "working" as const }],
};

const done = { sourceLabel: "Broker opinion", sourceDate: "2026-10-01", reviewState: "done" as const };

function operations(withCommercial: boolean) {
  return {
    inputVersion: "apartment_operations_inputs.v1",
    operationStartMonth: "2026-02",
    growthStartMonth: "2026-02",
    preleasedUnits: 10,
    leaseUpUnitsPerMonth: 4,
    annualIncomeGrowthPercent: 3,
    annualExpenseGrowthPercent: 3,
    rentAdjustmentLossPercent: 0,
    freeRentPercent: 0,
    vacancyPercent: 5,
    creditLossPercent: 1,
    assumptionEvidence: Object.fromEntries([
      "operationStartMonth", "growthStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth",
      "annualIncomeGrowthPercent", "annualExpenseGrowthPercent", "rentAdjustmentLossPercent",
      "freeRentPercent", "vacancyPercent", "creditLossPercent",
    ].map((key) => [key, done])),
    residentialUnitTypes: [{ id: "one-bedroom", name: "One Bedroom", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, ...done }],
    otherIncomeLines: [],
    operatingExpenseLines: withCommercial ? [{ id: "cam", name: "Common Area Maintenance", amount: 30_000, unit: "usd_per_year", appliesTo: "commercial", ...done }] : [],
    capitalExpenditureLines: [],
    ...(withCommercial ? {
      commercial: {
        spaces: [{
          id: "retail",
          name: "Ground Floor Retail",
          areaSf: 2_500,
          annualRentPerSf: 36,
          leaseStartMonth: "2026-04",
          freeRentMonths: 2,
          recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 20 }],
          tenantImprovementPerSf: 40,
          leasingCommissionPercent: 4,
          leaseTermMonths: 120,
          sourceLabel: "Broker opinion",
          sourceDate: "2026-10-01",
          reviewState: "working",
        }],
        vacancyPercent: 10,
        creditLossPercent: 1,
        ...done,
      },
    } : {}),
  };
}

async function savedCase(withCommercial: boolean) {
  const created = await createUnderwritingCase(db, draft);
  const scheduled = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, parseCostSchedule(schedule));
  const saved = await saveApartmentOperations(
    db,
    scheduled!.id,
    scheduled!.caseRevision,
    parseApartmentOperations(operations(withCommercial), monthlyInputsFor(scheduled!.costSchedule!)),
  );
  return saved!;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

describe("running a case with commercial spaces", () => {
  it("saves the commercial result and sources with the run and reopens it unchanged", async () => {
    const saved = await savedCase(true);
    const run = await runUnderwritingCase(db, saved.id, saved.caseRevision);
    expect(run!.status, JSON.stringify(run!.issues)).toBe("complete");
    const result = run!.apartmentOperationsResult!;
    expect(result.commercial!.spaces).toHaveLength(1);
    expect(result.commercial!.spaces[0]).toMatchObject({ name: "Ground Floor Retail", leaseStartMonth: "2026-04", tenantImprovements: 100_000 });
    expect(result.totals.commercialNetOperatingIncome).toBeGreaterThan(0);
    expect(result.totals.netOperatingIncome).toBeCloseTo(result.totals.residentialNetOperatingIncome + result.totals.commercialNetOperatingIncome, 2);
    const costLines = result.costSchedule.costLineSchedules.map(({ lineId }) => lineId);
    expect(costLines).toEqual(expect.arrayContaining(["commercial-ti:retail", "commercial-commission:retail"]));
    expect(run!.evidenceSnapshot.apartmentOperations!.commercial!.spaces[0]).toMatchObject({ id: "retail", sourceLabel: "Broker opinion", reviewState: "working" });
    expect(run!.evidenceSnapshot.apartmentOperations!.commercial).toMatchObject({ vacancyPercent: 10, reviewState: "done" });
    expect(run!.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(await getUnderwritingRun(db, run!.id)).toEqual(run);
  });

  it("never counts a space as a unit", async () => {
    const withSpace = await runUnderwritingCase(db, (await savedCase(true)).id, 3);
    const without = await runUnderwritingCase(db, (await savedCase(false)).id, 3);
    expect(withSpace!.apartmentOperationsResult!.unitSummary).toEqual(without!.apartmentOperationsResult!.unitSummary);
    expect(withSpace!.apartmentOperationsResult!.months.map(({ leasedUnits }) => leasedUnits))
      .toEqual(without!.apartmentOperationsResult!.months.map(({ leasedUnits }) => leasedUnits));
  });

  it("reads a run with no commercial block as having none", async () => {
    const saved = await savedCase(false);
    const run = await runUnderwritingCase(db, saved.id, saved.caseRevision);
    expect(run!.apartmentOperationsResult!.commercial).toBeUndefined();
    expect(run!.evidenceSnapshot.apartmentOperations).not.toHaveProperty("commercial");
    expect(run!.apartmentOperationsResult!.totals.commercialNetOperatingIncome).toBe(0);
  });

  it("lists each commercial space and the block as an open item until it has a source and is done", async () => {
    const saved = await savedCase(true);
    const rows = (value: typeof saved) => new Map(buildUnderwritingReview(value, undefined, false).groups.flatMap((group) => group.rows).map((row) => [row.id, row.gaps]));
    const open = rows(saved);
    expect(open.get("operations-retail")).toEqual(["Working on It"]);
    expect(open.has("operations-commercial")).toBe(false);
    const unsourced = await savedCase(true);
    const block = { ...unsourced.apartmentOperations!.commercial!, sourceLabel: undefined, reviewState: "working" as const };
    const gaps = rows({ ...unsourced, apartmentOperations: { ...unsourced.apartmentOperations!, commercial: block } }).get("operations-commercial");
    expect(gaps).toEqual(expect.arrayContaining(["No Source Label", "Working on It"]));
  });
});
