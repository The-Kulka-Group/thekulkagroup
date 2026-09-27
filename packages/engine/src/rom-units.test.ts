import { describe, expect, it, vi } from "vitest";

import { computeRom, type Answers, type Benchmark, type DataSnapshot, type EngineParameters, type RomLine } from "./rom";
import {
  isFullSpan,
  priceStructureDemolition,
  quantityFor,
  readDemolitionFacts,
  structureDemolitionRows,
  structureDemolitionSpanLine,
} from "./rom-units";

// LA-1156, ADR 0006: the demolition pilot's benchmark units. `quantityFor`
// and `readDemolitionFacts` are exercised directly here, pure function to
// pure function. The RomLine-shaped pieces (`structureDemolitionSpanLine`,
// `priceStructureDemolition`) take a `blend` callback rather than a real
// blend, the same seam rom-framing.test.ts's own module leaves to rom.ts;
// the end-to-end pricing through `computeRom` is proven in rom.test.ts.

function benchmark(over: Partial<Benchmark> = {}): Benchmark {
  return {
    costCode: "1a",
    label: "Structure Demolition",
    unit: "usd_per_sf_of_structure",
    value: 6.6,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: [],
      exportLabel: null,
      recordedBy: "mnicosia@thekulkagroup.com",
      recordedAt: "2026-09-26",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...over,
  };
}

const FIVE_RATES = [
  benchmark({ value: 6.6, structureType: "wood_frame_type_v" }),
  benchmark({ value: 9.9, structureType: "masonry_bearing_wall_type_iii" }),
  benchmark({ value: 5.5, structureType: "pre_engineered_metal_or_light_steel" }),
  benchmark({ value: 13.2, structureType: "steel_frame_concrete_metal_deck_type_ii" }),
  benchmark({ value: 19.8, structureType: "cast_in_place_concrete_frame_type_i" }),
];

function shellLine(over: Partial<RomLine> = {}): RomLine {
  return {
    costCode: "1a",
    label: "Structure Demolition",
    low: 999,
    high: 999,
    confidence: "medium",
    heldForReview: false,
    comparableCount: 5,
    comparables: [],
    judgmentAdjustments: [],
    scopeSide: "building",
    contractSide: "kulka",
    detailLevel: null,
    element: null,
    breakoutOf: null,
    buyoutPackage: null,
    gateStatus: null,
    ...over,
  };
}

describe("quantityFor", () => {
  it("keeps multiplying usd_per_gsf by gross square feet, unchanged from before this ticket", () => {
    expect(quantityFor("usd_per_gsf", 42_000, { structureCount: null, structureSquareFeet: null, structureType: null })).toBe(42_000);
  });

  it("prices a lump sum at one, whatever the project's size", () => {
    const facts = { structureCount: null, structureSquareFeet: null, structureType: null };
    expect(quantityFor("usd_lump_sum", 1_000, facts)).toBe(1);
    expect(quantityFor("usd_lump_sum", 5_000_000, facts)).toBe(1);
  });

  it("reads usd_per_sf_of_structure off the structure square footage", () => {
    expect(
      quantityFor("usd_per_sf_of_structure", 1_000, {
        structureCount: null,
        structureSquareFeet: 12_000,
        structureType: "wood_frame_type_v",
      }),
    ).toBe(12_000);
  });

  it("reads usd_each_structure off the structure count", () => {
    expect(
      quantityFor("usd_each_structure", 1_000, { structureCount: 3, structureSquareFeet: null, structureType: null }),
    ).toBe(3);
  });

  it("prices the demolition units at zero when the fact behind them has not arrived yet", () => {
    const facts = { structureCount: null, structureSquareFeet: null, structureType: null };
    expect(quantityFor("usd_per_sf_of_structure", 1_000, facts)).toBe(0);
    expect(quantityFor("usd_each_structure", 1_000, facts)).toBe(0);
  });
});

describe("readDemolitionFacts", () => {
  it("reads every field LA-1155's intake gives it", () => {
    const facts = readDemolitionFacts({
      demolitionStructureCount: 2,
      demolitionStructureSquareFeet: 18_000,
      demolitionStructureType: "wood_frame_type_v",
    });
    expect(facts).toEqual({
      structureCount: 2,
      structureSquareFeet: 18_000,
      structureType: "wood_frame_type_v",
    });
  });

  it("reads Don't Know as a structure type, not as unknown", () => {
    expect(readDemolitionFacts({ demolitionStructureType: "dont_know" }).structureType).toBe("dont_know");
  });

  it("reads every field as null when facts are absent entirely", () => {
    expect(readDemolitionFacts(undefined)).toEqual({
      structureCount: null,
      structureSquareFeet: null,
      structureType: null,
    });
  });

  it("reads a value of the wrong shape as null rather than trusting it", () => {
    const facts = readDemolitionFacts({
      demolitionStructureCount: "two",
      demolitionStructureSquareFeet: "18000",
      demolitionStructureType: "spaceship",
    });
    expect(facts).toEqual({ structureCount: null, structureSquareFeet: null, structureType: null });
  });
});

describe("isFullSpan", () => {
  it("is true for Don't Know and for no answer yet", () => {
    expect(isFullSpan("dont_know")).toBe(true);
    expect(isFullSpan(null)).toBe(true);
  });

  it("is false for every named structure type", () => {
    expect(isFullSpan("wood_frame_type_v")).toBe(false);
  });
});

describe("structureDemolitionRows", () => {
  it("keeps only the row for the named structure type", () => {
    const kept = structureDemolitionRows(FIVE_RATES, "steel_frame_concrete_metal_deck_type_ii");
    expect(kept).toHaveLength(1);
    expect(kept[0].value).toBe(13.2);
  });

  it("falls back to every row when nothing matches the type asked for", () => {
    const kept = structureDemolitionRows(FIVE_RATES, "wood_frame_type_v" as never);
    expect(kept.length).toBeGreaterThan(0);
    const noneMatch = structureDemolitionRows(
      FIVE_RATES.filter((r) => r.structureType !== "wood_frame_type_v"),
      "wood_frame_type_v",
    );
    expect(noneMatch).toHaveLength(4);
  });
});

describe("structureDemolitionSpanLine", () => {
  it("prices the low end from the lowest rate and the high end from the highest, over the structure square footage", () => {
    const blend = vi.fn().mockReturnValue(shellLine({ low: 1, high: 2 }));
    const line = structureDemolitionSpanLine(FIVE_RATES, 10_000, blend);

    expect(blend).toHaveBeenCalledTimes(1);
    expect(line.low).toBe(55_000); // 5.50 * 10,000
    expect(line.high).toBe(198_000); // 19.80 * 10,000
  });

  it("holds the line for review and flags it low confidence, whatever the shell said", () => {
    const blend = vi.fn().mockReturnValue(shellLine({ confidence: "high", heldForReview: false }));
    const line = structureDemolitionSpanLine(FIVE_RATES, 1, blend);

    expect(line.confidence).toBe("low");
    expect(line.heldForReview).toBe(true);
  });

  it("keeps the shell's label, classification and comparables untouched", () => {
    const shell = shellLine({ element: "Demolition", buyoutPackage: "Demolition", comparableCount: 5 });
    const blend = vi.fn().mockReturnValue(shell);
    const line = structureDemolitionSpanLine(FIVE_RATES, 1, blend);

    expect(line.element).toBe("Demolition");
    expect(line.buyoutPackage).toBe("Demolition");
    expect(line.comparableCount).toBe(5);
  });
});

describe("priceStructureDemolition", () => {
  it("blends only the matching row for a known structure type", () => {
    const blend = vi.fn((rows: Benchmark[]) => shellLine({ comparableCount: rows.length }));
    const line = priceStructureDemolition(
      FIVE_RATES,
      { structureCount: 1, structureSquareFeet: 12_000, structureType: "wood_frame_type_v" },
      blend,
    );

    expect(blend).toHaveBeenCalledTimes(1);
    expect(blend.mock.calls[0][0]).toHaveLength(1);
    expect(blend.mock.calls[0][0][0].structureType).toBe("wood_frame_type_v");
    expect(line.comparableCount).toBe(1);
  });

  it("prices the full span, not a blend, when the structure type is Don't Know", () => {
    const blend = vi.fn().mockReturnValue(shellLine());
    const line = priceStructureDemolition(
      FIVE_RATES,
      { structureCount: 1, structureSquareFeet: 1_000, structureType: "dont_know" },
      blend,
    );

    expect(line.low).toBe(5_500);
    expect(line.high).toBe(19_800);
  });

  it("prices the full span at zero when no structure square footage has arrived yet", () => {
    const blend = vi.fn().mockReturnValue(shellLine());
    const line = priceStructureDemolition(
      FIVE_RATES,
      { structureCount: null, structureSquareFeet: null, structureType: null },
      blend,
    );

    expect(line.low).toBe(0);
    expect(line.high).toBe(0);
  });
});

// A thin end-to-end check that the pure pieces above wire into computeRom the
// way rom.ts's own hook says: see rom.test.ts's "demolition benchmark units"
// describe block for the full acceptance-level cases (12,000 SF of Wood
// Frame, Don't Know's full span, the lump sum, and existing lines unchanged).
describe("computeRom reads BenchmarkUnit through quantityFor", () => {
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
        { value, provenance: { kind: "reviewed_judgment" as const, recordedBy: "t", recordedAt: "2026-09-25", reason: "synthetic" } },
      ]),
    ) as EngineParameters;
  }

  it("prices a usd_each_structure benchmark once per structure coming down", () => {
    const answers: Answers = {
      projectType: "multifamily",
      constructionKind: "new",
      grossSquareFeet: 1000,
      facts: { demolitionStructureCount: 3 },
    };
    const snapshot: DataSnapshot = {
      benchmarks: [benchmark({ costCode: "TEST-EACH", unit: "usd_each_structure", value: 500, structureType: undefined })],
      parameters: parameters(),
    };
    const rom = computeRom(answers, snapshot);
    const [line] = rom.lines;
    expect((line.low + line.high) / 2).toBe(1500);
  });
});
