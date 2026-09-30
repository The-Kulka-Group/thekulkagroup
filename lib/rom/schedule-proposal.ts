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

import type { Db } from "@/lib/db";

import { readCompletedJobs } from "./completed-jobs";
import type { RomProjectDetail } from "./projects";
import { readRomProjectDetail } from "./projects";
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

/** The project facts the comparison reads. */
export function scheduleFactsOf(project: Pick<RomProjectDetail, "projectType" | "constructionKind" | "grossSquareFeet" | "storiesAboveGrade">): ScheduleFacts {
  return {
    projectType: project.projectType,
    constructionKind: project.constructionKind,
    grossSquareFeet: project.grossSquareFeet,
    storiesAboveGrade: project.storiesAboveGrade ?? null,
  };
}

/**
 * Where a project's proposal stands when its page opens.
 *
 * - `ready`: a proposal the page can apply now. Either nothing could be
 *   compared (empty table, no close job), or a saved proposal was made from
 *   the project's current facts and jobs.
 * - `pending`: close jobs exist and no current proposal is saved, so the page
 *   asks for one (POST /api/rom/projects/[id]/schedule-proposal).
 */
export type ScheduleProposalState = { kind: "ready"; proposal: ScheduleProposal } | { kind: "pending" };

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

async function readSaved(db: Db, projectId: string): Promise<ScheduleProposal | null> {
  const { rows } = await db.query<{ schedule_proposal: ScheduleProposal | null }>(
    `select schedule_proposal from projects where id = $1`,
    [projectId],
  );
  return rows[0]?.schedule_proposal ?? null;
}

/** Reads what a proposal needs: the project's facts, the recorded jobs, and any saved proposal. Null when the project is missing. */
async function readInputs(db: Db, projectId: string) {
  const project = await readRomProjectDetail(db, projectId);
  if (!project) return null;
  const [jobs, saved] = await Promise.all([readCompletedJobs(db), readSaved(db, projectId)]);
  const facts = scheduleFactsOf(project);
  const current = saved && saved.inputKey === scheduleInputKey(facts, closeEnoughJobs(facts, jobs)) ? saved : null;
  return { facts, jobs, current };
}

export async function readScheduleProposalState(db: Db, projectId: string): Promise<ScheduleProposalState | null> {
  const inputs = await readInputs(db, projectId);
  if (!inputs) return null;
  const without = proposalWithoutModel(inputs.facts, inputs.jobs, today());
  if (without) return { kind: "ready", proposal: without };
  return inputs.current ? { kind: "ready", proposal: inputs.current } : { kind: "pending" };
}

/**
 * The project's current proposal: the saved one when it was made from the
 * project's current facts and jobs, otherwise a new one, saved on the
 * project. A failed proposal saves nothing. Null when the project is missing.
 */
export async function proposeForProject(db: Db, client: RateClient | null, projectId: string): Promise<ProposeResult | null> {
  const inputs = await readInputs(db, projectId);
  if (!inputs) return null;
  const without = proposalWithoutModel(inputs.facts, inputs.jobs, today());
  if (without) return { ok: true, proposal: without };
  if (inputs.current) return { ok: true, proposal: inputs.current };
  const result = await proposeSchedule(client, inputs.facts, inputs.jobs, today());
  if (result.ok) {
    await db.query(`update projects set schedule_proposal = $2 where id = $1`, [projectId, JSON.stringify(result.proposal)]);
  }
  return result;
}
