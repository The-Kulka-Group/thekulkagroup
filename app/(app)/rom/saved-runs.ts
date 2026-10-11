import { readUnitCount, type Rom } from "@kulka/engine";

import type { RunRecord, RunSummary } from "@/lib/rom/run-records";

// LA-1101. The saved-runs strip on /rom and the run it opens on. Plain
// functions, so the server page and the client view share them.

/** A finished run on screen. */
export type LoadedRun = {
  runId: string;
  rom: Rom;
  projectName: string | null;
  /** The area the run was computed on, for $/SF. Null when the record has no answers. */
  grossSquareFeet: number | null;
  /** The unit count the run was computed on, for $/unit. Null when nobody gave one. */
  unitCount: number | null;
  startedAt: string | null;
  /** How many questions the run's flow recorded, or null for a run with no flow. */
  answerCount: number | null;
  /** LA-2209 review S1: the facts the run recorded, such as the balcony type the project record does not keep. */
  facts?: Record<string, string | number | boolean>;
};

const STAMP = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });
const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });

/**
 * LA-1335. A run's name on screen: when it started, and how many questions
 * its flow recorded, "Sep 28, 11:55 PM · 14 answers". A run with no flow
 * (one run off the project record) has the date and time only. The id is
 * not part of the name; the screens keep it on hover for support.
 */
export function runName(startedAt: string, answerCount: number | null): string {
  const started = new Date(startedAt);
  const when = `${STAMP.format(started)}, ${CLOCK.format(started)}`;
  if (answerCount === null) return when;
  return `${when} · ${answerCount} ${answerCount === 1 ? "answer" : "answers"}`;
}

/** How many saved runs the strip shows. The rest are one click away on R-110. */
export const STRIP_RUNS = 8;

export function loadedRunFrom(record: RunRecord): LoadedRun | null {
  if (!record.rom) return null;
  return {
    runId: record.id,
    rom: record.rom,
    projectName: record.projectName,
    grossSquareFeet: record.answers?.grossSquareFeet ?? null,
    unitCount: readUnitCount(record.answers?.facts),
    startedAt: record.startedAt,
    answerCount: record.answerCount,
    facts: record.answers?.facts,
  };
}

/**
 * Runs closer together than this are one burst of edits. Run Settings and
 * Edit Project record a run on every change (LA-1227, LA-1240), so a few
 * quick edits leave a row of near-copies.
 */
export const BURST_MS = 2 * 60 * 1000;

/**
 * This project's finished runs, newest first, showing only the last run of
 * each burst (Matt, 2026-09-28). A run is left off the strip when a newer
 * one started within BURST_MS of it. Nothing is deleted: every run stays in
 * the database and on the runs page, since runs are the audit trail. A
 * failed run has no ROM to load.
 */
export function savedRunsFor(runs: RunSummary[], projectId: string | undefined): RunSummary[] {
  if (!projectId) return [];
  const finished = runs.filter((run) => run.projectId === projectId && run.status === "succeeded");
  return finished
    .filter((run, index) => {
      const newer = finished[index - 1];
      return !newer || Date.parse(newer.startedAt) - Date.parse(run.startedAt) > BURST_MS;
    })
    .slice(0, STRIP_RUNS);
}
