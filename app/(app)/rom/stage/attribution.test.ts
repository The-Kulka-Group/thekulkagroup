import { describe, expect, it } from "vitest";

import { movesBetween, snapshotOf } from "./attribution";

// LA-1318: a moment's price tag carries what it moved in each box.

describe("movesBetween", () => {
  const before = snapshotOf(
    [
      { key: "element:Elevator", midpoint: 280_000 },
      { key: "block:30", midpoint: 1_900_000 },
      { key: "block:3", midpoint: 2_400_000 },
    ],
    118_000,
  );

  it("names each box that moved, largest first, ignoring rounding", () => {
    const after = snapshotOf(
      [
        { key: "element:Elevator", midpoint: 700_000 },
        { key: "block:30", midpoint: 1_900_400 },
        { key: "block:3", midpoint: 2_300_000 },
        { key: "block:26i", midpoint: 36_000 },
      ],
      118_000,
    );
    expect(movesBetween(before, after)).toEqual([
      { key: "element:Elevator", amount: 420_000 },
      { key: "block:3", amount: -100_000 },
      { key: "block:26i", amount: 36_000 },
    ]);
  });

  it("counts a box that left as moving down to zero", () => {
    const after = snapshotOf([{ key: "element:Elevator", midpoint: 280_000 }, { key: "block:30", midpoint: 1_900_000 }], 118_000);
    expect(movesBetween(before, after)).toEqual([{ key: "block:3", amount: -2_400_000 }]);
  });

  it("names nothing when the gross area changed, since every figure moves at once", () => {
    const after = snapshotOf([{ key: "block:30", midpoint: 2_500_000 }], 150_000);
    expect(movesBetween(before, after)).toEqual([]);
  });
});
