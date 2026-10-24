import type { SourceStatus } from "@/lib/sources/health";
import type { SourceRun } from "@/lib/sources/log";

// LA-3050. What the Data Sources cards and each source's run log say, kept
// apart from the markup so the wording is tested on its own. A source whose
// schedule is turned off reads Off here, whatever health.ts calls it, since
// nobody expects a run from it.

export type CardState = SourceStatus["health"] | "Off";

/** The dot's tone, using the Daylight status hues. */
export type Tone = "done" | "working" | "stuck" | "idle";

export const TONE: Record<CardState, Tone> = {
  Current: "done",
  Late: "working",
  Failing: "stuck",
  "Not Connected": "stuck",
  Off: "idle",
};

const ZONE = "America/New_York";
const CLOCK = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: ZONE });
const WHEN = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: ZONE });
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: ZONE });
const DAY_LABEL = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: ZONE });

export const sourceHref = (key: string) => `/settings/sources/${key}`;

export function cardState(source: SourceStatus): CardState {
  return source.enabled ? source.health : "Off";
}

/** Time since `iso` in its largest whole unit: 45m, 18h, 7d. */
export function since(iso: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

/** A daily cron in UTC read as Eastern time, such as "Daily at 6:00 AM". */
export function scheduleText(source: Pick<SourceStatus, "kind" | "schedule" | "enabled">, now: Date): string {
  if (!source.enabled) return "No schedule";
  if (source.kind === "manual") return "Run by hand";
  if (source.kind === "webhook") return "Sent as it happens";
  const daily = source.schedule?.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
  if (!daily) return source.schedule ? `Cron ${source.schedule} UTC` : "No schedule";
  const at = new Date(now);
  at.setUTCHours(Number(daily[2]), Number(daily[1]), 0, 0);
  return `Daily at ${CLOCK.format(at)}`;
}

export type Hero = { figure: string; label: string };

export function heroFor(source: SourceStatus, now: Date): Hero {
  if (!source.enabled) return { figure: "Off", label: "Its schedule is turned off" };
  if (source.kind === "manual") {
    return source.lastGoodAt
      ? { figure: "By Hand", label: `Last run ${since(source.lastGoodAt, now)} ago` }
      : { figure: "By Hand", label: "No run logged yet" };
  }
  if (source.lastGoodAt) return { figure: since(source.lastGoodAt, now), label: "Since the last good run" };
  return { figure: "Never", label: "No good run logged yet" };
}

export type CardAction =
  | { kind: "refresh"; label: "Refresh" }
  | { kind: "link"; label: string; href: string };

/**
 * Autodesk Projects refreshes through the existing sync route. A lost Autodesk
 * sign-in reconnects through the existing connect route. Every other card
 * opens its run log.
 */
export function actionFor(source: SourceStatus): CardAction {
  if (source.key === "autodesk_connection" && source.health === "Not Connected") {
    return { kind: "link", label: "Reconnect", href: "/api/autodesk/connect" };
  }
  if (source.key === "autodesk_projects" && source.enabled) return { kind: "refresh", label: "Refresh" };
  return { kind: "link", label: "See Runs", href: sourceHref(source.key) };
}

export type Lead = { tone: Tone; title: string; rest: string; action: { label: string; href: string } | null };

// Lost sign-ins first, then failures, then late runs.
const URGENCY: CardState[] = ["Not Connected", "Failing", "Late"];

const STATE_WORDS: Record<CardState, string> = {
  Current: "current",
  Late: "late",
  Failing: "failing",
  "Not Connected": "not connected",
  Off: "off",
};

function joinNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** The line above the cards: the one thing that needs attention, or that every source is current. */
export function leadLine(sources: SourceStatus[]): Lead {
  if (sources.length === 0) return { tone: "idle", title: "No sources are set up yet.", rest: "", action: null };
  const needs = URGENCY.flatMap((state) => sources.filter((s) => cardState(s) === state));
  const off = sources.filter((s) => cardState(s) === "Off");
  if (needs.length > 0) {
    const first = needs[0];
    const state = cardState(first);
    const more = needs.length - 1;
    const rest =
      more > 0
        ? `${more} more ${more === 1 ? "source needs" : "sources need"} a look too.`
        : off.length > 0
          ? "Every other source that is on is current."
          : "Every other source is current.";
    return {
      tone: TONE[state],
      title: `${first.name} is ${STATE_WORDS[state]}.`,
      rest,
      action: { label: `Open ${first.name}`, href: sourceHref(first.key) },
    };
  }
  if (off.length > 0) {
    return {
      tone: "idle",
      title: `${joinNames(off.map((s) => s.name))} ${off.length === 1 ? "is" : "are"} off.`,
      rest: off.length === sources.length ? "" : "Every other source is current.",
      action: { label: `Open ${off[0].name}`, href: sourceHref(off[0].key) },
    };
  }
  return { tone: "done", title: "Every source is current.", rest: "", action: null };
}

export type RunRow = {
  id: string;
  when: string;
  took: string;
  outcome: "OK" | "Partial" | "Failed" | "Running";
  tone: Tone;
  changed: string;
  by: string;
  error: string | null;
};

const OUTCOME = {
  ok: { label: "OK", tone: "done" },
  partial: { label: "Partial", tone: "working" },
  failed: { label: "Failed", tone: "stuck" },
} as const;

const TRIGGER: Record<SourceRun["trigger"], string> = {
  schedule: "Schedule",
  button: "Refresh Button",
  webhook: "Sent In",
};

function took(run: SourceRun): string {
  if (!run.finishedAt) return "Running";
  const seconds = Math.max(0, Math.round((Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function changed(run: SourceRun): string {
  if (run.rowsAdded === null && run.rowsChanged === null) return run.finishedAt ? "Not counted" : "";
  return [run.rowsAdded !== null ? `${run.rowsAdded} added` : null, run.rowsChanged !== null ? `${run.rowsChanged} changed` : null]
    .filter(Boolean)
    .join(", ");
}

export function runRow(run: SourceRun): RunRow {
  const outcome = run.outcome ? OUTCOME[run.outcome] : { label: "Running" as const, tone: "idle" as const };
  return {
    id: run.id,
    when: WHEN.format(new Date(run.startedAt)),
    took: took(run),
    outcome: outcome.label,
    tone: outcome.tone,
    changed: changed(run),
    by: TRIGGER[run.trigger],
    error: run.error,
  };
}

export type StripDay = { label: string; tone: Tone | "none" };

/**
 * One mark per Eastern day for the last `days` days, oldest first. A day with
 * a failed run is stuck, a day with only good runs is done, a day with none
 * is empty.
 */
export function runStrip(runs: SourceRun[], now: Date, days = 14): StripDay[] {
  const byDay = new Map<string, Tone>();
  for (const run of runs) {
    if (!run.outcome) continue;
    const key = DAY_KEY.format(new Date(run.startedAt));
    if (run.outcome === "failed") byDay.set(key, "stuck");
    else if (!byDay.has(key)) byDay.set(key, "done");
  }
  return Array.from({ length: days }, (_, i) => {
    const day = new Date(now.getTime() - (days - 1 - i) * 86_400_000);
    return { label: DAY_LABEL.format(day), tone: byDay.get(DAY_KEY.format(day)) ?? "none" };
  });
}
