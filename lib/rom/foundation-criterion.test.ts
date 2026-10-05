import { describe, expect, it } from "vitest";

import { computeFoundation, deriveFoundation, type FoundationFacts } from "./foundation-criterion";

// LA-1300. S-1 against the research's pressure table and worked examples
// (docs/precon/research/la-foundation-system.md, sections 1 and 5).

const base: FoundationFacts = {
  constructionKind: "new",
  storiesAboveGrade: 4,
  framingSystem: "wood",
  parkingType: "surface",
  levelsBelowGrade: "no",
  siteConditions: "no",
  tieIn: "no",
  zip: "11743",
};

describe("computeFoundation", () => {
  it("matches the pressure table", () => {
    expect(computeFoundation({ ...base, storiesAboveGrade: 3 }).pressurePsf).toBe(220);
    expect(computeFoundation(base).pressurePsf).toBe(302.5);
    const fiveOverOne = computeFoundation({ ...base, storiesAboveGrade: 6, parkingType: "structured" });
    expect(fiveOverOne.pressurePsf).toBe(644);
    const fiveOverTwo = computeFoundation({ ...base, storiesAboveGrade: 7, parkingType: "structured" });
    expect(fiveOverTwo.concreteDecks).toBe(2);
    expect(fiveOverTwo.pressurePsf).toBe(903);
  });

  it("wood, 4 stories, on good ground: Spread Footings on a slab on grade, high", () => {
    const result = computeFoundation(base);
    expect(result.system).toBe("Spread Footings");
    expect(result.slab).toBe("Slab on Grade");
    expect(Math.round(result.coverage * 100)).toBe(15);
    expect(deriveFoundation(base).confidence).toBe("high");
  });

  it("5 over 1 and 5 over 2 stay on spread footings, low, the second near the mat line", () => {
    const one = deriveFoundation({ ...base, storiesAboveGrade: 6, parkingType: "structured" });
    expect(one.value).toEqual({ kind: "spec", text: "Spread Footings" });
    expect(one.confidence).toBe("low");
    const two = deriveFoundation({ ...base, storiesAboveGrade: 7, parkingType: "structured" });
    expect(two.confidenceReason).toContain("near the 50% line");
  });

  it("poor ground: ground improvement, a mat, or deep foundations", () => {
    expect(computeFoundation({ ...base, siteConditions: "yes" }).system).toBe("Ground Improvement");
    const deep = computeFoundation({ ...base, storiesAboveGrade: 5, parkingType: "underground", siteConditions: "yes" });
    expect(deep.system).toBe("Deep Foundations");
    expect(deep.slab).toBe("Structural Slab");
    const mat = computeFoundation({ ...base, framingSystem: "metal", levelsBelowGrade: "yes", siteConditions: "yes" });
    expect(mat.system).toBe("Mat Foundation");
    expect(mat.slab).toBe("Mat Slab");
  });

  it("prices unknown ground as adequate ground with no rock removal, and says so", () => {
    const card = deriveFoundation({ ...base, siteConditions: "dont_know" });
    expect(card.value).toEqual({ kind: "spec", text: "Spread Footings" });
    expect(card.confidenceReason).toContain("assumes adequate ground conditions and no rock removal");
  });

  it("keeps a renovation's foundations unless it ties in", () => {
    const kept = deriveFoundation({ ...base, constructionKind: "renovation" });
    expect(kept.value).toEqual({ kind: "spec", text: "Existing Foundations" });
    expect(kept.confidence).toBe("low");
    const addition = deriveFoundation({ ...base, constructionKind: "renovation", tieIn: "yes", levelsBelowGrade: "yes" });
    expect(addition.value).toEqual({ kind: "spec", text: "Spread Footings" });
    expect(addition.confidenceReason).toContain("Underpinning the existing building is likely");
  });

  it("flags rock, shallow water and a parking conflict without changing the system", () => {
    expect(deriveFoundation({ ...base, zip: "10956" }).confidenceReason).toContain("Rock is possible");
    expect(deriveFoundation({ ...base, levelsBelowGrade: "yes", siteConditions: "dont_know" }).confidenceReason).toContain(
      "shallow groundwater",
    );
    const conflict = computeFoundation({ ...base, parkingType: "underground", levelsBelowGrade: "no" });
    expect(conflict.belowGrade).toBe(true);
    expect(conflict.flags.join(" ")).toContain("treated as below grade");
  });
});
