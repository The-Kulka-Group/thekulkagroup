import type { Db } from "@/lib/db";

// LA-2858. What the Jobs page reads: each Autodesk job with its meeting count
// and last meeting, and one job in full. Every value is one ACC gave or one
// counted from the meetings table.

/** ACC reports active, pending, archived or suspended. */
export const JOB_STATUSES = ["active", "pending", "archived", "suspended"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type JobListItem = {
  id: string;
  autodeskId: string;
  name: string;
  jobNumber: string | null;
  status: string | null;
  city: string | null;
  stateOrProvince: string | null;
  meetingCount: number;
  lastMeetingAt: string | null;
};

export type JobDetail = JobListItem & {
  projectType: string | null;
  startDate: string | null;
  endDate: string | null;
  syncedAt: string;
};

type Row = {
  id: string;
  autodesk_id: string;
  name: string;
  job_number: string | null;
  status: string | null;
  city: string | null;
  state_or_province: string | null;
  meeting_count: number | string;
  last_meeting_at: string | Date | null;
};

const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString());
const day = (value: string | Date | null) => (value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10));

function listItem(row: Row): JobListItem {
  return {
    id: row.id,
    autodeskId: row.autodesk_id,
    name: row.name,
    jobNumber: row.job_number,
    status: row.status,
    city: row.city,
    stateOrProvince: row.state_or_province,
    meetingCount: Number(row.meeting_count),
    lastMeetingAt: iso(row.last_meeting_at),
  };
}

const COLUMNS = `j.id, j.autodesk_id, j.name, j.job_number, j.status, j.city, j.state_or_province,
  count(m.id) as meeting_count, max(m.started_at) as last_meeting_at`;
const FROM = `jobs j left join meetings m on m.job_id = j.id`;

/** A status the filter accepts, or "" for every job. */
export function jobStatusFilter(value: unknown): JobStatus | "" {
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value) ? (value as JobStatus) : "";
}

/** Jobs active first, then by name, matching `search` in the name or job number. */
export async function listJobSummaries(db: Db, search = "", status: JobStatus | "" = ""): Promise<JobListItem[]> {
  const term = search.trim();
  const { rows } = await db.query<Row>(
    `select ${COLUMNS} from ${FROM}
      where ($1 = '' or j.name ilike $2 or coalesce(j.job_number, '') ilike $2)
        and ($3 = '' or j.status = $3)
      group by j.id
      order by (j.status = 'active') desc, j.name`,
    [term, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, status],
  );
  return rows.map(listItem);
}

/** One job with everything its panel shows, or null. */
export async function readJob(db: Db, id: string): Promise<JobDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await db.query<
    Row & { project_type: string | null; start_date: string | Date | null; end_date: string | Date | null; synced_at: string | Date }
  >(
    `select ${COLUMNS}, j.project_type, j.start_date, j.end_date, j.synced_at
       from ${FROM} where j.id = $1 group by j.id`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...listItem(row),
    projectType: row.project_type,
    startDate: day(row.start_date),
    endDate: day(row.end_date),
    syncedAt: iso(row.synced_at) as string,
  };
}

/** The project's home in Autodesk Build. */
export function autodeskProjectUrl(autodeskId: string): string {
  return `https://acc.autodesk.com/build/home/projects/${encodeURIComponent(autodeskId)}`;
}
