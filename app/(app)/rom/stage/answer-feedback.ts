import type { PartPriceMap } from "@/lib/rom/part-prices";
import type { StagePart } from "@/lib/rom/stage-scenes";

import { shortMoney } from "../block-layout";

// LA-2213 (spec LA-2209): what an answer changed on the building. The part
// price map before and after an answer says which parts' lines moved; the
// stage pulses those parts once. The chip and the running line say how much.
// All pure: no clock, no DOM.

/** Dollars a part's total must move before it counts as changed; a rerun with the same lines moves it by nothing. */
const MIN_MOVE = 1;

/** The parts whose total changed between two pricings, in assembly order. Nothing to compare with names nothing. */
export function changedParts(before: PartPriceMap | null, after: PartPriceMap, min = MIN_MOVE): StagePart[] {
  if (!before) return [];
  const was = new Map(before.parts.map((one) => [one.part, one.total]));
  const now = new Map(after.parts.map((one) => [one.part, one.total]));
  const order = [...after.parts, ...before.parts].map((one) => one.part);
  const seen = new Set<StagePart>();
  const changed: StagePart[] = [];
  for (const part of order) {
    if (seen.has(part)) continue;
    seen.add(part);
    const a = was.get(part) ?? null;
    const b = now.get(part) ?? null;
    if (a === null && b === null) continue;
    if (a === null || b === null || Math.abs(b - a) >= min) changed.push(part);
  }
  return changed;
}

/** "+$472k" or "−$1.45M": the change in dollars, signed. */
export function answerChip(amount: number): string {
  return `${amount < 0 ? "−" : "+"}${shortMoney(Math.abs(amount))}`;
}

/** "−$1.45M From Answers · Started at $17.31M": the change since the session's first total. */
export function runningLine(started: number, now: number): string {
  const amount = now - started;
  const change = Math.abs(amount) < 1 ? "No Change" : answerChip(amount);
  return `${change} From Answers · Started at ${shortMoney(started)}`;
}
