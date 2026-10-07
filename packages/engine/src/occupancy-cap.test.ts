import { describe, expect, it } from "vitest";

import { computeApartmentOperations, type ApartmentOperationsInputs, type MonthlyApartmentOperations } from "./apartment-operations";
import { APARTMENT_SCENARIO_INPUT_VERSION, runApartmentScenarioComparison } from "./apartment-scenarios";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";

/*
 * LA-1849. One hundred revenue units at $1,000 a month, ten pre-leased and twenty more a month, so
 * the units leased each month can be checked by hand: 10, 30, 50, 70, 90, then the cap.
 */

const evidence = { sourceLabel: "Cap memo", sourceDate: "2026-10-07", reviewState: "done" as const };

const base: ApartmentOperationsInputs = {
  inputVersion: "apartment_operations_inputs.v1",
  analysisStartMonth: "2026-01",
  saleMonth: "2028-12",
  costLines: [{
    id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd",
    startMonth: "2026-01", endMonth: "2026-01",
    distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "done",
  }],
  operationStartMonth: "2027-01",
  growthStartMonth: "2027-01",
  preleasedUnits: 10,
  leaseUpUnitsPerMonth: 20,
  annualIncomeGrowthPercent: 0,
  annualExpenseGrowthPercent: 0,
  rentAdjustmentLossPercent: 0,
  freeRentPercent: 0,
  vacancyPercent: 7,
  creditLossPercent: 0,
  assumptionEvidence: {
    operationStartMonth: evidence, growthStartMonth: evidence, preleasedUnits: evidence,
    leaseUpUnitsPerMonth: evidence, annualIncomeGrowthPercent: evidence, annualExpenseGrowthPercent: evidence,
    rentAdjustmentLossPercent: evidence, freeRentPercent: evidence, vacancyPercent: evidence, creditLossPercent: evidence,
  },
  residentialUnitTypes: [
    { id: "market", name: "Market", units: 100, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 1_000, affordabilityTier: "market", ...evidence },
  ],
  otherIncomeLines: [],
  operatingExpenseLines: [],
  capitalExpenditureLines: [],
};

const capped: ApartmentOperationsInputs = { ...base, occupancyCap: evidence };

function run(input: ApartmentOperationsInputs) {
  const result = computeApartmentOperations(input);
  expect(result.issues).toEqual([]);
  return result.result!;
}

function month(months: MonthlyApartmentOperations[], label: string) {
  return months.find(({ month: value }) => value === label)!;
}

function issueCodes(input: ApartmentOperationsInputs) {
  return computeApartmentOperations(input).issues.map(({ path, code }) => `${path}:${code}`);
}

describe("occupancy cap", () => {
  it("stops leased units at one less the vacancy percent of revenue units", () => {
    const { months } = run(capped);
    expect(["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06", "2028-12"].map((label) => month(months, label).leasedUnits))
      .toEqual([10, 30, 50, 70, 90, 93, 93]);
  });

  it("charges no vacancy loss and lets lease-up loss carry the unleased units", () => {
    const { months, totals } = run(capped);
    expect(totals.vacancyLoss).toBe(0);
    expect(month(months, "2027-03").leaseUpLoss).toBe(-(100 - 50) * 1_000);
    // At the cap, lease-up loss is the vacancy: seven units of rent.
    expect(month(months, "2027-06").leaseUpLoss).toBe(-7 * 1_000);
    expect(month(months, "2027-06").effectiveGrossRevenue).toBe(93 * 1_000);
  });

  it("reaches the same stabilized revenue as the vacancy percent, and earns more on the way", () => {
    const withPercent = run(base).months;
    const withCap = run(capped).months;
    expect(month(withCap, "2028-06").effectiveGrossRevenue).toBe(month(withPercent, "2028-06").effectiveGrossRevenue);
    expect(month(withCap, "2027-03").effectiveGrossRevenue).toBeGreaterThan(month(withPercent, "2027-03").effectiveGrossRevenue);
    expect(month(withPercent, "2028-06").vacancyLoss).toBe(-7 * 1_000);
    expect(month(withPercent, "2028-06").leasedUnits).toBe(100);
  });

  it("calls the property stabilized in the first month at the cap when there is no rule", () => {
    expect(run(capped).firstStabilizedMonth).toBe("2027-06");
    expect(run(base).firstStabilizedMonth).toBe("2027-06");
    const slow = { ...capped, leaseUpUnitsPerMonth: 10 };
    expect(run(slow).firstStabilizedMonth).toBe("2027-10");
    expect(run({ ...slow, occupancyCap: undefined }).firstStabilizedMonth).toBe("2027-10");
  });

  it("holds a stabilization rule at or below the cap and fails one above it", () => {
    const rule = (targetOccupancyPercent: number) => ({ ...capped, stabilizationRule: { targetOccupancyPercent, holdMonths: 2, ...evidence } });
    expect(run(rule(90)).firstStabilizedMonth).toBe("2027-06");
    expect(run(rule(93)).firstStabilizedMonth).toBe("2027-07");
    const failure = computeApartmentOperations(rule(95));
    expect(failure.status).toBe("failed");
    expect(failure.issues).toEqual([expect.objectContaining({ path: "stabilizationRule.targetOccupancyPercent", code: "occupancy_cap_conflict" })]);
    expect(failure.issues[0].message).toContain("93 percent");
  });

  it("fails when pre-leased units are above the cap", () => {
    expect(issueCodes({ ...capped, preleasedUnits: 94 })).toEqual(["preleasedUnits:occupancy_cap_conflict"]);
    expect(issueCodes({ ...capped, preleasedUnits: 93 })).toEqual([]);
  });

  it("rounds a per-occupied-unit line to whole cents when the cap leaves a fraction of a unit", () => {
    const withIncome = {
      ...capped,
      vacancyPercent: 6.5,
      otherIncomeLines: [{ id: "parking", name: "Parking", amount: 33.33, unit: "usd_per_occupied_unit_month" as const, ...evidence }],
    };
    const { months } = run(withIncome);
    const atCap = month(months, "2028-06");
    expect(atCap.leasedUnits).toBeCloseTo(93.5, 9);
    expect(atCap.otherIncome).toBe(Math.round(33.33 * 93.5 * 100) / 100);
    expect(months.every((item) => Number.isInteger(Math.round(item.operatingCashFlow * 100)) && Math.abs(item.operatingCashFlow * 100 - Math.round(item.operatingCashFlow * 100)) < 1e-6)).toBe(true);
  });

  it("keeps credit loss on potential income", () => {
    const { months } = run({ ...capped, creditLossPercent: 1 });
    expect(month(months, "2028-06").creditLoss).toBe(-0.01 * 93 * 1_000);
  });

  it("stops lease turnover once leased units reach the cap", () => {
    const turnover = { turnoverPercent: 50, leaseTermMonths: 3, vacantMonths: 1, basis: "each_new_lease_once" as const, ...evidence };
    const { months } = run({ ...capped, leaseTurnover: turnover });
    const leased = months.filter(({ month: label }) => label >= "2027-01" && label <= "2028-12").map((item) => item.leasedUnits);
    const firstAtCap = leased.indexOf(93);
    expect(firstAtCap).toBeGreaterThan(0);
    expect(leased.slice(firstAtCap).every((units) => units === 93)).toBe(true);
    expect(Math.max(...leased)).toBeLessThanOrEqual(93);
  });

  it("gives the same months as before when the block is absent", () => {
    const withoutBlock = run(base);
    expect(withoutBlock.totals.vacancyLoss).toBeLessThan(0);
    expect(month(withoutBlock.months, "2027-06").leasedUnits).toBe(100);
    expect(withoutBlock.formulaTraces.find(({ key }) => key === "vacancyLoss")!.formula).toBe("negative total potential income times vacancy percent");
    expect(withoutBlock.anchors).toBeUndefined();
  });

  it("says in the traces that the cap carries the vacancy", () => {
    const traces = run(capped).formulaTraces;
    expect(traces.find(({ key }) => key === "vacancyLoss")!.formula).toContain("occupancy cap");
    expect(traces.find(({ key }) => key === "firstStabilizedMonth")!.inputPaths).toContain("occupancyCap");
    expect(traces.find(({ key }) => key === "monthlyLeaseUp")!.formula).toContain("one less the vacancy percent");
  });

  it("validates the block's evidence like any other", () => {
    expect(issueCodes({ ...capped, occupancyCap: { ...evidence, reviewState: "maybe" as never } })).toEqual(["occupancyCap.reviewState:invalid_review_state"]);
    expect(issueCodes({ ...capped, occupancyCap: { ...evidence, sourceDate: "10/07/2026" } })).toEqual(["occupancyCap.sourceDate:invalid_source_date"]);
  });

  it("moves the cap when a scenario changes the vacancy percent", () => {
    const fixture = structuredClone(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput);
    const input = { ...fixture, occupancyCap: evidence };
    const scenarios = [{
      id: "higher-vacancy", role: "downside" as const, name: "Higher Vacancy", inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta: { vacancyPercent: 15 },
      evidence: { vacancyPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-07", reviewState: "done" as const } },
    }, {
      id: "lower-vacancy", role: "upside" as const, name: "Lower Vacancy", inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta: { vacancyPercent: 2 },
      evidence: { vacancyPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-07", reviewState: "done" as const } },
    }];
    const comparison = runApartmentScenarioComparison(input, scenarios);
    expect(comparison.issues).toEqual([]);
    const maxLeased = (id: string) => Math.max(...comparison.result!.scenarios.find((item) => item.id === id)!.propertyResult.forwardOperations.months.map(({ leasedUnits }) => leasedUnits));
    const revenueUnits = input.residentialUnitTypes.reduce((sum, line) => sum + line.units - line.nonRevenueUnits, 0);
    expect(maxLeased("higher-vacancy")).toBeCloseTo(revenueUnits * 0.85, 6);
    expect(maxLeased("lower-vacancy")).toBeCloseTo(revenueUnits * 0.98, 6);
  });
});
