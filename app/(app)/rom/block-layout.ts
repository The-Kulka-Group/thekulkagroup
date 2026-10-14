import { overheadLines, type GateItemSummary, type MarkupLine, type Rom, type RomLine } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import { headlineRange, midpoint, type Range } from "@/lib/rom/headline";

// LA-1101. What the Round 14 block layout on /rom reads off a finished ROM.
// Every figure here is one the engine already made. The only arithmetic is the
// midpoint of a range, which is the figure the engine's own backtest scores a
// ROM on (packages/engine/src/backtest.ts), and a bar's share of the biggest
// block. Nothing here prices anything.

export { midpoint, type Range };

/** A status the engine itself set on a line, shown as a dot plus a word. */
export type BlockStatus = { tone: "stuck" | "working"; word: string };

/** One trade on the board: one ROM line that adds to the total. */
export type TradeBlock = {
  costCode: string;
  label: string;
  low: number;
  high: number;
  midpoint: number;
  /** The block's midpoint over the biggest block's, from 0 to 1, for the bar. */
  share: number;
  /** Only a held line or an unanswered scope question carries one. */
  status: BlockStatus | null;
  /** Bought by the owner direct, so it sits outside Kulka's contract. */
  ownerDirect: boolean;
  line: RomLine;
  /** Breakouts carved out of this line. They add nothing; the rate already holds them. */
  breakouts: RomLine[];
};

/**
 * A line becomes a block when it adds to the total. A breakout is already
 * inside its parent's rate, and a line a scope answer zeroed ("no" or "don't
 * know") is priced at nothing, so neither gets a block of its own. Both still
 * show: breakouts in their parent's panel, zeroed lines in the scope notes.
 */
export function addsToTotal(line: RomLine): boolean {
  if (line.breakoutOf !== null) return false;
  if (line.gateStatus === "not_in_job" || line.gateStatus === "tbd") return false;
  // LA-1103: no past job framed like this project, so the line has no figure.
  if (line.framing?.status === "no_match") return false;
  return true;
}

function statusOf(line: RomLine): BlockStatus | null {
  if (line.heldForReview) return { tone: "stuck", word: "Held for Review" };
  if (line.gateStatus === "assumed_present") return { tone: "working", word: "Assumed Present" };
  return null;
}

/** One block per trade, biggest first. */
export function tradeBlocks(rom: Rom): TradeBlock[] {
  const lines = rom.lines.filter(addsToTotal);
  const biggest = Math.max(0, ...lines.map((line) => midpoint(line)));

  return lines
    .map((line) => {
      const mid = midpoint(line);
      return {
        costCode: line.costCode,
        label: line.label,
        low: line.low,
        high: line.high,
        midpoint: mid,
        share: biggest > 0 ? mid / biggest : 0,
        status: statusOf(line),
        ownerDirect: line.contractSide === "owner",
        line,
        breakouts: rom.lines.filter((other) => other.breakoutOf === line.costCode),
      };
    })
    .sort((a, b) => b.midpoint - a.midpoint || a.label.localeCompare(b.label));
}

/** The figure in the black header band, and what it counts. */
export type Headline = {
  /** Total, or Total project cost with owner-direct scope. Never trade cost (LA-1334). */
  label: string;
  /** Says what the figure includes, under the label and in the total panel. */
  includes: string;
  midpoint: number;
  low: number;
  high: number;
  /** Short names of the markup lines with nothing behind them, left out of the total. */
  tbd: string[];
  /**
   * LA-1337: the scope answered Don't Know, by name, drivers first. It sits
   * outside the figure (ADR 0006); nothing here adds it back.
   */
  tbdScope: string[];
  /** How many trades add to the figure, for New Budget's count. */
  pricedTrades: number;
  /** The midpoint over the gross area, or null when the area is not known. */
  perGrossSquareFoot: number | null;
  /** The midpoint over the unit count, or null when the project has none. */
  perUnit: number | null;
};

/** What the headline needs beside the ROM, all of which a run already records. */
export type HeadlineFacts = {
  grossSquareFeet: number | null;
  unitCount: number | null;
  /** New Budget, still asking: a figure without markups is trade cost so far. */
  live?: boolean;
  /**
   * The TBD scope to name, when it comes from another ROM than the figure.
   * New Budget prices the scope it knows but reads Don't Know answers off
   * the ROM of every answer so far. Defaults to the figure's own ROM.
   */
  tbdScope?: GateItemSummary[];
};

/**
 * The one place that decides what the header says, for New Budget and a saved
 * budget alike. With markups, the total is Kulka's contract with GRs/GCs, fee
 * and insurance, plus any owner-direct scope (GLOSSARY.md: Total project cost).
 * The line under the label names only the markups that are in it (LA-1369).
 * Without them, which is New Budget before its markup questions or a run
 * recorded before LA-1016, the figure is trade cost, and the line under the
 * label says so rather than the label changing.
 */
/** "a", "a and b", "a, b and c". Empty for none. */
export function listWords(words: string[]): string {
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function headlineOf(rom: Rom, facts: HeadlineFacts): Headline {
  const markups = rom.markups;
  const owner = markups ? markups.ownerDirect.low > 0 || markups.ownerDirect.high > 0 : false;
  const range = headlineRange(rom);
  const mid = midpoint(range);
  const lines: [MarkupLine, string][] = markups
    ? [
        // LA-1383: a split budget names General Requirements and General Conditions apart.
        ...overheadLines(markups).map(({ name, line }): [MarkupLine, string] => [line, name]),
        [markups.fee, "Fee"],
        [markups.insurance, "Insurance"],
      ]
    : [];
  // LA-1369: the includes line names only the markups in the total. A TBD
  // markup sits outside it, and its own chip says so.
  const included = listWords(
    lines.filter(([line]) => !line.tbd).map(([, name]) => (name === "Fee" || name === "Insurance" ? name.toLowerCase() : name)),
  );
  const contract = included ? `with ${included}` : "before GRs/GCs, fee and insurance";
  return {
    label: owner ? "Total project cost" : "Total",
    includes: !markups
      ? facts.live
        ? "trade cost so far"
        : "trade cost only, before GRs/GCs, fee and insurance"
      : owner
        ? `Kulka's contract ${contract}, plus owner-direct scope`
        : contract,
    midpoint: mid,
    low: range.low,
    high: range.high,
    tbd: lines.filter(([line]) => line.tbd).map(([, name]) => name),
    tbdScope: [...(facts.tbdScope ?? rom.tbdGateItems ?? [])]
      .sort((a, b) => Number(Boolean(a.driverCostCode)) - Number(Boolean(b.driverCostCode)))
      .map((item) => titleCase(item.label)),
    pricedTrades: rom.lines.filter(addsToTotal).length,
    perGrossSquareFoot: perSquareFoot(mid, facts.grossSquareFeet),
    perUnit: facts.unitCount && facts.unitCount > 0 ? mid / facts.unitCount : null,
  };
}

/** Dollars per gross square foot, or null when the run's area is not known. */
export function perSquareFoot(amount: number, grossSquareFeet: number | null): number | null {
  return grossSquareFeet && grossSquareFeet > 0 ? amount / grossSquareFeet : null;
}

/** The header's rates beside the range: "$75/GSF · $82k/unit", or null with neither. */
export function headlineRates(headline: Pick<Headline, "perGrossSquareFoot" | "perUnit">): string | null {
  const parts = [
    headline.perGrossSquareFoot !== null ? `$${Math.round(headline.perGrossSquareFoot).toLocaleString("en-US")}/GSF` : null,
    headline.perUnit !== null ? `${shortMoney(headline.perUnit)}/unit` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** How many named before the rest are counted. */
const TBD_NAMED = 3;

/**
 * The chip on the total when scope is TBD: "Excludes 2 TBD: Concrete,
 * Sitework". Past three names the rest are counted. Null with none.
 */
export function tbdScopeWords(names: string[]): string | null {
  if (names.length === 0) return null;
  const named = names.slice(0, TBD_NAMED).join(", ");
  const rest = names.length - TBD_NAMED;
  return `Excludes ${names.length} TBD: ${named}${rest > 0 ? ` +${rest} More` : ""}`;
}

/**
 * New Budget's count under the total: "5 trades priced". It follows the
 * includes line, which already says "so far" where the figure is partial.
 */
export function pricedTradesWords(count: number): string {
  return `${count} ${count === 1 ? "trade" : "trades"} priced`;
}

/** A block's figure: $4.21M, $640k, $8.5k. */
export function shortMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const a = Math.abs(value);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sign}$${Math.round(a / 1e3)}k`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return `${sign}$${Math.round(a)}`;
}

/**
 * The header figure in millions, with as many decimals as the range can bear:
 * a range a million wide gets one, narrower ranges get more. Under a million
 * it falls back to the block format.
 */
export function headlineMoney(value: number, range: Range): string {
  if (Math.abs(value) < 1e6) return shortMoney(value);
  const half = (range.high - range.low) / 2;
  const decimals = half >= 1e6 ? 1 : half >= 1e5 ? 2 : 3;
  return `$${(value / 1e6).toFixed(decimals)}M`;
}

/** The block figure's type size, by its share of the biggest block. */
export function valueTier(share: number): "v1" | "v2" | "v3" | "v4" {
  if (share >= 0.5) return "v1";
  if (share >= 0.25) return "v2";
  if (share >= 0.1) return "v3";
  return "v4";
}
