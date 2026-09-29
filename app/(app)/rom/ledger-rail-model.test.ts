import { describe, expect, it } from "vitest";

import {
  bandGeometry,
  coarseMoney,
  coarsePercent,
  coarsePerSf,
  factSpreadShares,
  factsByShare,
  initiallyFolded,
  lowCount,
  rateAlert,
  widestRangeFirst,
} from "./ledger-rail-model";

// LA-1384. The rules behind the saved budget's Ledger and Rail layout.

describe("numbers rounded to the confidence a conceptual budget has", () => {
  it("rounds money to a tenth of a million, whole thousands, or whole dollars", () => {
    expect(coarseMoney(2_070_000)).toBe("$2.1M");
    expect(coarseMoney(17_424_761)).toBe("$17.4M");
    expect(coarseMoney(350_400)).toBe("$350k");
    expect(coarseMoney(900.4)).toBe("$900");
    expect(coarseMoney(-1_500)).toBe("-$2k");
  });

  it("rounds a share to a whole percent and says <1% under one percent", () => {
    expect(coarsePercent(0.216)).toBe("22%");
    expect(coarsePercent(0.004)).toBe("<1%");
    expect(coarsePercent(0)).toBe("");
  });

  it("rounds $/SF to whole dollars and says <$1 under a dollar", () => {
    expect(coarsePerSf(20.67)).toBe("$21");
    expect(coarsePerSf(0.4)).toBe("<$1");
    expect(coarsePerSf(1_234.4)).toBe("$1,234");
  });
});

describe("each fact's share of the range", () => {
  const blocks = [
    { costCode: "a", low: 0, high: 100 },
    { costCode: "b", low: 50, high: 150 },
    { costCode: "c", low: 10, high: 10 },
  ];

  it("adds up the spread of the lines a fact reaches, over the spread of every line", () => {
    const shares = factSpreadShares(blocks, [
      { code: "A-1", costCodes: ["a", "b"] },
      { code: "S-1", costCodes: ["a"] },
      { code: "E-1", costCodes: ["c"] },
      { code: "M-1", costCodes: ["z"] },
    ]);
    expect(shares.get("A-1")).toBe(1);
    expect(shares.get("S-1")).toBe(0.5);
    expect(shares.get("E-1")).toBe(0);
    expect(shares.get("M-1")).toBe(0);
  });

  it("counts a line two facts reach for both, and a repeated cost code once", () => {
    const shares = factSpreadShares(blocks, [
      { code: "A-1", costCodes: ["a", "a"] },
      { code: "S-1", costCodes: ["a"] },
    ]);
    expect(shares.get("A-1")).toBe(0.5);
    expect((shares.get("A-1") ?? 0) + (shares.get("S-1") ?? 0)).toBe(1);
  });

  it("gives every fact nothing when no line has a spread", () => {
    expect(factSpreadShares([{ costCode: "a", low: 5, high: 5 }], [{ code: "A-1", costCodes: ["a"] }]).get("A-1")).toBe(0);
  });

  it("ranks the facts that price the range, biggest first, and keeps the rest apart in their own order", () => {
    const facts = [{ code: "V-1" }, { code: "A-1" }, { code: "M-0" }, { code: "S-1" }, { code: "E-1" }];
    const shares = new Map([
      ["A-1", 0.28],
      ["S-1", 0.14],
      ["E-1", 0.08],
      ["V-1", 0.001],
    ]);
    const { pricing, idle } = factsByShare(facts, shares);
    expect(pricing.map((fact) => fact.code)).toEqual(["A-1", "S-1", "E-1"]);
    expect(idle.map((fact) => fact.code)).toEqual(["V-1", "M-0"]);
  });

  it("counts low-confidence facts for the rail's heading, leaving out corrected ones", () => {
    expect(lowCount([{ confidence: "low" }, { confidence: "low", correction: {} }, { confidence: "high" }])).toBe("1 of 3 Low");
    expect(lowCount([{ confidence: "high" }])).toBeNull();
  });
});

describe("the header's rate alert", () => {
  it("shows only while a markup has no rate", () => {
    expect(rateAlert([])).toBeNull();
  });

  it("names one unpriced line", () => {
    expect(rateAlert(["GRs/GCs"])).toBe("GRs/GCs not priced");
  });

  it("names each line when General Requirements and General Conditions are both unpriced", () => {
    expect(rateAlert(["General Requirements", "General Conditions"])).toBe("General Requirements and General Conditions not priced");
  });
});

describe("the Ledger's order and folding", () => {
  const span = (row: { low: number; high: number }) => row;

  it("puts the widest range first and keeps ties in their order", () => {
    const rows = [
      { key: "narrow", low: 90, high: 110 },
      { key: "wide", low: 0, high: 200 },
      { key: "tie-a", low: 50, high: 100 },
      { key: "tie-b", low: 150, high: 200 },
    ];
    expect(widestRangeFirst(rows, span).map((row) => row.key)).toEqual(["wide", "tie-a", "tie-b", "narrow"]);
  });

  it("folds a group under 5% of the total and leaves items and bigger groups open", () => {
    const folded = initiallyFolded(
      [
        { kind: "group", key: "small", amount: 49 },
        { kind: "group", key: "at-five", amount: 50 },
        { kind: "item", key: "tiny-item", amount: 1 },
        { kind: "group", key: "unpriced", amount: 0 },
      ],
      1_000,
    );
    expect([...folded].sort()).toEqual(["small", "unpriced"]);
    expect(initiallyFolded([{ kind: "group", key: "g", amount: 1 }], 0).size).toBe(0);
  });
});

describe("the range band", () => {
  it("draws the range on a scale from $0 that ends a little past the high", () => {
    const at = bandGeometry(11_600_000, 17_400_000, 23_300_000);
    const max = 23_300_000 * 1.04;
    expect(at.left).toBeCloseTo((11_600_000 / max) * 100, 6);
    expect(at.width).toBeCloseTo(((23_300_000 - 11_600_000) / max) * 100, 6);
    expect(at.mid).toBeCloseTo((17_400_000 / max) * 100, 6);
    expect(at.high).toBeCloseTo(100 / 1.04, 6);
  });

  it("stays inside the track for an empty range", () => {
    expect(bandGeometry(0, 0, 0)).toEqual({ left: 0, width: 0, mid: 0, high: 0 });
  });
});
