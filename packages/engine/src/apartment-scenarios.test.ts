import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import {
  APARTMENT_SCENARIO_FORMULA_VERSION,
  MAX_APARTMENT_SCENARIO_SOURCE_LABEL_LENGTH,
  runApartmentScenarioComparison,
  type ApartmentScenarioDefinition,
} from "./apartment-scenarios";

const scenarios: ApartmentScenarioDefinition[] = [
  scenario("higher-vacancy", "downside", "Higher Vacancy", { vacancyPercent: 8 }),
  scenario("lower-exit-cap", "upside", "Lower Terminal Cap", { terminalCapRatePercent: 5 }),
];

describe("runApartmentScenarioComparison", () => {
  it("runs reviewed scenario deltas through the property engine without mutating the base", () => {
    const base = structuredClone(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput);
    const before = structuredClone(base);
    const run = runApartmentScenarioComparison(base, scenarios);

    expect(run.formulaVersion).toBe(APARTMENT_SCENARIO_FORMULA_VERSION);
    expect(run.status).toBe("complete");
    expect(base).toEqual(before);
    expect(run.inputSnapshot.scenarios).toEqual(scenarios);
    expect(run.result?.base).toMatchObject({
      name: "Current Reviewed Inputs",
      reconciliationStatus: "pass",
    });
    expect(run.result?.scenarios).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "higher-vacancy",
        role: "downside",
        name: "Higher Vacancy",
        delta: { vacancyPercent: 8 },
        changedInputs: [expect.objectContaining({ key: "vacancyPercent", baseValue: 5, scenarioValue: 8 })],
        reconciliationStatus: "pass",
        metrics: expect.objectContaining({
          forwardNetOperatingIncome: expect.any(Number),
          grossSaleValue: expect.any(Number),
          unleveredXirr: expect.any(Number),
          leveredXirr: expect.any(Number),
          unleveredEquityMultiple: expect.any(Number),
          leveredEquityMultiple: expect.any(Number),
          yieldOnCost: expect.any(Number),
          developmentSpreadBasisPoints: expect.any(Number),
        }),
      }),
    ]));
  });

  it("applies a growth-start shift as a delta while keeping all other inputs unchanged", () => {
    const base = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput;
    const shifted = scenario("later-growth", "downside", "Growth Starts Three Months Later", { growthStartMonthShiftMonths: 3 });
    const run = runApartmentScenarioComparison(base, [shifted, scenarios[1]]);
    const result = run.result?.scenarios.find(({ id }) => id === shifted.id);

    expect(result?.changedInputs).toEqual([expect.objectContaining({
      key: "growthStartMonthShiftMonths",
      baseValue: base.growthStartMonth,
      scenarioValue: "2026-04",
    })]);
    expect(result?.inputSnapshot.growthStartMonth).toBe("2026-04");
    expect(result?.inputSnapshot.vacancyPercent).toBe(base.vacancyPercent);
  });

  it.each([
    ["unsupported version", { ...scenarios[0], inputVersion: "scenario.v0" }, "unsupported_input_version"],
    ["role-only name", { ...scenarios[0], name: "Downside" }, "invalid_name"],
    ["empty delta", { ...scenarios[0], delta: {}, evidence: {} }, "missing_delta"],
    ["invalid percent", { ...scenarios[0], delta: { vacancyPercent: 101 } }, "invalid_percent"],
    ["invalid timing", { ...scenarios[0], delta: { growthStartMonthShiftMonths: 25 } }, "invalid_timing_shift"],
    ["missing evidence", { ...scenarios[0], evidence: {} }, "missing_evidence"],
  ])("returns a typed issue for %s", (_label, invalid, code) => {
    const run = runApartmentScenarioComparison(
      APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput,
      [invalid as ApartmentScenarioDefinition, scenarios[1]],
    );
    expect(run.status).toBe("failed");
    expect(run.result).toBeNull();
    expect(run.issues).toContainEqual(expect.objectContaining({ code }));
  });

  it("requires one downside and one upside delta with unique ids", () => {
    const duplicate = scenario("higher-vacancy", "downside", "Higher Income Growth", { annualIncomeGrowthPercent: 4 });
    const run = runApartmentScenarioComparison(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput, [scenarios[0], duplicate]);
    expect(run.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "duplicate_id" }),
      expect.objectContaining({ code: "missing_role" }),
    ]));
  });

  it.each([
    ["non-text", 42, "invalid_source_label"],
    ["blank", "   ", "invalid_source_label"],
    ["over limit", "x".repeat(MAX_APARTMENT_SCENARIO_SOURCE_LABEL_LENGTH + 1), "text_too_long"],
  ])("rejects a %s evidence source label", (_label, sourceLabel, code) => {
    const invalid = structuredClone(scenarios[0]) as ApartmentScenarioDefinition;
    invalid.evidence.vacancyPercent!.sourceLabel = sourceLabel as string;
    const run = runApartmentScenarioComparison(APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput, [invalid, scenarios[1]]);
    expect(run.issues).toContainEqual(expect.objectContaining({ path: "scenarios.0.evidence.vacancyPercent.sourceLabel", code }));
  });

  it.each(["Good Vacancy", "Bad Vacancy", "Vacancy Winner", "Vacancy Loser"])("rejects the result-judgment name %s", (name) => {
    const run = runApartmentScenarioComparison(
      APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput,
      [{ ...scenarios[0], name }, scenarios[1]],
    );
    expect(run.issues).toContainEqual(expect.objectContaining({ path: "scenarios.0.name", code: "invalid_name" }));
  });

  it("does not reject a neutral name that merely contains the same letters", () => {
    const run = runApartmentScenarioComparison(
      APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput,
      [{ ...scenarios[0], name: "Goodman Vacancy Study" }, scenarios[1]],
    );
    expect(run.status).toBe("complete");
  });
});

function scenario(
  id: string,
  role: "downside" | "upside",
  name: string,
  delta: ApartmentScenarioDefinition["delta"],
): ApartmentScenarioDefinition {
  return {
    id,
    role,
    name,
    inputVersion: "apartment_scenario_delta.v1",
    delta,
    evidence: Object.fromEntries(Object.keys(delta).map((key) => [key, {
      sourceLabel: "Scenario review note",
      sourceDate: "2026-09-02",
      reviewState: "done",
    }])) as ApartmentScenarioDefinition["evidence"],
  };
}
