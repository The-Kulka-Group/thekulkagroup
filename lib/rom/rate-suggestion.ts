import Anthropic from "@anthropic-ai/sdk";

// LA-1245. Matt, 2026-09-28: a supporting item with no rate can ask a model
// for one that takes the project's location and labor type into account.
// Jev (lib/rom/jev.ts) only picks among candidates, and an item with no rate
// has none to pick from, so this asks Claude for a figure, a range and a
// short reason. The estimator accepts or changes it before it saves
// (LA-9: a model's figure never solely determines a line), and the saved row
// keeps this proposal beside the figure (lib/rom/project-rates.ts).
//
// The client is injected, so tests pass a fake and never reach the network.

export const RATE_MODEL = "claude-opus-5";

/** The one call this file makes. `new Anthropic()` satisfies it; a test passes a fake. */
export type RateClient = {
  beta: {
    messages: {
      create(params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
};

export type RateSuggestionInput = {
  itemLabel: string;
  /** What brings the item in, and how many: "Structure Demolition, one per structure coming down". */
  quantityBasis: string;
  unit: "each";
  facts: Record<string, string | number | null>;
};

export type RateSuggestion = {
  value: number;
  low: number;
  high: number;
  reasoning: string;
  model: string;
  /** Every ask's figure, lowest first, when the suggestion came from several asks. */
  asks?: number[];
};

export class RateSuggestionFailed extends Error {}

const SCHEMA = {
  type: "object",
  properties: {
    rate: { type: "number", description: "The single most likely rate in US dollars, each." },
    low: { type: "number", description: "The low end of a reasonable range, US dollars each." },
    high: { type: "number", description: "The high end of a reasonable range, US dollars each." },
    reasoning: {
      type: "string",
      description: "One plain sentence, under 30 words, on what drives the figure.",
    },
  },
  required: ["rate", "low", "high", "reasoning"],
  additionalProperties: false,
} as const;

const SYSTEM = [
  "You estimate construction unit costs for a general contractor's conceptual (rough order of magnitude) budget.",
  "Give a rate for one line item, in US dollars, for the unit stated, as a subcontractor would price it in the project's location today.",
  "Weigh the location from the ZIP code and the labor type (union, open shop or prevailing wage).",
  "If a fact you need is missing, widen the range rather than guessing narrowly.",
  "Write the reasoning as one short sentence (Matt, 2026-09-28: four rows of paragraphs were too much to read).",
  "This is a planning figure the estimator will review, not a quote or a design.",
].join(" ");

export async function suggestRate(client: RateClient, input: RateSuggestionInput): Promise<RateSuggestion> {
  const response = await client.beta.messages.create({
    model: RATE_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    // A declined request re-runs on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({
          item: input.itemLabel,
          unit: `US dollars ${input.unit}`,
          quantity: input.quantityBasis,
          project: input.facts,
        }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new RateSuggestionFailed("The model declined to suggest a rate.");
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new RateSuggestionFailed("The model returned no rate.");

  let parsed: { rate: unknown; low: unknown; high: unknown; reasoning: unknown };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new RateSuggestionFailed("The model's answer could not be read.");
  }
  const { rate, low, high, reasoning } = parsed;
  if (
    typeof rate !== "number" ||
    typeof low !== "number" ||
    typeof high !== "number" ||
    typeof reasoning !== "string" ||
    !(low > 0 && low <= rate && rate <= high)
  ) {
    throw new RateSuggestionFailed("The model's rate did not hold together (it needs low, rate and high in order, above zero).");
  }
  const round = (value: number) => Math.round(value);
  return { value: round(rate), low: round(low), high: round(high), reasoning: firstSentence(reasoning), model: response.model };
}

/**
 * LA-1252. Matt, 2026-09-28: back-to-back asks for the same item came back $14,000
 * and $6,500, so the estimator sees how far the model moves. This asks three
 * times at once. The figure and reason are the middle answer's, the range
 * runs from the lowest low to the highest high, and `asks` lists every
 * figure. One or two failed asks still leave a suggestion.
 */
export async function suggestRateFromAsks(
  client: RateClient,
  input: RateSuggestionInput,
  count = 3,
): Promise<RateSuggestion> {
  const settled = await Promise.allSettled(Array.from({ length: count }, () => suggestRate(client, input)));
  const answers = settled
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .sort((a, b) => a.value - b.value);
  if (answers.length === 0) {
    const failed = settled.find((result): result is PromiseRejectedResult => result.status === "rejected");
    throw failed?.reason instanceof Error ? failed.reason : new RateSuggestionFailed("The model returned no rate.");
  }
  const middle = answers[Math.floor((answers.length - 1) / 2)];
  return {
    value: middle.value,
    low: Math.min(...answers.map((answer) => answer.low)),
    high: Math.max(...answers.map((answer) => answer.high)),
    reasoning: middle.reasoning,
    model: middle.model,
    asks: answers.map((answer) => answer.value),
  };
}

/** The reasoning's first sentence, in case the model writes more than asked. */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  return trimmed.split(/(?<=[.!?])\s+(?=[A-Z])/)[0] ?? trimmed;
}

let clientForTests: RateClient | null = null;

/** Tests hand in a fake so nothing reaches the network. */
export function setRateClientForTests(client: RateClient | null) {
  clientForTests = client;
}

/**
 * The client to suggest with, server-side only: a test's fake, or the real
 * one when ANTHROPIC_API_KEY is set. Null means suggestions are not set up.
 */
export function rateClient(): RateClient | null {
  if (clientForTests) return clientForTests;
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}
