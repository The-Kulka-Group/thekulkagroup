import type { Db } from "@/lib/db";

import { type AccProject, type AutodeskSettings, listAccProjects } from "./autodesk";
import { upsertJobs } from "./store";

// LA-2283. Refreshes the job list from Autodesk. The reader is passed in, so
// tests never reach the network.

export type ProjectReader = (settings: AutodeskSettings) => Promise<AccProject[]>;

export async function syncJobs(db: Db, settings: AutodeskSettings, read: ProjectReader = listAccProjects) {
  return { jobs: await upsertJobs(db, await read(settings)) };
}
