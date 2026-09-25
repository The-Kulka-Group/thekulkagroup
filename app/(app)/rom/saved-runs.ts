import type { Rom } from "@kulka/engine";

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
  startedAt: string | null;
};

/** How many saved runs the strip shows. The rest are one click away on R-110. */
export const STRIP_RUNS = 8;

export function loadedRunFrom(record: RunRecord): LoadedRun | null {
  if (!record.rom) return null;
  return {
    runId: record.id,
    rom: record.rom,
    projectName: record.projectName,
    grossSquareFeet: record.answers?.grossSquareFeet ?? null,
    startedAt: record.startedAt,
  };
}

/** This project's finished runs, newest first. A failed run has no ROM to load. */
export function savedRunsFor(runs: RunSummary[], projectId: string | undefined): RunSummary[] {
  if (!projectId) return [];
  return runs
    .filter((run) => run.projectId === projectId && run.status === "succeeded")
    .slice(0, STRIP_RUNS);
}
