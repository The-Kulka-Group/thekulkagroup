import { describe, expect, it } from "vitest";

import {
  computeMonthlyCostSchedule,
  MAX_COST_LINES,
  MAX_TIMELINE_MONTHS,
  MONTHLY_COST_FORMULA_VERSION,
  S_CURVE_DISTRIBUTION_VERSION,
  STRAIGHT_LINE_DISTRIBUTION_VERSION,
  type MonthlyCostScheduleInputs,
} from "./monthly-cost-schedule";
import {
  APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS,
  APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE,
  APARTMENT_DEVELOPMENT_V2_98_SOURCE,
} from "./fixtures/apartment-development-v2-98";

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
    expect(run.result?.aggregateFormulaTraces).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "month:2026-01:total-uses", inputPaths: expect.arrayContaining(["costLines.0.amount"]) }),
      expect.objectContaining({ key: "total-uses", inputPaths: expect.arrayContaining(["costLines.0.amount", "costLines.1.amount"]) }),
    ]));
    expect(run.result?.aggregateFormulaTraces.find(({ key }) => key === "category:land")?.inputPaths)
      .toEqual(["costLines.0.category", "costLines.0.amount"]);
    expect(run.result?.aggregateFormulaTraces.find(({ key }) => key === "category:hard_cost")?.inputPaths)
      .toEqual(["costLines.1.category", "costLines.1.amount"]);
    expect(run.result?.aggregateFormulaTraces.find(({ key }) => key === "category:soft_cost")?.inputPaths)
      .toEqual(["costLines.2.category", "costLines.2.amount"]);
    expect(run.result?.aggregateFormulaTraces.find(({ key }) => key === "category:financing_fee")?.inputPaths)
      .toEqual([]);
  });

  it("keeps cost line IDs that match reserved object keys as own monthly amounts", () => {
    const run = computeMonthlyCostSchedule({
      analysisStartMonth: "2026-01",
      saleMonth: "2026-01",
      costLines: [{ ...complete.costLines[0], id: "__proto__" }],
    });
    const lineAmounts = run.result!.months[0].lineAmounts;

    expect(Object.hasOwn(lineAmounts, "__proto__")).toBe(true);
    expect(lineAmounts.__proto__).toBe(8_230_000);
    expect(Object.getPrototypeOf(lineAmounts)).toBeNull();
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

  it("caps the monthly spine and cost-line count with typed issues", () => {
    const longTimeline = computeMonthlyCostSchedule({
      ...complete,
      analysisStartMonth: "1900-01",
      saleMonth: "2200-12",
    });
    const tooManyLines = computeMonthlyCostSchedule({
      ...complete,
      costLines: Array.from({ length: MAX_COST_LINES + 1 }, (_, index) => ({
        ...complete.costLines[0],
        id: `line-${index}`,
      })),
    });

    expect(MAX_TIMELINE_MONTHS).toBe(240);
    expect(longTimeline.issues).toContainEqual(expect.objectContaining({
      path: "saleMonth",
      code: "timeline_too_long",
    }));
    expect(tooManyLines.issues).toContainEqual(expect.objectContaining({
      path: "costLines",
      code: "too_many_cost_lines",
    }));
  });

  it("rejects years and text that cannot be saved by the schedule schema", () => {
    const run = computeMonthlyCostSchedule({
      ...complete,
      analysisStartMonth: "1899-12",
      saleMonth: "2201-01",
      costLines: [{
        ...complete.costLines[0],
        id: "x".repeat(101),
        name: "n".repeat(201),
        sourceLabel: "   ",
      }],
    });

    expect(run.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "analysisStartMonth", code: "invalid_year" }),
      expect.objectContaining({ path: "saleMonth", code: "invalid_year" }),
      expect.objectContaining({ path: "costLines.0.id", code: "text_too_long" }),
      expect.objectContaining({ path: "costLines.0.name", code: "text_too_long" }),
      expect.objectContaining({ path: "costLines.0.sourceLabel", code: "missing_text" }),
    ]));
  });

  it("matches all five audited LA-166 workbook cost checks", () => {
    const run = computeMonthlyCostSchedule(APARTMENT_DEVELOPMENT_V2_98_COST_SCHEDULE);
    const result = run.result!;
    const checks = APARTMENT_DEVELOPMENT_V2_98_COST_CHECKS;

    expect(APARTMENT_DEVELOPMENT_V2_98_SOURCE.sha256).toBe(
      "3481af2b91836bdbb7603a60246aa0f8c0c3ea6654311252f5df40760ff2a280",
    );
    expect(result.totalsByCategory.land).toBe(checks.land.expected);
    expect(result.totalsByCategory.hard_cost).toBe(checks.hardCost.expected);
    expect(result.months.reduce(
      (total, month) => total + month.usesByCategory.hard_cost,
      0,
    )).toBe(checks.hardCost.expected);
    expect(result.totalsByCategory.development_fee).toBe(checks.developmentFee.expected);
    expect(result.totalsByCategory.soft_cost + result.totalsByCategory.development_fee)
      .toBe(checks.softCostIncludingDevelopmentFee.expected);
    expect(result.totalUses).toBe(checks.projectCostBeforeFinancing.expected);
  });
});

describe("cost line basis types", () => {
  const line = (id: string, basis: NonNullable<MonthlyCostScheduleInputs["costLines"][number]["basis"]>, category: "hard_cost" | "soft_cost" = "hard_cost") => ({
    id,
    name: id,
    category,
    basis,
    unit: "usd" as const,
    startMonth: "2026-01",
    endMonth: "2026-02",
    distributionMethod: "straight_line" as const,
    distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
    reviewState: "working" as const,
  });
  const base = (costLines: MonthlyCostScheduleInputs["costLines"], quantities?: MonthlyCostScheduleInputs["quantities"]): MonthlyCostScheduleInputs => ({
    analysisStartMonth: "2026-01",
    saleMonth: "2026-03",
    costLines,
    quantities,
  });

  it("derives per gross square foot, per unit and percent of line amounts apart from the entered ones", () => {
    const run = computeMonthlyCostSchedule(base([
      line("shell", { type: "per_gross_square_foot", rate: 185.5 }),
      line("appliances", { type: "per_unit", rate: 4_250 }),
      line("design", { type: "percent_of_line", baseLineId: "shell", percent: 6.5 }, "soft_cost"),
    ], { grossSquareFeet: 120_000, units: 140 }));

    expect(run.status).toBe("complete");
    const [shell, appliances, design] = run.result!.costLineSchedules;
    expect([shell.amount, appliances.amount, design.amount]).toEqual([22_260_000, 595_000, 1_446_900]);
    expect([shell.basisType, appliances.basisType, design.basisType]).toEqual(["per_gross_square_foot", "per_unit", "percent_of_line"]);
    expect(run.result!.totalUses).toBe(24_301_900);
    expect(run.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(shell.inputPaths).toContain("quantities.grossSquareFeet");
    expect(design.inputPaths).toEqual(expect.arrayContaining(["costLines.2.basis", "costLines.0.basis", "quantities.grossSquareFeet"]));
    expect(design.formulaTrace).toContain("6.5 percent of the shell line");
  });

  it("follows a percent through a chain of derived lines in any order", () => {
    const run = computeMonthlyCostSchedule(base([
      line("fee", { type: "percent_of_line", baseLineId: "soft", percent: 10 }, "soft_cost"),
      line("soft", { type: "percent_of_line", baseLineId: "hard", percent: 20 }, "soft_cost"),
      line("hard", { type: "per_unit", rate: 1_000 }),
    ], { units: 100 }));
    expect(run.result!.costLineSchedules.map(({ amount }) => amount)).toEqual([2_000, 20_000, 100_000]);
  });

  it("treats a fixed basis like an entered amount and leaves existing traces unchanged", () => {
    const fixed = { ...line("land", { type: "fixed" }), amount: 1_000 };
    const plain = { ...fixed, basis: undefined };
    const withBasis = computeMonthlyCostSchedule(base([fixed]));
    const without = computeMonthlyCostSchedule(base([plain]));
    expect(withBasis.result!.costLineSchedules[0].formulaTrace).toBe(without.result!.costLineSchedules[0].formulaTrace);
    expect(without.result!.costLineSchedules[0].formulaTrace.startsWith("Entered amount allocated")).toBe(true);
  });

  it("fails a basis line that is missing its quantity, has an entered amount, or names a bad base", () => {
    const missing = computeMonthlyCostSchedule(base([line("a", { type: "per_gross_square_foot", rate: 10 }), line("b", { type: "per_unit", rate: 10 })], { units: 12.5 }));
    expect(missing.issues.map(({ code, path }) => [code, path])).toEqual([
      ["missing_quantity", "quantities.grossSquareFeet"],
      ["missing_quantity", "quantities.units"],
    ]);

    const both = computeMonthlyCostSchedule(base([{ ...line("a", { type: "per_unit", rate: 10 }), amount: 500 }], { units: 10 }));
    expect(both.issues.map(({ code }) => code)).toEqual(["amount_with_basis"]);

    const unknown = computeMonthlyCostSchedule(base([line("a", { type: "percent_of_line", baseLineId: "ghost", percent: 5 })]));
    expect(unknown.issues.map(({ code }) => code)).toEqual(["unknown_base_line"]);

    const self = computeMonthlyCostSchedule(base([line("a", { type: "percent_of_line", baseLineId: "a", percent: 5 })]));
    expect(self.issues.map(({ code }) => code)).toEqual(["circular_basis"]);
  });

  it("fails a loop of percent lines once and rejects bad rates and percents", () => {
    const loop = computeMonthlyCostSchedule(base([
      line("a", { type: "percent_of_line", baseLineId: "b", percent: 5 }),
      line("b", { type: "percent_of_line", baseLineId: "a", percent: 5 }),
    ]));
    expect(loop.issues.filter(({ code }) => code === "circular_basis")).toHaveLength(1);

    const bad = computeMonthlyCostSchedule(base([
      line("a", { type: "per_unit", rate: 0 }),
      line("b", { type: "percent_of_line", baseLineId: "a", percent: 1_001 }),
      { ...line("c", { type: "fixed" }), basis: { type: "per_cubic_yard" } as never },
    ], { units: 10 }));
    expect(bad.issues.map(({ code, path }) => [code, path])).toEqual([
      ["invalid_basis", "costLines.0.basis.rate"],
      ["invalid_basis", "costLines.1.basis.percent"],
      ["invalid_basis", "costLines.2.basis"],
    ]);
  });
});

describe("percent-of-total lines", () => {
  const line = (id: string, category: MonthlyCostScheduleInputs["costLines"][number]["category"], priced: Partial<MonthlyCostScheduleInputs["costLines"][number]>) => ({
    id,
    name: id,
    category,
    unit: "usd" as const,
    startMonth: "2026-01",
    endMonth: "2026-02",
    distributionMethod: "straight_line" as const,
    distributionVersion: STRAIGHT_LINE_DISTRIBUTION_VERSION,
    reviewState: "working" as const,
    ...priced,
  });
  const schedule = (costLines: MonthlyCostScheduleInputs["costLines"]): MonthlyCostScheduleInputs => ({
    analysisStartMonth: "2026-01",
    saleMonth: "2026-03",
    costLines,
  });
  const land = line("land", "land", { amount: 1_000_000 });
  const hard = line("hard", "hard_cost", { amount: 10_000_000 });
  const soft = line("soft", "soft_cost", { amount: 2_000_000 });

  it("prices a line on hard and soft cost, leaving out land, other categories and itself", () => {
    const run = computeMonthlyCostSchedule(schedule([
      land,
      hard,
      soft,
      line("contingency", "soft_cost", { basis: { type: "percent_of_total", base: "hard_and_soft", percent: 5 } }),
    ]));
    expect(run.status).toBe("complete");
    const contingency = run.result!.costLineSchedules[3];
    expect(contingency).toMatchObject({ amount: 600_000, percentBase: 12_000_000, basisType: "percent_of_total" });
    expect(run.reconciliations.find(({ id }) => id === "percent-of-total:contingency")?.status).toBe("pass");
  });

  it("settles two percent-of-total lines that sit in each other's base", () => {
    const run = computeMonthlyCostSchedule(schedule([
      land,
      hard,
      line("fee", "development_fee", { basis: { type: "percent_of_total", base: "total_cost", percent: 4 } }),
      line("contingency", "hard_cost", { basis: { type: "percent_of_total", base: "total_less_land", percent: 5 } }),
    ]));
    // fee = 4% × (11M + contingency); contingency = 5% × (10M + fee).
    const fee = 460_000 / 0.998;
    const [, , feeLine, contingencyLine] = run.result!.costLineSchedules;
    expect(feeLine.amount).toBeCloseTo(fee, 1);
    expect(contingencyLine.amount).toBeCloseTo(500_000 + 0.05 * fee, 1);
    expect(run.reconciliations.every(({ status }) => status === "pass")).toBe(true);
    expect(feeLine.formulaTrace).toContain("no financing yet");
  });

  it("adds financing the capital plan passes in to a total base but not to hard and soft", () => {
    const lines = [
      hard,
      line("fee", "development_fee", { basis: { type: "percent_of_total", base: "total_cost", percent: 10 } }),
      line("contingency", "soft_cost", { basis: { type: "percent_of_total", base: "hard_and_soft", percent: 10 } }),
    ];
    const run = computeMonthlyCostSchedule(schedule(lines), { financingCost: 500_000 });
    const [, fee, contingency] = run.result!.costLineSchedules;
    expect(contingency.amount).toBe(1_000_000);
    expect(fee.amount).toBe(1_150_000);
    expect(fee.formulaTrace).toContain("including financing of 500000");
    expect(run.inputSnapshot).not.toHaveProperty("financingCost");
  });

  it("lets a percent-of-line line follow a percent-of-total line", () => {
    const run = computeMonthlyCostSchedule(schedule([
      hard,
      line("fee", "development_fee", { basis: { type: "percent_of_total", base: "hard_and_soft", percent: 3 } }),
      line("fee-tax", "soft_cost", { basis: { type: "percent_of_line", baseLineId: "fee", percent: 10 } }),
    ]));
    // fee = 3% × (10M + fee tax); fee tax = 10% × fee.
    const fee = 300_000 / 0.997;
    expect(run.result!.costLineSchedules[1].amount).toBeCloseTo(fee, 1);
    expect(run.result!.costLineSchedules[2].amount).toBeCloseTo(fee / 10, 1);
  });

  it("fails percents at or above 100 in total, a bad base, and a loop that will not settle", () => {
    const tooHigh = computeMonthlyCostSchedule(schedule([
      hard,
      line("a", "soft_cost", { basis: { type: "percent_of_total", base: "total_cost", percent: 60 } }),
      line("b", "soft_cost", { basis: { type: "percent_of_total", base: "total_cost", percent: 40 } }),
    ]));
    expect(tooHigh.issues.map(({ code }) => code)).toEqual(["percent_total_too_high"]);

    const bad = computeMonthlyCostSchedule(schedule([
      hard,
      line("a", "soft_cost", { basis: { type: "percent_of_total", base: "everything" as never, percent: 100 } }),
    ]));
    expect(bad.issues.map(({ path }) => path)).toEqual(["costLines.1.basis.percent", "costLines.1.basis.base", "costLines"]);

    const runaway = computeMonthlyCostSchedule(schedule([
      hard,
      line("fee", "development_fee", { basis: { type: "percent_of_total", base: "total_cost", percent: 50 } }),
      line("echo", "soft_cost", { basis: { type: "percent_of_line", baseLineId: "fee", percent: 1000 } }),
    ]));
    expect(runaway.status).toBe("failed");
    expect(runaway.issues.map(({ code }) => code)).toEqual(["percent_total_unsettled"]);
  });
});
