import { describe, expect, it } from "vitest";

import { type StageFacts, stageBuilding } from "./stage-model";

// LA-1317: the stage's building comes only from the project's facts and its
// Design and Engineering cards.

const facts = (over: Partial<StageFacts> = {}): StageFacts => ({
  grossSquareFeet: 118_000,
  stories: 6,
  unitCount: 107,
  buildingCount: 1,
  parkingType: "structured",
  elevatorCount: 2,
  belowGrade: false,
  balconies: true,
  retail: false,
  ...over,
});
const spec = (code: string, text: string, steps: { label: string; result: string }[] = []) => ({
  code,
  value: { kind: "spec" as const, text },
  steps,
  correction: null,
});
const qty = (code: string, amount: number, unit: string) => ({
  code,
  value: { kind: "quantity" as const, amount, unit },
  steps: [],
  correction: null,
});

const harborView = [
  spec("A-1", "Type IIIA over Type IA Podium", [{ label: "Podium Stories", result: "1" }]),
  spec("S-1", "Deep Foundations"),
  spec("V-1", "Hydraulic"),
  spec("V-2", "In-Ground"),
  spec("V-3", "1 Machine Room"),
  spec("M-0", "Standard (20 to 30%)"),
  qty("M-1", 189, "Tons"),
  qty("E-1", 2500, "A"),
];

describe("stageBuilding", () => {
  it("draws Harbor View: a podium, five frame floors, piles, two hydraulic cars", () => {
    const b = stageBuilding(facts(), harborView)!;
    expect(b.levels.map((l) => l.kind)).toEqual(["podium", "frame", "frame", "frame", "frame", "frame"]);
    expect(b.height).toBe(62);
    expect(b.width * b.depth).toBeCloseTo(118_000 / 6, 0);
    expect(b.foundation).toEqual({ system: "Deep Foundations", depth: 40 });
    expect(b.elevators).toEqual({ cars: 2, hydraulic: true, jack: "In-Ground", wellDepth: 58, rooms: 1 });
    expect(b.rooftopUnits).toBe(8);
    expect(b.serviceAmps).toBe(2500);
    expect(b.glazing).toBe("standard");
  });

  it("follows a correction over the card's own value", () => {
    const corrected = harborView.map((c) =>
      c.code === "S-1" ? { ...c, correction: { value: { kind: "spec" as const, text: "Spread Footings" }, reason: "", correctedBy: "", correctedAt: "" } } : c,
    );
    expect(stageBuilding(facts(), corrected as never)!.foundation).toEqual({ system: "Spread Footings", depth: 0 });
  });

  it("has no well hole for a holeless jack or traction, and no cars without elevators", () => {
    const holeless = harborView.map((c) => (c.code === "V-2" ? spec("V-2", "Holeless") : c));
    expect(stageBuilding(facts(), holeless)!.elevators!.wellDepth).toBe(0);
    const traction = harborView.map((c) => (c.code === "V-1" ? spec("V-1", "Traction") : c));
    expect(stageBuilding(facts(), traction)!.elevators).toMatchObject({ hydraulic: false, jack: null, wellDepth: 0 });
    expect(stageBuilding(facts({ elevatorCount: 0 }), harborView)!.elevators).toBeNull();
  });

  it("assumes a podium from structured parking before A-1 exists, and none for surface parking", () => {
    expect(stageBuilding(facts(), [])!.podiumLevels).toBe(1);
    expect(stageBuilding(facts({ parkingType: "surface", stories: 4 }), [])!.podiumLevels).toBe(0);
  });

  it("splits the area across buildings and draws nothing without stories or area", () => {
    const two = stageBuilding(facts({ buildingCount: 2 }), harborView)!;
    expect(two.width * two.depth).toBeCloseTo(118_000 / 2 / 6, 0);
    expect(stageBuilding(facts({ stories: null }), harborView)).toBeNull();
    expect(stageBuilding(facts({ grossSquareFeet: 0 }), harborView)).toBeNull();
  });
});
