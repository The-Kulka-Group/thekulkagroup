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
