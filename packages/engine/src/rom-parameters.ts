// What the engine refuses in its parameters, stated once (LA-866).
//
// rom.ts's readTiers and weightFor throw on the first problem they meet, and
// the Engine Parameters screen and its save path show every problem beside the
// value it belongs to. Both read the rules from here, so the screen cannot
// accept a value the next run would refuse, or refuse one the run would take.

import { markupRateProblem } from "./rom-markups";
import type { ParameterName } from "./rom";

/** Every name the engine reads, in the order the screen shows them. */
export const PARAMETER_NAMES: readonly ParameterName[] = [
  "weight.actuals",
  "weight.proest_budget",
  "weight.reviewed_judgment",
  "weight.llm_proposal",
  "flag.high_min_comparables",
  "flag.medium_min_comparables",
  "spread.high",
  "spread.medium",
  "spread.low",
  "fee.rate",
  "insurance.rate",
];

/** One refused value, with the reason in words a person can act on. */
export type ParameterProblem = { name: ParameterName; message: string };

/**
 * A blend weight must be above zero. The engine refuses a zero weight on any
 * kind a line blends, since a figure that counts for nothing would still be
 * listed as a comparable and still move the flag.
 */
export function weightProblem(value: number): string | null {
  return value > 0 ? null : "Use a weight above zero.";
}

/**
 * The flag thresholds and range widths, read through `value` so a caller with
 * a partial set can still ask. Every value is assumed finite; a missing or
 * non-finite one is the caller's to report first.
 */
export function tierProblems(value: (name: ParameterName) => number): ParameterProblem[] {
  const problems: ParameterProblem[] = [];
  const high = value("flag.high_min_comparables");
  const medium = value("flag.medium_min_comparables");

  for (const [name, count] of [
    ["flag.high_min_comparables", high],
    ["flag.medium_min_comparables", medium],
  ] as const) {
    if (!Number.isInteger(count) || count < 1) {
      problems.push({ name, message: "Use a whole number of 1 or more." });
    }
  }
  if (high < medium) {
    problems.push({
      name: "flag.high_min_comparables",
      message: "High cannot need fewer comparables than Medium.",
    });
  }

  const spread = {
    high: value("spread.high"),
    medium: value("spread.medium"),
    low: value("spread.low"),
  };
  for (const flag of ["high", "medium", "low"] as const) {
    if (!(spread[flag] > 0 && spread[flag] < 1)) {
      problems.push({ name: `spread.${flag}`, message: "Use a percent above 0 and below 100." });
    }
  }
  // A range may not narrow as confidence drops.
  if (spread.high > spread.medium) {
    problems.push({ name: "spread.medium", message: "Medium cannot be narrower than High." });
  }
  if (spread.medium > spread.low) {
    problems.push({ name: "spread.low", message: "Low cannot be narrower than Medium." });
  }
  return problems;
}

/**
 * Every problem in a full set of values, for a screen or a save that is about
 * to make them current. Unlike a run, which only needs the weight of a kind it
 * actually blends, a saved set has to hold for every run after it, so every
 * name is checked.
 */
export function parameterProblems(values: Partial<Record<ParameterName, number>>): ParameterProblem[] {
  const problems: ParameterProblem[] = [];
  for (const name of PARAMETER_NAMES) {
    const value = values[name];
    if (value === undefined) problems.push({ name, message: "No value is recorded." });
    else if (!Number.isFinite(value)) problems.push({ name, message: "Use a number." });
  }
  if (problems.length > 0) return problems;

  const read = (name: ParameterName) => values[name]!;
  for (const name of PARAMETER_NAMES) {
    if (!name.startsWith("weight.")) continue;
    const message = weightProblem(read(name));
    if (message) problems.push({ name, message });
  }
  problems.push(...tierProblems(read));
  for (const name of ["fee.rate", "insurance.rate"] as const) {
    if (markupRateProblem(read(name))) {
      problems.push({ name, message: "Use a percent from 0 up to 100." });
    }
  }
  return problems;
}
