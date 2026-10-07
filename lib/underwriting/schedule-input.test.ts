import { describe, expect, it } from "vitest";

import { InvalidCostSchedule, parseCostSchedule } from "./schedule-input";

const body = {
  analysisStartMonth: "2026-01",
  saleMonth: "2026-03",
  quantities: { units: 999 },
  costLines: [{
    id: "a",
    name: "Appliances",
    category: "hard_cost",
    basis: { type: "per_unit", rate: 1000 },
    unit: "usd",
    startMonth: "2026-01",
    endMonth: "2026-02",
    distributionMethod: "straight_line",
    distributionVersion: "straight_line.v1",
    reviewState: "working",
  }],
};

describe("parseCostSchedule", () => {
  it("prices a basis line against the case quantities and ignores quantities in the body", () => {
    const parsed = parseCostSchedule(body, { units: 10 });
    expect(parsed.quantities).toEqual({ units: 10 });
    expect(parsed.costLines[0].basis).toEqual({ type: "per_unit", rate: 1000 });
  });

  it("names the missing case fact when a basis line has no quantity to price against", () => {
    try {
      parseCostSchedule(body);
      expect.unreachable();
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidCostSchedule);
      expect((cause as InvalidCostSchedule).fieldErrors["quantities.units"]).toMatch(/number of units/);
    }
  });
});
