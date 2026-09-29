import { describe, expect, it } from "vitest";

import {
  DAYS_PER_MONTH,
  planFromStaffingChoices,
  priceResourcePlan,
  type PlanFigure,
  type PlanLine,
  type ResourcePlan,
} from "./resource-plan";
import type { FieldOfficeRate, StaffingRate } from "./rom-markups";

// LA-1397: Allocated Resources prices a markup line by line, the way Kulka's
// own General Conditions sheet does (estimate C-00379). Every figure here is
// synthetic; the golden test beside this file rebuilds the real sheet.

const typed = (value: number): PlanFigure => ({ value, origin: "estimator" });

function schedule(precon: number, construction: number, closeout: number): ResourcePlan["schedule"] {
  return { precon: typed(precon), construction: typed(construction), closeout: typed(closeout) };
}

/** One line of each basis, with round numbers so the total can be worked by hand. */
function everyBasis(): ResourcePlan {
  const lines: PlanLine[] = [
    // A role: $1,000 a day, 2 days a week, precon and construction (4 + 40 weeks).
    {
      id: "pm",
      label: "Project Manager",
      group: "Staff",
      basis: "time",
      per: "day",
      daysPerWeek: typed(2),
      phases: ["precon", "construction"],
      quantity: typed(1),
      rate: typed(1000),
    },
    // A weekly rate, two of them, over close-out alone (5 weeks).
    {
      id: "laborer",
      label: "Laborer",
      group: "Staff",
      basis: "time",
      per: "week",
      phases: ["closeout"],
      quantity: typed(2),
      rate: typed(1500),
    },
    // A monthly rate over construction: 40 weeks is 280 days, 280 / 30.42 months.
    {
      id: "trailer",
      label: "Trailer",
      group: "Field Office",
      basis: "time",
      per: "month",
      phases: ["construction"],
      quantity: typed(1),
      rate: typed(3042),
    },
    // Its own weeks in place of its phases': 10 weeks at $100 a week.
    {
      id: "hoist",
      label: "Hoist",
      group: "Field Office",
      basis: "time",
      per: "week",
      phases: ["construction"],
      weeks: typed(10),
      quantity: typed(1),
      rate: typed(100),
    },
    // By unit: 50,000 SF at $0.20.
    { id: "clean", label: "Final Cleaning", group: "General Expenses", basis: "unit", unit: "SF", quantity: typed(50_000), rate: typed(0.2) },
    // Lump sums: one permit, three office fit-outs.
    { id: "permit", label: "Permits", group: "General Expenses", basis: "lump_sum", quantity: typed(1), rate: typed(7_500) },
    { id: "fitout", label: "Office Fit-Out", group: "Field Office", basis: "lump_sum", quantity: typed(3), rate: typed(2_000) },
  ];
  return { schedule: schedule(4, 40, 5), lines, confidence: "high" };
}

describe("priceResourcePlan", () => {
  it("prices a plan with every basis to a known total", () => {
    const priced = priceResourcePlan(everyBasis());
    const amounts = Object.fromEntries(priced.lines.map((line) => [line.id, line.amount]));

    expect(amounts.pm).toBe(44 * 2 * 1000);
    expect(amounts.laborer).toBe(2 * 5 * 1500);
    expect(amounts.trailer).toBeCloseTo((280 / DAYS_PER_MONTH) * 3042, 6);
    expect(amounts.hoist).toBe(1000);
    expect(amounts.clean).toBe(10_000);
    expect(amounts.permit).toBe(7_500);
    expect(amounts.fitout).toBe(6_000);

    // 88,000 + 15,000 + 28,000 + 1,000 + 10,000 + 7,500 + 6,000
    expect(priced.total).toBe(155_500);
    expect(priced.groups).toEqual([
      { group: "Staff", amount: 103_000 },
      { group: "Field Office", amount: 35_000 },
      { group: "General Expenses", amount: 17_500 },
    ]);
  });

  it("states each line's quantity, basis and rate in plain words", () => {
    const words = Object.fromEntries(priceResourcePlan(everyBasis()).lines.map((line) => [line.id, line.basisWords]));
    expect(words.pm).toBe("44 weeks × 2 days/week at $1,000/day, Precon and Construction");
    expect(words.laborer).toBe("2 × 5 weeks at $1,500/week, Close-Out");
    expect(words.trailer).toBe("9.2 months at $3,042/month, Construction");
    expect(words.hoist).toBe("10 weeks at $100/week");
    expect(words.clean).toBe("50,000 SF at $0.20/SF");
    expect(words.permit).toBe("Lump Sum $7,500");
    expect(words.fitout).toBe("3 × $2,000 Lump Sum");
  });

  it("follows the schedule: a longer phase costs more on every line priced on it, and nothing else moves", () => {
    const short = priceResourcePlan(everyBasis());
    const plan = everyBasis();
    const long = priceResourcePlan({ ...plan, schedule: { ...plan.schedule, construction: typed(50) } });
    const byId = (priced: typeof short) => Object.fromEntries(priced.lines.map((line) => [line.id, line.amount]));

    expect(byId(long).pm).toBe(54 * 2 * 1000);
    expect(byId(long).trailer).toBeGreaterThan(byId(short).trailer);
    for (const fixed of ["laborer", "hoist", "clean", "permit", "fitout"]) {
      expect(byId(long)[fixed]).toBe(byId(short)[fixed]);
    }
  });

  it("prices a phase of zero weeks at nothing, the way the sheet leaves precon empty", () => {
    const plan = everyBasis();
    const priced = priceResourcePlan({ ...plan, schedule: { ...plan.schedule, precon: typed(0), construction: typed(0) } });
    expect(priced.lines.find((line) => line.id === "pm")!.amount).toBe(0);
  });

  it("refuses a figure it cannot price rather than guessing", () => {
    const plan = everyBasis();
    const withLine = (line: PlanLine): ResourcePlan => ({ ...plan, lines: [line] });
    const pm = plan.lines[0] as Extract<PlanLine, { basis: "time" }>;

    expect(() => priceResourcePlan({ ...plan, schedule: { ...plan.schedule, construction: typed(-1) } })).toThrow(
      /Construction weeks/,
    );
    expect(() => priceResourcePlan(withLine({ ...pm, daysPerWeek: undefined }))).toThrow(/days per week/);
    expect(() => priceResourcePlan(withLine({ ...pm, daysPerWeek: typed(8) }))).toThrow(/days per week/);
    expect(() => priceResourcePlan(withLine({ ...pm, phases: [] }))).toThrow(/phase/);
    expect(() => priceResourcePlan(withLine({ ...pm, quantity: typed(0) }))).toThrow(/quantity/);
    expect(() => priceResourcePlan(withLine({ ...pm, rate: typed(-5) }))).toThrow(/rate/);
    expect(() => priceResourcePlan({ ...plan, lines: [pm, pm] })).toThrow(/twice/);
  });
});

describe("planFromStaffingChoices", () => {
  // A project saved under Staffing and Duration opens as the equivalent plan.
  const staff: StaffingRate[] = [
    { id: "s-pm", role: "Project Manager", daysPerWeek: 5, weeklyRateLow: 5200, weeklyRateHigh: 5200, sourceEstimate: "C-00379" },
    { id: "s-spm", role: "Sr. Project Manager", daysPerWeek: 2, weeklyRateLow: 2600, weeklyRateHigh: 2615.2, sourceEstimate: "C-00379" },
  ];
  const office: FieldOfficeRate[] = [
    { id: "f-trailer", category: "trailer_rental", item: "Single wide", rateBasis: "monthly", rate: 800, recurringRate: null, sourceEstimate: "C-00379" },
    { id: "f-sign", category: "general_field", item: "Project ID sign", rateBasis: "lump_sum", rate: 2500, recurringRate: null, sourceEstimate: "C-00379" },
    { id: "f-gator", category: "general_field", item: "Gators", rateBasis: "each", rate: 10000, recurringRate: null, sourceEstimate: "C-00379" },
    { id: "f-power", category: "office_setup", item: "Electric connect", rateBasis: "lump_sum_then_monthly", rate: 500, recurringRate: 175, sourceEstimate: "C-00379" },
  ];

  it("makes the weeks the construction phase and each role a construction line at its day rate", () => {
    const plan = planFromStaffingChoices(
      {
        durationWeeks: 52,
        staff: [{ rateId: "s-pm" }, { rateId: "s-spm", weeks: 26 }],
        fieldOffice: [{ rateId: "f-trailer" }, { rateId: "f-sign" }, { rateId: "f-gator", quantity: 2 }, { rateId: "f-power" }],
      },
      staff,
      office,
    );

    expect(plan.schedule).toEqual({
      precon: { value: 0, origin: "estimator" },
      construction: { value: 52, origin: "estimator" },
      closeout: { value: 0, origin: "estimator" },
    });
    const priced = priceResourcePlan(plan);
    const byLabel = Object.fromEntries(priced.lines.map((line) => [line.label, line.amount]));
    expect(byLabel["Project Manager"]).toBe(52 * 5200);
    // A role picked for fewer weeks than the job keeps its own weeks.
    expect(byLabel["Sr. Project Manager"]).toBe(26 * 2600);
    expect(byLabel["Project ID sign"]).toBe(2500);
    expect(byLabel.Gators).toBe(20_000);
    expect(byLabel["Electric connect"]).toBe(500);
    expect(byLabel["Electric connect, Monthly Service"]).toBeCloseTo(((52 * 7) / DAYS_PER_MONTH) * 175, 6);

    const pm = plan.lines.find((line) => line.label === "Project Manager")!;
    expect(pm).toMatchObject({ basis: "time", per: "day", phases: ["construction"], group: "Staff" });
    expect(pm.rate).toEqual({ value: 1040, origin: "rate_card", ref: "s-pm", source: "C-00379" });
  });

  it("gives an empty plan when nothing was picked, and skips a rate that no longer exists", () => {
    const plan = planFromStaffingChoices({ durationWeeks: 10, staff: [{ rateId: "gone" }] }, staff, office);
    expect(plan.lines).toEqual([]);
    expect(plan.schedule.construction.value).toBe(10);
  });
});
