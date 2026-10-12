import type { Db } from "@/lib/db";

import type { AccProject } from "./autodesk";

// LA-2283. Kulka AI's copy of the Autodesk project list.

export type Job = {
  id: string;
  autodeskId: string;
  name: string;
  jobNumber: string | null;
  status: string | null;
};

const dateOrNull = (value: string | null | undefined) => (value && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null);

/** Saves each project, updating the row with the same Autodesk id. Nothing is deleted. */
export async function upsertJobs(db: Db, projects: AccProject[]): Promise<number> {
  for (const project of projects) {
    await db.query(
      `insert into jobs
         (autodesk_id, name, job_number, status, project_type, platform, city, state_or_province,
          start_date, end_date, autodesk_updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       on conflict (autodesk_id) do update set
         name = excluded.name, job_number = excluded.job_number, status = excluded.status,
         project_type = excluded.project_type, platform = excluded.platform, city = excluded.city,
         state_or_province = excluded.state_or_province, start_date = excluded.start_date,
         end_date = excluded.end_date, autodesk_updated_at = excluded.autodesk_updated_at, synced_at = now()`,
      [
        project.id,
        project.name?.trim() || "Untitled Project",
        project.jobNumber?.trim() || null,
        project.status ?? null,
        project.type ?? null,
        project.platform ?? null,
        project.city ?? null,
        project.stateOrProvince ?? null,
        dateOrNull(project.startDate),
        dateOrNull(project.endDate),
        project.updatedAt ?? null,
      ],
    );
  }
  return projects.length;
}

/** Jobs by name, active first. */
export async function listJobs(db: Db): Promise<Job[]> {
  const { rows } = await db.query<{ id: string; autodesk_id: string; name: string; job_number: string | null; status: string | null }>(
    `select id, autodesk_id, name, job_number, status from jobs
      order by (status = 'active') desc, name`,
  );
  return rows.map((row) => ({
    id: row.id,
    autodeskId: row.autodesk_id,
    name: row.name,
    jobNumber: row.job_number,
    status: row.status,
  }));
}
