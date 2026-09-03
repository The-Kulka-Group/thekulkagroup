import { describe, expect, it } from "vitest";

import golden from "./fixtures/apartment-development-model-v2.98-operations.json";
import {
  APARTMENT_OPERATIONS_FORMULA_VERSION,
  APARTMENT_OPERATIONS_INPUT_VERSION,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
} from "./apartment-operations";

const complete: ApartmentOperationsInputs = {
  inputVersion: APARTMENT_OPERATIONS_INPUT_VERSION,
  analysisStartMonth: "2026-01",
  saleMonth: "2027-12",
  costLines: [{
    id: "land",
    name: "Land",
    category: "land",
    amount: 1_000_000,
    unit: "usd",
    startMonth: "2026-01",
    endMonth: "2026-01",
    distributionMethod: "straight_line",
    distributionVersion: "straight_line.v1",
    reviewState: "done",
  }],
  operationStartMonth: "2027-01",
  growthStartMonth: "2027-01",
  preleasedUnits: 10,
  leaseUpUnitsPerMonth: 10,
  annualIncomeGrowthPercent: 3,
  annualExpenseGrowthPercent: 3,
  rentAdjustmentLossPercent: 2,
  freeRentPercent: 1,
  vacancyPercent: 5,
  creditLossPercent: 1,
  assumptionEvidence: {
    operationStartMonth: { sourceLabel: "Schedule", sourceDate: "2026-08-01", reviewState: "done" },
    growthStartMonth: { sourceLabel: "Market study", sourceDate: "2026-08-01", reviewState: "done" },
    preleasedUnits: { sourceLabel: "Lease-up plan", sourceDate: "2026-08-01", reviewState: "done" },
    leaseUpUnitsPerMonth: { sourceLabel: "Lease-up plan", sourceDate: "2026-08-01", reviewState: "done" },
    annualIncomeGrowthPercent: { sourceLabel: "Market study", sourceDate: "2026-08-01", reviewState: "done" },
    annualExpenseGrowthPercent: { sourceLabel: "Expense budget", sourceDate: "2026-08-01", reviewState: "done" },
    rentAdjustmentLossPercent: { sourceLabel: "Rent roll", sourceDate: "2026-08-01", reviewState: "done" },
    freeRentPercent: { sourceLabel: "Lease-up plan", sourceDate: "2026-08-01", reviewState: "done" },
    vacancyPercent: { sourceLabel: "Market study", sourceDate: "2026-08-01", reviewState: "done" },
    creditLossPercent: { sourceLabel: "Operating history", sourceDate: "2026-08-01", reviewState: "done" },
  },
  residentialUnitTypes: [{
    id: "one-bedroom",
    name: "One Bedroom",
    units: 100,
    nonRevenueUnits: 2,
    averageAreaSf: 850,
    monthlyMarketRent: 2_000,
    sourceLabel: "Approved unit program",
    sourceDate: "2026-08-01",
    reviewState: "done",
  }],
  otherIncomeLines: [{
    id: "parking",
    name: "Parking",
    amount: 75,
    unit: "usd_per_occupied_unit_month",
    reviewState: "working",
  }],
  operatingExpenseLines: [
    {
      id: "payroll",
      name: "Payroll",
      amount: 120_000,
      unit: "usd_per_year",
      reviewState: "working",
    },
    {
      id: "management",
      name: "Management Fee",
      amount: 3,
      unit: "percent_effective_gross_revenue",
      reviewState: "working",
    },
  ],
  capitalExpenditureLines: [{
    id: "replacement-reserve",
    name: "Replacement Reserve",
    amount: 250,
    unit: "usd_per_unit_year",
    reviewState: "working",
  }],
};

describe("computeApartmentOperations", () => {
  it("adds lease-up and separate operating cash-flow lines to the cost timeline", () => {
    const run = computeApartmentOperations(complete);

    expect(run).toMatchObject({
      formulaVersion: APARTMENT_OPERATIONS_FORMULA_VERSION,
      status: "complete",
      issues: [],
      inputSnapshot: complete,
    });
    expect(run.result?.months).toHaveLength(24);
    expect(run.result?.months[11]).toMatchObject({
      month: "2026-12",
      leasedUnits: 0,
      residentialGrossRent: 0,
      otherIncome: 0,
      operatingCashFlow: 0,
    });
    expect(run.result?.months[12]).toMatchObject({
      month: "2027-01",
      revenueUnits: 98,
      leasedUnits: 10,
      occupiedUnits: 10,
      residentialGrossRent: 200_000,
      nonRevenueRentAdjustment: -4_000,
      leaseUpLoss: -176_000,
      rentAdjustmentLoss: -400,
      freeRentLoss: -200,
      totalResidentialRent: 19_400,
      otherIncome: 750,
      totalPotentialIncome: 20_150,
      vacancyLoss: -1_007.5,
      creditLoss: -201.5,
      effectiveGrossRevenue: 18_941,
      operatingExpenses: 10_568.23,
      netOperatingIncome: 8_372.77,
      capitalExpenditures: 2_083.33,
      operatingCashFlow: 6_289.44,
    });
    expect(run.result?.firstStabilizedMonth).toBe("2027-10");
    expect(run.result?.unitSummary).toEqual({
      totalUnits: 100,
      revenueUnits: 98,
      nonRevenueUnits: 2,
      totalAreaSf: 85_000,
    });
    expect(run.result?.formulaTraces.map(({ key }) => key)).toEqual(expect.arrayContaining([
      "totalResidentialRent",
      "otherIncome",
      "vacancyLoss",
      "creditLoss",
      "netOperatingIncome",
      "operatingCashFlow",
    ]));
    expect(run.reconciliations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "unit-total", status: "pass" }),
      expect.objectContaining({ id: "area-total", status: "pass" }),
      expect.objectContaining({ id: "operating-cash-flow-total", status: "pass" }),
    ]));
    expect(run.reconciliations.every(({ status }) => status === "pass")).toBe(true);
  });

  it("matches the workbook normalized annual operating fixture within stated tolerances", () => {
    const run = computeApartmentOperations(golden.inputs as ApartmentOperationsInputs);
    const result = run.result!;
    const operationMonth = result.months.findIndex((month) => month.revenueUnits > 0) + 1;
    const stabilizedMonth = result.months.findIndex((month) => month.leasedUnits === month.revenueUnits && month.revenueUnits > 0) + 1;
    const stabilizedYear = result.months.slice(stabilizedMonth - 1, stabilizedMonth + 11);

    expect(run.status).toBe("complete");
    expect(operationMonth).toBe(golden.expectedOperationMonth);
    expect(stabilizedMonth).toBe(golden.expectedStabilizedMonth);
    for (const [key, expected] of Object.entries(golden.expected)) {
      const actual = stabilizedYear.reduce((sum, month) => sum + Number(month[key as keyof typeof month]), 0);
      expect(actual).toBeCloseTo(expected, 2);
    }
    expect(result.firstStabilizedMonth).toBe(golden.expectedFirstStabilizedMonth);
  });

  it("applies income and expense growth on each start-month anniversary", () => {
    const run = computeApartmentOperations({
      ...complete,
      saleMonth: "2028-01",
      preleasedUnits: 98,
      annualIncomeGrowthPercent: 3,
      annualExpenseGrowthPercent: 4,
    });

    expect(run.result?.months.find(({ month }) => month === "2027-01")?.residentialGrossRent).toBe(200_000);
    expect(run.result?.months.find(({ month }) => month === "2028-01")?.residentialGrossRent).toBe(206_000);
    expect(run.result?.months.find(({ month }) => month === "2028-01")?.capitalExpenditures).toBe(2_166.67);
  });

  it.each([
    ["operation before analysis", { operationStartMonth: "2025-12" }, "outside_timeline"],
    ["operation after sale", { operationStartMonth: "2028-01" }, "outside_timeline"],
    ["no unit types", { residentialUnitTypes: [] }, "missing_lines"],
    ["non-revenue units over unit count", { residentialUnitTypes: [{ ...complete.residentialUnitTypes[0], nonRevenueUnits: 101 }] }, "invalid_units"],
    ["invalid average area", { residentialUnitTypes: [{ ...complete.residentialUnitTypes[0], averageAreaSf: 0 }] }, "invalid_units"],
    ["negative lease pace", { leaseUpUnitsPerMonth: -1 }, "invalid_units"],
    ["growth over one hundred percent", { annualIncomeGrowthPercent: 101 }, "invalid_percent"],
    ["vacancy over one hundred percent", { vacancyPercent: 101 }, "invalid_percent"],
    ["duplicate line IDs", { otherIncomeLines: [{ ...complete.otherIncomeLines[0] }, { ...complete.otherIncomeLines[0] }] }, "duplicate_id"],
    ["unsupported expense unit", { operatingExpenseLines: [{ ...complete.operatingExpenseLines[0], unit: "usd_per_month" }] }, "unsupported_unit"],
  ])("returns typed issues and no result for %s", (_label, override, code) => {
    const run = computeApartmentOperations({ ...complete, ...override } as ApartmentOperationsInputs);

    expect(run.status).toBe("failed");
    expect(run.result).toBeNull();
    expect(run.reconciliations).toEqual([]);
    expect(run.issues).toContainEqual(expect.objectContaining({ code }));
  });

  it("does not mutate the submitted input", () => {
    const before = structuredClone(complete);
    computeApartmentOperations(complete);
    expect(complete).toEqual(before);
  });
});
