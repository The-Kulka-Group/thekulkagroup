import { describe, expect, it } from "vitest";

import type { GrRate } from "@/lib/rom/gr-rates";
import type { MarkupOptions } from "@/lib/rom/markup";

import type { ScheduleProposal } from "@kulka/engine";

import {
  applyProposalToMarkupForm,
  initialMarkupForm,
  markupChoicesFrom,
  METHODS,
  missingRates,
  setupHistory,
  type MarkupForm,
} from "./Markups";
import { grRateOptions, linesFromGrRate, linesFromRateCard, resetPhaseToProposal, TYPED } from "./resource-plan-form";

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

  it("adds a $0 rate card row, and a connect with no monthly rate, with the rate blank for the estimator", () => {
    const zero: MarkupOptions = {
      ...rates,
      fieldOfficeRates: [
        { id: "f-electric", category: "office_setup", item: "Electric Connect", rateBasis: "lump_sum", rate: 0, recurringRate: null, sourceEstimate: "C-00379" },
        { id: "f-water", category: "office_setup", item: "Water", rateBasis: "lump_sum_then_monthly", rate: 300, recurringRate: null, sourceEstimate: "C-00379" },
      ],
    };
    const electric = linesFromRateCard("office", "f-electric", zero, []);
    expect(electric).toHaveLength(1);
    expect(electric[0]).toMatchObject({ rate: "", rateFrom: TYPED, noCardRate: true });
    const water = linesFromRateCard("office", "f-water", zero, []);
    expect(water.map((line) => [line.rate, line.noCardRate ?? false])).toEqual([
      ["300", false],
      ["", true],
    ]);
    const form = { ...withPlan(), plan: { ...withPlan().plan, lines: electric } };
    expect(markupChoicesFrom(form, zero)).toEqual({ ok: false, error: "Enter a rate for Electric Connect. The rate card has none for it." });
  });

  it("opens a saved Staffing and Duration choice with a $0 row as a line whose rate needs entering", () => {
    const zero: MarkupOptions = {
      ...rates,
      fieldOfficeRates: [
        { id: "f-electric", category: "office_setup", item: "Electric Connect", rateBasis: "lump_sum", rate: 0, recurringRate: null, sourceEstimate: "C-00379" },
      ],
    };
    const form = initialMarkupForm(zero, { setup: "both", method: "staffing_duration", durationWeeks: 20, fieldOffice: [{ rateId: "f-electric" }] });
    expect(form.plan.lines).toHaveLength(1);
    expect(form.plan.lines[0]).toMatchObject({ label: "Electric Connect", rate: "", noCardRate: true });
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

// LA-1398: General Requirements by Allocated Resources, and a method per line
// under Separate Lines. Rate card rows are shaped like LA-1396's gr_rates rows.
describe("the GRs/GCs form, General Requirements by Allocated Resources", () => {
  const row = (over: Partial<GrRate> & Pick<GrRate, "id" | "section" | "item">): GrRate => ({
    unit: null,
    basis: "lump_sum",
    phase: null,
    rate: null,
    jobQuantity: null,
    note: null,
    flaggedFor: null,
    priceable: true,
    notPriceableReason: null,
    sourceEstimate: "C-00379",
    sourceJob: "117 N. Long Beach Rd, one 120,000 SF warehouse",
    singleJobWarehouse: true,
    ...over,
  });
  const grRates: GrRate[] = [
    row({ id: "g-clean", section: "Construction Labor & Clean-up", item: "Final Cleaning", unit: "SF", basis: "unit", rate: 0.55, jobQuantity: 120_000 }),
    row({ id: "g-lab", section: "Construction Labor & Clean-up", item: "Laborers", unit: "Weeks", basis: "phase_weeks", phase: "construction", rate: 1400 }),
    row({ id: "g-john", section: "Temporary Utilities", item: "Port-a-John", unit: "Months", basis: "phase_months", phase: "construction", rate: 90 }),
    row({ id: "g-permit", section: "Permits, Fees & Expediting", item: "Building Permit Fee", basis: "not_stated" }),
    row({ id: "g-wash", section: "Construction Labor & Clean-up", item: "Car Washing", unit: "Weeks", basis: "phase_weeks", rate: 0 }),
    row({
      id: "g-bond",
      section: "Insurances & Bonds",
      item: "Performance & Payment Bond",
      basis: "not_stated",
      priceable: false,
      notPriceableReason: "Fee and insurance are already markups.",
    }),
  ];
  const rates: MarkupOptions = { ...options, grRates };
  const grPlan = () => ({
    weeks: { precon: "0", construction: "40", closeout: "0" },
    weeksFrom: { precon: TYPED, construction: TYPED, closeout: TYPED },
    confidence: "high" as const,
    // Since LA-1401 a time line from the card opens with a blank count; the estimator enters one.
    lines: [...linesFromGrRate("g-lab", grRates, []), ...linesFromGrRate("g-john", grRates, [])].map((line) => ({
      ...line,
      quantity: "1",
      quantityFrom: TYPED,
    })),
  });

  it("adds a rate card line under its own section, at the card's rate and basis", () => {
    expect(linesFromGrRate("g-lab", grRates, [])).toMatchObject([
      { label: "Laborers", group: "Construction Labor & Clean-up", basis: "time", per: "week", phases: ["construction"], quantity: "", rate: "1400", rateFrom: { origin: "rate_card", ref: "g-lab", source: "C-00379" } },
    ]);
    expect(linesFromGrRate("g-john", grRates, [])).toMatchObject([{ basis: "time", per: "month", rate: "90" }]);
    // A unit line's quantity belongs to this job, so it starts blank rather than at the warehouse's 120,000.
    expect(linesFromGrRate("g-clean", grRates, [])).toMatchObject([{ basis: "unit", unit: "SF", quantity: "", rate: "0.55" }]);
  });

  it("never adds an Insurances & Bonds row while it is marked not priceable, and never offers one", () => {
    expect(linesFromGrRate("g-bond", grRates, [])).toEqual([]);
    const offered = grRateOptions(grRates).flatMap((section) => section.rates.map((rate) => rate.id));
    expect(offered).not.toContain("g-bond");
    expect(grRateOptions(grRates).map((section) => section.section)).not.toContain("Insurances & Bonds");
  });

  it("adds a line the card has no rate for, and refuses to price it until the estimator enters one", () => {
    for (const id of ["g-permit", "g-wash"]) {
      const [line] = linesFromGrRate(id, grRates, []);
      expect([line.rate, line.rateFrom]).toEqual(["", TYPED]);
    }
    const form = {
      ...initialMarkupForm(rates),
      setup: "separate" as const,
      grMethod: "allocated_resources" as const,
      grPlan: { ...grPlan(), lines: linesFromGrRate("g-permit", grRates, []) },
      overridePercent: "8",
    };
    expect(markupChoicesFrom(form, rates)).toEqual({
      ok: false,
      error: "General Requirements: enter a rate for Building Permit Fee. The rate card has none for it.",
    });
    const typed = { ...form, grPlan: { ...form.grPlan, lines: [{ ...form.grPlan.lines[0], rate: "7500" }] } };
    const sent = markupChoicesFrom(typed, rates);
    expect(sent.ok && sent.markups.grResourcePlan?.lines[0].rate).toEqual({ value: 7500, origin: "estimator" });
  });

  it("saves each line's method on its own under separate lines", () => {
    const base = { ...initialMarkupForm(rates), setup: "separate" as const };

    // General Requirements by its plan, General Conditions as a percent.
    const byPlan = markupChoicesFrom({ ...base, overridePercent: "8", grMethod: "allocated_resources", grPlan: grPlan(), grOverridePercent: "2" }, rates);
    expect(byPlan.ok && byPlan.markups).toMatchObject({ setup: "separate", method: "pct_of_subtotal", overrideRate: 0.08, grMethod: "allocated_resources" });
    expect(byPlan.ok && byPlan.markups.grOverrideRate).toBeUndefined();
    expect(byPlan.ok && byPlan.markups.grResourcePlan?.lines.map((line) => line.label)).toEqual(["Laborers", "Port-a-John"]);

    // General Conditions per GSF, General Requirements as a percent.
    expect(markupChoicesFrom({ ...base, method: "usd_per_gsf", overridePerSf: "12", grMethod: "pct_of_subtotal", grOverridePercent: "2" }, rates)).toEqual({
      ok: true,
      markups: { setup: "separate", method: "usd_per_gsf", overrideRate: 12, grMethod: "pct_of_subtotal", grOverrideRate: 0.02 },
    });

    // Naming the method the old rule would pick records nothing new.
    expect(markupChoicesFrom({ ...base, overridePercent: "8", grMethod: "pct_of_subtotal", grOverridePercent: "2" }, rates)).toEqual({
      ok: true,
      markups: { setup: "separate", method: "pct_of_subtotal", overrideRate: 0.08, grOverrideRate: 0.02 },
    });
  });

  it("never sends a General Requirements method or plan outside separate lines", () => {
    const form = { ...initialMarkupForm(rates), grMethod: "allocated_resources" as const, grPlan: grPlan() };
    expect(markupChoicesFrom(form, rates)).toEqual({ ok: true, markups: { setup: "both", method: "pct_of_subtotal" } });
  });

  it("round-trips a saved General Requirements plan", () => {
    const sent = markupChoicesFrom(
      { ...initialMarkupForm(rates), setup: "separate", overridePercent: "8", grMethod: "allocated_resources", grPlan: grPlan() },
      rates,
    );
    if (!sent.ok) throw new Error(sent.error);
    const reopened = initialMarkupForm(rates, sent.markups);
    expect(reopened.grMethod).toBe("allocated_resources");
    expect(markupChoicesFrom(reopened, rates)).toEqual(sent);
  });

  it("asks New Budget for no General Requirements rate when its plan prices it", () => {
    const form = { ...initialMarkupForm(rates), setup: "separate" as const, grMethod: "allocated_resources" as const, grPlan: grPlan() };
    expect(missingRates(form, options.historyCounts, false)).toEqual([]);
    expect(missingRates(form, { ...options.historyCounts, gc_only: 0 }, false)).toEqual(["General Conditions"]);
  });

  it("names the General Requirements plan in its errors", () => {
    const form = { ...initialMarkupForm(rates), setup: "separate" as const, overridePercent: "8", grMethod: "allocated_resources" as const, grPlan: { ...grPlan(), lines: [] } };
    expect(markupChoicesFrom(form, rates)).toEqual({ ok: false, error: "General Requirements: add at least one line to the plan." });
  });
});

// LA-1399: the proposed schedule opens on the plan as a planning assumption.
// The proposal is shaped like one the engine saves; its job is synthetic.
describe("the GRs/GCs form, the proposed schedule", () => {
  const rates: MarkupOptions = {
    ...options,
    staffingRates: [
      { id: "s-spm", role: "Sr. Project Manager", daysPerWeek: 2, weeklyRateLow: 2600, weeklyRateHigh: 2615.2, sourceEstimate: "C-00379" },
    ],
  };
  const proposed = (weeks: number | null) => ({ weeks, jobNumbers: weeks === null ? [] : ["TEST-0001"], reason: "Scaled." });
  const proposal: ScheduleProposal = {
    status: "proposed",
    phases: { precon: proposed(12), construction: proposed(62), closeout: proposed(8) },
    jobs: [{ jobNumber: "TEST-0001", name: "Synthetic Test Job", why: "Same type." }],
    reasoning: "One close job.",
    model: "claude-opus-5",
    proposedAt: "2026-09-29",
    inputKey: "v1-test",
  };
  const blank: ScheduleProposal = {
    ...proposal,
    status: "no_jobs",
    phases: { precon: proposed(null), construction: proposed(null), closeout: proposed(null) },
    jobs: [],
  };
  const withLine = (form: MarkupForm): MarkupForm => ({
    ...form,
    method: "allocated_resources",
    plan: { ...form.plan, lines: linesFromRateCard("staff", "s-spm", rates, []) },
  });

  it("opens a new plan with the proposed weeks and sends them as proposed, naming the jobs", () => {
    const form = withLine(initialMarkupForm(rates, null, proposal));
    expect(form.plan.weeks).toEqual({ precon: "12", construction: "62", closeout: "8" });
    const sent = markupChoicesFrom(form, rates);
    expect(sent.ok && sent.markups.resourcePlan?.schedule.construction).toEqual({
      value: 62,
      origin: "proposed",
      ref: "schedule-proposal",
      source: "Planning assumption from completed job TEST-0001",
    });
  });

  it("fills General Requirements' own plan too", () => {
    const form = initialMarkupForm(rates, null, proposal);
    expect(form.grPlan.weeks).toEqual({ precon: "12", construction: "62", closeout: "8" });
  });

  it("leaves the weeks blank when nothing could be compared, so the plan waits for the estimator", () => {
    const form = withLine(initialMarkupForm(rates, null, blank));
    expect(form.plan.weeks).toEqual({ precon: "", construction: "", closeout: "" });
    expect(markupChoicesFrom(form, rates)).toMatchObject({ ok: false, error: expect.stringMatching(/Enter Precon weeks/) });
  });

  it("keeps a phase the estimator changed through a save and a new proposal, and resets it on request", () => {
    const form = withLine(initialMarkupForm(rates, null, proposal));
    const edited: MarkupForm = {
      ...form,
      plan: { ...form.plan, weeks: { ...form.plan.weeks, construction: "70" }, weeksFrom: { ...form.plan.weeksFrom, construction: TYPED } },
    };
    const sent = markupChoicesFrom(edited, rates);
    if (!sent.ok) throw new Error(sent.error);
    // Reopened from the project's saved choice, with a newer proposal.
    const newer: ScheduleProposal = { ...proposal, phases: { ...proposal.phases, precon: proposed(14), construction: proposed(64) } };
    const reopened = initialMarkupForm(rates, sent.markups, newer);
    expect(reopened.plan.weeks).toEqual({ precon: "14", construction: "70", closeout: "8" });
    expect(reopened.plan.weeksFrom.construction).toEqual(TYPED);

    const reset = resetPhaseToProposal(reopened.plan, "construction", newer);
    expect(reset.weeks.construction).toBe("64");
    expect(reset.weeksFrom.construction).toMatchObject({ origin: "proposed" });
  });

  it("applies a proposal that arrives after the form opened, without touching typed phases", () => {
    const form = withLine(initialMarkupForm(rates, null));
    const typed: MarkupForm = { ...form, plan: { ...form.plan, weeks: { ...form.plan.weeks, precon: "0" } } };
    const applied = applyProposalToMarkupForm(typed, proposal);
    expect(applied.plan.weeks).toEqual({ precon: "0", construction: "62", closeout: "8" });
  });
});
