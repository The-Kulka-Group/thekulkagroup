import type { Rom } from "@kulka/engine";

import type { Responses } from "./question-flow";

// LA-1324. Matt, 2026-09-28: a box that a Design and Engineering card decides
// shows Designing, with no figure, until that card's moment has played on
// the stage, and then its number counts up. No design-linked price shows
// before its moment. That holds for the Elevator (V-1 decides its type),
// Concrete and deep foundations (S-1), HVAC (M-1) and Electrical (E-1).
//
// A card is only waited on when New Budget will play it, by the same tests
// GuidedNewBudget uses to play the card, so a job no card comes for never
// sits on Designing. The held lines stay on the field (as Designing) but come
// out of the total until they land.

type Hold = {
  code: string;
  /** The cost codes whose boxes wait on the card. */
  holds: (costCode: string) => boolean;
  /** Whether New Budget will play the card for these answers. */
  due: (responses: Responses) => boolean;
};

const multifamily = (r: Responses) => r.project_type === "multifamily";
const positive = (value: string | undefined) => Number(value) > 0;

const HOLDS: readonly Hold[] = [
  {
    // Item 26 and every supporting item in the Elevator element (26a to 26i).
    code: "V-1",
    holds: (c) => /^26[a-z]?$/.test(c),
    due: (r) => r.elevator === "yes" && positive(r.elevator_count) && positive(r.stories_above_grade),
  },
  {
    // Item 2, foundations, footings and slab (the Concrete box), and 34a, deep foundations.
    code: "S-1",
    holds: (c) => c === "2" || c === "34a",
    due: (r) => multifamily(r) && positive(r.stories_above_grade),
  },
  { code: "M-1", holds: (c) => c === "30", due: multifamily },
  {
    // NEC 220.84 starts at three units a building, the same test E-1 runs.
    code: "E-1",
    holds: (c) => c === "31",
    due: (r) => {
      const buildings = positive(r.building_count) ? Number(r.building_count) : 1;
      return multifamily(r) && positive(r.unit_count) && Math.ceil(Number(r.unit_count) / buildings) >= 3;
    },
  },
];

/** The cards whose boxes still wait: due for these answers and not yet landed on the stage. */
export function heldCards(responses: Responses, landed: ReadonlySet<string>): string[] {
  return HOLDS.filter((hold) => hold.due(responses) && !landed.has(hold.code)).map((hold) => hold.code);
}

/** Whether a cost code's box waits on one of these cards. */
export function holdsCostCode(cards: readonly string[]): (costCode: string) => boolean {
  const waiting = HOLDS.filter((hold) => cards.includes(hold.code));
  return (costCode) => waiting.some((hold) => hold.holds(costCode));
}

/**
 * The ROM with held lines taken out of its trade totals, so the header shows
 * nothing a card has yet to decide. The lines stay, for the field to show as
 * Designing. A ROM that already carries markups (the last step, after every
 * card has played) is returned as it is, since its markups were worked out
 * on the full subtotal.
 */
export function holdBack(rom: Rom, held: (costCode: string) => boolean): Rom {
  if (rom.markups) return rom;
  const out = rom.lines.filter(
    (l) =>
      held(l.costCode) &&
      l.breakoutOf === null &&
      l.gateStatus !== "not_in_job" &&
      l.gateStatus !== "tbd" &&
      l.framing?.status !== "no_match",
  );
  if (out.length === 0) return rom;
  const less = (range: { low: number; high: number }, lines: typeof out) => ({
    low: range.low - lines.reduce((sum, l) => sum + l.low, 0),
    high: range.high - lines.reduce((sum, l) => sum + l.high, 0),
  });
  return {
    ...rom,
    total: less(rom.total, out),
    kulkaContractTotal: less(rom.kulkaContractTotal, out.filter((l) => l.contractSide === "kulka")),
  };
}
