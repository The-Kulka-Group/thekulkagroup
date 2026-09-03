import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "../../packages/engine/src/fixtures/apartment-development-model-v2.98-returns";
import { InvalidApartmentScenarios, parseApartmentScenarios } from "./scenario-input";

const scenarios = [
  { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: { sourceLabel: "Market study", sourceDate: "2026-08-01", reviewState: "done" } } },
  { id: "lower-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: { sourceLabel: "Broker opinion", sourceDate: "2026-08-01", reviewState: "done" } } },
] as const;

describe("scenario request input", () => {
  it("returns normalized delta-only inputs", () => {
    expect(parseApartmentScenarios({ scenarios }, APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput)).toEqual(scenarios);
  });

  it("returns path-based errors for unsupported or incomplete changes", () => {
    expect(() => parseApartmentScenarios({ scenarios: [{ ...scenarios[0], delta: {} }, scenarios[1]] }, APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput)).toThrow(InvalidApartmentScenarios);
    try {
      parseApartmentScenarios({ scenarios: [{ ...scenarios[0], delta: { inventedReturn: 1 } }, scenarios[1]] }, APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput);
    } catch (cause) {
      expect(cause).toMatchObject({ fieldErrors: { "scenarios.0.delta.inventedReturn": expect.stringMatching(/not supported/) } });
    }
  });

  it("returns a typed issue for a non-object scenario", () => {
    expect(() => parseApartmentScenarios({ scenarios: [null, scenarios[1]] }, APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput)).toThrow(InvalidApartmentScenarios);
  });

  it("derives a neutral descriptive name from one changed input", () => {
    const parsed = parseApartmentScenarios({ scenarios: [{ ...scenarios[0], name: "" }, scenarios[1]] }, APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput);
    expect(parsed[0].name).toBe("Vacancy 8%");
  });

  it("maps source label type, blank, and length issues to the evidence field", () => {
    for (const sourceLabel of [42, "   ", "x".repeat(501)]) {
      try {
        parseApartmentScenarios({ scenarios: [{ ...scenarios[0], evidence: { vacancyPercent: { ...scenarios[0].evidence.vacancyPercent, sourceLabel } } }, scenarios[1]] }, APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput);
        throw new Error("Expected scenario validation to fail.");
      } catch (cause) {
        expect(cause).toMatchObject({ fieldErrors: { "scenarios.0.evidence.vacancyPercent.sourceLabel": expect.any(String) } });
      }
    }
  });
});
