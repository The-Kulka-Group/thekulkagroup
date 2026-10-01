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

/**
 * A proposal as the project saves it and the screen shows it.
 *
 * - `proposed`: the model compared the project with recorded jobs. A phase it
 *   could not support is still blank.
 * - `no_jobs`: the completed_jobs table is empty, so nothing was asked.
 * - `none_close`: no recorded job is close enough, so nothing was asked.
 */
export type ScheduleProposal = CheckedSchedule & {
  status: "proposed" | "no_jobs" | "none_close";
  /** The model that compared, for a `proposed` status. */
  model?: string;
  /** The date the proposal was made, YYYY-MM-DD. */
  proposedAt: string;
  /** The facts and jobs it was made from (scheduleInputKey). A different key means it is out of date. */
  inputKey: string;
};

const BLANK_PHASE = (reason: string): ProposedPhase => ({ weeks: null, jobNumbers: [], reason });

/**
 * The proposal when the model has nothing to compare with: an empty table, or
 * no recorded job close enough. Every phase is blank for the estimator. Null
 * when a close job exists, which is the only time the model is asked.
 */
export function proposalWithoutModel(
  facts: ScheduleFacts,
  jobs: readonly CompletedJob[],
  proposedAt: string,
): ScheduleProposal | null {
  const close = closeEnoughJobs(facts, jobs);
  if (close.length > 0) return null;
  const status = jobs.length === 0 ? "no_jobs" : "none_close";
  const reasoning =
    status === "no_jobs"
      ? "No completed job is recorded yet, so there is nothing to compare this project with. Enter the weeks."
      : "No recorded job is close enough to compare with. A job counts when it shares this project's type and construction kind, and its area and stories are within half to twice the project's. Enter the weeks.";
  const phase = BLANK_PHASE(reasoning);
  return {
    status,
    phases: { precon: phase, construction: phase, closeout: phase },
    jobs: [],
    reasoning,
    proposedAt,
    inputKey: scheduleInputKey(facts, close),
  };
}

/** A checked model answer as a saved proposal. */
export function proposalFromCheckedAnswer(
  checked: CheckedSchedule,
  made: { model: string; proposedAt: string; inputKey: string },
): ScheduleProposal {
  return {
    status: "proposed",
    phases: checked.phases,
    jobs: checked.jobs,
    reasoning: checked.reasoning,
    model: made.model,
    proposedAt: made.proposedAt,
    inputKey: made.inputKey,
  };
}

/**
 * A short fingerprint of what a proposal was made from: the project's facts
 * and each close job's size and recorded weeks. A saved proposal whose key
 * no longer matches is out of date and is made again.
 */
export function scheduleInputKey(facts: ScheduleFacts, closeJobs: readonly CompletedJob[]): string {
  const parts = [
    facts.projectType,
    facts.constructionKind,
    facts.grossSquareFeet,
    facts.storiesAboveGrade ?? "",
    ...closeJobs.map((job) =>
      [
        job.jobNumber,
        job.grossSquareFeet,
        job.storiesAboveGrade ?? "",
        ...SCHEDULE_PHASES.map((phase) => job.phases[phase]?.weeks ?? ""),
      ].join(","),
    ),
  ].join("|");
  // FNV-1a, 32 bits: short enough to store, and only compared for equality.
  let hash = 0x811c9dc5;
  for (let i = 0; i < parts.length; i += 1) {
    hash ^= parts.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** The rule name a proposed phase's figure carries as its `ref`. */
export const SCHEDULE_PROPOSAL_REF = "schedule-proposal";

/** A phase's proposed weeks as a plan figure with origin "proposed", or null where the proposal left it blank. */
export function proposedFigure(proposal: ScheduleProposal, phase: SchedulePhase): PlanFigure | null {
  const found = proposal.phases[phase];
  if (found.weeks === null) return null;
  const jobs = found.jobNumbers;
  let source = `Planning assumption from completed job${jobs.length === 1 ? "" : "s"} ${jobs.join(", ")}`;
  // A plan figure's source is at most 200 characters (lib/rom/resource-plan.ts).
  if (source.length > 200) source = `Planning assumption from ${jobs.length} completed jobs`;
  return { value: found.weeks, origin: "proposed", ref: SCHEDULE_PROPOSAL_REF, source };
}

/**
 * A plan's schedule with a proposal applied. A phase the estimator typed is
 * kept whatever the proposal says. Every other phase, blank or proposed
 * before, takes the proposal's figure, or goes blank where the proposal
 * leaves it blank, so an out-of-date figure never stays on the plan.
 */
export function applyScheduleProposal(
  current: Record<SchedulePhase, PlanFigure | null>,
  proposal: ScheduleProposal,
): Record<SchedulePhase, PlanFigure | null> {
  const next = {} as Record<SchedulePhase, PlanFigure | null>;
  for (const phase of SCHEDULE_PHASES) {
    const figure = current[phase];
    next[phase] = figure && figure.origin !== "proposed" ? figure : proposedFigure(proposal, phase);
  }
  return next;
}
