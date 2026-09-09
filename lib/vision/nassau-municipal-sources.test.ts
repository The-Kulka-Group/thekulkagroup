import {describe, expect, it} from "vitest";
import {NASSAU_AUTHORITATIVE_JURISDICTIONS, NASSAU_MUNICIPAL_SOURCES} from "./nassau-municipal-sources";

describe("Nassau municipal source coverage", () => {
  it("matches the official Nassau directory totals", () => {
    expect(NASSAU_AUTHORITATIVE_JURISDICTIONS.filter(item => item.jurisdictionType === "city")).toHaveLength(2);
    expect(NASSAU_AUTHORITATIVE_JURISDICTIONS.filter(item => item.jurisdictionType === "town")).toHaveLength(3);
    expect(NASSAU_AUTHORITATIVE_JURISDICTIONS.filter(item => item.jurisdictionType === "village")).toHaveLength(64);
  });

  it("has one Nassau source entry for every local jurisdiction", () => {
    const expected = NASSAU_AUTHORITATIVE_JURISDICTIONS
      .map(item => `${item.jurisdictionType}:${item.jurisdiction}`)
      .sort();
    const actual = NASSAU_MUNICIPAL_SOURCES
      .map(item => `${item.jurisdictionType}:${item.jurisdiction}`)
      .sort();

    expect(actual).toEqual(expected);
    expect(new Set(actual).size).toBe(actual.length);
    expect(NASSAU_MUNICIPAL_SOURCES.every(item => item.county === "Nassau")).toBe(true);
  });

  it("states source capabilities and limits without exposing manual sources as collectable", () => {
    for (const source of NASSAU_MUNICIPAL_SOURCES) {
      expect(source.checkedAt).toBe("2026-09-09");
      expect(source.recordFamilies.length).toBeGreaterThan(0);
      expect(source.retrievableFields.length).toBeGreaterThan(0);
      expect(source.manualSteps.length).toBeGreaterThan(0);
      expect(source.limits.length).toBeGreaterThan(0);
      expect(source.collectionState).not.toBe("collectable");
      if (source.accessMode === "no-public-feed") {
        expect(source.coverage).toContain("No public project feed was found");
      }
    }
  });
});
