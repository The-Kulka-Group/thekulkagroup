import { describe, expect, it } from "vitest";

import { InvalidCostSchedule, parseCostSchedule } from "./schedule-input";

describe("parseCostSchedule", () => {
  it("rejects a cost line priced by a basis until a case can save one", () => {
    const body = {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-03",
      quantities: { units: 10 },
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
    expect(() => parseCostSchedule(body)).toThrow(InvalidCostSchedule);
  });
});
