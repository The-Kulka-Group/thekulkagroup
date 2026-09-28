import type { Answers, DataSnapshot } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { demolitionAnswered, holdUnansweredDemolition } from "./demolition-hold";

// LA-1239. Matt, 2026-09-27: hide Site Demolition until the building
// questions are answered.

const snapshot = {
  benchmarks: [
    { costCode: "1", label: "Site Demolition", unit: "usd_lump_sum", value: 25000 },
    { costCode: "1a", label: "Structure Demolition", unit: "usd_per_sf_of_structure", value: 6.6 },
    { costCode: "28a", label: "Plumbing Disconnect and Cap", unit: "usd_each_structure", value: 1500 },
    { costCode: "3", label: "Concrete", unit: "usd_per_gsf", value: 20 },
  ],
  parameters: [],
  branchGateItems: [{ costCode: "1", section: "demolition", requiresAllSections: [], closesOn: ["no"] }],
  classifications: [
    { costCode: "1", element: "Demolition" },
    { costCode: "1a", element: "Demolition" },
    { costCode: "28a", element: "Demolition" },
    { costCode: "3", element: "Concrete" },
  ],
} as unknown as DataSnapshot;

function answers(gate: string | undefined, facts: Record<string, string | number> = {}): Answers {
  return {
    projectType: "multifamily",
    constructionKind: "new",
    grossSquareFeet: 120000,
    ...(gate ? { branchGates: { demolition: gate } } : {}),
    facts,
  } as unknown as Answers;
}

const codes = (s: DataSnapshot) => s.benchmarks.map((b) => b.costCode);

describe("holdUnansweredDemolition", () => {
  it("leaves the whole Demolition element out while the building questions are unanswered", () => {
    expect(codes(holdUnansweredDemolition(answers("yes"), snapshot))).toEqual(["3"]);
    expect(codes(holdUnansweredDemolition(answers(undefined), snapshot))).toEqual(["3"]);
    expect(
      codes(holdUnansweredDemolition(answers("yes", { demolitionStructureCount: 2 }), snapshot)),
    ).toEqual(["3"]);
  });

  it("prices demolition once the building questions are answered", () => {
    const full = answers("yes", {
      demolitionStructureCount: 2,
      demolitionStructureSquareFeet: 8000,
      demolitionStructureType: "wood_frame_type_v",
    });
    expect(demolitionAnswered(full)).toBe(true);
    expect(holdUnansweredDemolition(full, snapshot)).toBe(snapshot);
  });

  it("treats zero structures as answered: site work only", () => {
    expect(holdUnansweredDemolition(answers("yes", { demolitionStructureCount: 0 }), snapshot)).toBe(snapshot);
  });

  it("leaves a No or Don't Know to the engine", () => {
    expect(holdUnansweredDemolition(answers("no"), snapshot)).toBe(snapshot);
    expect(holdUnansweredDemolition(answers("dont_know"), snapshot)).toBe(snapshot);
  });
});
