import {describe, expect, it} from "vitest";
import {DISCOVERY_SOURCES} from "./discovery-catalog";
import {filterMunicipalSources, sourceCoverageSummary, sourceJurisdictions, sourceRecordFamilies, validateMunicipalSources, type MunicipalSource} from "./source-directory";
import {VISION_SOURCES} from "./sources";
import {NASSAU_AUTHORITATIVE_JURISDICTIONS} from "./nassau-municipal-sources";
import {SUFFOLK_TOWN_JURISDICTIONS, SUFFOLK_VILLAGE_JURISDICTIONS} from "./suffolk-municipal-sources";

const source = (overrides: Partial<MunicipalSource> = {}): MunicipalSource => ({
  id: "source-one",
  name: "Source one",
  jurisdiction: "Test town",
  jurisdictionType: "town",
  county: "Nassau",
  officialAgency: "Test planning board",
  recordFamilies: ["Planning applications"],
  availableFields: ["Case number"],
  accessMode: "public-online",
  collectionState: "manual",
  manualSteps: "Open the public source and review the case.",
  limits: "The source publishes current cases only.",
  coverage: "Current public cases.",
  url: "https://example.gov/planning",
  checkedAt: "2026-09-09",
  ...overrides,
});

describe("Vision municipal source directory", () => {
  it("keeps every collectable source in the discovery catalog and excludes manual sources", () => {
    const collectableIds = VISION_SOURCES.filter(item => item.collectionState === "collectable").map(item => item.id);
    expect(collectableIds).toEqual(DISCOVERY_SOURCES.map(item => item.id));
    expect(VISION_SOURCES.find(item => item.id === "huntington-meetings")?.collectionState).toBe("manual");
    for (const id of ["nassau-village-hempstead-records", "nassau-village-hempstead-zoning-records", "nassau-village-garden-city-records"]) {
      expect(VISION_SOURCES.find(item => item.id === id)).toMatchObject({accessMode: "automated", collectionState: "collectable"});
    }
  });

  it("filters source capabilities by county, jurisdiction, record family and access mode", () => {
    const sources = [
      source(),
      source({id: "source-two", county: "Suffolk", jurisdictionType: "village", recordFamilies: ["Building permits"], accessMode: "request-or-contact", collectionState: "restricted"}),
    ];
    expect(filterMunicipalSources(sources, {county: "Suffolk"}).map(item => item.id)).toEqual(["source-two"]);
    expect(filterMunicipalSources(sources, {jurisdiction: "Nassau:town:Test town"}).map(item => item.id)).toEqual(["source-one"]);
    expect(filterMunicipalSources(sources, {jurisdictionType: "village", recordFamily: "Building permits", accessMode: "request-or-contact"}).map(item => item.id)).toEqual(["source-two"]);
    expect(sourceJurisdictions(sources)).toEqual([
      {label: "Test town · Town · Nassau", value: "Nassau:town:Test town"},
      {label: "Test town · Village · Suffolk", value: "Suffolk:village:Test town"},
    ]);
    expect(sourceRecordFamilies(sources)).toEqual(["Building permits", "Planning applications"]);
  });

  it("joins every current local jurisdiction without counting directory sources as projects", () => {
    const summary = sourceCoverageSummary(VISION_SOURCES);
    const nassauExpected = NASSAU_AUTHORITATIVE_JURISDICTIONS
      .map(item => `Nassau:${item.jurisdictionType}:${item.jurisdiction}`);
    const suffolkExpected = [
      ...SUFFOLK_TOWN_JURISDICTIONS.map(jurisdiction => `Suffolk:town:${jurisdiction}`),
      ...SUFFOLK_VILLAGE_JURISDICTIONS.map(jurisdiction => `Suffolk:village:${jurisdiction}`),
    ];
    const actual = VISION_SOURCES
      .filter(item => item.jurisdictionType !== "county")
      .map(item => `${item.county}:${item.jurisdictionType}:${item.jurisdiction}`);

    expect(new Set(actual)).toEqual(new Set([...nassauExpected, ...suffolkExpected]));
    expect(actual).toHaveLength(135);
    expect(summary.localJurisdictions).toEqual({total: 111, Nassau: 69, Suffolk: 42});
    expect(summary.countySources).toBe(5);
    expect(summary.directorySources).toBe(140);
    expect(summary.collectableSources).toBe(7);
    expect(Object.values(summary.accessModes).reduce((total, count) => total + count, 0)).toBe(140);
  });

  it("keeps a current date and official HTTPS link on every directory entry", () => {
    expect(VISION_SOURCES).toHaveLength(140);
    for (const item of VISION_SOURCES) {
      expect(item.checkedAt).toBe("2026-09-09");
      expect(item.url).toMatch(/^https:\/\//);
    }
  });

  it("rejects duplicate and incomplete source claims", () => {
    expect(() => validateMunicipalSources([source(), source()])).toThrow("Duplicate");
    expect(() => validateMunicipalSources([source({availableFields: []})])).toThrow("capability");
    expect(() => validateMunicipalSources([source({url: "http://example.gov"})])).toThrow("HTTPS");
  });
});
