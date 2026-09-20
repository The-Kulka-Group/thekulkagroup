import { describe, expect, it } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot } from "./rom";

// The engine seam, as LA-9 defines it: answers plus a data snapshot in, ROM
// out, with nothing read from a network, a database, or a clock. Every case
// below fixes external behaviour rather than internal structure.

function benchmark(over: Partial<Benchmark> = {}): Benchmark {
  return {
    costCode: "TEST-A",
    label: "Synthetic test line",
    unit: "usd_per_gsf",
    value: 1,
    projectType: "multifamily",
    constructionKind: "new",
    comparableCount: 5,
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: ["11111111-1111-4111-8111-111111111111"],
      exportLabel: null,
      recordedBy: "automated test",
      recordedAt: "2026-08-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...over,
  };
}

const ANSWERS: Answers = {
  projectType: "multifamily",
  constructionKind: "new",
  grossSquareFeet: 10,
};

function snapshot(...benchmarks: Benchmark[]): DataSnapshot {
  return { benchmarks };
}

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
      { ...ANSWERS, grossSquareFeet: 20 },
      snapshot(benchmark()),
    ).lines;

    expect(large.low).toBe(small.low * 2);
    expect(large.high).toBe(small.high * 2);
  });

  it("rounds every figure to whole dollars", () => {
    const rom = computeRom(
      { ...ANSWERS, grossSquareFeet: 13 },
      snapshot(benchmark({ value: 1.37 })),
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
      snapshot(benchmark(), benchmark({ costCode: "TEST-R", constructionKind: "renovation" })),
    );

    expect(rom.lines.map((l) => l.costCode)).toEqual(["TEST-A"]);
  });

  it("ignores benchmarks for another project type", () => {
    const rom = computeRom(
      ANSWERS,
      snapshot(benchmark({ costCode: "TEST-S", projectType: "self_storage" })),
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
    expect(rom.assumptions.join(" ")).toContain("10");
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
