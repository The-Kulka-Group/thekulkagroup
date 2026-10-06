import { describe, expect, it } from "vitest";

import {
  APARTMENT_OPERATIONS_INPUT_VERSION,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type ResidentialUnitType,
} from "./apartment-operations";
import { affordabilityReport, summarizeAffordabilityTiers } from "./affordability-tiers";

const done = { sourceLabel: "Test", sourceDate: "2026-08-01", reviewState: "done" as const };
const evidenceKeys = [
  "operationStartMonth", "growthStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth", "annualIncomeGrowthPercent",
  "annualExpenseGrowthPercent", "rentAdjustmentLossPercent", "freeRentPercent", "vacancyPercent", "creditLossPercent",
] as const;

const unit = (id: string, over: Partial<ResidentialUnitType>): ResidentialUnitType => ({
  id, name: id, units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, ...done, ...over,
});

const input = (residentialUnitTypes: ResidentialUnitType[], over: Partial<ApartmentOperationsInputs> = {}): ApartmentOperationsInputs => ({
  inputVersion: APARTMENT_OPERATIONS_INPUT_VERSION,
  analysisStartMonth: "2026-01",
  saleMonth: "2028-12",
  costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "done" }],
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
  assumptionEvidence: Object.fromEntries(evidenceKeys.map((key) => [key, done])) as ApartmentOperationsInputs["assumptionEvidence"],
  residentialUnitTypes,
  otherIncomeLines: [{ id: "parking", name: "Parking", amount: 75, unit: "usd_per_occupied_unit_month", reviewState: "working" }],
  operatingExpenseLines: [
    { id: "payroll", name: "Payroll", amount: 120_000, unit: "usd_per_year", reviewState: "working" },
    { id: "repairs", name: "Repairs", amount: 400, unit: "usd_per_unit_year", reviewState: "working" },
  ],
  capitalExpenditureLines: [],
  ...over,
});

const run = (types: ResidentialUnitType[]) => {
  const result = computeApartmentOperations(input(types));
  expect(result.issues).toEqual([]);
  return result.result!;
};

describe("affordability tiers", () => {
  it("reads a deal with only market units as all market", () => {
    const types = [unit("a", {}), unit("b", { units: 20, averageAreaSf: 650, monthlyMarketRent: 1_700 })];
    const report = affordabilityReport(types, run(types));
    expect(report.problems).toEqual([]);
    expect(report.tiers.map(({ tier, units }) => [tier, units])).toEqual([["market", 30], ["workforce", 0], ["affordable", 0]]);
    const noi = report.noi!;
    expect(noi.tiers[0].netOperatingIncome).toBe(noi.total.netOperatingIncome);
    expect(noi.tiers[1].netOperatingIncome).toBe(0);
  });

  it("splits units, rentable SF, rent and AMI by tier for a mix", () => {
    const types = [
      unit("m", { units: 60, averageAreaSf: 900, monthlyMarketRent: 3_000 }),
      unit("w", { units: 20, averageAreaSf: 800, monthlyMarketRent: 2_200, affordabilityTier: "workforce", amiPercent: 100 }),
      unit("a1", { units: 10, nonRevenueUnits: 1, averageAreaSf: 700, monthlyMarketRent: 1_400, affordabilityTier: "affordable", amiPercent: 60 }),
      unit("a2", { units: 10, averageAreaSf: 750, monthlyMarketRent: 1_600, affordabilityTier: "affordable", amiPercent: 80 }),
    ];
    const { tiers, total } = summarizeAffordabilityTiers(types);
    const affordable = tiers.find(({ tier }) => tier === "affordable")!;
    expect(affordable).toMatchObject({ unitTypeCount: 2, units: 20, revenueUnits: 19, nonRevenueUnits: 1, rentableSf: 14_500, minAmiPercent: 60, maxAmiPercent: 80 });
    expect(affordable.averageMonthlyRent).toBeCloseTo((1_400 * 9 + 1_600 * 10) / 19, 6);
    expect(tiers.find(({ tier }) => tier === "market")!.minAmiPercent).toBeNull();
    expect(total).toEqual({ units: 100, revenueUnits: 99, rentableSf: 60 * 900 + 20 * 800 + 14_500 });
  });

  it("counts every tier's units and SF in the totals, so affordable SF is never left out", () => {
    const types = [unit("m", { units: 50 }), unit("a", { units: 50, affordabilityTier: "affordable", amiPercent: 60 })];
    const result = run(types);
    const report = affordabilityReport(types, result);
    expect(report.total.units).toBe(result.unitSummary.totalUnits);
    expect(report.total.rentableSf).toBe(result.unitSummary.totalAreaSf);
    expect(report.problems).toEqual([]);
    const perSf = report.noi!.tiers.map((row, index) => row.noiPerRentableSf! * report.tiers[index].rentableSf);
    expect(perSf[0] + perSf[2]).toBeCloseTo(report.noi!.total.netOperatingIncome, 1);
  });

  it("keeps a tier with zero units in the report with null averages", () => {
    const types = [unit("m", {}), unit("a", { affordabilityTier: "affordable", amiPercent: 50 })];
    const report = affordabilityReport(types, run(types));
    const workforce = report.tiers.find(({ tier }) => tier === "workforce")!;
    expect(workforce).toMatchObject({ units: 0, rentableSf: 0, averageAreaSf: null, averageMonthlyRent: null });
    const workforceNoi = report.noi!.tiers.find(({ tier }) => tier === "workforce")!;
    expect(workforceNoi).toMatchObject({ netOperatingIncome: 0, noiPerUnit: null, noiPerRentableSf: null });
  });

  it("adds tier NOI to the run's NOI to the cent for odd splits", () => {
    const types = [
      unit("m", { units: 33, monthlyMarketRent: 2_731 }),
      unit("w", { units: 17, monthlyMarketRent: 1_949, affordabilityTier: "workforce", amiPercent: 90 }),
      unit("a", { units: 11, nonRevenueUnits: 1, monthlyMarketRent: 1_117, affordabilityTier: "affordable", amiPercent: 50 }),
    ];
    const report = affordabilityReport(types, run(types));
    expect(report.problems).toEqual([]);
    const cents = (value: number) => Math.round(value * 100);
    expect(report.noi!.tiers.reduce((total, row) => total + cents(row.netOperatingIncome), 0)).toBe(cents(report.noi!.total.netOperatingIncome));
    expect(report.noi!.months).toBe(12);
  });

  it("reports no tier NOI when the property never stabilizes", () => {
    const types = [unit("m", {})];
    const result = computeApartmentOperations(input(types, { preleasedUnits: 0, leaseUpUnitsPerMonth: 1, saleMonth: "2027-03" })).result!;
    expect(result.firstStabilizedMonth).toBeUndefined();
    expect(affordabilityReport(types, result).noi).toBeNull();
  });
});

describe("affordability validation", () => {
  const issues = (types: ResidentialUnitType[]) => computeApartmentOperations(input(types)).issues.map(({ path, code }) => `${path}:${code}`);

  it("accepts a missing tier and a tiered type with an AMI percent", () => {
    expect(issues([unit("a", {}), unit("b", { affordabilityTier: "affordable", amiPercent: 60 }), unit("c", { affordabilityTier: "workforce" })])).toEqual([]);
  });

  it("rejects an unknown tier, an AMI on a market type, and a bad AMI percent", () => {
    expect(issues([unit("a", { affordabilityTier: "luxury" as never })])).toContain("residentialUnitTypes.0.affordabilityTier:invalid_affordability_tier");
    expect(issues([unit("a", { amiPercent: 60 })])).toContain("residentialUnitTypes.0.amiPercent:invalid_affordability_tier");
    expect(issues([unit("a", { affordabilityTier: "affordable", amiPercent: 0 })])).toContain("residentialUnitTypes.0.amiPercent:invalid_percent");
    expect(issues([unit("a", { affordabilityTier: "affordable", amiPercent: 250 })])).toContain("residentialUnitTypes.0.amiPercent:invalid_percent");
  });
});
