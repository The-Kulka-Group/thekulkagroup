import { describe, expect, it } from "vitest";

import { type StageFacts, stageBuilding } from "@/lib/rom/stage-model";

import { cutawayOf, inCutaway, layerOf, liftOf, OPEN_MS, openedAt, partitionsOf, risersOf, stretchOf } from "./views";

// LA-2217: the Opened and Assembled views as pure layout. The stage applies
// these to whatever meshes it draws, so a part added later lifts, stretches
// and cuts away with no code of its own.

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

// One podium story of 12 ft, then five frame stories of 10 ft: tops at 12, 22, 32, 42, 52, 62.
const building = stageBuilding(facts(), [])!;

describe("layerOf", () => {
  it("reads the story an object stands on from where it rests", () => {
    expect(layerOf(0, building.levels)).toBe(0);
    expect(layerOf(12, building.levels)).toBe(1);
    expect(layerOf(30, building.levels)).toBe(2);
    expect(layerOf(52, building.levels)).toBe(5);
  });

  it("puts the roof and what stands on it one layer above the top story", () => {
    expect(layerOf(62, building.levels)).toBe(6);
    expect(layerOf(63, building.levels)).toBe(6);
  });

  it("keeps everything below grade on the ground's layer", () => {
    expect(layerOf(-1.6, building.levels)).toBe(-1);
    expect(layerOf(-30, building.levels)).toBe(-1);
  });
});

describe("liftOf", () => {
  it("lifts nothing while the building is assembled", () => {
    expect(liftOf(4, 0)).toBe(0);
  });

  it("opens each story a gap above the one below, and the ground floor stays on the ground", () => {
    expect(liftOf(0, 1)).toBe(0);
    expect(liftOf(1, 1)).toBe(14);
    expect(liftOf(6, 1)).toBe(84);
  });

  it("never moves what is below grade", () => {
    expect(liftOf(-1, 1)).toBe(0);
  });

  it("is part way open part way through the switch", () => {
    expect(liftOf(2, 0.5)).toBe(14);
  });
});

describe("risersOf and stretchOf", () => {
  it("runs the risers from the podium's top to the roof", () => {
    expect(risersOf(building)).toEqual({ bottom: 12, top: 62 });
  });

  it("runs them from grade when there is no podium", () => {
    expect(risersOf(stageBuilding(facts({ parkingType: "surface" }), [])!)).toEqual({ bottom: 0, top: 60 });
  });

  it("stands as drawn while the building is assembled", () => {
    expect(stretchOf({ bottom: 12, top: 62 }, 0, building.levels)).toEqual({ y: 12, height: 50 });
  });

  it("stretches in one line from the lifted podium to the lifted roof when opened", () => {
    // The podium's top is story 1 (lifts 14); the roof is layer 6 (lifts 84).
    expect(stretchOf({ bottom: 12, top: 62 }, 1, building.levels)).toEqual({ y: 26, height: 120 });
  });
});

describe("cutawayOf", () => {
  const wing = building.form.wings[0];

  it("cuts the top story's front corner away, above its floor, so the units show", () => {
    // The top story starts at 52 ft; its slab is 1 ft thick.
    expect(cutawayOf(building.form.wings, building.levels, 0)).toEqual({ x: wing.x1 - 48, z: wing.z1 - 44, y: 53 });
  });

  it("follows the last building along the street", () => {
    expect(cutawayOf(building.form.wings, building.levels, 220)?.x).toBe(220 + wing.x1 - 48);
  });

  it("takes a smaller bite from a small wing", () => {
    const small = [{ x0: -40, x1: 40, z0: -30, z1: 30, stories: 3 }];
    expect(cutawayOf(small, building.levels, 0)).toEqual({ x: 40 - 32, z: 30 - 36, y: 23 });
  });

  it("cuts the wing nearest the viewer's corner, at that wing's own top story", () => {
    const stepped = [
      { x0: -100, x1: 0, z0: -50, z1: 50, stories: 6 },
      { x0: 0, x1: 60, z0: -50, z1: 50, stories: 4 },
    ];
    expect(cutawayOf(stepped, building.levels, 0)).toEqual({ x: 60 - 24, z: 50 - 44, y: 33 });
  });

  it("knows a point inside the cut from one outside it", () => {
    const corner = { x: 10, z: 10, y: 53 };
    expect(inCutaway(corner, { x: 11, y: 54, z: 11 })).toBe(true);
    expect(inCutaway(corner, { x: 11, y: 52, z: 11 })).toBe(false);
    expect(inCutaway(corner, { x: 9, y: 54, z: 11 })).toBe(false);
    expect(inCutaway(null, { x: 11, y: 54, z: 11 })).toBe(false);
  });
});

describe("partitionsOf", () => {
  const wing = { x0: -84, x1: 84, z0: -30, z1: 30, stories: 6 };

  it("runs a corridor down the wing's long side and splits each side into units a bay wide", () => {
    const walls = partitionsOf(wing, 10, 28);
    // 168 ft is six 28 ft units a side: five demising walls a side, and the corridor's two walls.
    expect(walls.filter((w) => w.kind === "corridor")).toHaveLength(2);
    expect(walls.filter((w) => w.kind === "demising")).toHaveLength(10);
  });

  it("keeps every wall inside the wing and under the ceiling", () => {
    for (const w of partitionsOf(wing, 10, null)) {
      expect(w.x - w.w / 2).toBeGreaterThanOrEqual(wing.x0);
      expect(w.x + w.w / 2).toBeLessThanOrEqual(wing.x1);
      expect(w.z - w.d / 2).toBeGreaterThanOrEqual(wing.z0);
      expect(w.z + w.d / 2).toBeLessThanOrEqual(wing.z1);
      expect(w.y + w.h / 2).toBeLessThanOrEqual(10);
    }
  });

  it("turns with a wing that runs along z", () => {
    const deep = { x0: -30, x1: 30, z0: -84, z1: 84, stories: 6 };
    const corridor = partitionsOf(deep, 10, 28).filter((w) => w.kind === "corridor");
    expect(corridor.every((w) => w.d > w.w)).toBe(true);
  });
});

describe("openedAt", () => {
  it("jumps straight to the end when motion is reduced", () => {
    expect(openedAt(0, 1, 0, true)).toBe(1);
  });

  it("starts where it was and ends where it is going", () => {
    expect(openedAt(0, 1, 0, false)).toBe(0);
    expect(openedAt(0, 1, OPEN_MS, false)).toBe(1);
    expect(openedAt(1, 0, OPEN_MS * 2, false)).toBe(0);
  });

  it("is half way at half time", () => {
    expect(openedAt(0, 1, OPEN_MS / 2, false)).toBeCloseTo(0.5);
  });
});
