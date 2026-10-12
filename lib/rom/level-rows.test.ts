import { describe, expect, it } from "vitest";
import type { BlockClassification, Comparable, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { BLOCK_TINT, ELEMENT_TINTS, partTints, priceLevels, rowPerGsf, rowsHolding } from "./level-rows";
import { type StageFacts, stageBuilding } from "./stage-model";

// LA-2212 (spec LA-2209): the price levels the Building View reads the same
// run at. Synthetic lines, labelled as such; none is a Kulka cost.

const facts = (over: Partial<StageFacts> = {}): StageFacts => ({
  grossSquareFeet: 100_000,
  stories: 5,
  unitCount: 90,
  buildingCount: 1,
  parkingType: "none",
  elevatorCount: 2,
  belowGrade: false,
  balconies: false,
  retail: false,
  ...over,
});

const job: Comparable = {
  kind: "actuals", rate: 0, weight: 1, sourceProjectIds: ["p1"], exportLabel: "Synthetic export",
  recordedBy: "automated test", recordedAt: "2026-10-11",
};

function line(patch: Partial<RomLine> & Pick<RomLine, "costCode" | "low" | "high">): RomLine {
  return {
    label: `Synthetic ${patch.costCode}`,
    confidence: "high",
    heldForReview: false,
    comparableCount: 1,
    comparables: [job],
    judgmentAdjustments: [],
    scopeSide: "building",
    contractSide: "kulka",
    detailLevel: null,
    element: null,
    breakoutOf: null,
    buyoutPackage: null,
    gateStatus: null,
    ...patch,
  };
}

function rom(lines: RomLine[], unpricedItems: UnpricedItem[] = []): Rom {
  const adds = lines.filter((l) => l.breakoutOf === null && l.gateStatus !== "not_in_job" && l.gateStatus !== "tbd");
  const total = { low: adds.reduce((s, l) => s + l.low, 0), high: adds.reduce((s, l) => s + l.high, 0) };
  return {
    lines,
    total,
    kulkaContractTotal: total,
    carvedOut: { low: 0, high: 0 },
    notInThisJob: [],
    tbdGateItems: [],
    assumedPresentItems: [],
    unpricedItems,
    assumptions: [],
    parameters: {} as Rom["parameters"],
  };
}

const driver = (costCode: string, element: BlockClassification["element"]): BlockClassification => ({
  costCode, detailLevel: 1, element, breakoutOfCostCode: null, buyoutPackage: null, isElementDriver: true,
  statedBy: "automated test", statedOn: "2026-10-11", reason: "synthetic",
});

// 7,400,000 midpoint over 100,000 GSF: $74.00 per GSF.
const run = rom(
  [
    line({ costCode: "2", label: "Foundations", low: 1_800_000, high: 2_200_000 }),
    line({ costCode: "8", label: "Wood framing", low: 3_000_000, high: 3_400_000 }),
    line({ costCode: "26", label: "Elevators", low: 600_000, high: 700_000, element: "Elevator" }),
    line({ costCode: "26a", label: "Elevator bulkhead", low: 50_000, high: 50_000, element: "Elevator" }),
    line({ costCode: "1a", label: "Structure demolition", low: 60_000, high: 80_000, scopeSide: "site", element: "Demolition" }),
    line({ costCode: "28a", label: "Plumbing disconnect", low: 3_000, high: 5_000, scopeSide: "site", element: "Demolition", driverCostCode: "1a" }),
    line({ costCode: "38", label: "Paving", low: 1_423_000, high: 1_429_000, scopeSide: "site" }),
  ],
  [{ costCode: "11", label: "Balcony deck" }],
);
const classifications = [driver("26", "Elevator"), driver("1a", "Demolition")];
const f = facts();
const levels = priceLevels({ rom: run, facts: f, building: stageBuilding(f, []), classifications });
const sum = (rows: { total: number | null }[]) => rows.reduce((s, r) => s + (r.total ?? 0), 0);

describe("priceLevels", () => {
  it("reads the run at levels 1, 2 and 3, and every level totals the run", () => {
    expect(Object.keys(levels.views)).toEqual(["1", "2", "3"]);
    for (const level of [1, 2, 3] as const) {
      expect(levels.views[level].level).toBe(level);
      expect(sum(levels.views[level].rows)).toBe(7_400_000);
    }
    expect(levels.grossSquareFeet).toBe(100_000);
  });

  it("rolls level 2 up to the ADR 0002 elements and nothing else", () => {
    const rows = levels.views[2].rows;
    expect(rows.filter((r) => r.key.startsWith("element:")).map((r) => [r.key, r.total])).toEqual([
      ["element:Elevator", 700_000],
      ["element:Demolition", 74_000],
    ]);
    // Every other row is one canonical item, never a division or a package.
    expect(rows.filter((r) => !r.key.startsWith("element:")).map((r) => r.key)).toEqual(["line:8", "line:2", "line:38", "unpriced:11"]);
  });
});

describe("partTints", () => {
  it("tints every drawn part one colour at level 1, the run as one block", () => {
    expect(partTints(levels.views[1])).toEqual({
      site: BLOCK_TINT, foundation: BLOCK_TINT, massing: BLOCK_TINT, risers: BLOCK_TINT, glass: BLOCK_TINT, elevators: BLOCK_TINT,
      elevatorJack: BLOCK_TINT,
    });
  });

  it("tints the parts each element sits on at level 2, and leaves the rest in the model's own colours", () => {
    expect(partTints(levels.views[2])).toEqual({
      elevators: ELEMENT_TINTS.Elevator, elevatorJack: ELEMENT_TINTS.Elevator, site: ELEMENT_TINTS.Demolition,
    });
  });

  it("tints nothing at level 3", () => {
    expect(partTints(levels.views[3])).toEqual({});
  });

  it("gives each ADR 0002 element its own colour", () => {
    expect(Object.keys(ELEMENT_TINTS).sort()).toEqual(["Balcony", "Bathroom", "Demolition", "Elevator", "Kitchen"]);
    expect(new Set([...Object.values(ELEMENT_TINTS), BLOCK_TINT]).size).toBe(6);
  });
});

describe("rowsHolding", () => {
  it("names the rows a picked part sits in at each level", () => {
    expect(rowsHolding(levels.views[1], "foundation")).toEqual(["block"]);
    expect(rowsHolding(levels.views[2], "elevators")).toEqual(["element:Elevator"]);
    expect(rowsHolding(levels.views[2], "site")).toEqual(["line:38", "element:Demolition"]);
    expect(rowsHolding(levels.views[3], "foundation")).toEqual(["line:2"]);
    expect(rowsHolding(levels.views[3], "glass")).toEqual([]);
  });
});

describe("rowPerGsf", () => {
  it("reads a row's total over the gross area, and nothing when either is missing", () => {
    expect(rowPerGsf(levels.views[1].rows[0], 100_000)).toBe(74);
    expect(rowPerGsf(levels.views[1].rows[0], null)).toBeNull();
    expect(rowPerGsf({ key: "unpriced:11", label: "Balcony Deck", total: null, parts: ["massing"] }, 100_000)).toBeNull();
  });
});
