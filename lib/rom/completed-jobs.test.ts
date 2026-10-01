import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { readCompletedJobs } from "./completed-jobs";

// LA-1399: 20260929060000_completed_jobs.sql records Kulka's completed jobs
// with each phase's dates or weeks and where they came from. It ships empty.
// Every job below is synthetic, numbered TEST-, and exists only in this test
// process.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const insert = (columns: Record<string, unknown>) => {
  const base = {
    job_number: "TEST-0001",
    name: "Synthetic Test Job, Mid-Rise Multifamily",
    building_type: "multifamily",
    construction_kind: "new",
    gross_square_feet: 60000,
    recorded_by: "test",
    ...columns,
  };
  const names = Object.keys(base);
  return db.query(
    `insert into completed_jobs (${names.join(", ")}) values (${names.map((_, i) => `$${i + 1}`).join(", ")})`,
    Object.values(base),
  );
};

describe("completed_jobs (LA-1399)", () => {
  it("ships empty: no migration seeds a job", async () => {
    expect(await readCompletedJobs(db)).toEqual([]);
  });

  it("reads a phase recorded by dates as the weeks between them, with its source", async () => {
    await insert({
      stories_above_grade: 5,
      precon_start: "2024-01-01",
      precon_end: "2024-03-25",
      precon_source: "Synthetic: precon kickoff and permit dates",
      construction_start: "2024-03-25",
      construction_end: "2025-05-19",
      construction_source: "Synthetic: NTP and TCO dates",
      closeout_weeks: 8,
      closeout_source: "Synthetic: typed weeks",
    });
    expect(await readCompletedJobs(db)).toEqual([
      {
        jobNumber: "TEST-0001",
        name: "Synthetic Test Job, Mid-Rise Multifamily",
        buildingType: "multifamily",
        constructionKind: "new",
        grossSquareFeet: 60000,
        storiesAboveGrade: 5,
        phases: {
          // 84 days and 420 days.
          precon: { weeks: 12, source: "Synthetic: precon kickoff and permit dates" },
          construction: { weeks: 60, source: "Synthetic: NTP and TCO dates" },
          closeout: { weeks: 8, source: "Synthetic: typed weeks" },
        },
      },
    ]);
  });

  it("reads a phase with nothing recorded as null", async () => {
    await insert({ construction_weeks: 40, construction_source: "Synthetic" });
    const [job] = await readCompletedJobs(db);
    expect(job.phases.precon).toBeNull();
    expect(job.phases.closeout).toBeNull();
    expect(job.storiesAboveGrade).toBeNull();
  });

  it("refuses a date or weeks with no source", async () => {
    await expect(insert({ construction_weeks: 40 })).rejects.toThrow();
    await expect(insert({ precon_start: "2024-01-01", precon_end: "2024-02-01", precon_source: "  " })).rejects.toThrow();
  });

  it("refuses a source with no date or weeks behind it", async () => {
    await expect(insert({ closeout_source: "Synthetic" })).rejects.toThrow();
  });

  it("refuses half a date pair, an end before its start, and both dates and weeks", async () => {
    await expect(insert({ precon_start: "2024-01-01", precon_source: "x" })).rejects.toThrow();
    await expect(
      insert({ precon_start: "2024-03-01", precon_end: "2024-01-01", precon_source: "x" }),
    ).rejects.toThrow();
    await expect(
      insert({ precon_start: "2024-01-01", precon_end: "2024-02-01", precon_weeks: 4, precon_source: "x" }),
    ).rejects.toThrow();
  });

  it("refuses a second row with the same job number, a zero area and negative weeks", async () => {
    await insert({ construction_weeks: 40, construction_source: "x" });
    await expect(insert({ construction_weeks: 40, construction_source: "x" })).rejects.toThrow();
    await expect(insert({ job_number: "TEST-0002", gross_square_feet: 0 })).rejects.toThrow();
    await expect(insert({ job_number: "TEST-0003", closeout_weeks: -1, closeout_source: "x" })).rejects.toThrow();
  });

  it("gives projects a place to keep their schedule proposal", async () => {
    const { rows } = await db.query<{ schedule_proposal: unknown }>(`select schedule_proposal from projects limit 1`);
    expect(rows[0].schedule_proposal).toBeNull();
  });
});
