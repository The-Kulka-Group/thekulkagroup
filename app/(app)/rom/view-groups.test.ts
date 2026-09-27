import { describe, expect, it } from "vitest";
import type { BlockClassification, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { groupByPackage, groupByView, UNASSIGNED_PACKAGE, type PackageItem } from "./view-groups";
import { type ElementGroup, groupElements } from "./element-groups";

// LA-1159, ADR 0006. The pilot's own cost codes (CONTEXT.md, the LA-1159
// ticket): 1 and 1a are the Demolition package, 28a and 28b are Plumbing, 31f
// is Electrical, 36a is Site Work. None of the other codes here is a real
// Kulka cost; they only stand in for "some unrelated line".

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

/** The demolition pilot: a driver with disconnects spread across three
 * packages, plus one unrelated line with no package of its own. */
function demolitionScenario() {
  const driver = line({
    costCode: "1a",
    label: "Structure Demolition",
    low: 60_000,
    high: 80_000,
    element: "Demolition",
    buyoutPackage: "Demolition",
  });
  const siteDemo = line({
    costCode: "1",
    label: "Site Demolition",
    low: 4_000,
    high: 5_000,
    element: "Demolition",
    buyoutPackage: "Demolition",
  });
  const plumbingDisconnect = line({
    costCode: "28a",
    label: "Plumbing Disconnect and Cap",
    low: 1_200,
    high: 1_500,
    element: "Demolition",
    driverCostCode: "1a",
    buyoutPackage: "Plumbing",
  });
  const gasDisconnect = line({
    costCode: "28b",
    label: "Gas Meter and Service Disconnect",
    low: 800,
    high: 1_000,
    element: "Demolition",
    driverCostCode: "1a",
    buyoutPackage: "Plumbing",
  });
  const electricalDisconnect = line({
    costCode: "31f",
    label: "Electrical Service Disconnect",
    low: 600,
    high: 800,
    element: "Demolition",
    driverCostCode: "1a",
    buyoutPackage: "Electrical",
  });
  const siteUtilityDisconnect = line({
    costCode: "36a",
    label: "Site Utility Cut and Cap at the Main",
    low: 500,
    high: 700,
    element: "Demolition",
    driverCostCode: "1a",
    buyoutPackage: "Site Work",
  });
  const unrelated = line({ costCode: "09 2000", label: "Unrelated Finish Item", low: 900, high: 1_100 });

  const classifications = [
    classification({ costCode: "1a", element: "Demolition", isElementDriver: true, buyoutPackage: "Demolition" }),
    classification({ costCode: "1", element: "Demolition", buyoutPackage: "Demolition" }),
    classification({ costCode: "28a", element: "Demolition", buyoutPackage: "Plumbing" }),
    classification({ costCode: "28b", element: "Demolition", buyoutPackage: "Plumbing" }),
    classification({ costCode: "31f", element: "Demolition", buyoutPackage: "Electrical" }),
    classification({ costCode: "36a", element: "Demolition", buyoutPackage: "Site Work" }),
  ];

  const lines = [driver, siteDemo, plumbingDisconnect, gasDisconnect, electricalDisconnect, siteUtilityDisconnect, unrelated];
  return { lines, classifications, r: rom(lines) };
}

function scopeCostCodes(groups: ElementGroup[], singles: RomLine[]): string[] {
  return [...groups.flatMap((g) => [g.driver, ...g.members].map((i) => i.costCode)), ...singles.map((l) => l.costCode)];
}

function packageCostCodes(items: PackageItem[][]): string[] {
  return items.flatMap((group) => group.map((item) => item.costCode));
}

describe("groupByPackage", () => {
  it("moves the four disconnects into Plumbing, Electrical and Site Work, each counted once", () => {
    const { r, classifications } = demolitionScenario();
    const { groups } = groupByPackage(r, classifications);

    const byName = new Map(groups.map((g) => [g.package, g]));
    expect(byName.get("Plumbing")!.items.map((i) => i.costCode)).toEqual(["28a", "28b"]);
    expect(byName.get("Electrical")!.items.map((i) => i.costCode)).toEqual(["31f"]);
    expect(byName.get("Site Work")!.items.map((i) => i.costCode)).toEqual(["36a"]);
    expect(byName.get("Demolition")!.items.map((i) => i.costCode)).toEqual(["1", "1a"]);
  });

  it("names a supporting item's driver by reading the ROM's own lines, never a hardcoded label", () => {
    const { r, classifications } = demolitionScenario();
    const { groups } = groupByPackage(r, classifications);
    const plumbing = groups.find((g) => g.package === "Plumbing")!;
    for (const item of plumbing.items) {
      expect(item.driverLabel).toBe("Structure Demolition");
    }
    const demolition = groups.find((g) => g.package === "Demolition")!;
    const driverTile = demolition.items.find((i) => i.costCode === "1a")!;
    expect(driverTile.driverLabel).toBeNull();
  });

  it("puts a line with no stated package in Unassigned Package rather than dropping it", () => {
    const { r, classifications } = demolitionScenario();
    const { groups } = groupByPackage(r, classifications);
    const unassigned = groups.find((g) => g.package === UNASSIGNED_PACKAGE)!;
    expect(unassigned.unassigned).toBe(true);
    expect(unassigned.items.map((i) => i.costCode)).toEqual(["09 2000"]);
  });

  it("reads an unpriced item's package off the stated classification, since it carries none itself", () => {
    const driver = line({ costCode: "1a", label: "Structure Demolition", low: 60_000, high: 80_000, element: "Demolition" });
    const disconnect = unpriced({ costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" });
    const classifications = [
      classification({ costCode: "1a", element: "Demolition", isElementDriver: true }),
      classification({ costCode: "31f", element: "Demolition", buyoutPackage: "Electrical" }),
    ];
    const { groups } = groupByPackage(rom([driver], [disconnect]), classifications);
    const electrical = groups.find((g) => g.package === "Electrical")!;
    expect(electrical.items).toHaveLength(1);
    expect(electrical.items[0].kind).toBe("unpriced");
    expect(electrical.unpricedCount).toBe(1);
    expect(electrical.total).toEqual({ low: 0, high: 0 });
  });

  it("leaves an unpriced item with no stated classification in Unassigned Package", () => {
    const item = unpriced({ costCode: "99z", label: "Something Not Yet Classified" });
    const { groups } = groupByPackage(rom([], [item]), []);
    const unassigned = groups.find((g) => g.package === UNASSIGNED_PACKAGE)!;
    expect(unassigned.items.map((i) => i.costCode)).toEqual(["99z"]);
  });
});

describe("groupByView", () => {
  it("shows every line exactly once and the same total in each view", () => {
    const { r, classifications } = demolitionScenario();

    const scope = groupByView("scope", r, classifications);
    const pkg = groupByView("package", r, classifications);
    if (scope.view !== "scope" || pkg.view !== "package") throw new Error("unreachable");

    const scopeCodes = scopeCostCodes(scope.groups, scope.singles).sort();
    const pkgCodes = packageCostCodes(pkg.groups.map((g) => g.items)).sort();
    const allCodes = r.lines.map((l) => l.costCode).sort();

    expect(scopeCodes).toEqual(allCodes);
    expect(pkgCodes).toEqual(allCodes);
    // Every code appears exactly once in each view: no duplicates once sorted.
    expect(new Set(scopeCodes).size).toBe(scopeCodes.length);
    expect(new Set(pkgCodes).size).toBe(pkgCodes.length);

    const scopeTotal = scope.groups.reduce(
      (sum, g) => ({ low: sum.low + g.total.low, high: sum.high + g.total.high }),
      { low: 0, high: 0 },
    );
    const scopeSinglesTotal = scope.singles.reduce(
      (sum, l) => ({ low: sum.low + l.low, high: sum.high + l.high }),
      { low: 0, high: 0 },
    );
    const pkgTotal = pkg.groups.reduce(
      (sum, g) => ({ low: sum.low + g.total.low, high: sum.high + g.total.high }),
      { low: 0, high: 0 },
    );

    expect({ low: scopeTotal.low + scopeSinglesTotal.low, high: scopeTotal.high + scopeSinglesTotal.high }).toEqual(
      r.total,
    );
    expect(pkgTotal).toEqual(r.total);
  });

  it("shows every unpriced item exactly once in each view", () => {
    const driver = line({ costCode: "1a", label: "Structure Demolition", low: 60_000, high: 80_000, element: "Demolition" });
    const disconnects: UnpricedItem[] = [
      { costCode: "28a", label: "Plumbing Disconnect and Cap", driverCostCode: "1a" },
      { costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" },
    ];
    const classifications = [
      classification({ costCode: "1a", element: "Demolition", isElementDriver: true }),
      classification({ costCode: "28a", element: "Demolition", buyoutPackage: "Plumbing" }),
      classification({ costCode: "31f", element: "Demolition", buyoutPackage: "Electrical" }),
    ];
    const r = rom([driver], disconnects);

    const scope = groupByView("scope", r, classifications);
    const pkg = groupByView("package", r, classifications);
    if (scope.view !== "scope" || pkg.view !== "package") throw new Error("unreachable");

    const scopeUnpricedCodes = scope.groups
      .flatMap((g) => [g.driver, ...g.members])
      .filter((i) => i.kind === "unpriced")
      .map((i) => i.costCode)
      .sort();
    const pkgUnpricedCodes = pkg.groups
      .flatMap((g) => g.items)
      .filter((i) => i.kind === "unpriced")
      .map((i) => i.costCode)
      .sort();

    expect(scopeUnpricedCodes).toEqual(["28a", "31f"]);
    expect(pkgUnpricedCodes).toEqual(["28a", "31f"]);
  });

  it("matches groupElements exactly for the scope view (no double bookkeeping)", () => {
    const { r, classifications } = demolitionScenario();
    const direct = groupElements(r, classifications);
    const viaView = groupByView("scope", r, classifications);
    if (viaView.view !== "scope") throw new Error("unreachable");
    expect(viaView.groups).toEqual(direct.groups);
    expect(viaView.singles).toEqual(direct.singles);
  });
});
