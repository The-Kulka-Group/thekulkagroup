import { describe, expect, it } from "vitest";
import type { Comparable, Rom, RomLine, UnpricedItem } from "@kulka/engine";

import { partPrices } from "./part-prices";
import { type StageFacts, stageBuilding } from "./stage-model";

// LA-2211: the part price map. Synthetic lines, labelled as such; none is a
// Kulka cost. Each case feeds the map a ROM and the stage facts the way the
// ROM screen does, and reads back what a user would see on a picked part.

const facts = (over: Partial<StageFacts> = {}): StageFacts => ({
  grossSquareFeet: 100_000,
  stories: 5,
  unitCount: 90,
  buildingCount: 1,
  parkingType: "none",
  elevatorCount: 0,
  belowGrade: false,
  balconies: false,
  retail: false,
  ...over,
});

const recorded = { recordedBy: "automated test", recordedAt: "2026-10-11" };
const job: Comparable = { kind: "actuals", rate: 0, weight: 1, sourceProjectIds: ["p1"], exportLabel: "Synthetic export", ...recorded };

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

const sample = rom([
  line({ costCode: "2", label: "Foundations, footings, slab-on-grade", low: 1_800_000, high: 2_200_000, quantity: { amount: 100_000, unit: "usd_per_gsf" } }),
  line({ costCode: "8", label: "Wood framing", low: 3_000_000, high: 3_400_000 }),
  line({ costCode: "16a", label: "Residential windows", low: 900_000, high: 1_100_000 }),
  line({ costCode: "26", label: "Elevators", low: 300_000, high: 340_000 }),
  line({ costCode: "38", label: "Paving and base courses", low: 200_000, high: 260_000, scopeSide: "site" }),
  line({ costCode: "XX-1", label: "Synthetic unknown site item", low: 50_000, high: 70_000, scopeSide: "site" }),
  line({ costCode: "XX-2", label: "Synthetic unknown building item", low: 10_000, high: 30_000 }),
  // Neither adds to the total, so neither belongs to a part.
  line({ costCode: "26b", label: "Synthetic breakout", low: 5_000, high: 6_000, breakoutOf: "26" }),
  line({ costCode: "1", label: "Demolition", low: 0, high: 0, gateStatus: "not_in_job" }),
]);

const midpointOf = (r: Rom) => (r.total.low + r.total.high) / 2;

describe("partPrices", () => {
  it("puts every priced line in exactly one part, and the parts add up to the run total", () => {
    const f = facts();
    const map = partPrices({ rom: sample, facts: f, building: stageBuilding(f, []) });
    const placed = map.parts.flatMap((p) => p.lines.map((l) => l.costCode)).sort();
    expect(placed).toEqual(["16a", "2", "26", "38", "8", "XX-1", "XX-2"]);
    const sum = map.parts.reduce((s, p) => s + (p.total ?? 0), 0);
    expect(sum).toBe(midpointOf(sample));
    expect(map.total).toBe(midpointOf(sample));
  });

  it("puts each canonical item on the part that draws it, and an item the building does not draw on its body", () => {
    const codesOf = (map: ReturnType<typeof partPrices>) =>
      Object.fromEntries(map.parts.map((p) => [p.part, p.lines.map((l) => l.costCode)]));

    const withCars = facts({ elevatorCount: 2 });
    const drawn = codesOf(partPrices({ rom: sample, facts: withCars, building: stageBuilding(withCars, []) }));
    expect(drawn).toEqual({
      site: ["38", "XX-1"],
      foundation: ["2"],
      massing: ["8", "XX-2"],
      glass: ["16a"],
      elevators: [],
      elevatorJack: ["26"],
    });

    // No elevators drawn: item 26 sits on the building's body, so the total still adds up.
    const noCars = facts({ elevatorCount: 0 });
    expect(codesOf(partPrices({ rom: sample, facts: noCars, building: stageBuilding(noCars, []) })).massing).toEqual(["8", "26", "XX-2"]);
  });

  it("gives a picked part its cost, its $/GSF, its source mark and its rate math", () => {
    const f = facts();
    const map = partPrices({ rom: sample, facts: f, building: stageBuilding(f, []) });
    const foundation = map.parts.find((p) => p.part === "foundation")!;
    expect(foundation).toMatchObject({
      name: "Foundation",
      total: 2_000_000,
      perGsf: 20,
      source: "Kulka Rate",
      unpriced: false,
      math: ["Foundations, Footings, Slab-on-Grade: 100,000 SF x $20.00 per SF (1 Kulka Job)"],
    });
  });

  it("marks a part by its weakest source, and words a lump sum and a line with no quantity", () => {
    const f = facts();
    const site = rom([
      line({ costCode: "38", label: "Paving and base courses", low: 200_000, high: 260_000, scopeSide: "site", comparables: [{ ...job, kind: "llm_proposal" }], comparableCount: 0, quantity: { amount: 1, unit: "usd_lump_sum" } }),
      line({ costCode: "39", label: "Site concrete", low: 40_000, high: 60_000, scopeSide: "site", comparableCount: 3 }),
    ]);
    const part = partPrices({ rom: site, facts: f, building: stageBuilding(f, []) }).parts.find((p) => p.part === "site")!;
    expect(part.total).toBe(280_000);
    expect(part.perGsf).toBe(2.8);
    expect(part.source).toBe("Placeholder Rate");
    expect(part.math).toEqual(["Paving and Base Courses: $230,000 Lump Sum (AI Figure)", "Site Concrete: $50,000 (3 Kulka Jobs)"]);
  });

  it("leaves a part nothing prices unpriced, naming each item with no rate, never $0", () => {
    const f = facts({ balconies: true });
    const service = [{ code: "E-1", value: { kind: "quantity" as const, amount: 2000, unit: "A" }, steps: [], correction: null }];
    const r = rom(
      [line({ costCode: "8", low: 100, high: 100 })],
      [{ costCode: "11", label: "Balcony deck" }, { costCode: "31f", label: "Electrical service disconnect", driverCostCode: "1a" }],
    );
    const map = partPrices({ rom: r, facts: f, building: stageBuilding(f, service) });
    const at = (part: string) => map.parts.find((p) => p.part === part)!;

    expect(at("balconies")).toMatchObject({ total: null, perGsf: null, source: "No Rate Yet", unpriced: true, lines: [], math: ["Balcony Deck: No Rate Yet"] });
    expect(at("balconies").unpricedItems.map((u) => u.costCode)).toEqual(["11"]);
    expect(at("site").unpricedItems.map((u) => u.costCode)).toEqual(["31f"]);
    // E-1 draws the service, but no line prices it.
    expect(at("service")).toMatchObject({ total: null, source: "No Rate Yet", unpriced: true, math: [] });
    expect(at("massing").unpriced).toBe(false);
  });

  describe("the list rows at each level", () => {
    const withDemolition = rom(
      [
        ...sample.lines,
        line({ costCode: "1a", label: "Structure demolition", low: 60_000, high: 80_000, scopeSide: "site", element: "Demolition" }),
        line({ costCode: "28a", label: "Plumbing disconnect", low: 3_000, high: 5_000, scopeSide: "site", element: "Demolition", driverCostCode: "1a" }),
      ],
      [{ costCode: "36a", label: "Water disconnect", driverCostCode: "1a", element: "Demolition" }, { costCode: "11", label: "Balcony deck" }],
    );
    const classifications = [
      { costCode: "1a", detailLevel: 1 as const, element: "Demolition" as const, breakoutOfCostCode: null, buyoutPackage: null, isElementDriver: true, statedBy: "automated test", statedOn: "2026-10-11", reason: "synthetic" },
    ];
    const f = facts({ elevatorCount: 2 });
    const at = (level: 1 | 2 | 3) => partPrices({ rom: withDemolition, facts: f, building: stageBuilding(f, []), level, classifications }).view;
    const sum = (rows: { total: number | null }[]) => rows.reduce((s, r) => s + (r.total ?? 0), 0);

    it("totals the run at every level", () => {
      for (const level of [1, 2, 3] as const) {
        expect(at(level).level).toBe(level);
        expect(sum(at(level).rows)).toBe(midpointOf(withDemolition));
      }
    });

    it("reads level 1 as one block over every drawn part", () => {
      expect(at(1).rows).toEqual([
        { key: "block", label: "Building", total: midpointOf(withDemolition), parts: ["site", "foundation", "massing", "glass", "elevators", "elevatorJack"] },
      ]);
    });

    it("reads level 2 as the element boxes beside the lines no element holds, biggest first", () => {
      const rows = at(2).rows;
      expect(rows.find((r) => r.key === "element:Demolition")).toEqual({ key: "element:Demolition", label: "Demolition", total: 74_000, parts: ["site"] });
      expect(rows.map((r) => r.key)).toEqual(["line:8", "line:2", "line:16a", "line:26", "line:38", "element:Demolition", "line:XX-1", "line:XX-2", "unpriced:11"]);
    });

    it("reads level 3 as one row a canonical item, unpriced items with no total", () => {
      const rows = at(3).rows;
      expect(rows.find((r) => r.key === "line:2")).toEqual({ key: "line:2", label: "Foundations, Footings, Slab-on-Grade", total: 2_000_000, parts: ["foundation"] });
      expect(rows.find((r) => r.key === "unpriced:36a")).toEqual({ key: "unpriced:36a", label: "Water Disconnect", total: null, parts: ["site"] });
      expect(rows).toHaveLength(11);
    });
  });

  it("follows item 26 for the elevator's sub-items only, not for any other lettered item", () => {
    const f = facts({ elevatorCount: 1, parkingType: "structured" });
    const lettered = rom([
      line({ costCode: "3", low: 100, high: 100 }),
      line({ costCode: "3a", low: 100, high: 100 }),
      line({ costCode: "26a", low: 100, high: 100 }),
      line({ costCode: "26g", low: 100, high: 100 }),
    ]);
    const map = partPrices({ rom: lettered, facts: f, building: stageBuilding(f, []) });
    const at = (part: string) => map.parts.find((p) => p.part === part)?.lines.map((l) => l.costCode);
    expect(at("podium")).toEqual(["3"]);
    expect(at("massing")).toEqual(["3a"]);
    expect(at("elevators")).toEqual(["26a", "26g"]);
  });

  describe("the derived elevator type (V-1, LA-2215)", () => {
    const type = (text: string) => [{ code: "V-1", value: { kind: "spec" as const, text }, steps: [], correction: null }];
    const elevatorLine = line({
      costCode: "26",
      label: "Elevators",
      low: 560_000,
      high: 560_000,
      comparableCount: 0,
      comparables: [{ ...job, kind: "reviewed_judgment", rate: 35_000 }],
      quantity: { amount: 16, unit: "usd_per_stop" },
    });
    const map = (text: string | null) => {
      const f = facts({ elevatorCount: 2, stories: 7 });
      return partPrices({ rom: rom([elevatorLine, line({ costCode: "26a", low: 100, high: 100 })]), facts: f, building: stageBuilding(f, text ? type(text) : []) });
    };
    const part = (m: ReturnType<typeof map>, name: string) => m.parts.find((p) => p.part === name);

    it("puts the elevator line on the jack when the type is hydraulic, and the bulkhead stays on the elevators", () => {
      const m = map("Hydraulic");
      expect(part(m, "elevatorJack")?.lines.map((l) => l.costCode)).toEqual(["26"]);
      expect(part(m, "elevatorJack")?.name).toBe("Elevator Jack");
      expect(part(m, "elevators")?.lines.map((l) => l.costCode)).toEqual(["26a"]);
      expect(part(m, "elevatorMachine")).toBeUndefined();
    });

    it("puts the elevator line on the machine when the type is traction", () => {
      const m = map("Traction");
      expect(part(m, "elevatorMachine")?.lines.map((l) => l.costCode)).toEqual(["26"]);
      expect(part(m, "elevatorMachine")?.name).toBe("Elevator Machine");
      expect(part(m, "elevatorJack")).toBeUndefined();
    });

    it("reads hydraulic when no type has been derived yet", () => {
      expect(part(map(null), "elevatorJack")?.lines).toHaveLength(1);
    });

    it("shows cars x stops x the rate on the elevator part", () => {
      expect(part(map("Hydraulic"), "elevatorJack")?.math).toEqual(["Elevators: 2 Cars x 8 Stops x $35,000 per Stop (Stated Rate)"]);
      const traction = elevatorLine.quantity && { ...elevatorLine, low: 724_800, high: 724_800, comparables: [{ ...job, kind: "reviewed_judgment" as const, rate: 45_300 }] };
      const f = facts({ elevatorCount: 2, stories: 7 });
      const m = partPrices({ rom: rom([traction!]), facts: f, building: stageBuilding(f, type("Traction")) });
      expect(part(m, "elevatorMachine")?.math).toEqual(["Elevators: 2 Cars x 8 Stops x $45,300 per Stop (Stated Rate)"]);
    });
  });
});
