import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { autodeskProjectUrl, jobStatusFilter, listJobSummaries, readJob } from "./read";

// LA-2858. The Jobs page reads. Every job and meeting is synthetic.

const OAK = "00000000-0000-4000-8000-0000000000c1";
const PINE = "00000000-0000-4000-8000-0000000000c2";
const ELM = "00000000-0000-4000-8000-0000000000c3";

describe("jobs read", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;
  beforeAll(async () => {
    db = await seededDatabase();
    await db.query(`truncate meetings, jobs cascade`);
    await db.query(
      `insert into jobs (id, autodesk_id, name, job_number, status, city, state_or_province, start_date, end_date) values
         ($1, 'acc-oak', 'Synthetic Oak Residences', 'C00901', 'active', 'Example City', 'NY', '2026-03-02', '2027-08-31'),
         ($2, 'acc-pine', 'Synthetic Pine Offices', 'C00902', 'archived', null, null, null, null),
         ($3, 'acc-elm', 'Synthetic Elm School', null, 'active', null, null, null, null)`,
      [OAK, PINE, ELM],
    );
    await db.query(
      `insert into meetings (fireflies_id, title, started_at, job_id) values
         ('ff-1', 'Oak OAC 1', '2026-10-01T14:00:00Z', $1),
         ('ff-2', 'Oak OAC 2', '2026-10-08T14:00:00Z', $1),
         ('ff-3', 'Unplaced', '2026-10-09T14:00:00Z', null)`,
      [OAK],
    );
  }, 60_000);
  afterAll(async () => db?.close());

  it("lists active jobs first with their meeting count and last meeting", async () => {
    const jobs = await listJobSummaries(db);
    expect(jobs.map((one) => one.name)).toEqual(["Synthetic Elm School", "Synthetic Oak Residences", "Synthetic Pine Offices"]);
    const oak = jobs.find((one) => one.id === OAK);
    expect(oak).toMatchObject({ meetingCount: 2, lastMeetingAt: "2026-10-08T14:00:00.000Z", city: "Example City" });
    expect(jobs.find((one) => one.id === PINE)).toMatchObject({ meetingCount: 0, lastMeetingAt: null });
  });

  it("filters by name or job number, and by status", async () => {
    expect((await listJobSummaries(db, "c00902")).map((one) => one.id)).toEqual([PINE]);
    expect((await listJobSummaries(db, "elm")).map((one) => one.id)).toEqual([ELM]);
    expect((await listJobSummaries(db, "", "archived")).map((one) => one.id)).toEqual([PINE]);
    expect(await listJobSummaries(db, "100%")).toEqual([]);
  });

  it("reads one job with its ACC dates, and nothing for an unknown or malformed id", async () => {
    expect(await readJob(db, OAK)).toMatchObject({
      jobNumber: "C00901",
      startDate: "2026-03-02",
      endDate: "2027-08-31",
      meetingCount: 2,
    });
    expect(await readJob(db, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(await readJob(db, "not-an-id")).toBeNull();
  });

  it("accepts only ACC's statuses as a filter", () => {
    expect(jobStatusFilter("pending")).toBe("pending");
    expect(jobStatusFilter("closed")).toBe("");
    expect(jobStatusFilter(["active"])).toBe("");
  });

  it("links to the project in Autodesk Build", () => {
    expect(autodeskProjectUrl("4bad629d-e4c9-4dd8-8a91-54fe3a4c4c69")).toBe(
      "https://acc.autodesk.com/build/home/projects/4bad629d-e4c9-4dd8-8a91-54fe3a4c4c69",
    );
  });
});
