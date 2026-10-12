import type { Db } from "@/lib/db";

import { type AccProject, type AutodeskSettings, listAccProjects } from "./autodesk";
import { matchMeetings } from "@/lib/meetings/match";

import { upsertJobs } from "./store";

// LA-2283. Refreshes the job list from Autodesk. The reader is passed in, so
// tests never reach the network.

export type ProjectReader = (settings: AutodeskSettings) => Promise<AccProject[]>;

/** Saves the job list, then matches meetings again, since a new job can place an unmatched meeting (LA-2281). */
export async function syncJobs(db: Db, settings: AutodeskSettings, read: ProjectReader = listAccProjects) {
  const jobs = await upsertJobs(db, await read(settings));
  return { jobs, matched: await matchMeetings(db) };
}
