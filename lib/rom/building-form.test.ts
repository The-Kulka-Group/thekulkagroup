import { describe, expect, it } from "vitest";

import { buildingForm, type FormWing, perimeterOf, shapeFromText } from "./building-form";

// LA-1325: A-2's shape comes from the floor plate's length as a double-loaded
// corridor wing, so every figure here follows from area, stories and
// building count alone.

const area = (w: FormWing) => (w.x1 - w.x0) * (w.z1 - w.z0);
const built = (wings: FormWing[]) => wings.reduce((sum, w) => sum + area(w) * w.stories, 0);
const overlaps = (a: FormWing, b: FormWing) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.z0 < b.z1 - 0.01 && b.z0 < a.z1 - 0.01;

describe("buildingForm", () => {
  it("keeps a short plate as one bar", () => {
    // 45,000 SF over 3 stories is a 15,000 SF plate: 234 ft of corridor.
    const form = buildingForm({ grossSquareFeet: 45_000, stories: 3, buildingCount: 1 })!;
    expect(form.shape).toBe("Bar");
    expect(form.wings).toHaveLength(1);
    expect(form.wings[0].z1 - form.wings[0].z0).toBe(64);
    expect(built(form.wings)).toBeCloseTo(45_000, 0);
    expect(form.stepStories).toBe(0);
  });

  it("folds a plate past 300 ft into an L, stepping the front wing down a story at six stories", () => {
    // Harbor View: 118,000 SF over 6 stories is 307 ft of corridor.
    const form = buildingForm({ grossSquareFeet: 118_000, stories: 6, buildingCount: 1 })!;
    expect(form.shape).toBe("L-Shape");
    expect(form.corridorFeet).toBeCloseTo(307, 0);
    expect(form.wings).toHaveLength(2);
    expect(form.wings.map((w) => w.stories)).toEqual([5, 6]);
    expect(form.stepStories).toBe(1);
    // Stepping moves area, it does not lose any.
    expect(built(form.wings)).toBeCloseTo(118_000, 0);
  });

  it("makes a U past 480 ft and a courtyard past 720 ft", () => {
    const u = buildingForm({ grossSquareFeet: 4 * 36_000, stories: 4, buildingCount: 1 })!;
    expect(u.shape).toBe("U-Shape");
    expect(u.wings).toHaveLength(3);
    const ring = buildingForm({ grossSquareFeet: 4 * 52_000, stories: 4, buildingCount: 1 })!;
    expect(ring.shape).toBe("Courtyard");
    expect(ring.wings).toHaveLength(4);
    expect(built(ring.wings)).toBeCloseTo(4 * 52_000, 0);
  });

  it("steps two stories at seven or more", () => {
    const form = buildingForm({ grossSquareFeet: 7 * 30_000, stories: 7, buildingCount: 1 })!;
    expect(form.stepStories).toBe(2);
    expect(Math.min(...form.wings.map((w) => w.stories))).toBe(5);
    expect(built(form.wings)).toBeCloseTo(210_000, 0);
  });

  it("splits the area across buildings before it picks a shape", () => {
    const one = buildingForm({ grossSquareFeet: 120_000, stories: 4, buildingCount: 1 })!;
    const three = buildingForm({ grossSquareFeet: 120_000, stories: 4, buildingCount: 3 })!;
    expect(one.shape).toBe("L-Shape");
    expect(three.shape).toBe("Bar");
    expect(built(three.wings)).toBeCloseTo(40_000, 0);
  });

  it("lays wings edge to edge, never overlapping, centred on the plan", () => {
    for (const gsf of [118_000, 4 * 36_000, 4 * 52_000]) {
      const { wings, width, depth } = buildingForm({ grossSquareFeet: gsf, stories: 4, buildingCount: 1 })!;
      for (let i = 0; i < wings.length; i++) for (let j = i + 1; j < wings.length; j++) expect(overlaps(wings[i], wings[j])).toBe(false);
      expect(Math.min(...wings.map((w) => w.x0))).toBeCloseTo(-width / 2, 6);
      expect(Math.max(...wings.map((w) => w.z1))).toBeCloseTo(depth / 2, 6);
    }
  });

  it("builds the front and right edges solid, where the stage cuts the site open", () => {
    for (const gsf of [118_000, 4 * 36_000, 4 * 52_000]) {
      const { wings, width, depth } = buildingForm({ grossSquareFeet: gsf, stories: 4, buildingCount: 1 })!;
      const front = wings.filter((w) => Math.abs(w.z1 - depth / 2) < 0.01).reduce((s, w) => s + (w.x1 - w.x0), 0);
      const right = wings.filter((w) => Math.abs(w.x1 - width / 2) < 0.01).reduce((s, w) => s + (w.z1 - w.z0), 0);
      expect(front).toBeCloseTo(width, 6);
      expect(right).toBeCloseTo(depth, 6);
    }
  });

  it("counts facade bays at 28 ft around the outside wall", () => {
    const form = buildingForm({ grossSquareFeet: 45_000, stories: 3, buildingCount: 1 })!;
    const w = form.wings[0];
    expect(form.bays).toBe(Math.round((2 * (w.x1 - w.x0) + 2 * 64) / 28));
  });

  it("takes a corrected shape over the one it would pick", () => {
    // A 40,000 SF plate is a U on its own: 625 ft of corridor.
    const form = buildingForm({ grossSquareFeet: 160_000, stories: 4, buildingCount: 1 }, "Courtyard")!;
    expect(form.shape).toBe("Courtyard");
    expect(built(form.wings)).toBeCloseTo(160_000, 0);
    expect(buildingForm({ grossSquareFeet: 160_000, stories: 4, buildingCount: 1 }, "Bar")!.wings).toHaveLength(1);
  });

  it("draws the largest shape the plate can hold when the corrected one will not fit", () => {
    // Harbor View's 307 ft of corridor cannot close a courtyard or open a U.
    expect(buildingForm({ grossSquareFeet: 118_000, stories: 6, buildingCount: 1 }, "Courtyard")!.shape).toBe("L-Shape");
    expect(buildingForm({ grossSquareFeet: 12_000, stories: 3, buildingCount: 1 }, "Courtyard")!.shape).toBe("Bar");
  });

  it("draws a plate too short for a corridor as a plain block", () => {
    const form = buildingForm({ grossSquareFeet: 9_000, stories: 3, buildingCount: 1 })!;
    expect(form.shape).toBe("Bar");
    const w = form.wings[0];
    expect((w.x1 - w.x0) / (w.z1 - w.z0)).toBeCloseTo(1.65, 2);
    expect(area(w)).toBeCloseTo(3_000, 0);
  });

  it("has nothing to draw without stories or area", () => {
    expect(buildingForm({ grossSquareFeet: 0, stories: 4, buildingCount: 1 })).toBeNull();
    expect(buildingForm({ grossSquareFeet: 40_000, stories: 0, buildingCount: 1 })).toBeNull();
  });
});

describe("perimeterOf", () => {
  it("leaves out the walls two wings share", () => {
    const a = { x0: 0, z0: 0, x1: 100, z1: 64, stories: 3 };
    const b = { x0: 36, z0: -80, x1: 100, z1: 0, stories: 3 };
    expect(perimeterOf([a])).toBe(328);
    expect(perimeterOf([a, b])).toBe(328 + 2 * (64 + 80) - 2 * 64);
  });
});

describe("shapeFromText", () => {
  it("reads the card's answer, whatever its case", () => {
    expect(shapeFromText("L-Shape")).toBe("L-Shape");
    expect(shapeFromText("courtyard")).toBe("Courtyard");
    expect(shapeFromText("Tower")).toBeNull();
  });
});
