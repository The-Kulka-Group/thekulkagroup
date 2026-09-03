// Shared display labels. Runtime records come from live sources, not this file.

export type Status = "working" | "stuck" | "done" | "open";

export const STATUS_LABEL: Record<Status, string> = {
  working: "Working on it",
  stuck: "Stuck",
  done: "Done",
  open: "Not started",
};
