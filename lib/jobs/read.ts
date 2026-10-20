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
  // LA-2881
  addressLine1: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  memberCount: number | null;
  companyCount: number | null;
  sheetCount: number | null;
  autodeskTools: string[];
};

type DetailRow = Row & {
  project_type: string | null;
  start_date: string | Date | null;
  end_date: string | Date | null;
  synced_at: string | Date;
  address_line1: string | null;
  postal_code: string | null;
  latitude: number | string | null;
  longitude: number | string | null;
  member_count: number | null;
  company_count: number | null;
  sheet_count: number | null;
  autodesk_tools: string[] | null;
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

/**
 * What the Projects status filter holds. An empty value is the default, every
 * project ACC has not archived. "all" adds the archived ones back.
 */
export type JobStatusFilter = JobStatus | "all" | "";

/** A filter the page accepts, or "" for the default. */
export function jobStatusFilter(value: unknown): JobStatusFilter {
  if (value === "all") return "all";
  return typeof value === "string" && (JOB_STATUSES as readonly string[]).includes(value) ? (value as JobStatus) : "";
}

/** Archived is finished. Pending and suspended projects still have work ahead, so dashboards keep them. */
export const isArchived = (status: string | null | undefined) => status === "archived";

/**
 * The jobs a dashboard shows: archived ones only when `showArchived` is set,
 * plus any job named in `keep` (a meeting's current project, the project a
 * filter is already on), so a value is never dropped from its own menu.
 */
export function visibleJobs<T extends { id: string; status: string | null }>(
  jobs: T[],
  showArchived: boolean,
  keep: ReadonlyArray<string | null | undefined> = [],
): T[] {
  return jobs.filter((job) => showArchived || !isArchived(job.status) || keep.includes(job.id));
}

/** Jobs active first, then by name, matching `search` in the name or job number. */
export async function listJobSummaries(db: Db, search = "", status: JobStatusFilter = ""): Promise<JobListItem[]> {
  const term = search.trim();
  const { rows } = await db.query<Row>(
    `select ${COLUMNS} from ${FROM}
      where ($1 = '' or j.name ilike $2 or coalesce(j.job_number, '') ilike $2)
        and case $3 when 'all' then true when '' then j.status is distinct from 'archived' else j.status = $3 end
      group by j.id
      order by (j.status = 'active') desc, j.name`,
    [term, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, status],
  );
  return rows.map(listItem);
}

/** One job with everything its panel shows, or null. */
export async function readJob(db: Db, id: string): Promise<JobDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await db.query<DetailRow>(
    `select ${COLUMNS}, j.project_type, j.start_date, j.end_date, j.synced_at,
            j.address_line1, j.postal_code, j.latitude, j.longitude, j.member_count, j.company_count,
            j.sheet_count, j.autodesk_tools
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
    addressLine1: row.address_line1,
    postalCode: row.postal_code,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    memberCount: row.member_count,
    companyCount: row.company_count,
    sheetCount: row.sheet_count,
    autodeskTools: row.autodesk_tools ?? [],
  };
}

/** The street address on one line, or "" when ACC has none. */
export function fullAddress(job: Pick<JobDetail, "addressLine1" | "city" | "stateOrProvince" | "postalCode">): string {
  const region = [job.stateOrProvince, job.postalCode].filter(Boolean).join(" ");
  return [job.addressLine1, job.city, region].filter(Boolean).join(", ");
}

/** Google Maps at the project's pin, or at its address when ACC has no pin. Null with neither. */
export function mapUrl(job: Pick<JobDetail, "latitude" | "longitude" | "addressLine1" | "city" | "stateOrProvince" | "postalCode">): string | null {
  const query =
    job.latitude !== null && job.longitude !== null ? `${job.latitude},${job.longitude}` : job.addressLine1 ? fullAddress(job) : "";
  return query ? `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query })}` : null;
}

// ACC product keys as Autodesk names them. Account and project admin are
// turned on for every project, so they say nothing and stay hidden. datcls and
// datum came back on 2026-10-20 with no product name we could find; hidden too.
const TOOLS: Record<string, string | null> = {
  accountAdministration: null,
  projectAdministration: null,
  datcls: null,
  datum: null,
  autoSpecs: "AutoSpecs",
  build: "Build",
  buildingConnected: "BuildingConnected",
  capitalPlanning: "Capital Planning",
  cost: "Cost",
  designCollaboration: "Design Collaboration",
  docs: "Docs",
  financials: "Financials",
  forma: "Forma",
  insight: "Insight",
  modelCoordination: "Model Coordination",
  takeoff: "Takeoff",
  workshopxr: "Workshop XR",
};

/** Title case names for the tools turned on, A to Z. An unknown key is spaced out and kept. */
export function toolNames(keys: string[]): string[] {
  return keys
    .map((key) => (key in TOOLS ? TOOLS[key] : key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase())))
    .filter((name): name is string => Boolean(name))
    .sort((a, b) => a.localeCompare(b));
}

/** The project's home in Autodesk Build. */
export function autodeskProjectUrl(autodeskId: string): string {
  return `https://acc.autodesk.com/build/home/projects/${encodeURIComponent(autodeskId)}`;
}
