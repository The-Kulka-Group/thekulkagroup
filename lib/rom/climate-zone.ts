// LA-1282. Climate Zone from the project's ZIP, the fact M-1 (HVAC tonnage)
// reads and LA-781 (insulation) will read. The zones are New York's own: the
// 2025 Energy Conservation Construction Code of New York State, Tables
// C301.1(1) and R301.1(1), which list the same counties
// (docs/precon/criteria/la-777-hvac-tonnage.md, section 2):
//
// - Zone 4: the five NYC boroughs, Nassau, Suffolk and Westchester.
// - Zone 5: Rockland, Putnam, Orange, Dutchess and most of upstate west of the
//   Adirondacks.
// - Zone 6: the Adirondacks, the North Country and the Catskill counties
//   (Sullivan, Ulster, Delaware).
//
// The design maps ZIP to county through HUD's USPS crosswalk, a quarterly
// download that needs a HUD account. Until it is loaded, this reads the
// county from the ZIP's three-digit prefix (the USPS sectional center) and
// names the counties it covers. Where
// one prefix spans counties in two zones, the zone is assumed and the card
// reads low, which is the design's own rule for a ZIP that crosses zones. The
// crosswalk can replace the prefix table later without changing the result's
// shape.

export type ClimateZone = {
  zone: 4 | 5 | 6;
  basis: "stated" | "assumed";
  /** The place the zone was read for, as the card names it. */
  area: string;
  /** Why the zone was assumed, when it was. */
  note?: string;
};

type PrefixZone = { zone: 4 | 5 | 6; area: string } | { zone: 4 | 5 | 6; area: string; spans: string };

/** Putnam County ZIPs inside the 105 (Westchester) prefix. */
const PUTNAM_IN_105 = new Set(["10509", "10512", "10516", "10524", "10537", "10541", "10542", "10579"]);

const PREFIXES: Record<string, PrefixZone> = {
  "005": { zone: 4, area: "Suffolk County" },
  "063": { zone: 4, area: "Suffolk County (Fishers Island)" },
  "100": { zone: 4, area: "New York County" },
  "101": { zone: 4, area: "New York County" },
  "102": { zone: 4, area: "New York County" },
  "103": { zone: 4, area: "Richmond County" },
  "104": { zone: 4, area: "Bronx County" },
  "105": { zone: 4, area: "Westchester County" },
  "106": { zone: 4, area: "Westchester County" },
  "107": { zone: 4, area: "Westchester County" },
  "108": { zone: 4, area: "Westchester County" },
  "109": { zone: 5, area: "Rockland or Orange County" },
  "110": { zone: 4, area: "Queens or Nassau County" },
  "111": { zone: 4, area: "Queens County" },
  "112": { zone: 4, area: "Kings County" },
  "113": { zone: 4, area: "Queens County" },
  "114": { zone: 4, area: "Queens County" },
  "115": { zone: 4, area: "Nassau County" },
  "116": { zone: 4, area: "Queens County" },
  "117": { zone: 4, area: "Nassau or Suffolk County" },
  "118": { zone: 4, area: "Nassau County" },
  "119": { zone: 4, area: "Suffolk County" },
  "120": { zone: 5, area: "the Capital District", spans: "Albany, Rensselaer and Saratoga (zone 5) with Fulton, Montgomery and Warren (zone 6)" },
  "121": { zone: 5, area: "the Capital District", spans: "Albany, Columbia and Schoharie (zone 5) with Delaware, Montgomery and Otsego (zone 6)" },
  "122": { zone: 5, area: "Albany County" },
  "123": { zone: 5, area: "the Schenectady area", spans: "Schenectady and Schoharie (zone 5) with Delaware and Otsego (zone 6)" },
  "124": { zone: 6, area: "the Kingston area", spans: "Ulster and Delaware (zone 6) with Greene (zone 5)" },
  "125": { zone: 5, area: "the Mid-Hudson Valley", spans: "Orange, Dutchess and Putnam (zone 5) with part of Ulster (zone 6)" },
  "126": { zone: 5, area: "Dutchess County" },
  "127": { zone: 6, area: "the Monticello area", spans: "Sullivan (zone 6) with the Port Jervis corner of Orange (zone 5)" },
  "128": { zone: 6, area: "the Glens Falls area", spans: "Warren, Essex and Hamilton (zone 6) with Washington and Saratoga (zone 5)" },
  "129": { zone: 6, area: "Clinton, Essex or Franklin County" },
  "130": { zone: 5, area: "the Syracuse area", spans: "Onondaga, Cayuga, Oswego and Cortland (zone 5) with Madison (zone 6)" },
  "131": { zone: 5, area: "the Syracuse area", spans: "Onondaga, Cayuga, Oswego and Cortland (zone 5) with Madison (zone 6)" },
  "132": { zone: 5, area: "Onondaga County" },
  "133": { zone: 6, area: "the Utica area", spans: "Oneida, Herkimer and Madison (zone 6) with Oswego (zone 5)" },
  "134": { zone: 6, area: "the Utica area", spans: "Oneida, Herkimer and Madison (zone 6) with Oswego (zone 5)" },
  "135": { zone: 6, area: "Oneida County" },
  "136": { zone: 6, area: "Jefferson, Lewis or St. Lawrence County" },
  "137": { zone: 5, area: "the Binghamton area", spans: "Broome, Tioga and Cortland (zone 5) with Chenango, Delaware and Otsego (zone 6)" },
  "138": { zone: 5, area: "the Binghamton area", spans: "Broome, Tioga and Cortland (zone 5) with Chenango, Delaware and Otsego (zone 6)" },
  "139": { zone: 5, area: "Broome County" },
  "140": { zone: 5, area: "Western New York" },
  "141": { zone: 5, area: "Western New York" },
  "142": { zone: 5, area: "Erie County" },
  "143": { zone: 5, area: "Niagara County" },
  "144": { zone: 5, area: "the Rochester area" },
  "145": { zone: 5, area: "the Rochester area" },
  "146": { zone: 5, area: "Monroe County" },
  "147": { zone: 5, area: "Chautauqua or Cattaraugus County" },
  "148": { zone: 5, area: "the Southern Tier" },
  "149": { zone: 5, area: "Chemung County" },
};

/** The climate zone for a ZIP, stated when its prefix sits in one zone. */
export function climateZoneFor(zip: string | null | undefined): ClimateZone {
  const clean = (zip ?? "").trim();
  if (!/^\d{5}$/.test(clean)) {
    return { zone: 4, basis: "assumed", area: "No ZIP", note: "No ZIP is set, so zone 4, most of Kulka's work, is assumed." };
  }
  if (PUTNAM_IN_105.has(clean)) return { zone: 5, basis: "stated", area: "Putnam County" };
  const found = PREFIXES[clean.slice(0, 3)];
  if (!found) {
    return {
      zone: 4,
      basis: "assumed",
      area: "Outside New York",
      note: "The ZIP is outside New York's county table, so zone 4 is assumed.",
    };
  }
  if ("spans" in found) {
    return {
      zone: found.zone,
      basis: "assumed",
      area: found.area,
      note: `ZIPs starting ${clean.slice(0, 3)} cover ${found.spans}, so zone ${found.zone} is assumed.`,
    };
  }
  return { zone: found.zone, basis: "stated", area: found.area };
}
