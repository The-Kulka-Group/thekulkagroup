import { describe, expect, it } from "vitest";
import type { Rom, RomLine } from "@kulka/engine";

import { partPrices } from "@/lib/rom/part-prices";
import { type StageFacts, stageBuilding } from "@/lib/rom/stage-model";

import { answerChip, changedParts, runningLine } from "./answer-feedback";

// LA-2213: what an answer changed on the building. Synthetic lines, labelled
// as such; none is a Kulka cost.

const facts: StageFacts = {
  grossSquareFeet: 100_000,
  stories: 5,
  unitCount: 90,
  buildingCount: 1,
  parkingType: "none",
  elevatorCount: 0,
  belowGrade: false,
  balconies: false,
  retail: false,
};

function line(costCode: string, low: number, high: number): RomLine {
  return {
    costCode,
    label: `Synthetic ${costCode}`,
    low,
    high,
    confidence: "high",
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
  };
}

function rom(lines: RomLine[]): Rom {
  const total = { low: lines.reduce((s, l) => s + l.low, 0), high: lines.reduce((s, l) => s + l.high, 0) };
  return {
    lines,
    total,
    kulkaContractTotal: total,
    carvedOut: { low: 0, high: 0 },
    notInThisJob: [],
    tbdGateItems: [],
    assumedPresentItems: [],
    unpricedItems: [],
    assumptions: [],
    parameters: {} as Rom["parameters"],
  };
}

const building = stageBuilding(facts, []);
const map = (lines: RomLine[]) => partPrices({ rom: rom(lines), facts, building });

describe("changedParts", () => {
  const before = map([line("2", 1_800_000, 2_200_000), line("8", 3_000_000, 3_400_000), line("16a", 900_000, 1_100_000)]);

  it("names only the parts whose lines changed", () => {
    const after = map([line("2", 1_800_000, 2_200_000), line("8", 3_000_000, 3_400_000), line("16a", 1_400_000, 1_600_000)]);
    expect(changedParts(before, after)).toEqual(["glass"]);
  });

  it("names nothing when no line changed", () => {
    const same = map([line("2", 1_800_000, 2_200_000), line("8", 3_000_000, 3_400_000), line("16a", 900_000, 1_100_000)]);
    expect(changedParts(before, same)).toEqual([]);
  });

  it("names a part that gained or lost its only line", () => {
    const gone = map([line("2", 1_800_000, 2_200_000), line("8", 3_000_000, 3_400_000)]);
    expect(changedParts(before, gone)).toEqual(["glass"]);
    expect(changedParts(gone, before)).toEqual(["glass"]);
  });

  it("names nothing on the first pricing, since there is nothing to compare with", () => {
    expect(changedParts(null, before)).toEqual([]);
  });
});

describe("answerChip", () => {
  it("shows the signed change in dollars", () => {
    expect(answerChip(-1_450_000)).toBe("−$1.45M");
    expect(answerChip(472_000)).toBe("+$472k");
  });
});

describe("runningLine", () => {
  it("compares the total with the first total of the session", () => {
    expect(runningLine(17_310_000, 15_860_000)).toBe("−$1.45M From Answers · Started at $17.31M");
    expect(runningLine(17_310_000, 17_782_000)).toBe("+$472k From Answers · Started at $17.31M");
  });

  it("says so when the answers have changed nothing", () => {
    expect(runningLine(17_310_000, 17_310_000)).toBe("No Change From Answers · Started at $17.31M");
  });
});
