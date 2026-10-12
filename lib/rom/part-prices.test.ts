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
      risers: [],
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
    expect(at("balconies").empty).toBe(false);
    expect(at("massing")).toMatchObject({ unpriced: false, empty: false });
  });

  // LA-2209 review S4: only a part whose lines have no rate is Not Priced.
  it("draws a part with no lines and no items normally, and says it has none in this budget", () => {
    const f = facts();
    const service = [{ code: "E-1", value: { kind: "quantity" as const, amount: 2000, unit: "A" }, steps: [], correction: null }];
    const map = partPrices({ rom: rom([line({ costCode: "8", low: 100, high: 100 })]), facts: f, building: stageBuilding(f, service) });
    // E-1 draws the service, but nothing in this budget sits on it.
    expect(map.parts.find((p) => p.part === "service")).toMatchObject({
      total: null,
      unpriced: false,
      empty: true,
      lines: [],
      unpricedItems: [],
      math: [],
    });
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
        { key: "block", label: "Building", total: midpointOf(withDemolition), parts: ["site", "foundation", "massing", "risers", "glass", "elevators", "elevatorJack"] },
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

  // LA-2209 review Q4: the risers the section's layer map names are their own part.
  it("puts the fire protection, plumbing, low voltage and fire alarm risers on the risers", () => {
    const f = facts();
    const risers = rom([
      line({ costCode: "27", label: "Fire sprinklers", low: 400_000, high: 500_000 }),
      line({ costCode: "28", label: "Plumbing", low: 900_000, high: 1_100_000 }),
      line({ costCode: "31a", label: "Low voltage", low: 90_000, high: 110_000 }),
      line({ costCode: "32", label: "Fire alarm", low: 70_000, high: 90_000 }),
      line({ costCode: "30", label: "HVAC", low: 1_000_000, high: 1_200_000 }),
      line({ costCode: "31", label: "Electrical", low: 1_500_000, high: 1_700_000 }),
    ]);
    const map = partPrices({ rom: risers, facts: f, building: stageBuilding(f, []) });
    const at = (part: string) => map.parts.find((p) => p.part === part);
    // With no rooftop units or service drawn, HVAC and electrical sit on their risers too.
    expect(at("risers")).toMatchObject({ name: "Risers", total: 4_330_000 });
    expect(at("risers")!.lines.map((l) => l.costCode)).toEqual(["27", "28", "31a", "32", "30", "31"]);
    expect(at("massing")!.lines).toEqual([]);

    // When M-1 and E-1 draw the units and the service, those items sit there instead.
    const cards = [
      { code: "M-1", value: { kind: "quantity" as const, amount: 189, unit: "Tons" }, steps: [], correction: null },
      { code: "E-1", value: { kind: "quantity" as const, amount: 2000, unit: "A" }, steps: [], correction: null },
    ];
    const drawn = partPrices({ rom: risers, facts: f, building: stageBuilding(f, cards) });
    expect(drawn.parts.find((p) => p.part === "units")!.lines.map((l) => l.costCode)).toEqual(["30"]);
    expect(drawn.parts.find((p) => p.part === "service")!.lines.map((l) => l.costCode)).toEqual(["31"]);
    expect(drawn.parts.find((p) => p.part === "risers")!.lines.map((l) => l.costCode)).toEqual(["27", "28", "31a", "32"]);
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
    expect(at("podiumDeck")).toEqual(["3"]);
    expect(at("massing")).toEqual(["3a"]);
    expect(at("elevators")).toEqual(["26a", "26g"]);
  });

  // LA-2216: the podium garage, priced from VA's stated rates on the garage area.
  describe("the podium garage", () => {
    const stated = (exportLabel: string): Comparable => ({ kind: "reviewed_judgment", rate: 0, weight: 1, sourceProjectIds: [], exportLabel: `Source job: ${exportLabel}. Synthetic.`, ...recorded });
    const garage = (amount: number) => ({ amount, unit: "usd_per_sf_of_garage" as const });
    const garageRun = rom([
      line({ costCode: "3", label: "Podium Deck", low: 682_600, high: 682_600, comparableCount: 0, comparables: [stated("VA")], quantity: garage(20_000) }),
      line({ costCode: "31g", label: "Garage Electrical", low: 360_000, high: 360_000, comparableCount: 0, comparables: [stated("VA")], quantity: garage(20_000) }),
      line({ costCode: "27a", label: "Garage Sprinklers", low: 120_000, high: 120_000, comparableCount: 0, comparables: [stated("VA")], quantity: garage(20_000) }),
      line({ costCode: "38", label: "Paving and base courses", low: 200_000, high: 200_000, scopeSide: "site" }),
      line({ costCode: "8", label: "Wood framing", low: 3_000_000, high: 3_000_000 }),
    ]);
    const priced = (parking: string) => {
      const f = facts({ parkingType: parking });
      return partPrices({ rom: garageRun, facts: f, building: stageBuilding(f, []) });
    };
    const part = (map: ReturnType<typeof partPrices>, name: string) => map.parts.find((p) => p.part === name);

    it("puts the deck, garage electrical and garage sprinklers on their own parts", () => {
      const map = priced("structured");
      expect(part(map, "podiumDeck")?.lines.map((l) => l.costCode)).toEqual(["3"]);
      expect(part(map, "garageElectrical")?.lines.map((l) => l.costCode)).toEqual(["31g"]);
      expect(part(map, "garageSprinklers")?.lines.map((l) => l.costCode)).toEqual(["27a"]);
      expect(part(map, "podiumDeck")).toMatchObject({ name: "Podium Deck", total: 682_600, unpriced: false });
      expect(part(map, "podiumDeck")?.math[0]).toBe("Podium Deck: 20,000 SF of Garage x $34.13 per SF of Garage (Stated Rate, VA)");
    });

    it("draws garage waterproofing, traffic coating and a dry sprinkler system as unpriced parts", () => {
      const map = priced("structured");
      const unpriced = ["garageWaterproofing", "garageCoating", "garageDrySprinklers"].map((name) => part(map, name));
      expect(unpriced.map((p) => [p?.name, p?.total, p?.unpriced, p?.math])).toEqual([
        ["Garage Waterproofing", null, true, ["Garage Waterproofing: No Rate Yet"]],
        ["Traffic Coating", null, true, ["Vehicular Traffic Coating: No Rate Yet"]],
        ["Dry Sprinklers", null, true, ["Dry Sprinkler System: No Rate Yet"]],
      ]);
      expect(map.view.rows.filter((r) => r.total === null).map((r) => r.label)).toEqual([
        "Garage Waterproofing",
        "Vehicular Traffic Coating",
        "Dry Sprinkler System",
      ]);
      expect(map.parts.reduce((s, p) => s + (p.total ?? 0), 0)).toBe(map.total);
    });

    it("draws a surface lot with no garage parts, and puts paving on the lot", () => {
      const map = priced("surface");
      const names = map.parts.map((p) => p.part);
      expect(names).toContain("surfaceLot");
      for (const garagePart of ["podium", "podiumDeck", "garageElectrical", "garageSprinklers", "garageWaterproofing", "garageCoating", "garageDrySprinklers"]) {
        expect(names).not.toContain(garagePart);
      }
      expect(part(map, "surfaceLot")?.lines.map((l) => l.costCode)).toEqual(["38"]);
    });

    it("names the missing fact on a garage item whose quantity is blank", () => {
      const f = facts({ parkingType: "structured", stories: null });
      const blank = rom([line({ costCode: "8", low: 100, high: 100 })], [
        { costCode: "31g", label: "Garage Electrical", missing: ["Stories Above Grade"] },
      ]);
      const map = partPrices({ rom: blank, facts: f, building: stageBuilding(f, []) });
      const math = map.parts.flatMap((p) => p.math);
      expect(math).toContain("Garage Electrical: No Quantity Yet, Needs Stories Above Grade");
      expect(map.view.rows.find((r) => r.key === "unpriced:31g")?.total).toBeNull();
    });
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

  // LA-2214: a stated rate names the job it came from, once, for every item.
  it("names the source job beside a stated rate, from the export label's first words", () => {
    const f = facts();
    const stated = (label: string | null) => ({ ...job, kind: "reviewed_judgment" as const, exportLabel: label });
    const stub = rom([
      line({ costCode: "38", label: "Paving", low: 100, high: 100, scopeSide: "site", comparableCount: 0, comparables: [stated("Source job: VA. Synthetic note.")], quantity: { amount: 1, unit: "usd_lump_sum" } }),
      line({ costCode: "39", label: "Site concrete", low: 100, high: 100, scopeSide: "site", comparableCount: 0, comparables: [stated("Matt said so, 2026-10-11.")], quantity: { amount: 1, unit: "usd_lump_sum" } }),
    ]);
    const site = partPrices({ rom: stub, facts: f, building: stageBuilding(f, []) }).parts.find((p) => p.part === "site")!;
    expect(site.math).toEqual(["Paving: $100 Lump Sum (Stated Rate, VA)", "Site Concrete: $100 Lump Sum (Stated Rate)"]);
  });

  it("draws item 34a on the piles when the soil is poor and on the foundation when the building has none", () => {
    const run = rom([line({ costCode: "34a", label: "Deep foundations, piles, and shoring", low: 350_000, high: 350_000, comparableCount: 0, comparables: [{ ...job, kind: "reviewed_judgment", exportLabel: "Source job: WS. Synthetic." }], quantity: { amount: 1, unit: "usd_lump_sum" } })]);
    const poor = facts({ poorSoil: true });
    const piles = partPrices({ rom: run, facts: poor, building: stageBuilding(poor, []) }).parts.find((p) => p.part === "piles")!;
    expect(piles).toMatchObject({ name: "Piles", total: 350_000, math: ["Deep Foundations, Piles, and Shoring: $350,000 Lump Sum (Stated Rate, WS)"] });
    const good = facts();
    const map = partPrices({ rom: run, facts: good, building: stageBuilding(good, []) });
    expect(map.parts.some((p) => p.part === "piles")).toBe(false);
    expect(map.parts.find((p) => p.part === "foundation")!.total).toBe(350_000);
  });
});

// LA-2219: full balconies. 25 balconies, 110 SF of deck and 26 LF of rail each,
// at the stated rates the migration seeds.
describe("full balconies", () => {
  const stated = (label: string): Comparable => ({ ...job, kind: "reviewed_judgment", exportLabel: label });
  const deck = line({
    costCode: "11",
    label: "Balcony Deck",
    low: 165_000,
    high: 165_000,
    comparableCount: 0,
    comparables: [stated("Source job: VA. Synthetic.")],
    quantity: { amount: 2_750, unit: "usd_per_sf_of_balcony" },
  });
  const rail = line({
    costCode: "11a",
    label: "Balcony Posts and Rail",
    low: 195_000,
    high: 195_000,
    comparableCount: 0,
    comparables: [stated("Source job: VA. Synthetic.")],
    quantity: { amount: 650, unit: "usd_per_lf_of_rail" },
  });
  const doors = line({
    costCode: "15b",
    label: "Sliding Doors",
    low: 45_000,
    high: 63_425,
    comparableCount: 0,
    comparables: [stated("Source jobs: VA, V64, VR. Low."), stated("Source jobs: VA, V64, VR. High.")],
    quantity: { amount: 25, unit: "usd_each_balcony_door" },
  });
  const full = facts({ balconies: true, balconyType: "full", balconyCount: 25 });
  const mapOf = (run: Rom, f: StageFacts = full) => partPrices({ rom: run, facts: f, building: stageBuilding(f, []) });
  const at = (map: ReturnType<typeof partPrices>, part: string) => map.parts.find((p) => p.part === part);

  it("puts the deck on the slabs, the rail on its own part and the doors on the wall behind them", () => {
    const map = mapOf(rom([deck, rail, doors]));
    expect(at(map, "balconies")?.lines.map((l) => l.costCode)).toEqual(["11"]);
    expect(at(map, "balconyRail")?.lines.map((l) => l.costCode)).toEqual(["11a"]);
    expect(at(map, "balconyDoors")?.lines.map((l) => l.costCode)).toEqual(["15b"]);
    expect([at(map, "balconies")?.name, at(map, "balconyRail")?.name, at(map, "balconyDoors")?.name]).toEqual([
      "Balcony Decks",
      "Balcony Rail",
      "Sliding Doors",
    ]);
  });

  it("shows the rate math per balcony, and the doors' low and high", () => {
    const map = mapOf(rom([deck, rail, doors]));
    expect(at(map, "balconies")?.math).toEqual(["Balcony Deck: 25 Balconies x 110 SF x $60.00 per SF (Stated Rate, VA)"]);
    expect(at(map, "balconyRail")?.math).toEqual(["Balcony Posts and Rail: 25 Balconies x 26 LF x $300 per LF (Stated Rate, VA)"]);
    expect(at(map, "balconyDoors")?.math).toEqual(["Sliding Doors: 25 Doors x $1,800 to $2,537 per Door (Stated Rate, VA, V64, VR)"]);
    expect(at(map, "balconyDoors")?.total).toBe(54_212.5);
  });

  it("words the quantity whole when the balcony count is not on the stage", () => {
    const map = mapOf(rom([rail]), facts({ balconies: true, balconyType: "full" }));
    expect(at(map, "balconyRail")?.math).toEqual(["Balcony Posts and Rail: 650 LF of Rail x $300 per LF (Stated Rate, VA)"]);
  });

  it("leaves a part whose fact is missing unpriced, and names the fact", () => {
    const map = mapOf(rom([deck, doors], [{ costCode: "11a", label: "Balcony Posts and Rail", missing: ["Rail per Balcony"] }]));
    expect(at(map, "balconyRail")).toMatchObject({
      total: null,
      unpriced: true,
      math: ["Balcony Posts and Rail: No Quantity Yet, Needs Rail per Balcony"],
    });
  });

  it("draws no deck or full rail for Juliet balconies, and keeps the doors", () => {
    const juliet = facts({ balconies: true, balconyType: "juliet" });
    const parts = mapOf(rom([]), juliet).parts.map((p) => p.part);
    expect(parts).not.toContain("balconies");
    expect(parts).not.toContain("balconyRail");
    expect(parts).toContain("balconyDoors");
  });
});

// LA-2220: 40 Juliet balconies with 6 LF of rail each, at $225 per LF.
describe("Juliet balconies", () => {
  const stated = (label: string): Comparable => ({ ...job, kind: "reviewed_judgment", exportLabel: label });
  const julietRail = line({
    costCode: "7b",
    label: "Juliet Rail",
    low: 54_000,
    high: 54_000,
    comparableCount: 0,
    comparables: [stated("Source jobs: V64, VA. Synthetic.")],
    quantity: { amount: 240, unit: "usd_per_lf_of_rail" },
  });
  const doors = line({
    costCode: "15b",
    label: "Sliding Doors",
    low: 72_000,
    high: 101_480,
    comparableCount: 0,
    comparables: [stated("Source jobs: VA, V64, VR. Low."), stated("Source jobs: VA, V64, VR. High.")],
    quantity: { amount: 40, unit: "usd_each_balcony_door" },
  });
  const juliet = facts({ balconies: true, balconyType: "juliet", balconyCount: 40 });
  const mapOf = (run: Rom, f: StageFacts = juliet) => partPrices({ rom: run, facts: f, building: stageBuilding(f, []) });
  const at = (map: ReturnType<typeof partPrices>, part: string) => map.parts.find((p) => p.part === part);

  it("puts the Juliet rail on its own part and the doors on the wall, with no slab", () => {
    const map = mapOf(rom([julietRail, doors]));
    expect(at(map, "julietRail")).toMatchObject({ name: "Juliet Rail", total: 54_000 });
    expect(at(map, "julietRail")?.lines.map((l) => l.costCode)).toEqual(["7b"]);
    expect(at(map, "balconyDoors")?.lines.map((l) => l.costCode)).toEqual(["15b"]);
    expect(at(map, "balconies")).toBeUndefined();
    expect(at(map, "balconyRail")).toBeUndefined();
  });

  it("shows the rate math per Juliet, and the doors' low and high", () => {
    const map = mapOf(rom([julietRail, doors]));
    expect(at(map, "julietRail")?.math).toEqual(["Juliet Rail: 40 Juliets x 6 LF x $225 per LF (Stated Rate, V64, VA)"]);
    expect(at(map, "balconyDoors")?.math).toEqual(["Sliding Doors: 40 Doors x $1,800 to $2,537 per Door (Stated Rate, VA, V64, VR)"]);
  });

  it("leaves the rail unpriced and names the fact when the rail per Juliet is missing", () => {
    const map = mapOf(rom([doors], [{ costCode: "7b", label: "Juliet Rail", missing: ["Rail per Juliet"] }]));
    expect(at(map, "julietRail")).toMatchObject({
      total: null,
      unpriced: true,
      math: ["Juliet Rail: No Quantity Yet, Needs Rail per Juliet"],
    });
  });

  it("totals the Juliet parts to the run total", () => {
    const map = mapOf(rom([julietRail, doors]));
    expect(map.parts.reduce((sum, p) => sum + (p.total ?? 0), 0)).toBeCloseTo(map.total);
  });
});
