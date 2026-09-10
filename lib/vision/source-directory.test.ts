import {describe, expect, it} from "vitest";
import {DISCOVERY_SOURCES} from "./discovery-catalog";
import {filterMunicipalSources, sourceCoverageSummary, sourceJurisdictions, sourceRecordFamilies, validateMunicipalSources, type MunicipalSource} from "./source-directory";
import {AUTOMATED_SOURCE_DEFINITIONS} from "./source-registry";
import {AUTOMATED_COUNTY_SOURCE_RESEARCH, assembleVisionSources, joinAutomatedSourceDirectory, VISION_SOURCES} from "./sources";
import {NASSAU_AUTHORITATIVE_JURISDICTIONS, NASSAU_MUNICIPAL_SOURCE_INPUTS} from "./nassau-municipal-sources";
import {SUFFOLK_MUNICIPAL_SOURCES, SUFFOLK_TOWN_JURISDICTIONS, SUFFOLK_VILLAGE_JURISDICTIONS} from "./suffolk-municipal-sources";

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

  it("joins each automated definition to one directory route and owns its shared facts", () => {
    const collectableSources = VISION_SOURCES.filter(item => item.collectionState === "collectable");

    expect(AUTOMATED_SOURCE_DEFINITIONS).toHaveLength(9);
    expect(collectableSources).toHaveLength(9);
    expect(new Set(collectableSources.map(item => item.id))).toEqual(new Set(AUTOMATED_SOURCE_DEFINITIONS.map(item => item.id)));

    for (const definition of AUTOMATED_SOURCE_DEFINITIONS) {
      const matches = VISION_SOURCES.filter(item => item.id === definition.id);
      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        name: definition.name,
        officialAgency: definition.officialAgency,
        jurisdiction: definition.jurisdiction,
        county: definition.county,
        url: definition.directoryUrl,
        coverage: definition.coverage,
        limits: definition.coverage,
        accessMode: "automated",
        collectionState: "collectable",
      });
    }
  });

  it("keeps automated directory inputs limited to research fields", () => {
    const automatedIds = new Set(AUTOMATED_SOURCE_DEFINITIONS.map(item => item.id));
    const inputs = [
      ...AUTOMATED_COUNTY_SOURCE_RESEARCH,
      ...NASSAU_MUNICIPAL_SOURCE_INPUTS.filter(item => automatedIds.has(item.id)),
    ];

    expect(inputs).toHaveLength(9);
    for (const input of inputs) {
      expect(Object.keys(input).sort()).toEqual([
        "availableFields",
        "checkedAt",
        "id",
        "jurisdictionType",
        "manualSteps",
        "recordFamilies",
      ]);
    }
  });

  it("keeps automated municipal routes in registry order without adapter-based placement", () => {
    const localDirectoryIds = VISION_SOURCES
      .filter(item => item.jurisdictionType !== "county")
      .map(item => item.id);
    const municipalInputIds = new Set([
      ...NASSAU_MUNICIPAL_SOURCE_INPUTS.map(item => item.id),
      ...SUFFOLK_MUNICIPAL_SOURCES.map(item => item.id),
    ]);
    const automatedMunicipalIds = AUTOMATED_SOURCE_DEFINITIONS
      .map(item => item.id)
      .filter(id => municipalInputIds.has(id));

    expect(localDirectoryIds.slice(0, automatedMunicipalIds.length)).toEqual(automatedMunicipalIds);
    expect(localDirectoryIds).toHaveLength(municipalInputIds.size);
    expect(new Set(localDirectoryIds)).toEqual(municipalInputIds);
  });

  it("rejects missing, duplicate and unregistered collectable directory joins", () => {
    const definition = AUTOMATED_SOURCE_DEFINITIONS[0];
    const joinedSource = source({id: definition.id});

    expect(() => joinAutomatedSourceDirectory([], [definition])).toThrow(`Automated source ${definition.id} must match one directory entry.`);
    expect(() => joinAutomatedSourceDirectory([joinedSource, joinedSource], [definition])).toThrow(`Automated source ${definition.id} must match one directory entry.`);
    expect(() => joinAutomatedSourceDirectory([source({collectionState: "collectable"})], [])).toThrow("Collectable directory source source-one has no automated source definition.");
  });

  it("rejects duplicate automated municipal inputs through production assembly", () => {
    const automated = NASSAU_MUNICIPAL_SOURCE_INPUTS.find(item => item.id === "hempstead-village-smartgov");
    if (!automated) throw new Error("Missing automated municipal test input.");

    expect(() => assembleVisionSources([
      ...NASSAU_MUNICIPAL_SOURCE_INPUTS,
      ...SUFFOLK_MUNICIPAL_SOURCES,
      automated,
    ])).toThrow("Automated source hempstead-village-smartgov must match one directory entry.");
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
    expect(summary.collectableSources).toBe(9);
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
