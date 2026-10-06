import { describe, expect, it } from "vitest";
import { APARTMENT_OPERATIONS_ASSUMPTION_KEYS } from "@kulka/engine";

import { InvalidApartmentOperations, parseApartmentOperations } from "./operations-input";

const costSchedule = {
  analysisStartMonth: "2026-01",
  saleMonth: "2026-12",
  costLines: [{ id: "land", name: "Land", category: "land" as const, amount: 1_000_000, unit: "usd" as const, startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line" as const, distributionVersion: "straight_line.v1" as const, reviewState: "working" as const }],
};

const working = { reviewState: "working" as const };

const operations = {
  inputVersion: "apartment_operations_inputs.v1",
  operationStartMonth: "2026-01",
  growthStartMonth: "2026-01",
  preleasedUnits: 10,
  leaseUpUnitsPerMonth: 1,
  annualIncomeGrowthPercent: 0,
  annualExpenseGrowthPercent: 0,
  rentAdjustmentLossPercent: 0,
  freeRentPercent: 0,
  vacancyPercent: 0,
  creditLossPercent: 0,
  assumptionEvidence: Object.fromEntries(APARTMENT_OPERATIONS_ASSUMPTION_KEYS.map((key) => [key, working])),
  residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
  otherIncomeLines: [],
  operatingExpenseLines: [],
  capitalExpenditureLines: [],
};

const propertyTax = {
  taxInputVersion: "property_tax_inputs.v1",
  mode: "abatement",
  assessmentBasis: "stated_assessed_value",
  firstFiscalYearStartMonth: "2026-01",
  landAssessedValue: 100_000,
  improvementAssessedValue: 900_000,
  rateUnit: "mills",
  fiscalYears: [{ rate: 20, exemptionPercent: 100 }],
  annualRateGrowthPercent: 2,
  taxEvidence: { firstFiscalYearStartMonth: working, assessment: working, fiscalYears: working, annualRateGrowthPercent: working },
};

describe("parseApartmentOperations with a property tax schedule", () => {
  it("keeps the schedule and drops fields the engine does not know", () => {
    const draft = parseApartmentOperations({
      ...operations,
      propertyTax: { ...propertyTax, extra: "value", fiscalYears: [{ rate: 20, exemptionPercent: 100, note: "typed" }] },
    }, costSchedule);
    expect(draft.propertyTax).toEqual(propertyTax);
  });

  it("leaves the schedule out when the case has none", () => {
    expect(parseApartmentOperations(operations, costSchedule)).not.toHaveProperty("propertyTax");
  });

  it("refuses a rate in the wrong unit with a field error that names the cost check", () => {
    try {
      parseApartmentOperations({ ...operations, propertyTax: { ...propertyTax, rateUnit: "percent_of_assessed_value" } }, costSchedule);
      throw new Error("Expected the tax unit check to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidApartmentOperations);
      expect((cause as InvalidApartmentOperations).fieldErrors).toEqual({
        "propertyTax.fiscalYears.0.rate": expect.stringContaining("cost before financing"),
      });
    }
  });
});

describe("parseApartmentOperations with affordability tiers", () => {
  const withTier = (extra: Record<string, unknown>) => ({
    ...operations,
    residentialUnitTypes: [operations.residentialUnitTypes[0], { ...operations.residentialUnitTypes[0], id: "aff", ...extra }],
  });

  it("keeps the tier and AMI percent on a unit type", () => {
    const draft = parseApartmentOperations(withTier({ affordabilityTier: "affordable", amiPercent: 60 }), costSchedule);
    expect(draft.residentialUnitTypes[1]).toMatchObject({ affordabilityTier: "affordable", amiPercent: 60 });
    expect(draft.residentialUnitTypes[0]).not.toHaveProperty("affordabilityTier");
  });

  it("reports an AMI percent on a market unit type against that field", () => {
    try {
      parseApartmentOperations(withTier({ amiPercent: 60 }), costSchedule);
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidApartmentOperations);
      expect((error as InvalidApartmentOperations).fieldErrors).toHaveProperty(["residentialUnitTypes.1.amiPercent"]);
    }
  });
});
