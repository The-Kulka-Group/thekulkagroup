import { keepSignInAliveLogged } from "@/lib/autodesk/connection";
import { userSettings } from "@/lib/autodesk/oauth";
import type { Db } from "@/lib/db";
import { autodeskSettings } from "@/lib/jobs/autodesk";
import { syncJobsLogged } from "@/lib/jobs/sync";
import { briefClient } from "@/lib/meetings/brief";
import { firefliesKey, firefliesReader } from "@/lib/meetings/fireflies";
import { backfillMeetingsLogged, briefPending } from "@/lib/meetings/sync";
import { collectAllDiscovery } from "@/lib/vision/discovery";

import { recordRun, type SourceKey } from "./runs";
import type { Runner } from "./schedule";

// LA-3049. What the schedule runs for each source. The order is the order of
// a pass: the Autodesk project list lands before meetings are matched to jobs.

/** Days of Fireflies meetings a scheduled backfill reads, as the old daily cron did. */
const MEETING_DAYS = 3;

/** A source that cannot run here still logs a run, so the Data Sources page says why. */
function notSetUp(db: Db, source: SourceKey, message: string): Promise<never> {
  return recordRun(db, source, "schedule", () => Promise.reject(new Error(message)));
}

export const SCHEDULED_RUNNERS: Partial<Record<SourceKey, Runner>> = {
  autodesk_projects: async (db) => {
    const settings = autodeskSettings();
    if (!settings) return notSetUp(db, "autodesk_projects", "Autodesk is not set up.");
    return syncJobsLogged(db, settings, "schedule");
  },
  // LA-2911. Autodesk retires a refresh token after 15 idle days; a daily run keeps it fresh.
  autodesk_connection: async (db) => {
    const settings = userSettings();
    if (!settings) return notSetUp(db, "autodesk_connection", "The Autodesk sign-in is not set up.");
    return keepSignInAliveLogged(db, settings);
  },
  fireflies_meetings: async (db) => {
    const key = firefliesKey();
    if (!key) return notSetUp(db, "fireflies_meetings", "Fireflies is not set up.");
    const result = await backfillMeetingsLogged(
      db,
      firefliesReader(key),
      new Date(Date.now() - MEETING_DAYS * 86_400_000),
      "schedule",
    );
    return { ...result, briefed: await briefPending(db, briefClient()) };
  },
  // Off in data_sources until its separate release (docs/vision/discovery.md).
  vision_discovery: (db) =>
    recordRun(
      db,
      "vision_discovery",
      "schedule",
      () => collectAllDiscovery(db),
      ({ results }) => {
        const failed = results.filter((one) => one.outcome === "failed" || one.outcome === "blocked");
        return {
          outcome: failed.length === 0 ? "ok" : failed.length === results.length ? "failed" : "partial",
          added: results.reduce((sum, one) => sum + one.inserted, 0),
          changed: results.reduce((sum, one) => sum + one.updated, 0),
          error: failed.map((one) => `${one.sourceId}: ${one.error ?? one.outcome}`).join(" ") || null,
        };
      },
    ),
};
