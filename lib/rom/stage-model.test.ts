import { describe, expect, it } from "vitest";

import { partsOf, type StageFacts, stageBuilding, stageFactsFromResponses } from "./stage-model";

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

describe("stageBuilding's plan (LA-1325)", () => {
  const floorArea = (b: NonNullable<ReturnType<typeof stageBuilding>>) =>
    b.form.wings.reduce((sum, w) => sum + (w.x1 - w.x0) * (w.z1 - w.z0) * w.stories, 0);

  it("draws A-2's shape: Harbor View as an L, its front wing a story lower", () => {
    const b = stageBuilding(facts(), [...harborView, spec("A-2", "L-Shape")])!;
    expect(b.form.shape).toBe("L-Shape");
    expect(b.form.wings.map((w) => w.stories)).toEqual([5, 6]);
    expect(b.form.bayWidth).toBe(28);
    expect(floorArea(b)).toBeCloseTo(118_000, 0);
    // The tallest wing sets the height; the plan's extent sets width and depth.
    expect(b.height).toBe(62);
    expect(b.width).toBeCloseTo(Math.max(...b.form.wings.map((w) => w.x1)) * 2, 6);
  });

  it("follows a corrected shape", () => {
    const corrected = spec("A-2", "L-Shape");
    const card = { ...corrected, correction: { value: { kind: "spec" as const, text: "Bar" }, reason: "", correctedBy: "", correctedAt: "" } };
    const b = stageBuilding(facts(), [...harborView, card])!;
    expect(b.form.shape).toBe("Bar");
    expect(b.form.wings).toHaveLength(1);
  });

  it("keeps the plain block until A-2 has played", () => {
    const b = stageBuilding(facts(), harborView)!;
    expect(b.form.shape).toBeNull();
    expect(b.form.bayWidth).toBeNull();
    expect(b.form.wings).toEqual([{ x0: -b.width / 2, x1: b.width / 2, z0: -b.depth / 2, z1: b.depth / 2, stories: 6 }]);
  });
});

describe("Juliet balconies on the stage (LA-2220)", () => {
  it("draws the Juliet rail and the doors with no deck or full rail", () => {
    const parts = partsOf(stageBuilding(facts({ balconies: true, balconyType: "juliet" }), harborView)!);
    expect(parts).toContain("julietRail");
    expect(parts).toContain("balconyDoors");
    expect(parts).not.toContain("balconies");
    expect(parts).not.toContain("balconyRail");
  });

  it("draws no Juliet rail for full balconies, for an unanswered type or for no balconies", () => {
    for (const f of [facts({ balconyType: "full" }), facts({ balconyType: null }), facts({ balconies: false, balconyType: "juliet" })]) {
      expect(partsOf(stageBuilding(f, harborView)!)).not.toContain("julietRail");
    }
  });

  it("reads the Juliet count as the balcony count when the type is Juliet", () => {
    const responses = { balconies: "yes", balcony_type: "juliet", balcony_count: "25", juliet_count: "40" };
    expect(stageFactsFromResponses(responses)).toMatchObject({ balconyType: "juliet", balconyCount: 40 });
    expect(stageFactsFromResponses({ ...responses, balcony_type: "full" })).toMatchObject({ balconyCount: 25 });
  });
});

describe("partsOf (LA-1325)", () => {
  it("names the parts the building has, the ground first (LA-2211)", () => {
    expect(partsOf(stageBuilding(facts(), harborView)!)).toEqual([
      "site",
      "foundation",
      "piles",
      "podium",
      "podiumDeck",
      "garageCoating",
      "garageWaterproofing",
      "garageElectrical",
      "garageSprinklers",
      "garageDrySprinklers",
      "massing",
      "glass",
      "balconies",
      "balconyRail",
      "balconyDoors",
      "elevators",
      "elevatorJack",
      "units",
      "service",
    ]);
    // LA-2215: a traction type draws the machine in place of the jack.
    const traction = harborView.map((c) => (c.code === "V-1" ? spec("V-1", "Traction") : c));
    expect(partsOf(stageBuilding(facts(), traction)!)).toContain("elevatorMachine");
    expect(partsOf(stageBuilding(facts(), traction)!)).not.toContain("elevatorJack");
    const plain = stageBuilding(facts({ parkingType: "surface", elevatorCount: 0, balconies: false, belowGrade: true }), [])!;
    expect(partsOf(plain)).toEqual(["site", "surfaceLot", "foundation", "basement", "massing", "glass"]);
  });

  it("draws the garage only under a podium that structured parking gives (LA-2216)", () => {
    expect(stageBuilding(facts(), [])).toMatchObject({ garage: true, surfaceLot: false });
    expect(stageBuilding(facts({ parkingType: "surface" }), [])).toMatchObject({ garage: false, surfaceLot: true });
    // A retail podium with no structured parking has no garage under it.
    expect(stageBuilding(facts({ parkingType: "none", retail: true }), [spec("A-1", "Type IIIA over Type IA Podium")])).toMatchObject({
      podiumLevels: 1,
      garage: false,
    });
  });

  // LA-2214
  it("swaps the footings for piles when the soil is poor, and back when it is good", () => {
    const poor = stageBuilding(facts({ poorSoil: true, parkingType: "surface" }), [])!;
    expect(poor.piles).toBe(true);
    expect(poor.foundation.depth).toBe(40);
    expect(partsOf(poor)).toContain("piles");
    const good = stageBuilding(facts({ poorSoil: false, parkingType: "surface" }), [])!;
    expect(good.piles).toBe(false);
    expect(partsOf(good)).not.toContain("piles");
  });

  it("reads poor soil off the Site Conditions answer", () => {
    expect(stageFactsFromResponses({ site_conditions: "yes" }).poorSoil).toBe(true);
    expect(stageFactsFromResponses({ site_conditions: "no" }).poorSoil).toBe(false);
    expect(stageFactsFromResponses({}).poorSoil).toBe(false);
  });
});
