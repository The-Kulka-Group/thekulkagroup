import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Db } from "@/lib/db";
import { titleCase } from "@/lib/format/title-case";
import { RATE_MODEL, type RateClient } from "@/lib/rom/rate-suggestion";
import { MAX_ENTRY_LENGTH } from "@/lib/rom/scope-entries";

// LA-1503. Matt, 2026-10-02 (LA-1479 answer 6): AI drafts each item's
// Inclusions and Exclusions and the estimator approves them. The draft reads
// two things: Kulka's own definition of the item (docs/precon/canonical-work-items.md,
// or the scope relationship that brings a supporting item in) and the
// project's answers. It never reads drawings and never claims to. The route
// saves what comes back as drafts; nothing here approves anything.
//
// The client is the rate suggestion's (lib/rom/rate-suggestion.ts), so a test
// passes the same fake and never reaches the network.

export const DRAFT_MODEL = RATE_MODEL;

export class ScopeDraftFailed extends Error {}

export type ScopeDraftInput = {
  itemLabel: string;
  /** Kulka's definition of the item, as written. */
  definition: string;
  /** The project's answers the run priced, by the keys the facts land under. */
  answers: Record<string, unknown>;
};

export type ScopeDraft = { includes: string[]; excludes: string[]; model: string };

const DOC = join(process.cwd(), "docs", "precon", "canonical-work-items.md");

/**
 * One item's section of canonical-work-items.md: its heading through the
 * line before the next item or division heading. Null when the file has no
 * section for that item number.
 */
export function definitionSection(markdown: string, costCode: string): string | null {
  const lines = markdown.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`### ${costCode}. `));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length && !/^#{2,3} /.test(lines[end])) end += 1;
  return lines.slice(start, end).join("\n").trim();
}

/**
 * Kulka's definition of one item: its section of the work item list, or, for
 * a supporting item the list does not carry, the relationship that brings it
 * in. Null when Kulka has written down neither, so there is nothing to draft from.
 */
export async function readItemDefinition(db: Db, costCode: string): Promise<string | null> {
  const section = definitionSection(await readFile(DOC, "utf8"), costCode);
  if (section) return section;
  const { rows } = await db.query<{ supporting_label: string; driver_cost_code: string; quantity_rule: string; reason: string }>(
    `select supporting_label, driver_cost_code, quantity_rule, reason
       from scope_relationships where supporting_cost_code = $1 limit 1`,
    [costCode],
  );
  const found = rows[0];
  if (!found) return null;
  const driver = definitionSection(await readFile(DOC, "utf8"), found.driver_cost_code);
  return [
    `${found.supporting_label}: a supporting item brought in by item ${found.driver_cost_code} (${found.quantity_rule.replaceAll("_", " ")}).`,
    found.reason,
    driver ? `The item that brings it in:\n${driver}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const SCHEMA = {
  type: "object",
  properties: {
    includes: {
      type: "array",
      items: { type: "string" },
      description: "What the item's price covers, three to eight entries.",
    },
    excludes: {
      type: "array",
      items: { type: "string" },
      description: "What a reader might expect in this item that it does not cover, two to six entries.",
    },
  },
  required: ["includes", "excludes"],
  additionalProperties: false,
} as const;

const SYSTEM = [
  "You draft the Inclusions and Exclusions for one line of a general contractor's conceptual budget, which the owner will read.",
  "Work only from the contractor's own definition of the item and the project's answers you are given. You have no drawings or specifications and must never refer to them.",
  "Each entry is a short noun phrase in Title Case, under 60 characters, with no closing full stop. For example: Footings and Foundation Walls, Hazardous Material Abatement.",
  "Inclusions say what the price covers. Exclusions name work a reader might expect here that the definition puts elsewhere or leaves out.",
  "Never name a past job, a file, a source, a cost code, a dollar figure or a rate. Never say who or what wrote the entries.",
  "When an answer is missing or Don't Know, leave out anything that depends on it rather than guessing.",
  "An estimator reviews every entry before the owner sees it.",
].join(" ");

function cleanList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new ScopeDraftFailed("The draft did not come back as two lists.");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const text = titleCase(raw.replace(/\s+/g, " ").trim().replace(/[.;]+$/, ""));
    if (text === "" || text.length > MAX_ENTRY_LENGTH || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  return out;
}

export async function draftScope(client: RateClient, input: ScopeDraftInput): Promise<ScopeDraft> {
  const response = await client.beta.messages.create({
    model: DRAFT_MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    // A declined request re-runs on Anthropic's recommended fallback model.
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: JSON.stringify({ item: input.itemLabel, definition: input.definition, projectAnswers: input.answers }),
      },
    ],
  });

  if (response.stop_reason === "refusal") throw new ScopeDraftFailed("The model declined to draft this item.");
  const text = response.content.find((block) => block.type === "text");
  if (!text || text.type !== "text") throw new ScopeDraftFailed("The model returned no draft.");
  let parsed: { includes?: unknown; excludes?: unknown };
  try {
    parsed = JSON.parse(text.text);
  } catch {
    throw new ScopeDraftFailed("The model's draft could not be read.");
  }
  const includes = cleanList(parsed.includes);
  const excludes = cleanList(parsed.excludes);
  if (includes.length + excludes.length === 0) throw new ScopeDraftFailed("The model returned an empty draft.");
  return { includes, excludes, model: response.model };
}
