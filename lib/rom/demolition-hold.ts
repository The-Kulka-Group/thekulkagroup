import { readDemolitionFacts, type Answers, type DataSnapshot } from "@kulka/engine";

// LA-1239. Matt, 2026-09-27: hide Site Demolition until the building
// questions are answered. Site Demolition is a lump sum, so the engine
// prices it on the demolition gate alone, and a saved run on a project that
// never answered "how many structures, how many square feet, what kind"
// still showed $18k of demolition. This leaves the whole Demolition element
// out of a run until those answers are in: the gate items, and every line
// classified in the same element (Structure Demolition and the disconnects
// that come with it). The engine is unchanged; the run hands it a snapshot
// without those benchmarks, the same way the live preview holds unanswered
// scope (lib/rom/preview.ts, knownScopeRom).

/** Whether the demolition building questions are answered enough to price. */
export function demolitionAnswered(answers: Answers): boolean {
  const { structureCount, structureSquareFeet, structureType } = readDemolitionFacts(answers.facts);
  if (structureCount === null) return false;
  // Zero structures is a real answer: site work only, nothing further asked.
  return structureCount === 0 || (structureSquareFeet !== null && structureType !== null);
}

/**
 * The snapshot to price with: unchanged when demolition is answered No or
 * Don't Know (the engine already closes it or shows it as TBD) or when its
 * building answers are in; otherwise without the Demolition element's
 * benchmarks, so nothing in it prices or shows.
 */
export function holdUnansweredDemolition(answers: Answers, snapshot: DataSnapshot): DataSnapshot {
  const gate = answers.branchGates?.demolition;
  if (gate === "no" || gate === "dont_know" || demolitionAnswered(answers)) return snapshot;
  const gateCodes = new Set(
    (snapshot.branchGateItems ?? []).filter((item) => item.section === "demolition").map((item) => item.costCode),
  );
  if (gateCodes.size === 0) return snapshot;
  const elements = new Set(
    (snapshot.classifications ?? [])
      .filter((one) => gateCodes.has(one.costCode) && one.element)
      .map((one) => one.element),
  );
  const held = new Set(gateCodes);
  for (const one of snapshot.classifications ?? []) if (one.element && elements.has(one.element)) held.add(one.costCode);
  return { ...snapshot, benchmarks: snapshot.benchmarks.filter((benchmark) => !held.has(benchmark.costCode)) };
}
