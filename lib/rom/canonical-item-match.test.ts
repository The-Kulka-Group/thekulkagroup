import { describe, expect, it } from "vitest";

import {
  bestCanonicalMatch,
  isRateOutlier,
  MATCH_THRESHOLD,
  OUTLIER_MULTIPLIER,
  tokenizeCanonicalItems,
} from "./canonical-item-match";

const CANDIDATES = [
  { id: "item-1", itemNumber: "2", name: "Foundations, footings, and slab-on-grade", masterformatDivision: "03" },
  { id: "item-2", itemNumber: "26", name: "Elevators", masterformatDivision: "14" },
  { id: "item-3", itemNumber: "30", name: "HVAC system", masterformatDivision: "23" },
];
const ITEMS = tokenizeCanonicalItems(CANDIDATES);

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
    const match = bestCanonicalMatch(
      "Elevator",
      "3",
      tokenizeCanonicalItems([{ id: "item-4", itemNumber: "2", name: "Foundations", masterformatDivision: "03" }]),
    )!;
    expect(match.score).toBeGreaterThan(0);
  });

  it("returns null only when there are no candidates at all", () => {
    expect(bestCanonicalMatch("Anything", null, [])).toBeNull();
  });
});

describe("tokenizeCanonicalItems", () => {
  it("tokenizes each item's name once, keeping the original item alongside its tokens", () => {
    const tokenized = tokenizeCanonicalItems(CANDIDATES);
    expect(tokenized).toHaveLength(CANDIDATES.length);
    expect(tokenized[1].item).toEqual(CANDIDATES[1]);
    expect(tokenized[1].tokens.has("elevators")).toBe(true);
  });
});

describe("isRateOutlier", () => {
  it("never flags a rate when the item has no existing benchmark data", () => {
    expect(isRateOutlier(250, undefined)).toBe(false);
    expect(isRateOutlier(250, { median: 10, count: 0 })).toBe(false);
  });

  it("does not flag a rate within a normal range of the existing median", () => {
    expect(isRateOutlier(12, { median: 10, count: 5 })).toBe(false);
    expect(isRateOutlier(8, { median: 10, count: 5 })).toBe(false);
  });

  it("flags a rate more than OUTLIER_MULTIPLIER above the existing median (the ADR 0003 story: $250/sqft against real data around $20-30/sqft)", () => {
    expect(isRateOutlier(250, { median: 22, count: 12 })).toBe(true);
    expect(OUTLIER_MULTIPLIER).toBeGreaterThan(1);
  });

  it("flags a rate more than OUTLIER_MULTIPLIER below the existing median", () => {
    expect(isRateOutlier(1, { median: 22, count: 12 })).toBe(true);
  });

  it("treats a single existing benchmark as a valid comparison baseline", () => {
    expect(isRateOutlier(250, { median: 20, count: 1 })).toBe(true);
  });
});
