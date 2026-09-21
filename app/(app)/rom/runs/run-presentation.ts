import type { RunStatus } from "@/lib/rom/run-records";

// Words and colours the two run screens share. The chip classes are the
// Daylight ones (daylight.css section 8), so a run reads the same way every
// other status on the site does.

export const RUN_STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
};

export const RUN_STATUS_CHIP: Record<RunStatus, string> = {
  running: "working",
  succeeded: "done",
  failed: "stuck",
};

/** The steps lib/rom/run.ts records, in plain words. */
const STEP_LABEL: Record<string, string> = {
  read_answers: "Read the project answers",
  read_benchmarks: "Read the benchmarks",
  read_parameters: "Read the engine parameters",
  compute_rom: "Compute the ROM",
};

export function stepLabel(name: string): string {
  return STEP_LABEL[name] ?? name;
}

export const DATE_TIME = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});

export function formatTime(value: string | null): string {
  return value ? DATE_TIME.format(new Date(value)) : "Still going";
}

/** How long a step took, once it has finished. */
export function elapsed(startedAt: string, finishedAt: string | null): string {
  if (!finishedAt) return "";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
