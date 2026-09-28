import { describe, expect, it } from "vitest";

import { computeConstructionType, type ConstructionTypeFacts, deriveConstructionType } from "./construction-type-criterion";

// LA-1298. A-1 against the research's worked examples
// (docs/precon/research/la-construction-type.md, section 6).

const base: ConstructionTypeFacts = {
  storiesAboveGrade: 3,
  framingSystem: "wood",
  parkingType: "surface",
  retailStorefronts: "no",
  grossSquareFeet: 30000,
  buildingCount: 1,
  zip: "11743",
};

describe("computeConstructionType", () => {
  it("three-story garden building: Type VA, no podium, 13R, high", () => {
    const result = computeConstructionType(base);
    expect(result.text).toBe("Type VA");
    expect(result.heightFeet).toBe(30);
    expect(result.heightLimitFeet).toBe(70);
    expect(result.areaPerStory).toBe(10000);
    expect(result.areaLimit).toBe(12000);
    expect(result.sprinkler).toBe("NFPA 13R");
    // VB passes its NFPA 13 area but not its 13R area of 7,000 SF.
    expect(result.alsoAllowed).toEqual([]);
    expect(deriveConstructionType(base).confidence).toBe("high");
  });

  it("five over one: Type IIIA over a Type IA podium, NFPA 13, low", () => {
    const facts = { ...base, storiesAboveGrade: 6, parkingType: "structured", grossSquareFeet: 150000 };
    const result = computeConstructionType(facts);
    expect(result.text).toBe("Type IIIA over Type IA Podium");
    expect(result.podiumStories).toBe(1);
    expect(result.framedStories).toBe(5);
    expect(result.heightFeet).toBe(62);
    expect(result.areaPerStory).toBe(25000);
    expect(result.area).toBe("pass");
    expect(result.sprinkler).toBe("NFPA 13");
    expect(result.alsoAllowed).toEqual(["Type IIIB over Type IA Podium"]);
    const card = deriveConstructionType(facts);
    expect(card.confidence).toBe("low");
    expect(card.confidenceReason).toContain("podium level is assumed");
  });

  it("four-story metal building: Type IIB, NFPA 13, low", () => {
    const facts: ConstructionTypeFacts = { ...base, storiesAboveGrade: 4, framingSystem: "metal", parkingType: "none", grossSquareFeet: 80000 };
    const result = computeConstructionType(facts);
    expect(result.text).toBe("Type IIB");
    expect(result.heightFeet).toBe(40);
    // 20,000 SF fails IIB's 13R limit of 16,000, so NFPA 13.
    expect(result.sprinkler).toBe("NFPA 13");
    expect(result.area).toBe("pass");
    expect(result.alsoAllowed).toEqual(["Type IIA"]);
    expect(deriveConstructionType(facts).confidence).toBe("low");
  });

  it("retail with four floors above: Type VA over a Type IA podium, a plain Type IIIA also legal", () => {
    const facts = { ...base, storiesAboveGrade: 5, retailStorefronts: "yes" as const, grossSquareFeet: 100000 };
    const result = computeConstructionType(facts);
    expect(result.text).toBe("Type VA over Type IA Podium");
    expect(result.heightFeet).toBe(55);
    expect(result.areaPerStory).toBe(20000);
    expect(result.alsoAllowed).toEqual(["Type IIIA"]);
    expect(deriveConstructionType(facts).confidenceReason).toContain("plain wood building");
  });

  it("New York City: Type IIIA for wood, always low", () => {
    const facts = { ...base, storiesAboveGrade: 4, zip: "11201", grossSquareFeet: 40000 };
    expect(computeConstructionType(facts).text).toBe("Type IIIA");
    expect(deriveConstructionType(facts).confidenceReason).toContain("New York City");
    expect(computeConstructionType({ ...facts, framingSystem: "metal" }).text).toBe("Type IIA");
  });

  it("wood at eight stories does not fit", () => {
    const result = computeConstructionType({ ...base, storiesAboveGrade: 8, grossSquareFeet: 160000 });
    expect(result.text).toBe("Type IA or IB");
    expect(result.woodTooTall).toBe(true);
  });

  it("flags an unset frame, a tight height and an area past the limit", () => {
    expect(deriveConstructionType({ ...base, framingSystem: null }).confidenceReason).toContain("Framing System is not set");
    // Four wood stories of 40,000 SF each: past VA's 36,000, inside the frontage allowance.
    const wide = computeConstructionType({ ...base, storiesAboveGrade: 4, grossSquareFeet: 160000 });
    expect(wide.area).toBe("frontage");
    const huge = computeConstructionType({ ...base, storiesAboveGrade: 4, grossSquareFeet: 400000 });
    expect(huge.area).toBe("fire_walls");
  });
});
