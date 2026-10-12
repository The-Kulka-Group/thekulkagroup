import type { Db } from "@/lib/db";

// LA-2281. Which Autodesk job a meeting belongs to. The matcher is plain rules
// a person can check, in this order, and it never guesses: a meeting that no
// rule places stays unmatched.
//   1. job_number: the title carries a job number, such as C00456 or C-00456.
//   2. series: another meeting in the same recurring calendar series has a job.
//   3. job_name: the title carries a job's distinctive name word, and exactly
//      one job has that word.
// A person's correction ('manual') always stands.

export type MatchSource = "job_number" | "series" | "job_name" | "manual";
export type MatchJob = { id: string; name: string; jobNumber: string | null };
export type MatchMeeting = { title: string; calendarId: string | null };
export type Match = { jobId: string; source: Exclude<MatchSource, "manual"> } | null;

/** Words too common in job and meeting names to identify a job. */
const COMMON = new Set([
  "the", "and", "for", "project", "projects", "job", "building", "buildings", "apartments", "apartment",
  "residences", "residential", "development", "phase", "weekly", "meeting", "oac", "owner", "new", "site",
  "llc", "inc", "kulka", "group", "street", "avenue", "road", "north", "south", "east", "west",
]);

const compactNumber = (value: string) => value.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** Job numbers written in the title, compacted ("C-00456" and "C 00456" read as C00456). */
function numbersIn(title: string): Set<string> {
  const found = new Set<string>();
  for (const hit of title.matchAll(/\b([A-Za-z]{1,3})[\s-]?(\d{3,6})\b/g)) found.add(compactNumber(hit[1] + hit[2]));
  return found;
}

const wordsOf = (text: string) => text.split(/[^A-Za-z0-9&]+/).filter(Boolean);

/** Each job's distinctive word: its first uncommon word that no other job starts with. */
export function distinctiveWords(jobs: MatchJob[]): Map<string, string> {
  const firstWord = new Map<string, string>();
  for (const job of jobs) {
    const word = wordsOf(job.name).find((one) => !COMMON.has(one.toLowerCase()) && !/^\d+$/.test(one));
    if (word) firstWord.set(job.id, word);
  }
  const counts = new Map<string, number>();
  for (const word of firstWord.values()) counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) ?? 0) + 1);
  return new Map([...firstWord].filter(([, word]) => counts.get(word.toLowerCase()) === 1));
}

/** Whether the title has `word` as a whole word. Short words (3 letters or fewer) must match case too. */
function titleHas(title: string, word: string): boolean {
  const titleWords = wordsOf(title);
  return word.length <= 3
    ? titleWords.includes(word)
    : titleWords.some((one) => one.toLowerCase() === word.toLowerCase());
}

/** The job for one meeting, or null. `seriesJob` is the job another meeting in its calendar series has. */
export function matchMeeting(meeting: MatchMeeting, jobs: MatchJob[], seriesJob: string | null): Match {
  const numbers = numbersIn(meeting.title);
  const byNumber = jobs.filter((job) => job.jobNumber && numbers.has(compactNumber(job.jobNumber)));
  if (byNumber.length === 1) return { jobId: byNumber[0].id, source: "job_number" };
  if (seriesJob && jobs.some((job) => job.id === seriesJob)) return { jobId: seriesJob, source: "series" };
  const words = distinctiveWords(jobs);
  const byName = jobs.filter((job) => {
    const word = words.get(job.id);
    return word !== undefined && titleHas(meeting.title, word);
  });
  return byName.length === 1 ? { jobId: byName[0].id, source: "job_name" } : null;
}

/**
 * Matches every meeting a person has not placed by hand, against the current
 * job list. Safe to run any number of times; returns how many meetings have
 * a job afterwards.
 */
export async function matchMeetings(db: Db): Promise<number> {
  const { rows: jobRows } = await db.query<{ id: string; name: string; job_number: string | null }>(
    `select id, name, job_number from jobs where coalesce(status, 'active') <> 'archived'`,
  );
  const jobs = jobRows.map((row) => ({ id: row.id, name: row.name, jobNumber: row.job_number }));
  const { rows } = await db.query<{
    id: string;
    title: string;
    calendar_id: string | null;
    job_id: string | null;
    match_source: MatchSource | null;
  }>(`select id, title, calendar_id, job_id, match_source from meetings order by started_at`);

  // A series takes its job from any meeting in it a person placed, else from a number match.
  const seriesJob = new Map<string, string>();
  for (const row of rows) {
    if (row.calendar_id && row.job_id && row.match_source === "manual") seriesJob.set(row.calendar_id, row.job_id);
  }
  for (const row of rows) {
    if (!row.calendar_id || seriesJob.has(row.calendar_id)) continue;
    const byNumber = matchMeeting({ title: row.title, calendarId: null }, jobs, null);
    if (byNumber?.source === "job_number") seriesJob.set(row.calendar_id, byNumber.jobId);
  }

  let matched = 0;
  for (const row of rows) {
    if (row.match_source === "manual") {
      if (row.job_id) matched += 1;
      continue;
    }
    const match = matchMeeting(
      { title: row.title, calendarId: row.calendar_id },
      jobs,
      row.calendar_id ? (seriesJob.get(row.calendar_id) ?? null) : null,
    );
    if (match) matched += 1;
    if ((match?.jobId ?? null) !== row.job_id || (match?.source ?? null) !== row.match_source) {
      await db.query(`update meetings set job_id = $2, match_source = $3 where id = $1`, [
        row.id,
        match?.jobId ?? null,
        match?.source ?? null,
      ]);
    }
  }
  return matched;
}

/** A person's correction: a job, or null for a meeting that belongs to no job. */
export async function setMeetingJob(db: Db, meetingId: string, jobId: string | null): Promise<boolean> {
  const { rows } = await db.query<{ id: string }>(
    `update meetings set job_id = $2, match_source = 'manual'
      where id = $1 and ($2::uuid is null or exists (select 1 from jobs where id = $2::uuid))
      returning id`,
    [meetingId, jobId],
  );
  return rows.length > 0;
}
