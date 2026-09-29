import { describe, expect, it } from "vitest";

import {
  C00379_GENERAL_CONDITIONS,
  C00379_GENERAL_CONDITIONS_GROUPS,
  C00379_GENERAL_CONDITIONS_TOTAL,
} from "./fixtures/c-00379-general-conditions";
import { priceResourcePlan } from "./resource-plan";
import { computeMarkups } from "./rom-markups";

// LA-1397 golden test. Kulka's estimate C-00379 (117 N. Long Beach Rd,
// revision 1) prices General Conditions at $727,230 from its own lines and
// schedule. Allocated Resources must rebuild it to the dollar from the same
// lines, the same dates and the sheet's own 30.42 days a month.

describe("C-00379 General Conditions, rebuilt by Allocated Resources", () => {
  const priced = priceResourcePlan(C00379_GENERAL_CONDITIONS);

  it("comes to $727,230", () => {
    expect(priced.total).toBe(C00379_GENERAL_CONDITIONS_TOTAL);
  });

  it("matches the sheet's construction staffing, field office and general expense subtotals", () => {
    expect(priced.groups).toEqual(C00379_GENERAL_CONDITIONS_GROUPS);
  });

  it("matches the sheet's own figure on each schedule-driven line", () => {
    const amount = (id: string) => priced.lines.find((line) => line.id === id)!.amount;
    // Column AD, rows 37, 39, 47, 70 and 166, to the cent.
    expect(amount("row-37")).toBeCloseTo(169_371.43, 2);
    expect(amount("row-39")).toBeCloseTo(110_143.54, 2);
    expect(amount("row-47")).toBeCloseTo(383_561.14, 2);
    expect(amount("row-70")).toBeCloseTo(11_992.11, 2);
    expect(amount("row-166")).toBeCloseTo(2_623.27, 2);
  });

  it("enters the waterfall as the General Conditions line, at a range around the same figure", () => {
    const parameter = (value: number) => ({
      value,
      provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-09-29", reason: "synthetic" },
    });
    const m = computeMarkups({
      subtotal: { low: 12_195_050, high: 12_195_050 },
      ownerDirect: { low: 0, high: 0 },
      grossSquareFeet: 68_016,
      choices: { setup: "gc_only", method: "allocated_resources", resourcePlan: C00379_GENERAL_CONDITIONS },
      history: [],
      staffingRates: [],
      fieldOfficeRates: [],
      feeParameter: parameter(0.0325),
      insuranceParameter: parameter(0.054),
      spreadParameters: { high: parameter(0.1), medium: parameter(0.2), low: parameter(0.35) },
    });

    expect(m.generalConditions.plan?.total).toBe(727_230);
    expect(m.generalConditions.low).toBe(Math.round(727_230.4535 * 0.9));
    expect(m.generalConditions.high).toBe(Math.round(727_230.4535 * 1.1));
    // 5.96 percent of the sheet's $12,195,050 hardcost subtotal, as the rate card records.
    expect((m.generalConditions.plan!.total / 12_195_050) * 100).toBeCloseTo(5.96, 2);
  });
});
