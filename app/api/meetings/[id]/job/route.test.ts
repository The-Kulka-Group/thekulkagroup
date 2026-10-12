import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

// LA-2281. A person's correction of a meeting's job, against a seeded Postgres.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
const { PATCH } = await import("./route");

const MEETING = "00000000-0000-4000-8000-000000000c01";
const JOB = "00000000-0000-4000-8000-000000000c02";
const patch = (id: string, body: unknown) =>
  PATCH(new Request(`http://localhost/api/meetings/${id}/job`, { method: "PATCH", body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  });

beforeAll(async () => {
  db = await seededDatabase();
  await db.query(`insert into jobs (id, autodesk_id, name, job_number) values ($1, 'acc-1', 'Synthetic Job', 'C00001')`, [JOB]);
  await db.query(`insert into meetings (id, fireflies_id, title, started_at) values ($1, 'FF-1', 'Weekly OAC', now())`, [MEETING]);
}, 60_000);
afterAll(async () => db?.close());

describe("PATCH /api/meetings/[id]/job", () => {
  it("sets a job by hand, or no job", async () => {
    expect((await patch(MEETING, { jobId: JOB })).status).toBe(200);
    let row = (await db.query<{ job_id: string | null; match_source: string }>(`select job_id, match_source from meetings`)).rows[0];
    expect(row).toEqual({ job_id: JOB, match_source: "manual" });

    expect((await patch(MEETING, { jobId: null })).status).toBe(200);
    row = (await db.query<{ job_id: string | null; match_source: string }>(`select job_id, match_source from meetings`)).rows[0];
    expect(row).toEqual({ job_id: null, match_source: "manual" });
  });

  it("refuses a malformed body and an unknown job", async () => {
    expect((await patch(MEETING, {})).status).toBe(400);
    expect((await patch(MEETING, { jobId: "C00001" })).status).toBe(400);
    expect((await patch(MEETING, { jobId: "00000000-0000-4000-8000-0000000000ff" })).status).toBe(404);
  });
});
