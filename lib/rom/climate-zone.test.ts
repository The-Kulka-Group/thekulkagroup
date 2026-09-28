import { describe, expect, it } from "vitest";

import { climateZoneFor } from "./climate-zone";

// LA-1282. Climate Zone from ZIP, against New York's 2025 county table.

describe("climateZoneFor", () => {
  it("states zone 4 for Long Island, the city and Westchester", () => {
    expect(climateZoneFor("11743")).toEqual({ zone: 4, basis: "stated", area: "Nassau or Suffolk County" });
    expect(climateZoneFor("11530")).toMatchObject({ zone: 4, basis: "stated" });
    expect(climateZoneFor("10001")).toMatchObject({ zone: 4, basis: "stated", area: "New York County" });
    expect(climateZoneFor("10601")).toMatchObject({ zone: 4, basis: "stated", area: "Westchester County" });
  });

  it("states zone 5 for Rockland, Orange, Putnam and Dutchess", () => {
    expect(climateZoneFor("10956")).toMatchObject({ zone: 5, basis: "stated" });
    expect(climateZoneFor("10512")).toEqual({ zone: 5, basis: "stated", area: "Putnam County" });
    expect(climateZoneFor("12601")).toMatchObject({ zone: 5, basis: "stated", area: "Dutchess County" });
  });

  it("assumes the zone where a prefix spans two, and says why", () => {
    const zone = climateZoneFor("12550");
    expect(zone).toMatchObject({ zone: 5, basis: "assumed" });
    expect(zone.note).toContain("Ulster (zone 6)");
  });

  it("falls back to zone 4, assumed, with no ZIP or one outside New York", () => {
    expect(climateZoneFor(null)).toMatchObject({ zone: 4, basis: "assumed" });
    expect(climateZoneFor("123")).toMatchObject({ zone: 4, basis: "assumed" });
    expect(climateZoneFor("07030")).toMatchObject({ zone: 4, basis: "assumed", area: "Outside New York" });
  });
});
