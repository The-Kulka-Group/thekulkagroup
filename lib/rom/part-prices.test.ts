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
      elevators: ["26"],
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
        { key: "block", label: "Building", total: midpointOf(withDemolition), parts: ["site", "foundation", "massing", "glass", "elevators"] },
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
