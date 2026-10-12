// LA-2279. The Fireflies GraphQL API (https://docs.fireflies.ai), read with
// the account's API key. Only the fields Kulka stores are requested.

const ENDPOINT = "https://api.fireflies.ai/graphql";

const TRANSCRIPT_FIELDS = `
  id
  title
  date
  duration
  organizer_email
  transcript_url
  calendar_id
  cal_id
  privacy
  meeting_attendees { displayName email name }
  meeting_attendance { name join_time leave_time }
  meeting_info { summary_status }
  summary {
    overview action_items keywords shorthand_bullet meeting_type topics_discussed
    transcript_chapters
  }
  analytics {
    sentiments { negative_pct neutral_pct positive_pct }
    categories { questions date_times metrics tasks }
    speakers {
      name duration duration_pct word_count words_per_minute questions filler_words
      longest_monologue monologues_count
    }
  }
  sentences {
    index speaker_name text start_time end_time
    ai_filters { task pricing metric question date_and_time sentiment }
  }
`;

export type FirefliesSpeakerAnalytics = {
  name: string | null;
  duration: number | null;
  duration_pct: number | null;
  word_count: number | null;
  words_per_minute: number | null;
  questions: number | null;
  filler_words: number | null;
  longest_monologue: number | null;
  monologues_count: number | null;
};

/** A transcript as Fireflies returns it, with the fields requested above. */
export type FirefliesTranscript = {
  id: string;
  title: string | null;
  /** Milliseconds since the epoch. */
  date: number | string | null;
  /** Minutes. */
  duration: number | null;
  organizer_email: string | null;
  transcript_url: string | null;
  calendar_id?: string | null;
  cal_id?: string | null;
  privacy?: string | null;
  meeting_attendees: { displayName: string | null; email: string | null; name: string | null }[] | null;
  meeting_attendance?: { name: string | null; join_time: string | number | null; leave_time: string | number | null }[] | null;
  meeting_info?: { summary_status: string | null } | null;
  summary: {
    overview: string | null;
    action_items: string | null;
    keywords: string[] | null;
    shorthand_bullet: string | null;
    meeting_type?: string | null;
    topics_discussed?: string[] | string | null;
    transcript_chapters?: unknown;
  } | null;
  analytics?: {
    sentiments: { negative_pct: number | null; neutral_pct: number | null; positive_pct: number | null } | null;
    categories: { questions: number | null; date_times: number | null; metrics: number | null; tasks: number | null } | null;
    speakers: FirefliesSpeakerAnalytics[] | null;
  } | null;
  sentences: {
    index: number;
    speaker_name: string | null;
    text: string;
    start_time: number;
    end_time: number;
    ai_filters?: Record<string, string | null> | null;
  }[] | null;
};

export class FirefliesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FirefliesError";
  }
}

/** Reads the API key, or null when Fireflies is not set up. */
export function firefliesKey(): string | null {
  const key = process.env.FIREFLIES_API_KEY?.trim();
  return key ? key : null;
}

async function query<T>(key: string, text: string, variables: Record<string, unknown>): Promise<T> {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query: text, variables }),
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as { data?: T; errors?: { message: string }[] } | null;
  if (!response.ok || !body?.data) {
    throw new FirefliesError(body?.errors?.[0]?.message ?? `Fireflies answered ${response.status}.`);
  }
  return body.data;
}

/** One transcript by its Fireflies id (the webhook's meetingId). */
export async function fetchTranscript(key: string, id: string): Promise<FirefliesTranscript> {
  const data = await query<{ transcript: FirefliesTranscript | null }>(
    key,
    `query Transcript($id: String!) { transcript(id: $id) { ${TRANSCRIPT_FIELDS} } }`,
    { id },
  );
  if (!data.transcript) throw new FirefliesError(`Fireflies has no transcript ${id}.`);
  return data.transcript;
}

/** The ids of transcripts created since `from`, newest first, 50 per page as Fireflies allows. */
export async function listTranscriptIds(key: string, from: Date, max = 200): Promise<string[]> {
  const ids: string[] = [];
  for (let skip = 0; skip < max; skip += 50) {
    const data = await query<{ transcripts: { id: string }[] }>(
      key,
      `query Transcripts($fromDate: DateTime, $limit: Int, $skip: Int) {
        transcripts(fromDate: $fromDate, limit: $limit, skip: $skip) { id }
      }`,
      { fromDate: from.toISOString(), limit: 50, skip },
    );
    ids.push(...data.transcripts.map((one) => one.id));
    if (data.transcripts.length < 50) break;
  }
  return ids;
}

/** The live Fireflies reader for lib/meetings/sync.ts. */
export function firefliesReader(key: string) {
  return {
    fetchTranscript: (id: string) => fetchTranscript(key, id),
    listTranscriptIds: (from: Date) => listTranscriptIds(key, from),
  };
}
