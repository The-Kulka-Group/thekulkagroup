import type { BenchmarkUnit, QuantityRule } from "@kulka/engine";

// LA-1257. How a supporting item is counted (scope_relationships.quantity_rule)
// decides the unit its rate prices on and how the rate panel words it. The
// demolition disconnects come one per structure coming down; the Elevator
// element's items come one per elevator or one per stop.

export type RuleBasis = {
  unit: Extract<BenchmarkUnit, "usd_each_structure" | "usd_each_elevator" | "usd_per_stop">;
  /** The rate field's label: "Dollars Each, per Structure". */
  fieldLabel: string;
  /** How many come in, after the driver's name: "one for each structure coming down". */
  count: string;
  /** The unit after a figure: "each" or "per stop". */
  per: string;
};

const BASES: Record<QuantityRule, RuleBasis> = {
  one_per_structure: {
    unit: "usd_each_structure",
    fieldLabel: "Dollars Each, per Structure",
    count: "one for each structure coming down",
    per: "each",
  },
  one_per_elevator: {
    unit: "usd_each_elevator",
    fieldLabel: "Dollars Each, per Elevator",
    count: "one for each elevator",
    per: "each",
  },
  one_per_stop: {
    unit: "usd_per_stop",
    fieldLabel: "Dollars per Stop",
    count: "one for each elevator stop",
    per: "per stop",
  },
};

export function isQuantityRule(value: string): value is QuantityRule {
  return value in BASES;
}

export function basisFor(rule: QuantityRule): RuleBasis {
  return BASES[rule];
}
