import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { autodeskProjectUrl, countForStatus, fullAddress, isArchived, jobStatusFilter, listJobSummaries, mapUrl, readJob, toolNames, visibleJobs } from "./read";

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

  it("hides archived jobs by default and lists every job for all", async () => {
    expect((await listJobSummaries(db)).map((one) => one.id)).toEqual([ELM, OAK]);
    expect((await listJobSummaries(db, "", "all")).map((one) => one.id)).toEqual([ELM, OAK, PINE]);
    expect(await listJobSummaries(db, "c00902")).toEqual([]);
    expect((await listJobSummaries(db, "c00902", "all")).map((one) => one.id)).toEqual([PINE]);
  });

  it("keeps a job with no status in the default list", async () => {
    await db.query(`update jobs set status = null where id = $1`, [ELM]);
    expect((await listJobSummaries(db)).map((one) => one.id)).toContain(ELM);
    await db.query(`update jobs set status = 'active' where id = $1`, [ELM]);
  });

  it("lists active jobs first with their meeting count and last meeting", async () => {
    const jobs = await listJobSummaries(db, "", "all");
    expect(jobs.map((one) => one.name)).toEqual(["Synthetic Elm School", "Synthetic Oak Residences", "Synthetic Pine Offices"]);
    const oak = jobs.find((one) => one.id === OAK);
    expect(oak).toMatchObject({ meetingCount: 2, lastMeetingAt: "2026-10-08T14:00:00.000Z", city: "Example City" });
    expect(jobs.find((one) => one.id === PINE)).toMatchObject({ meetingCount: 0, lastMeetingAt: null });
  });

  it("filters by name or job number, and by status", async () => {
    expect((await listJobSummaries(db, "c00902", "all")).map((one) => one.id)).toEqual([PINE]);
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
    expect(jobStatusFilter("all")).toBe("all");
    expect(jobStatusFilter("closed")).toBe("");
    expect(jobStatusFilter(["active"])).toBe("");
  });

  it("reads the LA-2881 details, with an empty tool list when none were synced", async () => {
    await db.query(
      `update jobs set address_line1 = '100 Example Street', postal_code = '00001', latitude = 40.75, longitude = -73.25,
         member_count = 12, company_count = 3, sheet_count = null, autodesk_tools = '{build,cost,docs}' where id = $1`,
      [OAK],
    );
    expect(await readJob(db, OAK)).toMatchObject({
      addressLine1: "100 Example Street",
      postalCode: "00001",
      latitude: 40.75,
      longitude: -73.25,
      memberCount: 12,
      companyCount: 3,
      sheetCount: null,
      autodeskTools: ["build", "cost", "docs"],
    });
    expect(await readJob(db, PINE)).toMatchObject({ addressLine1: null, latitude: null, autodeskTools: [] });
  });

  it("writes the address on one line and maps the pin, else the address, else nothing", () => {
    const place = { addressLine1: "100 Example Street", city: "Example City", stateOrProvince: "NY", postalCode: "00001" };
    expect(fullAddress(place)).toBe("100 Example Street, Example City, NY 00001");
    expect(fullAddress({ ...place, addressLine1: null, postalCode: null })).toBe("Example City, NY");
    expect(mapUrl({ ...place, latitude: 40.75, longitude: -73.25 })).toBe(
      "https://www.google.com/maps/search/?api=1&query=40.75%2C-73.25",
    );
    expect(mapUrl({ ...place, latitude: null, longitude: null })).toBe(
      "https://www.google.com/maps/search/?api=1&query=100+Example+Street%2C+Example+City%2C+NY+00001",
    );
    expect(mapUrl({ ...place, addressLine1: null, latitude: null, longitude: null })).toBeNull();
  });

  it("names the Autodesk tools in title case, A to Z, without the admin keys", () => {
    expect(toolNames(["projectAdministration", "takeoff", "build", "designCollaboration", "accountAdministration", "datum"])).toEqual([
      "Build",
      "Design Collaboration",
      "Takeoff",
    ]);
    expect(toolNames(["someNewTool"])).toEqual(["Some New Tool"]);
  });

  it("links to the project in Autodesk Build", () => {
    expect(autodeskProjectUrl("4bad629d-e4c9-4dd8-8a91-54fe3a4c4c69")).toBe(
      "https://acc.autodesk.com/build/home/projects/4bad629d-e4c9-4dd8-8a91-54fe3a4c4c69",
    );
  });
});

describe("visibleJobs", () => {
  const jobs = [
    { id: "a", status: "active" },
    { id: "b", status: "archived" },
    { id: "c", status: "pending" },
    { id: "d", status: null },
  ];

  it("drops archived jobs by default and keeps the rest", () => {
    expect(visibleJobs(jobs, false).map((one) => one.id)).toEqual(["a", "c", "d"]);
  });

  it("brings archived jobs back when asked", () => {
    expect(visibleJobs(jobs, true).map((one) => one.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("keeps an archived job that is the current value, and ignores empty keeps", () => {
    expect(visibleJobs(jobs, false, ["b"]).map((one) => one.id)).toEqual(["a", "b", "c", "d"]);
    expect(visibleJobs(jobs, false, [null, undefined, ""]).map((one) => one.id)).toEqual(["a", "c", "d"]);
  });

  it("names only the archived status", () => {
    expect(isArchived("archived")).toBe(true);
    expect([isArchived("suspended"), isArchived(null)]).toEqual([false, false]);
  });
});

describe("countForStatus", () => {
  const jobs = [{ status: "active" }, { status: "active" }, { status: "archived" }, { status: "pending" }, { status: null }];

  it("counts what the list shows under each filter", () => {
    expect(countForStatus(jobs, "")).toBe(4);
    expect(countForStatus(jobs, "all")).toBe(5);
    expect(countForStatus(jobs, "archived")).toBe(1);
    expect(countForStatus(jobs, "active")).toBe(2);
    expect(countForStatus(jobs, "suspended")).toBe(0);
  });
});
