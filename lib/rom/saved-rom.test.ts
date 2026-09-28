import { describe, expect, it } from "vitest";
import type { Rom } from "@kulka/engine";

import { buildField } from "@/app/(app)/rom/field-order";
import { savedRom } from "./run-records";

// LA-1209. A run saved before the engine added a list to its output has no such
// key in its stored rom. Reading it back must give the screens an empty list,
// not a crash. The figures are synthetic.

const oldRom = {
  lines: [
    {
      costCode: "09-900",
      label: "Synthetic finishes",
      low: 100,
      high: 120,
      confidence: "high",
      heldForReview: false,
      comparableCount: 2,
      comparables: [],
      judgmentAdjustments: [],
      scopeSide: "building",
      contractSide: "kulka",
      detailLevel: null,
      element: null,
      breakoutOf: null,
      buyoutPackage: null,
      gateStatus: null,
    },
  ],
  total: { low: 100, high: 120 },
  kulkaContractTotal: { low: 100, high: 120 },
} as unknown as Rom;

describe("savedRom", () => {
  it("fills every list an older run is missing with an empty one", () => {
    const rom = savedRom(oldRom);
    expect(rom.unpricedItems).toEqual([]);
    expect(rom.tbdGateItems).toEqual([]);
    expect(rom.assumedPresentItems).toEqual([]);
    expect(rom.notInThisJob).toEqual([]);
    expect(rom.assumptions).toEqual([]);
    expect(rom.carvedOut).toEqual({ low: 0, high: 0 });
    expect(rom.lines).toHaveLength(1);
  });

  it("lets both views build from an older run", () => {
    const rom = savedRom(oldRom);
    expect(() => buildField("scope", rom, [])).not.toThrow();
    expect(() => buildField("package", rom, [])).not.toThrow();
    expect(buildField("package", rom, []).length).toBeGreaterThan(0);
  });

  it("keeps a run that already has its lists as it was", () => {
    const rom = savedRom({ ...oldRom, unpricedItems: [{ costCode: "1a", label: "Synthetic" }] } as Rom);
    expect(rom.unpricedItems).toEqual([{ costCode: "1a", label: "Synthetic" }]);
  });

  it("passes a run with no rom through as null", () => {
    expect(savedRom(null)).toBeNull();
  });
});
