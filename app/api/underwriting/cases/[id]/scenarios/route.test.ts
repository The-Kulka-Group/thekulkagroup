import { beforeEach, describe, expect, it, vi } from "vitest";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "../../../../../../packages/engine/src/fixtures/apartment-development-model-v2.98-returns";

const getCase = vi.fn();
const save = vi.fn();
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/lib/underwriting/cases", () => ({ getUnderwritingCase: getCase, saveApartmentScenarios: save, UnderwritingCaseRevisionConflict: class extends Error {} }));
vi.mock("@/lib/underwriting/runs", () => ({ propertyReturnsInputsFor: () => APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput }));
const { PUT } = await import("./route");

const scenarios = [
  { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: { reviewState: "done", sourceLabel: "Market study", sourceDate: "2026-08-01" } } },
  { id: "lower-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: { reviewState: "done", sourceLabel: "Broker opinion", sourceDate: "2026-08-01" } } },
];
const id = "00000000-0000-4000-8000-000000000001";
const context = { params: Promise.resolve({ id }) };

beforeEach(() => {
  vi.clearAllMocks();
  getCase.mockResolvedValue({ id, caseRevision: 5, costSchedule: {}, apartmentOperations: {}, developmentCapital: {}, propertyReturns: {} });
  save.mockResolvedValue({ id, caseRevision: 6, scenarios });
});

describe("/api/underwriting/cases/:id/scenarios", () => {
  it("saves validated delta-only scenarios", async () => {
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: 5, scenarios }) }), context);
    expect(response.status).toBe(200);
    expect(save).toHaveBeenCalledWith(expect.anything(), id, 5, scenarios);
  });

  it("returns typed field issues and enforces the shared JSON limit", async () => {
    const invalid = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: 5, scenarios: [{ ...scenarios[0], delta: {} }, scenarios[1]] }) }), context);
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ fieldErrors: { "scenarios.0.delta": expect.any(String) } });
    const tooLarge = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ padding: "x".repeat(1_000_001) }) }), context);
    expect(tooLarge.status).toBe(413);
  });

  it("returns the evidence source label error path", async () => {
    const invalidScenarios = [{ ...scenarios[0], evidence: { vacancyPercent: { ...scenarios[0].evidence.vacancyPercent, sourceLabel: "x".repeat(501) } } }, scenarios[1]];
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ expectedRevision: 5, scenarios: invalidScenarios }) }), context);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ fieldErrors: { "scenarios.0.evidence.vacancyPercent.sourceLabel": expect.stringMatching(/500/) } });
    expect(save).not.toHaveBeenCalled();
  });
});
