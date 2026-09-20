import { describe, expect, it } from "vitest";

import { bestCanonicalMatch, MATCH_THRESHOLD } from "./canonical-item-match";

const ITEMS = [
  { id: "item-1", itemNumber: "2", name: "Foundations, footings, and slab-on-grade", masterformatDivision: "03" },
  { id: "item-2", itemNumber: "26", name: "Elevators", masterformatDivision: "14" },
  { id: "item-3", itemNumber: "30", name: "HVAC system", masterformatDivision: "23" },
];

describe("bestCanonicalMatch", () => {
  it("scores an exact (punctuation aside) description match at 1", () => {
    const match = bestCanonicalMatch("Foundations footings and slab on grade", null, ITEMS);
    expect(match?.item.itemNumber).toBe("2");
    expect(match?.score).toBe(1);
  });

  it("scores completely unrelated text at 0, below the threshold", () => {
    const match = bestCanonicalMatch("Totally unrelated widget nonsense", null, ITEMS);
    expect(match?.score).toBe(0);
    expect(match!.score).toBeLessThan(MATCH_THRESHOLD);
  });

  it("adds the division bonus without letting it override a clearly better text match", () => {
    // Partial text match (not 1.0) so the bonus has visible room to add to it.
    const withoutDivision = bestCanonicalMatch("New Elevators", null, ITEMS)!;
    const withMatchingDivision = bestCanonicalMatch("New Elevators", "14", ITEMS)!;
    const withUnrelatedDivision = bestCanonicalMatch("New Elevators", "23", ITEMS)!;

    expect(withoutDivision.item.itemNumber).toBe("26");
    expect(withMatchingDivision.item.itemNumber).toBe("26");
    expect(withMatchingDivision.score).toBeGreaterThan(withoutDivision.score);
    // A division naming a different, textually unrelated item does not steal
    // the win from a strong text match on the right one.
    expect(withUnrelatedDivision.item.itemNumber).toBe("26");
    expect(withUnrelatedDivision.score).toBe(withoutDivision.score);
  });

  it("caps a boosted score at 1", () => {
    const match = bestCanonicalMatch("Elevators", "14", ITEMS)!;
    expect(match.score).toBeLessThanOrEqual(1);
  });

  it("normalizes a single-digit division before comparing", () => {
    const match = bestCanonicalMatch("Elevator", "3", [
      { id: "item-4", itemNumber: "2", name: "Foundations", masterformatDivision: "03" },
    ])!;
    expect(match.score).toBeGreaterThan(0);
  });

  it("returns null only when there are no candidates at all", () => {
    expect(bestCanonicalMatch("Anything", null, [])).toBeNull();
  });
});
