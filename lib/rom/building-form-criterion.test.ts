import { validateDerivedAssumption } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { A2_CODE, deriveBuildingForm } from "./building-form-criterion";

// LA-1325. A-2 states the shape, and the arithmetic behind it, on the card.

const step = (card: ReturnType<typeof deriveBuildingForm>, label: string) => card.steps.find((s) => s.label === label)?.result;

describe("deriveBuildingForm", () => {
  it("Harbor View: an L with the front wing a story lower", () => {
    const card = deriveBuildingForm({ grossSquareFeet: 118_000, storiesAboveGrade: 6, buildingCount: 1 });
    expect(card.code).toBe(A2_CODE);
    expect(card.label).toBe("Building Form");
    expect(card.value).toEqual({ kind: "spec", text: "L-Shape" });
    expect(step(card, "Floor Plate")).toBe("19,667 SF per building");
    expect(step(card, "Corridor Length")).toBe("307 ft at 64 ft deep");
    expect(step(card, "Shape")).toBe("L-Shape, past 300 ft");
    expect(step(card, "Stepped Floors")).toBe("Front wing 5 stories, the rest 6");
    expect(step(card, "Facade Bays")).toMatch(/^\d+ at 28 ft$/);
    expect(card.costCodes).toEqual(["8"]);
    expect(() => validateDerivedAssumption(card)).not.toThrow();
  });

  it("always reads low: it is a shape with no site plan behind it", () => {
    const card = deriveBuildingForm({ grossSquareFeet: 45_000, storiesAboveGrade: 3, buildingCount: 1 });
    expect(card.value).toEqual({ kind: "spec", text: "Bar" });
    expect(step(card, "Shape")).toBe("Bar, 300 ft or less");
    expect(step(card, "Stepped Floors")).toBe("None");
    expect(card.confidence).toBe("low");
    expect(card.confidenceReason).toMatch(/site plan/);
  });

  it("assumes one building when the count is not answered", () => {
    const card = deriveBuildingForm({ grossSquareFeet: 45_000, storiesAboveGrade: 3, buildingCount: null });
    expect(card.inputs.find((i) => i.name === "Building Count")).toEqual({ name: "Building Count", value: "Not answered, one assumed", basis: "assumed" });
  });

  it("names a plate too short for a corridor a block", () => {
    const card = deriveBuildingForm({ grossSquareFeet: 9_000, storiesAboveGrade: 3, buildingCount: 1 });
    expect(card.value).toEqual({ kind: "spec", text: "Bar" });
    expect(step(card, "Shape")).toBe("Bar, too short for a corridor");
  });
});
