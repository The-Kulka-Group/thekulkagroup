import { describe, expect, it } from "vitest";

import { computeApartmentOperations } from "./apartment-operations";
import { APARTMENT_SCENARIO_INPUT_VERSION, runApartmentScenarioComparison } from "./apartment-scenarios";
import { computePropertyReturns } from "./property-returns";
import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import { anchorPreview, resolveMilestoneAnchors, type Milestone } from "./milestones";
import {
  BACK_LOADED_DISTRIBUTION_VERSION,
  COST_DISTRIBUTION_VERSIONS,
  computeMonthlyCostSchedule,
  FRONT_LOADED_DISTRIBUTION_VERSION,
  type MonthlyCostLine,
  type MonthlyCostScheduleInputs,
} from "./monthly-cost-schedule";

/*
 * LA-1839. A small case with four milestones, so each anchor, offset and duration can be checked
 * against months worked out by hand.
 */

const milestones: Milestone[] = [
  { id: "land-close", name: "Land Close", month: "2026-01" },
  { id: "construction-start", name: "Construction Start", month: "2026-03" },
  { id: "construction-complete", name: "Construction Complete", month: "2027-02" },
  { id: "sale", name: "Sale", month: "2027-12" },
];

function line(id: string, patch: Partial<MonthlyCostLine> = {}): MonthlyCostLine {
  return {
    id,
    name: id,
    category: "hard_cost",
    amount: 1_200_000,
    unit: "usd",
    startMonth: "2026-03",
    endMonth: "2026-08",
    distributionMethod: "straight_line",
    distributionVersion: "straight_line.v1",
    reviewState: "done",
    ...patch,
  };
}

const anchored: MonthlyCostScheduleInputs = {
  analysisStartMonth: "2026-01",
  saleMonth: "2027-12",
  saleAnchor: { milestoneId: "sale", offsetMonths: 0 },
  milestones,
  costLines: [
    line("land", {
      category: "land",
      startAnchor: { milestoneId: "land-close", offsetMonths: 0 },
      endAnchor: { milestoneId: "land-close", offsetMonths: 0 },
    }),
    line("hard", {
      startAnchor: { milestoneId: "construction-start", offsetMonths: 0 },
      endAnchor: { milestoneId: "construction-complete", offsetMonths: 0 },
      distributionMethod: "s_curve",
      distributionVersion: "s_curve.smoothstep.v1",
    }),
    line("soft", {
      category: "soft_cost",
      startAnchor: { milestoneId: "construction-start", offsetMonths: -2 },
      endAnchor: { durationMonths: 12 },
    }),
  ],
};

function schedule(input: MonthlyCostScheduleInputs) {
  const run = computeMonthlyCostSchedule(input);
  expect(run.issues).toEqual([]);
  return run;
}

function monthsOf(input: MonthlyCostScheduleInputs, lineId: string) {
  const { months } = schedule(input).result!.costLineSchedules.find((item) => item.lineId === lineId)!;
  return [months[0], months.at(-1)];
}

function codes(input: MonthlyCostScheduleInputs) {
  return computeMonthlyCostSchedule(input).issues.map(({ path, code }) => `${path}:${code}`);
}

describe("milestone anchors on cost lines", () => {
  it("resolves milestones, offsets and durations to months", () => {
    const run = schedule(anchored);
    expect(monthsOf(anchored, "land")).toEqual(["2026-01", "2026-01"]);
    expect(monthsOf(anchored, "hard")).toEqual(["2026-03", "2027-02"]);
    // Two months before Construction Start is 2026-01, and twelve months counting the start ends 2026-12.
    expect(monthsOf(anchored, "soft")).toEqual(["2026-01", "2026-12"]);
    expect(run.inputSnapshot.saleMonth).toBe("2027-12");
  });

  it("saves the anchor and the resolved month in the input snapshot", () => {
    const { inputSnapshot } = schedule(anchored);
    const hard = inputSnapshot.costLines[1];
    expect(hard).toMatchObject({
      startMonth: "2026-03",
      endMonth: "2027-02",
      startAnchor: { milestoneId: "construction-start", offsetMonths: 0 },
      endAnchor: { milestoneId: "construction-complete", offsetMonths: 0 },
    });
    expect(inputSnapshot.milestones).toEqual(milestones);
  });

  it("names the milestone in the traces and lists every resolved month", () => {
    const { result } = schedule(anchored);
    const soft = result!.costLineSchedules.find(({ lineId }) => lineId === "soft")!;
    expect(soft.formulaTrace).toContain("Starts 2 months before Construction Start (2026-03), which is 2026-01.");
    expect(soft.formulaTrace).toContain("Ends 12 months after it starts");
    expect(soft.inputPaths).toEqual(expect.arrayContaining(["costLines.2.startAnchor", "milestones"]));
    expect(result!.anchors).toContainEqual(expect.objectContaining({ path: "saleMonth", milestoneName: "Sale", month: "2027-12" }));
    expect(result!.anchors).toContainEqual(expect.objectContaining({ path: "costLines.1.endMonth", milestoneName: "Construction Complete", month: "2027-02" }));
  });

  it("says a zero offset sits at the milestone, without repeating its month", () => {
    const { result } = schedule(anchored);
    const hard = result!.costLineSchedules.find(({ lineId }) => lineId === "hard")!;
    expect(hard.formulaTrace).toContain("Starts at Construction Start (2026-03). Ends at Construction Complete (2027-02).");
    expect(hard.formulaTrace).not.toContain("which is 2026-03");
    expect(result!.anchors).toContainEqual(expect.objectContaining({ path: "saleMonth", trace: "Sale month is Sale (2027-12)." }));
  });

  it("moves every anchored line when one milestone moves", () => {
    const moved = structuredClone(anchored);
    moved.milestones![1].month = "2026-06";
    expect(monthsOf(moved, "hard")).toEqual(["2026-06", "2027-02"]);
    expect(monthsOf(moved, "soft")).toEqual(["2026-04", "2027-03"]);
    // The land line anchors to Land Close, which did not move.
    expect(monthsOf(moved, "land")).toEqual(["2026-01", "2026-01"]);
    expect(schedule(moved).result!.totalUses).toBe(schedule(anchored).result!.totalUses);
  });

  it("lets an anchored end sit beside a typed start, and a typed end beside an anchored start", () => {
    const mixed: MonthlyCostScheduleInputs = {
      ...anchored,
      costLines: [
        line("typed-start", { startMonth: "2026-04", endAnchor: { milestoneId: "construction-complete", offsetMonths: -1 } }),
        line("typed-end", { startAnchor: { milestoneId: "construction-start", offsetMonths: 1 }, endMonth: "2026-09" }),
        line("typed-start-duration", { startMonth: "2026-05", endAnchor: { durationMonths: 3 } }),
      ],
    };
    expect(monthsOf(mixed, "typed-start")).toEqual(["2026-04", "2027-01"]);
    expect(monthsOf(mixed, "typed-end")).toEqual(["2026-04", "2026-09"]);
    expect(monthsOf(mixed, "typed-start-duration")).toEqual(["2026-05", "2026-07"]);
  });

  it("gives a one-month duration a single month", () => {
    const one: MonthlyCostScheduleInputs = { ...anchored, costLines: [line("one", { startMonth: "2026-05", endAnchor: { durationMonths: 1 } })] };
    expect(monthsOf(one, "one")).toEqual(["2026-05", "2026-05"]);
  });

  it("gives the same months, amounts and totals as typing the same months", () => {
    const typed: MonthlyCostScheduleInputs = {
      analysisStartMonth: "2026-01",
      saleMonth: "2027-12",
      costLines: [
        { ...anchored.costLines[0], startMonth: "2026-01", endMonth: "2026-01" },
        { ...anchored.costLines[1], startMonth: "2026-03", endMonth: "2027-02" },
        { ...anchored.costLines[2], startMonth: "2026-01", endMonth: "2026-12" },
      ].map(({ startAnchor, endAnchor, ...rest }) => (void startAnchor, void endAnchor, rest)),
    };
    const fromAnchors = schedule(anchored).result!;
    const fromTyped = schedule(typed).result!;
    expect(fromAnchors.months).toEqual(fromTyped.months);
    expect(fromAnchors.totalsByCategory).toEqual(fromTyped.totalsByCategory);
    expect(fromAnchors.totalUses).toBe(fromTyped.totalUses);
    expect(fromTyped.anchors).toBeUndefined();
  });

  it("leaves a case with no anchors and an empty milestone list unchanged", () => {
    const typed: MonthlyCostScheduleInputs = { analysisStartMonth: "2026-01", saleMonth: "2027-12", costLines: [line("hard")] };
    const withEmptyList = { ...typed, milestones: [] };
    expect(schedule(withEmptyList).result).toEqual(schedule(typed).result);
  });
});

describe("milestone anchor failures", () => {
  it("fails with a missing milestone, naming the line", () => {
    const missing = structuredClone(anchored);
    missing.costLines[1].startAnchor = { milestoneId: "permit-issued", offsetMonths: 0 };
    const run = computeMonthlyCostSchedule(missing);
    expect(run.status).toBe("failed");
    expect(run.issues).toEqual([expect.objectContaining({ path: "costLines.1.startAnchor.milestoneId", code: "missing_milestone" })]);
    expect(run.issues[0].message).toContain('Cost line "hard" start');
  });

  it("fails with a missing milestone on the sale month, operation start and growth start", () => {
    expect(codes({ ...anchored, saleAnchor: { milestoneId: "gone", offsetMonths: 0 } })).toEqual(["saleAnchor.milestoneId:missing_milestone"]);
    const target = { analysisStartMonth: "2026-01", saleMonth: "2027-12", milestones, operationStartAnchor: { milestoneId: "gone", offsetMonths: 0 }, growthStartAnchor: { milestoneId: "gone", offsetMonths: 0 } };
    expect(resolveMilestoneAnchors(target).issues.map(({ path, code }) => `${path}:${code}`)).toEqual([
      "operationStartAnchor.milestoneId:missing_milestone",
      "growthStartAnchor.milestoneId:missing_milestone",
    ]);
  });

  it("fails when an anchored start or end falls outside the timeline", () => {
    const early = structuredClone(anchored);
    early.costLines[1].startAnchor = { milestoneId: "land-close", offsetMonths: -1 };
    expect(codes(early)).toEqual(["costLines.1.startAnchor:anchor_outside_timeline"]);

    const late = structuredClone(anchored);
    late.costLines[1].endAnchor = { milestoneId: "sale", offsetMonths: 1 };
    expect(codes(late)).toEqual(["costLines.1.endAnchor:anchor_outside_timeline"]);

    const longDuration = structuredClone(anchored);
    longDuration.costLines[2].endAnchor = { durationMonths: 30 };
    expect(codes(longDuration)).toEqual(["costLines.2.endAnchor:anchor_outside_timeline"]);
  });

  it("measures the timeline against the anchored sale month", () => {
    const earlierSale = structuredClone(anchored);
    earlierSale.milestones![3].month = "2026-12";
    expect(codes(earlierSale)).toEqual(["costLines.1.endAnchor:anchor_outside_timeline"]);
  });

  it("fails when an anchored end comes before the start", () => {
    const backwards = structuredClone(anchored);
    backwards.costLines[1].startAnchor = { milestoneId: "construction-complete", offsetMonths: 0 };
    backwards.costLines[1].endAnchor = { milestoneId: "construction-start", offsetMonths: 0 };
    const run = computeMonthlyCostSchedule(backwards);
    expect(run.issues).toEqual([expect.objectContaining({ path: "costLines.1.endAnchor", code: "anchor_end_before_start" })]);
    expect(run.issues[0].message).toContain("ends in 2026-03, before it starts in 2027-02");
  });

  it("fails on a malformed anchor, offset or duration", () => {
    const fractional = structuredClone(anchored);
    fractional.costLines[1].startAnchor = { milestoneId: "construction-start", offsetMonths: 1.5 };
    expect(codes(fractional)).toEqual(["costLines.1.startAnchor.offsetMonths:invalid_anchor"]);

    const blank = structuredClone(anchored);
    blank.costLines[1].startAnchor = { milestoneId: "", offsetMonths: 0 };
    expect(codes(blank)).toEqual(["costLines.1.startAnchor.milestoneId:invalid_anchor"]);

    const zero = structuredClone(anchored);
    zero.costLines[2].endAnchor = { durationMonths: 0 };
    expect(codes(zero)).toEqual(["costLines.2.endAnchor.durationMonths:invalid_anchor"]);
  });

  it("fails on a bad milestone list", () => {
    expect(codes({ ...anchored, milestones: [...milestones, { id: "land-close", name: "Again", month: "2026-01" }] })).toContain("milestones.4.id:duplicate_milestone");
    expect(codes({ ...anchored, milestones: [...milestones, { id: "x", name: " sale ", month: "2026-01" }] })).toContain("milestones.4.name:duplicate_milestone");
    expect(codes({ ...anchored, milestones: [...milestones, { id: "x", name: "Bad", month: "2026-13" }] })).toContain("milestones.4.month:invalid_milestone");
    expect(codes({ ...anchored, milestones: Array.from({ length: 25 }, (_, index) => ({ id: `m${index}`, name: `M${index}`, month: "2026-01" })) })).toEqual(["milestones:too_many_milestones"]);
  });

  it("cannot anchor to stabilization, because a milestone is a typed month and nothing computed", () => {
    const stabilization = structuredClone(anchored);
    stabilization.costLines[1].startAnchor = { milestoneId: "first-stabilized-month", offsetMonths: 0 };
    expect(codes(stabilization)).toEqual(["costLines.1.startAnchor.milestoneId:missing_milestone"]);
    const noMonth = [...milestones, { id: "stabilization", name: "Stabilization" } as Milestone];
    expect(codes({ ...anchored, milestones: noMonth })).toEqual(["milestones.4.month:invalid_milestone"]);
  });

  it("still reports a typed line that sits outside the timeline the usual way", () => {
    const typed: MonthlyCostScheduleInputs = { ...anchored, costLines: [line("late", { startMonth: "2027-06", endMonth: "2028-02" })] };
    expect(codes(typed)).toEqual(["costLines.0:outside_timeline"]);
  });
});

describe("front-loaded and back-loaded cost shapes", () => {
  const spread = (distributionMethod: MonthlyCostLine["distributionMethod"]) => {
    const input: MonthlyCostScheduleInputs = {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [line("shape", { amount: 1_000_000.01, startMonth: "2026-01", endMonth: "2026-10", distributionMethod, distributionVersion: COST_DISTRIBUTION_VERSIONS[distributionMethod] })],
    };
    return schedule(input).result!.costLineSchedules[0];
  };

  it("sums to the line amount to the cent", () => {
    for (const method of ["front_loaded", "back_loaded"] as const) {
      const shape = spread(method);
      expect(shape.monthlyAmounts).toHaveLength(10);
      expect(Math.round(shape.monthlyAmounts.reduce((sum, amount) => sum + amount * 100, 0))).toBe(100_000_001);
      expect(shape.total).toBe(1_000_000.01);
    }
  });

  it("spends more early when front-loaded and more late when back-loaded", () => {
    const front = spread("front_loaded").monthlyAmounts;
    const back = spread("back_loaded").monthlyAmounts;
    const straight = spread("straight_line").monthlyAmounts;
    expect(front[0]).toBeGreaterThan(straight[0]);
    expect(front[0]).toBeGreaterThan(front.at(-1)!);
    expect(back.at(-1)!).toBeGreaterThan(straight.at(-1)!);
    expect(back.at(-1)!).toBeGreaterThan(back[0]);
    // The two shapes mirror each other.
    expect(front.map((amount) => Math.round(amount))).toEqual([...back].reverse().map((amount) => Math.round(amount)));
  });

  it("follows the quadratic curves month by month", () => {
    const front = spread("front_loaded").monthlyAmounts;
    // Cumulative share after month k of ten is 1 - (1 - k/10)^2, so month one holds 19 percent.
    expect(front[0]).toBeCloseTo(1_000_000.01 * 0.19, 1);
    expect(front[1]).toBeCloseTo(1_000_000.01 * 0.17, 1);
  });

  it("requires the version that matches the shape", () => {
    const wrong: MonthlyCostScheduleInputs = {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [line("shape", { startMonth: "2026-01", endMonth: "2026-10", distributionMethod: "front_loaded", distributionVersion: BACK_LOADED_DISTRIBUTION_VERSION })],
    };
    expect(codes(wrong)).toEqual(["costLines.0.distributionVersion:unsupported_distribution_version"]);
    expect(FRONT_LOADED_DISTRIBUTION_VERSION).not.toBe(BACK_LOADED_DISTRIBUTION_VERSION);
  });

  it("rejects a shape the engine does not have", () => {
    const unknown = { ...line("shape"), distributionMethod: "u_curve" } as unknown as MonthlyCostLine;
    expect(codes({ analysisStartMonth: "2026-01", saleMonth: "2026-12", costLines: [unknown] })).toEqual(["costLines.0.distributionMethod:unsupported_distribution"]);
  });
});

describe("milestone anchors on operation start, growth start and sale", () => {
  const full = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE.fullModelInput;

  /** The same case with every typed month replaced by an anchor to a milestone at that month. */
  function anchoredCopy() {
    const input = structuredClone(full);
    const byMonth = new Map<string, Milestone>();
    const milestoneAt = (month: string) => {
      if (!byMonth.has(month)) byMonth.set(month, { id: `m-${month}`, name: `Month ${month}`, month });
      return byMonth.get(month)!;
    };
    const anchorTo = (month: string) => ({ milestoneId: milestoneAt(month).id, offsetMonths: 0 });
    for (const costLine of input.costLines) {
      costLine.startAnchor = anchorTo(costLine.startMonth);
      costLine.endAnchor = anchorTo(costLine.endMonth);
    }
    input.saleAnchor = anchorTo(input.saleMonth);
    input.operationStartAnchor = anchorTo(input.operationStartMonth);
    input.growthStartAnchor = anchorTo(input.growthStartMonth);
    input.milestones = [...byMonth.values()];
    return input;
  }

  it("gives identical property returns whether months are typed or anchored", () => {
    const typed = computePropertyReturns(structuredClone(full));
    expect(typed.issues).toEqual([]);
    const fromAnchors = computePropertyReturns(anchoredCopy());
    expect(fromAnchors.issues).toEqual([]);
    expect(fromAnchors.result!.forwardOperations).toEqual(typed.result!.forwardOperations);
    expect(fromAnchors.result!.propertyReturns).toEqual(typed.result!.propertyReturns);
    expect(fromAnchors.result!.developmentCapital).toEqual(typed.result!.developmentCapital);
    const operations = computeApartmentOperations(anchoredCopy()).result!;
    expect(operations.months).toEqual(computeApartmentOperations(structuredClone(full)).result!.months);
    expect(operations.costSchedule.anchors?.length).toBeGreaterThan(0);
  });

  it("moves the operation start, growth start and sale when their milestones move", () => {
    const input = anchoredCopy();
    const operationMilestone = input.milestones!.find(({ id }) => id === input.operationStartAnchor!.milestoneId)!;
    const growthMilestone = input.milestones!.find(({ id }) => id === input.growthStartAnchor!.milestoneId)!;
    // Operation and growth start share a month, so they share a milestone. Offset them apart instead.
    expect(operationMilestone).toBe(growthMilestone);
    input.operationStartAnchor = { milestoneId: operationMilestone.id, offsetMonths: 2 };
    input.growthStartAnchor = { milestoneId: growthMilestone.id, offsetMonths: 5 };
    const run = computeApartmentOperations(input);
    expect(run.issues).toEqual([]);
    expect(run.inputSnapshot.operationStartMonth).toBe("2026-03");
    expect(run.inputSnapshot.growthStartMonth).toBe("2026-06");
    expect(run.result!.anchors).toEqual([
      expect.objectContaining({ path: "operationStartMonth", month: "2026-03", offsetMonths: 2 }),
      expect.objectContaining({ path: "growthStartMonth", month: "2026-06", offsetMonths: 5 }),
    ]);
    expect(run.result!.anchors![0].trace).toContain("Operation start month is 2 months after");
    const atMilestone = structuredClone(input);
    atMilestone.operationStartAnchor = { milestoneId: operationMilestone.id, offsetMonths: 0 };
    atMilestone.growthStartAnchor = { milestoneId: growthMilestone.id, offsetMonths: 0 };
    expect(computeApartmentOperations(atMilestone).result!.anchors!.map(({ trace }) => trace)).toEqual([
      `Operation start month is ${operationMilestone.name} (${operationMilestone.month}).`,
      `Growth start month is ${growthMilestone.name} (${growthMilestone.month}).`,
    ]);
    operationMilestone.month = "2026-02";
    expect(computeApartmentOperations(input).inputSnapshot.operationStartMonth).toBe("2026-04");
  });

  it("fails when the operation start or growth start falls outside the timeline", () => {
    const input = anchoredCopy();
    input.operationStartAnchor = { milestoneId: input.operationStartAnchor!.milestoneId, offsetMonths: 60 };
    const run = computeApartmentOperations(input);
    expect(run.status).toBe("failed");
    expect(run.issues).toEqual([expect.objectContaining({ path: "operationStartAnchor", code: "anchor_outside_timeline" })]);
    const growth = anchoredCopy();
    growth.growthStartAnchor = { milestoneId: growth.growthStartAnchor!.milestoneId, offsetMonths: -60 };
    expect(computeApartmentOperations(growth).issues).toEqual([expect.objectContaining({ path: "growthStartAnchor", code: "anchor_outside_timeline" })]);
  });

  it("carries the debt payoff to a moved sale month, because payoff and sale must match", () => {
    const input = anchoredCopy();
    const saleMilestone = input.milestones!.find(({ id }) => id === input.saleAnchor!.milestoneId)!;
    expect(input.payoffMonth).toBe(input.saleMonth);
    input.saleAnchor = { milestoneId: saleMilestone.id, offsetMonths: -1 };
    const run = computePropertyReturns(input);
    expect(run.issues.map(({ code }) => code)).not.toContain("sale_payoff_mismatch");
    expect(run.inputSnapshot.saleMonth).toBe("2028-01");
    expect(run.inputSnapshot.payoffMonth).toBe("2028-01");
  });

  it("reports a missing sale milestone from the returns run", () => {
    const input = anchoredCopy();
    input.saleAnchor = { milestoneId: "gone", offsetMonths: 0 };
    const run = computePropertyReturns(input);
    expect(run.status).toBe("failed");
    expect(run.issues).toEqual([expect.objectContaining({ path: "saleAnchor.milestoneId", code: "missing_milestone" })]);
  });

  it("shifts an anchored growth start in a scenario by moving the resolved month", () => {
    const input = anchoredCopy();
    const run = runApartmentScenarioComparison(input, [{
      id: "later-growth",
      role: "downside",
      name: "Later Growth",
      inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta: { growthStartMonthShiftMonths: 6 },
      evidence: { growthStartMonthShiftMonths: { sourceLabel: "Broker view", sourceDate: "2026-10-01", reviewState: "done" } },
    }, {
      id: "lower-vacancy",
      role: "upside",
      name: "Lower Vacancy",
      inputVersion: APARTMENT_SCENARIO_INPUT_VERSION,
      delta: { vacancyPercent: 4 },
      evidence: { vacancyPercent: { sourceLabel: "Broker view", sourceDate: "2026-10-01", reviewState: "done" } },
    }]);
    expect(run.issues).toEqual([]);
    const shifted = run.result!.scenarios.find(({ id }) => id === "later-growth")!;
    expect(shifted.inputSnapshot.growthStartMonth).toBe("2026-07");
    expect(shifted.inputSnapshot.growthStartAnchor).toBeUndefined();
    expect(shifted.changedInputs[0]).toMatchObject({ baseValue: "2026-01", scenarioValue: "2026-07" });
  });
});

describe("anchor preview", () => {
  it("returns the month an anchor points to, and null when it cannot", () => {
    expect(anchorPreview(milestones, { milestoneId: "construction-start", offsetMonths: -2 })).toBe("2026-01");
    expect(anchorPreview(milestones, { milestoneId: "construction-start", offsetMonths: 12 })).toBe("2027-03");
    expect(anchorPreview(milestones, { milestoneId: "gone", offsetMonths: 0 })).toBeNull();
    expect(anchorPreview(milestones, { milestoneId: "sale", offsetMonths: 0.5 })).toBeNull();
  });
});
