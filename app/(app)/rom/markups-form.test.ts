import { describe, expect, it } from "vitest";

import type { MarkupOptions } from "@/lib/rom/markup";

import { initialMarkupForm, markupChoicesFrom, missingRates, setupHistory } from "./Markups";

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
