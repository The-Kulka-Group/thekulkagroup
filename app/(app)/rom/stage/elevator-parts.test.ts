import { describe, expect, it } from "vitest";

import { jackBoxes, machineBoxes } from "./elevator-parts";

// LA-2215: where the derived elevator type draws its extra part. Geometry is
// checked as a reader sees it: the jack is below grade, the machine above the roof.

describe("elevator parts", () => {
  it("draws the hydraulic jack wholly below grade, down to the well when V-2 sets one", () => {
    const boxes = jackBoxes(40);
    expect(Math.max(...boxes.map((b) => b.y + b.h / 2))).toBeLessThanOrEqual(0);
    expect(Math.min(...boxes.map((b) => b.y - b.h / 2))).toBeCloseTo(-40);
  });

  it("gives a jack with no well hole a shallow pit instead of nothing", () => {
    expect(Math.min(...jackBoxes(0).map((b) => b.y - b.h / 2))).toBeLessThan(-5);
  });

  it("draws the traction machine wholly above the roof it stands on", () => {
    for (const alongX of [true, false]) {
      expect(Math.min(...machineBoxes(26, alongX).map((b) => b.y - b.h / 2))).toBeGreaterThanOrEqual(0);
    }
  });
});
