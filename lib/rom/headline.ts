import type { Rom } from "@kulka/engine";

// The ROM's headline figure, shared by the ROM screen (app/(app)/rom/block-layout.ts)
// and the underwriting fill (lib/underwriting/rom-link.ts, LA-2417) so the two never disagree.

export type Range = { low: number; high: number };

export function midpoint(range: Range): number {
  return (range.low + range.high) / 2;
}

/** Total project cost with markups, or trade cost on a ROM computed without them. */
export function headlineRange(rom: Rom): Range {
  return rom.markups ? rom.markups.totalProjectCost : rom.total;
}
