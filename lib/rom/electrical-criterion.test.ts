import { describe, expect, it } from "vitest";

import {
  computeElectricalService,
  demandFactor,
  deriveElectricalService,
  type ElectricalFacts,
  serviceRating,
} from "./electrical-criterion";

// LA-1281. E-1 against the design's worked example
// (docs/precon/criteria/la-776-electrical-service-size.md, section 3):
// 101,200 GSF, 107 units, one building, amenity yes, two elevators.

const EXAMPLE: ElectricalFacts = {
  constructionKind: "new",
  grossSquareFeet: 101200,
  unitCount: 107,
  buildingCount: 1,
  amenityScope: "yes",
  elevatorCount: 2,
  parkingType: "surface",
};

describe("Table 220.84 and the 240.6(A) ratings", () => {
  it("reads the demand factor by units on the service", () => {
    expect(demandFactor(2)).toBeNull();
    expect(demandFactor(3)).toBe(0.45);
    expect(demandFactor(11)).toBe(0.42);
    expect(demandFactor(61)).toBe(0.24);
    expect(demandFactor(62)).toBe(0.23);
    expect(demandFactor(500)).toBe(0.23);
  });

  it("rounds up to a standard rating, and gives none past 4,000 A", () => {
    expect(serviceRating(120)).toBe(400);
    expect(serviceRating(2274)).toBe(2500);
    expect(serviceRating(2500)).toBe(2500);
    expect(serviceRating(4100)).toBeNull();
  });
});

describe("computeElectricalService", () => {
  it("matches the worked example: 2,274 A, a 2,500 A service", () => {
    const result = computeElectricalService(EXAMPLE)!;
    expect(Math.round(result.averageUnitSquareFeet)).toBe(823);
    expect(Math.round(result.connectedPerUnitVa)).toBe(28469);
    expect(result.factor).toBe(0.23);
    expect(Math.round(result.dwellingDemandVa)).toBe(700610);
    expect(Math.round(result.commonAreaVa)).toBe(26312);
    expect(Math.round(result.elevatorVa)).toBe(92408);
    expect(Math.round(result.amps)).toBe(2274);
    expect(result.rating).toBe(2500);
  });

  it("matches the comparison case: no amenity and no elevator is 2,000 A", () => {
    const result = computeElectricalService({ ...EXAMPLE, amenityScope: "no", elevatorCount: 0 })!;
    expect(Math.round(result.serviceVa)).toBe(707188);
    expect(Math.round(result.amps)).toBe(1963);
    expect(result.rating).toBe(2000);
  });

  it("prices don't know and unanswered amenity like yes", () => {
    const yes = computeElectricalService(EXAMPLE)!;
    expect(computeElectricalService({ ...EXAMPLE, amenityScope: "dont_know" })!.amps).toBe(yes.amps);
    expect(computeElectricalService({ ...EXAMPLE, amenityScope: null })!.amps).toBe(yes.amps);
  });

  it("splits by building, one service each", () => {
    const result = computeElectricalService({ ...EXAMPLE, buildingCount: 2 })!;
    expect(result.buildings).toBe(2);
    expect(result.unitsPerBuilding).toBe(54);
    expect(result.factor).toBe(0.25);
    // One elevator per building now, at 125 percent.
    expect(Math.round(result.elevatorVa)).toBe(51338);
    expect(result.rating).toBe(1600);
  });

  it("gives nothing under 3 units per building", () => {
    expect(computeElectricalService({ ...EXAMPLE, unitCount: 2 })).toBeNull();
    expect(computeElectricalService({ ...EXAMPLE, unitCount: 5, buildingCount: 3 })).toBeNull();
  });
});

describe("deriveElectricalService", () => {
  it("builds the card: amps per service, every step shown, low with each trigger named", () => {
    const card = deriveElectricalService(EXAMPLE)!;
    expect(card.code).toBe("E-1");
    expect(card.value).toEqual({ kind: "quantity", amount: 2500, unit: "A Service" });
    expect(card.costCodes).toEqual(["31"]);
    expect(card.steps.at(-1)).toEqual({ label: "Service Size", result: "2,500 A" });
    expect(card.confidence).toBe("low");
    expect(card.confidenceReason).toContain("club rates");
    expect(card.confidenceReason).toContain("Elevator motors use 40 HP");
    expect(card.inputs.find((one) => one.name === "Elevator Motor")?.basis).toBe("assumed");
  });

  it("reads high for new construction with no amenity, elevator or garage", () => {
    const card = deriveElectricalService({ ...EXAMPLE, amenityScope: "no", elevatorCount: 0 })!;
    expect(card.confidence).toBe("high");
    expect(card.value).toEqual({ kind: "quantity", amount: 2000, unit: "A Service" });
  });

  it("names each service when there are several", () => {
    const card = deriveElectricalService({ ...EXAMPLE, buildingCount: 2 })!;
    expect(card.value).toEqual({ kind: "quantity", amount: 1600, unit: "A Each, 2 Services" });
    expect(card.steps.at(-1)?.result).toBe("1,600 A each, 2 services");
  });

  it("flags a building past one 4,000 A service", () => {
    const card = deriveElectricalService({ ...EXAMPLE, grossSquareFeet: 240000, unitCount: 260 })!;
    expect(card.value.kind === "quantity" && card.value.amount).toBeGreaterThan(4000);
    expect(card.confidenceReason).toContain("480Y/277 V");
  });

  it("reads low for a renovation or a garage", () => {
    const clean = { ...EXAMPLE, amenityScope: "no" as const, elevatorCount: 0 };
    expect(deriveElectricalService({ ...clean, constructionKind: "renovation" })!.confidenceReason).toContain("220.87");
    expect(deriveElectricalService({ ...clean, parkingType: "structured" })!.confidence).toBe("low");
  });
});
