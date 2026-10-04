import type { DerivedAssumption, Rom } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { assembleSnapshot, type SnapshotSource } from "./published-snapshot";

// LA-1417. The snapshot is assembled by a pure function.

const ROM = {
  lines: [],
  total: { low: 900_000, high: 1_100_000 },
  kulkaContractTotal: { low: 800_000, high: 1_000_000 },
  carvedOut: { low: 0, high: 0 },
  notInThisJob: [],
  tbdGateItems: [],
  assumedPresentItems: [],
  unpricedItems: [],
  assumptions: [],
  parameters: {},
} as unknown as Rom;

const CRITERION: DerivedAssumption = {
  kind: "derived_assumption",
  code: "S-1",
  label: "Foundation Type",
  value: { kind: "spec", text: "Spread Footings" },
  method: "Planning assumption from soil class",
  inputs: [{ name: "Soil Class", value: "C", basis: "assumed" }],
  steps: [{ label: "Foundation", result: "Spread Footings" }],
  confidence: "low",
  confidenceReason: "The soil class was assumed.",
  costCodes: [],
  correction: null,
} as DerivedAssumption;

function source(answers: Record<string, unknown>): SnapshotSource {
  return {
    run: {
      id: "run-1",
      projectId: "project-1",
      projectName: "Example Flats",
      skill: "rom_tier1",
      startedAt: "2026-09-29T14:00:00.000Z",
      finishedAt: "2026-09-29T14:00:05.000Z",
      answers: { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 10_000, ...answers },
      snapshotHash: "a".repeat(64),
      rom: ROM,
    } as SnapshotSource["run"],
    issuedAt: "2026-09-29T15:00:00.000Z",
    criteria: [{ ...CRITERION, id: "row-1", correctionId: null }],
    copy: { preparedFor: null, preparedBy: null, validityDays: null, coverSentence: null },
  };
}

describe("assembleSnapshot", () => {
  it("drops the ids a criterion was stored under", () => {
    const snapshot = assembleSnapshot(source({}));

    expect(snapshot.criteria).toEqual([CRITERION]);
  });

  it("carries the Allocated Resources plan only when the run recorded one", () => {
    const plan = { schedule: { preconWeeks: 8 }, lines: [{ id: "superintendent" }] };

    expect(assembleSnapshot(source({ allocatedResources: plan })).allocatedResources).toEqual(plan);
    expect(assembleSnapshot(source({}))).not.toHaveProperty("allocatedResources");
  });

  it("freezes the duration estimate publishing made, and drops it when the plan has a schedule (LA-1566)", () => {
    const withEstimate = (answers: Record<string, unknown>) => assembleSnapshot({ ...source(answers), durationEstimate: { months: 16 } });

    expect(withEstimate({}).durationEstimate).toEqual({ months: 16 });
    expect(withEstimate({ allocatedResources: { weeks: { construction: 61 } } })).not.toHaveProperty("durationEstimate");
    expect(withEstimate({ allocatedResources: { lines: [] } }).durationEstimate).toEqual({ months: 16 });
    expect(assembleSnapshot(source({}))).not.toHaveProperty("durationEstimate");
  });

  it("freezes the names of the jobs its comparables cite, when publishing looked them up", () => {
    const names = { "job-1": "Fieldstone North Broadway" };

    expect(assembleSnapshot({ ...source({}), sourceJobNames: names }).sourceJobNames).toEqual(names);
    expect(assembleSnapshot(source({}))).not.toHaveProperty("sourceJobNames");
  });
});
