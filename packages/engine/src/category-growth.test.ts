import { describe, expect, it } from "vitest";

import {
  MAX_GROWTH_YEARS,
  computeApartmentOperations,
  type ApartmentOperationsInputs,
  type CategoryGrowth,
  type MonthlyApartmentOperations,
} from "./apartment-operations";
import { APARTMENT_SCENARIO_INPUT_VERSION, runApartmentScenarioComparison, type ApartmentScenarioDefinition } from "./apartment-scenarios";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";

/*
 * LA-1838. Fifty market units at $2,000 and fifty affordable units at $1,000, all pre-leased from
 * 2027-01, with growth starting the same month and no losses, so each year's rent, other income
 * and expense can be checked by hand.
 */

const evidence = { sourceLabel: "Growth memo", sourceDate: "2026-10-01", reviewState: "done" as const };

const base: ApartmentOperationsInputs = {
  inputVersion: "apartment_operations_inputs.v1",
  analysisStartMonth: "2026-01",
  saleMonth: "2030-12",
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
  preleasedUnits: 100,
  leaseUpUnitsPerMonth: 10,
  annualIncomeGrowthPercent: 3,
  annualExpenseGrowthPercent: 2,
  rentAdjustmentLossPercent: 0,
  freeRentPercent: 0,
  vacancyPercent: 0,
  creditLossPercent: 0,
  assumptionEvidence: {
    operationStartMonth: evidence,
    growthStartMonth: evidence,
    preleasedUnits: evidence,
    leaseUpUnitsPerMonth: evidence,
    annualIncomeGrowthPercent: evidence,
    annualExpenseGrowthPercent: evidence,
    rentAdjustmentLossPercent: evidence,
    freeRentPercent: evidence,
    vacancyPercent: evidence,
    creditLossPercent: evidence,
  },
  residentialUnitTypes: [
    { id: "market", name: "Market", units: 50, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, affordabilityTier: "market", ...evidence },
    { id: "affordable", name: "Affordable", units: 50, nonRevenueUnits: 0, averageAreaSf: 700, monthlyMarketRent: 1_000, affordabilityTier: "affordable", amiPercent: 60, ...evidence },
  ],
  otherIncomeLines: [{ id: "parking", name: "Parking", amount: 12_000, unit: "usd_per_year", ...evidence }],
  operatingExpenseLines: [{ id: "payroll", name: "Payroll", amount: 120_000, unit: "usd_per_year", ...evidence }],
  capitalExpenditureLines: [{ id: "reserves", name: "Reserves", amount: 12_000, unit: "usd_per_year", ...evidence }],
};

const growth: CategoryGrowth = {
  marketRentPercent: [3, 5],
  affordableRentPercent: [2],
  otherIncomePercent: [4],
  operatingExpensePercent: [1, 2, 10],
  ...evidence,
};

function run(input: ApartmentOperationsInputs) {
  const result = computeApartmentOperations(input);
  expect(result.issues).toEqual([]);
  return result.result!;
}

function month(months: MonthlyApartmentOperations[], label: string) {
  return months.find(({ month: value }) => value === label)!;
}

function yearTotal(months: MonthlyApartmentOperations[], year: string, key: "otherIncome" | "operatingExpenses" | "capitalExpenditures") {
  return months.filter(({ month: value }) => value.startsWith(year)).reduce((sum, item) => sum + item[key], 0);
}

function issuePaths(input: ApartmentOperationsInputs) {
  return computeApartmentOperations(input).issues.map(({ path, code }) => `${path}:${code}`);
}

describe("growth by category", () => {
  it("gives the same months as the income and expense rates when every category carries them", () => {
    const flat = run(base);
    const byCategory = run({
      ...base,
      categoryGrowth: { marketRentPercent: [3], affordableRentPercent: [3], otherIncomePercent: [3], operatingExpensePercent: [2], ...evidence },
    });
    expect(byCategory.months).toEqual(flat.months);
  });

  it("grows market and affordable rent at their own rates and carries the last rate forward", () => {
    const { months } = run({ ...base, categoryGrowth: growth });
    // Year one is ungrown. Market takes 3% then 5% and 5% again; affordable takes 2% each year.
    expect(month(months, "2027-06").residentialGrossRent).toBe(50 * 2_000 + 50 * 1_000);
    expect(month(months, "2028-01").residentialGrossRent).toBe(50 * 2_060 + 50 * 1_020);
    expect(month(months, "2029-01").residentialGrossRent).toBe(50 * 2_163 + 50 * 1_040.4);
    expect(month(months, "2030-01").residentialGrossRent).toBeCloseTo(50 * 2_271.15 + 50 * 1_061.21, 2);
  });

  it("grows other income, operating expenses and capital expenditures at their category rates", () => {
    const { months } = run({ ...base, categoryGrowth: growth });
    expect(yearTotal(months, "2029", "otherIncome")).toBeCloseTo(12_000 * 1.04 ** 2, 2);
    expect(yearTotal(months, "2028", "operatingExpenses")).toBeCloseTo(121_200, 2);
    expect(yearTotal(months, "2029", "operatingExpenses")).toBeCloseTo(123_624, 2);
    expect(yearTotal(months, "2030", "operatingExpenses")).toBeCloseTo(135_986.4, 2);
    expect(yearTotal(months, "2030", "capitalExpenditures")).toBeCloseTo(13_598.64, 2);
  });

  it("names a bad list or a bad rate", () => {
    expect(issuePaths({ ...base, categoryGrowth: { ...growth, marketRentPercent: [] } }))
      .toEqual(["categoryGrowth.marketRentPercent:invalid_percent"]);
    expect(issuePaths({ ...base, categoryGrowth: { ...growth, otherIncomePercent: Array(MAX_GROWTH_YEARS + 1).fill(2) } }))
      .toEqual(["categoryGrowth.otherIncomePercent:invalid_percent"]);
    expect(issuePaths({ ...base, categoryGrowth: { ...growth, operatingExpensePercent: [2, -1, 101, 1.23456] } }))
      .toEqual([
        "categoryGrowth.operatingExpensePercent.1:invalid_percent",
        "categoryGrowth.operatingExpensePercent.2:invalid_percent",
        "categoryGrowth.operatingExpensePercent.3:invalid_percent",
      ]);
    expect(issuePaths({ ...base, categoryGrowth: { ...growth, affordableRentPercent: [Number.NaN] } }))
      .toEqual(["categoryGrowth.affordableRentPercent.0:invalid_percent"]);
  });
});

describe("income growth scenarios with growth by category", () => {
  const scenarios: ApartmentScenarioDefinition[] = [{
    id: "faster-growth",
    role: "upside",
    name: "Faster Growth",
    inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
    delta: { annualIncomeGrowthPercent: 6 },
    evidence: { annualIncomeGrowthPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-01", reviewState: "done" } },
  }, {
    id: "higher-vacancy",
    role: "downside",
    name: "Higher Vacancy",
    inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
    delta: { vacancyPercent: 8 },
    evidence: { vacancyPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-01", reviewState: "done" } },
  }];

  it("sets every income category to the scenario rate and shows the base as By Category", () => {
    const fixture = structuredClone(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput);
    const withGrowth = { ...fixture, categoryGrowth: { marketRentPercent: [1], affordableRentPercent: [1], otherIncomePercent: [1], operatingExpensePercent: [2], ...evidence } };
    const flat = { ...fixture, annualIncomeGrowthPercent: 1 };
    const byCategoryRun = runApartmentScenarioComparison(withGrowth, scenarios);
    expect(byCategoryRun.issues).toEqual([]);
    const byCategory = byCategoryRun.result!;
    const plain = runApartmentScenarioComparison({ ...flat, annualExpenseGrowthPercent: 2 }, scenarios).result!;
    expect(byCategory.scenarios[0].changedInputs).toEqual([
      expect.objectContaining({ key: "annualIncomeGrowthPercent", baseValue: "By Category", scenarioValue: 6 }),
    ]);
    expect(byCategory.scenarios[0].metrics.forwardNetOperatingIncome).toBe(plain.scenarios[0].metrics.forwardNetOperatingIncome);
  });
});
