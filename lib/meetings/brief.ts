import Anthropic from "@anthropic-ai/sdk";

import type { Db } from "@/lib/db";

import type { MeetingAttendee, MeetingSentence } from "./store";

// LA-2282. The Kulka Brief: Claude reads a meeting's transcript and writes the
// decisions made, the open risks, and the action items. Every item cites the
// sentences it came from, and an owner or due date stays only when those
// sentences contain it, so a brief never states one the meeting did not.

export const BRIEF_MODEL = "claude-opus-5-5";

/** The one call this file makes. `new Anthropic()` satisfies it; a test passes a fake. */
export type BriefClient = {
  beta: {
    messages: {
      create(params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming): Promise<Anthropic.Beta.Messages.BetaMessage>;
    };
  };
};

export type BriefPoint = { text: string; evidence: number[] };
export type BriefAction = { owner: string | null; action: string; due: string | null; evidence: number[] };
export type Brief = { decisions: BriefPoint[]; risks: BriefPoint[]; actionItems: BriefAction[] };

export class BriefFailed extends Error {}

const EVIDENCE = {
  type: "array",
  items: { type: "integer" },
  description: "The [numbers] of the transcript sentences this comes from.",
} as const;

const SCHEMA = {
  type: "object",
  properties: {
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence: EVIDENCE },
        required: ["text", "evidence"],
        additionalProperties: false,
      },
    },
    risks: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, evidence: EVIDENCE },
        required: ["text", "evidence"],
        additionalProperties: false,
      },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          owner: { type: ["string", "null"], description: "The person or company the meeting named, or null." },
          action: { type: "string" },
          due: { type: ["string", "null"], description: "The date or deadline as said in the meeting, or null." },
          evidence: EVIDENCE,
        },
        required: ["owner", "action", "due", "evidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["decisions", "risks", "actionItems"],
  additionalProperties: false,
} as const;

const SYSTEM = [
  "You write the Kulka Brief for a construction general contractor's project meeting, from its transcript.",
  "Decisions: what the meeting settled or agreed. Risks: open problems that could cost time or money, such as unanswered RFIs, late submittals, undecided selections, or delivery dates at risk. Action items: who will do what, and by when.",
  "Use only what the transcript says. Name an owner or a due date only when someone said it; otherwise use null. Never infer a date or a person.",
  "Cite the [numbers] of the sentences each item comes from.",
  "Write each item as one plain sentence of 25 words or fewer, in the past tense for decisions. Leave a list empty when the meeting had none.",
].join(" ");

/** Sentences sent to the model. Longer meetings keep Fireflies' flagged lines and their neighbors. */
export const MAX_SENTENCES = 2500;

export function transcriptFor(sentences: MeetingSentence[]): string {
  let kept = sentences;
  if (sentences.length > MAX_SENTENCES) {
    const wanted = new Set<number>();
    sentences.forEach((one, i) => {
      if (Object.keys(one.flags ?? {}).some((flag) => flag !== "sentiment")) {
        for (const j of [i - 1, i, i + 1]) if (j >= 0 && j < sentences.length) wanted.add(j);
      }
    });
    kept = sentences.filter((_, i) => wanted.has(i)).slice(0, MAX_SENTENCES);
  }
  return kept.map((one) => `[${one.index}] ${one.speaker ?? "Unknown"}: ${one.text}`).join("\n");
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3);

/** Whether every meaningful word of `claim` appears in `source`. */
function supported(claim: string, source: string): boolean {
  const have = new Set(words(source));
  const need = words(claim);
  return need.length > 0 && need.every((word) => have.has(word));
}

/**
 * Keeps only what the transcript backs: items with real evidence, and an
 * owner or due date only when the cited sentences (or, for an owner, the
 * speakers and invitees) contain it.
 */
export function groundBrief(raw: Brief, sentences: MeetingSentence[], attendees: MeetingAttendee[]): Brief {
  const byIndex = new Map(sentences.map((one) => [one.index, one]));
  const cited = (evidence: number[]) => [...new Set(evidence)].filter((i) => byIndex.has(i)).sort((a, b) => a - b);
  const text = (evidence: number[]) => evidence.map((i) => byIndex.get(i)?.text ?? "").join(" ");
  const people = attendees.map((one) => one.name ?? "").join(" ");
  const point = (one: BriefPoint) => ({ text: one.text.trim(), evidence: cited(one.evidence) });
  return {
    decisions: raw.decisions.map(point).filter((one) => one.text && one.evidence.length > 0),
    risks: raw.risks.map(point).filter((one) => one.text && one.evidence.length > 0),
    actionItems: raw.actionItems
      .map((one) => {
        const evidence = cited(one.evidence);
        const said = text(evidence);
        const speakers = evidence.map((i) => byIndex.get(i)?.speaker ?? "").join(" ");
        const owner = one.owner?.trim() || null;
        const due = one.due?.trim() || null;
        return {
          action: one.action.trim(),
          evidence,
          owner: owner && supported(owner, `${said} ${speakers} ${people}`) ? owner : null,
          due: due && supported(due, said) ? due : null,
        };
      })
      .filter((one) => one.action && one.evidence.length > 0),
  };
}

export type WrittenBrief = { brief: Brief; model: string; inputTokens: number; outputTokens: number };

export async function writeBrief(
  client: BriefClient,
  meeting: { title: string; sentences: MeetingSentence[]; attendees: MeetingAttendee[] },
): Promise<WrittenBrief> {
  const response = await client.beta.messages.create({
    model: BRIEF_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Meeting: ${meeting.title}\nInvited: ${meeting.attendees.map((one) => one.name ?? one.email).filter(Boolean).join(", ")}\n\nTranscript:\n${transcriptFor(meeting.sentences)}`,
      },
    ],
  });
  if (response.stop_reason === "refusal") throw new BriefFailed("The model declined to write this brief.");
  if (response.stop_reason === "max_tokens") throw new BriefFailed("The brief ran past its length limit.");
  const block = response.content.find((one) => one.type === "text");
  if (!block || block.type !== "text") throw new BriefFailed("The model returned no brief.");
  let raw: Brief;
  try {
    raw = JSON.parse(block.text);
  } catch {
    throw new BriefFailed("The model's brief could not be read.");
  }
  if (!Array.isArray(raw.decisions) || !Array.isArray(raw.risks) || !Array.isArray(raw.actionItems)) {
    throw new BriefFailed("The model's brief was missing a list.");
  }
  return {
    brief: groundBrief(raw, meeting.sentences, meeting.attendees),
    model: response.model,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

/**
 * Writes and saves the brief for one meeting once Fireflies has finished its
 * summary. A failure is saved on the meeting so the page can say so, and the
 * next sync tries again.
 */
export async function briefMeeting(db: Db, client: BriefClient, firefliesId: string): Promise<boolean> {
  const { rows } = await db.query<{ title: string; sentences: MeetingSentence[]; attendees: MeetingAttendee[] }>(
    `select title, sentences, attendees from meetings
      where fireflies_id = $1 and brief is null and jsonb_array_length(sentences) > 0
        and coalesce(summary->>'overview', '') <> ''`,
    [firefliesId],
  );
  const meeting = rows[0];
  if (!meeting) return false;
  try {
    const written = await writeBrief(client, meeting);
    await db.query(
      `update meetings set brief = $2, brief_model = $3, brief_written_at = now(), brief_input_tokens = $4,
              brief_output_tokens = $5, brief_error = null
        where fireflies_id = $1`,
      [firefliesId, JSON.stringify(written.brief), written.model, written.inputTokens, written.outputTokens],
    );
    return true;
  } catch (cause) {
    const message = cause instanceof BriefFailed ? cause.message : "The brief could not be written.";
    await db.query(`update meetings set brief_error = $2 where fireflies_id = $1`, [firefliesId, message]);
    if (!(cause instanceof BriefFailed) && !(cause instanceof Anthropic.APIError)) throw cause;
    return false;
  }
}

/** Meetings with a finished summary and no brief yet, newest first. */
export async function meetingsAwaitingBrief(db: Db, limit: number): Promise<string[]> {
  const { rows } = await db.query<{ fireflies_id: string }>(
    `select fireflies_id from meetings
      where brief is null and jsonb_array_length(sentences) > 0 and coalesce(summary->>'overview', '') <> ''
      order by started_at desc limit $1`,
    [limit],
  );
  return rows.map((row) => row.fireflies_id);
}

let clientForTests: BriefClient | null = null;

/** Tests hand in a fake so nothing reaches the network. */
export function setBriefClientForTests(client: BriefClient | null) {
  clientForTests = client;
}

/** A test's fake, or the real client when ANTHROPIC_API_KEY is set. Null means briefs are not set up. */
export function briefClient(): BriefClient | null {
  if (clientForTests) return clientForTests;
  return process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
}
