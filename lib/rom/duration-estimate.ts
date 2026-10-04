import type Anthropic from "@anthropic-ai/sdk";
import type { Rom } from "@kulka/engine";

import { RATE_MODEL } from "./rate-suggestion";
import type { RecordedAnswers } from "./run-records";

// LA-1566. Matt, 2026-10-04: a budget with no Allocated Resources schedule
// still shows a duration, estimated by a model from the facts the budget
// holds, until a real rule exists. Publishing asks once and freezes the
// answer in the snapshot (lib/rom/published-budgets.ts), so the page and PDF
// never call a model. The page marks it "+/-" and never says where it came from.
//
// The client is injected, so tests pass a fake and never reach the network.

export const DURATION_MODEL = RATE_MODEL;

/** Above ten years the answer is not a duration for a budget this page prints. */
const MAX_MONTHS = 120;

/** The one call this file makes. `new Anthropic()` satisfies it; a test passes a fake. */
export type DurationClient = {
  beta: {
    messages: {
      create(
        params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
        options?: Anthropic.RequestOptions,
      ): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
};

/** What the model reads: the project as the budget states it, and the scope it prices. */
export type DurationFacts = {
  projectType: string | null;
  constructionKind: string | null;
  grossSquareFeet: number | null;
  framingSystem: string | null;
  /** The intake's facts as recorded: units, stories, below-grade levels, elevators and the rest. */
  facts: Record<string, string | number | boolean>;
  /** Every scope the budget prices, by name. */
  scope: string[];
};

/** Construction in whole months, or a thrown error. Publishing treats any throw as no estimate. */
export type DurationEstimator = (facts: DurationFacts) => Promise<number>;

export class DurationEstimateFailed extends Error {}

export function durationFactsOf(answers: RecordedAnswers | null, rom: Rom): DurationFacts {
  return {
    projectType: answers?.projectType ?? null,
    constructionKind: answers?.constructionKind ?? null,
    grossSquareFeet: answers?.grossSquareFeet ?? null,
    framingSystem: answers?.framingSystem ?? null,
    facts: answers?.facts ?? {},
    scope: [...new Set(rom.lines.map((line) => line.label))],
  };
}

/** The model's answer as whole months from 1 to 120, or null for anything else. */
export function parseDurationMonths(raw: unknown): number | null {
  const months = (raw as { months?: unknown } | null)?.months;
  return typeof months === "number" && Number.isInteger(months) && months >= 1 && months <= MAX_MONTHS ? months : null;
}

const SCHEMA = {
  type: "object",
  properties: {
    months: {
      type: "integer",
      description: "The construction phase in whole months, from mobilization to substantial completion.",
    },
  },
  required: ["months"],
  additionalProperties: false,
} as const;

const SYSTEM = [
  "You estimate how long a building project's construction phase will take, for a general contractor's conceptual budget.",
  "Count from mobilization to substantial completion, in whole months. Leave out preconstruction and close-out.",
  "Weigh the stated facts: gross area, units, stories, building type, new work or renovation, framing, below-grade levels, elevators and the scope priced.",
  "You have seen no drawings and no schedule. If a fact is missing, give the most likely duration for a project of this kind.",
  "This is a planning figure the client reads as approximate, not a schedule.",
].join(" ");

/** Publishing waits on this before it writes, so a slow answer is dropped rather than holding the publish. */
const TIMEOUT_MS = 20_000;

export async function estimateDurationMonths(client: DurationClient, facts: DurationFacts): Promise<number> {
  const response = await client.beta.messages.create(
    {
      model: DURATION_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      messages: [{ role: "user", content: JSON.stringify(facts) }],
    },
    { timeout: TIMEOUT_MS, maxRetries: 0 },
  );

  if (response.stop_reason === "refusal") throw new DurationEstimateFailed("The model declined to estimate a duration.");
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new DurationEstimateFailed("The model returned no duration.");
  let raw: unknown;
  try {
    raw = JSON.parse(text.text);
  } catch {
    throw new DurationEstimateFailed("The model's duration could not be read.");
  }
  const months = parseDurationMonths(raw);
  if (months === null) throw new DurationEstimateFailed(`The model's duration was not whole months from 1 to ${MAX_MONTHS}.`);
  return months;
}

/** The estimator publishing uses, or undefined when no client is set up. */
export function durationEstimator(client: DurationClient | null): DurationEstimator | undefined {
  return client ? (facts) => estimateDurationMonths(client, facts) : undefined;
}
