import { describe, expect, it } from "vitest";

import type { SourceStatus } from "@/lib/sources/health";
import type { SourceRun } from "@/lib/sources/log";

import { actionFor, cardState, heroFor, leadLine, runRow, runStrip, scheduleText, since } from "./sources-view";

// LA-3050. The wording on the Data Sources cards, the lead line for each
// state, and the run log rows.

const NOW = new Date("2026-10-24T12:00:00.000Z");
const HOUR = 3_600_000;

function source(over: Partial<SourceStatus>): SourceStatus {
  return {
    key: "autodesk_projects",
    name: "Autodesk Projects",
    kind: "scheduled",
    owner: null,
    schedule: "0 10 * * *",
    enabled: true,
    connectionStatus: null,
    lastRunAt: null,
    lastOutcome: "ok",
    lastError: null,
    lastGoodAt: new Date(NOW.getTime() - 2 * HOUR).toISOString(),
    health: "Current",
    ...over,
  };
}

const projects = source({});
const connection = source({ key: "autodesk_connection", name: "Autodesk Connection", connectionStatus: "connected" });
const fireflies = source({ key: "fireflies_meetings", name: "Fireflies Meetings", kind: "webhook" });
const proest = source({ key: "proest_imports", name: "ProEst Imports", kind: "manual", schedule: null, lastGoodAt: null, lastOutcome: null });
const vision = source({ key: "vision_discovery", name: "Vision Discovery", schedule: null, enabled: false, health: "Late", lastGoodAt: null });

describe("leadLine", () => {
  it("says every source is current when each one is", () => {
    expect(leadLine([projects, connection, fireflies, proest])).toEqual({ tone: "done", title: "Every source is current.", rest: "", action: null });
  });

  it("names a source that is off when nothing else needs a look", () => {
    expect(leadLine([projects, fireflies, vision])).toEqual({
      tone: "idle",
      title: "Vision Discovery is off.",
      rest: "Every other source is current.",
      action: { label: "Open Vision Discovery", href: "/settings/sources/vision_discovery" },
    });
  });

  it("names a late source", () => {
    expect(leadLine([projects, { ...fireflies, health: "Late" }])).toMatchObject({
      tone: "working",
      title: "Fireflies Meetings is late.",
      rest: "Every other source is current.",
      action: { label: "Open Fireflies Meetings", href: "/settings/sources/fireflies_meetings" },
    });
  });

  it("names a failing source ahead of a late one and counts the rest", () => {
    expect(leadLine([{ ...fireflies, health: "Late" }, { ...projects, health: "Failing" }, vision])).toMatchObject({
      tone: "stuck",
      title: "Autodesk Projects is failing.",
      rest: "1 more source needs a look too.",
    });
  });

  it("names a lost sign-in first of all", () => {
    const lost = { ...connection, connectionStatus: "expired" as const, health: "Not Connected" as const };
    expect(leadLine([{ ...projects, health: "Failing" }, { ...fireflies, health: "Late" }, lost, vision])).toMatchObject({
      tone: "stuck",
      title: "Autodesk Connection is not connected.",
      rest: "2 more sources need a look too.",
    });
  });

  it("says when one bad source is the only problem besides an off one", () => {
    expect(leadLine([{ ...projects, health: "Failing" }, vision]).rest).toBe("Every other source that is on is current.");
  });

  it("says when no sources are set up", () => {
    expect(leadLine([]).title).toBe("No sources are set up yet.");
  });
});

describe("cards", () => {
  it("reads a turned-off source as Off whatever its health", () => {
    expect(cardState(vision)).toBe("Off");
    expect(heroFor(vision, NOW)).toEqual({ figure: "Off", label: "Its schedule is turned off" });
  });

  it("shows time since the last good run, Never, or By Hand", () => {
    expect(heroFor(projects, NOW)).toEqual({ figure: "2h", label: "Since the last good run" });
    expect(heroFor({ ...projects, lastGoodAt: null }, NOW).figure).toBe("Never");
    expect(heroFor(proest, NOW)).toEqual({ figure: "By Hand", label: "No run logged yet" });
    expect(since(new Date(NOW.getTime() - 7 * 24 * HOUR).toISOString(), NOW)).toBe("7d");
    expect(since(new Date(NOW.getTime() - 45 * 60_000).toISOString(), NOW)).toBe("45m");
  });

  it("reads the UTC cron as Eastern time", () => {
    expect(scheduleText(projects, NOW)).toBe("Daily at 6:00 AM");
    expect(scheduleText(projects, new Date("2026-12-15T12:00:00Z"))).toBe("Daily at 5:00 AM");
    expect(scheduleText(fireflies, NOW)).toBe("Sent as it happens");
    expect(scheduleText(proest, NOW)).toBe("Run by hand");
    expect(scheduleText(vision, NOW)).toBe("No schedule");
  });

  it("gives Autodesk Projects a Refresh, a lost Autodesk sign-in a Reconnect, and the rest their run log", () => {
    expect(actionFor(projects)).toEqual({ kind: "refresh", label: "Refresh" });
    expect(actionFor({ ...connection, health: "Not Connected" })).toEqual({ kind: "link", label: "Reconnect", href: "/api/autodesk/connect" });
    expect(actionFor(fireflies)).toEqual({ kind: "link", label: "See Runs", href: "/settings/sources/fireflies_meetings" });
  });
});

describe("run log", () => {
  const run = (over: Partial<SourceRun>): SourceRun => ({
    id: "r1",
    trigger: "schedule",
    startedAt: "2026-10-23T10:00:00.000Z",
    finishedAt: "2026-10-23T10:00:12.000Z",
    outcome: "ok",
    rowsAdded: 1,
    rowsChanged: 2,
    error: null,
    ...over,
  });

  it("shows start, length, outcome, rows changed, trigger and error", () => {
    expect(runRow(run({}))).toEqual({
      id: "r1",
      when: "Oct 23, 6:00 AM",
      took: "12s",
      outcome: "OK",
      tone: "done",
      changed: "1 added, 2 changed",
      by: "Schedule",
      error: null,
    });
    expect(runRow(run({ outcome: "failed", trigger: "button", rowsAdded: null, rowsChanged: null, error: "Too many requests." }))).toMatchObject({
      outcome: "Failed",
      tone: "stuck",
      changed: "Not counted",
      by: "Refresh Button",
      error: "Too many requests.",
    });
    expect(runRow(run({ finishedAt: null, outcome: null, rowsAdded: null, rowsChanged: null }))).toMatchObject({ took: "Running", outcome: "Running" });
  });

  it("marks each of the last 14 days by its runs", () => {
    const strip = runStrip(
      [run({}), run({ id: "r2", startedAt: "2026-10-22T10:00:00.000Z", outcome: "failed" }), run({ id: "r3", startedAt: "2026-10-22T20:00:00.000Z" })],
      NOW,
    );
    expect(strip).toHaveLength(14);
    expect(strip.slice(-3)).toEqual([
      { label: "Oct 22", tone: "stuck" },
      { label: "Oct 23", tone: "done" },
      { label: "Oct 24", tone: "none" },
    ]);
  });
});
