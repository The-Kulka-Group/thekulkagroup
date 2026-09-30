import { describe, expect, it } from "vitest";

import type { GrRate } from "@/lib/rom/gr-rates";
import { parseResourcePlan } from "@/lib/rom/resource-plan";
import type { MarkupOptions } from "@/lib/rom/markup";
import { HOISTING_MIN_STORIES } from "@kulka/engine";

import { initialMarkupForm, markupChoicesFrom, withRuleLinesOnForm, type MarkupForm } from "./Markups";
import {
  emptyPlanForm,
  planAnswersFromProject,
  planAnswersFromResponses,
  planFormFrom,
  planFromForm,
  pricedPlanOf,
  resetAllLineSwitches,
  resetLineSwitch,
  RULE_SEED_ROWS,
  setLineSwitch,
  switchOf,
  withRuleLines,
  TYPED,
  type PlanForm,
} from "./resource-plan-form";

// LA-1402: lines switch on and off from the answers and the schedule. The
// rule behind each is tested in packages/engine/src/line-rules.test.ts. These
// tests cover how the form applies them: which lines a new plan opens with,
// what the estimator's own switch does, and what saves and reopens. Rates are
// synthetic.

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

// One synthetic row for each seed row, so the test follows the seed list.
const grRates: GrRate[] = RULE_SEED_ROWS.map((seed, i) =>
  row({
    id: `g${i}`,
    section: seed.section,
    item: seed.item,
    unit: i % 2 === 0 ? "Weeks" : "Each",
    basis: i % 2 === 0 ? "phase_weeks" : "unit",
    rate: 100 * (i + 1),
  }),
);
grRates.push(row({ id: "g-clean", section: "Construction Labor & Clean-up", item: "Laborers", unit: "Weeks", basis: "phase_weeks", rate: 1400 }));

const options: MarkupOptions = {
  staffingRates: [],
  fieldOfficeRates: [],
  feeRate: null,
  insuranceRate: null,
  historyCounts: { both: 4, gc_only: 1, gr_only: 0 },
  grRates,
};

const typedWeeks = (form: PlanForm, construction: string): PlanForm => ({
  ...form,
  weeks: { precon: "0", construction, closeout: "0" },
});

// Since LA-1401 a seed line opens with a blank count, which the estimator
// enters. These tests are about switches, so the estimator has entered one.
const counted = (form: PlanForm): PlanForm => ({
  ...form,
  lines: form.lines.map((line) => (line.quantity === "" ? { ...line, quantity: "1", quantityFrom: TYPED } : line)),
});
const newPlan = (construction = "0") => typedWeeks(counted(withRuleLines(emptyPlanForm(), grRates)), construction);
const pricedIds = (form: PlanForm, answers = planAnswersFromResponses({})) => {
  const priced = pricedPlanOf(form, answers);
  return priced ? priced.lines.map((line) => line.id) : null;
};

describe("a new General Requirements plan opens with its rule lines", () => {
  it("adds one line for each seed row on the rate card, each under its rule", () => {
    const form = withRuleLines(emptyPlanForm(), grRates);
    expect(form.lines).toHaveLength(RULE_SEED_ROWS.length);
    expect(form.lines.every((line) => line.ruleId !== undefined)).toBe(true);
    expect(new Set(form.lines.map((line) => line.ruleId))).toEqual(new Set(["hoisting", "cold_weather", "site_security"]));
  });

  it("opens no line at an invented quantity of one (LA-1401)", () => {
    const [line] = withRuleLines(emptyPlanForm(), grRates).lines;
    expect(line.quantity).toBe("");
    expect(line.quantityFrom.origin).not.toBe("proposed");
  });

  it("leaves a plan that already has lines exactly as it is", () => {
    const own = withRuleLines(emptyPlanForm(), grRates);
    const before = { ...own, lines: own.lines.slice(0, 1) };
    expect(withRuleLines(before, grRates)).toBe(before);
  });

  it("adds nothing when the rate card has none of the rows", () => {
    const form = emptyPlanForm();
    expect(withRuleLines(form, [])).toBe(form);
  });
});

describe("lines follow their rules", () => {
  const byRule = (form: PlanForm, rule: string) => form.lines.filter((line) => line.ruleId === rule);

  it("hoisting comes on for a tall building and shows the fact", () => {
    const form = newPlan("60");
    const hoist = byRule(form, "hoisting")[0];
    const answers = { storiesAboveGrade: HOISTING_MIN_STORIES + 1, grossSquareFeet: 50_000 };
    expect(switchOf(hoist, form, answers)).toMatchObject({ on: true, by: "rule", words: `On: ${HOISTING_MIN_STORIES + 1} stories` });
    expect(switchOf(hoist, form, { ...answers, storiesAboveGrade: 1 })).toMatchObject({ on: false, words: "Off: 1 story" });
  });

  it("follows a changed fact and a changed schedule for a line nobody touched", () => {
    const short = newPlan("20");
    const long = newPlan("60");
    const cold = byRule(short, "cold_weather")[0];
    const answers = { storiesAboveGrade: 1, grossSquareFeet: 10_000 };
    expect(switchOf(cold, short, answers)).toMatchObject({ on: false, unknown: true });
    expect(switchOf(byRule(long, "cold_weather")[0], long, answers)).toMatchObject({ on: true, by: "rule" });
  });

  it("leaves a line unknown, and unpriced, when the schedule has no weeks", () => {
    const form = { ...withRuleLines(emptyPlanForm(), grRates), weeks: { precon: "0", construction: "", closeout: "0" } };
    const cold = byRule(form, "cold_weather")[0];
    expect(switchOf(cold, form, planAnswersFromResponses({}))).toMatchObject({ on: false, unknown: true });
  });

  it("prices only the lines that are on", () => {
    const form = newPlan("60");
    const answers = { storiesAboveGrade: 1, grossSquareFeet: 10_000 };
    const ids = pricedIds(form, answers)!;
    const cold = byRule(form, "cold_weather").map((line) => line.id);
    const hoist = byRule(form, "hoisting").map((line) => line.id);
    expect(cold.every((id) => ids.includes(id))).toBe(true);
    expect(hoist.some((id) => ids.includes(id))).toBe(false);
  });

  it("still prices a plan whose off lines have no quantity or rate", () => {
    const form = newPlan("60");
    const blanked = { ...form, lines: form.lines.map((line) => (line.ruleId === "hoisting" ? { ...line, quantity: "", rate: "" } : line)) };
    expect(pricedPlanOf(blanked, { storiesAboveGrade: 1, grossSquareFeet: 10_000 })).not.toBeNull();
    // Once the rule turns it on, the blank quantity is the estimator's to fill.
    expect(pricedPlanOf(blanked, { storiesAboveGrade: 6, grossSquareFeet: 10_000 })).toBeNull();
  });
});

describe("the estimator's switch wins", () => {
  const answers = { storiesAboveGrade: 1, grossSquareFeet: 10_000 };
  const hoistId = (form: PlanForm) => form.lines.find((line) => line.ruleId === "hoisting")!.id;

  it("a line switched on by hand stays on when the rule says off", () => {
    const form = newPlan("60");
    const id = hoistId(form);
    const switched = setLineSwitch(form, id, "on");
    expect(pricedIds(switched, answers)).toContain(id);
    expect(switchOf(switched.lines.find((l) => l.id === id)!, switched, answers)).toMatchObject({ on: true, by: "estimator", rule: "hoisting" });
  });

  it("a line switched off by hand never comes back on when facts change", () => {
    const form = newPlan("60");
    const id = hoistId(form);
    const off = setLineSwitch(form, id, "off");
    expect(pricedIds(off, { storiesAboveGrade: 12, grossSquareFeet: 400_000 })).not.toContain(id);
    expect(pricedIds(typedWeeks(off, "120"), { storiesAboveGrade: 12, grossSquareFeet: 400_000 })).not.toContain(id);
  });

  it("a reset puts one line, or all of them, back under their rules", () => {
    const form = newPlan("60");
    const id = hoistId(form);
    const off = setLineSwitch(setLineSwitch(form, id, "off"), form.lines[1].id, "off");
    const tall = { storiesAboveGrade: 9, grossSquareFeet: 10_000 };
    expect(pricedIds(resetLineSwitch(off, id), tall)).toContain(id);
    expect(resetAllLineSwitches(off).lines.every((line) => line.manual === undefined)).toBe(true);
  });
});

describe("what saves, reopens and prices in a saved run", () => {
  const answers = { storiesAboveGrade: 1, grossSquareFeet: 10_000 };

  it("saves every line with its switch, and reopens with the hand switches intact", () => {
    const form = newPlan("60");
    const hoist = form.lines.find((line) => line.ruleId === "hoisting")!;
    const chosen = setLineSwitch(form, hoist.id, "on");
    const saved = planFromForm(chosen, answers);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    // The wire check keeps the switches, including a line that is off.
    const parsed = parseResourcePlan(JSON.parse(JSON.stringify(saved.plan)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.lines).toHaveLength(form.lines.length);
    const reopened = planFormFrom(parsed.plan);
    expect(reopened.lines.find((l) => l.id === hoist.id)).toMatchObject({ ruleId: "hoisting", manual: "on" });
    // A line the rule switched, not the estimator, reopens with no hand switch.
    expect(reopened.lines.find((l) => l.ruleId === "cold_weather")?.manual).toBeUndefined();
    // A reopened plan is not opened again with seed lines.
    expect(withRuleLines(reopened, grRates)).toBe(reopened);
  });

  it("records the lines it priced and the ones it did not, each with its rule words", () => {
    const form = newPlan("60");
    const saved = planFromForm(form, { storiesAboveGrade: 6, grossSquareFeet: 10_000 });
    if (!saved.ok) throw new Error(saved.error);
    const hoist = saved.plan.lines.find((line) => line.group === "Hoists, Cranes & Scaffolding")!;
    expect(hoist.switch).toMatchObject({ on: true, by: "rule", rule: "hoisting", words: "On: 6 stories" });
    const short = planFromForm(typedWeeks(form, "20"), { storiesAboveGrade: 6, grossSquareFeet: 10_000 });
    if (!short.ok) throw new Error(short.error);
    const security = short.plan.lines.find((line) => line.group === "Security")!;
    expect(security.switch).toMatchObject({ on: false, by: "rule", rule: "site_security" });
    expect(security.switch?.words).toMatch(/^Off: /);
  });

  it("opens a plan saved before LA-1402 with no switches and prices every line", () => {
    const legacy = parseResourcePlan({
      schedule: { precon: { value: 0 }, construction: { value: 30 }, closeout: { value: 0 } },
      confidence: "high",
      lines: [{ id: "gr-x", label: "Security Guards", group: "Security", basis: "lump_sum", quantity: { value: 1 }, rate: { value: 5000 } }],
    });
    if (!legacy.ok) throw new Error(legacy.error);
    const form = planFormFrom(legacy.plan);
    expect(form.lines[0].ruleId).toBeUndefined();
    expect(pricedIds(form, planAnswersFromResponses({}))).toEqual(["gr-x"]);
  });
});

describe("the form's answers", () => {
  it("reads stories and area from New Budget's responses, and null for a blank one", () => {
    expect(planAnswersFromResponses({ stories_above_grade: "5", gross_square_feet: "120000" })).toEqual({
      storiesAboveGrade: 5,
      grossSquareFeet: 120_000,
    });
    expect(planAnswersFromResponses({ stories_above_grade: "", gross_square_feet: "abc" })).toEqual({
      storiesAboveGrade: null,
      grossSquareFeet: null,
    });
  });
  it("reads them from a saved project's facts", () => {
    expect(planAnswersFromProject({ stories: 3, grossSquareFeet: 40_000 })).toEqual({ storiesAboveGrade: 3, grossSquareFeet: 40_000 });
    expect(planAnswersFromProject(null)).toEqual({ storiesAboveGrade: null, grossSquareFeet: null });
  });
});

describe("the markup form opens a plan with the lines", () => {
  const base = (over: Partial<MarkupForm>): MarkupForm => ({ ...initialMarkupForm(options), ...over });

  it("seeds General Requirements' own plan under Separate Lines, and not General Conditions'", () => {
    const form = withRuleLinesOnForm(base({ setup: "separate", grMethod: "allocated_resources" }), options);
    expect(form.grPlan.lines.length).toBe(RULE_SEED_ROWS.length);
    expect(form.plan.lines).toHaveLength(0);
  });
  it("seeds the one plan under a setup that includes General Requirements, not General Conditions Only", () => {
    expect(withRuleLinesOnForm(base({ setup: "both", method: "allocated_resources" }), options).plan.lines.length).toBe(RULE_SEED_ROWS.length);
    expect(withRuleLinesOnForm(base({ setup: "gr_only", method: "allocated_resources" }), options).plan.lines.length).toBe(RULE_SEED_ROWS.length);
    expect(withRuleLinesOnForm(base({ setup: "gc_only", method: "allocated_resources" }), options).plan.lines).toHaveLength(0);
  });
  it("seeds nothing under a percent method", () => {
    expect(withRuleLinesOnForm(base({ setup: "both", method: "pct_of_subtotal" }), options).plan.lines).toHaveLength(0);
  });
  it("sends the switches with the markups a run records", () => {
    const form = withRuleLinesOnForm(base({ setup: "separate", grMethod: "allocated_resources" }), options);
    const withWeeks = { ...form, grPlan: { ...typedWeeks(counted(form.grPlan), "60"), weeksFrom: form.grPlan.weeksFrom } };
    const sent = markupChoicesFrom(withWeeks, options, { storiesAboveGrade: 6, grossSquareFeet: 10_000 });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    const lines = sent.markups.grResourcePlan!.lines;
    expect(lines.filter((line) => line.switch?.on)).not.toHaveLength(0);
    expect(lines.every((line) => line.switch !== undefined)).toBe(true);
  });
  it("keeps TYPED for a phase the estimator types", () => {
    expect(TYPED.origin).toBe("estimator");
  });
});
