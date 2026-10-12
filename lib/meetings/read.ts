import type { Db } from "@/lib/db";

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
};

export type MeetingDetail = MeetingListItem & {
  attendees: MeetingAttendee[];
  summary: MeetingSummary;
  transcriptUrl: string | null;
  topics: string[];
  chapters: unknown[];
  attendance: MeetingAttendance[];
  analytics: MeetingAnalytics;
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
  };
}

const LIST_COLUMNS = `id, title, started_at, duration_minutes, meeting_type,
  jsonb_array_length(attendees) as attendee_count, positive_pct, neutral_pct, negative_pct,
  coalesce(summary->>'overview', '') <> '' as summary_ready`;

/** Meetings newest first, matching `search` in the title, an attendee, a topic or Fireflies' summary. */
export async function listMeetings(db: Db, search = "", limit = 200): Promise<MeetingListItem[]> {
  const term = search.trim();
  const { rows } = await db.query<Row>(
    `select ${LIST_COLUMNS} from meetings
      where $1 = '' or title ilike $2 or attendees::text ilike $2 or topics::text ilike $2
         or coalesce(summary->>'overview', '') ilike $2
      order by started_at desc
      limit $3`,
    [term, `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`, limit],
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
    }
  >(
    `select ${LIST_COLUMNS}, attendees, summary, transcript_url, topics, chapters, attendance, analytics
       from meetings where id = $1`,
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
