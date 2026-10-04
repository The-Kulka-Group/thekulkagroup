import type { PresentableSnapshot, Publication } from "@/lib/rom/presentation";

import mn4 from "./published-budget-mn4.json";
import reference from "./reference-page-mn4.json";

// LA-1418. One real run (production run 9b995af5 on MN Test #4, read-only),
// shaped as an LA-1417 snapshot, and what the LA-1416 reference page printed
// from the same run. The page build in ~/scrollcraft/builds/kulka-budget-page
// is the design; these two files let the app prove it renders the same page.

/** A fresh copy each call, so no test can change another's snapshot. */
export function referenceSnapshot(): PresentableSnapshot {
  const copy = structuredClone(mn4) as unknown as { snapshot: PresentableSnapshot; sourceJobNames: Record<string, string> };
  return { ...copy.snapshot, sourceJobNames: copy.sourceJobNames };
}

export function referencePublication(over: Partial<Publication> = {}): Publication {
  return {
    snapshot: referenceSnapshot(),
    version: 1,
    stage: "conceptual",
    issuedAt: "2026-09-29T03:42:27.267Z",
    newer: null,
    ...over,
  };
}

/**
 * LA-1566. The reference run as publishing freezes it today: it has no
 * schedule, so publishing estimated the construction duration. 16 months is
 * a fixture value, not a model's answer, so no test or render calls a model.
 */
export function estimatedPublication(over: Partial<Publication> = {}): Publication {
  const publication = referencePublication(over);
  publication.snapshot.durationEstimate = { months: 16 };
  return publication;
}

/** Every data-el, every dollar figure and the section ids, in page order, as the reference page printed them. */
export const referencePage = reference as { sections: string[]; dataEl: string[]; money: string[] };
