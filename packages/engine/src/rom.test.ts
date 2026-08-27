import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot } from "./rom";

// The engine seam, as LA-9 defines it: answers plus a data snapshot in, ROM
// out, with nothing read from a network, a database, or a clock. Every case
// below fixes external behaviour rather than internal structure.

function benchmark(over: Partial<Benchmark> = {}): Benchmark {
  return {
    costCode: "03-CONC",
    label: "Concrete",
    unit: "usd_per_gsf",
    value: 40,
    projectType: "multifamily",
    constructionKind: "new",
    comparableCount: 5,
    provenance: {
      kind: "actuals",
      sourceProjectIds: ["11111111-1111-4111-8111-111111111111"],
      exportLabel: "Autodesk Cost export 2026-08",
      recordedBy: "Devin M.",
      recordedAt: "2026-08-27",
    },
    ...over,
  };
}

const ANSWERS: Answers = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 1000,
};

function snapshot(...benchmarks: Benchmark[]): DataSnapshot {
  return { benchmarks };
}

describe("computeRom", () => {
  it("returns a ranged line, never a point", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.lines).toHaveLength(1);
    const [line] = rom.lines;
    expect(line.costCode).toBe("03-CONC");
    expect(line.low).toBeLessThan(line.high);
  });

  it("gives the same ROM for the same answers and the same snapshot", () => {
    const first = computeRom(ANSWERS, snapshot(benchmark()));
    const second = computeRom(ANSWERS, snapshot(benchmark()));

    expect(first).toEqual(second);
  });

  it("flags a line high when many comparables stand behind it", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark({ comparableCount: 5 })));

    expect(rom.lines[0].confidence).toBe("high");
    expect(rom.lines[0].heldForReview).toBe(false);
  });

  it("flags a line medium on a couple of comparables", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark({ comparableCount: 2 })));

    expect(rom.lines[0].confidence).toBe("medium");
    expect(rom.lines[0].heldForReview).toBe(false);
  });

  it("holds a low-confidence line for human review", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark({ comparableCount: 1 })));

    expect(rom.lines[0].confidence).toBe("low");
    expect(rom.lines[0].heldForReview).toBe(true);
  });

  it("widens the range as confidence drops", () => {
    const width = (comparableCount: number) => {
      const [line] = computeRom(ANSWERS, snapshot(benchmark({ comparableCount }))).lines;
      return line.high - line.low;
    };

    expect(width(5)).toBeLessThan(width(2));
    expect(width(2)).toBeLessThan(width(1));
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
      { ...ANSWERS, grossSquareFeet: 1337 },
      snapshot(benchmark({ value: 40.37 })),
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
      snapshot(benchmark(), benchmark({ costCode: "03-RENO", constructionKind: "renovation" })),
    );

    expect(rom.lines.map((l) => l.costCode)).toEqual(["03-CONC"]);
  });

  it("ignores benchmarks for another project type", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ costCode: "03-SS", projectType: "self_storage" })),
    );

    expect(rom.lines).toEqual([]);
  });

  it("carries each benchmark's provenance through to its line", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.lines[0].provenance).toEqual(benchmark().provenance);
  });

  it("totals the lines it produced", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark(), benchmark({ costCode: "04-MAS", label: "Masonry", value: 10 })),
    );

    expect(rom.total.low).toBe(rom.lines[0].low + rom.lines[1].low);
    expect(rom.total.high).toBe(rom.lines[0].high + rom.lines[1].high);
  });

  it("orders lines by cost code whatever order the snapshot arrived in", () => {
    const forwards = computeRom(
      ANSWERS,
      snapshot(benchmark(), benchmark({ costCode: "04-MAS" })),
    );
    const backwards = computeRom(
      ANSWERS,
      snapshot(benchmark({ costCode: "04-MAS" }), benchmark()),
    );

    expect(forwards).toEqual(backwards);
    expect(forwards.lines.map((l) => l.costCode)).toEqual(["03-CONC", "04-MAS"]);
  });

  it("states the assumptions it worked from", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.assumptions.length).toBeGreaterThan(0);
    expect(rom.assumptions.join(" ")).toContain("1,000");
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
});

// DESIGN.md bans fabricated dollar figures in fixtures. The walking skeleton
// still needs a number to compute, so the fixture carries its own provenance
// kind and the ROM says out loud that it rests on one.
describe("fixture data", () => {
  const fixture = benchmark({
    provenance: {
      kind: "fixture",
      sourceProjectIds: [],
      exportLabel: null,
      recordedBy: "walking skeleton fixture",
      recordedAt: "2026-08-27",
    },
  });

  it("says the ROM rests on fixture data", () => {
    const rom = computeRom(ANSWERS, snapshot(fixture));

    expect(rom.assumptions.join(" ")).toContain("fixture");
  });

  it("says nothing about fixtures when none is involved", () => {
    const rom = computeRom(ANSWERS, snapshot(benchmark()));

    expect(rom.assumptions.join(" ")).not.toContain("fixture");
  });
});
