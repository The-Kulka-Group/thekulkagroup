import type { Db } from "@/lib/db";

import { type BriefClient, briefMeeting, meetingsAwaitingBrief } from "./brief";

import type { FirefliesTranscript } from "./fireflies";
import { matchMeetings } from "./match";
import { completeFirefliesIds, meetingFromTranscript, upsertMeeting } from "./store";

// LA-2279. Pulling meetings from Fireflies into Kulka AI. The Fireflies calls
// are passed in, so tests never reach the network.

export type FirefliesReader = {
  fetchTranscript: (id: string) => Promise<FirefliesTranscript>;
  listTranscriptIds: (from: Date) => Promise<string[]>;
};

/**
 * Fetches one transcript and saves it, then matches meetings to jobs
 * (LA-2281) unless the caller matches once at the end. Safe to repeat.
 */
export async function syncMeeting(db: Db, reader: FirefliesReader, firefliesId: string, match = true): Promise<void> {
  await upsertMeeting(db, meetingFromTranscript(await reader.fetchTranscript(firefliesId)));
  if (match) await matchMeetings(db);
}

/**
 * Saves every meeting since `from` that Kulka AI does not have yet, or has
 * without its summary. This is the main path, since Fireflies' webhooks fire
 * only for meetings meetings@ organizes. Safe to run any number of times.
 */
export async function backfillMeetings(
  db: Db,
  reader: FirefliesReader,
  from: Date,
): Promise<{ found: number; added: number }> {
  const ids = await reader.listTranscriptIds(from);
  const saved = await completeFirefliesIds(db, ids);
  const missing = ids.filter((id) => !saved.has(id));
  for (const id of missing) await syncMeeting(db, reader, id, false);
  if (missing.length > 0) await matchMeetings(db);
  return { found: ids.length, added: missing.length };
}

/** Briefs written per sync, so one call stays well inside its time limit. */
export const BRIEFS_PER_SYNC = 5;

/** Writes the Kulka Brief for up to BRIEFS_PER_SYNC meetings that have a summary and no brief yet. */
export async function briefPending(db: Db, client: BriefClient | null): Promise<number> {
  if (!client) return 0;
  let written = 0;
  for (const id of await meetingsAwaitingBrief(db, BRIEFS_PER_SYNC)) {
    if (await briefMeeting(db, client, id)) written += 1;
  }
  return written;
}
