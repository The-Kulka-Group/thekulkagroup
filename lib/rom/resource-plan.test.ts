import { describe, expect, it } from "vitest";

import { parseResourcePlan } from "./resource-plan";

// LA-1397: the wire-side check on an Allocated Resources plan. Figures are synthetic.

const figure = (value: number) => ({ value, origin: "estimator" });
const plan = (lines: unknown[]) => ({
  schedule: { precon: figure(0), construction: figure(40), closeout: figure(4) },
  confidence: "high",
  lines,
});
const role = {
  id: "pm",
  label: "Project Manager",
  group: "Staff",
  basis: "time",
  per: "day",
  daysPerWeek: figure(5),
  phases: ["construction"],
  quantity: figure(1),
  rate: figure(1040),
};

describe("parseResourcePlan", () => {
  it("keeps a plan with every basis, and only the fields each basis uses", () => {
    const parsed = parseResourcePlan(
      plan([
        { ...role, unit: "ignored" },
        { id: "clean", label: "Final Cleaning", group: "General Expenses", basis: "unit", unit: "SF", quantity: figure(1000), rate: figure(0.25) },
        { id: "permit", label: "Permits", group: "General Expenses", basis: "lump_sum", per: "day", quantity: figure(1), rate: figure(5000) },
      ]),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.lines[0]).toEqual(role);
    expect(parsed.plan.lines[2]).toEqual({
      id: "permit",
      label: "Permits",
      group: "General Expenses",
      basis: "lump_sum",
      quantity: figure(1),
      rate: figure(5000),
    });
  });

  it("refuses what the engine could not price", () => {
    const bad = [
      plan([{ ...role, daysPerWeek: undefined }]),
      plan([{ ...role, phases: [] }]),
      plan([{ ...role, phases: ["winter"] }]),
      plan([{ ...role, quantity: figure(0) }]),
      plan([{ ...role, rate: { value: 10, origin: "guess" } }]),
      plan([role, role]),
      { ...plan([role]), confidence: "certain" },
      { ...plan([role]), schedule: { precon: figure(-1), construction: figure(1), closeout: figure(1) } },
    ];
    for (const value of bad) expect(parseResourcePlan(value).ok).toBe(false);
  });
});

// LA-1402: a line's switch is kept, and a line switched off may lack a quantity.
describe("parseResourcePlan, line switches", () => {
  const hoist = {
    id: "gr-hoist",
    label: "Materials Hoist",
    group: "Hoists, Cranes & Scaffolding",
    basis: "lump_sum",
    quantity: figure(1),
    rate: figure(25000),
  };
  it("keeps a switch and its rule", () => {
    const sw = { on: true, by: "rule", rule: "hoisting", words: "On: 5 stories" };
    const parsed = parseResourcePlan(plan([{ ...hoist, switch: sw }]));
    expect(parsed.ok && parsed.plan.lines[0].switch).toEqual(sw);
  });
  it("lets a line switched off carry a quantity of zero, and a line switched on not", () => {
    const off = { on: false, by: "rule", rule: "hoisting", words: "Off: 1 story" };
    expect(parseResourcePlan(plan([{ ...hoist, quantity: figure(0), switch: off }])).ok).toBe(true);
    expect(parseResourcePlan(plan([{ ...hoist, quantity: figure(0), switch: { ...off, on: true } }])).ok).toBe(false);
    expect(parseResourcePlan(plan([{ ...hoist, quantity: figure(0) }])).ok).toBe(false);
  });
  it("refuses a switch it cannot read", () => {
    for (const sw of [{ on: "yes", by: "rule", words: "" }, { on: true, by: "robot", words: "" }, { on: true, by: "rule", rule: "made_up", words: "" }]) {
      expect(parseResourcePlan(plan([{ ...hoist, switch: sw }])).ok).toBe(false);
    }
  });
});


// LA-1401: a line's quantity rule is kept, so a project reopens with the line
// still following its rule, and a quantity can say it came from the schedule.
describe("parseResourcePlan, quantity rules", () => {
  const cleaning = {
    id: "gr-clean",
    label: "Final Cleaning",
    group: "Construction Labor & Clean-up",
    basis: "unit",
    unit: "SF",
    quantity: { value: 120_000, origin: "fact", ref: "gross_area", source: "120,000 SF, the project's gross square feet" },
    rate: figure(0.55),
  };

  it("keeps the rule and the quantity's origin", () => {
    const parsed = parseResourcePlan(plan([{ ...cleaning, quantityRule: "gross_area" }]));
    expect(parsed.ok && parsed.plan.lines[0]).toMatchObject({ quantityRule: "gross_area", quantity: cleaning.quantity });
  });

  it("keeps a quantity from the schedule", () => {
    const parsed = parseResourcePlan(plan([{ ...cleaning, quantity: { value: 40, origin: "schedule", ref: "heat_labor" } }]));
    expect(parsed.ok && parsed.plan.lines[0].quantity.origin).toBe("schedule");
  });

  it("refuses a rule it does not know", () => {
    expect(parseResourcePlan(plan([{ ...cleaning, quantityRule: "guesswork" }])).ok).toBe(false);
  });
});
