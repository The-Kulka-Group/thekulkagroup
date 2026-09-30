import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import type { ScheduleFacts } from "@kulka/engine";
import {
  SYNTHETIC_JOBS,
  SYNTHETIC_MIDRISE,
} from "@/packages/engine/src/fixtures/synthetic-completed-jobs";

import type { RateClient } from "./rate-suggestion";
import { proposeSchedule, SCHEDULE_MODEL } from "./schedule-proposal";

// LA-1399. The fake stands in for Claude; nothing reaches the network. The
// completed jobs are synthetic test fixtures, numbered TEST-.

function fake(reply: object | string, stop: string = "end_turn") {
  const calls: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const client: RateClient = {
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return {
            model: SCHEDULE_MODEL,
            stop_reason: stop,
            content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }],
          } as unknown as Anthropic.Beta.Messages.BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}

const facts: ScheduleFacts = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 80000,
  storiesAboveGrade: 6,
};

const phase = (weeks: number) => ({ weeks, leaveBlank: false, jobNumbers: ["TEST-0001"], reason: "Scaled from TEST-0001." });
const goodAnswer = {
  jobs: [{ jobNumber: "TEST-0001", why: "Same type and kind, a third larger." }],
  phases: { precon: phase(14), construction: phase(70), closeout: phase(8) },
  reasoning: "One close job; weeks scaled up for the larger area.",
};

describe("proposeSchedule", () => {
  it("asks nothing and leaves the weeks blank when no completed job is recorded", async () => {
    const { client, calls } = fake(goodAnswer);
    const result = await proposeSchedule(client, facts, [], "2026-09-29");
    expect(calls).toHaveLength(0);
    expect(result).toMatchObject({ ok: true, proposal: { status: "no_jobs" } });
  });

  it("needs no model key to say the table is empty", async () => {
    expect(await proposeSchedule(null, facts, [], "2026-09-29")).toMatchObject({ ok: true, proposal: { status: "no_jobs" } });
  });

  it("sends only the close jobs and the project's stated facts, and saves the checked answer", async () => {
    const { client, calls } = fake(goodAnswer);
    const result = await proposeSchedule(client, facts, SYNTHETIC_JOBS, "2026-09-29");
    expect(result).toMatchObject({
      ok: true,
      proposal: {
        status: "proposed",
        model: SCHEDULE_MODEL,
        proposedAt: "2026-09-29",
        phases: { construction: { weeks: 70, jobNumbers: ["TEST-0001"] } },
        jobs: [{ jobNumber: "TEST-0001", name: SYNTHETIC_MIDRISE.name }],
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].model).toBe(SCHEDULE_MODEL);
    const sent = JSON.parse(String(calls[0].messages[0].content));
    expect(sent.project).toEqual(facts);
    expect(sent.completedJobs.map((job: { jobNumber: string }) => job.jobNumber)).toEqual(["TEST-0001"]);
  });

  it("rejects an answer that cites a job it was not given, and proposes nothing", async () => {
    const invented = {
      ...goodAnswer,
      jobs: [{ jobNumber: "C-99999", why: "Invented." }],
      phases: { ...goodAnswer.phases, construction: { ...phase(70), jobNumbers: ["C-99999"] } },
    };
    const result = await proposeSchedule(fake(invented).client, facts, SYNTHETIC_JOBS, "2026-09-29");
    expect(result).toMatchObject({ ok: false });
    expect(result.ok ? "" : result.error).toMatch(/C-99999/);
  });

  it("rejects a refusal and output it cannot read", async () => {
    expect(await proposeSchedule(fake(goodAnswer, "refusal").client, facts, SYNTHETIC_JOBS, "2026-09-29")).toMatchObject({
      ok: false,
    });
    expect(await proposeSchedule(fake("not json").client, facts, SYNTHETIC_JOBS, "2026-09-29")).toMatchObject({ ok: false });
  });

  it("says proposals are not set up when a close job exists but there is no model key", async () => {
    const result = await proposeSchedule(null, facts, SYNTHETIC_JOBS, "2026-09-29");
    expect(result).toMatchObject({ ok: false, notSetUp: true });
  });
});
