import type { Db } from "@/lib/db";

import type { FirefliesTranscript } from "./fireflies";

// LA-2279. Kulka's copy of each Fireflies meeting, with Fireflies' analytics
// (LA-2287: read per project at a glance, sentiment shown clearly).

export type MeetingAttendee = { name: string | null; email: string | null };
export type MeetingSentence = {
  index: number;
  speaker: string | null;
  text: string;
  start: number;
  end: number;
  /** Fireflies' flags on the sentence: task, pricing, metric, question, date_and_time, sentiment. */
  flags: Record<string, string>;
};
export type MeetingSummary = {
  overview: string | null;
  actionItems: string | null;
  keywords: string[];
  bullets: string | null;
};
export type MeetingAttendance = { name: string | null; joinedAt: string | null; leftAt: string | null };
export type Sentiment = { positive: number | null; neutral: number | null; negative: number | null };
export type SpeakerAnalytics = {
  name: string | null;
  seconds: number | null;
  share: number | null;
  words: number | null;
  wordsPerMinute: number | null;
  questions: number | null;
  fillerWords: number | null;
  longestMonologue: number | null;
  monologues: number | null;
};
export type MeetingAnalytics = {
  sentiment: Sentiment;
  categories: { questions: number | null; dates: number | null; metrics: number | null; tasks: number | null };
  speakers: SpeakerAnalytics[];
};

export type MeetingRecord = {
  firefliesId: string;
  title: string;
  startedAt: string;
  durationMinutes: number | null;
  organizerEmail: string | null;
  attendees: MeetingAttendee[];
  summary: MeetingSummary;
  transcriptUrl: string | null;
  sentences: MeetingSentence[];
  meetingType: string | null;
  topics: string[];
  chapters: unknown[];
  attendance: MeetingAttendance[];
  analytics: MeetingAnalytics;
  calendarId: string | null;
  calendarEventId: string | null;
  privacy: string | null;
  summaryStatus: string | null;
};

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const timeOrNull = (value: unknown) =>
  value === null || value === undefined || value === "" ? null : String(value);

function topicsOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((one): one is string => typeof one === "string" && one.trim() !== "");
  if (typeof value === "string") return value.split(/\n|,/).map((one) => one.replace(/^[-*\s]+/, "").trim()).filter(Boolean);
  return [];
}

/** Only the flags Fireflies set, so a sentence with none stores none. */
function flagsOf(filters: Record<string, string | null> | null | undefined): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const [name, value] of Object.entries(filters ?? {})) if (value) flags[name] = value;
  return flags;
}

/** A Fireflies transcript in Kulka's shape. */
export function meetingFromTranscript(transcript: FirefliesTranscript): MeetingRecord {
  const date = Number(transcript.date);
  const sentiments = transcript.analytics?.sentiments;
  const categories = transcript.analytics?.categories;
  return {
    firefliesId: transcript.id,
    title: transcript.title?.trim() || "Untitled Meeting",
    startedAt: new Date(Number.isFinite(date) ? date : Date.now()).toISOString(),
    durationMinutes: transcript.duration ?? null,
    organizerEmail: transcript.organizer_email ?? null,
    attendees: (transcript.meeting_attendees ?? []).map((one) => ({
      name: one.displayName ?? one.name ?? null,
      email: one.email ?? null,
    })),
    summary: {
      overview: transcript.summary?.overview ?? null,
      actionItems: transcript.summary?.action_items ?? null,
      keywords: transcript.summary?.keywords ?? [],
      bullets: transcript.summary?.shorthand_bullet ?? null,
    },
    transcriptUrl: transcript.transcript_url?.startsWith("https://") ? transcript.transcript_url : null,
    sentences: (transcript.sentences ?? []).map((one) => ({
      index: one.index,
      speaker: one.speaker_name ?? null,
      text: one.text,
      start: one.start_time,
      end: one.end_time,
      flags: flagsOf(one.ai_filters),
    })),
    meetingType: transcript.summary?.meeting_type?.trim() || null,
    topics: topicsOf(transcript.summary?.topics_discussed),
    chapters: Array.isArray(transcript.summary?.transcript_chapters) ? transcript.summary.transcript_chapters : [],
    attendance: (transcript.meeting_attendance ?? []).map((one) => ({
      name: one.name ?? null,
      joinedAt: timeOrNull(one.join_time),
      leftAt: timeOrNull(one.leave_time),
    })),
    analytics: {
      sentiment: {
        positive: numberOrNull(sentiments?.positive_pct),
        neutral: numberOrNull(sentiments?.neutral_pct),
        negative: numberOrNull(sentiments?.negative_pct),
      },
      categories: {
        questions: numberOrNull(categories?.questions),
        dates: numberOrNull(categories?.date_times),
        metrics: numberOrNull(categories?.metrics),
        tasks: numberOrNull(categories?.tasks),
      },
      speakers: (transcript.analytics?.speakers ?? []).map((one) => ({
        name: one.name ?? null,
        seconds: numberOrNull(one.duration),
        share: numberOrNull(one.duration_pct),
        words: numberOrNull(one.word_count),
        wordsPerMinute: numberOrNull(one.words_per_minute),
        questions: numberOrNull(one.questions),
        fillerWords: numberOrNull(one.filler_words),
        longestMonologue: numberOrNull(one.longest_monologue),
        monologues: numberOrNull(one.monologues_count),
      })),
    },
    calendarId: transcript.calendar_id ?? null,
    calendarEventId: transcript.cal_id ?? null,
    privacy: transcript.privacy ?? null,
    summaryStatus: transcript.meeting_info?.summary_status ?? null,
  };
}

/** Saves the meeting, replacing the row with the same Fireflies id. */
export async function upsertMeeting(db: Db, meeting: MeetingRecord): Promise<void> {
  const { sentiment } = meeting.analytics;
  await db.query(
    `insert into meetings
       (fireflies_id, title, started_at, duration_minutes, organizer_email, attendees, summary, transcript_url, sentences,
        meeting_type, topics, chapters, attendance, analytics, positive_pct, neutral_pct, negative_pct,
        calendar_id, calendar_event_id, privacy, summary_status)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
     on conflict (fireflies_id) do update set
       title = excluded.title, started_at = excluded.started_at, duration_minutes = excluded.duration_minutes,
       organizer_email = excluded.organizer_email, attendees = excluded.attendees, summary = excluded.summary,
       transcript_url = excluded.transcript_url, sentences = excluded.sentences,
       meeting_type = excluded.meeting_type, topics = excluded.topics, chapters = excluded.chapters,
       attendance = excluded.attendance, analytics = excluded.analytics, positive_pct = excluded.positive_pct,
       neutral_pct = excluded.neutral_pct, negative_pct = excluded.negative_pct, calendar_id = excluded.calendar_id,
       calendar_event_id = excluded.calendar_event_id, privacy = excluded.privacy,
       summary_status = excluded.summary_status, synced_at = now()`,
    [
      meeting.firefliesId,
      meeting.title,
      meeting.startedAt,
      meeting.durationMinutes,
      meeting.organizerEmail,
      JSON.stringify(meeting.attendees),
      JSON.stringify(meeting.summary),
      meeting.transcriptUrl,
      JSON.stringify(meeting.sentences),
      meeting.meetingType,
      JSON.stringify(meeting.topics),
      JSON.stringify(meeting.chapters),
      JSON.stringify(meeting.attendance),
      JSON.stringify(meeting.analytics),
      sentiment.positive,
      sentiment.neutral,
      sentiment.negative,
      meeting.calendarId,
      meeting.calendarEventId,
      meeting.privacy,
      meeting.summaryStatus,
    ],
  );
}

/**
 * The Fireflies ids already saved with their summary, so a backfill fetches
 * only what is missing. A meeting saved before Fireflies finished its summary
 * is fetched again, since the webhook for it may never come (it fires only for
 * meetings meetings@ organizes).
 */
export async function completeFirefliesIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ fireflies_id: string }>(
    `select fireflies_id from meetings
      where fireflies_id = any($1::text[]) and coalesce(summary->>'overview', '') <> ''`,
    [ids],
  );
  return new Set(rows.map((row) => row.fireflies_id));
}
