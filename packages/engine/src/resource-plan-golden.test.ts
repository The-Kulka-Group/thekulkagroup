import { describe, expect, it } from "vitest";

import {
  C00379_GENERAL_CONDITIONS,
  C00379_GENERAL_CONDITIONS_GROUPS,
  C00379_GENERAL_CONDITIONS_TOTAL,
} from "./fixtures/c-00379-general-conditions";
import {
  C00379_GENERAL_REQUIREMENTS,
  C00379_GENERAL_REQUIREMENTS_AREAS,
  C00379_GENERAL_REQUIREMENTS_GROUPS,
  C00379_GENERAL_REQUIREMENTS_SUMMARY_FIGURE,
  C00379_GENERAL_REQUIREMENTS_TOTAL,
} from "./fixtures/c-00379-general-requirements";
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

// LA-1398 golden test. The General Requirements tab of the same estimate
// prices its lines to $359,429.69 (AL247). The spec quoted $389,416, which is
// a typed figure on the Summary tab that no line on the General Requirements
// tab produces (see the fixture). Allocated Resources rebuilds the tab from
// each line's own quantities, so the test does not depend on LA-1394
// question 4, the 68,016 GSF against 120,000 SF.
describe("C-00379 General Requirements, rebuilt by Allocated Resources", () => {
  const priced = priceResourcePlan(C00379_GENERAL_REQUIREMENTS);

  it("comes to the tab's own $359,430, not the Summary tab's typed $389,416", () => {
    expect(priced.total).toBe(C00379_GENERAL_REQUIREMENTS_TOTAL);
    expect(priced.exactTotal).toBeCloseTo(359_429.69, 2);
    expect(priced.total).not.toBe(C00379_GENERAL_REQUIREMENTS_SUMMARY_FIGURE);
  });

  it("matches the tab's section subtotals", () => {
    expect(priced.groups).toEqual(C00379_GENERAL_REQUIREMENTS_GROUPS);
  });

  it("matches the tab's own figure on each schedule-driven and per-area line", () => {
    const amount = (id: string) => priced.lines.find((line) => line.id === id)!.amount;
    // Column AL, to the cent.
    expect(amount("row-21")).toBeCloseTo(74_400, 2);
    expect(amount("row-31")).toBeCloseTo(53_742.86, 2);
    expect(amount("row-44")).toBeCloseTo(66_000, 2);
    expect(amount("row-59")).toBeCloseTo(1_499.01, 2);
    expect(amount("row-60")).toBeCloseTo(7_495.07, 2);
    expect(amount("row-96")).toBeCloseTo(54_000, 2);
    expect(amount("row-211")).toBeCloseTo(3_400.8, 2);
    expect(amount("row-221")).toBeCloseTo(5_396.45, 2);
  });

  it("records the area each per-area line used", () => {
    for (const [id, { area }] of Object.entries(C00379_GENERAL_REQUIREMENTS_AREAS)) {
      const line = C00379_GENERAL_REQUIREMENTS.lines.find((one) => one.id === id)!;
      expect(line.basis).toBe("unit");
      const perArea = id === "row-211" ? line.quantity.value * 3000 : line.quantity.value;
      expect(perArea).toBeCloseTo(area, 6);
    }
  });

  it("carries no Insurances & Bonds line", () => {
    expect(priced.lines.some((line) => line.group === "Insurances & Bonds")).toBe(false);
  });

  it("enters the waterfall as General Requirements, inside trade cost, with General Conditions on top", () => {
    const parameter = (value: number) => ({
      value,
      provenance: { kind: "reviewed_judgment" as const, recordedBy: "automated test", recordedAt: "2026-09-29", reason: "synthetic" },
    });
    const m = computeMarkups({
      subtotal: { low: 12_195_050, high: 12_195_050 },
      ownerDirect: { low: 0, high: 0 },
      grossSquareFeet: 68_016,
      choices: {
        setup: "separate",
        method: "allocated_resources",
        resourcePlan: C00379_GENERAL_CONDITIONS,
        grMethod: "allocated_resources",
        grResourcePlan: C00379_GENERAL_REQUIREMENTS,
      },
      history: [],
      staffingRates: [],
      fieldOfficeRates: [],
      feeParameter: parameter(0.0325),
      insuranceParameter: parameter(0.054),
      spreadParameters: { high: parameter(0), medium: parameter(0.2), low: parameter(0.35) },
    });

    expect(m.generalRequirements?.code).toBe("01 00 00");
    expect(m.generalRequirements?.plan?.total).toBe(359_430);
    expect(m.generalRequirements?.low).toBe(359_430);
    expect(m.generalConditions.plan?.total).toBe(727_230);
    // Fee computes on the subtotal plus both lines.
    expect(m.fee.low).toBe(Math.round((12_195_050 + 359_429.6915 + 727_230.4535) * 0.0325));
  });
});
