// Estimator confidence (LA-2967). Jesse Snizek scored Kulka's ProEst
// estimates from 1 to 10 for how well each shows the job's full cost
// (2026-10-15). A 1 is a quick takeoff that does not show the full project
// cost, and he asked that those count as zero.
//
// So a ProEst budget figure counts its job's score over 10 of its kind's
// weight, and a figure whose job sits at or below the cutoff stays out of the
// blend. Autodesk actuals are what a job cost, not an estimate of it, so the
// score never touches them. A job nobody has scored keeps its full weight,
// which is how every ROM computed before this ticket reads.
//
// Pure, like rom-framing.ts: the caller hands over each past job's score, and
// this file only reads it.

import type { ProvenanceKind } from "./rom";

/** The top of the scale Jesse scored on. A 10 counts the full weight of its kind. */
export const CONFIDENCE_SCALE = 10;

/**
 * The score that applies to one figure, or null when none does. Only a ProEst
 * budget figure reads a score. A figure resting on more than one job reads the
 * lowest score among them, since a blend is only as sound as its weakest
 * estimate; a job with no score adds nothing to that reading.
 */
export function confidenceScoreOf(
  kind: ProvenanceKind,
  sourceProjectIds: readonly string[],
  scores: Readonly<Record<string, number>>,
): number | null {
  if (kind !== "proest_budget") return null;
  const scored = sourceProjectIds.map((id) => scores[id]).filter((score): score is number => score !== undefined);
  return scored.length > 0 ? Math.min(...scored) : null;
}

/** What share of its kind's weight a figure keeps. */
export function confidenceFactor(score: number | null): number {
  return score === null ? 1 : score / CONFIDENCE_SCALE;
}

/** Why one figure stays out of the blend, or null when it goes in. */
export function confidenceExclusionReason(score: number | null, cutoff: number): string | null {
  if (score === null || score > cutoff) return null;
  return `The estimator scored the ProEst budget behind this figure ${score} of ${CONFIDENCE_SCALE}, at or below the cutoff of ${cutoff}, so it stays out of the blend.`;
}
