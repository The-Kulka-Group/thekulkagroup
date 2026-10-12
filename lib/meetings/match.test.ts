import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

import { distinctiveWords, matchMeeting, matchMeetings, setMeetingJob } from "./match";

// LA-2281. The meeting-to-job matcher. Every job and meeting is synthetic.

const JF = { id: "00000000-0000-4000-8000-0000000000a1", name: "JF Residences", jobNumber: "C00456" };
const FIELDSTONE = { id: "00000000-0000-4000-8000-0000000000a2", name: "Fieldstone Apartments", jobNumber: "C00449" };
const FIELD_HOUSE = { id: "00000000-0000-4000-8000-0000000000a3", name: "The Field House", jobNumber: null };
const JOBS = [JF, FIELDSTONE, FIELD_HOUSE];
const meeting = (title: string) => ({ title, calendarId: null });

describe("matchMeeting", () => {
  it("matches a job number however it is written", () => {
    for (const title of ["C00456 Weekly OAC", "OAC - C-00456", "c 00456 coordination"]) {
      expect(matchMeeting(meeting(title), JOBS, null)).toEqual({ jobId: JF.id, source: "job_number" });
    }
  });

  it("follows the meeting's calendar series before the name", () => {
    expect(matchMeeting(meeting("Weekly OAC"), JOBS, FIELDSTONE.id)).toEqual({ jobId: FIELDSTONE.id, source: "series" });
  });

  it("matches a distinctive name word, and short words only in the same case", () => {
    expect(matchMeeting(meeting("Fieldstone Owner Meeting"), JOBS, null)).toEqual({ jobId: FIELDSTONE.id, source: "job_name" });
    expect(matchMeeting(meeting("JF Weekly OAC"), JOBS, null)).toEqual({ jobId: JF.id, source: "job_name" });
    expect(matchMeeting(meeting("jf sync"), JOBS, null)).toBeNull();
  });

  it("never guesses: no rule, or two jobs at once, leaves the meeting unmatched", () => {
    expect(matchMeeting(meeting("Weekly Ops Huddle"), JOBS, null)).toBeNull();
    expect(matchMeeting(meeting("JF and Fieldstone schedule review"), JOBS, null)).toBeNull();
  });

  it("drops a first word two jobs share", () => {
    const shared = [{ id: "x", name: "Harbor North", jobNumber: null }, { id: "y", name: "Harbor South", jobNumber: null }];
    expect(distinctiveWords(shared).size).toBe(0);
    // "The" and "Field" are not distinctive here: "Field" is FIELD_HOUSE's own word, and the title has "Fieldstone".
    expect(distinctiveWords(JOBS).get(FIELD_HOUSE.id)).toBe("Field");
  });
});

describe("matchMeetings and setMeetingJob", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;
  beforeAll(async () => {
    db = await seededDatabase();
  }, 60_000);
  beforeEach(async () => {
    await db.query(`truncate meetings, jobs cascade`);
    for (const job of JOBS) {
      await db.query(`insert into jobs (id, autodesk_id, name, job_number, status) values ($1, $2, $3, $4, 'active')`, [
        job.id,
        `acc-${job.id}`,
        job.name,
        job.jobNumber,
      ]);
    }
  });
  afterAll(async () => db?.close());

  const insert = (id: string, title: string, calendarId: string | null, minutesAgo: number) =>
    db.query(
      `insert into meetings (id, fireflies_id, title, started_at, calendar_id)
       values ($1, $2, $3, now() - ($4 || ' minutes')::interval, $5)`,
      [id, `ff-${id}`, title, String(minutesAgo), calendarId],
    );
  const jobOf = async (id: string) =>
    (await db.query<{ job_id: string | null; match_source: string | null }>(
      `select job_id, match_source from meetings where id = $1`,
      [id],
    )).rows[0];

  it("places a whole series from one numbered meeting, and keeps a person's correction", async () => {
    await insert("00000000-0000-4000-8000-000000000b01", "C00449 OAC", "series-1", 30);
    await insert("00000000-0000-4000-8000-000000000b02", "Weekly OAC", "series-1", 20);
    await insert("00000000-0000-4000-8000-000000000b03", "Weekly Ops Huddle", null, 10);
    expect(await matchMeetings(db as Db)).toBe(2);
    expect(await jobOf("00000000-0000-4000-8000-000000000b02")).toEqual({ job_id: FIELDSTONE.id, match_source: "series" });
    expect(await jobOf("00000000-0000-4000-8000-000000000b03")).toEqual({ job_id: null, match_source: null });

    // A person moves the series to JF; the matcher follows them and never undoes it.
    expect(await setMeetingJob(db as Db, "00000000-0000-4000-8000-000000000b01", JF.id)).toBe(true);
    await matchMeetings(db as Db);
    expect(await jobOf("00000000-0000-4000-8000-000000000b01")).toEqual({ job_id: JF.id, match_source: "manual" });
    expect(await jobOf("00000000-0000-4000-8000-000000000b02")).toEqual({ job_id: JF.id, match_source: "series" });

    // Marked as no job, an internal meeting stays that way.
    expect(await setMeetingJob(db as Db, "00000000-0000-4000-8000-000000000b03", null)).toBe(true);
    await matchMeetings(db as Db);
    expect(await jobOf("00000000-0000-4000-8000-000000000b03")).toEqual({ job_id: null, match_source: "manual" });
  });

  it("refuses a job that does not exist", async () => {
    await insert("00000000-0000-4000-8000-000000000b04", "Weekly OAC", null, 5);
    expect(await setMeetingJob(db as Db, "00000000-0000-4000-8000-000000000b04", "00000000-0000-4000-8000-0000000000ff")).toBe(false);
  });
});
