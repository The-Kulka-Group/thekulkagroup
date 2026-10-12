import type { Db } from "@/lib/db";

import type { FirefliesTranscript } from "./fireflies";

// LA-2279. Kulka's copy of each Fireflies meeting.

export type MeetingAttendee = { name: string | null; email: string | null };
export type MeetingSentence = { index: number; speaker: string | null; text: string; start: number; end: number };
export type MeetingSummary = {
  overview: string | null;
  actionItems: string | null;
  keywords: string[];
  bullets: string | null;
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
};

/** A Fireflies transcript in Kulka's shape. */
export function meetingFromTranscript(transcript: FirefliesTranscript): MeetingRecord {
  const date = Number(transcript.date);
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
    })),
  };
}

/** Saves the meeting, replacing the row with the same Fireflies id. */
export async function upsertMeeting(db: Db, meeting: MeetingRecord): Promise<void> {
  await db.query(
    `insert into meetings
       (fireflies_id, title, started_at, duration_minutes, organizer_email, attendees, summary, transcript_url, sentences)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (fireflies_id) do update set
       title = excluded.title, started_at = excluded.started_at, duration_minutes = excluded.duration_minutes,
       organizer_email = excluded.organizer_email, attendees = excluded.attendees, summary = excluded.summary,
       transcript_url = excluded.transcript_url, sentences = excluded.sentences, synced_at = now()`,
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
    ],
  );
}

/** The Fireflies ids already saved, so a backfill fetches only what is missing. */
export async function savedFirefliesIds(db: Db, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ fireflies_id: string }>(
    `select fireflies_id from meetings where fireflies_id = any($1::text[])`,
    [ids],
  );
  return new Set(rows.map((row) => row.fireflies_id));
}
