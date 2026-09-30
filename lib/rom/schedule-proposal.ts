import {
  closeEnoughJobs,
  proposalFromCheckedAnswer,
  proposalWithoutModel,
  scheduleInputKey,
  validateModelSchedule,
  type CompletedJob,
  type ScheduleFacts,
  type ScheduleProposal,
} from "@kulka/engine";

import { RATE_MODEL, type RateClient } from "./rate-suggestion";

// LA-1399. Matt, 2026-09-29: the proposed schedule comes from Kulka's
// completed jobs, with AI comparing the new project to them and estimating
// each phase. This file is the thin seam around the one model call. Which
// jobs are close enough, what counts as a valid answer, and how a proposal
// lands on a plan are pure functions in packages/engine/src/schedule-proposal.ts.
//
// The model sees only the project's stated facts and the recorded jobs close
// enough to compare with. It reads no drawings. Its answer is checked before
// anything saves, and an answer that fails any check proposes nothing.
//
// The client is injected, so tests pass a fake and never reach the network.

/** The latest Claude model the repo already uses (lib/rom/rate-suggestion.ts). */
export const SCHEDULE_MODEL = RATE_MODEL;

export class ScheduleProposalFailed extends Error {}

export type ProposeResult =
  | { ok: true; proposal: ScheduleProposal }
  | { ok: false; error: string; notSetUp?: boolean };

const PHASE_SCHEMA = (jobNumbers: string[]) => ({
  type: "object",
  properties: {
    weeks: { type: "number", description: "Whole weeks for this phase. Ignored when leaveBlank is true." },
    leaveBlank: {
      type: "boolean",
      description: "True when the given jobs cannot support a figure for this phase.",
    },
    jobNumbers: {
      type: "array",
      items: { type: "string", enum: jobNumbers },
      description: "The given jobs whose recorded weeks for this phase the figure rests on.",
    },
    reason: { type: "string", description: "One plain sentence, under 30 words." },
  },
  required: ["weeks", "leaveBlank", "jobNumbers", "reason"],
  additionalProperties: false,
});

function schemaFor(jobNumbers: string[]) {
  return {
    type: "object",
    properties: {
      jobs: {
        type: "array",
        description: "The given jobs you compared the project with.",
        items: {
          type: "object",
          properties: {
            jobNumber: { type: "string", enum: jobNumbers },
            why: { type: "string", description: "One plain sentence on how this job compares with the project." },
          },
          required: ["jobNumber", "why"],
          additionalProperties: false,
        },
      },
      phases: {
        type: "object",
        properties: {
          precon: PHASE_SCHEMA(jobNumbers),
          construction: PHASE_SCHEMA(jobNumbers),
          closeout: PHASE_SCHEMA(jobNumbers),
        },
        required: ["precon", "construction", "closeout"],
        additionalProperties: false,
      },
      reasoning: { type: "string", description: "Two plain sentences at most on how the weeks were reached." },
    },
    required: ["jobs", "phases", "reasoning"],
    additionalProperties: false,
  };
}

const SYSTEM = [
  "You propose how many weeks each phase of a general contractor's new job will take: precon, construction and close-out.",
  "You compare the new project only with the contractor's own completed jobs given to you, each with its recorded weeks per phase.",
  "Never use outside knowledge of typical durations to supply a figure no given job supports.",
  "For each phase, cite the given jobs whose recorded weeks for that phase you used. A job with no weeks recorded for a phase cannot support it.",
  "Adjust for differences in area and stories only as far as the given jobs show, and say how.",
  "If the given jobs cannot support a phase, set leaveBlank to true and say why. A blank is better than a guess.",
  "You see only the project's stated facts. You have not seen drawings, and this is a planning assumption for a conceptual budget, not a schedule.",
  "Write each reason as one short plain sentence.",
].join(" ");

/** The one model call: the raw answer, parsed but not yet checked. */
async function askModel(client: RateClient, facts: ScheduleFacts, jobs: CompletedJob[]): Promise<{ raw: unknown; model: string }> {
  const response = await client.beta.messages.create({
    model: SCHEDULE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: schemaFor(jobs.map((job) => job.jobNumber)) } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          project: facts,
          completedJobs: jobs.map((job) => ({
            jobNumber: job.jobNumber,
            buildingType: job.buildingType,
            constructionKind: job.constructionKind,
            grossSquareFeet: job.grossSquareFeet,
            storiesAboveGrade: job.storiesAboveGrade,
            recordedWeeks: {
              precon: job.phases.precon?.weeks ?? null,
              construction: job.phases.construction?.weeks ?? null,
              closeout: job.phases.closeout?.weeks ?? null,
            },
          })),
        }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new ScheduleProposalFailed("The model declined to propose a schedule.");
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new ScheduleProposalFailed("The model returned no schedule.");
  try {
    return { raw: JSON.parse(text.text), model: response.model };
  } catch {
    throw new ScheduleProposalFailed("The model's answer could not be read.");
  }
}

/**
 * The project's proposed schedule. With no recorded job close enough, or an
 * empty table, nothing is asked and every phase is blank. Otherwise the model
 * compares, and its answer saves only if every part of it checks out.
 */
export async function proposeSchedule(
  client: RateClient | null,
  facts: ScheduleFacts,
  jobs: readonly CompletedJob[],
  today: string,
): Promise<ProposeResult> {
  const without = proposalWithoutModel(facts, jobs, today);
  if (without) return { ok: true, proposal: without };
  if (!client) {
    return {
      ok: false,
      notSetUp: true,
      error: "Schedule proposals are not set up yet. The site needs an Anthropic API key. Enter the weeks.",
    };
  }

  const close = closeEnoughJobs(facts, jobs);
  let asked: { raw: unknown; model: string };
  try {
    asked = await askModel(client, facts, close);
  } catch (cause) {
    const reason = cause instanceof ScheduleProposalFailed ? cause.message : "The model could not be reached.";
    return { ok: false, error: `${reason} Enter the weeks.` };
  }
  const checked = validateModelSchedule(asked.raw, close);
  if (!checked.ok) {
    return { ok: false, error: `The proposal did not hold up, so nothing was proposed: ${checked.error} Enter the weeks.` };
  }
  return {
    ok: true,
    proposal: proposalFromCheckedAnswer(checked, {
      model: asked.model,
      proposedAt: today,
      inputKey: scheduleInputKey(facts, close),
    }),
  };
}
