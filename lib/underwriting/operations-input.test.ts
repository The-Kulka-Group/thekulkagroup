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

describe("parseApartmentOperations with a lease-up cap rate", () => {
  const incomeTax = {
    ...propertyTax,
    mode: "full_tax",
    assessmentBasis: "income",
    landAssessedValue: undefined,
    improvementAssessedValue: undefined,
    assessorExpenseRatioPercent: 30,
    assessmentCapRatePercent: 8.6,
    assessmentRatioPercent: 100,
    fiscalYears: [{ rate: 18.8172, exemptionPercent: 0 }],
  };

  it("keeps the lease-up cap rate beside the stabilized one", () => {
    const draft = parseApartmentOperations({ ...operations, propertyTax: { ...incomeTax, leaseUpAssessmentCapRatePercent: 7 } }, costSchedule);
    expect(draft.propertyTax).toMatchObject({ assessmentCapRatePercent: 8.6, leaseUpAssessmentCapRatePercent: 7 });
  });

  it("leaves it out for one cap rate", () => {
    expect(parseApartmentOperations({ ...operations, propertyTax: incomeTax }, costSchedule).propertyTax).not.toHaveProperty("leaseUpAssessmentCapRatePercent");
  });

  it("reports one entered as a decimal against its own field", () => {
    try {
      parseApartmentOperations({ ...operations, propertyTax: { ...incomeTax, leaseUpAssessmentCapRatePercent: 0.07 } }, costSchedule);
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidApartmentOperations);
      expect((error as InvalidApartmentOperations).fieldErrors).toHaveProperty(["propertyTax.leaseUpAssessmentCapRatePercent"]);
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

describe("parseApartmentOperations with lease-up inputs", () => {
  const evidence = { sourceLabel: "Leasing plan", sourceDate: "2026-09-01", reviewState: "working" as const };
  const leaseUp = {
    leaseUpConcession: { monthsFree: 1, leaseTermMonths: 13, timing: "spread_over_term", ...evidence },
    seasonalAbsorption: { monthlyFactors: [0.5, 0.5, 1, 1, 1.25, 1.25, 1.25, 1.25, 1, 1, 0.5, 0.5], ...evidence },
    stabilizationRule: { targetOccupancyPercent: 93, holdMonths: 3, ...evidence },
    leaseTurnover: { turnoverPercent: 50, leaseTermMonths: 12, vacantMonths: 1, basis: "net_units_gained", ...evidence },
  };

  it("keeps the four blocks and drops fields the engine does not know", () => {
    const draft = parseApartmentOperations({
      ...operations,
      leaseUpConcession: { ...leaseUp.leaseUpConcession, note: "typed" },
      seasonalAbsorption: { ...leaseUp.seasonalAbsorption, extra: 1 },
      stabilizationRule: leaseUp.stabilizationRule,
      leaseTurnover: { ...leaseUp.leaseTurnover, retentionPercent: 50 },
    }, costSchedule);
    expect(draft).toMatchObject(leaseUp);
    expect(draft.leaseUpConcession).not.toHaveProperty("note");
    expect(draft.seasonalAbsorption).not.toHaveProperty("extra");
    expect(draft.leaseTurnover).not.toHaveProperty("retentionPercent");
  });

  it("leaves the blocks out when the case has none", () => {
    const draft = parseApartmentOperations(operations, costSchedule);
    for (const key of Object.keys(leaseUp)) expect(draft).not.toHaveProperty(key);
  });

  it("reports a bad block against its field", () => {
    try {
      parseApartmentOperations({ ...operations, seasonalAbsorption: { monthlyFactors: [1], ...evidence } }, costSchedule);
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidApartmentOperations);
      expect((error as InvalidApartmentOperations).fieldErrors).toHaveProperty(["seasonalAbsorption.monthlyFactors"]);
    }
  });
});

describe("parseApartmentOperations with growth by category", () => {
  const categoryGrowth = {
    marketRentPercent: [3, 4],
    affordableRentPercent: [2],
    otherIncomePercent: [3],
    operatingExpensePercent: [3, 3, 2.5],
    sourceLabel: "Growth memo",
    sourceDate: "2026-10-01",
    reviewState: "working" as const,
  };

  it("keeps the block and drops fields the engine does not know", () => {
    const draft = parseApartmentOperations({ ...operations, categoryGrowth: { ...categoryGrowth, propertyTaxPercent: [2] } }, costSchedule);
    expect(draft.categoryGrowth).toEqual(categoryGrowth);
  });

  it("leaves it out when the case has none", () => {
    expect(parseApartmentOperations(operations, costSchedule)).not.toHaveProperty("categoryGrowth");
  });

  it("reports a bad year's rate against its field", () => {
    try {
      parseApartmentOperations({ ...operations, categoryGrowth: { ...categoryGrowth, marketRentPercent: [3, 140] } }, costSchedule);
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidApartmentOperations);
      expect((error as InvalidApartmentOperations).fieldErrors).toHaveProperty(["categoryGrowth.marketRentPercent.1"]);
    }
  });
});

describe("parseApartmentOperations with an occupancy cap", () => {
  const occupancyCap = { sourceLabel: "Benjamin lease-up", sourceDate: "2026-10-07", reviewState: "working" as const };

  it("keeps the block and drops fields the engine does not know", () => {
    const draft = parseApartmentOperations({ ...operations, occupancyCap: { ...occupancyCap, capPercent: 90 } }, costSchedule);
    expect(draft.occupancyCap).toEqual(occupancyCap);
  });

  it("treats a cleared block sent as null the same as an absent one", () => {
    expect(parseApartmentOperations({ ...operations, occupancyCap: null }, costSchedule)).not.toHaveProperty("occupancyCap");
    expect(parseApartmentOperations(operations, costSchedule)).not.toHaveProperty("occupancyCap");
  });

  it("reports a stabilization rule above the cap against its field", () => {
    try {
      parseApartmentOperations({
        ...operations,
        vacancyPercent: 5,
        occupancyCap,
        stabilizationRule: { targetOccupancyPercent: 99, holdMonths: 1, ...occupancyCap },
      }, costSchedule);
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidApartmentOperations);
      expect((error as InvalidApartmentOperations).fieldErrors).toHaveProperty(["stabilizationRule.targetOccupancyPercent"]);
    }
  });
});
