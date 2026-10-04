import { describe, expect, it } from "vitest";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type BlockClassification,
  type DataSnapshot,
  type EngineParameters,
  type ProvenanceKind,
} from "./rom";
import type { BranchGateItemRule } from "./rom-gates";

// The engine seam, as LA-9 defines it: answers plus a data snapshot in, ROM
// out, with nothing read from a network, a database, or a clock. Every case
// below fixes external behaviour rather than internal structure.
//
// The parameter values here are synthetic. The tests assert the order and the
// mechanics (actuals outweigh a budget, more rows shift the blend, a model's
// figure is the lightest), never a particular number, so they hold whatever
// figures Kulka records in engine_parameters.

const PROJECT_A = "11111111-1111-4111-8111-111111111111";
const PROJECT_B = "22222222-2222-4222-8222-222222222222";
const PROJECT_C = "33333333-3333-4333-8333-333333333333";
const PROJECT_D = "44444444-4444-4444-8444-444444444444";
const PROJECT_E = "55555555-5555-4555-8555-555555555555";
const PROJECTS = [PROJECT_A, PROJECT_B, PROJECT_C, PROJECT_D, PROJECT_E];

function benchmark(over: Partial<Benchmark> & { kind?: ProvenanceKind; project?: string } = {}): Benchmark {
  const { kind = "actuals", project = PROJECT_A, ...rest } = over;
  return {
    costCode: "TEST-A",
    label: "Synthetic test line",
    unit: "usd_per_gsf",
    value: 1,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind,
      sourceProjectIds: kind === "llm_proposal" ? [] : [project],
      exportLabel: kind === "actuals" || kind === "proest_budget" ? "synthetic export" : null,
      recordedBy: "automated test",
      recordedAt: "2026-08-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...rest,
  };
}

function parameter(value: number) {
  return {
    value,
    provenance: {
      kind: "reviewed_judgment" as const,
      recordedBy: "automated test",
      recordedAt: "2026-09-21",
      reason: "synthetic",
    },
  };
}

function parameters(over: Partial<Record<keyof EngineParameters, number>> = {}): EngineParameters {
  const values = {
    "weight.actuals": 5,
    "weight.proest_budget": 1,
    "weight.reviewed_judgment": 0.5,
    "weight.llm_proposal": 0.25,
    "flag.high_min_comparables": 5,
    "flag.medium_min_comparables": 2,
    "spread.high": 0.1,
    "spread.medium": 0.2,
    "spread.low": 0.35,
    ...over,
  };
  return Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, parameter(value)]),
  ) as EngineParameters;
}

const ANSWERS: Answers = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 1000,
};

function snapshot(...benchmarks: Benchmark[]): DataSnapshot {
  return { benchmarks, parameters: parameters() };
}

/** Five distinct projects, one row each, all at `value`. */
function fiveAgreeing(kind: ProvenanceKind, value = 1): Benchmark[] {
  return PROJECTS.map((project) => benchmark({ kind, project, value }));
}

const midpoint = (line: { low: number; high: number }) => (line.low + line.high) / 2;

describe("computeRom", () => {
  it("returns a ranged line, never a point", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.lines).toHaveLength(1);
    const [line] = rom.lines;
    expect(line.costCode).toBe("TEST-A");
    expect(line.low).toBeLessThan(line.high);
  });

  it("gives the same ROM for the same answers and the same snapshot", () => {
    const first = computeRom(ANSWERS, snapshot(benchmark()));
    const second = computeRom(ANSWERS, snapshot(benchmark()));

    expect(first).toEqual(second);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("gives a byte-identical ROM whatever order the snapshot's rows arrived in", () => {
    const rows = [
      benchmark({ costCode: "TEST-B", project: PROJECT_B }),
      benchmark({ kind: "proest_budget", value: 2 }),
      benchmark({ kind: "llm_proposal", value: 3 }),
      benchmark({ project: PROJECT_B, value: 1.5 }),
      benchmark({ kind: "reviewed_judgment", value: 1.2 }),
      benchmark(),
    ];
    const forwards = computeRom(ANSWERS, snapshot(...rows));
    const backwards = computeRom(ANSWERS, snapshot(...[...rows].reverse()));

    expect(JSON.stringify(forwards)).toBe(JSON.stringify(backwards));
  });

  it("makes one line per cost code however many rows stand behind it", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ project: PROJECT_A }), benchmark({ project: PROJECT_B })),
    );

    expect(rom.lines).toHaveLength(1);
    expect(rom.total.low).toBe(rom.lines[0].low);
    expect(rom.total.high).toBe(rom.lines[0].high);
  });

  it("weights actuals above a ProEst budget", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ value: 2 }), benchmark({ kind: "proest_budget", value: 1 })),
    );

    const mid = midpoint(rom.lines[0]);
    expect(Math.abs(mid - 2000)).toBeLessThan(Math.abs(mid - 1000));
  });

  it("shifts the blend further toward actuals as more actuals rows arrive", () => {
    const budget = benchmark({ kind: "proest_budget", value: 1 });
    const one = computeRom(ANSWERS, snapshot(benchmark({ value: 2 }), budget));
    const three = computeRom(
      ANSWERS,
      snapshot(
        benchmark({ value: 2, project: PROJECT_A }),
        benchmark({ value: 2, project: PROJECT_B }),
        benchmark({ value: 2, project: PROJECT_C }),
        budget,
      ),
    );

    expect(midpoint(three.lines[0])).toBeGreaterThan(midpoint(one.lines[0]));
  });

  it("lets a model's figure move a measured line less than the lightest measured figure would", () => {
    const alone = midpoint(computeRom(ANSWERS, snapshot(benchmark())).lines[0]);
    const withModel = midpoint(
      computeRom(ANSWERS, snapshot(benchmark(), benchmark({ kind: "llm_proposal", value: 10 })))
        .lines[0],
    );
    const withBudget = midpoint(
      computeRom(
        ANSWERS,
        snapshot(benchmark(), benchmark({ kind: "proest_budget", value: 10, project: PROJECT_B })),
      ).lines[0],
    );

    expect(withModel - alone).toBeGreaterThan(0);
    expect(withModel - alone).toBeLessThan(withBudget - alone);
  });

  it("prices a line resting only on a model's figure, flags it low, holds it, and says so", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark({ kind: "llm_proposal" })));

    const [line] = rom.lines;
    expect(line.low).toBeGreaterThan(0);
    expect(line.confidence).toBe("low");
    expect(line.heldForReview).toBe(true);
    expect(line.comparableCount).toBe(0);
    expect(rom.assumptions.join(" ")).toContain("no Kulka data");
  });

  it("never lets a judgment-only line rise above medium, however many projects agree", () => {
    const rom = computeRom(ANSWERS, snapshot(...fiveAgreeing("reviewed_judgment")));

    expect(rom.lines[0].comparableCount).toBe(5);
    expect(rom.lines[0].confidence).toBe("medium");
    expect(rom.lines[0].heldForReview).toBe(false);
    expect(rom.assumptions.join(" ")).toContain("estimator judgment");
  });

  it("flags a line high when enough distinct projects agree on it", () => {
    const rom = computeRom(ANSWERS, snapshot(...fiveAgreeing("actuals")));

    expect(rom.lines[0].confidence).toBe("high");
    expect(rom.lines[0].heldForReview).toBe(false);
  });

  it("counts a project once however many rows it contributes", () => {
    const sameProject = PROJECTS.map(() => benchmark({ project: PROJECT_A }));
    const rom = computeRom(ANSWERS, snapshot(...sameProject));

    expect(rom.lines[0].comparableCount).toBe(1);
    expect(rom.lines[0].confidence).toBe("low");
  });

  it("flags a line medium on a couple of projects", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ project: PROJECT_A }), benchmark({ project: PROJECT_B })),
    );

    expect(rom.lines[0].comparableCount).toBe(2);
    expect(rom.lines[0].confidence).toBe("medium");
  });

  it("drops the flag when the comparables disagree, even with enough of them", () => {
    const rows = fiveAgreeing("actuals");
    rows[4] = benchmark({ project: PROJECT_E, value: 1.2 });
    const rom = computeRom(ANSWERS, snapshot(...rows));

    expect(rom.lines[0].comparableCount).toBe(5);
    expect(rom.lines[0].confidence).toBe("medium");
  });

  it("adds no comparable for a model's figure", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark(), benchmark({ kind: "llm_proposal" })));

    expect(rom.lines[0].comparableCount).toBe(1);
  });

  it("widens the range as confidence drops", () => {
    const width = (rows: Benchmark[]) => {
      const [line] = computeRom(ANSWERS, snapshot(...rows)).lines;
      return line.high - line.low;
    };

    expect(width(fiveAgreeing("actuals"))).toBeLessThan(
      width([benchmark({ project: PROJECT_A }), benchmark({ project: PROJECT_B })]),
    );
    expect(width([benchmark({ project: PROJECT_A }), benchmark({ project: PROJECT_B })])).toBeLessThan(
      width([benchmark()]),
    );
  });

  it("lists every comparable behind a line, heaviest first", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(
        benchmark({ kind: "llm_proposal", value: 4 }),
        benchmark({ kind: "reviewed_judgment", value: 3 }),
        benchmark({ kind: "proest_budget", value: 2, project: PROJECT_B }),
        benchmark({ kind: "actuals", value: 1 }),
      ),
    );

    const comparables = rom.lines[0].comparables;
    expect(comparables.map((c) => c.kind)).toEqual([
      "actuals",
      "proest_budget",
      "reviewed_judgment",
      "llm_proposal",
    ]);
    expect(comparables.map((c) => c.rate)).toEqual([1, 2, 3, 4]);
    expect(comparables[0].weight).toBeGreaterThan(comparables[1].weight);
    expect(comparables[1].weight).toBeGreaterThan(comparables[2].weight);
    expect(comparables[2].weight).toBeGreaterThan(comparables[3].weight);
    expect(comparables[0].sourceProjectIds).toEqual([PROJECT_A]);
    expect(comparables[1].exportLabel).toBe("synthetic export");
    expect(comparables[3].sourceProjectIds).toEqual([]);
  });

  it("keeps the same shape with and without a model's figure in the blend", () => {
    const without = computeRom(ANSWERS, snapshot(benchmark()));
    const withModel = computeRom(ANSWERS, snapshot(benchmark(), benchmark({ kind: "llm_proposal" })));

    expect(Object.keys(withModel)).toEqual(Object.keys(without));
    expect(Object.keys(withModel.lines[0])).toEqual(Object.keys(without.lines[0]));
  });

  it("takes the label from the same row whatever order two rows of one kind arrived in", () => {
    const newer = benchmark({ label: "Newer row", project: PROJECT_A });
    newer.provenance.recordedAt = "2026-09-01";
    const older = benchmark({ label: "Older row", project: PROJECT_B, scopeSide: "site" });
    older.provenance.recordedAt = "2026-08-01";

    const forwards = computeRom(ANSWERS, snapshot(older, newer));
    const backwards = computeRom(ANSWERS, snapshot(newer, older));

    expect(forwards.lines[0].label).toBe("Newer row");
    expect(forwards.lines[0].scopeSide).toBe("building");
    expect(JSON.stringify(forwards)).toBe(JSON.stringify(backwards));
  });

  it("takes the label and sides from the heaviest figure when rows disagree", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(
        benchmark({ kind: "llm_proposal", label: "Model's label", scopeSide: "site" }),
        benchmark({ kind: "actuals", label: "Kulka's label", scopeSide: "building" }),
      ),
    );

    expect(rom.lines[0].label).toBe("Kulka's label");
    expect(rom.lines[0].scopeSide).toBe("building");
  });

  it("scales the line by gross square feet", () => {
    const [small] = computeRom(ANSWERS, snapshot(benchmark())).lines;
    const [large] = computeRom(
      { ...ANSWERS, grossSquareFeet: 2000 },
      snapshot(benchmark()),
    ).lines;

    expect(large.low).toBe(small.low * 2);
    expect(large.high).toBe(small.high * 2);
  });

  it("rounds every figure to whole dollars", () => {
    const rom = computeRom(
      { ...ANSWERS, grossSquareFeet: 13 },
      snapshot(benchmark({ value: 1.37 }), benchmark({ kind: "proest_budget", value: 1.11 })),
    );

    for (const line of rom.lines) {
      expect(Number.isInteger(line.low)).toBe(true);
      expect(Number.isInteger(line.high)).toBe(true);
    }
    expect(Number.isInteger(rom.total.low)).toBe(true);
    expect(Number.isInteger(rom.total.high)).toBe(true);
  });

  it("never blends renovation data into a new-construction ROM", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark(), benchmark({ constructionKind: "renovation", value: 100 })),
    );

    expect(rom.lines).toHaveLength(1);
    expect(rom.lines[0].comparables).toHaveLength(1);
  });

  it("ignores benchmarks for another project type", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ costCode: "TEST-S", projectType: "self_storage" })),
    );

    expect(rom.lines).toEqual([]);
  });

  it("totals the lines it produced", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark(), benchmark({ costCode: "TEST-B", value: 2 })),
    );

    expect(rom.total.low).toBe(rom.lines[0].low + rom.lines[1].low);
    expect(rom.total.high).toBe(rom.lines[0].high + rom.lines[1].high);
  });

  it("orders lines by cost code whatever order the snapshot arrived in", () => {
    const forwards = computeRom(
      ANSWERS,
      snapshot(benchmark(), benchmark({ costCode: "TEST-B" })),
    );
    const backwards = computeRom(
      ANSWERS,
      snapshot(benchmark({ costCode: "TEST-B" }), benchmark()),
    );

    expect(forwards).toEqual(backwards);
    expect(forwards.lines.map((l) => l.costCode)).toEqual(["TEST-A", "TEST-B"]);
  });

  it("states the assumptions it worked from", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.assumptions.length).toBeGreaterThan(0);
    expect(rom.assumptions.join(" ")).toContain("1,000");
  });

  it("echoes the parameters it computed with, provenance included", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.parameters).toEqual(parameters());
    expect(rom.parameters["weight.actuals"]?.provenance.recordedBy).toBe("automated test");
  });

  it("says so plainly when no benchmark matched", () => {
    const rom = computeRom(ANSWERS, snapshot());

    expect(rom.lines).toEqual([]);
    expect(rom.total).toEqual({ low: 0, high: 0 });
    expect(rom.assumptions.join(" ")).toContain("No benchmark");
  });

  it("refuses a project with no floor area", () => {
    expect(() => computeRom({ ...ANSWERS, grossSquareFeet: 0 }, snapshot(benchmark())))
      .toThrow(/gross square feet/i);
  });

  it("refuses a negative floor area", () => {
    expect(() => computeRom({ ...ANSWERS, grossSquareFeet: -1 }, snapshot(benchmark())))
      .toThrow(/gross square feet/i);
  });

  it("refuses a floor area that is not a number", () => {
    expect(() => computeRom({ ...ANSWERS, grossSquareFeet: Number.NaN }, snapshot(benchmark())))
      .toThrow(/gross square feet/i);
  });

  it("carries each benchmark's scope side and contract side through to its line", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ scopeSide: "site", contractSide: "owner" })),
    );

    expect(rom.lines[0].scopeSide).toBe("site");
    expect(rom.lines[0].contractSide).toBe("owner");
  });

  it("sums the Kulka contract total from Kulka-side lines only", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(
        benchmark({ costCode: "TEST-A", contractSide: "kulka" }),
        benchmark({ costCode: "TEST-B", contractSide: "owner" }),
      ),
    );

    expect(rom.kulkaContractTotal.low).toBe(rom.lines[0].low);
    expect(rom.kulkaContractTotal.high).toBe(rom.lines[0].high);
    expect(rom.total.low).toBe(rom.lines[0].low + rom.lines[1].low);
  });

  it("makes the Kulka contract total equal the total when every line is Kulka's", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark(), benchmark({ costCode: "TEST-B" })));

    expect(rom.kulkaContractTotal).toEqual(rom.total);
  });

  it("states owner-direct scope as its own assumption", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ costCode: "TEST-A", contractSide: "owner" })),
    );

    expect(rom.assumptions.join(" ")).toContain("owner-direct");
  });

  it("says nothing about owner-direct scope when there is none", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.assumptions.join(" ")).not.toContain("owner-direct");
  });
});

describe("engine parameters", () => {
  function withParameters(over: Partial<Record<keyof EngineParameters, number>>, rows = [benchmark()]) {
    return () => computeRom(ANSWERS, { benchmarks: rows, parameters: parameters(over) });
  }

  function without(name: keyof EngineParameters, rows = [benchmark()]) {
    const p = parameters();
    delete p[name];
    return () => computeRom(ANSWERS, { benchmarks: rows, parameters: p });
  }

  it("refuses to run without a parameter, naming it", () => {
    expect(without("spread.low")).toThrow(/spread\.low/);
    expect(without("flag.high_min_comparables")).toThrow(/flag\.high_min_comparables/);
  });

  it("refuses to blend a kind that has no recorded weight, naming it", () => {
    expect(without("weight.llm_proposal", [benchmark({ kind: "llm_proposal" })])).toThrow(
      /weight\.llm_proposal/,
    );
  });

  it("needs a weight only for the kinds that are in the snapshot", () => {
    expect(without("weight.llm_proposal", [benchmark({ kind: "actuals" })])).not.toThrow();
  });

  it("refuses a weight that is not above zero", () => {
    expect(withParameters({ "weight.actuals": 0 })).toThrow(/weight\.actuals/);
    expect(withParameters({ "weight.actuals": -1 })).toThrow(/weight\.actuals/);
  });

  it("refuses a spread that is not a fraction between zero and one", () => {
    expect(withParameters({ "spread.high": 0 })).toThrow(/spread\.high/);
    expect(withParameters({ "spread.low": 1 })).toThrow(/spread\.low/);
  });

  it("refuses spreads that narrow as confidence drops", () => {
    expect(withParameters({ "spread.medium": 0.05 })).toThrow(/narrow/);
  });

  it("refuses a comparable minimum that is not a whole number of at least one", () => {
    expect(withParameters({ "flag.medium_min_comparables": 0 })).toThrow(/medium_min_comparables/);
    expect(withParameters({ "flag.medium_min_comparables": 1.5 })).toThrow(/medium_min_comparables/);
  });

  it("refuses a high minimum below the medium minimum", () => {
    expect(withParameters({ "flag.high_min_comparables": 2, "flag.medium_min_comparables": 3 }))
      .toThrow(/high_min_comparables/);
  });

  it("refuses a parameter that is not a finite number", () => {
    expect(withParameters({ "spread.high": Number.NaN })).toThrow(/spread\.high/);
  });
});

describe("block classification", () => {
  function classification(
    over: Partial<BlockClassification> & { costCode?: string } = {},
  ): BlockClassification {
    return {
      costCode: "TEST-A",
      detailLevel: 2,
      element: null,
      breakoutOfCostCode: null,
      buyoutPackage: null,
      statedBy: "automated test",
      statedOn: "2026-09-22",
      reason: "synthetic",
      ...over,
    };
  }

  function withClassifications(
    rows: Benchmark[],
    classifications: BlockClassification[],
  ) {
    return computeRom(ANSWERS, { benchmarks: rows, parameters: parameters(), classifications });
  }

  it("carries the stated level, element and buyout package onto the line", () => {
    const rom = withClassifications(
      [benchmark()],
      [
        classification({
          detailLevel: 3,
          element: "Bathroom",
          buyoutPackage: "Plumbing",
        }),
      ],
    );

    expect(rom.lines[0].detailLevel).toBe(3);
    expect(rom.lines[0].element).toBe("Bathroom");
    expect(rom.lines[0].buyoutPackage).toBe("Plumbing");
    expect(rom.lines[0].breakoutOf).toBeNull();
  });

  it("leaves a line with no classification unclassified rather than guessing one", () => {
    const rom = withClassifications(
      [benchmark({ costCode: "TEST-A" }), benchmark({ costCode: "TEST-B" })],
      [classification({ costCode: "TEST-A", detailLevel: 1 })],
    );

    expect(rom.lines[0].detailLevel).toBe(1);
    expect(rom.lines[1].detailLevel).toBeNull();
    expect(rom.lines[1].element).toBeNull();
    expect(rom.lines[1].breakoutOf).toBeNull();
    expect(rom.lines[1].buyoutPackage).toBeNull();
  });

  it("says in its own assumptions that a level is unstated", () => {
    const rom = withClassifications([benchmark()], []);

    expect(rom.assumptions.join(" ")).toContain("no stated level of detail");
  });

  it("behaves exactly as before when the snapshot carries no classifications", () => {
    const rows = [benchmark(), benchmark({ costCode: "TEST-B" })];
    const bare = computeRom(ANSWERS, snapshot(...rows));
    const empty = withClassifications(rows, []);

    expect(JSON.stringify(bare)).toBe(JSON.stringify(empty));
  });

  it("keeps a carved-out block out of both totals and reports it on its own", () => {
    const rows = [
      benchmark({ costCode: "TEST-A", value: 10 }),
      benchmark({ costCode: "TEST-B", value: 1 }),
    ];
    const rom = withClassifications(rows, [
      classification({ costCode: "TEST-A", detailLevel: 1 }),
      classification({ costCode: "TEST-B", detailLevel: 2, breakoutOfCostCode: "TEST-A" }),
    ]);

    const [parent, carved] = rom.lines;
    expect(carved.breakoutOf).toBe("TEST-A");
    expect(carved.low).toBeGreaterThan(0);
    expect(rom.total).toEqual({ low: parent.low, high: parent.high });
    expect(rom.kulkaContractTotal).toEqual({ low: parent.low, high: parent.high });
    expect(rom.carvedOut).toEqual({ low: carved.low, high: carved.high });
  });

  it("takes a carved-out Kulka line out of the Kulka contract total too", () => {
    const rom = withClassifications(
      [
        benchmark({ costCode: "TEST-A", value: 10, contractSide: "kulka" }),
        benchmark({ costCode: "TEST-B", value: 1, contractSide: "kulka" }),
      ],
      [classification({ costCode: "TEST-B", detailLevel: 2, breakoutOfCostCode: "TEST-A" })],
    );

    expect(rom.kulkaContractTotal).toEqual(rom.total);
    expect(rom.kulkaContractTotal.low).toBe(rom.lines[0].low);
  });

  it("states the carve-out as its own assumption", () => {
    const rom = withClassifications(
      [benchmark({ costCode: "TEST-A" }), benchmark({ costCode: "TEST-B" })],
      [classification({ costCode: "TEST-B", detailLevel: 2, breakoutOfCostCode: "TEST-A" })],
    );

    expect(rom.assumptions.join(" ")).toContain("carved out of a level 1 lump");
  });

  it("carves out nothing when no line names a parent", () => {
    const rom = withClassifications([benchmark()], [classification()]);

    expect(rom.carvedOut).toEqual({ low: 0, high: 0 });
    expect(rom.assumptions.join(" ")).not.toContain("carved out");
  });
});

describe("branch gate items (LA-1028)", () => {
  function gateRule(over: Partial<BranchGateItemRule> = {}): BranchGateItemRule {
    return {
      costCode: "TEST-A",
      section: "demolition",
      requiresAllSections: [],
      closesOn: ["no"],
      statedBy: "mnicosia@thekulkagroup.com",
      statedOn: "2026-09-24",
      reason: "synthetic",
      ...over,
    };
  }

  function gatedSnapshot(
    branchGateItems: BranchGateItemRule[],
    ...benchmarks: Benchmark[]
  ): DataSnapshot {
    return { benchmarks, parameters: parameters(), branchGateItems };
  }

  // A gate answer lives in both `facts` (what a judgment rule and the gate
  // map read) and `branchGates` (what the old section-level fallback words
  // read), exactly the way lib/rom/question-flow.ts's readFlowAnswers and
  // lib/rom/run.ts's no-responses path both build it.
  function answersWithFacts(facts: Record<string, "yes" | "no" | "dont_know">): Answers {
    return { ...ANSWERS, facts, branchGates: facts };
  }

  it("keeps existing behavior when no gate map is supplied", () => {
    const withMap = computeRom(
      answersWithFacts({ demolition: "no" }),
      gatedSnapshot([], benchmark()),
    );
    const without = computeRom(answersWithFacts({ demolition: "no" }), snapshot(benchmark()));

    expect(withMap.total).toEqual(without.total);
    expect(withMap.lines[0].gateStatus).toBeNull();
  });

  it("removes a line answered no from the total, and names it not in this job", () => {
    const rom = computeRom(
      answersWithFacts({ demolition: "no" }),
      gatedSnapshot([gateRule()], benchmark()),
    );

    expect(rom.lines[0].gateStatus).toBe("not_in_job");
    expect(rom.lines[0].low).toBe(0);
    expect(rom.lines[0].high).toBe(0);
    expect(rom.total).toEqual({ low: 0, high: 0 });
    expect(rom.notInThisJob).toEqual([
      { costCode: "TEST-A", label: "Synthetic test line", question: "demolition" },
    ]);
    expect(rom.assumptions.join(" ")).toContain("Not in this job");
    expect(rom.assumptions.join(" ")).toContain("Synthetic test line (demolition)");
  });

  it("prices a line answered yes exactly as it would with no gate", () => {
    const gated = computeRom(
      answersWithFacts({ demolition: "yes" }),
      gatedSnapshot([gateRule()], benchmark()),
    );
    const ungated = computeRom(ANSWERS, snapshot(benchmark()));

    expect(gated.lines[0].gateStatus).toBe("priced");
    expect(gated.total).toEqual(ungated.total);
  });

  it("shows a don't-know line as TBD, outside the total", () => {
    const rom = computeRom(
      answersWithFacts({ demolition: "dont_know" }),
      gatedSnapshot([gateRule()], benchmark()),
    );

    expect(rom.lines[0].gateStatus).toBe("tbd");
    expect(rom.total).toEqual({ low: 0, high: 0 });
    expect(rom.tbdGateItems.map((i) => i.costCode)).toEqual(["TEST-A"]);
  });

  it("prices an unanswered line and flags it assumed present", () => {
    const rom = computeRom(ANSWERS, gatedSnapshot([gateRule()], benchmark()));

    expect(rom.lines[0].gateStatus).toBe("assumed_present");
    expect(rom.total.low).toBeGreaterThan(0);
    expect(rom.assumedPresentItems.map((i) => i.costCode)).toEqual(["TEST-A"]);
    expect(rom.assumptions.join(" ")).toContain("assumed present");
  });

  it("closes item 34a's two-question rule only when both sections are no", () => {
    const rule = gateRule({
      costCode: "TEST-A",
      section: "levels_below_grade",
      requiresAllSections: ["site_conditions"],
    });

    const bothNo = computeRom(
      answersWithFacts({ levels_below_grade: "no", site_conditions: "no" }),
      gatedSnapshot([rule], benchmark()),
    );
    expect(bothNo.lines[0].gateStatus).toBe("not_in_job");

    const oneYes = computeRom(
      answersWithFacts({ levels_below_grade: "yes", site_conditions: "no" }),
      gatedSnapshot([rule], benchmark()),
    );
    expect(oneYes.lines[0].gateStatus).toBe("priced");

    const noAndDontKnow = computeRom(
      answersWithFacts({ levels_below_grade: "no", site_conditions: "dont_know" }),
      gatedSnapshot([rule], benchmark()),
    );
    expect(noAndDontKnow.lines[0].gateStatus).toBe("tbd");
  });

  it("keeps a section with no item rule reporting the old way", () => {
    const rom = computeRom(
      answersWithFacts({ existing_building_tie_in: "no" }),
      gatedSnapshot([gateRule({ section: "demolition" })], benchmark(), benchmark({ costCode: "TEST-B" })),
    );

    expect(rom.assumptions.join(" ")).toContain(
      "Answered no, so this budget carries nothing for: existing building tie in.",
    );
  });

  it("excludes a not-in-job line from the markup subtotal", () => {
    const answers: Answers = {
      ...ANSWERS,
      facts: { demolition: "no" },
      markups: {
        setup: "both",
        method: "pct_of_subtotal",
        overrideRate: 0.1,
        feeRate: 0,
        insuranceRate: 0,
      },
    };
    const rom = computeRom(answers, gatedSnapshot([gateRule()], benchmark()));

    expect(rom.markups?.subtotal.low).toBe(0);
    expect(rom.markups?.subtotal.high).toBe(0);
  });
});

describe("in-scope items with no rate (LA-1153, ADR 0006)", () => {
  // ADR 0006, "A block can arrive unpriced": a supporting item such as the
  // Electrical Service Disconnect has no benchmark behind it yet, but it is
  // in scope and must still arrive on the board, out of every total. The
  // declaration lives on the snapshot, not on `Answers`: `Answers` feeds
  // lib/rom/question-flow.ts's `EngineInputName`, one form field per key, and
  // this is a fact a relationship derives, never a question of its own.
  function unpricedSnapshot(...items: { costCode: string; label: string }[]): DataSnapshot {
    return { ...snapshot(benchmark()), unpricedInScopeItems: items };
  }

  it("carries an in-scope item nothing prices as unpriced, not as a line", () => {
    const rom = computeRom(
      ANSWERS,
      unpricedSnapshot({ costCode: "31F", label: "Electrical Service Disconnect" }),
    );

    expect(rom.lines.map((l) => l.costCode)).toEqual(["TEST-A"]);
    expect(rom.unpricedItems).toEqual([{ costCode: "31F", label: "Electrical Service Disconnect" }]);
  });

  it("keeps the total, the Kulka contract total, and the markup subtotal to the priced lines alone", () => {
    const markups: Answers["markups"] = {
      setup: "both",
      method: "pct_of_subtotal",
      overrideRate: 0.1,
      feeRate: 0,
      insuranceRate: 0,
    };
    const priced = computeRom(ANSWERS, snapshot(benchmark()));
    const pricedWithMarkups = computeRom({ ...ANSWERS, markups }, snapshot(benchmark()));
    const withUnpriced = computeRom(
      { ...ANSWERS, markups },
      unpricedSnapshot(
        { costCode: "31F", label: "Electrical Service Disconnect" },
        { costCode: "28A", label: "Plumbing Disconnect and Cap" },
      ),
    );

    expect(withUnpriced.total).toEqual(priced.total);
    expect(withUnpriced.kulkaContractTotal).toEqual(priced.kulkaContractTotal);
    expect(withUnpriced.markups?.subtotal).toEqual(pricedWithMarkups.markups?.subtotal);
  });

  it("names the unpriced items in the assumptions, by count and label", () => {
    const rom = computeRom(
      ANSWERS,
      unpricedSnapshot(
        { costCode: "31F", label: "Electrical Service Disconnect" },
        { costCode: "28A", label: "Plumbing Disconnect and Cap" },
      ),
    );

    const text = rom.assumptions.join(" ");
    expect(text).toContain("2 items");
    expect(text).toContain("Electrical Service Disconnect");
    expect(text).toContain("Plumbing Disconnect and Cap");
  });

  it("never lists a cost code twice when a benchmark already prices it", () => {
    const rom = computeRom(ANSWERS, unpricedSnapshot({ costCode: "TEST-A", label: "Synthetic test line" }));

    expect(rom.unpricedItems).toEqual([]);
    expect(rom.lines).toHaveLength(1);
  });

  it("behaves exactly as before when no in-scope items without a rate are supplied", () => {
    const bare = computeRom(ANSWERS, snapshot(benchmark()));
    const explicit = computeRom(ANSWERS, unpricedSnapshot());

    expect(bare.unpricedItems).toEqual([]);
    expect(JSON.stringify(bare)).toBe(JSON.stringify(explicit));
  });
});

describe("demolition benchmark units (LA-1156, ADR 0006)", () => {
  // Matt's statement of 2026-09-26 (docs/precon/canonical-work-items.md item
  // 1a): five rates, one per structure type, each a midpoint the engine puts
  // its usual one-source spread around.
  const FIVE_RATES: Benchmark[] = [
    benchmark({
      costCode: "1a",
      label: "Structure Demolition",
      unit: "usd_per_sf_of_structure",
      value: 6.6,
      structureType: "wood_frame_type_v",
      kind: "reviewed_judgment",
    }),
    benchmark({
      costCode: "1a",
      label: "Structure Demolition",
      unit: "usd_per_sf_of_structure",
      value: 9.9,
      structureType: "masonry_bearing_wall_type_iii",
      kind: "reviewed_judgment",
    }),
    benchmark({
      costCode: "1a",
      label: "Structure Demolition",
      unit: "usd_per_sf_of_structure",
      value: 5.5,
      structureType: "pre_engineered_metal_or_light_steel",
      kind: "reviewed_judgment",
    }),
    benchmark({
      costCode: "1a",
      label: "Structure Demolition",
      unit: "usd_per_sf_of_structure",
      value: 13.2,
      structureType: "steel_frame_concrete_metal_deck_type_ii",
      kind: "reviewed_judgment",
    }),
    benchmark({
      costCode: "1a",
      label: "Structure Demolition",
      unit: "usd_per_sf_of_structure",
      value: 19.8,
      structureType: "cast_in_place_concrete_frame_type_i",
      kind: "reviewed_judgment",
    }),
  ];

  const SITE_DEMOLITION = benchmark({
    costCode: "1",
    label: "Site Demolition",
    unit: "usd_lump_sum",
    value: 25_000,
    kind: "proest_budget",
  });

  const demolitionAnswers = (facts: Answers["facts"]): Answers => ({ ...ANSWERS, facts });

  it("prices Structure Demolition per square foot of structure, by structure type: 12,000 SF of Wood Frame gives a $79,200 midpoint", () => {
    const rom = computeRom(
      demolitionAnswers({
        demolitionStructureCount: 1,
        demolitionStructureSquareFeet: 12_000,
        demolitionStructureType: "wood_frame_type_v",
      }),
      snapshot(...FIVE_RATES),
    );

    expect(rom.lines).toHaveLength(1);
    const [line] = rom.lines;
    expect(line.costCode).toBe("1a");
    expect(midpoint(line)).toBe(79_200);
  });

  it("prices Structure Demolition as the full span, not a blended midpoint, when the structure type is Don't Know", () => {
    const rom = computeRom(
      demolitionAnswers({
        demolitionStructureCount: 1,
        demolitionStructureSquareFeet: 10_000,
        demolitionStructureType: "dont_know",
      }),
      snapshot(...FIVE_RATES),
    );

    const [line] = rom.lines;
    expect(line.low).toBe(55_000); // $5.50 low rate x 10,000 SF
    expect(line.high).toBe(198_000); // $19.80 high rate x 10,000 SF
    expect(line.heldForReview).toBe(true);
  });

  it("prices Site Demolition as a lump sum that does not scale with gross square feet", () => {
    const small = computeRom({ ...ANSWERS, grossSquareFeet: 1000 }, snapshot(SITE_DEMOLITION));
    const large = computeRom({ ...ANSWERS, grossSquareFeet: 500_000 }, snapshot(SITE_DEMOLITION));

    expect(midpoint(small.lines[0])).toBe(25_000);
    expect(midpoint(large.lines[0])).toBe(25_000);
  });

  it("prices a usd_each_structure benchmark once per structure coming down, and at zero with none", () => {
    const perStructure = benchmark({
      costCode: "TEST-EACH",
      label: "Test $ each line",
      unit: "usd_each_structure",
      value: 500,
      kind: "reviewed_judgment",
    });

    const withThree = computeRom(demolitionAnswers({ demolitionStructureCount: 3 }), snapshot(perStructure));
    expect(midpoint(withThree.lines[0])).toBe(1500);

    const withNone = computeRom(ANSWERS, snapshot(perStructure));
    expect(withNone.lines[0].low).toBe(0);
    expect(withNone.lines[0].high).toBe(0);
  });

  it("leaves an ordinary usd_per_gsf line's pricing unaffected by demolition benchmarks in the same snapshot", () => {
    const ordinary = benchmark({ costCode: "TEST-A", value: 10 });
    const without = computeRom(ANSWERS, snapshot(ordinary));
    const withDemolition = computeRom(
      demolitionAnswers({
        demolitionStructureCount: 1,
        demolitionStructureSquareFeet: 12_000,
        demolitionStructureType: "wood_frame_type_v",
      }),
      snapshot(ordinary, SITE_DEMOLITION, ...FIVE_RATES),
    );

    const findA = (rom: ReturnType<typeof computeRom>) => rom.lines.find((l) => l.costCode === "TEST-A");
    expect(findA(withDemolition)).toEqual(findA(without));
  });

  // Corrected 2026-09-27, after LA-1154 review: LA-1154 (ADR 0006's
  // relationships) reads a priced line on item 1a as what brings its four
  // disconnects (28a, 28b, 31f, 36a) into the budget. A $0 line would have
  // wrongly brought them in on every job, including one that never answered
  // a single demolition question, so item 1a must produce no line at all,
  // and name nothing in unpricedItems, whenever it has no square footage to
  // price.
  describe("item 1a produces no line at all with nothing to price (corrected 2026-09-27)", () => {
    it("with no demolition facts answered whatsoever", () => {
      const rom = computeRom(ANSWERS, snapshot(...FIVE_RATES));

      expect(rom.lines).toEqual([]);
      expect(rom.unpricedItems).toEqual([]);
      expect(rom.total).toEqual({ low: 0, high: 0 });
    });

    it("with a structure count of zero, so the square-footage follow-up never opened", () => {
      const rom = computeRom(demolitionAnswers({ demolitionStructureCount: 0 }), snapshot(...FIVE_RATES));

      expect(rom.lines).toEqual([]);
      expect(rom.unpricedItems).toEqual([]);
    });

    it("alongside an ordinary line, so only Structure Demolition is missing, not the whole ROM", () => {
      const ordinary = benchmark({ costCode: "TEST-A", value: 10 });
      const rom = computeRom(ANSWERS, snapshot(ordinary, ...FIVE_RATES));

      expect(rom.lines.map((l) => l.costCode)).toEqual(["TEST-A"]);
    });
  });

  describe("stays unchanged on a job with no demolition answers (backtest)", () => {
    function demolitionGateRule(): BranchGateItemRule {
      return {
        costCode: "1",
        section: "demolition",
        requiresAllSections: [],
        closesOn: ["no"],
        statedBy: "mnicosia@thekulkagroup.com",
        statedOn: "2026-09-24",
        reason: "synthetic: mirrors the real branch_gate_items row for item 1.",
      };
    }

    it("prices nothing for Site Demolition or Structure Demolition when demolition is answered no", () => {
      const ordinary = benchmark({ costCode: "TEST-A", value: 10 });
      const withDemolitionBenchmarks: DataSnapshot = {
        benchmarks: [ordinary, SITE_DEMOLITION, ...FIVE_RATES],
        parameters: parameters(),
        branchGateItems: [demolitionGateRule()],
      };
      const withoutDemolitionBenchmarks: DataSnapshot = {
        benchmarks: [ordinary],
        parameters: parameters(),
        branchGateItems: [demolitionGateRule()],
      };
      const answers = demolitionAnswers({ demolition: "no" });

      const withDemolition = computeRom(answers, withDemolitionBenchmarks);
      const without = computeRom(answers, withoutDemolitionBenchmarks);

      expect(withDemolition.total).toEqual(without.total);
      expect(withDemolition.kulkaContractTotal).toEqual(without.kulkaContractTotal);
      expect(withDemolition.lines.find((l) => l.costCode === "1")?.gateStatus).toBe("not_in_job");
      expect(withDemolition.lines.find((l) => l.costCode === "1a")).toBeUndefined();
    });

    // Documents existing, pre-LA-1156 behavior rather than fixing it: a
    // branch gate left unanswered prices as "assumed present"
    // (packages/engine/src/rom-gates.ts, GLOSSARY.md's Branch gate entry).
    // Item 1 already carries a branch_gate_items row keyed to "demolition";
    // this is not a new rule LA-1156 adds, and changing the silence default
    // is out of this ticket's file lane. Item 1a has no such row and is
    // unaffected either way, because its own quantity is what gates it.
    it("prices Site Demolition as assumed present when demolition is left unanswered entirely (pre-existing branch-gate default, not new here)", () => {
      const withDemolitionBenchmarks: DataSnapshot = {
        benchmarks: [SITE_DEMOLITION, ...FIVE_RATES],
        parameters: parameters(),
        branchGateItems: [demolitionGateRule()],
      };

      const rom = computeRom(ANSWERS, withDemolitionBenchmarks);

      const item1 = rom.lines.find((l) => l.costCode === "1");
      expect(item1?.gateStatus).toBe("assumed_present");
      expect(midpoint(item1!)).toBe(25_000);
      expect(rom.lines.find((l) => l.costCode === "1a")).toBeUndefined();
    });
  });
});
