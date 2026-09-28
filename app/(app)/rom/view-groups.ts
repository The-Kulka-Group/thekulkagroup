import type { BlockClassification, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { addsToTotal, midpoint, type Range } from "./block-layout";
import { groupElements, type GroupedField } from "./element-groups";

// LA-1159, ADR 0006 ("Three views of the same lines"), CONTEXT.md: View. The
// ROM screen shows the same priced and unpriced lines two ways right now (By
// Division is LA-1152 work still to come, and this ticket does not build it):
//
//   - By Scope groups by element (LA-1158's groupElements, reused untouched).
//   - By Package groups by buyout package, a flat block per package rather
//     than a driver-plus-members box. A supporting item still names its
//     driver, read off the ROM's own lines so nothing is hardcoded.
//
// Every view shows every line exactly once and the same total; that is the
// only thing this module has to get right, and it is what view-groups.test.ts
// checks. Pure: reads only the Rom and the classifications it is given.

export type RomView = "scope" | "package";

/** The synthetic block an item with no stated package lands in, never hidden. */
export const UNASSIGNED_PACKAGE = "Unassigned Package";

/** One tile inside a package block: a priced line, or an item with no rate yet. */
export type PackageItem =
  | { kind: "priced"; costCode: string; label: string; line: RomLine; driverLabel: string | null }
  | { kind: "unpriced"; costCode: string; label: string; item: UnpricedItem; driverLabel: string | null };

/** LA-1159: one buyout package with a stated total, shown as a flat box. */
export type PackageGroup = {
  package: string;
  /** True only for `UNASSIGNED_PACKAGE`, so the screen can mark it with an orange dot. */
  unassigned: boolean;
  /** Every tile in the block, a supporting item and a package-native item alike. */
  items: PackageItem[];
  /** The sum of every priced tile's range in the block, each counted once. */
  total: Range;
  /** How many tiles in the block carry no rate yet. */
  unpricedCount: number;
  /** True when every priced tile is owner-direct scope. */
  ownerDirect: boolean;
};

export type PackageField = { groups: PackageGroup[] };

export type ViewResult = ({ view: "scope" } & GroupedField) | ({ view: "package" } & PackageField);

function isPricedPackageItem(item: PackageItem): item is Extract<PackageItem, { kind: "priced" }> {
  return item.kind === "priced";
}

/**
 * The label of the item that brought a supporting item in, read off the
 * ROM's own priced and unpriced lines rather than a cost code named in the
 * client (ADR 0006: "Hovering it shows 'From Structure Demolition' ... never
 * hardcoded"). Absent when the item carries no driver of its own.
 */
function driverLabelFor(driverCostCode: string | undefined, rom: Rom): string | null {
  if (!driverCostCode) return null;
  const line = rom.lines.find((candidate) => candidate.costCode === driverCostCode);
  if (line) return line.label;
  return rom.unpricedItems.find((candidate) => candidate.costCode === driverCostCode)?.label ?? null;
}

/**
 * Groups a computed ROM's lines by buyout package. A priced line already
 * carries its own package (the engine resolves it from the classification
 * onto `RomLine.buyoutPackage`); an unpriced item has no such field, since it
 * has no benchmark row to carry it, so its package is read off the stated
 * classification for its cost code instead. Either way, a line with no
 * stated package lands in `UNASSIGNED_PACKAGE` rather than being dropped.
 *
 * Pure: reads only the Rom and the classifications it is given.
 */
export function groupByPackage(rom: Rom, classifications: readonly BlockClassification[]): PackageField {
  const packageByCostCode = new Map<string, string | null>();
  for (const classification of classifications) {
    packageByCostCode.set(classification.costCode, classification.buyoutPackage);
  }

  const byPackage = new Map<string, PackageItem[]>();
  const push = (pkg: string, item: PackageItem) => {
    const list = byPackage.get(pkg);
    if (list) list.push(item);
    else byPackage.set(pkg, [item]);
  };

  for (const line of rom.lines.filter(addsToTotal)) {
    push(line.buyoutPackage ?? UNASSIGNED_PACKAGE, {
      kind: "priced",
      costCode: line.costCode,
      label: line.label,
      line,
      driverLabel: driverLabelFor(line.driverCostCode, rom),
    });
  }
  for (const item of rom.unpricedItems) {
    push(packageByCostCode.get(item.costCode) ?? UNASSIGNED_PACKAGE, {
      kind: "unpriced",
      costCode: item.costCode,
      label: item.label,
      item,
      driverLabel: driverLabelFor(item.driverCostCode, rom),
    });
  }

  const groups: PackageGroup[] = [...byPackage.entries()]
    .map(([pkg, items]) => {
      const sorted = [...items].sort((a, b) => a.costCode.localeCompare(b.costCode));
      const priced = sorted.filter(isPricedPackageItem);
      const total: Range = {
        low: priced.reduce((sum, item) => sum + item.line.low, 0),
        high: priced.reduce((sum, item) => sum + item.line.high, 0),
      };
      return {
        package: pkg,
        unassigned: pkg === UNASSIGNED_PACKAGE,
        items: sorted,
        total,
        unpricedCount: sorted.length - priced.length,
        ownerDirect: priced.length > 0 && priced.every((item) => item.line.contractSide === "owner"),
      };
    })
    .sort((a, b) => midpoint(b.total) - midpoint(a.total) || a.package.localeCompare(b.package));

  return { groups };
}

/** The block's own figure: every priced tile's, once each. */
export function packageGroupMidpoint(group: PackageGroup): number {
  return midpoint(group.total);
}

export function packageItemRange(item: PackageItem): Range {
  return item.kind === "priced" ? { low: item.line.low, high: item.line.high } : { low: 0, high: 0 };
}

/**
 * LA-1210: the view a saved ROM opens on, when the viewer has never picked
 * one themselves (view-switch.tsx's remembered choice still wins over this).
 * New budget always opens on By Scope, decided elsewhere; this is only for a
 * saved run. Weighing by priced trade cost rather than by line count, so one
 * huge unpackaged line can't be outvoted by a handful of small packaged ones,
 * or the reverse: By Scope once most of the run's trade cost has no stated
 * buyout package, By Package once most of it does. A run with nothing priced
 * yet opens in By Scope, since there is no packaged majority to show.
 */
export function defaultRomView(rom: Rom, classifications: readonly BlockClassification[]): RomView {
  const packageByCostCode = new Map(classifications.map((c) => [c.costCode, c.buyoutPackage]));
  let total = 0;
  let packaged = 0;
  for (const line of rom.lines.filter(addsToTotal)) {
    const cost = midpoint({ low: line.low, high: line.high });
    total += cost;
    if (line.buyoutPackage ?? packageByCostCode.get(line.costCode) ?? null) packaged += cost;
  }
  if (total <= 0) return "scope";
  return packaged > total / 2 ? "package" : "scope";
}

/**
 * The one entry point the screen calls: groups a ROM's lines the way the
 * named view groups them. By Scope reuses `groupElements` untouched (LA-1158);
 * By Package is this ticket's own grouping. Pure, same as either grouping
 * function alone.
 */
export function groupByView(
  view: RomView,
  rom: Rom,
  classifications: readonly BlockClassification[],
): ViewResult {
  if (view === "scope") return { view, ...groupElements(rom, classifications) };
  return { view, ...groupByPackage(rom, classifications) };
}
