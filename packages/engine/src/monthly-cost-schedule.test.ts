import { describe, expect, it } from "vitest";

import {
  computeMonthlyCostSchedule,
  MONTHLY_COST_FORMULA_VERSION,
  S_CURVE_DISTRIBUTION_VERSION,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type MonthlyCostScheduleInputs,
} from "./monthly-cost-schedule";

const complete: MonthlyCostScheduleInputs = {
  analysisStartMonth: "2026-01",
  saleMonth: "2026-06",
  costLines: [
    {
      id: "land",
      name: "Land",
      category: "land",
      amount: 8_230_000,
      unit: "usd",
      startMonth: "2026-01",
      endMonth: "2026-01",
      distributionMethod: "straight_line",
      distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
      sourceLabel: "Workbook fixture",
      sourceDate: "2026-09-02",
      reviewState: "done",
    },
    {
      id: "hard",
      name: "Hard cost",
      category: "hard_cost",
      amount: 42_630_000,
      unit: "usd",
      startMonth: "2026-02",
      endMonth: "2026-05",
      distributionMethod: "s_curve",
      distributionVersion: S_CURVE_DISTRIBUTION_VERSION,
      sourceLabel: "Workbook fixture",
      sourceDate: "2026-09-02",
      reviewState: "working",
    },
    {
      id: "soft",
      name: "Soft cost",
      category: "soft_cost",
      amount: 5_115_762,
      unit: "usd",
      startMonth: "2026-01",
      endMonth: "2026-05",
      distributionMethod: "straight_line",
      distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
      reviewState: "working",
    },
  ],
};

describe("computeMonthlyCostSchedule", () => {
  it("builds an inclusive calendar spine and reconciles straight-line and S-curve costs", () => {
    const run = computeMonthlyCostSchedule(complete);

    expect(run).toMatchObject({
      formulaVersion: MONTHLY_COST_FORMULA_VERSION,
      status: "complete",
      inputSnapshot: complete,
      issues: [],
    });
    expect(run.result?.months.map(({ month }) => month)).toEqual([
      "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06",
    ]);
    expect(run.result?.totalsByCategory).toMatchObject({
      land: 8_230_000,
      hard_cost: 42_630_000,
      soft_cost: 5_115_762,
      development_fee: 0,
      financing_fee: 0,
    });
    expect(run.result?.totalUses).toBe(55_975_762);
    expect(run.result?.costLineSchedules.find(({ lineId }) => lineId === "hard")?.monthlyAmounts)
      .toEqual([6_660_937.5, 14_654_062.5, 14_654_062.5, 6_660_937.5]);
    expect(run.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(run.reconciliations).toContainEqual(expect.objectContaining({
      id: "cost-line:hard",
      difference: 0,
      tolerance: 0.01,
    }));
    expect(run.result?.costLineSchedules.every(({ formulaTrace }) => formulaTrace.length > 0)).toBe(true);
  });

  it("allocates rounding remainders without losing a cent", () => {
    const run = computeMonthlyCostSchedule({
      analysisStartMonth: "2026-01",
      saleMonth: "2026-03",
      costLines: [{
        ...complete.costLines[0],
        amount: 100,
        startMonth: "2026-01",
        endMonth: "2026-03",
      }],
    });

    expect(run.result?.costLineSchedules[0].monthlyAmounts).toEqual([33.33, 33.34, 33.33]);
    expect(run.result?.costLineSchedules[0].total).toBe(100);
  });

  it.each([
    ["bad analysis month", { analysisStartMonth: "2026-13" }, "invalid_month"],
    ["sale before analysis", { saleMonth: "2025-12" }, "month_order"],
    ["negative amount", { costLines: [{ ...complete.costLines[0], amount: -1 }] }, "invalid_amount"],
    ["line outside timeline", { costLines: [{ ...complete.costLines[0], startMonth: "2025-12" }] }, "outside_timeline"],
    ["unsupported method", { costLines: [{ ...complete.costLines[0], distributionMethod: "bell_curve" }] }, "unsupported_distribution"],
    ["wrong S-curve version", { costLines: [{ ...complete.costLines[1], distributionVersion: "s_curve.future" }] }, "unsupported_distribution_version"],
  ])("returns typed issues and no result for %s", (_label, override, code) => {
    const run = computeMonthlyCostSchedule({ ...complete, ...override } as MonthlyCostScheduleInputs);

    expect(run.status).toBe("failed");
    expect(run.result).toBeNull();
    expect(run.reconciliations).toEqual([]);
    expect(run.issues).toContainEqual(expect.objectContaining({ code }));
  });

  it("reports every invalid line instead of stopping at the first one", () => {
    const run = computeMonthlyCostSchedule({
      ...complete,
      costLines: [
        { ...complete.costLines[0], id: "same", amount: Number.NaN },
        { ...complete.costLines[1], id: "same", endMonth: "2026-01" },
      ],
    });

    expect(run.status).toBe("failed");
    expect(run.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "duplicate_id", "invalid_amount", "month_order",
    ]));
  });
});
