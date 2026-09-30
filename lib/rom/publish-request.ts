import type { PresentationCopy } from "./published-snapshot";

// LA-1419. What the publish form sends and what the route will take from it.
// Pure, so the route and the form share one set of rules and one set of words.

/** Figures stay valid this many days from issue unless the estimator says otherwise (LA-1309, decision 7). */
export const DEFAULT_VALIDITY_DAYS = 90;
export const MAX_VALIDITY_DAYS = 730;
export const MAX_COVER_SENTENCE = 400;
const MAX_NAME = 200;

export type PublishParse = { ok: true; copy: PresentationCopy } | { ok: false; error: string };

function text(value: unknown): { ok: true; value: string } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false };
  return { ok: true, value: value.trim() };
}

function days(value: unknown): number | null {
  if (value === undefined || value === null) return DEFAULT_VALIDITY_DAYS;
  const number = typeof value === "string" ? (value.trim() === "" ? DEFAULT_VALIDITY_DAYS : Number(value)) : value;
  if (typeof number !== "number" || !Number.isInteger(number)) return null;
  return number >= 1 && number <= MAX_VALIDITY_DAYS ? number : null;
}

/** Reads a publish request body. The estimator writes every word of it; nothing here is generated. */
export function parsePublishBody(body: unknown): PublishParse {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Send who it is prepared for, who prepared it, the cover sentence and the days valid." };
  }
  const input = body as Record<string, unknown>;
  const preparedFor = text(input.preparedFor);
  const preparedBy = text(input.preparedBy);
  const coverSentence = text(input.coverSentence);
  if (!preparedFor.ok || !preparedBy.ok || !coverSentence.ok) {
    return { ok: false, error: "Prepared for, prepared by and the cover sentence must be text." };
  }
  if (!preparedFor.value) return { ok: false, error: "Add who this budget is prepared for." };
  if (!preparedBy.value) return { ok: false, error: "Add who prepared this budget." };
  if (preparedFor.value.length > MAX_NAME || preparedBy.value.length > MAX_NAME) {
    return { ok: false, error: `Names must be ${MAX_NAME} characters or fewer.` };
  }
  if (coverSentence.value.length > MAX_COVER_SENTENCE) {
    return { ok: false, error: `The cover sentence must be ${MAX_COVER_SENTENCE} characters or fewer.` };
  }
  const validityDays = days(input.validityDays);
  if (validityDays === null) {
    return { ok: false, error: `Days valid must be a whole number from 1 to ${MAX_VALIDITY_DAYS}.` };
  }
  return {
    ok: true,
    copy: {
      preparedFor: preparedFor.value,
      preparedBy: preparedBy.value,
      coverSentence: coverSentence.value || null,
      validityDays,
    },
  };
}
