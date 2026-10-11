import type { BlockClassification, Rom, RomLine, ScopeSide, UnpricedItem } from "@kulka/engine";

import { addsToTotal, midpoint } from "@/app/(app)/rom/block-layout";
import { groupElements } from "@/app/(app)/rom/element-groups";
import { sourceOf } from "@/app/(app)/rom/ledger";
import { titleCase } from "@/lib/format/title-case";
import { rateUsd, usd, wholeNumber } from "@/lib/format/usd";

import { type ClientSource, clientSource } from "./client-source";
import { PER_UNIT_WORDS, UNIT_WORDS } from "./drill-down";
import { partsOf, type StageBuilding, type StageFacts } from "./stage-model";
import type { StagePart } from "./stage-scenes";

// LA-2211 (spec LA-2209): the part price map. Every part the ROM building
// view draws carries the priced lines behind it, so picking a part can show
// what it costs. The stage and the list both read from this one pure
// function; it prices nothing itself and reads no clock, network or database.

/** One part of the building with the lines it draws. */
export type PricedPart = {
  part: StagePart;
  /** The part's name on screen, title case. */
  name: string;
  /** The lines that add to the run total and sit on this part. */
  lines: RomLine[];
  /** The items in scope with no rate yet that sit on this part. They add nothing. */
  unpricedItems: UnpricedItem[];
  /** Midpoint sum of `lines`, or null when the part has no priced line. */
  total: number | null;
  /** `total` over the gross square feet, or null when either is unknown. */
  perGsf: number | null;
  /** The weakest source among the lines; "No Rate Yet" when nothing prices the part. */
  source: ClientSource;
  /** One sentence a line, then one per unpriced item: quantity, unit, rate and where the rate came from. */
  math: string[];
  /** True when nothing prices the part. The stage draws it dashed in the working orange and it reads "Not Priced", never $0. */
  unpriced: boolean;
};

/** The part's name on screen. */
export const PART_NAMES: Readonly<Record<StagePart, string>> = {
  site: "Site",
  foundation: "Foundation",
  basement: "Basement",
  podium: "Podium",
  massing: "Building",
  glass: "Windows",
  balconies: "Balconies",
  elevators: "Elevators",
  units: "Rooftop Units",
  service: "Electrical Service",
};

export type PartPriceMap = {
  /** Every part the building draws, in assembly order, each with its lines. */
  parts: PricedPart[];
  /** The run's midpoint, which the parts' totals add up to. */
  total: number;
  /** The list rows at the chosen level. */
  view: LevelView;
};

/**
 * How finely the building view reads the same run (LA-2209): 1 is the whole
 * run as one block, 2 the element rollup of ADR 0002, 3 the canonical work
 * items. It is not the engine's DetailLevel (a property of each line), not a
 * story of the building (StageLevel), and not the Dial in GLOSSARY.md.
 */
export type PriceLevel = 1 | 2 | 3;

/** One row of the list. `total` is null for an item with no rate yet. */
export type LevelRow = { key: string; label: string; total: number | null; parts: StagePart[] };

/** The list at one level. Its rows' totals add up to the run total at every level. */
export type LevelView = { level: PriceLevel; rows: LevelRow[] };

export type PartPriceInput = {
  rom: Rom;
  facts: StageFacts;
  /** The building the stage draws, or null when the facts are too thin to draw one. */
  building: StageBuilding | null;
  /** The list's level. Defaults to 3, the canonical work items. */
  level?: PriceLevel;
  /** The stated classifications, which name each element's driver for level 2. */
  classifications?: readonly BlockClassification[];
};

/**
 * Each canonical work item's part, first choice first. An item goes to the
 * first part on its list that the building draws, so a line never sits on a
 * part that is not there. The section's layer map (lib/rom/section.ts LAYERS)
 * is the prior art for which item draws where.
 */
const ITEM_PARTS: Readonly<Record<string, readonly StagePart[]>> = {
  // Below grade and the ground.
  "2": ["foundation"],
  "34a": ["foundation"],
  "34": ["basement", "site"],
  // The podium: its deck, its garage doors and its storefront.
  "3": ["podium", "massing"],
  "15a": ["podium", "massing"],
  "16": ["podium", "glass"],
  // The skin's openings and what hangs off it.
  "16a": ["glass"],
  "11": ["balconies", "massing"],
  // The elevators, and every elevator sub-item (26a bulkhead and the rest) by its base number.
  "26": ["elevators", "massing"],
  // The rooftop units are M-1's HVAC; the service at grade is E-1's electrical.
  "30": ["units", "massing"],
  "31": ["service", "massing"],
  // Site work, demolition and its disconnects.
  "1": ["site"],
  "1a": ["site"],
  "28a": ["site"],
  "28b": ["site"],
  "31c": ["site"],
  "31f": ["site"],
  "33": ["site"],
  "35": ["site"],
  "36": ["site"],
  "36a": ["site"],
  "37": ["site"],
  "38": ["site"],
  "39": ["site"],
};

/** Where a line lands when nothing above names it: by its scope side. */
function fallbackPart(side: ScopeSide | undefined): StagePart {
  return side === "site" ? "site" : "massing";
}

/**
 * The elevator's sub-items (26a to 26i, LA-1205) are all the elevator, so they
 * take item 26's parts. No other lettered item follows its base number: 3a
 * gypcrete is not the podium deck and 31a low voltage is not the service.
 */
const ELEVATOR_SUB_ITEM = /^26[a-z]$/;

function choicesFor(costCode: string): readonly StagePart[] {
  return ITEM_PARTS[costCode] ?? (ELEVATOR_SUB_ITEM.test(costCode) ? ITEM_PARTS["26"] : []);
}

function partFor(costCode: string, side: ScopeSide | undefined, drawn: ReadonlySet<StagePart>): StagePart {
  return choicesFor(costCode).find((part) => drawn.has(part)) ?? fallbackPart(side);
}

/** What the stage draws, even with no building: the ground and the body always. */
function drawnParts(building: StageBuilding | null): StagePart[] {
  return building ? partsOf(building) : ["site", "foundation", "massing"];
}

/** Weakest first: a part with any placeholder line reads Placeholder Rate. */
const SOURCE_RANK: readonly ClientSource[] = ["No Rate Yet", "Placeholder Rate", "Kulka Figure", "Kulka Rate"];

function weakest(sources: readonly ClientSource[]): ClientSource {
  return SOURCE_RANK.find((source) => sources.includes(source)) ?? "No Rate Yet";
}

/** "Foundations: 100,000 SF x $20.00 per SF (1 Kulka Job)", "Piles: $350,000 Lump Sum (Stated Rate)". */
function mathOf(line: RomLine): string {
  const name = titleCase(line.label);
  const likely = midpoint(line);
  const from = `(${sourceOf(line).text})`;
  const quantity = line.quantity;
  if (line.perUnit) {
    return `${name}: ${wholeNumber(line.perUnit.unitCount)} Units x ${usd(line.perUnit.usdPerUnit)} per Unit ${from}`;
  }
  if (quantity && PER_UNIT_WORDS[quantity.unit] === null) return `${name}: ${usd(likely)} Lump Sum ${from}`;
  if (quantity && quantity.amount > 0) {
    const unit = UNIT_WORDS[quantity.unit];
    const per = PER_UNIT_WORDS[quantity.unit];
    return `${name}: ${wholeNumber(quantity.amount)} ${unit} x ${rateUsd(likely / quantity.amount)} per ${per} ${from}`;
  }
  return `${name}: ${usd(likely)} ${from}`;
}

const lineRow = (line: RomLine, part: StagePart): LevelRow => ({
  key: `line:${line.costCode}`,
  label: titleCase(line.label),
  total: midpoint(line),
  parts: [part],
});
const unpricedRow = (item: UnpricedItem, part: StagePart): LevelRow => ({
  key: `unpriced:${item.costCode}`,
  label: titleCase(item.label),
  total: null,
  parts: [part],
});

/** Priced rows biggest first, then the items with no rate, in the run's order. */
function ordered(rows: LevelRow[]): LevelRow[] {
  const priced = rows.filter((row) => row.total !== null).sort((a, b) => b.total! - a.total! || a.label.localeCompare(b.label));
  return [...priced, ...rows.filter((row) => row.total === null)];
}

function levelView(
  level: PriceLevel,
  rom: Rom,
  drawn: readonly StagePart[],
  partOf: ReadonlyMap<string, StagePart>,
  classifications: readonly BlockClassification[],
): LevelView {
  const priced = rom.lines.filter(addsToTotal);
  if (level === 1) {
    return { level, rows: [{ key: "block", label: "Building", total: midpoint(rom.total), parts: [...drawn] }] };
  }
  if (level === 3) {
    return {
      level,
      rows: ordered([
        ...priced.map((line) => lineRow(line, partOf.get(line.costCode)!)),
        ...rom.unpricedItems.map((item) => unpricedRow(item, partOf.get(item.costCode)!)),
      ]),
    };
  }
  // Level 2, ADR 0002's element rollup: the same boxes the ROM screen draws By Scope.
  const { groups, singles } = groupElements(rom, classifications);
  const inGroup = new Set(groups.flatMap((group) => [group.driver, ...group.members].map((item) => item.costCode)));
  const elementRows = groups.map((group): LevelRow => {
    const codes = [group.driver, ...group.members].map((item) => item.costCode);
    return {
      key: `element:${group.element}`,
      label: titleCase(group.element),
      total: midpoint(group.total),
      parts: drawn.filter((part) => codes.some((code) => partOf.get(code) === part)),
    };
  });
  return {
    level,
    rows: ordered([
      ...elementRows,
      ...singles.map((line) => lineRow(line, partOf.get(line.costCode)!)),
      ...rom.unpricedItems.filter((item) => !inGroup.has(item.costCode)).map((item) => unpricedRow(item, partOf.get(item.costCode)!)),
    ]),
  };
}

export function partPrices(input: PartPriceInput): PartPriceMap {
  const { rom, building } = input;
  const gsf = input.facts.grossSquareFeet;
  const drawn = drawnParts(building);
  const has = new Set(drawn);
  const linesOf = new Map<StagePart, RomLine[]>(drawn.map((part) => [part, []]));
  const unpricedOf = new Map<StagePart, UnpricedItem[]>(drawn.map((part) => [part, []]));
  const partOf = new Map<string, StagePart>();
  for (const line of rom.lines.filter(addsToTotal)) {
    const part = partFor(line.costCode, line.scopeSide, has);
    partOf.set(line.costCode, part);
    linesOf.get(part)!.push(line);
  }
  for (const item of rom.unpricedItems) {
    const part = partFor(item.costCode, undefined, has);
    partOf.set(item.costCode, part);
    unpricedOf.get(part)!.push(item);
  }
  const parts = drawn.map((part): PricedPart => {
    const lines = linesOf.get(part)!;
    const unpricedItems = unpricedOf.get(part)!;
    const total = lines.length > 0 ? lines.reduce((sum, line) => sum + midpoint(line), 0) : null;
    return {
      part,
      name: PART_NAMES[part],
      lines,
      unpricedItems,
      total,
      perGsf: total !== null && gsf ? total / gsf : null,
      source: weakest(lines.map((line) => clientSource(sourceOf(line).text))),
      math: [...lines.map(mathOf), ...unpricedItems.map((item) => `${titleCase(item.label)}: No Rate Yet`)],
      unpriced: total === null,
    };
  });
  const view = levelView(input.level ?? 3, rom, drawn, partOf, input.classifications ?? []);
  return { parts, total: midpoint(rom.total), view };
}

