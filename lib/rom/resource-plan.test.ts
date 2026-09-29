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
