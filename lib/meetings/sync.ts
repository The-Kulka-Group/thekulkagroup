import type { Db } from "@/lib/db";

import type { FirefliesTranscript } from "./fireflies";
import { completeFirefliesIds, meetingFromTranscript, upsertMeeting } from "./store";

// LA-2279. Pulling meetings from Fireflies into Kulka AI. The Fireflies calls
// are passed in, so tests never reach the network.

export type FirefliesReader = {
  fetchTranscript: (id: string) => Promise<FirefliesTranscript>;
  listTranscriptIds: (from: Date) => Promise<string[]>;
};

/** Fetches one transcript and saves it. Safe to repeat. */
export async function syncMeeting(db: Db, reader: FirefliesReader, firefliesId: string): Promise<void> {
  await upsertMeeting(db, meetingFromTranscript(await reader.fetchTranscript(firefliesId)));
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
  for (const id of missing) await syncMeeting(db, reader, id);
  return { found: ids.length, added: missing.length };
}
