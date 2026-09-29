import { overheadLines, type BlockClassification, type ConfidenceFlag, type Rom, type RomLine } from "@kulka/engine";

import { midpoint, tradeBlocks } from "./block-layout";
import { divisionFor, divisionRank, orderField, statedDivisions, type FieldEntry, type RomOrder } from "./field-order";

// LA-1254. Matt, 2026-09-28: a view that stacks the budget vertically like a
// schedule of values, one row per trade, with a source column saying where
// each figure came from. It follows the same MasterFormat / Largest First
// order as the cards, and groups two ways:
//   - By Element: an element's items fold under it (Demolition with its
//     disconnects), the same boxes the cards draw.
//   - By Division: every item sits under its own MasterFormat division, so
//     Electrical Service Disconnect reads under 26 Electrical, not Demolition.
// Pure: it reads only the Rom, the ordered field and the classifications.

export type LedgerGrouping = "element" | "division";

export type SourceTone = ConfidenceFlag | "none";
export type Source = { text: string; tone: SourceTone };

/** One item row: a priced line, or an item with no rate yet. */
export type LedgerItem = {
  key: string;
  costCode: string;
  label: string;
  division: string | null;
  /** The priced midpoint, or null for an item with no rate yet. */
  amount: number | null;
  source: Source;
};

/** A row the ledger draws: an item alone, or a parent (element or division) with items under it. */
export type LedgerRow =
  | ({ kind: "item" } & LedgerItem)
  | { kind: "group"; key: string; label: string; division: string | null; amount: number; unpricedCount: number; items: LedgerItem[] };

export type Ledger = { trade: LedgerRow[]; ownerDirect: LedgerRow[] };

// MasterFormat 2018 division titles, for the By Division headers.
const DIVISION_TITLES: Record<string, string> = {
  "01": "General Requirements",
  "02": "Existing Conditions",
  "03": "Concrete",
  "04": "Masonry",
  "05": "Metals",
  "06": "Wood, Plastics and Composites",
  "07": "Thermal and Moisture Protection",
  "08": "Openings",
  "09": "Finishes",
  "10": "Specialties",
  "11": "Equipment",
  "12": "Furnishings",
  "13": "Special Construction",
  "14": "Conveying Equipment",
  "21": "Fire Suppression",
  "22": "Plumbing",
  "23": "HVAC",
  "25": "Integrated Automation",
  "26": "Electrical",
  "27": "Communications",
  "28": "Electronic Safety and Security",
  "31": "Earthwork",
  "32": "Exterior Improvements",
  "33": "Utilities",
};

/** "26 Electrical", "90", or "No Division". */
export function divisionTitle(division: string | null): string {
  if (division === null) return "No Division";
  const title = DIVISION_TITLES[division];
  return title ? `${division} ${title}` : division;
}

/** Where a priced line's figure came from, in a few words. */
export function sourceOf(line: RomLine): Source {
  const tone = line.confidence;
  if (line.comparables.length === 0 || line.comparables.every((c) => c.kind === "llm_proposal")) {
    return { text: "AI Figure", tone };
  }
  const own = line.comparables.find((c) => c.exportLabel?.startsWith("This project only."));
  if (own) return { text: own.exportLabel?.includes("suggestion") ? "AI, This Budget Only" : "This Budget Only", tone };
  // A figure no job count stands behind is a stated rate, never "0 Kulka Jobs".
  if (line.comparableCount === 0) return { text: "Stated Rate", tone };
  const jobs = line.comparableCount === 1 ? "1 Kulka Job" : `${line.comparableCount} Kulka Jobs`;
  if (line.comparables.some((c) => c.kind === "actuals" || c.kind === "proest_budget")) return { text: jobs, tone };
  return { text: line.comparableCount > 0 ? `${jobs}, Judgment` : "Stated Rate", tone };
}

const NO_RATE: Source = { text: "No Rate Yet", tone: "none" };

/** Every item on the field, flat: each priced line that adds to the total and each item with no rate. */
function flatItems(rom: Rom, div: (costCode: string) => string | null): { item: LedgerItem; ownerDirect: boolean }[] {
  const priced = tradeBlocks(rom).map((block) => ({
    item: {
      key: block.costCode,
      costCode: block.costCode,
      label: block.label,
      division: div(block.costCode),
      amount: block.midpoint,
      source: sourceOf(block.line),
    },
    ownerDirect: block.ownerDirect,
  }));
  const unpriced = rom.unpricedItems.map((item) => ({
    item: {
      key: `unpriced:${item.costCode}`,
      costCode: item.costCode,
      label: item.label,
      division: div(item.costCode),
      amount: null,
      source: NO_RATE,
    },
    ownerDirect: false,
  }));
  return [...priced, ...unpriced];
}

function sumAmounts(items: readonly LedgerItem[]): number {
  return items.reduce((total, item) => total + (item.amount ?? 0), 0);
}

/**
 * The ledger's rows. `entries` is the By Scope field already in the chosen
 * order (field-order.ts), which By Element follows row for row. By Division
 * regroups every item under its division, in division order for MasterFormat
 * and biggest division first for Largest First.
 */
export function buildLedger(
  rom: Rom,
  entries: readonly FieldEntry[],
  grouping: LedgerGrouping,
  order: RomOrder,
  classifications: readonly BlockClassification[],
  canonicalDivisions: ReadonlyMap<string, string>,
): Ledger {
  const stated = statedDivisions(classifications);
  const div = (costCode: string) => divisionFor(costCode, stated, canonicalDivisions);
  const flat = flatItems(rom, div);
  const byCode = new Map(flat.map((entry) => [entry.item.costCode, entry]));
  const ownerCodes = new Set(flat.filter((entry) => entry.ownerDirect).map((entry) => entry.item.costCode));

  if (grouping === "element") {
    const trade: LedgerRow[] = [];
    const ownerDirect: LedgerRow[] = [];
    for (const entry of entries) {
      const target = entry.ownerDirect ? ownerDirect : trade;
      if (entry.kind === "element") {
        const items = entry.costCodes.flatMap((code) => {
          const found = byCode.get(code);
          return found ? [found.item] : [];
        });
        // The driver first, then the rest biggest first, the way the box reads.
        const [driver, ...rest] = items;
        const sorted = driver ? [driver, ...rest.sort((a, b) => (b.amount ?? -1) - (a.amount ?? -1))] : [];
        target.push({
          kind: "group",
          key: entry.key,
          label: entry.label,
          division: entry.division,
          amount: sumAmounts(sorted),
          unpricedCount: sorted.filter((item) => item.amount === null).length,
          items: sorted,
        });
      } else {
        const found = byCode.get(entry.costCodes[0]);
        if (found) target.push({ kind: "item", ...found.item });
      }
    }
    return { trade, ownerDirect };
  }

  // By Division: order the flat items the way the field orders single
  // blocks, then gather each division's items under one header.
  const asEntries: FieldEntry[] = flat
    .filter((entry) => !entry.ownerDirect)
    .map(({ item }) => ({
      kind: "unpriced",
      key: item.key,
      label: item.label,
      division: item.division,
      midpoint: item.amount ?? 0,
      priced: item.amount !== null,
      ownerDirect: false,
      costCodes: [item.costCode],
      item: { costCode: item.costCode, label: item.label },
    }));
  const ordered = orderField(asEntries, order === "largest" ? "largest" : "masterformat");
  const sections = new Map<string, LedgerItem[]>();
  for (const entry of ordered) {
    const item = byCode.get(entry.costCodes[0])?.item;
    if (!item) continue;
    const key = item.division ?? "none";
    sections.set(key, [...(sections.get(key) ?? []), item]);
  }
  const groups = [...sections.entries()].map(([key, items]) => ({
    kind: "group" as const,
    key: `division:${key}`,
    label: divisionTitle(items[0].division),
    division: items[0].division,
    amount: sumAmounts(items),
    unpricedCount: items.filter((item) => item.amount === null).length,
    items,
  }));
  groups.sort((a, b) =>
    order === "largest"
      ? b.amount - a.amount || divisionRank(a.division) - divisionRank(b.division)
      : divisionRank(a.division) - divisionRank(b.division),
  );
  const ownerDirect: LedgerRow[] = flat
    .filter((entry) => ownerCodes.has(entry.item.costCode))
    .map(({ item }) => ({ kind: "item" as const, ...item }));
  return { trade: groups, ownerDirect };
}

/** The markup rows under the trade subtotal, each with its figure, skipping any that is TBD. */
export function markupRows(rom: Rom): { key: string; label: string; amount: number }[] {
  const m = rom.markups;
  if (!m) return [];
  return [
    // LA-1383: a split budget shows General Requirements and General Conditions as two rows.
    ...overheadLines(m).map(({ key, name, line }) => ({ key, label: name, range: line })),
    { key: "fee", label: "Fee", range: m.fee },
    { key: "ins", label: "Insurance", range: m.insurance },
  ]
    .filter((row) => !row.range.tbd)
    .map((row) => ({ key: row.key, label: row.label, amount: midpoint(row.range) }));
}
