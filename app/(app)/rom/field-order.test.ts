import { describe, expect, it } from "vitest";
import type { BlockClassification, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { addsToTotal } from "./block-layout";
import {
  barModel,
  buildField,
  chipFor,
  chipText,
  divisionFor,
  divisionRank,
  elementHasNoRate,
  entryForCostCode,
  itemsLabel,
  lowestDivision,
  orderField,
  packageCard,
  sharePercent,
  statedDivisions,
  type FieldEntry,
  type RomOrder,
} from "./field-order";
import type { RomView } from "./view-groups";

// LA-1181. The pilot's own item-number cost codes (1, 1a, 28a, 28b, 31f, 36a)
// carry their division only through a stated classification, the way the
// demolition pilot migration states them. The benchmark-style codes
// (09-900, 22-100, 26-100) carry theirs in their first two digits. Every
// figure is synthetic.

function line(patch: Partial<RomLine> & Pick<RomLine, "costCode" | "low" | "high">): RomLine {
  return {
    label: `Synthetic ${patch.costCode}`,
    confidence: "high",
    heldForReview: false,
    comparableCount: 2,
    comparables: [],
    judgmentAdjustments: [],
    scopeSide: "building",
    contractSide: "kulka",
    detailLevel: null,
    element: null,
    breakoutOf: null,
    buyoutPackage: null,
    gateStatus: null,
    ...patch,
  };
}

function classification(
  over: Partial<BlockClassification> & Pick<BlockClassification, "costCode">,
): BlockClassification {
  return {
    detailLevel: 1,
    element: null,
    breakoutOfCostCode: null,
    buyoutPackage: null,
    statedBy: "automated test",
    statedOn: "2026-09-27",
    reason: "synthetic",
    ...over,
  };
}

function rom(lines: RomLine[], unpricedItems: UnpricedItem[] = []): Rom {
  const adds = lines.filter(addsToTotal);
  const sum = (only: RomLine[]) => ({
    low: only.reduce((s, l) => s + l.low, 0),
    high: only.reduce((s, l) => s + l.high, 0),
  });
  return {
    lines,
    total: sum(adds),
    kulkaContractTotal: sum(adds.filter((l) => l.contractSide !== "owner")),
    carvedOut: { low: 0, high: 0 },
    notInThisJob: [],
    tbdGateItems: [],
    assumedPresentItems: [],
    unpricedItems,
    assumptions: [],
    parameters: {} as Rom["parameters"],
  };
}

/**
 * The browser check's own shape: demolition in scope, its disconnects spread
 * across Plumbing and Electrical, Site Work carrying only an unpriced item,
 * and Drywall and Finishes, Plumbing and Electrical carrying a benchmark line
 * each.
 */
function pilot() {
  const lines = [
    line({ costCode: "1a", label: "Structure Demolition", low: 60_000, high: 80_000, element: "Demolition", buyoutPackage: "Demolition" }),
    line({ costCode: "1", label: "Site Demolition", low: 4_000, high: 5_000, element: "Demolition", buyoutPackage: "Demolition" }),
    line({ costCode: "28a", label: "Plumbing Disconnect and Cap", low: 1_200, high: 1_500, element: "Demolition", driverCostCode: "1a", buyoutPackage: "Plumbing" }),
    line({ costCode: "28b", label: "Gas Meter and Service Disconnect", low: 800, high: 1_000, element: "Demolition", driverCostCode: "1a", buyoutPackage: "Plumbing" }),
    line({ costCode: "31f", label: "Electrical Service Disconnect", low: 600, high: 800, element: "Demolition", driverCostCode: "1a", buyoutPackage: "Electrical" }),
    line({ costCode: "09-900", label: "Finishes", low: 1_100_000, high: 1_300_000, buyoutPackage: "Drywall and Finishes" }),
    line({ costCode: "22-100", label: "Plumbing Rough-In", low: 700_000, high: 900_000, buyoutPackage: "Plumbing" }),
    line({ costCode: "26-100", label: "Electrical", low: 2_000_000, high: 2_400_000, buyoutPackage: "Electrical" }),
  ];
  const unpriced: UnpricedItem[] = [
    { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
  ];
  const classifications = [
    classification({ costCode: "1a", element: "Demolition", isElementDriver: true, buyoutPackage: "Demolition", division: "02" }),
    classification({ costCode: "1", element: "Demolition", buyoutPackage: "Demolition", division: "02" }),
    classification({ costCode: "28a", element: "Demolition", buyoutPackage: "Plumbing", division: "22" }),
    classification({ costCode: "28b", element: "Demolition", buyoutPackage: "Plumbing", division: "22" }),
    classification({ costCode: "31f", element: "Demolition", buyoutPackage: "Electrical", division: "26" }),
    classification({ costCode: "36a", element: "Demolition", buyoutPackage: "Site Work", division: "33" }),
    // A benchmark code with no stated division: its cost code names it.
    classification({ costCode: "09-900", buyoutPackage: "Drywall and Finishes" }),
  ];
  return { r: rom(lines, unpriced), classifications };
}

function labels(entries: FieldEntry[]): string[] {
  return entries.map((entry) => entry.label);
}

describe("divisions", () => {
  it("takes a stated division ahead of the cost code's own digits", () => {
    const stated = statedDivisions([classification({ costCode: "28a", division: "22" })]);
    // Read off the cost code, "28a" would wrongly be division 28.
    expect(divisionFor("28a", stated)).toBe("22");
  });

  it("falls back to the cost code's first two digits when nothing is stated", () => {
    const stated = statedDivisions([classification({ costCode: "09-900" })]);
    expect(divisionFor("09-900", stated)).toBe("09");
    expect(divisionFor("26-100", new Map())).toBe("26");
  });

  it("names no division for a code that does not open with two digits and has none stated", () => {
    expect(divisionFor("1a", new Map())).toBeNull();
  });

  it("sorts the Kulka 90 series after the standard divisions and none last", () => {
    const sorted = ["98", null, "33", "02", "90", "48"].sort((a, b) => divisionRank(a) - divisionRank(b));
    expect(sorted).toEqual(["02", "33", "48", "90", "98", null]);
  });

  it("finds the lowest division among a package's items", () => {
    expect(lowestDivision(["26", null, "22", "31"])).toBe("22");
    expect(lowestDivision([null, null])).toBeNull();
  });
});

describe("ordering packages", () => {
  it("sorts By Package in MasterFormat order, each package by its lowest division", () => {
    const { r, classifications } = pilot();
    const ordered = orderField(buildField("package", r, classifications), "masterformat");
    expect(labels(ordered)).toEqual(["Demolition", "Drywall and Finishes", "Plumbing", "Electrical", "Site Work"]);
    expect(ordered.map((entry) => entry.division)).toEqual(["02", "09", "22", "26", "33"]);
  });

  it("sorts By Package Largest First, the all-unpriced package last", () => {
    const { r, classifications } = pilot();
    const ordered = orderField(buildField("package", r, classifications), "largest");
    expect(labels(ordered)).toEqual(["Electrical", "Drywall and Finishes", "Plumbing", "Demolition", "Site Work"]);
    expect(ordered.at(-1)!.priced).toBe(false);
  });

  it("sorts a package with no division at all after every package that has one", () => {
    const lines = [
      line({ costCode: "zz", label: "Mystery Line", low: 5, high: 5 }),
      line({ costCode: "95-100", label: "Kulka Fee Item", low: 1, high: 1, buyoutPackage: "Kulka Items" }),
      line({ costCode: "03-300", label: "Concrete", low: 1, high: 1, buyoutPackage: "Concrete" }),
    ];
    const ordered = orderField(buildField("package", rom(lines), []), "masterformat");
    expect(labels(ordered)).toEqual(["Concrete", "Kulka Items", "Not Yet Packaged"]);
  });
});

describe("ordering blocks and elements", () => {
  it("sorts an element by its driver's division, not its members'", () => {
    const { r, classifications } = pilot();
    const ordered = orderField(buildField("scope", r, classifications), "masterformat");
    // Demolition's driver is 02, though its members reach 22, 26 and 33.
    expect(labels(ordered)).toEqual(["Demolition", "Finishes", "Plumbing Rough-In", "Electrical"]);
    expect(ordered[0].kind).toBe("element");
  });

  it("sorts blocks and elements Largest First by priced total", () => {
    const { r, classifications } = pilot();
    const ordered = orderField(buildField("scope", r, classifications), "largest");
    expect(labels(ordered)).toEqual(["Electrical", "Finishes", "Plumbing Rough-In", "Demolition"]);
  });

  it("puts an all-unpriced element and a loose unpriced item last in Largest First", () => {
    const lines = [line({ costCode: "26-100", label: "Electrical", low: 10, high: 10 })];
    const unpriced: UnpricedItem[] = [
      { costCode: "1a", label: "Structure Demolition" },
      { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
      { costCode: "05-100", label: "Loose Steel" },
    ];
    const classifications = [
      classification({ costCode: "1a", element: "Demolition", isElementDriver: true, division: "02" }),
      classification({ costCode: "36a", element: "Demolition", division: "33" }),
    ];
    const field = buildField("scope", rom(lines, unpriced), classifications);
    expect(labels(orderField(field, "largest"))).toEqual(["Electrical", "Demolition", "Loose Steel"]);
    expect(labels(orderField(field, "masterformat"))).toEqual(["Demolition", "Loose Steel", "Electrical"]);
    const demolition = field.find((entry) => entry.kind === "element")!;
    if (demolition.kind !== "element") throw new Error("unreachable");
    expect(elementHasNoRate(demolition.group)).toBe(true);
  });
});

describe("every line appears exactly once", () => {
  const views: RomView[] = ["scope", "package"];
  const orders: RomOrder[] = ["masterformat", "largest"];
  for (const view of views) {
    for (const order of orders) {
      it(`in ${view} view, ${order} order`, () => {
        const { r, classifications } = pilot();
        const codes = orderField(buildField(view, r, classifications), order).flatMap((entry) => entry.costCodes);
        const expected = [
          ...r.lines.filter(addsToTotal).map((l) => l.costCode),
          ...r.unpricedItems.map((item) => item.costCode),
        ].sort();
        expect([...codes].sort()).toEqual(expected);
        expect(new Set(codes).size).toBe(codes.length);
      });
    }
  }

  it("finds the entry a selected cost code sits in", () => {
    const { r, classifications } = pilot();
    const field = buildField("package", r, classifications);
    expect(entryForCostCode(field, "28a")?.label).toBe("Plumbing");
    expect(entryForCostCode(field, null)).toBeUndefined();
  });
});

describe("the markup bar", () => {
  it("lays out each entry's share inside Trades, with dividers in the field's order", () => {
    const { r, classifications } = pilot();
    const ordered = orderField(buildField("package", r, classifications), "masterformat");
    const bar = barModel(r, ordered);
    expect(bar.parts.map((part) => part.key)).toEqual(["trade", "gc", "fee", "ins", "owner"]);
    // No markups and no owner-direct scope: Trades is the whole bar.
    expect(bar.parts[0].width).toBeCloseTo(100);

    const electrical = bar.spans.get("package:Electrical")!;
    const total = ordered.reduce((s, e) => s + e.midpoint, 0);
    expect(electrical.share).toBeCloseTo(ordered[3].midpoint / total);
    expect(electrical.of).toBe("Trades");

    // One divider after each priced entry but the last priced one, left to
    // right, and none for the unpriced Site Work.
    expect(bar.hairlines.map((h) => h.key)).toEqual(["package:Demolition", "package:Drywall and Finishes", "package:Plumbing"]);
    const lefts = bar.hairlines.map((h) => h.left);
    expect([...lefts].sort((a, b) => a - b)).toEqual(lefts);
  });

  it("moves the dividers when the order changes, keeping the same spans", () => {
    const { r, classifications } = pilot();
    const field = buildField("package", r, classifications);
    const mf = barModel(r, orderField(field, "masterformat"));
    const lf = barModel(r, orderField(field, "largest"));
    expect(lf.hairlines[0].key).toBe("package:Electrical");
    expect(lf.spans.get("package:Electrical")!.left).toBe(0);
    expect(mf.spans.get("package:Electrical")!.share).toBeCloseTo(lf.spans.get("package:Electrical")!.share);
  });

  it("puts an owner-direct entry inside the Owner Direct segment, last in the bar", () => {
    const lines = [
      line({ costCode: "26-100", label: "Electrical", low: 300, high: 300 }),
      line({ costCode: "11-100", label: "Appliances", low: 100, high: 100, contractSide: "owner" }),
    ];
    const r = rom(lines);
    const bar = barModel(r, orderField(buildField("scope", r, []), "masterformat"));
    expect(bar.parts[0].width).toBeCloseTo(75);
    expect(bar.parts[4].left).toBeCloseTo(75);
    const owner = bar.spans.get("11-100")!;
    expect(owner.of).toBe("Owner Direct");
    expect(owner.left).toBeCloseTo(75);
    expect(owner.share).toBe(1);
  });

  it("writes the chip as name, figure and share, or No Rate Yet", () => {
    const { r, classifications } = pilot();
    const ordered = orderField(buildField("package", r, classifications), "masterformat");
    const bar = barModel(r, ordered);
    const plumbing = ordered.find((e) => e.label === "Plumbing")!;
    const siteWork = ordered.find((e) => e.label === "Site Work")!;
    const share = sharePercent(bar.spans.get(plumbing.key)!.share);
    expect(chipText(chipFor(plumbing, bar.spans.get(plumbing.key)))).toBe(`Plumbing $802k, ${share} of Trades`);
    expect(chipText(chipFor(siteWork, bar.spans.get(siteWork.key)))).toBe("Site Work No Rate Yet");
  });

  it("never rounds a sliver of a share down to zero", () => {
    expect(sharePercent(0.001)).toBe("<1%");
    expect(sharePercent(0.3216)).toBe("32%");
    expect(sharePercent(0)).toBe("0%");
  });
});

describe("the package card", () => {
  it("draws one segment per priced item, biggest first, and a dot per unpriced item", () => {
    const { r, classifications } = pilot();
    const plumbing = buildField("package", r, classifications).find((e) => e.label === "Plumbing")!;
    if (plumbing.kind !== "package") throw new Error("unreachable");
    const card = packageCard(plumbing.group);
    expect(card.segments.map((s) => s.costCode)).toEqual(["22-100", "28a", "28b"]);
    expect(card.segments[1].driverLabel).toBe("Structure Demolition");
    expect(card.dots).toEqual([]);
    expect(card.itemCount).toBe(3);
    expect(card.noRate).toBe(false);
    expect(itemsLabel(card.itemCount)).toBe("3 Items");
  });

  it("reads No Rate Yet when nothing inside is priced", () => {
    const { r, classifications } = pilot();
    const siteWork = buildField("package", r, classifications).find((e) => e.label === "Site Work")!;
    if (siteWork.kind !== "package") throw new Error("unreachable");
    const card = packageCard(siteWork.group);
    expect(card.noRate).toBe(true);
    expect(card.dots.map((d) => d.costCode)).toEqual(["36a"]);
    expect(card.unpricedCount).toBe(1);
    expect(itemsLabel(1)).toBe("1 Item");
  });
});

describe("LA-1210: a canonical item number is not a division", () => {
  it("does not read a bare item number's own digits as a division", () => {
    // Before the fix, "10" (Millwork, Division 06) read as division "10"
    // (Specialties) and "31f" (Electrical Service Disconnect, Division 26)
    // read as division "31" -- exactly the bug docs/precon/masterformat-divisions.md
    // exists to fix with real data.
    expect(divisionFor("10", new Map())).toBeNull();
    expect(divisionFor("31f", new Map())).toBeNull();
    expect(divisionFor("28a", new Map())).toBeNull();
  });

  it("still reads a benchmark cost code's own digits, dash and all", () => {
    expect(divisionFor("09-900", new Map())).toBe("09");
    expect(divisionFor("26-100", new Map())).toBe("26");
  });

  it("a stated division still wins over everything", () => {
    expect(divisionFor("31f", new Map([["31f", "26"]]))).toBe("26");
  });

  it("sorts items with no division in canonical item order, not cost-code text", () => {
    const lines = [
      line({ costCode: "10", label: "Millwork", low: 5, high: 5 }),
      line({ costCode: "2", label: "Foundations", low: 5, high: 5 }),
      line({ costCode: "31f", label: "Electrical Service Disconnect", low: 5, high: 5 }),
    ];
    // Cost-code text would read "10" ahead of "2"; canonical item order does not.
    const ordered = orderField(buildField("scope", rom(lines), []), "masterformat");
    expect(labels(ordered)).toEqual(["Foundations", "Millwork", "Electrical Service Disconnect"]);
    expect(ordered.every((entry) => entry.division === null)).toBe(true);
  });
});

describe("LA-1214: a bare item number falls back to canonical_work_items", () => {
  it("reads the item's own division once nothing is stated", () => {
    const canonicalDivisions = new Map([["10", "06"]]);
    expect(divisionFor("10", new Map(), canonicalDivisions)).toBe("06");
  });

  it("still names no division for an item with no row anywhere", () => {
    // 31f is not a canonical_work_items row (LA-1214); it only carries a
    // division through a stated classification.
    expect(divisionFor("31f", new Map(), new Map([["10", "06"]]))).toBeNull();
  });

  it("a stated classification still wins over the canonical item's own division", () => {
    const stated = statedDivisions([classification({ costCode: "22", division: "10" })]);
    // canonical_work_items says 11 (Matt's LA-1214 correction); a stated
    // classification of 10 still wins, the same way it wins over a benchmark
    // code's own digits.
    expect(divisionFor("22", stated, new Map([["22", "11"]]))).toBe("10");
  });

  it("sorts a ROM's item-number cost codes in MasterFormat order, 11, 27 and 33 included", () => {
    // 22 (Residential Appliances, Division 11), 31a (Low Voltage, Division
    // 27) and 35 (Site Drainage and Stormwater, Division 33) are the three
    // divisions LA-1214 added to the check constraint. Real canonical
    // divisions, from docs/precon/masterformat-divisions.md as Matt confirmed
    // it on 2026-09-27.
    const canonicalDivisions = new Map([
      ["2", "03"], // Foundations
      ["22", "11"], // Residential appliances
      ["31a", "27"], // Low voltage
      ["35", "33"], // Site drainage and stormwater
    ]);
    const lines = [
      line({ costCode: "35", label: "Site Drainage", low: 5, high: 5 }),
      line({ costCode: "22", label: "Residential Appliances", low: 5, high: 5 }),
      line({ costCode: "2", label: "Foundations", low: 5, high: 5 }),
      line({ costCode: "31a", label: "Low Voltage", low: 5, high: 5 }),
    ];
    const ordered = orderField(buildField("scope", rom(lines), [], canonicalDivisions), "masterformat");
    expect(labels(ordered)).toEqual(["Foundations", "Residential Appliances", "Low Voltage", "Site Drainage"]);
    expect(ordered.map((entry) => entry.division)).toEqual(["03", "11", "27", "33"]);
  });

  it("still lets block_classification.division win over the canonical item's own division", () => {
    // Item 22's real division is 11, but a stated classification of 26 (say,
    // bought under Electrical instead) sorts it there, not at 11.
    const canonicalDivisions = new Map([
      ["2", "03"],
      ["22", "11"],
    ]);
    const lines = [
      line({ costCode: "2", label: "Foundations", low: 5, high: 5 }),
      line({ costCode: "22", label: "Residential Appliances", low: 5, high: 5 }),
    ];
    const classifications = [classification({ costCode: "22", buyoutPackage: "Electrical", division: "26" })];
    const ordered = orderField(buildField("scope", rom(lines), classifications, canonicalDivisions), "masterformat");
    expect(labels(ordered)).toEqual(["Foundations", "Residential Appliances"]);
    expect(ordered.map((entry) => entry.division)).toEqual(["03", "26"]);
  });
});

describe("LA-1210: the Unassigned Package card", () => {
  it("shows no division, even when its only item would otherwise resolve one", () => {
    const lines = [
      line({ costCode: "09-900", label: "Finishes", low: 10, high: 10 }), // no buyoutPackage: Unassigned
      line({ costCode: "03-300", label: "Concrete", low: 1, high: 1, buyoutPackage: "Concrete" }),
    ];
    const field = buildField("package", rom(lines), []);
    const unassigned = field.find((entry) => entry.label === "Not Yet Packaged")!;
    expect(unassigned.division).toBeNull();
  });

  it("always sorts last, in every order, even when it is by far the largest", () => {
    const lines = [
      line({ costCode: "31f", label: "Electrical Service Disconnect", low: 100, high: 100 }), // Unassigned
      line({ costCode: "03-300", label: "Concrete", low: 1, high: 1, buyoutPackage: "Concrete" }),
    ];
    const masterformat = orderField(buildField("package", rom(lines), []), "masterformat");
    expect(labels(masterformat)).toEqual(["Concrete", "Not Yet Packaged"]);

    const largest = orderField(buildField("package", rom(lines), []), "largest");
    expect(labels(largest)).toEqual(["Concrete", "Not Yet Packaged"]);
  });
});
