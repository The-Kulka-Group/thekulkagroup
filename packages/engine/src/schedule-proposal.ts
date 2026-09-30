// The proposed schedule (LA-1399, spec LA-1394). Matt, 2026-09-29, answering
// LA-1394 question 1: precon, construction and close-out weeks come from
// Kulka's own completed jobs, with AI comparing the new project to them and
// estimating each phase.
//
// This file holds every deterministic part, as pure functions:
//
// - which recorded jobs are close enough to the project to compare with at all
//   (closeEnoughJobs). With none, nothing is asked and the weeks stay blank;
// - checking the model's answer (validateModelSchedule). It may cite only the
//   jobs it was handed, and every week figure must be a positive number that a
//   cited job's recorded weeks can support. Anything else rejects the answer;
// - applying a proposal to a plan's schedule (applyScheduleProposal) with
//   origin "proposed", keeping every phase the estimator typed.
//
// The model call itself is a thin seam in lib/rom/schedule-proposal.ts. It
// never reads drawings: the model sees only the project's stated facts and
// the recorded jobs.

import type { PlanFigure, SchedulePhase } from "./resource-plan";
import { SCHEDULE_PHASES } from "./resource-plan";

/** One phase of a completed job as recorded: its weeks and where they came from. */
export type CompletedJobPhase = { weeks: number; source: string };

/** A job Kulka finished, as the completed_jobs table records it. */
export type CompletedJob = {
  /** Kulka's job number, such as C-00456. Unique in the table. */
  jobNumber: string;
  name: string;
  /** The same words as a project's type, such as multifamily or self_storage. */
  buildingType: string;
  constructionKind: "new" | "renovation";
  grossSquareFeet: number;
  storiesAboveGrade: number | null;
  /** Null where the phase's dates or weeks are not recorded. */
  phases: Record<SchedulePhase, CompletedJobPhase | null>;
};

/** The project facts the comparison reads. */
export type ScheduleFacts = {
  projectType: string;
  constructionKind: "new" | "renovation";
  grossSquareFeet: number;
  storiesAboveGrade: number | null;
};

/**
 * How near a recorded job has to be before the model may compare the project
 * with it. Set by LA-1399 for Matt to confirm once real jobs are recorded:
 * the same building type and construction kind, gross area within twice or
 * half the project's, and stories within twice or half where both are known.
 * A job outside these is never sent to the model.
 */
export const CLOSE_ENOUGH = { maxAreaRatio: 2, maxStoriesRatio: 2 } as const;

function ratio(a: number, b: number): number {
  return Math.max(a, b) / Math.min(a, b);
}

/** The recorded jobs close enough to the project to compare with, in table order. */
export function closeEnoughJobs(facts: ScheduleFacts, jobs: readonly CompletedJob[]): CompletedJob[] {
  if (!(facts.grossSquareFeet > 0)) return [];
  return jobs.filter((job) => {
    if (job.buildingType !== facts.projectType) return false;
    if (job.constructionKind !== facts.constructionKind) return false;
    if (!(job.grossSquareFeet > 0) || ratio(job.grossSquareFeet, facts.grossSquareFeet) > CLOSE_ENOUGH.maxAreaRatio) {
      return false;
    }
    const a = facts.storiesAboveGrade;
    const b = job.storiesAboveGrade;
    if (a !== null && b !== null && a > 0 && b > 0 && ratio(a, b) > CLOSE_ENOUGH.maxStoriesRatio) return false;
    return SCHEDULE_PHASES.some((phase) => job.phases[phase] !== null);
  });
}

/** One phase of a checked proposal. Null weeks means the model left it for the estimator. */
export type ProposedPhase = { weeks: number | null; jobNumbers: string[]; reason: string };

/** A recorded job the model compared the project with, and why. */
export type ComparedJob = { jobNumber: string; name: string; why: string };

export type CheckedSchedule = {
  phases: Record<SchedulePhase, ProposedPhase>;
  jobs: ComparedJob[];
  reasoning: string;
};

/**
 * How far a proposed phase may sit from the recorded weeks of the jobs it
 * cites: from half the shortest to twice the longest. A figure outside that
 * band has no recorded job behind it, so the answer is rejected. Set by
 * LA-1399 as a guard, for Matt to confirm.
 */
export const SUPPORTED_BAND = { low: 0.5, high: 2 } as const;

const MAX_TEXT = 500;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_TEXT);
}

const PHASE_WORDS: Record<SchedulePhase, string> = { precon: "Precon", construction: "Construction", closeout: "Close-out" };

/**
 * Checks the model's answer against the jobs it was handed. Any part that
 * does not hold rejects the whole answer, so a half-right proposal never
 * reaches a budget.
 */
export function validateModelSchedule(
  raw: unknown,
  candidates: readonly CompletedJob[],
): ({ ok: true } & CheckedSchedule) | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!isObject(raw)) return fail("The answer was not an object.");
  const byNumber = new Map(candidates.map((job) => [job.jobNumber, job]));

  if (!Array.isArray(raw.jobs)) return fail("The answer named no compared jobs.");
  const jobs: ComparedJob[] = [];
  for (const entry of raw.jobs) {
    if (!isObject(entry)) return fail("A compared job was not an object.");
    const number = typeof entry.jobNumber === "string" ? entry.jobNumber.trim() : "";
    const job = byNumber.get(number);
    if (!job) return fail(`The answer cites ${number || "a job"}, which is not among the recorded jobs it was given.`);
    if (jobs.some((one) => one.jobNumber === number)) return fail(`The answer lists ${number} twice.`);
    const why = text(entry.why);
    if (!why) return fail(`The answer gives no reason for comparing ${number}.`);
    jobs.push({ jobNumber: number, name: job.name, why });
  }
  const compared = new Set(jobs.map((job) => job.jobNumber));

  if (!isObject(raw.phases)) return fail("The answer has no phases.");
  const phases = {} as Record<SchedulePhase, ProposedPhase>;
  for (const phase of SCHEDULE_PHASES) {
    const entry = raw.phases[phase];
    const words = PHASE_WORDS[phase];
    if (!isObject(entry)) return fail(`The answer has no ${words.toLowerCase()} phase.`);
    const reason = text(entry.reason);
    if (!reason) return fail(`${words} has no reason.`);
    if (!Array.isArray(entry.jobNumbers) || entry.jobNumbers.some((n) => typeof n !== "string")) {
      return fail(`${words} does not list its jobs.`);
    }
    const cited = [...new Set((entry.jobNumbers as string[]).map((n) => n.trim()))];
    const stray = cited.find((n) => !compared.has(n));
    if (stray) return fail(`${words} cites ${stray}, which the answer did not compare.`);

    if (entry.leaveBlank === true) {
      phases[phase] = { weeks: null, jobNumbers: cited, reason };
      continue;
    }
    if (entry.leaveBlank !== false) return fail(`${words} does not say whether it is left blank.`);
    if (typeof entry.weeks !== "number" || !Number.isFinite(entry.weeks)) return fail(`${words} weeks is not a number.`);
    const weeks = Math.round(entry.weeks);
    if (!(weeks >= 1)) return fail(`${words} weeks must be a positive number.`);
    if (cited.length === 0) return fail(`${words} weeks cite no recorded job.`);
    const recorded: number[] = [];
    for (const number of cited) {
      const found = byNumber.get(number)!.phases[phase];
      if (!found) return fail(`${words} cites ${number}, which has no ${words.toLowerCase()} weeks recorded.`);
      recorded.push(found.weeks);
    }
    const low = Math.min(...recorded) * SUPPORTED_BAND.low;
    const high = Math.max(...recorded) * SUPPORTED_BAND.high;
    if (weeks < low || weeks > high) {
      return fail(`${words} at ${weeks} weeks is outside what its cited jobs recorded (${low} to ${high} weeks).`);
    }
    phases[phase] = { weeks, jobNumbers: cited, reason };
  }

  const reasoning = text(raw.reasoning);
  if (!reasoning) return fail("The answer gives no reasoning.");
  return { ok: true, phases, jobs, reasoning };
}
