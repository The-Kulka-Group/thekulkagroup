import { describe, expect, it } from "vitest";

import {
  priceBranchGatedSection,
  priceParking,
  proposeGrossSquareFeet,
  scoreClosingComparison,
} from "./rom-intake";

describe("priceBranchGatedSection", () => {
  it("prices the section when the answer is yes", () => {
    const result = priceBranchGatedSection("yes", () => ({ low: 100, high: 200 }));
    expect(result).toEqual({ status: "priced", low: 100, high: 200 });
  });

  it("zeroes the section when the answer is no, without running the pricer", () => {
    let ran = false;
    const result = priceBranchGatedSection("no", () => {
      ran = true;
      return { low: 100, high: 200 };
    });

    expect(result).toEqual({ status: "zero" });
    expect(ran).toBe(false);
  });

  it("shows TBD when the answer is don't know, without running the pricer", () => {
    let ran = false;
    const result = priceBranchGatedSection("dont_know", () => {
      ran = true;
      return { low: 100, high: 200 };
    });

    expect(result).toEqual({ status: "tbd" });
    expect(ran).toBe(false);
  });
});

describe("proposeGrossSquareFeet", () => {
  it("proposes GSF from unit count times GSF per unit", () => {
    const proposal = proposeGrossSquareFeet(15, 1520);
    expect(proposal.grossSquareFeet).toBe(22800);
    expect(proposal.confidence).toBe("low");
  });

  it("rounds to a whole number of square feet", () => {
    const proposal = proposeGrossSquareFeet(3, 1000.4);
    expect(Number.isInteger(proposal.grossSquareFeet)).toBe(true);
  });

  it("states the arithmetic in the assumption text", () => {
    const proposal = proposeGrossSquareFeet(15, 1520);
    expect(proposal.assumption).toContain("15");
    expect(proposal.assumption).toContain("1,520");
    expect(proposal.assumption).toContain("22,800");
  });

  it("refuses a unit count of zero", () => {
    expect(() => proposeGrossSquareFeet(0, 1520)).toThrow(/unit count/i);
  });

  it("refuses a GSF-per-unit benchmark of zero", () => {
    expect(() => proposeGrossSquareFeet(15, 0)).toThrow(/gross square feet per unit/i);
  });
});

describe("priceParking", () => {
  const baseRate = { low: 1, high: 2 };
  const incrementRate = { low: 10, high: 20 };

  it("always applies the base paving rate, site scope", () => {
    for (const parkingType of ["none", "surface", "structured", "underground", "dont_know"] as const) {
      const pricing = priceParking(1000, parkingType, baseRate, incrementRate);
      expect(pricing.basePaving).toEqual({ low: 1000, high: 2000, scopeSide: "site" });
    }
  });

  it("zeroes the increment for none, building scope", () => {
    const pricing = priceParking(1000, "none", baseRate, incrementRate);
    expect(pricing.structuredOrUndergroundIncrement).toEqual({
      low: 0,
      high: 0,
      scopeSide: "building",
    });
  });

  it("zeroes the increment for surface", () => {
    const pricing = priceParking(1000, "surface", baseRate, incrementRate);
    expect(pricing.structuredOrUndergroundIncrement).toEqual({
      low: 0,
      high: 0,
      scopeSide: "building",
    });
  });

  it("prices the increment for structured, building scope", () => {
    const pricing = priceParking(1000, "structured", baseRate, incrementRate);
    expect(pricing.structuredOrUndergroundIncrement).toEqual({
      low: 10000,
      high: 20000,
      scopeSide: "building",
    });
  });

  it("prices the increment for underground the same as structured", () => {
    const structured = priceParking(1000, "structured", baseRate, incrementRate);
    const underground = priceParking(1000, "underground", baseRate, incrementRate);
    expect(underground.structuredOrUndergroundIncrement).toEqual(
      structured.structuredOrUndergroundIncrement,
    );
  });

  it("shows the increment as TBD (null) for don't know, distinct from zero", () => {
    const pricing = priceParking(1000, "dont_know", baseRate, incrementRate);
    expect(pricing.structuredOrUndergroundIncrement).toBeNull();
  });

  it("refuses a project with no floor area", () => {
    expect(() => priceParking(0, "surface", baseRate, incrementRate)).toThrow(/gross square feet/i);
  });
});

describe("scoreClosingComparison", () => {
  it("scores a perfect prediction as zero percent error, within ten percent", () => {
    const score = scoreClosingComparison({ low: 900, high: 1100 }, 1000);
    expect(score.percentError).toBe(0);
    expect(score.withinTenPercent).toBe(true);
  });

  it("passes at exactly ten percent high", () => {
    const score = scoreClosingComparison({ low: 1100, high: 1100 }, 1000);
    expect(score.percentError).toBe(10);
    expect(score.withinTenPercent).toBe(true);
  });

  it("fails just over ten percent high", () => {
    const score = scoreClosingComparison({ low: 1101, high: 1101 }, 1000);
    expect(score.percentError).toBeCloseTo(10.1, 5);
    expect(score.withinTenPercent).toBe(false);
  });

  it("fails symmetrically on the low side", () => {
    const score = scoreClosingComparison({ low: 889, high: 889 }, 1000);
    expect(score.percentError).toBeCloseTo(-11.1, 1);
    expect(score.withinTenPercent).toBe(false);
  });

  it("scores off the midpoint of a ranged prediction", () => {
    const score = scoreClosingComparison({ low: 800, high: 1000 }, 900);
    expect(score.percentError).toBe(0);
  });

  it("refuses a negative actual trade cost", () => {
    expect(() => scoreClosingComparison({ low: 100, high: 200 }, -1)).toThrow(
      /actual trade cost/i,
    );
  });

  it("accepts a zero actual trade cost, matching the schema's own check (>= 0)", () => {
    expect(() => scoreClosingComparison({ low: 100, high: 200 }, 0)).not.toThrow();
  });

  it("scores a zero actual against a zero prediction as a perfect match", () => {
    const score = scoreClosingComparison({ low: 0, high: 0 }, 0);
    expect(score.percentError).toBe(0);
    expect(score.withinTenPercent).toBe(true);
  });

  it("scores a zero actual against any nonzero prediction as the largest finite miss, not a crash", () => {
    const score = scoreClosingComparison({ low: 100, high: 200 }, 0);
    expect(score.percentError).toBe(Number.MAX_SAFE_INTEGER);
    expect(score.withinTenPercent).toBe(false);
  });
});
