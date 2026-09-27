import type { BlockClassification, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { addsToTotal, midpoint, type Range } from "./block-layout";

// LA-1158, ADR 0006. "On the ROM screen an element is the parent box: it
// shows the sum of its items, with the driver as a full-width tile and each
// supporting item as its own tile inside it" (CONTEXT.md: Element).
//
// This module only groups lines the engine has already priced and gated. It
// prices nothing, and it reads no clock or network -- the same rule as the
// engine itself. `classifications` names which cost code drives which
// element (LA-1157's `is_element_driver`), so the screen never hardcodes a
// cost code such as "1a" to find the driver.

/** One tile inside an element box: a priced line, or an item with no rate yet. */
export type ElementItem =
  | { kind: "priced"; costCode: string; label: string; line: RomLine }
  | { kind: "unpriced"; costCode: string; label: string; item: UnpricedItem };

/** LA-1158: one element with a stated driver, shown as a parent box. */
export type ElementGroup = {
  element: string;
  /** The driver, always the box's full-width tile. */
  driver: ElementItem;
  /**
   * Every other tile in the box, two to a row: the driver's supporting
   * items, plus a plain member that shares the element but has no driver of
   * its own (Site Demolition, in the Demolition element but not its driver).
   */
  members: ElementItem[];
  /** The sum of every priced tile's range in the box, driver included, each counted once. */
  total: Range;
  /** How many tiles in the box (driver plus members) carry no rate yet. */
  unpricedCount: number;
  /** True when every priced tile is owner-direct scope. The pilot never mixes the two. */
  ownerDirect: boolean;
};

export type GroupedField = {
  groups: ElementGroup[];
  /**
   * Lines that add to the total and sit outside every box: no element, an
   * element with no stated driver, or a driver with nothing else in its
   * element, which stays a single block, same as before this ticket.
   */
  singles: RomLine[];
};

function itemOfLine(line: RomLine): ElementItem {
  return { kind: "priced", costCode: line.costCode, label: line.label, line };
}

function itemOfUnpriced(item: UnpricedItem): ElementItem {
  return { kind: "unpriced", costCode: item.costCode, label: item.label, item };
}

export function itemRange(item: ElementItem): Range {
  return item.kind === "priced" ? { low: item.line.low, high: item.line.high } : { low: 0, high: 0 };
}

export function itemLabel(item: ElementItem): string {
  return item.label;
}

function isPriced(item: ElementItem): item is Extract<ElementItem, { kind: "priced" }> {
  return item.kind === "priced";
}

/**
 * Groups a computed ROM's lines into element boxes. A cost code named as a
 * driver (`isElementDriver` on `classifications`) becomes a box's full-width
 * tile once its element has at least one other member in scope; with none it
 * stays a single block, unchanged from before this ticket.
 *
 * Pure: reads only the Rom and the classifications it is given.
 */
export function groupElements(rom: Rom, classifications: readonly BlockClassification[]): GroupedField {
  const driverCostCodeByElement = new Map<string, string>();
  for (const classification of classifications) {
    if (classification.isElementDriver && classification.element) {
      driverCostCodeByElement.set(classification.element, classification.costCode);
    }
  }

  const lineByCostCode = new Map(rom.lines.map((line) => [line.costCode, line]));
  const unpricedByCostCode = new Map(rom.unpricedItems.map((item) => [item.costCode, item]));
  const consumed = new Set<string>();
  const groups: ElementGroup[] = [];

  const elements = [...driverCostCodeByElement.keys()].sort((a, b) => a.localeCompare(b));
  for (const element of elements) {
    const driverCostCode = driverCostCodeByElement.get(element)!;
    const driverLine = lineByCostCode.get(driverCostCode);
    const driverUnpriced = unpricedByCostCode.get(driverCostCode);
    // Gated off, a breakout, or simply not in scope: the driver is not on
    // screen, so its element has no box.
    if (driverLine && !addsToTotal(driverLine)) continue;
    if (!driverLine && !driverUnpriced) continue;

    const driver = driverLine ? itemOfLine(driverLine) : itemOfUnpriced(driverUnpriced!);

    const supportingPriced = rom.lines.filter(
      (line) => line.driverCostCode === driverCostCode && addsToTotal(line),
    );
    const supportingUnpriced = rom.unpricedItems.filter((item) => item.driverCostCode === driverCostCode);
    // A plain member: same element, not the driver, brought in by no driver
    // of its own (Site Demolition beside Structure Demolition).
    const plainMembers = rom.lines.filter(
      (line) =>
        line.element === element &&
        line.costCode !== driverCostCode &&
        line.driverCostCode === undefined &&
        addsToTotal(line),
    );

    const members = [
      ...plainMembers.map(itemOfLine),
      ...supportingPriced.map(itemOfLine),
      ...supportingUnpriced.map(itemOfUnpriced),
    ].sort((a, b) => a.costCode.localeCompare(b.costCode));

    // "Blocks with no supporting items stay one column, as today."
    if (members.length === 0) continue;

    consumed.add(driverCostCode);
    for (const member of members) consumed.add(member.costCode);

    const allTiles = [driver, ...members];
    const priced = allTiles.filter(isPriced);
    const total: Range = {
      low: priced.reduce((sum, item) => sum + item.line.low, 0),
      high: priced.reduce((sum, item) => sum + item.line.high, 0),
    };
    const unpricedCount = allTiles.length - priced.length;
    const ownerDirect = priced.length > 0 && priced.every((item) => item.line.contractSide === "owner");

    groups.push({ element, driver, members, total, unpricedCount, ownerDirect });
  }

  const singles = rom.lines.filter((line) => addsToTotal(line) && !consumed.has(line.costCode));

  return { groups, singles };
}

/** The box's own figure: the driver's plus every priced member's, once each. */
export function groupMidpoint(group: ElementGroup): number {
  return midpoint(group.total);
}
