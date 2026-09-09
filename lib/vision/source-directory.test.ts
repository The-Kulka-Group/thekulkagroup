import {describe, expect, it} from "vitest";
import {DISCOVERY_SOURCES} from "./discovery-catalog";
import {filterMunicipalSources, sourceRecordFamilies, validateMunicipalSources, type MunicipalSource} from "./source-directory";
import {VISION_SOURCES} from "./sources";

const source = (overrides: Partial<MunicipalSource> = {}): MunicipalSource => ({
  id: "source-one",
  name: "Source one",
  jurisdiction: "Test town",
  jurisdictionType: "town",
  county: "Nassau",
  officialAgency: "Test planning board",
  recordFamilies: ["Planning applications"],
  retrievableFields: ["Case number"],
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
  });

  it("filters source capabilities by county, jurisdiction, record family and access mode", () => {
    const sources = [
      source(),
      source({id: "source-two", county: "Suffolk", jurisdictionType: "village", recordFamilies: ["Building permits"], accessMode: "request-or-contact", collectionState: "restricted"}),
    ];
    expect(filterMunicipalSources(sources, {county: "Suffolk"}).map(item => item.id)).toEqual(["source-two"]);
    expect(filterMunicipalSources(sources, {jurisdictionType: "village", recordFamily: "Building permits", accessMode: "request-or-contact"}).map(item => item.id)).toEqual(["source-two"]);
    expect(sourceRecordFamilies(sources)).toEqual(["Building permits", "Planning applications"]);
  });

  it("rejects duplicate, incomplete and inconsistent source claims", () => {
    expect(() => validateMunicipalSources([source(), source()])).toThrow("Duplicate");
    expect(() => validateMunicipalSources([source({retrievableFields: []})])).toThrow("capability");
    expect(() => validateMunicipalSources([source({url: "http://example.gov"})])).toThrow("HTTPS");
    expect(() => validateMunicipalSources([source({accessMode: "automated", collectionState: "manual"})])).toThrow("inconsistent");
  });
});
