import {describe, expect, it} from "vitest";
import {
  SUFFOLK_DISSOLVED_JURISDICTIONS,
  SUFFOLK_MUNICIPAL_SOURCES,
  SUFFOLK_TOWN_JURISDICTIONS,
  SUFFOLK_VILLAGE_JURISDICTIONS,
} from "./suffolk-municipal-sources";

const sorted = (values: readonly string[]) => [...values].sort();
const EXPECTED_TOWNS = [
  "Babylon", "Brookhaven", "East Hampton", "Huntington", "Islip", "Riverhead",
  "Shelter Island", "Smithtown", "Southampton", "Southold",
] as const;
const EXPECTED_VILLAGES = [
  "Amityville", "Asharoken", "Babylon", "Belle Terre", "Bellport", "Brightwaters",
  "Dering Harbor", "East Hampton", "Greenport", "Head of the Harbor", "Huntington Bay",
  "Islandia", "Lake Grove", "Lindenhurst", "Lloyd Harbor", "Nissequogue", "North Haven",
  "Northport", "Ocean Beach", "Old Field", "Patchogue", "Poquott", "Port Jefferson",
  "Quogue", "Sag Harbor", "Sagaponack", "Saltaire", "Shoreham", "Southampton",
  "Village of the Branch", "Westhampton Beach", "West Hampton Dunes",
] as const;

describe("Suffolk municipal source coverage", () => {
  it("uses the county's current list of 10 towns and 32 incorporated villages", () => {
    expect(SUFFOLK_TOWN_JURISDICTIONS).toHaveLength(10);
    expect(new Set(SUFFOLK_TOWN_JURISDICTIONS).size).toBe(10);
    expect(sorted(SUFFOLK_TOWN_JURISDICTIONS)).toEqual(sorted(EXPECTED_TOWNS));
    expect(SUFFOLK_VILLAGE_JURISDICTIONS).toHaveLength(32);
    expect(new Set(SUFFOLK_VILLAGE_JURISDICTIONS).size).toBe(32);
    expect(sorted(SUFFOLK_VILLAGE_JURISDICTIONS)).toEqual(sorted(EXPECTED_VILLAGES));
    expect(SUFFOLK_VILLAGE_JURISDICTIONS.filter(name => name === "Sag Harbor")).toHaveLength(1);
    expect(SUFFOLK_VILLAGE_JURISDICTIONS).not.toContain("Mastic Beach");
    expect(SUFFOLK_DISSOLVED_JURISDICTIONS).toContain("Mastic Beach");
  });

  it("covers every current town and village in Suffolk", () => {
    const coveredTowns = SUFFOLK_MUNICIPAL_SOURCES
      .filter(source => source.jurisdictionType === "town")
      .map(source => source.jurisdiction);
    const coveredVillages = SUFFOLK_MUNICIPAL_SOURCES
      .filter(source => source.jurisdictionType === "village")
      .map(source => source.jurisdiction);

    expect(sorted([...new Set(coveredTowns)])).toEqual(sorted(SUFFOLK_TOWN_JURISDICTIONS));
    expect(sorted([...new Set(coveredVillages)])).toEqual(sorted(SUFFOLK_VILLAGE_JURISDICTIONS));
    expect(SUFFOLK_MUNICIPAL_SOURCES.every(source => source.county === "Suffolk")).toBe(true);
    expect(new Set(SUFFOLK_MUNICIPAL_SOURCES.map(source => source.id)).size).toBe(SUFFOLK_MUNICIPAL_SOURCES.length);
  });

  it("keeps Huntington permit history separate from meeting records", () => {
    const source = SUFFOLK_MUNICIPAL_SOURCES.find(item => item.id === "huntington-site-history");

    expect(source).toMatchObject({
      jurisdiction: "Huntington",
      accessMode: "public-online",
      collectionState: "manual",
      url: "https://huntingtonny.gov/site-history",
      officialAgency: "Town of Huntington Building & Housing / Engineering Services",
    });
    expect(source?.recordFamilies).toContain("Building permits");
    expect(source?.availableFields).toContain("SCTM");
    expect(source?.limits).toContain("not an official town record");
  });

  it("gives every jurisdiction a checked official source and bounded capability claim", () => {
    for (const source of SUFFOLK_MUNICIPAL_SOURCES) {
      expect(source.checkedAt).toBe("2026-09-09");
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.recordFamilies.length).toBeGreaterThan(0);
      expect(source.availableFields.length).toBeGreaterThan(0);
      expect(source.manualSteps.length).toBeGreaterThan(0);
      expect(source.limits.length).toBeGreaterThan(0);
      expect(source.accessMode).not.toBe("automated");
      expect(source.collectionState).not.toBe("collectable");
    }
  });
});
