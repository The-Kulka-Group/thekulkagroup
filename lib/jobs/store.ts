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
const textOrNull = (value: string | null | undefined) => value?.trim() || null;

/** A coordinate inside its range, or null. ACC sends "" or nothing when the address has no pin. */
function coordinate(value: string | number | null | undefined, limit: number): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
}

const countOrNull = (value: number | null | undefined) => (Number.isInteger(value) && (value as number) >= 0 ? (value as number) : null);

/** The keys of the products turned on for the project (LA-2881). */
function activeTools(products: AccProject["products"]): string[] | null {
  if (!Array.isArray(products)) return null;
  return [...new Set(products.filter((one) => one?.status === "active" && one.key).map((one) => one.key as string))].sort();
}

/** Saves each project, updating the row with the same Autodesk id. Nothing is deleted. */
export async function upsertJobs(db: Db, projects: AccProject[]): Promise<number> {
  for (const project of projects) {
    await db.query(
      `insert into jobs
         (autodesk_id, name, job_number, status, project_type, platform, city, state_or_province,
          start_date, end_date, autodesk_updated_at, address_line1, postal_code, latitude, longitude,
          member_count, company_count, sheet_count, autodesk_tools)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       on conflict (autodesk_id) do update set
         name = excluded.name, job_number = excluded.job_number, status = excluded.status,
         project_type = excluded.project_type, platform = excluded.platform, city = excluded.city,
         state_or_province = excluded.state_or_province, start_date = excluded.start_date,
         end_date = excluded.end_date, autodesk_updated_at = excluded.autodesk_updated_at,
         address_line1 = excluded.address_line1, postal_code = excluded.postal_code,
         latitude = excluded.latitude, longitude = excluded.longitude, member_count = excluded.member_count,
         company_count = excluded.company_count, sheet_count = excluded.sheet_count,
         autodesk_tools = excluded.autodesk_tools, synced_at = now()`,
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
        textOrNull(project.addressLine1),
        textOrNull(project.postalCode),
        coordinate(project.latitude, 90),
        coordinate(project.longitude, 180),
        countOrNull(project.memberCount),
        countOrNull(project.companyCount),
        countOrNull(project.sheetCount),
        activeTools(project.products),
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
