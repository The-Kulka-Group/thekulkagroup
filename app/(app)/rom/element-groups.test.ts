import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BlockClassification, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { ElementBoxBlock } from "./ElementBox";
import { groupElements, groupMidpoint, itemRange } from "./element-groups";

// LA-1158, ADR 0006. Synthetic lines, labelled as such. None of these is a
// Kulka cost. Every case reads groupElements the way the /rom screen would:
// a Rom the engine already priced and gated, plus the stated classifications
// naming which cost code drives which element.

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

function unpriced(over: Partial<UnpricedItem> & Pick<UnpricedItem, "costCode" | "label">): UnpricedItem {
  return { ...over };
}

function classification(over: Partial<BlockClassification> & Pick<BlockClassification, "costCode">): BlockClassification {
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
  const adds = lines.filter((l) => l.breakoutOf === null && l.gateStatus !== "not_in_job" && l.gateStatus !== "tbd");
  const total = {
    low: adds.reduce((s, l) => s + l.low, 0),
    high: adds.reduce((s, l) => s + l.high, 0),
  };
  return {
    lines,
    total,
    kulkaContractTotal: total,
    carvedOut: { low: 0, high: 0 },
    notInThisJob: [],
    tbdGateItems: [],
    assumedPresentItems: [],
    unpricedItems,
    assumptions: [],
    parameters: {} as Rom["parameters"],
  };
}

describe("groupElements", () => {
  it("makes a driver with supporting items into one box, totalled once", () => {
    const driver = line({ costCode: "1a", label: "Structure Demolition", low: 6000, high: 8000, element: "Demolition" });
    const siteDemo = line({ costCode: "1", label: "Site Demolition", low: 1000, high: 1200, element: "Demolition" });
    const plumbing = line({
      costCode: "28a",
      label: "Plumbing Disconnect and Cap",
      low: 300,
      high: 400,
      element: "Demolition",
      driverCostCode: "1a",
    });
    const electrical = line({
      costCode: "31f",
      label: "Electrical Service Disconnect",
      low: 200,
      high: 300,
      element: "Demolition",
      driverCostCode: "1a",
    });
    const unrelated = line({ costCode: "09 2000", low: 900, high: 1100 });

    const classifications = [
      classification({ costCode: "1a", element: "Demolition", isElementDriver: true }),
      classification({ costCode: "1", element: "Demolition" }),
      classification({ costCode: "28a", element: "Demolition" }),
      classification({ costCode: "31f", element: "Demolition" }),
    ];

    const grouped = groupElements(rom([driver, siteDemo, plumbing, electrical, unrelated]), classifications);

    expect(grouped.groups).toHaveLength(1);
    const box = grouped.groups[0];
    expect(box.element).toBe("Demolition");
    expect(box.driver.costCode).toBe("1a");
    expect(box.members.map((m) => m.costCode)).toEqual(["1", "28a", "31f"]);
    // Each priced line counted exactly once: 6000+1000+300+200 to 8000+1200+400+300.
    expect(box.total).toEqual({ low: 7500, high: 9900 });
    expect(box.unpricedCount).toBe(0);

    // The unrelated line is untouched and stays a single block.
    expect(grouped.singles.map((l) => l.costCode)).toEqual(["09 2000"]);
  });

  it("counts an unpriced supporting item toward unpricedCount but not toward the total", () => {
    const driver = line({ costCode: "1a", label: "Structure Demolition", low: 6000, high: 8000, element: "Demolition" });
    const disconnect = unpriced({ costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" });

    const classifications = [classification({ costCode: "1a", element: "Demolition", isElementDriver: true })];

    const grouped = groupElements(rom([driver], [disconnect]), classifications);

    expect(grouped.groups).toHaveLength(1);
    const box = grouped.groups[0];
    expect(box.members).toHaveLength(1);
    expect(box.members[0].kind).toBe("unpriced");
    expect(itemRange(box.members[0])).toEqual({ low: 0, high: 0 });
    expect(box.total).toEqual({ low: 6000, high: 8000 });
    expect(box.unpricedCount).toBe(1);
    expect(groupMidpoint(box)).toBe(7000);
  });

  it("counts the driver itself as unpriced when it is in scope with no rate", () => {
    const driverUnpriced = unpriced({ costCode: "1a", label: "Structure Demolition" });
    const disconnect = unpriced({ costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" });
    const classifications = [classification({ costCode: "1a", element: "Demolition", isElementDriver: true })];

    const grouped = groupElements(rom([], [driverUnpriced, disconnect]), classifications);

    expect(grouped.groups).toHaveLength(1);
    const box = grouped.groups[0];
    expect(box.driver.kind).toBe("unpriced");
    expect(box.total).toEqual({ low: 0, high: 0 });
    expect(box.unpricedCount).toBe(2);
  });

  it("leaves a driver with nothing else in its element as a single block", () => {
    const driver = line({ costCode: "1a", label: "Structure Demolition", low: 6000, high: 8000, element: "Demolition" });
    const classifications = [classification({ costCode: "1a", element: "Demolition", isElementDriver: true })];

    const grouped = groupElements(rom([driver]), classifications);

    expect(grouped.groups).toHaveLength(0);
    expect(grouped.singles.map((l) => l.costCode)).toEqual(["1a"]);
  });

  it("forms no box when the driver is not in scope, even with a stated relationship", () => {
    const classifications = [classification({ costCode: "1a", element: "Demolition", isElementDriver: true })];
    // No driver line, no unpriced driver: demolition was never answered.
    const grouped = groupElements(rom([]), classifications);

    expect(grouped.groups).toHaveLength(0);
    expect(grouped.singles).toHaveLength(0);
  });

  it("drops a gated-off driver's box, even though the driver has a benchmark line", () => {
    const driver = line({
      costCode: "1a",
      label: "Structure Demolition",
      low: 0,
      high: 0,
      element: "Demolition",
      gateStatus: "not_in_job",
    });
    const classifications = [classification({ costCode: "1a", element: "Demolition", isElementDriver: true })];

    const grouped = groupElements(rom([driver]), classifications);

    expect(grouped.groups).toHaveLength(0);
    expect(grouped.singles).toHaveLength(0);
  });

  it("leaves a line with no element, or an element with no driver, ungrouped", () => {
    const noElement = line({ costCode: "09 2000", low: 900, high: 1100 });
    const orphanElement = line({ costCode: "26 0000", low: 500, high: 600, element: "Elevator" });

    const grouped = groupElements(rom([noElement, orphanElement]), []);

    expect(grouped.groups).toHaveLength(0);
    expect(grouped.singles.map((l) => l.costCode).sort()).toEqual(["09 2000", "26 0000"]);
  });
});

describe("ElementBoxBlock", () => {
  // The ticket's own "done when": New budget, demolition Yes with one
  // structure, brings in the Demolition box showing Structure Demolition as
  // the full-width tile and four disconnect tiles reading "No Rate Yet".
  it("renders the driver full width and every disconnect as No Rate Yet", () => {
    const driver = line({
      costCode: "1a",
      label: "Structure Demolition",
      low: 60_000,
      high: 80_000,
      element: "Demolition",
    });
    const disconnects: UnpricedItem[] = [
      { costCode: "28a", label: "Plumbing Disconnect and Cap", driverCostCode: "1a" },
      { costCode: "28b", label: "Gas Meter and Service Disconnect", driverCostCode: "1a" },
      { costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" },
      { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
    ];
    const classifications = [classification({ costCode: "1a", element: "Demolition", isElementDriver: true })];

    const grouped = groupElements(rom([driver], disconnects), classifications);
    expect(grouped.groups).toHaveLength(1);
    const box = grouped.groups[0];
    expect(box.driver.costCode).toBe("1a");
    expect(box.members.map((m) => m.costCode)).toEqual(["28a", "28b", "31f", "36a"]);
    expect(box.unpricedCount).toBe(4);

    const html = renderToStaticMarkup(
      createElement(ElementBoxBlock, { group: box, selected: null, onOpen: vi.fn() }),
    );

    expect(html).toContain("Demolition");
    expect(html).toContain("Structure Demolition");
    expect(html).toContain("eb-tile--full");
    // Each of the four disconnects names "No Rate Yet" twice: once in the
    // aria-label, once in the visible tile text.
    expect((html.match(/No Rate Yet/g) ?? []).length).toBe(8);
    expect(html).toContain("Plumbing Disconnect and Cap");
    expect(html).toContain("Gas Meter and Service Disconnect");
    expect(html).toContain("Electrical Service Disconnect");
    expect(html).toContain("Site Utility Cut and Cap at the Main");
    // The header total is the driver's own range: the disconnects carry none yet.
    expect(html).toContain("$70k");
  });
});
