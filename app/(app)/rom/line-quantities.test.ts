import { describe, expect, it } from "vitest";

import type { GrRate } from "@/lib/rom/gr-rates";
import type { MarkupOptions } from "@/lib/rom/markup";
import { priceResourcePlan } from "@kulka/engine";

import { initialMarkupForm, markupChoicesFrom, type MarkupForm } from "./Markups";
import {
  emptyPlanForm,
  linesFromGrRate,
  planFromForm,
  pricedPlanOf,
  quantityOf,
  resetLineQuantity,
  RULE_SEED_ROWS,
  withRuleLines,
  type PlanAnswers,
  type PlanForm,
} from "./resource-plan-form";

// LA-1401: quantities from the project's facts, as the plan form applies
// them. The rules themselves are tested in
// packages/engine/src/quantity-rules.test.ts. Rate card rows carry the real
// C-00379 section and item names, because that is how a line finds its rule;
// rates are the card's.

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

const COLD = "Cold Weather Protection";
const grRates: GrRate[] = [
  row({ id: "hoist-op", section: "Hoists, Cranes & Scaffolding", item: RULE_SEED_ROWS[0].item, unit: "Weeks", basis: "phase_weeks", rate: 1800 }),
  row({ id: "heat-truck", section: COLD, item: RULE_SEED_ROWS[1].item, unit: "Lump Sum", basis: "lump_sum", rate: 3000, jobQuantity: 1 }),
  row({ id: "heat-duct", section: COLD, item: RULE_SEED_ROWS[2].item, unit: "Lump Sum", basis: "lump_sum", rate: 2400, jobQuantity: 1 }),
  row({ id: "guards", section: "Security", item: "Security Guards", unit: "Weeks", basis: "phase_weeks", rate: 2600, jobQuantity: 30 }),
  row({ id: "cams", section: "Site Controls", item: "Webcam - Video, Cameras", unit: "Each", basis: "unit", rate: 4000, jobQuantity: 1 }),
  row({ id: "cell", section: "Site Controls", item: "Webcam - Video, Cellular Service", unit: "Months", basis: "phase_months", phase: "construction", rate: 100 }),
  row({ id: "clean", section: "Construction Labor & Clean-up", item: "Final Cleaning", unit: "SF", basis: "unit", rate: 0.55, jobQuantity: 120_000 }),
  row({ id: "barricades", section: "Temporary & OSHA Protection", item: "Barricades [Exterior]", unit: "Each", basis: "unit", rate: 500, jobQuantity: 30 }),
  row({
    id: "rental",
    section: COLD,
    item: "Heater Type: Indirect Heaters (Ducted), Heaters Required, Total Heater Rental",
    unit: "Months",
    basis: "phase_months",
    rate: 3300,
    jobQuantity: 15,
  }),
];

const big: PlanAnswers = { storiesAboveGrade: 6, grossSquareFeet: 120_000 };
const weeks = (form: PlanForm, construction: string): PlanForm => ({ ...form, weeks: { precon: "0", construction, closeout: "0" } });
const seeded = (construction = "60") => weeks(withRuleLines(emptyPlanForm(), grRates), construction);
const line = (form: PlanForm, item: string) => form.lines.find((one) => one.label === item)!;

describe("a new General Requirements plan opens without invented quantities", () => {
  it("opens no line at a quantity of one it cannot stand behind", () => {
    const form = seeded();
    for (const item of ["Security Guards", RULE_SEED_ROWS[0].item, "Webcam - Video, Cameras"]) {
      expect(line(form, item).quantity).toBe("");
      expect(line(form, item).quantityFrom.origin).not.toBe("proposed");
    }
  });

  it("keeps a lump sum at the card's one lump sum, and says so", () => {
    const truck = line(seeded(), RULE_SEED_ROWS[1].item);
    expect(truck.quantity).toBe("1");
    expect(truck.quantityFrom).toMatchObject({ origin: "rate_card", ref: "heat-truck" });
  });

  it("does not price a plan while a line that is on has no quantity", () => {
    // 120,000 SF switches site security on, so the guards line needs a count.
    expect(pricedPlanOf(seeded(), big)).toBeNull();
  });
});

const planOf = (...ids: string[]): PlanForm => {
  let form = weeks(emptyPlanForm(), "52");
  for (const id of ids) form = { ...form, lines: [...form.lines, ...linesFromGrRate(id, grRates, form.lines)] };
  return form;
};

describe("a line whose quantity follows from the building fills it in", () => {
  it("fills Final Cleaning from the project's gross square feet, and says so", () => {
    const form = planOf("clean");
    const [clean] = form.lines;
    expect(clean.quantityRule).toBe("gross_area");
    expect(quantityOf(clean, form, big)).toEqual({
      text: "120000",
      value: 120_000,
      from: { origin: "fact", ref: "gross_area", source: "120,000 SF, the project's gross square feet" },
      overridden: false,
    });
    expect(pricedPlanOf(form, big)?.total).toBe(66_000);
  });

  it("records the derived quantity, its origin and its rule on the plan it sends", () => {
    const parsed = planFromForm(planOf("clean"), big);
    expect(parsed.ok && parsed.plan.lines[0]).toMatchObject({
      quantityRule: "gross_area",
      quantity: { value: 120_000, origin: "fact", ref: "gross_area", source: "120,000 SF, the project's gross square feet" },
    });
  });

  it("names the missing fact and refuses to price rather than guess", () => {
    const form = planOf("barricades");
    expect(quantityOf(form.lines[0], form, big)).toMatchObject({ text: "", missing: ["Site Perimeter"] });
    expect(planFromForm(form, big)).toEqual({
      ok: false,
      error: "Enter a quantity for Barricades [Exterior]: the project has no site perimeter.",
    });
  });

  it("prices heater rental by the heater-month, as C-00379 does, and leaves it blank without a heat load", () => {
    const form = planOf("rental");
    expect(form.lines[0]).toMatchObject({ basis: "unit", unit: "Heater-Months", quantityRule: "heater_rental" });
    expect(quantityOf(form.lines[0], form, big)).toMatchObject({ text: "", missing: ["Heat Load"] });
  });

  it("gives the webcam service one per camera on the plan", () => {
    let form = planOf("cams", "cell");
    const cell = () => form.lines.find((one) => one.quantityRule === "camera_service")!;
    expect(quantityOf(cell(), form, big, grRates)).toMatchObject({ text: "", missing: ["Camera Count"] });
    form = { ...form, lines: form.lines.map((one) => (one.label === "Webcam - Video, Cameras" ? { ...one, quantity: "3" } : one)) };
    expect(quantityOf(cell(), form, big, grRates)).toMatchObject({ text: "3", from: { origin: "fact", ref: "camera_service" } });
  });

  it("finds the cameras by their rate card row, so renaming the line or retyping its rate keeps the count", () => {
    const base = planOf("cams", "cell");
    const counted = {
      ...base,
      lines: base.lines.map((one) =>
        one.quantityRule === undefined ? { ...one, label: "Site Cameras", quantity: "4" } : one,
      ),
    };
    const cell = counted.lines.find((one) => one.quantityRule === "camera_service")!;
    expect(quantityOf(cell, counted, big, grRates)).toMatchObject({ text: "4" });
    const retyped = {
      ...counted,
      lines: counted.lines.map((one) => (one.label === "Site Cameras" ? { ...one, rate: "4500", rateFrom: { origin: "estimator" as const } } : one)),
    };
    expect(quantityOf(cell, retyped, big, grRates)).toMatchObject({ text: "4" });
    // A line of the estimator's own named like the cameras is not the cameras.
    const own = { ...base, lines: [cell, { ...base.lines[0], id: "own-line", label: "Webcam - Video, Cameras", quantity: "9", rateFrom: { origin: "estimator" as const } }] };
    expect(quantityOf(cell, own, big, grRates)).toMatchObject({ text: "", missing: ["Camera Count"] });
  });
});

describe("the estimator's quantity wins until reset, and a saved run keeps what it priced", () => {
  const options: MarkupOptions = {
    staffingRates: [],
    fieldOfficeRates: [],
    feeRate: null,
    insuranceRate: null,
    historyCounts: { both: 4, gc_only: 1, gr_only: 0 },
    grRates,
  };
  const separate = (grPlan: PlanForm): MarkupForm => ({
    ...initialMarkupForm(options),
    setup: "separate",
    overridePercent: "8",
    grMethod: "allocated_resources",
    grPlan,
  });
  const typed = (form: PlanForm, quantity: string): PlanForm => ({
    ...form,
    lines: form.lines.map((one) => ({ ...one, quantity, quantityFrom: { origin: "estimator" as const } })),
  });

  it("changes a derived quantity when the fact changes", () => {
    const form = planOf("clean");
    expect(quantityOf(form.lines[0], form, { ...big, grossSquareFeet: 80_000 }).text).toBe("80000");
  });

  it("changes a schedule-driven quantity when the weeks change", () => {
    const heat: GrRate = row({
      id: "heat-labor",
      section: COLD,
      item: "Temporary Heat & Protection, Temporary Heat & Prot. - Labor",
      unit: "Man-Days",
      basis: "unit",
      rate: 840,
    });
    let form: PlanForm = { ...weeks(emptyPlanForm(), "4"), lines: linesFromGrRate("heat-labor", [heat], []) };
    const answers = { ...big, constructionStart: "2025-12-01" };
    expect(quantityOf(form.lines[0], form, answers)).toMatchObject({ text: "20", from: { origin: "schedule", ref: "heat_labor" } });
    form = weeks(form, "8");
    expect(quantityOf(form.lines[0], form, answers).text).toBe("40");
  });

  it("keeps the estimator's quantity when the fact changes, and puts the rule back on reset", () => {
    const form = typed(planOf("clean"), "95000");
    expect(quantityOf(form.lines[0], form, { ...big, grossSquareFeet: 80_000 })).toMatchObject({ text: "95000", overridden: true });
    const reset = resetLineQuantity(form, form.lines[0].id);
    expect(quantityOf(reset.lines[0], reset, { ...big, grossSquareFeet: 80_000 })).toMatchObject({ text: "80000", overridden: false });
  });

  it("saves an override on the project and reopens with it, still under its rule", () => {
    const sent = markupChoicesFrom(separate(typed(planOf("clean"), "95000")), options, big);
    if (!sent.ok) throw new Error(sent.error);
    expect(sent.markups.grResourcePlan?.lines[0]).toMatchObject({ quantityRule: "gross_area", quantity: { value: 95_000, origin: "estimator" } });
    const reopened = initialMarkupForm(options, sent.markups);
    const [clean] = reopened.grPlan.lines;
    expect(quantityOf(clean, reopened.grPlan, { ...big, grossSquareFeet: 80_000 })).toMatchObject({ text: "95000", overridden: true });
    expect(resetLineQuantity(reopened.grPlan, clean.id).lines[0].quantityRule).toBe("gross_area");
  });

  it("reopens a derived quantity following today's facts, while the run keeps the figure it recorded", () => {
    const sent = markupChoicesFrom(separate(planOf("clean")), options, big);
    if (!sent.ok) throw new Error(sent.error);
    const recorded = sent.markups.grResourcePlan!;
    expect(priceResourcePlan(recorded).total).toBe(66_000);

    // The project's area changes after the run.
    const later = { ...big, grossSquareFeet: 80_000 };
    const reopened = initialMarkupForm(options, sent.markups);
    expect(quantityOf(reopened.grPlan.lines[0], reopened.grPlan, later).text).toBe("80000");
    // The recorded plan is unchanged and prices as it did.
    expect(recorded.lines[0].quantity?.value).toBe(120_000);
    expect(priceResourcePlan(recorded).total).toBe(66_000);
  });
});
