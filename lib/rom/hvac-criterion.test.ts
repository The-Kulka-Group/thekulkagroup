import { describe, expect, it } from "vitest";

import { computeTonnage, deriveGlazing, deriveTonnage, type TonnageFacts } from "./hvac-criterion";

// LA-1282. M-0 and M-1 against the design's worked example
// (docs/precon/criteria/la-777-hvac-tonnage.md, section 3): 130,000 GSF,
// new construction, 140 units, ZIP 11743, balconies yes, storefronts no,
// surface parking.

const EXAMPLE: TonnageFacts = {
  constructionKind: "new",
  grossSquareFeet: 130000,
  unitCount: 140,
  zip: "11743",
  parkingType: "surface",
  band: "standard",
  bandSet: false,
};

describe("deriveGlazing (M-0)", () => {
  it("gives the standard band when balconies and storefronts disagree, at low confidence", () => {
    const card = deriveGlazing({ balconies: "yes", storefronts: "no" });
    expect(card.value).toEqual({ kind: "spec", text: "Standard Glazing Band" });
    expect(card.confidence).toBe("low");
    expect(card.costCodes).toEqual(["30"]);
  });

  it("gives the elevated band when both are yes, and reads high when they agree", () => {
    const both = deriveGlazing({ balconies: "yes", storefronts: "yes" });
    expect(both.value).toEqual({ kind: "spec", text: "Elevated Glazing Band" });
    expect(both.confidence).toBe("high");
    expect(deriveGlazing({ balconies: "no", storefronts: "no" }).confidence).toBe("high");
    expect(deriveGlazing({ balconies: null, storefronts: "no" }).confidence).toBe("low");
  });
});

describe("computeTonnage and deriveTonnage (M-1)", () => {
  it("matches the worked example: zone 4, 688 GSF per ton, 189 tons", () => {
    const result = computeTonnage(EXAMPLE);
    expect(result.zone.zone).toBe(4);
    expect(result.gsfPerTon).toBe(688);
    expect(result.tons).toBe(189);
    // 808 SF units: 42.2 cfm each, 52.3 per 1,000 SF, within the model's 58.
    expect(Math.round(result.ventilationCfmPer1000! * 10) / 10).toBe(52.3);

    const card = deriveTonnage(EXAMPLE);
    expect(card.value).toEqual({ kind: "quantity", amount: 189, unit: "Tons" });
    expect(card.confidence).toBe("high");
    expect(card.inputs.find((one) => one.name === "Glazing Band")?.basis).toBe("assumed");
  });

  it("uses the high-rise model for the elevated band", () => {
    expect(computeTonnage({ ...EXAMPLE, band: "elevated" }).tons).toBe(213);
  });

  it("reads Rockland as zone 5", () => {
    const result = computeTonnage({ ...EXAMPLE, zip: "10956" });
    expect(result.zone.zone).toBe(5);
    expect(result.tons).toBe(Math.round(130000 / 701));
  });

  it("reads low, naming why, for an assumed zone, a renovation, a garage or small units", () => {
    expect(deriveTonnage({ ...EXAMPLE, zip: "12550" }).confidenceReason).toContain("zone 5 is assumed");
    const renovation = deriveTonnage({ ...EXAMPLE, constructionKind: "renovation" });
    expect(renovation.confidence).toBe("low");
    expect(renovation.steps.at(-1)?.result).toBe("189 tons, a floor");
    expect(deriveTonnage({ ...EXAMPLE, parkingType: "underground" }).confidence).toBe("low");
    // 300 units in 130,000 GSF is 377 SF each: over the model's outdoor air.
    expect(deriveTonnage({ ...EXAMPLE, unitCount: 300 }).confidenceReason).toContain("more outdoor air");
    expect(deriveTonnage({ ...EXAMPLE, unitCount: null }).confidenceReason).toContain("ventilation check cannot run");
  });
});
