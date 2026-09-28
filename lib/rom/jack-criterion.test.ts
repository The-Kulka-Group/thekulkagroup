import { describe, expect, it } from "vitest";

import { deriveJackType, jackFact, rockPossible, type JackCriterionFacts } from "./jack-criterion";

// LA-1265. V-2's rule, from docs/precon/research/la-hydraulic-jack-type.md,
// Section 5. Wood framing is 10'-0" floor to floor (the engine's table).

function facts(over: Partial<JackCriterionFacts> = {}): JackCriterionFacts {
  return {
    storiesAboveGrade: 4,
    framingSystem: "wood",
    hasTallerGroundFloor: false,
    belowGrade: "no",
    siteConditions: "no",
    zip: "11743",
    ...over,
  };
}

const text = (f: JackCriterionFacts) => {
  const derived = deriveJackType(f)!;
  return { value: derived.value.kind === "spec" ? derived.value.text : "", confidence: derived.confidence };
};

describe("deriveJackType", () => {
  it("waits for Stories Above Grade", () => {
    expect(deriveJackType(facts({ storiesAboveGrade: null }))).toBeNull();
  });

  it("goes holeless, high, up to 34 ft (four stops at 10'-0\" is 30 ft)", () => {
    expect(text(facts())).toEqual({ value: "Holeless", confidence: "high" });
  });

  it("counts the level below grade as a stop", () => {
    // Five stops: 40 ft, into the middle band.
    const derived = deriveJackType(facts({ belowGrade: "yes" }))!;
    expect(derived.steps[0].result).toContain("5");
    expect(derived.value).toEqual({ kind: "spec", text: "In-Ground" });
  });

  it("in the middle band goes in-ground on dry ground and holeless on wet ground, both low", () => {
    expect(text(facts({ storiesAboveGrade: 5 }))).toEqual({ value: "In-Ground", confidence: "low" });
    expect(text(facts({ storiesAboveGrade: 5, siteConditions: "yes" }))).toEqual({ value: "Holeless", confidence: "low" });
    expect(text(facts({ storiesAboveGrade: 5, siteConditions: "dont_know" }))).toEqual({ value: "In-Ground", confidence: "low" });
  });

  it("needs a well hole from 48 to 60 ft: high on dry ground, low on wet", () => {
    // Six stops: 50 ft.
    expect(text(facts({ storiesAboveGrade: 6 }))).toEqual({ value: "In-Ground", confidence: "high" });
    expect(text(facts({ storiesAboveGrade: 6, siteConditions: "yes" }))).toEqual({ value: "In-Ground", confidence: "low" });
  });

  it("goes roped past 60 ft, low", () => {
    // Seven stories plus a basement, eight stops: 70 ft.
    expect(text(facts({ storiesAboveGrade: 7, belowGrade: "yes" }))).toEqual({ value: "Roped", confidence: "low" });
  });

  it("drops to low where rock is possible (Matt, 2026-09-28)", () => {
    const derived = deriveJackType(facts({ zip: "10920" }))!;
    expect(derived.confidence).toBe("low");
    expect(derived.confidenceReason).toContain("rock");
  });

  it("feeds item 26 and the well hole", () => {
    expect(deriveJackType(facts())!.costCodes).toEqual(["26", "26i"]);
  });
});

describe("helpers", () => {
  it("reads rock-possible ZIPs by prefix", () => {
    expect(rockPossible("10920")).toBe(true);
    expect(rockPossible("12533")).toBe(true);
    expect(rockPossible("11743")).toBe(false);
    expect(rockPossible(null)).toBe(false);
  });

  it("turns an answer into the fact the engine reads", () => {
    expect(jackFact("In-Ground")).toBe("in_ground");
    expect(jackFact("Holeless")).toBe("holeless");
    expect(jackFact("Roped")).toBe("roped");
    expect(jackFact("Something")).toBeNull();
  });
});
