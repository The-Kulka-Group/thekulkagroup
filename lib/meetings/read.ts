import type { Db } from "@/lib/db";

import type { Brief } from "./brief";
import type { MatchSource } from "./match";
import type { MeetingAnalytics, MeetingAttendance, MeetingAttendee, MeetingSummary, Sentiment } from "./store";

// LA-2280, LA-2287. What the Meetings page reads. Every figure is one Fireflies
// gave, or one computed here from those fields; the page shows nothing else.

export type MeetingListItem = {
  id: string;
  title: string;
  startedAt: string;
  durationMinutes: number | null;
  meetingType: string | null;
  attendeeCount: number;
  sentiment: Sentiment;
  summaryReady: boolean;
  briefReady: boolean;
  /** LA-2281: the Autodesk job, or null when unmatched or placed under no job. */
  job: { id: string; name: string; jobNumber: string | null } | null;
  matchSource: MatchSource | null;
  /** Action items in the meeting's Kulka Brief, 0 when there is no brief. */
  briefActions: number;
};

export type MeetingDetail = MeetingListItem & {
  attendees: MeetingAttendee[];
  summary: MeetingSummary;
  transcriptUrl: string | null;
  topics: string[];
  chapters: unknown[];
  attendance: MeetingAttendance[];
  analytics: MeetingAnalytics;
  brief: Brief | null;
  briefError: string | null;
};

type Row = {
  id: string;
  title: string;
  started_at: string | Date;
  duration_minutes: string | number | null;
  meeting_type: string | null;
  attendee_count: number | string;
  positive_pct: string | number | null;
  neutral_pct: string | number | null;
  negative_pct: string | number | null;
  summary_ready: boolean;
  brief_ready: boolean;
  job_id: string | null;
  job_name: string | null;
  job_number: string | null;
  match_source: MatchSource | null;
  brief_actions: number | string;
};

const num = (value: string | number | null) => (value === null ? null : Number(value));

function listItem(row: Row): MeetingListItem {
  return {
    id: row.id,
    title: row.title,
    startedAt: new Date(row.started_at).toISOString(),
    durationMinutes: num(row.duration_minutes),
    meetingType: row.meeting_type,
    attendeeCount: Number(row.attendee_count),
    sentiment: { positive: num(row.positive_pct), neutral: num(row.neutral_pct), negative: num(row.negative_pct) },
    summaryReady: row.summary_ready,
    briefReady: row.brief_ready,
    job: row.job_id && row.job_name ? { id: row.job_id, name: row.job_name, jobNumber: row.job_number } : null,
    matchSource: row.match_source,
    briefActions: Number(row.brief_actions),
  };
}

const LIST_COLUMNS = `m.id, m.title, m.started_at, m.duration_minutes, m.meeting_type,
  jsonb_array_length(m.attendees) as attendee_count, m.positive_pct, m.neutral_pct, m.negative_pct,
  coalesce(m.summary->>'overview', '') <> '' as summary_ready, m.brief is not null as brief_ready,
  m.job_id, j.name as job_name, j.job_number, m.match_source,
  coalesce(jsonb_array_length(m.brief->'actionItems'), 0) as brief_actions`;
const FROM = `meetings m left join jobs j on j.id = m.job_id`;

/** "unmatched" for meetings with no job, a job id for one job, or empty for all. */
export type JobFilter = string;

/**
 * Meetings newest first, matching `search` in the title, an attendee, a topic
 * or Fireflies' summary, and `job` (LA-2281).
 */
export async function listMeetings(db: Db, search = "", limit = 200, job: JobFilter = ""): Promise<MeetingListItem[]> {
  const term = search.trim();
  const jobId = /^[0-9a-f-]{36}$/i.test(job) ? job : null;
  const { rows } = await db.query<Row>(
    `select ${LIST_COLUMNS} from ${FROM}
      where ($1 = '' or m.title ilike $2 or m.attendees::text ilike $2 or m.topics::text ilike $2
             or coalesce(m.summary->>'overview', '') ilike $2)
        and ($4 = '' or ($4 = 'unmatched' and m.job_id is null) or m.job_id = $5::uuid)
      order by m.started_at desc
      limit $3`,
    [term, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit, jobId ? "job" : job === "unmatched" ? "unmatched" : "", jobId],
  );
  return rows.map(listItem);
}

/** One meeting with everything the meeting view shows, or null. */
export async function readMeeting(db: Db, id: string): Promise<MeetingDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { rows } = await db.query<
    Row & {
      attendees: MeetingAttendee[];
      summary: MeetingSummary;
      transcript_url: string | null;
      topics: string[];
      chapters: unknown[];
      attendance: MeetingAttendance[];
      analytics: MeetingAnalytics;
      brief: Brief | null;
      brief_error: string | null;
    }
  >(
    `select ${LIST_COLUMNS}, m.attendees, m.summary, m.transcript_url, m.topics, m.chapters, m.attendance, m.analytics,
            m.brief, m.brief_error
       from ${FROM} where m.id = $1`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...listItem(row),
    attendees: row.attendees,
    summary: row.summary,
    transcriptUrl: row.transcript_url,
    topics: row.topics,
    chapters: row.chapters,
    attendance: row.attendance,
    analytics: row.analytics,
    brief: row.brief,
    briefError: row.brief_error,
  };
}

/** Minutes after the start at which someone counts as late. */
export const LATE_AFTER_MINUTES = 5;

/** Who joined more than LATE_AFTER_MINUTES after the meeting started, with how late. */
export function lateJoiners(startedAt: string, attendance: MeetingAttendance[]): { name: string; minutes: number }[] {
  const start = Date.parse(startedAt);
  const late: { name: string; minutes: number }[] = [];
  for (const one of attendance) {
    const joined = one.joinedAt === null ? Number.NaN : Date.parse(one.joinedAt);
    if (!Number.isFinite(joined) || !one.name) continue;
    const minutes = Math.round((joined - start) / 60_000);
    if (minutes > LATE_AFTER_MINUTES) late.push({ name: one.name, minutes });
  }
  return late.sort((a, b) => b.minutes - a.minutes);
}

/** Talk time by speaker, largest first, with everyone past `top` folded into one line. */
export function talkShares(analytics: MeetingAnalytics, top = 5): { name: string; share: number }[] {
  const speakers = (analytics.speakers ?? [])
    .filter((one) => one.share !== null)
    .map((one) => ({ name: one.name ?? "Unknown Speaker", share: one.share as number }))
    .sort((a, b) => b.share - a.share);
  if (speakers.length <= top) return speakers;
  const rest = speakers.slice(top);
  const others = rest.reduce((sum, one) => sum + one.share, 0);
  return [...speakers.slice(0, top), { name: `${rest.length} Others`, share: Math.round(others * 10) / 10 }];
}

/** Average speaking pace, weighted by how much each speaker said. */
export function averagePace(analytics: MeetingAnalytics): number | null {
  let words = 0;
  let weighted = 0;
  for (const one of analytics.speakers ?? []) {
    if (one.words === null || one.wordsPerMinute === null) continue;
    words += one.words;
    weighted += one.words * one.wordsPerMinute;
  }
  return words > 0 ? Math.round(weighted / words) : null;
}

/**
 * This week at a glance: how many meetings, their sentiment averaged by
 * length, and the meeting with the highest negative share. Projects at a
 * Glance replaces this once meetings match to Autodesk projects (LA-2281).
 */
export function weekGlance(meetings: MeetingListItem[], now: Date) {
  const since = now.getTime() - 7 * 86_400_000;
  const week = meetings.filter((one) => Date.parse(one.startedAt) >= since);
  const scored = week.filter((one) => one.sentiment.positive !== null && one.sentiment.negative !== null);
  let weight = 0;
  const totals = { positive: 0, neutral: 0, negative: 0 };
  for (const one of scored) {
    const w = one.durationMinutes ?? 1;
    weight += w;
    totals.positive += w * (one.sentiment.positive ?? 0);
    totals.neutral += w * (one.sentiment.neutral ?? 0);
    totals.negative += w * (one.sentiment.negative ?? 0);
  }
  const sentiment: Sentiment | null =
    weight > 0
      ? {
          positive: Math.round(totals.positive / weight),
          neutral: Math.round(totals.neutral / weight),
          negative: Math.round(totals.negative / weight),
        }
      : null;
  const mostNegative = [...scored].sort((a, b) => (b.sentiment.negative ?? 0) - (a.sentiment.negative ?? 0))[0] ?? null;
  return { count: week.length, sentiment, mostNegative, hours: Math.round(week.reduce((s, m) => s + (m.durationMinutes ?? 0), 0) / 6) / 10 };
}

/**
 * Fireflies writes action items as an owner line in bold ("**Name**") with
 * that person's items under it. Lines before any owner have none.
 */
export function actionItems(text: string | null): { owner: string | null; item: string }[] {
  const items: { owner: string | null; item: string }[] = [];
  let owner: string | null = null;
  for (const raw of (text ?? "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^\*\*(.+?)\*\*:?$/);
    if (heading) {
      owner = heading[1].trim();
      continue;
    }
    items.push({ owner, item: line.replace(/^[-*•\s]+/, "").replace(/\s*\(\d{1,2}:\d{2}(?::\d{2})?\)$/, "") });
  }
  return items;
}

/** Meetings per job in the at-a-glance window. */
export const GLANCE_MEETINGS = 6;

/** How sentiment moved: positive minus negative, latest 3 meetings against the 3 before. */
export function sentimentTrend(meetings: MeetingListItem[]): "Rising" | "Steady" | "Falling" | null {
  const scores = meetings
    .filter((one) => one.sentiment.positive !== null && one.sentiment.negative !== null)
    .map((one) => (one.sentiment.positive as number) - (one.sentiment.negative as number));
  if (scores.length < 4) return null;
  const recent = scores.slice(0, 3);
  const before = scores.slice(3, 6);
  const mean = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const change = mean(recent) - mean(before);
  return change >= 5 ? "Rising" : change <= -5 ? "Falling" : "Steady";
}

export type ProjectGlance = {
  job: NonNullable<MeetingListItem["job"]>;
  /** Newest first, at most GLANCE_MEETINGS. */
  meetings: MeetingListItem[];
  latest: MeetingListItem;
  trend: ReturnType<typeof sentimentTrend>;
  /** Action items in the latest meeting's Kulka Brief. */
  latestActions: number;
};

/**
 * LA-2281, LA-2287: each matched job's recent meetings, the jobs with the
 * most recent meeting first, and how many meetings have no job.
 */
export function projectGlance(meetings: MeetingListItem[]): { projects: ProjectGlance[]; unmatched: number } {
  const byJob = new Map<string, MeetingListItem[]>();
  let unmatched = 0;
  for (const meeting of meetings) {
    if (!meeting.job) {
      if (meeting.matchSource !== "manual") unmatched += 1;
      continue;
    }
    const list = byJob.get(meeting.job.id) ?? [];
    if (list.length < GLANCE_MEETINGS) list.push(meeting);
    byJob.set(meeting.job.id, list);
  }
  const projects = [...byJob.values()].map((list) => ({
    job: list[0].job as NonNullable<MeetingListItem["job"]>,
    meetings: list,
    latest: list[0],
    trend: sentimentTrend(list),
    latestActions: list[0].briefActions,
  }));
  return { projects, unmatched };
}
