import type { DerivedAssumption, Rom } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { assembleSnapshot, headlineFigures, type SnapshotSource } from "./published-snapshot";

// LA-1417. The snapshot is assembled by a pure function, and the placeholder
// page's figures are read off it by another.

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
});

describe("headlineFigures", () => {
  it("reads Kulka's contract and total project cost off the markups when the run priced them", () => {
    const snapshot = assembleSnapshot(source({}));
    snapshot.rom = {
      ...ROM,
      markups: {
        total: { low: 1_000_000, high: 1_200_000 },
        totalProjectCost: { low: 1_050_000, high: 1_250_000 },
      },
    } as unknown as Rom;

    expect(headlineFigures(snapshot)).toEqual({
      kulkaContract: { low: 1_000_000, high: 1_200_000, likely: 1_100_000 },
      totalProjectCost: { low: 1_050_000, high: 1_250_000, likely: 1_150_000 },
      perGrossSquareFoot: 110,
      grossSquareFeet: 10_000,
    });
  });

  it("falls back to trade cost totals on a run with no markups", () => {
    const figures = headlineFigures(assembleSnapshot(source({})));

    expect(figures.kulkaContract).toEqual({ low: 800_000, high: 1_000_000, likely: 900_000 });
    expect(figures.totalProjectCost).toEqual({ low: 900_000, high: 1_100_000, likely: 1_000_000 });
    expect(figures.perGrossSquareFoot).toBe(90);
  });
});
