import {describe, expect, it} from "vitest";
import {
  EXPECTED_NASSAU_CITIES,
  EXPECTED_NASSAU_TOWNS,
  EXPECTED_NASSAU_VILLAGES,
} from "./fixtures/nassau/authoritative-jurisdictions";
import {NASSAU_AUTHORITATIVE_JURISDICTIONS, NASSAU_MUNICIPAL_SOURCES} from "./nassau-municipal-sources";

const sorted = (values: readonly string[]) => [...values].sort();

describe("Nassau municipal source coverage", () => {
  it("matches the official Nassau directory totals", () => {
    const names = (type: "city" | "town" | "village") => NASSAU_AUTHORITATIVE_JURISDICTIONS
      .filter(item => item.jurisdictionType === type)
      .map(item => item.jurisdiction);

    expect(sorted(names("city"))).toEqual(sorted(EXPECTED_NASSAU_CITIES));
    expect(sorted(names("town"))).toEqual(sorted(EXPECTED_NASSAU_TOWNS));
    expect(sorted(names("village"))).toEqual(sorted(EXPECTED_NASSAU_VILLAGES));
  });

  it("has one Nassau source entry for every local jurisdiction", () => {
    const expected = NASSAU_AUTHORITATIVE_JURISDICTIONS
      .map(item => `${item.jurisdictionType}:${item.jurisdiction}`)
      .sort();
    const actual = NASSAU_MUNICIPAL_SOURCES
      .map(item => `${item.jurisdictionType}:${item.jurisdiction}`)
      .sort();

    expect(new Set(actual)).toEqual(new Set(expected));
    expect(NASSAU_MUNICIPAL_SOURCES.every(item => item.county === "Nassau")).toBe(true);
  });

  it("keeps account permit portals as separate restricted sources", () => {
    const hempstead = NASSAU_MUNICIPAL_SOURCES.find(source => source.id === "hempstead-online-permit-center");
    const oysterBay = NASSAU_MUNICIPAL_SOURCES.find(source => source.id === "oyster-bay-building-portal");

    expect(hempstead).toMatchObject({accessMode: "request-or-contact", url: "https://hempsteadny.gov/622/Online-Permit-Center"});
    expect(hempstead?.limits).toContain("not a public townwide permit or project search");
    expect(oysterBay).toMatchObject({accessMode: "request-or-contact", url: "https://oysterbaytown.com/departments/planning-and-development/building-portal/"});
    expect(oysterBay?.limits).toContain("requires an account");
  });

  it("states source capabilities and limits without exposing manual sources as collectable", () => {
    for (const source of NASSAU_MUNICIPAL_SOURCES) {
      expect(source.checkedAt).toBe("2026-09-09");
      expect(source.recordFamilies.length).toBeGreaterThan(0);
      expect(source.retrievableFields.length).toBeGreaterThan(0);
      expect(source.manualSteps.length).toBeGreaterThan(0);
      expect(source.limits.length).toBeGreaterThan(0);
      expect(source.accessMode).not.toBe("automated");
      if (source.accessMode === "no-public-feed") {
        expect(source.coverage).toContain("No public project feed was found");
      }
    }
  });

  it("keeps Floral Park's published building updates available for manual review", () => {
    const floralPark = NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Floral Park");

    expect(floralPark).toMatchObject({
      accessMode: "public-online",
      url: "https://floralparkny.gov/wp-content/uploads/2025/09/07152025-Minutes-F.pdf",
    });
    expect(floralPark?.recordFamilies).toContain("Building Department project updates");
    expect(floralPark?.retrievableFields).toContain("Street address");
  });
});
