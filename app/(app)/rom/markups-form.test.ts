import { describe, expect, it } from "vitest";

import type { MarkupOptions } from "@/lib/rom/markup";

import { initialMarkupForm, markupChoicesFrom, METHODS, missingRates, setupHistory, type MarkupForm } from "./Markups";
import { linesFromRateCard, TYPED } from "./resource-plan-form";

// LA-1383: the Run Settings form with General Requirements and General
// Conditions carried as two lines. Counts and rates are synthetic.

const options: MarkupOptions = {
  staffingRates: [],
  fieldOfficeRates: [],
  feeRate: null,
  insuranceRate: null,
  historyCounts: { both: 4, gc_only: 1, gr_only: 0 },
};

describe("the GRs/GCs form, separate lines", () => {
  it("sends each line's own rate, as a fraction or per GSF", () => {
    const form = { ...initialMarkupForm(options), setup: "separate" as const };

    expect(markupChoicesFrom({ ...form, overridePercent: "8", grOverridePercent: "2" }, options)).toEqual({
      ok: true,
      markups: { setup: "separate", method: "pct_of_subtotal", overrideRate: 0.08, grOverrideRate: 0.02 },
    });
    expect(
      markupChoicesFrom({ ...form, method: "usd_per_gsf", overridePerSf: "12", grOverridePerSf: "4" }, options),
    ).toEqual({
      ok: true,
      markups: { setup: "separate", method: "usd_per_gsf", overrideRate: 12, grOverrideRate: 4 },
    });
  });

  it("never sends a General Requirements rate for a combined setup", () => {
    const form = { ...initialMarkupForm(options), grOverridePercent: "2" };
    expect(markupChoicesFrom(form, options)).toEqual({ ok: true, markups: { setup: "both", method: "pct_of_subtotal" } });
  });

  it("refuses a General Requirements percent of 100 or more", () => {
    const form = { ...initialMarkupForm(options), setup: "separate" as const, grOverridePercent: "100" };
    expect(markupChoicesFrom(form, options)).toEqual({
      ok: false,
      error: "The General Requirements percent must be above 0 and below 100.",
    });
  });

  it("prefills both rates from the project's saved choice", () => {
    const form = initialMarkupForm(options, {
      setup: "separate",
      method: "pct_of_subtotal",
      overrideRate: 0.08,
      grOverrideRate: 0.02,
    });
    expect([form.overridePercent, form.grOverridePercent]).toEqual(["8", "2"]);
  });

  it("counts General Requirements and General Conditions history apart", () => {
    expect(setupHistory(options.historyCounts, "separate")).toEqual({ gr: 0, gc: 1 });
    expect(setupHistory(options.historyCounts, "both")).toEqual({ gr: null, gc: 4 });
  });
});

describe("New Budget's rate question", () => {
  const counts = options.historyCounts;

  it("needs each separate line typed unless that line has history", () => {
    const form = { ...initialMarkupForm(options), setup: "separate" as const };

    // gr_only has no history here and gc_only has one job.
    expect(missingRates(form, counts, false)).toEqual(["General Requirements"]);
    expect(missingRates({ ...form, grOverridePercent: "2" }, counts, false)).toEqual([]);
    expect(missingRates(form, { ...counts, gc_only: 0 }, false)).toEqual(["General Requirements", "General Conditions"]);
  });

  it("keeps one combined line to a typed rate or Use History", () => {
    const form = initialMarkupForm(options);
    expect(missingRates(form, counts, false)).toEqual(["GRs/GCs"]);
    expect(missingRates(form, counts, true)).toEqual([]);
  });
});

// LA-1397: Allocated Resources in the same form. Rates are synthetic.
describe("the GRs/GCs form, Allocated Resources", () => {
  const rates: MarkupOptions = {
    ...options,
    staffingRates: [
      { id: "s-spm", role: "Sr. Project Manager", daysPerWeek: 2, weeklyRateLow: 2600, weeklyRateHigh: 2615.2, sourceEstimate: "C-00379" },
    ],
    fieldOfficeRates: [
      { id: "f-power", category: "office_setup", item: "Electric connect", rateBasis: "lump_sum_then_monthly", rate: 500, recurringRate: 175, sourceEstimate: "C-00379" },
    ],
  };
  const withPlan = (): MarkupForm => {
    const form = { ...initialMarkupForm(rates), method: "allocated_resources" as const };
    const lines = linesFromRateCard("staff", "s-spm", rates, []);
    return {
      ...form,
      plan: { ...form.plan, weeks: { precon: "0", construction: "65", closeout: "4" }, lines },
    };
  };

  it("offers Percent, Dollars per GSF and Allocated Resources, and no longer Staffing and Duration", () => {
    expect(METHODS.map((m) => m.label)).toEqual(["Percent of Subtotal", "Dollars per GSF", "Allocated Resources"]);
  });

  it("sends the plan with each figure's origin, a rate-card rate as rate card until it is changed", () => {
    const sent = markupChoicesFrom(withPlan(), rates);
    expect(sent.ok && sent.markups.resourcePlan?.lines[0]).toMatchObject({
      label: "Sr. Project Manager",
      basis: "time",
      per: "day",
      phases: ["construction"],
      daysPerWeek: { value: 2, origin: "rate_card", ref: "s-spm", source: "C-00379" },
      rate: { value: 1300, origin: "rate_card", ref: "s-spm", source: "C-00379" },
    });

    const form = withPlan();
    form.plan.lines[0] = { ...form.plan.lines[0], rate: "1400", rateFrom: TYPED };
    const edited = markupChoicesFrom(form, rates);
    expect(edited.ok && edited.markups.resourcePlan?.lines[0].rate).toEqual({ value: 1400, origin: "estimator" });
  });

  it("adds a connect-then-monthly item as its connect and its monthly service", () => {
    const lines = linesFromRateCard("office", "f-power", rates, []);
    expect(lines.map((line) => [line.label, line.basis, line.per])).toEqual([
      ["Electric connect", "lump_sum", "week"],
      ["Electric connect, Monthly Service", "time", "month"],
    ]);
    // Adding the same row twice keeps every line's id its own.
    const again = linesFromRateCard("office", "f-power", rates, lines);
    expect(new Set([...lines, ...again].map((line) => line.id)).size).toBe(4);
  });

  it("refuses a plan with a phase left blank or no lines, in words the screen shows", () => {
    const form = withPlan();
    expect(markupChoicesFrom({ ...form, plan: { ...form.plan, weeks: { ...form.plan.weeks, precon: "" } } }, rates)).toEqual({
      ok: false,
      error: "Enter Precon weeks, 0 or more. Type 0 for a phase the job skips.",
    });
    expect(markupChoicesFrom({ ...form, plan: { ...form.plan, lines: [] } }, rates)).toEqual({
      ok: false,
      error: "Add at least one line to the plan.",
    });
  });

  it("round-trips a saved plan, and opens a Staffing and Duration choice as a plan", () => {
    const sent = markupChoicesFrom(withPlan(), rates);
    if (!sent.ok) throw new Error(sent.error);
    expect(markupChoicesFrom(initialMarkupForm(rates, sent.markups), rates)).toEqual(sent);

    const legacy = initialMarkupForm(rates, {
      setup: "both",
      method: "staffing_duration",
      durationWeeks: 30,
      staff: [{ rateId: "s-spm" }],
    });
    expect(legacy.method).toBe("allocated_resources");
    expect(legacy.plan.weeks.construction).toBe("30");
    expect(legacy.plan.lines.map((line) => line.label)).toEqual(["Sr. Project Manager"]);
  });

  it("asks New Budget for a General Requirements rate beside a plan under separate lines", () => {
    const form = { ...withPlan(), setup: "separate" as const };
    expect(missingRates(form, options.historyCounts, false)).toEqual(["General Requirements"]);
    expect(missingRates({ ...form, grOverridePercent: "2" }, options.historyCounts, false)).toEqual([]);
    expect(missingRates({ ...form, setup: "gc_only" }, options.historyCounts, false)).toEqual([]);
  });
});
