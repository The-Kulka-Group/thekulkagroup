import { describe, expect, it } from "vitest";

import type { Benchmark, RomLine } from "./rom";
import {
  bulkheadCost,
  elevatorBand,
  elevatorSpanLine,
  elevatorTravelFeet,
  elevatorTypeRows,
  floorToFloorFor,
  hasElevatorScope,
  priceElevator,
  priceElevatorBulkhead,
  readElevatorFacts,
  stopsPerElevator,
  totalElevatorStops,
  type ElevatorFacts,
} from "./elevator";

// LA-1205. V-1's travel arithmetic and band, and item 26/26a's pricing.
// `priceElevator` and `priceElevatorBulkhead` take a `blend` callback rather
// than a real blend, the same seam rom-units.test.ts already uses for item
// 1a; end-to-end pricing through `computeRom` belongs in rom.test.ts.

function benchmark(over: Partial<Benchmark> = {}): Benchmark {
  return {
    costCode: "26",
    label: "Elevators",
    unit: "usd_per_stop",
    value: 35000,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "reviewed_judgment",
      sourceProjectIds: [],
      exportLabel: null,
      recordedBy: "mnicosia@thekulkagroup.com",
      recordedAt: "2026-09-27",
    },
    scopeSide: "building",
    contractSide: "kulka",
    ...over,
  };
}

const ELEVATOR_RATES = [
  benchmark({ value: 35000, elevatorType: "hydraulic" }),
  benchmark({ value: 45300, elevatorType: "traction" }),
];

function bulkheadRow(over: Partial<Benchmark> = {}): Benchmark {
  return benchmark({
    costCode: "26a",
    label: "Elevator Bulkhead",
    unit: "usd_lump_sum",
    value: 16600,
    elevatorType: undefined,
    ...over,
  });
}

const BULKHEAD_RATES = [
  bulkheadRow({ value: 16600, elevatorBulkheadConfig: "single_car" }),
  bulkheadRow({ value: 28700, elevatorBulkheadConfig: "shared_two_car" }),
  bulkheadRow({ value: 2200, elevatorBulkheadConfig: "door_package" }),
];

function shellLine(over: Partial<RomLine> = {}): RomLine {
  return {
    costCode: "26",
    label: "Elevators",
    low: 999,
    high: 999,
    confidence: "medium",
    heldForReview: false,
    comparableCount: 1,
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

function facts(over: Partial<ElevatorFacts> = {}): ElevatorFacts {
  return {
    elevatorType: null,
    elevatorCount: null,
    storiesAboveGrade: null,
    levelsBelowGradeServed: false,
    ...over,
  };
}

describe("floorToFloorFor", () => {
  it("gives the wood figure for wood framing, stated", () => {
    expect(floorToFloorFor("wood")).toEqual({ feet: 10, source: "wood", assumed: false });
  });

  it("gives the cold-formed-steel figure (equal to wood) for metal framing, stated", () => {
    expect(floorToFloorFor("metal")).toEqual({ feet: 10, source: "cold_formed_steel", assumed: false });
  });

  it("assumes wood when framing is not known", () => {
    expect(floorToFloorFor(null)).toEqual({ feet: 10, source: "wood", assumed: true });
  });
});

describe("elevatorTravelFeet and elevatorBand at 10'-0\" floors", () => {
  it("4 stories: Hydraulic (travel 30 ft)", () => {
    const travel = elevatorTravelFeet(4, 10, false);
    expect(travel).toBe(30);
    expect(elevatorBand(travel)).toBe("hydraulic");
  });

  it("6 stories: either (travel 50 ft)", () => {
    const travel = elevatorTravelFeet(6, 10, false);
    expect(travel).toBe(50);
    expect(elevatorBand(travel)).toBe("either");
  });

  it("8 stories: Traction (travel 70 ft)", () => {
    const travel = elevatorTravelFeet(8, 10, false);
    expect(travel).toBe(70);
    expect(elevatorBand(travel)).toBe("traction");
  });

  it("a taller retail ground floor adds the extra height only", () => {
    // 6 stories at 10'-0" with a 15'-0" ground floor: 5*10 + (15-10) = 55, still "either".
    const travel = elevatorTravelFeet(6, 10, true);
    expect(travel).toBe(55);
    expect(elevatorBand(travel)).toBe("either");
  });

  it("boundaries: exactly 35 ft is Hydraulic, exactly 55 ft is still either", () => {
    expect(elevatorBand(35)).toBe("hydraulic");
    expect(elevatorBand(35.01)).toBe("either");
    expect(elevatorBand(55)).toBe("either");
    expect(elevatorBand(55.01)).toBe("traction");
  });
});

describe("readElevatorFacts and stop counting", () => {
  it("reads no facts as none of it answered yet", () => {
    expect(readElevatorFacts(undefined)).toEqual(facts());
  });

  it("stops per elevator is Stories Above Grade alone when nothing is served below grade", () => {
    const f = facts({ storiesAboveGrade: 6, elevatorCount: 2 });
    expect(stopsPerElevator(f)).toBe(6);
    expect(totalElevatorStops(f)).toBe(12);
  });

  it("stops per elevator adds one for a served below-grade level", () => {
    const f = readElevatorFacts({ storiesAboveGrade: 6, elevatorCount: 2, levels_below_grade: "yes" });
    expect(stopsPerElevator(f)).toBe(7);
    expect(totalElevatorStops(f)).toBe(14);
  });

  it("has no scope with no elevator count, even with stories known", () => {
    expect(hasElevatorScope(facts({ storiesAboveGrade: 6 }))).toBe(false);
  });
});

describe("priceElevator", () => {
  it("produces no line with no elevator count", () => {
    const blend = (rows: Benchmark[]) => shellLine({ comparableCount: rows.length });
    expect(priceElevator(ELEVATOR_RATES, facts({ storiesAboveGrade: 6 }), blend)).toBeNull();
  });

  it("prices at the hydraulic rate per stop when V-1 holds Hydraulic", () => {
    const f = facts({ storiesAboveGrade: 6, elevatorCount: 2, elevatorType: "hydraulic" });
    const blend = (rows: Benchmark[]) => {
      expect(rows).toEqual([ELEVATOR_RATES[0]]);
      return shellLine({ low: rows[0].value * totalElevatorStops(f)!, high: rows[0].value * totalElevatorStops(f)! });
    };
    const line = priceElevator(ELEVATOR_RATES, f, blend);
    expect(line).toMatchObject({ low: 35000 * 12, high: 35000 * 12 });
  });

  it("a correction to V-1 (traction instead of hydraulic) changes the price", () => {
    const f = facts({ storiesAboveGrade: 6, elevatorCount: 2, elevatorType: "traction" });
    const blend = (rows: Benchmark[]) => shellLine({ low: rows[0].value * 12, high: rows[0].value * 12 });
    const line = priceElevator(ELEVATOR_RATES, f, blend);
    expect(line).toMatchObject({ low: 45300 * 12, high: 45300 * 12 });
  });

  it("prices the full span, held for review, when V-1 has not derived a type yet", () => {
    const f = facts({ storiesAboveGrade: 6, elevatorCount: 2 });
    const blend = (rows: Benchmark[]) => shellLine({ comparableCount: rows.length });
    const line = priceElevator(ELEVATOR_RATES, f, blend);
    const stops = totalElevatorStops(f)!;
    expect(line).toMatchObject({ low: 35000 * stops, high: 45300 * stops, confidence: "low", heldForReview: true });
  });

  it("falls back to elevatorTypeRows returning every row when nothing matches the known type", () => {
    expect(elevatorTypeRows(ELEVATOR_RATES, "hydraulic")).toEqual([ELEVATOR_RATES[0]]);
    expect(elevatorTypeRows([], "hydraulic")).toEqual([]);
  });
});

describe("elevatorSpanLine", () => {
  it("spans the lowest to the highest rate over the stop count", () => {
    const line = elevatorSpanLine(ELEVATOR_RATES, 6, (rows) => shellLine({ comparableCount: rows.length }));
    expect(line).toMatchObject({ low: 35000 * 6, high: 45300 * 6, confidence: "low", heldForReview: true });
  });
});

describe("bulkheadCost and priceElevatorBulkhead", () => {
  it("one elevator: the single-car rate", () => {
    expect(bulkheadCost(BULKHEAD_RATES, 1)).toBe(16600);
  });

  it("two elevators sharing one bulkhead: the shared-two-car rate, not double the single-car rate", () => {
    expect(bulkheadCost(BULKHEAD_RATES, 2)).toBe(28700);
  });

  it("three elevators: one shared pair plus one single-car bulkhead", () => {
    expect(bulkheadCost(BULKHEAD_RATES, 3)).toBe(28700 + 16600);
  });

  it("four elevators: two shared pairs", () => {
    expect(bulkheadCost(BULKHEAD_RATES, 4)).toBe(28700 * 2);
  });

  it("produces no line with no elevator count", () => {
    const blend = (rows: Benchmark[]) => shellLine({ comparableCount: rows.length });
    expect(priceElevatorBulkhead(BULKHEAD_RATES, null, blend)).toBeNull();
    expect(priceElevatorBulkhead(BULKHEAD_RATES, 0, blend)).toBeNull();
  });

  it("prices at Matt's stated figure, with no spread: low equals high", () => {
    const blend = (rows: Benchmark[]) => shellLine({ comparableCount: rows.length });
    const line = priceElevatorBulkhead(BULKHEAD_RATES, 1, blend);
    expect(line).toMatchObject({ low: 16600, high: 16600, confidence: "high", heldForReview: false });

    const twoCarLine = priceElevatorBulkhead(BULKHEAD_RATES, 2, blend);
    expect(twoCarLine).toMatchObject({ low: 28700, high: 28700, confidence: "high", heldForReview: false });
  });

  it("produces no line when a database is missing one of the two required rates", () => {
    const blend = (rows: Benchmark[]) => shellLine({ comparableCount: rows.length });
    const onlySingle = [BULKHEAD_RATES[0]];
    expect(priceElevatorBulkhead(onlySingle, 1, blend)).toBeNull();
  });
});
