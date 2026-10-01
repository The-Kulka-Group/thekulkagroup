import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { setRateClientForTests, type RateClient } from "@/lib/rom/rate-suggestion";
import { readScheduleProposalState } from "@/lib/rom/schedule-proposal";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1399. POST proposes the project's weeks from completed jobs and saves the
// proposal on the project. The model is a fake; the completed job is
// synthetic, numbered TEST-, and exists only in this test's database.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function post(id: string, headers: Record<string, string> = {}) {
  return POST(new Request(`http://localhost/api/rom/projects/${id}/schedule-proposal`, { method: "POST", headers }), {
    params: Promise.resolve({ id }),
  });
}

let calls = 0;
function useModel(reply: object) {
  const client: RateClient = {
    beta: {
      messages: {
        create: async () => {
          calls += 1;
          return {
            model: "claude-opus-5",
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(reply) }],
          } as unknown as Anthropic.Beta.Messages.BetaMessage;
        },
      },
    },
  };
  setRateClientForTests(client);
}

const phase = (weeks: number) => ({ weeks, leaveBlank: false, jobNumbers: ["TEST-0001"], reason: "Scaled from TEST-0001." });
const goodAnswer = {
  jobs: [{ jobNumber: "TEST-0001", why: "Same type and kind." }],
  phases: { precon: phase(12), construction: phase(62), closeout: phase(8) },
  reasoning: "One close job.",
};

async function recordSyntheticJob() {
  // The seeded test project is 1,000 GSF multifamily new build.
  await db.query(
    `insert into completed_jobs
       (job_number, name, building_type, construction_kind, gross_square_feet,
        precon_weeks, precon_source, construction_weeks, construction_source, closeout_weeks, closeout_source, recorded_by)
     values ('TEST-0001', 'Synthetic Test Job', 'multifamily', 'new', 1200,
        10, 'Synthetic', 60, 'Synthetic', 6, 'Synthetic', 'test')`,
  );
}

async function saved() {
  const { rows } = await db.query<{ schedule_proposal: unknown }>(`select schedule_proposal from projects where id = $1`, [
    TEST_PROJECT_ID,
  ]);
  return rows[0].schedule_proposal;
}

beforeEach(async () => {
  db = await seededDatabase();
  calls = 0;
});

afterEach(async () => {
  setRateClientForTests(null);
  await db.close();
});

describe("POST /api/rom/projects/[id]/schedule-proposal", () => {
  it("refuses a signed-out request", async () => {
    expect((await post(TEST_PROJECT_ID, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("says no completed job is recorded, asks nothing, and leaves every phase blank", async () => {
    useModel(goodAnswer);
    const response = await post(TEST_PROJECT_ID);
    expect(response.status).toBe(200);
    const { proposal } = await response.json();
    expect(proposal.status).toBe("no_jobs");
    expect(Object.values(proposal.phases).map((p) => (p as { weeks: unknown }).weeks)).toEqual([null, null, null]);
    expect(calls).toBe(0);
  });

  it("proposes from a close job, saves it on the project, and does not ask twice", async () => {
    await recordSyntheticJob();
    useModel(goodAnswer);
    expect(await readScheduleProposalState(db, TEST_PROJECT_ID)).toEqual({ kind: "pending" });

    const first = await (await post(TEST_PROJECT_ID)).json();
    expect(first.proposal).toMatchObject({ status: "proposed", phases: { construction: { weeks: 62 } } });
    expect(await saved()).toMatchObject({ status: "proposed" });
    expect(await readScheduleProposalState(db, TEST_PROJECT_ID)).toMatchObject({ kind: "ready", proposal: first.proposal });

    await post(TEST_PROJECT_ID);
    expect(calls).toBe(1);
  });

  it("asks again once the project's facts change", async () => {
    await recordSyntheticJob();
    useModel(goodAnswer);
    await post(TEST_PROJECT_ID);
    await db.query(`update projects set gross_square_feet = 1100 where id = $1`, [TEST_PROJECT_ID]);
    expect(await readScheduleProposalState(db, TEST_PROJECT_ID)).toEqual({ kind: "pending" });
    await post(TEST_PROJECT_ID);
    expect(calls).toBe(2);
  });

  it("proposes no weeks when the answer cites a job that is not recorded, and records the failure", async () => {
    await recordSyntheticJob();
    useModel({ ...goodAnswer, jobs: [{ jobNumber: "C-00456", why: "Invented." }] });
    const response = await post(TEST_PROJECT_ID);
    expect(response.status).toBe(502);
    const { error } = await response.json();
    expect(error).toMatch(/Enter the weeks/);
    expect(await saved()).toMatchObject({ status: "failed", error, failedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(((await saved()) as { inputKey?: unknown }).inputKey).toEqual(expect.any(String));
  });

  it("opens a failed proposal as failed, with its words, and does not ask again until the facts change", async () => {
    await recordSyntheticJob();
    useModel({ ...goodAnswer, jobs: [{ jobNumber: "C-00456", why: "Invented." }] });
    const { error } = await (await post(TEST_PROJECT_ID)).json();
    expect(await readScheduleProposalState(db, TEST_PROJECT_ID)).toEqual({ kind: "failed", error });

    // Asking again for the same facts gives back the recorded failure, not a new model call.
    const again = await post(TEST_PROJECT_ID);
    expect(again.status).toBe(502);
    expect((await again.json()).error).toBe(error);
    expect(calls).toBe(1);

    await db.query(`update projects set gross_square_feet = 1100 where id = $1`, [TEST_PROJECT_ID]);
    expect(await readScheduleProposalState(db, TEST_PROJECT_ID)).toEqual({ kind: "pending" });
    useModel(goodAnswer);
    const fresh = await (await post(TEST_PROJECT_ID)).json();
    expect(fresh.proposal).toMatchObject({ status: "proposed" });
    expect(calls).toBe(2);
  });

  it("says proposals are not set up when a close job exists and there is no model key", async () => {
    await recordSyntheticJob();
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      expect((await post(TEST_PROJECT_ID)).status).toBe(503);
      // A missing key is the site's setup, not this project's answer, so nothing is recorded.
      expect(await saved()).toBeNull();
    } finally {
      if (key !== undefined) process.env.ANTHROPIC_API_KEY = key;
    }
  });

  it("refuses a project that does not exist", async () => {
    expect((await post("00000000-0000-4000-8000-00000000abcd")).status).toBe(404);
    expect((await post("not-a-uuid")).status).toBe(404);
  });
});
