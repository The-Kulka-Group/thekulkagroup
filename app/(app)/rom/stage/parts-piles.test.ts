import { describe, expect, it } from "vitest";

import { pileSpots } from "./parts-piles";

// LA-2214: the pile layout stays inside the plan, on the walls the cut shows.
describe("pileSpots", () => {
  it("puts every pile inside the plan, along the front and right walls", () => {
    const W = 200, D = 80;
    const spots = pileSpots(W, D, W / 2, D / 2);
    expect(spots.length).toBeGreaterThanOrEqual(4 + 2);
    for (const { x, z } of spots) {
      expect(Math.abs(x)).toBeLessThanOrEqual(W / 2);
      expect(Math.abs(z)).toBeLessThanOrEqual(D / 2);
    }
    expect(spots[0]).toEqual({ x: -88, z: 36.5 });
  });
});
