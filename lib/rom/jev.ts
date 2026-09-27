import {
  type ChoiceQuestion,
  type EntryType,
  type RequestOptions,
  TypeSafeClient,
  choice,
} from "@typesafe-ai/sdk";
import {
  type DerivedAssumption,
  type DerivedInput,
  type DerivedStep,
  type DerivedValue,
  InvalidDerivedAssumption,
  restsOnAssumedFact,
  validateDerivedAssumption,
} from "@kulka/engine";

// LA-860. The one way a trade ticket asks Jev for a derived assumption. The
// caller hands in bounded facts the project already gives (each marked stated
// or assumed) and a short list of candidates. The engine side has already
// computed each candidate's value and arithmetic; Jev judges which candidate
// the facts support, and its choice confidence becomes the card's confidence.
// Math never lives in the prompt (CONTEXT.md, Engine).
//
// The client is injected, so tests pass a fake and never reach the network.
// No trade is wired to this yet (LA-774, 775, 776, 777, 781 and 784 each do
// that on their own), and nothing on the app's default path calls it.
//
// Output is a planning quantity or a spec choice for the budget. It is never a
// design, and nothing here reads drawings or measures quantities from them.

/** The one call the wrapper makes. `TypeSafeClient` satisfies it; a test passes a fake. */
export type JevClient = {
  systemOne(
    request: { state: EntryType; questions: { pick: ChoiceQuestion } },
    options?: RequestOptions,
  ): PromiseLike<{ model: string; answers: { pick: { choice: string; confidence: number } } }>;
};

/** One answer Jev may pick, with the value and arithmetic code already worked out for it. */
export type DerivationCandidate = {
  /** What this answer means, in words Jev reads. */
  description: string;
  value: DerivedValue;
  method: string;
  steps: DerivedStep[];
};

export type DerivationRequest = {
  code: string;
  label: string;
  costCodes: string[];
  /** The bounded facts, each marked stated or assumed. No new intake questions. */
  facts: DerivedInput[];
  /** The judgment Jev makes, as one plain question. */
  question: string;
  /** Candidate answers keyed by a short id. At least two, or there is nothing to judge. */
  candidates: Record<string, DerivationCandidate>;
  /** One line each for why confidence came out high or low. */
  reasons: { high: string; low: string };
  /** Jev's choice confidence at or above this reads high. Default 0.8. */
  highConfidenceAt?: number;
};

export type DerivationResult = {
  assumption: DerivedAssumption;
  /** What Jev returned, kept for the record: the model, the pick, and its raw confidence from 0 to 1. */
  jev: { model: string; choice: string; confidence: number };
};

export const DEFAULT_HIGH_CONFIDENCE_AT = 0.8;

/**
 * Asks Jev to pick among the candidates and returns the typed record. The
 * record carries no "assumed" flag of its own: whether it rests on an assumed
 * fact is read from its inputs (`restsOnAssumedFact`), so it cannot be set by
 * hand.
 */
export async function deriveAssumption(
  client: JevClient,
  request: DerivationRequest,
  options?: RequestOptions,
): Promise<DerivationResult> {
  const keys = Object.keys(request.candidates);
  if (keys.length < 2) throw new InvalidDerivedAssumption("A derivation needs at least two candidates to judge.");
  if (request.facts.length === 0) throw new InvalidDerivedAssumption("A derivation needs the facts it may use.");

  const criteria = Object.fromEntries(keys.map((key) => [key, request.candidates[key].description]));
  const response = await client.systemOne(
    {
      state: {
        criterion: request.label,
        facts: request.facts.map((fact) => ({ name: fact.name, value: fact.value, basis: fact.basis })),
      },
      questions: { pick: choice(instructionsFor(request), criteria) },
    },
    options,
  );

  const answer = response.answers.pick;
  const picked = request.candidates[answer.choice];
  if (!picked) throw new Error(`Jev returned "${answer.choice}", which is not one of the candidates.`);

  const confidence = answer.confidence >= (request.highConfidenceAt ?? DEFAULT_HIGH_CONFIDENCE_AT) ? "high" : "low";
  const assumption: DerivedAssumption = {
    kind: "derived_assumption",
    code: request.code,
    label: request.label,
    value: picked.value,
    method: picked.method,
    inputs: request.facts.map((fact) => ({ ...fact })),
    steps: picked.steps,
    confidence,
    confidenceReason: request.reasons[confidence],
    costCodes: [...request.costCodes],
    correction: null,
  };
  validateDerivedAssumption(assumption);
  return { assumption, jev: { model: response.model, choice: answer.choice, confidence: answer.confidence } };
}

function instructionsFor(request: DerivationRequest): EntryType {
  const lines = [
    request.question,
    "Use only the facts in `facts`. This is a planning assumption for a conceptual budget, not a design.",
  ];
  if (restsOnAssumedFact({ inputs: request.facts })) {
    lines.push("A fact whose `basis` is assumed was not stated by anyone; weigh it as uncertain.");
  }
  return lines.join(" ");
}

/**
 * The real client, for a trade ticket to pass in on the server. It reads
 * TYPESAFE_API_KEY and keeps the key server-side. Never called by default.
 */
export function createJevClient(): JevClient {
  return new TypeSafeClient();
}
