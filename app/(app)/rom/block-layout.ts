import type { MarkupLine, Rom, RomLine } from "@kulka/engine";

// LA-1101. What the Round 14 block layout on /rom reads off a finished ROM.
// Every figure here is one the engine already made. The only arithmetic is the
// midpoint of a range, which is the figure the engine's own backtest scores a
// ROM on (packages/engine/src/backtest.ts), and a bar's share of the biggest
// block. Nothing here prices anything.

export type Range = { low: number; high: number };

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

export function midpoint(range: Range): number {
  return (range.low + range.high) / 2;
}

/**
 * A line becomes a block when it adds to the total. A breakout is already
 * inside its parent's rate, and a line a scope answer zeroed ("no" or "don't
 * know") is priced at nothing, so neither gets a block of its own. Both still
 * show: breakouts in their parent's panel, zeroed lines in the scope notes.
 */
export function addsToTotal(line: RomLine): boolean {
  if (line.breakoutOf !== null) return false;
  if (line.gateStatus === "not_in_job" || line.gateStatus === "tbd") return false;
  return true;
}

function statusOf(line: RomLine): BlockStatus | null {
  if (line.heldForReview) return { tone: "stuck", word: "Held for review" };
  if (line.gateStatus === "assumed_present") return { tone: "working", word: "Assumed present" };
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
  label: string;
  /** Says what the figure includes, for the total panel. */
  includes: string;
  midpoint: number;
  low: number;
  high: number;
  /** Short names of the markup lines with nothing behind them, left out of the total. */
  tbd: string[];
};

/**
 * With markups, the total is Kulka's contract with GRs/GCs, fee and insurance,
 * plus any owner-direct scope (CONTEXT.md: Total project cost). A run recorded
 * before LA-1016 has no markups, so its headline is trade cost and says so.
 */
export function headlineOf(rom: Rom): Headline {
  const markups = rom.markups;
  if (!markups) {
    return {
      label: "Trade cost",
      includes: "trade cost, before GRs/GCs, fee and insurance",
      midpoint: midpoint(rom.total),
      low: rom.total.low,
      high: rom.total.high,
      tbd: [],
    };
  }
  const owner = markups.ownerDirect.low > 0 || markups.ownerDirect.high > 0;
  const lines: [MarkupLine, string][] = [
    [markups.generalConditions, "GRs/GCs"],
    [markups.fee, "Fee"],
    [markups.insurance, "Insurance"],
  ];
  return {
    label: owner ? "Total project cost" : "Total",
    includes: owner
      ? "Kulka's contract with GRs/GCs, fee and insurance, plus owner-direct scope"
      : "with GRs/GCs, fee and insurance",
    midpoint: midpoint(markups.totalProjectCost),
    low: markups.totalProjectCost.low,
    high: markups.totalProjectCost.high,
    tbd: lines.filter(([line]) => line.tbd).map(([, name]) => name),
  };
}

/** Dollars per gross square foot, or null when the run's area is not known. */
export function perSquareFoot(amount: number, grossSquareFeet: number | null): number | null {
  return grossSquareFeet && grossSquareFeet > 0 ? amount / grossSquareFeet : null;
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
