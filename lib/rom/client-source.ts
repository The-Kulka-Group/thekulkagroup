/**
 * The source mark a client reads on a figure (LA-1483). The part price map
 * (LA-2211) marks each part of the building with one of these too.
 * "Kulka Figure" is the fallback for an estimator label with no mapping.
 */
export type ClientSource = "Kulka Rate" | "Placeholder Rate" | "No Rate Yet" | "Kulka Figure";

/**
 * ledger.ts's source labels are written for the estimator. The client reads
 * Kulka Rate, or Placeholder Rate for a figure the model proposed. A figure
 * built from past jobs reads Kulka Rate too: the client sees no job or job
 * count (LA-1483). "No Rate Yet" reads the same to both.
 * A label with no mapping reads "Kulka Figure" rather than failing, because a
 * frozen page must keep opening; presentation.test.ts checks every label
 * ledger.ts gives today is mapped.
 */
export function clientSource(internal: string): ClientSource {
  if (internal === "AI Figure" || internal.startsWith("AI,")) return "Placeholder Rate";
  if (internal === "This Budget Only" || internal === "Stated Rate") return "Kulka Rate";
  if (/^\d+ Kulka Jobs?(, Judgment)?$/.test(internal)) return "Kulka Rate";
  if (internal === "No Rate Yet") return internal;
  return "Kulka Figure";
}
