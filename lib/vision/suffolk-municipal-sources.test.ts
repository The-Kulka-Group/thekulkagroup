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

  it("keeps each Suffolk town building route separate from meeting records", () => {
    const routes = new Map([
      ["babylon-online-permit-center", "Babylon"],
      ["brookhaven-public-records", "Brookhaven"],
      ["east-hampton-opengov-permits", "East Hampton"],
      ["huntington-permit-portal", "Huntington"],
      ["islip-application-portal", "Islip"],
      ["islip-building-records-request", "Islip"],
      ["riverhead-building-portal", "Riverhead"],
      ["riverhead-building-records-request", "Riverhead"],
      ["shelter-island-property-records", "Shelter Island"],
      ["shelter-island-citysquared", "Shelter Island"],
      ["smithtown-building-portal", "Smithtown"],
      ["southampton-permit-lookup", "Southampton"],
      ["southampton-building-epermits", "Southampton"],
      ["southold-laserfiche-records", "Southold"],
    ]);
    const sources = [...routes].map(([id, jurisdiction]) => {
      const source = SUFFOLK_MUNICIPAL_SOURCES.find(item => item.id === id);
      expect(source?.jurisdiction).toBe(jurisdiction);
      return source;
    });

    expect(sources.every(Boolean)).toBe(true);
    expect(sources.every(source => source?.recordFamilies.some(family => /permit|property|record/i.test(family)))).toBe(true);
    expect(sources.every(source => source?.availableFields.length)).toBe(true);
    expect(SUFFOLK_MUNICIPAL_SOURCES.find(source => source.id === "brookhaven-public-records")?.accessMode).toBe("public-online");
    expect(SUFFOLK_MUNICIPAL_SOURCES.find(source => source.id === "southampton-permit-lookup")?.availableFields).toContain("Permit status");
    expect(SUFFOLK_MUNICIPAL_SOURCES.find(source => source.id === "southold-laserfiche-records")?.availableFields).toContain("Tax map number");
    expect(SUFFOLK_MUNICIPAL_SOURCES.find(source => source.id === "babylon-online-permit-center")?.accessMode).toBe("request-or-contact");
  });

  it("uses public access for public village minutes and does not call Poquott's old agenda current", () => {
    for (const id of ["belle-terre-minutes", "saltaire-minutes", "village-of-the-branch-forms"]) {
      expect(SUFFOLK_MUNICIPAL_SOURCES.find(source => source.id === id)).toMatchObject({
        accessMode: "public-online",
        collectionState: "manual",
      });
    }
    const poquott = SUFFOLK_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Poquott");
    expect(poquott).toMatchObject({
      id: "poquott-records-contact",
      accessMode: "request-or-contact",
      collectionState: "restricted",
      url: "https://www.villageofpoquott.com/",
    });
    expect(poquott?.limits).toContain("January 2024");
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
