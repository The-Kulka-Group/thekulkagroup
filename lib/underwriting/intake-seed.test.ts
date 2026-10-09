import { computeMonthlyCostSchedule } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import type { AssumptionName, UnderwritingAssumption, UnderwritingCase } from "./cases";
import {
  addMonths,
  commonSource,
  detachesFromAnalysisStart,
  followAnalysisStart,
  INTAKE_LINE_IDS,
  ownedAssumptions,
  seedFromIntake,
} from "./intake-seed";

const SOURCE = { sourceLabel: "Broker OM", sourceDate: "2026-10-01" };

function assumption(name: AssumptionName, value: number, source: { sourceLabel?: string; sourceDate?: string } = SOURCE): UnderwritingAssumption {
  return {
    name,
    key: "purchase_price",
    label: name,
    value,
    unit: "usd",
    sourceKind: "user_supplied",
    ...source,
    reviewState: "working",
    lastChangedAt: "2026-10-09T00:00:00.000Z",
  };
}

function intakeCase(overrides: Partial<UnderwritingCase> = {}) {
  return {
    proposedUnits: 120,
    averageUnitSquareFeet: 850,
    factMetadata: { proposedUnits: { ...SOURCE, reviewState: "working" as const, lastChangedAt: "", caseRevision: 1 } },
    assumptions: [
      assumption("purchasePrice", 4_000_000),
      assumption("hardCostPerGrossSquareFoot", 300),
      assumption("softCostPercent", 20),
      assumption("monthlyRent", 2_500),
      assumption("vacancyPercent", 5),
      assumption("debtPercent", 65),
      assumption("interestRatePercent", 7.5),
      assumption("exitCapRatePercent", 5.25),
      assumption("constructionMonths", 24),
    ],
    ...overrides,
  };
}

describe("seedFromIntake", () => {
  it("builds the land, hard and soft cost lines with the intake source", () => {
    const { costLines } = seedFromIntake(intakeCase());
    expect(costLines.map((line) => [line.id, line.category, line.amount, line.basis])).toEqual([
      ["intake-land", "land", 4_000_000, undefined],
      ["intake-hard-cost", "hard_cost", undefined, { type: "per_gross_square_foot", rate: 300 }],
      ["intake-soft-cost", "soft_cost", undefined, { type: "percent_of_line", baseLineId: "intake-hard-cost", percent: 20 }],
    ]);
    expect(costLines.every((line) => line.sourceLabel === "Broker OM" && line.sourceDate === "2026-10-01" && line.reviewState === "working")).toBe(true);
  });

  it("leaves months blank without an analysis start", () => {
    const { costLines } = seedFromIntake(intakeCase());
    expect(costLines.every((line) => line.startMonth === "" && line.endMonth === "")).toBe(true);
  });

  it("starts hard cost the month after analysis start and runs it for the construction duration", () => {
    const { costLines } = seedFromIntake(intakeCase(), "2027-01");
    const months = Object.fromEntries(costLines.map((line) => [line.id, [line.startMonth, line.endMonth]]));
    expect(months).toEqual({
      "intake-land": ["2027-01", "2027-01"],
      "intake-hard-cost": ["2027-02", "2029-01"],
      "intake-soft-cost": ["2027-02", "2029-01"],
    });
  });

  it("leaves hard and soft months blank when construction duration is missing", () => {
    const savedCase = intakeCase();
    savedCase.assumptions = savedCase.assumptions.filter((item) => item.name !== "constructionMonths");
    const { costLines } = seedFromIntake(savedCase, "2027-01");
    expect(costLines.find((line) => line.id === "intake-hard-cost")).toMatchObject({ startMonth: "", endMonth: "" });
  });

  it("produces lines the cost schedule engine accepts once months exist", () => {
    const { costLines } = seedFromIntake(intakeCase(), "2027-01");
    const checked = computeMonthlyCostSchedule({
      analysisStartMonth: "2027-01",
      saleMonth: "2031-12",
      costLines,
      quantities: { grossSquareFeet: 120_000, units: 120 },
    });
    expect(checked.status).toBe("complete");
  });

  it("skips soft cost without a hard cost line to price against", () => {
    const savedCase = intakeCase();
    savedCase.assumptions = savedCase.assumptions.filter((item) => item.name !== "hardCostPerGrossSquareFoot");
    expect(seedFromIntake(savedCase).costLines.map((line) => line.id)).toEqual(["intake-land"]);
  });

  it("seeds one market unit type and the operations, capital and sale values", () => {
    const seed = seedFromIntake(intakeCase());
    expect(seed.residentialUnitTypes).toEqual([{
      id: "intake-unit-type",
      name: "Average Unit",
      units: 120,
      nonRevenueUnits: 0,
      averageAreaSf: 850,
      monthlyMarketRent: 2_500,
      affordabilityTier: "market",
      ...SOURCE,
      reviewState: "working",
    }]);
    expect(seed.vacancyPercent).toEqual({ value: 5, evidence: { ...SOURCE, reviewState: "working" } });
    expect(seed.targetDebtSharePercent?.value).toBe(65);
    expect(seed.annualInterestRatePercent?.value).toBe(7.5);
    expect(seed.terminalCapRatePercent?.value).toBe(5.25);
  });

  it("seeds nothing from an empty intake", () => {
    expect(seedFromIntake({ assumptions: [], factMetadata: {} })).toEqual({ costLines: [], residentialUnitTypes: [] });
  });
});

describe("commonSource", () => {
  it("returns the source every sourced value shares", () => {
    expect(commonSource(intakeCase())).toEqual(SOURCE);
  });

  it("returns nothing once values carry different sources", () => {
    const savedCase = intakeCase();
    savedCase.assumptions.push(assumption("contingencyPercent", 5, { sourceLabel: "GC budget" }));
    expect(commonSource(savedCase)).toEqual({});
  });
});

describe("ownedAssumptions", () => {
  it("names only the values of saved sections", () => {
    expect([...ownedAssumptions({})]).toEqual([]);
    expect([...ownedAssumptions({ developmentCapital: {} as never })]).toEqual(["debtPercent", "interestRatePercent"]);
  });
});

describe("addMonths", () => {
  it("rolls across years and rejects a blank month", () => {
    expect(addMonths("2027-12", 1)).toBe("2028-01");
    expect(addMonths("", 1)).toBe("");
  });
});

describe("following the analysis start", () => {
  it("stops a seeded line the user retimed or recategorized from following", () => {
    expect(detachesFromAnalysisStart({ startMonth: "2026-01" })).toBe(true);
    expect(detachesFromAnalysisStart({ endMonth: "2026-01" })).toBe(true);
    expect(detachesFromAnalysisStart({ category: "land" })).toBe(true);
    expect(detachesFromAnalysisStart({ basis: { type: "per_unit", rate: 1 } })).toBe(true);
    expect(detachesFromAnalysisStart({ name: "Closing Costs" })).toBe(false);
    expect(detachesFromAnalysisStart({ sourceLabel: "GC" })).toBe(false);
  });

  it("keeps months the user typed on a seeded line when the analysis start changes", () => {
    const seeded = seedFromIntake(intakeCase()).costLines;
    // The repro: the user turns the seeded Hard Cost row into a fixed land line in 2026-01.
    const edited = seeded.map((line) => line.id === INTAKE_LINE_IDS.hardCost
      ? { ...line, name: "Closing Costs", category: "land" as const, basis: undefined, amount: 240_000, startMonth: "2026-01", endMonth: "2026-01" }
      : line);
    const following = new Set([INTAKE_LINE_IDS.land, INTAKE_LINE_IDS.softCost]);
    const moved = followAnalysisStart(edited, following, "2026-01", 18);
    expect(moved.find((line) => line.id === INTAKE_LINE_IDS.hardCost)).toMatchObject({ startMonth: "2026-01", endMonth: "2026-01" });
    expect(moved.find((line) => line.id === INTAKE_LINE_IDS.softCost)).toMatchObject({ startMonth: "2026-02", endMonth: "2027-07" });
    expect(moved.find((line) => line.id === INTAKE_LINE_IDS.land)).toMatchObject({ startMonth: "2026-01", endMonth: "2026-01" });
  });
});
