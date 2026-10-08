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

const space = {
  id: "retail",
  name: "Ground Floor Retail",
  areaSf: 2_500,
  annualRentPerSf: 36,
  leaseStartMonth: "2026-03",
  freeRentMonths: 2,
  recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 20 }],
  tenantImprovementPerSf: 40,
  leasingCommissionPercent: 4,
  leaseTermMonths: 120,
  sourceLabel: "Broker opinion",
  sourceDate: "2026-10-01",
  reviewState: "working",
};
const commercial = {
  spaces: [space],
  vacancyPercent: 10,
  creditLossPercent: 1,
  sourceLabel: "Retail underwriting",
  sourceDate: "2026-10-01",
  reviewState: "working",
};
const camLine = { id: "cam", name: "Common Area Maintenance", amount: 30_000, unit: "usd_per_year", appliesTo: "commercial", reviewState: "working" };
const withCommercial = { ...operations, operatingExpenseLines: [camLine], commercial };

function failure(body: unknown, schedule: Parameters<typeof parseApartmentOperations>[1] = costSchedule) {
  try {
    parseApartmentOperations(body, schedule);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidApartmentOperations);
    return (error as InvalidApartmentOperations).fieldErrors;
  }
  throw new Error("Expected the commercial check to fail.");
}

describe("parseApartmentOperations with commercial spaces", () => {
  it("keeps the block, drops fields the engine does not know and keeps the Applies To choice", () => {
    const draft = parseApartmentOperations({
      ...withCommercial,
      commercial: {
        ...commercial,
        extra: "block",
        spaces: [{ ...space, extra: "space", recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"], extra: 1 }, sharePercent: 20, extra: 2 }] }],
      },
    }, costSchedule);
    expect(draft.commercial).toEqual(commercial);
    expect(draft.operatingExpenseLines[0].appliesTo).toBe("commercial");
  });

  it("keeps a property tax recovery with no share, which reads the area share", () => {
    const draft = parseApartmentOperations({
      ...withCommercial,
      operatingExpenseLines: [],
      propertyTax: {
        taxInputVersion: "property_tax_inputs.v1",
        mode: "full_tax",
        assessmentBasis: "stated_assessed_value",
        firstFiscalYearStartMonth: "2026-01",
        landAssessedValue: 100_000,
        improvementAssessedValue: 900_000,
        rateUnit: "mills",
        fiscalYears: [{ rate: 20, exemptionPercent: 0 }],
        annualRateGrowthPercent: 0,
        taxEvidence: { firstFiscalYearStartMonth: working, assessment: working, fiscalYears: working, annualRateGrowthPercent: working },
      },
      commercial: { ...commercial, spaces: [{ ...space, recoveries: [{ basis: { kind: "property_tax" } }] }] },
    }, costSchedule);
    expect(draft.commercial!.spaces[0].recoveries).toEqual([{ basis: { kind: "property_tax" } }]);
  });

  it("leaves the block out when the case has none, and a cleared block sent as null reads the same", () => {
    expect(parseApartmentOperations(operations, costSchedule)).not.toHaveProperty("commercial");
    expect(parseApartmentOperations({ ...operations, commercial: null }, costSchedule)).not.toHaveProperty("commercial");
  });

  it("keeps a lease start anchor and drops a null one", () => {
    const schedule = { ...costSchedule, milestones: [{ id: "tco", name: "Certificate of Occupancy", month: "2026-04" }] };
    const anchored = parseApartmentOperations({
      ...withCommercial,
      commercial: { ...commercial, spaces: [{ ...space, leaseStartAnchor: { milestoneId: "tco", offsetMonths: 2 } }] },
    }, schedule);
    expect(anchored.commercial!.spaces[0].leaseStartAnchor).toEqual({ milestoneId: "tco", offsetMonths: 2 });
    expect(anchored.commercial!.spaces[0].leaseStartMonth).toBe("2026-06");
    const typed = parseApartmentOperations({ ...withCommercial, commercial: { ...commercial, spaces: [{ ...space, leaseStartAnchor: null }] } }, schedule);
    expect(typed.commercial!.spaces[0]).not.toHaveProperty("leaseStartAnchor");
  });

  it("reports each bad space field under its own path", () => {
    const errors = failure({
      ...withCommercial,
      commercial: {
        ...commercial,
        vacancyPercent: 140,
        spaces: [{ ...space, areaSf: 0, annualRentPerSf: -1, leaseTermMonths: 0, leasingCommissionPercent: 120, leaseStartMonth: "soon" }],
      },
    });
    for (const path of [
      "commercial.vacancyPercent",
      "commercial.spaces.0.areaSf",
      "commercial.spaces.0.annualRentPerSf",
      "commercial.spaces.0.leaseTermMonths",
      "commercial.spaces.0.leasingCommissionPercent",
      "commercial.spaces.0.leaseStartMonth",
    ]) expect(errors, path).toHaveProperty([path]);
  });

  it("reports a recovery that names an unknown expense line and a share above one hundred", () => {
    const errors = failure({
      ...withCommercial,
      commercial: { ...commercial, spaces: [{ ...space, recoveries: [{ basis: { kind: "expense_lines", lineIds: ["missing"] } }, { basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 140 }] }] },
    });
    expect(errors).toHaveProperty(["commercial.spaces.0.recoveries.0.basis.lineIds.0"]);
    expect(errors).toHaveProperty(["commercial.spaces.0.recoveries.1.sharePercent"]);
  });

  it("reports an operating expense tagged commercial on a case with no commercial block", () => {
    expect(failure({ ...operations, operatingExpenseLines: [camLine] })).toHaveProperty(["operatingExpenseLines.0.appliesTo"]);
  });

  it("reports a bad Applies To value against the line", () => {
    expect(failure({ ...withCommercial, operatingExpenseLines: [{ ...camLine, appliesTo: "retail" }] })).toHaveProperty(["operatingExpenseLines.0.appliesTo"]);
  });

  it("reports a bad review state on the block and on a space", () => {
    const errors = failure({
      ...withCommercial,
      commercial: { ...commercial, reviewState: "later", spaces: [{ ...space, reviewState: "later" }] },
    });
    expect(errors).toHaveProperty(["commercial.reviewState"]);
    expect(errors).toHaveProperty(["commercial.spaces.0.reviewState"]);
  });

  it("keeps commercial rent growth in the growth by category block and checks each year", () => {
    const categoryGrowth = {
      marketRentPercent: [3], affordableRentPercent: [2], otherIncomePercent: [3], operatingExpensePercent: [3],
      commercialRentPercent: [2, 2.5], reviewState: "working" as const,
    };
    expect(parseApartmentOperations({ ...withCommercial, categoryGrowth }, costSchedule).categoryGrowth).toEqual(categoryGrowth);
    expect(failure({ ...withCommercial, categoryGrowth: { ...categoryGrowth, commercialRentPercent: [2, 140] } })).toHaveProperty(["categoryGrowth.commercialRentPercent.1"]);
  });
});
