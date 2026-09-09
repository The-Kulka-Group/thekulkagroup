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

    expect(hempstead).toMatchObject({jurisdiction: "Hempstead", accessMode: "request-or-contact", collectionState: "restricted", url: "https://hempsteadny.gov/622/Online-Permit-Center"});
    expect(hempstead?.limits).toContain("not a public townwide permit or project search");
    expect(oysterBay).toMatchObject({jurisdiction: "Oyster Bay", accessMode: "request-or-contact", collectionState: "restricted", url: "https://oysterbaytown.com/departments/planning-and-development/building-portal/"});
    expect(oysterBay?.limits).toContain("requires an account");
  });

  it("states source capabilities and limits without exposing manual sources as collectable", () => {
    for (const source of NASSAU_MUNICIPAL_SOURCES) {
      expect(source.checkedAt).toBe("2026-09-09");
      expect(source.recordFamilies.length).toBeGreaterThan(0);
      expect(source.availableFields.length).toBeGreaterThan(0);
      expect(source.manualSteps.length).toBeGreaterThan(0);
      expect(source.limits.length).toBeGreaterThan(0);
      expect(source.accessMode).not.toBe("automated");
      expect(source.collectionState).not.toBe("collectable");
      if (source.accessMode === "no-public-feed") {
        expect(source.coverage).toContain("No public project feed was found");
        expect(source.recordFamilies).toEqual(["Building records", "Permit records", "Planning records", "Zoning records"]);
      }
    }
  });

  it("keeps Floral Park's published building updates available for manual review", () => {
    const floralPark = NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Floral Park");

    expect(floralPark).toMatchObject({
      accessMode: "public-online",
      collectionState: "manual",
      url: "https://floralparkny.gov/board-of-trustees-meeting-minutes/",
    });
    expect(floralPark?.recordFamilies).toContain("Building Department project updates");
    expect(floralPark?.availableFields).toContain("Street address");
  });

  it("uses current public land-use sources for Manorhaven, Munsey Park and Thomaston", () => {
    const manorhaven = NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Manorhaven");
    const munseyPark = NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Munsey Park");
    const thomaston = NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Thomaston");

    for (const source of [manorhaven, munseyPark, thomaston]) {
      expect(source).toMatchObject({accessMode: "public-online", collectionState: "manual"});
    }
    expect(manorhaven?.url).toBe("https://manorhaven.gov/events/category/monthly-village-meetings/");
    expect(manorhaven?.availableFields).toContain("Legal notice");
    expect(munseyPark?.url).toBe("https://munseypark.gov/");
    expect(munseyPark?.recordFamilies).toContain("Zoning appeals");
    expect(thomaston?.url).toBe("https://villageofthomastonny.gov/meeting-schedule/");
    expect(thomaston?.availableFields).toContain("Proposed work");
  });

  it("uses the current official domains for migrated village sites", () => {
    const expectedUrls = new Map([
      ["Brookville", "https://www.villageofbrookville.gov/buildingdepartment"],
      ["Farmingdale", "https://farmingdalevillage.gov/"],
      ["Hewlett Harbor", "https://hewlettharbor.gov/application-licenses/"],
      ["Rockville Centre", "https://www.rvcny.gov/building-department"],
      ["Lawrence", "https://www.lawrenceny.gov/buildingdepartment"],
      ["Massapequa Park", "https://masspkny.gov/agenda-and-minutes"],
      ["Old Westbury", "https://www.villageofoldwestbury.gov/AgendaCenter"],
      ["Westbury", "https://villageofwestbury.gov/"],
    ]);

    for (const [jurisdiction, url] of expectedUrls) {
      expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === jurisdiction)?.url).toBe(url);
    }
  });

  it("links no-feed entries to the official department, forms or records route when one exists", () => {
    const expectedUrls = new Map([
      ["Atlantic Beach", "https://atlanticbeachny.gov/building-department/"],
      ["Hewlett Harbor", "https://hewlettharbor.gov/application-licenses/"],
      ["Island Park", "https://villageofislandpark.gov/applications-fees/"],
      ["Malverne", "https://www.malvernevillage.gov/building-department"],
      ["Stewart Manor", "https://stewartmanor.org/content/PermitsFormsLicenses"],
      ["Woodsburgh", "https://woodsburgh.gov/building-department/"],
      ["East Williston", "https://eastwilliston.gov/building"],
      ["Kings Point", "https://www.villageofkingspoint.gov/building-department"],
      ["Plandome Heights", "https://plandomeheights-ny.gov/forms/"],
      ["Plandome Manor", "https://plandomemanorny.gov/permit-applications/"],
      ["Port Washington North", "https://portwashingtonnorth.gov/permits-forms/"],
      ["Roslyn Harbor", "https://www.roslynharbor.org/permit-forms"],
      ["Russell Gardens", "https://www.russellgardens.com/forms-and-applications"],
      ["Sands Point", "https://www.sandspoint.gov/form-depository"],
      ["Williston Park", "https://www.willistonparkny.gov/building-department"],
      ["Cove Neck", "https://www.coveneck.org/building-department/pages/documents-forms"],
      ["Lattingtown", "https://www.lattingtown.gov/building--landscaping.html"],
      ["Matinecock", "https://www.matinecockvillage.gov/PrintableVillageForms.aspx"],
    ]);

    for (const [jurisdiction, url] of expectedUrls) {
      expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === jurisdiction)).toMatchObject({
        accessMode: "no-public-feed",
        url,
      });
    }
    const saddleRock = NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === "Saddle Rock");
    expect(saddleRock?.url).toBe("https://saddlerockny.gov/");
    expect(saddleRock?.limits).toContain("under construction");
  });

  it("does not deny public land-use records that the current village sites publish", () => {
    const jurisdictions = [
      "Great Neck Estates", "Lake Success", "Lawrence", "Massapequa Park", "North Hills",
      "Old Westbury", "Plandome", "Roslyn", "Roslyn Estates", "Valley Stream", "Westbury",
    ];

    for (const jurisdiction of jurisdictions) {
      expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.jurisdiction === jurisdiction)).toMatchObject({
        accessMode: "public-online",
        collectionState: "manual",
      });
    }
  });

  it("keeps public meeting archives separate from applicant and request routes", () => {
    const routes = new Map([
      ["north-hempstead-zoning-records", "North Hempstead"],
      ["freeport-site-plan-files", "Freeport"],
      ["lynbrook-board-minutes", "Lynbrook"],
      ["freeport-online-permitting", "Freeport"],
      ["hempstead-village-smartgov", "Hempstead"],
      ["valley-stream-permit-system", "Valley Stream"],
    ]);

    for (const [id, jurisdiction] of routes) {
      expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.id === id)?.jurisdiction).toBe(jurisdiction);
    }
    expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.id === "freeport-site-plan-files")?.accessMode).toBe("public-online");
    expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.id === "freeport-online-permitting")?.accessMode).toBe("request-or-contact");
    expect(NASSAU_MUNICIPAL_SOURCES.find(source => source.id === "lynbrook-board-minutes")?.collectionState).toBe("manual");
  });
});
