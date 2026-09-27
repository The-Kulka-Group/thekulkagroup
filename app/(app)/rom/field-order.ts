import type { BlockClassification, Rom, UnpricedItem } from "@kulka/engine";

import { divisionOf } from "@/lib/rom/board";

import { midpoint, shortMoney, tradeBlocks, type TradeBlock } from "./block-layout";
import { groupElements, type ElementGroup, type ElementItem } from "./element-groups";
import { groupByPackage, type PackageGroup, type PackageItem, type RomView } from "./view-groups";

// LA-1181. What the ROM field shows, in the order the viewer picked, and what
// the header's markup bar lights for it. Pure: it reads only the Rom and the
// stated classifications, so every rule below is unit tested
// (field-order.test.ts) and the components only draw what it returns.
//
// Ordering:
//   - MasterFormat (the default) sorts by division. A package takes the
//     lowest division among its items, since a package has no stated division
//     of its own anywhere in the schema. A block takes its line's division and
//     an element its driver's. A division comes from
//     `block_classification.division` where stated, and otherwise from the
//     cost code's first two digits (`divisionOf`, lib/rom/board.ts). Anything
//     with no division sorts last. Kulka's 90 series sorts after the standard
//     divisions because divisions compare as numbers.
//   - Largest First sorts by priced total, biggest first, and puts anything
//     with nothing priced last.

export type RomOrder = "masterformat" | "largest";

/** The stated division for each classified cost code, null where none is stated. */
export function statedDivisions(classifications: readonly BlockClassification[]): Map<string, string | null> {
  return new Map(classifications.map((c) => [c.costCode, c.division ?? null]));
}

/** A cost code's division: the stated one, else the cost code's own first two digits. */
export function divisionFor(costCode: string, stated: ReadonlyMap<string, string | null>): string | null {
  return stated.get(costCode) ?? divisionOf(costCode);
}

/** Divisions compare as numbers, so 02 < 22 < 33 < 90; none sorts last. */
export function divisionRank(division: string | null): number {
  if (division === null) return Number.POSITIVE_INFINITY;
  const n = Number(division);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

/** The lowest division among several, or null when none has one. */
export function lowestDivision(divisions: readonly (string | null)[]): string | null {
  let best: string | null = null;
  for (const division of divisions) {
    if (division !== null && divisionRank(division) < divisionRank(best)) best = division;
  }
  return best;
}

type EntryBase = {
  /** Stable across views and orders, for FLIP and for the lit share. */
  key: string;
  label: string;
  division: string | null;
  /** The priced midpoint. Zero when nothing inside is priced. */
  midpoint: number;
  /** True when at least one line inside carries a figure. */
  priced: boolean;
  ownerDirect: boolean;
  /** Every cost code this entry shows, priced or not. */
  costCodes: string[];
};

/** One card or block on the field. */
export type FieldEntry =
  | (EntryBase & { kind: "block"; block: TradeBlock })
  | (EntryBase & { kind: "element"; group: ElementGroup })
  | (EntryBase & { kind: "package"; group: PackageGroup })
  | (EntryBase & { kind: "unpriced"; item: UnpricedItem });

/**
 * Every card or block the named view shows, unordered. By Scope shows element
 * boxes, loose blocks, and loose unpriced items; By Package shows one card per
 * buyout package. Either way every line that adds to the total and every
 * unpriced item appears exactly once.
 */
export function buildField(view: RomView, rom: Rom, classifications: readonly BlockClassification[]): FieldEntry[] {
  const stated = statedDivisions(classifications);
  const div = (costCode: string) => divisionFor(costCode, stated);

  if (view === "package") {
    return groupByPackage(rom, classifications).groups.map((group) => ({
      kind: "package",
      key: `package:${group.package}`,
      label: group.package,
      division: lowestDivision(group.items.map((item) => div(item.costCode))),
      midpoint: midpoint(group.total),
      priced: group.items.some((item) => item.kind === "priced"),
      ownerDirect: group.ownerDirect,
      costCodes: group.items.map((item) => item.costCode),
      group,
    }));
  }

  const { groups, singles } = groupElements(rom, classifications);
  const singleCodes = new Set(singles.map((line) => line.costCode));
  const grouped = new Set(groups.flatMap((group) => [group.driver, ...group.members].map((item) => item.costCode)));

  const elements: FieldEntry[] = groups.map((group) => ({
    kind: "element",
    key: `element:${group.element}`,
    label: group.element,
    division: div(group.driver.costCode),
    midpoint: midpoint(group.total),
    priced: [group.driver, ...group.members].some((item) => item.kind === "priced"),
    ownerDirect: group.ownerDirect,
    costCodes: [group.driver, ...group.members].map((item) => item.costCode),
    group,
  }));
  const blocks: FieldEntry[] = tradeBlocks(rom)
    .filter((block) => singleCodes.has(block.costCode))
    .map((block) => ({
      kind: "block",
      key: block.costCode,
      label: block.label,
      division: div(block.costCode),
      midpoint: block.midpoint,
      priced: true,
      ownerDirect: block.ownerDirect,
      costCodes: [block.costCode],
      block,
    }));
  const unpriced: FieldEntry[] = rom.unpricedItems
    .filter((item) => !grouped.has(item.costCode))
    .map((item) => ({
      kind: "unpriced",
      key: `unpriced:${item.costCode}`,
      label: item.label,
      division: div(item.costCode),
      midpoint: 0,
      priced: false,
      ownerDirect: false,
      costCodes: [item.costCode],
      item,
    }));
  return [...elements, ...blocks, ...unpriced];
}

function byLabel(a: FieldEntry, b: FieldEntry): number {
  return a.label.localeCompare(b.label) || a.key.localeCompare(b.key);
}

/** A copy of `entries` in the named order. */
export function orderField(entries: readonly FieldEntry[], order: RomOrder): FieldEntry[] {
  const sorted = [...entries];
  if (order === "masterformat") {
    // Within one division the bigger figure leads, so the field still reads
    // at a glance.
    sorted.sort(
      (a, b) =>
        divisionRank(a.division) - divisionRank(b.division) || b.midpoint - a.midpoint || byLabel(a, b),
    );
  } else {
    sorted.sort((a, b) => Number(b.priced) - Number(a.priced) || b.midpoint - a.midpoint || byLabel(a, b));
  }
  return sorted;
}

/** The entry a cost code sits in, so a selected line lights its whole card. */
export function entryForCostCode(entries: readonly FieldEntry[], costCode: string | null): FieldEntry | undefined {
  if (costCode === null) return undefined;
  return entries.find((entry) => entry.costCodes.includes(costCode));
}

/* --- The header's markup bar ------------------------------------------------ */

export type BarPartKey = "trade" | "gc" | "fee" | "ins" | "owner";

/** One markup segment of the bar, as a percent of the bar's width. */
export type BarPart = { key: BarPartKey; label: string; value: number; left: number; width: number };

/** Where one entry's share sits inside the bar, as a percent of its width. */
export type BarSpan = {
  left: number;
  width: number;
  /** The entry's share of the segment it sits in, 0 to 1. */
  share: number;
  of: "Trades" | "Owner Direct";
};

export type BarModel = {
  parts: BarPart[];
  spans: Map<string, BarSpan>;
  /** Faint dividers inside Trades at each entry's edge, in the field's order. */
  hairlines: { key: string; left: number }[];
};

/**
 * The markup split, Trades then GRs/GCs, Fee, Insurance, and Owner last,
 * plus where each entry's share sits inside Trades (or Owner Direct, for an
 * owner-direct entry). `entries` must already be in the field's order, so the
 * hairlines follow it.
 */
export function barModel(rom: Rom, entries: readonly FieldEntry[]): BarModel {
  const m = rom.markups;
  const kulka = rom.kulkaContractTotal ?? rom.total;
  const trade = m ? midpoint(m.subtotal) : midpoint(kulka);
  const owner = m ? midpoint(m.ownerDirect) : midpoint(rom.total) - midpoint(kulka);
  const raw: Omit<BarPart, "left" | "width">[] = [
    { key: "trade", label: "Trades", value: trade },
    { key: "gc", label: "GRs/GCs", value: m && !m.generalConditions.tbd ? midpoint(m.generalConditions) : 0 },
    { key: "fee", label: "Fee", value: m && !m.fee.tbd ? midpoint(m.fee) : 0 },
    { key: "ins", label: "Insurance", value: m && !m.insurance.tbd ? midpoint(m.insurance) : 0 },
    { key: "owner", label: "Owner Direct", value: owner },
  ];
  const sum = raw.reduce((total, part) => total + Math.max(0, part.value), 0);
  let left = 0;
  const parts = raw.map((part) => {
    const width = sum > 0 ? (Math.max(0, part.value) / sum) * 100 : 0;
    const at = left;
    left += width;
    return { ...part, left: at, width };
  });

  const spans = new Map<string, BarSpan>();
  const hairlines: { key: string; left: number }[] = [];
  const lay = (side: FieldEntry[], part: BarPart, of: BarSpan["of"]) => {
    const total = side.reduce((s, entry) => s + Math.max(0, entry.midpoint), 0);
    let at = part.left;
    side.forEach((entry, index) => {
      const share = total > 0 ? Math.max(0, entry.midpoint) / total : 0;
      const width = share * part.width;
      spans.set(entry.key, { left: at, width, share, of });
      at += width;
      if (of === "Trades" && width > 0 && index < side.length - 1) hairlines.push({ key: entry.key, left: at });
    });
  };
  lay(
    entries.filter((entry) => !entry.ownerDirect),
    parts[0],
    "Trades",
  );
  lay(
    entries.filter((entry) => entry.ownerDirect),
    parts[4],
    "Owner Direct",
  );
  // No divider sits on the far edge of Trades, where the next segment starts.
  const end = parts[0].left + parts[0].width;
  return { parts, spans, hairlines: hairlines.filter((line) => line.left < end - 0.01) };
}

/** "32%", or "<1%" for a sliver, so a small share never reads as zero. */
export function sharePercent(share: number): string {
  if (share > 0 && share < 0.005) return "<1%";
  return `${Math.round(share * 100)}%`;
}

/** What the chip beside the total says for one entry. */
export type Chip = { name: string; figure: string | null; share: string | null };

export function chipFor(entry: FieldEntry, span: BarSpan | undefined): Chip {
  if (!entry.priced) return { name: entry.label, figure: null, share: null };
  return {
    name: entry.label,
    figure: shortMoney(entry.midpoint),
    share: span ? `${sharePercent(span.share)} of ${span.of}` : null,
  };
}

/** "Plumbing $788k, 32% of Trades", or "Site Work No Rate Yet". */
export function chipText(chip: Chip): string {
  if (chip.figure === null) return `${chip.name} No Rate Yet`;
  return chip.share ? `${chip.name} ${chip.figure}, ${chip.share}` : `${chip.name} ${chip.figure}`;
}

/* --- A package card ---------------------------------------------------------- */

export type CardSegment = { costCode: string; label: string; value: number; driverLabel: string | null };
export type CardDot = { costCode: string; label: string; driverLabel: string | null };

export type PackageCardModel = {
  /** One per priced item, biggest first, each sized by its figure. */
  segments: CardSegment[];
  /** One orange dot per unpriced item, after the segments. */
  dots: CardDot[];
  itemCount: number;
  unpricedCount: number;
  /** Nothing inside is priced: the card reads "No Rate Yet" with a dashed border. */
  noRate: boolean;
};

function itemMid(item: Extract<PackageItem, { kind: "priced" }>): number {
  return midpoint({ low: item.line.low, high: item.line.high });
}

export function packageCard(group: PackageGroup): PackageCardModel {
  const segments = group.items
    .filter((item): item is Extract<PackageItem, { kind: "priced" }> => item.kind === "priced")
    .map((item) => ({ costCode: item.costCode, label: item.label, value: itemMid(item), driverLabel: item.driverLabel }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  const dots = group.items
    .filter((item) => item.kind === "unpriced")
    .map((item) => ({ costCode: item.costCode, label: item.label, driverLabel: item.driverLabel }));
  return {
    segments,
    dots,
    itemCount: group.items.length,
    unpricedCount: dots.length,
    noRate: segments.length === 0,
  };
}

/** "1 Item", "5 Items". */
export function itemsLabel(count: number): string {
  return count === 1 ? "1 Item" : `${count} Items`;
}

/** "2 Not Priced". */
export function notPricedLabel(count: number): string {
  return `${count} Not Priced`;
}

/** True when an element box has nothing priced inside it (LA-1175). */
export function elementHasNoRate(group: ElementGroup): boolean {
  return [group.driver, ...group.members].every((item: ElementItem) => item.kind === "unpriced");
}
