import { describe, expect, it } from "vitest";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type BlockClassification,
  type DataSnapshot,
  type EngineParameters,
} from "./rom";
import type { BranchGateItemRule } from "./rom-gates";
import type { ScopeRelationship } from "./rom-relationships";

// LA-1154, ADR 0006: "Answers bring in drivers; relationships bring in
// supporting items" and "Supporting items add to the total". Every case runs
// through computeRom, so it fixes what a ROM shows rather than how the module
// gets there. Rates and parameters are synthetic.

const PROJECT_A = "11111111-1111-4111-8111-111111111111";

function benchmark(over: Partial<Benchmark> = {}): Benchmark {
  return {
    costCode: "1a",
    label: "Structure Demolition",
    unit: "usd_per_gsf",
    value: 2,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "actuals",
      sourceProjectIds: [PROJECT_A],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-09-27",
    },
    scopeSide: "site",
    contractSide: "kulka",
    ...over,
  };
}

function parameters(): EngineParameters {
  const values: Record<string, number> = {
    "weight.actuals": 5,
    "weight.proest_budget": 1,
    "weight.reviewed_judgment": 0.5,
    "weight.llm_proposal": 0.25,
    "flag.high_min_comparables": 5,
    "flag.medium_min_comparables": 2,
    "spread.high": 0.1,
    "spread.medium": 0.2,
    "spread.low": 0.35,
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [
      name,
      {
        value,
        provenance: {
          kind: "reviewed_judgment" as const,
          recordedBy: "automated test",
          recordedAt: "2026-09-27",
          reason: "synthetic",
        },
      },
    ]),
  ) as EngineParameters;
}

function relationship(supportingCostCode: string, supportingLabel: string, driverCostCode = "1a"): ScopeRelationship {
  return {
    driverCostCode,
    supportingCostCode,
    supportingLabel,
    quantityRule: "one_per_structure",
    statedBy: "mnicosia@thekulkagroup.com",
    statedOn: "2026-09-26",
    reason: "synthetic",
  };
}

const DISCONNECTS: ScopeRelationship[] = [
  relationship("28a", "Plumbing Disconnect and Cap"),
  relationship("28b", "Gas Meter and Service Disconnect"),
  relationship("31f", "Electrical Service Disconnect"),
  relationship("36a", "Site Utility Cut and Cap at the Main"),
];

const DEMOLITION_GATE: BranchGateItemRule = {
  costCode: "1a",
  section: "demolition",
  requiresAllSections: [],
  closesOn: ["no"],
  statedBy: "mnicosia@thekulkagroup.com",
  statedOn: "2026-09-26",
  reason: "synthetic",
};

// One 1,000 SF wood-frame structure comes down, so item 1a has the structure
// square footage LA-1156 requires before it prices at all. These cases vary
// only the demolition gate, which is what decides whether the driver is in.
const STRUCTURE_FACTS = {
  demolitionStructureCount: 1,
  demolitionStructureSquareFeet: 1000,
  demolitionStructureType: "wood_frame_type_v",
};

function answers(demolition?: "yes" | "no" | "dont_know"): Answers {
  const gates: Record<string, "yes" | "no" | "dont_know"> = demolition ? { demolition } : {};
  return {
    projectType: "multifamily",
    constructionKind: "new",
    grossSquareFeet: 1000,
    facts: { ...gates, ...STRUCTURE_FACTS },
    branchGates: gates,
  };
}

function snapshot(over: Partial<DataSnapshot> = {}): DataSnapshot {
  return {
    benchmarks: [benchmark()],
    parameters: parameters(),
    branchGateItems: [DEMOLITION_GATE],
    scopeRelationships: DISCONNECTS,
    ...over,
  };
}

/** A supporting item that does have a rate, standing in for the day LA-1156 prices one. */
const PRICED_DISCONNECT = benchmark({ costCode: "31f", label: "Electrical Service Disconnect", value: 0.5 });

const codes = (items: { costCode: string }[]) => items.map((i) => i.costCode);

describe("the Elevator element's rules (LA-1257)", () => {
  const conditional: ScopeRelationship = {
    ...relationship("99", "Synthetic Pit Waterproofing"),
    quantityRule: "one_per_elevator",
    condition: { fact: "levels_below_grade", equals: "yes" },
  };

  it("leaves a conditional item out while its fact does not hold", () => {
    const rom = computeRom(answers("yes"), snapshot({ scopeRelationships: [conditional] }));
    expect(codes(rom.unpricedItems)).toEqual([]);
  });

  it("brings a conditional item in once its fact holds", () => {
    const base = answers("yes");
    const rom = computeRom(
      { ...base, facts: { ...base.facts, levels_below_grade: "yes" } },
      snapshot({ scopeRelationships: [conditional] }),
    );
    expect(codes(rom.unpricedItems)).toEqual(["99"]);
  });

  it("prices a per-elevator rate by the elevator count", () => {
    const perElevator = benchmark({ costCode: "99", label: "Synthetic Pit Ladder", unit: "usd_each_elevator", value: 1000 });
    const base = answers("yes");
    const rom = computeRom(
      { ...base, facts: { ...base.facts, elevatorCount: 2 } },
      snapshot({
        benchmarks: [benchmark(), perElevator],
        scopeRelationships: [{ ...relationship("99", "Synthetic Pit Ladder"), quantityRule: "one_per_elevator" }],
      }),
    );
    const line = rom.lines.find((l) => l.costCode === "99")!;
    expect((line.low + line.high) / 2).toBeCloseTo(2000, 6);
    expect(line.driverCostCode).toBe("1a");
  });
});

describe("supporting items when the driver is priced", () => {
  it("brings every supporting item in, each naming its driver", () => {
    const rom = computeRom(answers("yes"), snapshot());

    expect(codes(rom.lines)).toEqual(["1a"]);
    expect(rom.unpricedItems).toEqual([
      { costCode: "28a", label: "Plumbing Disconnect and Cap", driverCostCode: "1a" },
      { costCode: "28b", label: "Gas Meter and Service Disconnect", driverCostCode: "1a" },
      { costCode: "31f", label: "Electrical Service Disconnect", driverCostCode: "1a" },
      { costCode: "36a", label: "Site Utility Cut and Cap at the Main", driverCostCode: "1a" },
    ]);
  });

  it("brings them in when the driver has no gate rule at all", () => {
    const rom = computeRom(answers(), snapshot({ branchGateItems: [] }));

    expect(codes(rom.unpricedItems)).toEqual(["28a", "28b", "31f", "36a"]);
  });

  it("prices a supporting item that has a rate through the ordinary per-GSF path", () => {
    const rom = computeRom(answers("yes"), snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT] }));

    const line = rom.lines.find((l) => l.costCode === "31f");
    expect(line?.driverCostCode).toBe("1a");
    expect(line?.gateStatus).toBe("priced");
    expect(line?.low).toBeGreaterThan(0);
    expect(codes(rom.unpricedItems)).toEqual(["28a", "28b", "36a"]);
  });

  it("adds a priced supporting item to the total exactly once", () => {
    const rom = computeRom(answers("yes"), snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT] }));
    const driver = rom.lines.find((l) => l.costCode === "1a")!;
    const supporting = rom.lines.find((l) => l.costCode === "31f")!;

    expect(rom.lines.filter((l) => l.costCode === "31f")).toHaveLength(1);
    expect(rom.total).toEqual({
      low: driver.low + supporting.low,
      high: driver.high + supporting.high,
    });
    expect(rom.kulkaContractTotal).toEqual(rom.total);
  });

  it("counts a supporting item once even when two drivers bring it in", () => {
    const rom = computeRom(
      answers("yes"),
      snapshot({
        benchmarks: [benchmark(), benchmark({ costCode: "1b", label: "Other Driver" }), PRICED_DISCONNECT],
        scopeRelationships: [...DISCONNECTS, relationship("31f", "Electrical Service Disconnect", "1b")],
      }),
    );

    expect(rom.lines.filter((l) => l.costCode === "31f")).toHaveLength(1);
    expect(rom.total.low).toBe(rom.lines.reduce((sum, l) => sum + l.low, 0));
  });

  it("never treats a supporting item as a breakout, whatever its classification says", () => {
    const classification: BlockClassification = {
      costCode: "31f",
      detailLevel: 2,
      element: "Demolition",
      breakoutOfCostCode: "1a",
      buyoutPackage: null,
      statedBy: "automated test",
      statedOn: "2026-09-27",
      reason: "synthetic",
    };
    const rom = computeRom(
      answers("yes"),
      snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT], classifications: [classification] }),
    );
    const supporting = rom.lines.find((l) => l.costCode === "31f")!;

    expect(supporting.breakoutOf).toBeNull();
    expect(supporting.element).toBe("Demolition");
    expect(rom.carvedOut).toEqual({ low: 0, high: 0 });
    expect(rom.total.low).toBeGreaterThan(rom.lines.find((l) => l.costCode === "1a")!.low);
  });

  it("names the supporting items and their driver in the assumptions", () => {
    const rom = computeRom(answers("yes"), snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT] }));

    expect(rom.assumptions.join(" ")).toContain("Structure Demolition brings in");
    expect(rom.assumptions.join(" ")).toContain("Electrical Service Disconnect");
  });
});

describe("supporting items when the driver is TBD", () => {
  it("makes a supporting item TBD, outside the total, with or without a rate", () => {
    const rom = computeRom(answers("dont_know"), snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT] }));

    const line = rom.lines.find((l) => l.costCode === "31f")!;
    expect(line.gateStatus).toBe("tbd");
    expect(line.driverCostCode).toBe("1a");
    expect(line.low).toBe(0);
    expect(line.high).toBe(0);
    expect(rom.total).toEqual({ low: 0, high: 0 });
    expect(codes(rom.tbdGateItems)).toEqual(["1a", "28a", "28b", "31f", "36a"]);
    expect(rom.tbdGateItems.find((i) => i.costCode === "28a")).toEqual({
      costCode: "28a",
      label: "Plumbing Disconnect and Cap",
      question: "demolition",
      driverCostCode: "1a",
    });
    expect(rom.unpricedItems).toEqual([]);
  });
});

describe("supporting items when the driver is absent", () => {
  it("leaves them out when the driver is not in the job", () => {
    const rom = computeRom(answers("no"), snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT] }));

    expect(codes(rom.lines)).toEqual(["1a"]);
    expect(rom.unpricedItems).toEqual([]);
    expect(codes(rom.notInThisJob)).toEqual(["1a"]);
    expect(rom.total).toEqual({ low: 0, high: 0 });
  });

  it("leaves them out when nobody answered the driver's question", () => {
    const rom = computeRom(answers(), snapshot({ benchmarks: [benchmark(), PRICED_DISCONNECT] }));

    expect(codes(rom.lines)).toEqual(["1a"]);
    expect(rom.unpricedItems).toEqual([]);
    expect(codes(rom.assumedPresentItems)).toEqual(["1a"]);
  });

  it("leaves them out when the driver has no line in the ROM at all", () => {
    const rom = computeRom(answers("yes"), snapshot({ benchmarks: [PRICED_DISCONNECT] }));

    expect(rom.lines).toEqual([]);
    expect(rom.unpricedItems).toEqual([]);
    expect(rom.total).toEqual({ low: 0, high: 0 });
  });
});

describe("relationships alongside what callers already pass", () => {
  it("still brings them in when the caller put the driver in scope with no rate", () => {
    const rom = computeRom(
      answers(),
      snapshot({
        benchmarks: [],
        branchGateItems: [],
        unpricedInScopeItems: [{ costCode: "1a", label: "Structure Demolition" }],
      }),
    );

    expect(codes(rom.unpricedItems)).toEqual(["1a", "28a", "28b", "31f", "36a"]);
  });

  it("keeps a caller's own unpriced items and lists each cost code once", () => {
    const rom = computeRom(
      answers("yes"),
      snapshot({ unpricedInScopeItems: [{ costCode: "31f", label: "Electrical Service Disconnect" }, { costCode: "99", label: "Other" }] }),
    );

    expect(codes(rom.unpricedItems)).toEqual(["28a", "28b", "31f", "36a", "99"]);
    expect(rom.unpricedItems.find((i) => i.costCode === "31f")?.driverCostCode).toBe("1a");
  });

  it("gives a byte-identical ROM with no relationships as with an empty list", () => {
    const bare = computeRom(answers("yes"), snapshot({ scopeRelationships: undefined }));
    const empty = computeRom(answers("yes"), snapshot({ scopeRelationships: [] }));

    expect(JSON.stringify(bare)).toBe(JSON.stringify(empty));
    expect(bare.lines[0]).not.toHaveProperty("driverCostCode");
  });

  it("gives the same ROM whatever order the relationships arrive in", () => {
    const forwards = computeRom(answers("yes"), snapshot());
    const backwards = computeRom(answers("yes"), snapshot({ scopeRelationships: [...DISCONNECTS].reverse() }));

    expect(JSON.stringify(forwards)).toBe(JSON.stringify(backwards));
  });
});
