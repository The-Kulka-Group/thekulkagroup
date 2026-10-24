import type { Db } from "@/lib/db";

import { type AccProject, type AutodeskSettings, listAccProjects } from "./autodesk";
import { matchMeetings } from "@/lib/meetings/match";
import { type RunTrigger, recordRun } from "@/lib/sources/runs";

import { upsertJobs } from "./store";

// LA-2283. Refreshes the job list from Autodesk. The reader is passed in, so
// tests never reach the network.

export type ProjectReader = (settings: AutodeskSettings) => Promise<AccProject[]>;

/** Saves the job list, then matches meetings again, since a new job can place an unmatched meeting (LA-2281). */
export async function syncJobs(db: Db, settings: AutodeskSettings, read: ProjectReader = listAccProjects) {
  const jobs = await upsertJobs(db, await read(settings));
  return { jobs, matched: await matchMeetings(db) };
}

/** syncJobs, logged as one Autodesk Projects run (LA-3048). Nothing is deleted, so the count's rise is the jobs added. */
export async function syncJobsLogged(
  db: Db,
  settings: AutodeskSettings,
  trigger: RunTrigger,
  read: ProjectReader = listAccProjects,
) {
  let before = 0;
  return recordRun(
    db,
    "autodesk_projects",
    trigger,
    async () => {
      before = await jobCount(db);
      return syncJobs(db, settings, read);
    },
    async ({ jobs }) => {
      const added = (await jobCount(db)) - before;
      return { added, changed: jobs - added };
    },
  );
}

async function jobCount(db: Db): Promise<number> {
  const { rows } = await db.query<{ count: string | number }>(`select count(*) from jobs`);
  return Number(rows[0].count);
}
