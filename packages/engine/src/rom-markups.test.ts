import { describe, expect, it } from "vitest";

import type { ResourcePlan } from "./resource-plan";
import { computeRom, type Benchmark, type ConfidenceFlag, type EngineParameters } from "./rom";
import {
  computeMarkups,
  overheadLines,
  WEEKS_PER_MONTH,
  type FieldOfficeRate,
  type MarkupChoices,
  type MarkupHistoryRow,
  type MarkupInputs,
  type StaffingRate,
} from "./rom-markups";

// LA-1016: the waterfall below the trade subtotal. The rates and history rows
// here are synthetic, except where a case names Matt's stated fee and
// insurance rates to check the arithmetic reads them the way he stated them.

function parameter(value: number) {
  return {
    value,
    provenance: {
      kind: "reviewed_judgment" as const,
      recordedBy: "automated test",
      recordedAt: "2026-09-23",
      reason: "synthetic",
    },
  };
}

function history(over: Partial<MarkupHistoryRow> = {}): MarkupHistoryRow {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    projectName: "Jefferson's Ferry",
    setup: "both",
    usdPerGsf: 20,
    pctOfSubtotal: 0.1573,
    exportLabel: "synthetic export",
    recordedBy: "automated test",
    recordedAt: "2026-09-23",
    ...over,
  };
}

const STAFF: StaffingRate[] = [
  { id: "s-pm", role: "Project Manager", daysPerWeek: 5, weeklyRateLow: 5200, weeklyRateHigh: 5200, sourceEstimate: "C-00379" },
  { id: "s-spm", role: "Sr. Project Manager", daysPerWeek: 2, weeklyRateLow: 2600, weeklyRateHigh: 2615.2, sourceEstimate: "C-00379" },
];

const OFFICE: FieldOfficeRate[] = [
  { id: "f-trailer", category: "trailer_rental", item: "Single wide", rateBasis: "monthly", rate: 800, recurringRate: null, sourceEstimate: "C-00379" },
  { id: "f-sign", category: "general_field", item: "Project ID sign", rateBasis: "lump_sum", rate: 2500, recurringRate: null, sourceEstimate: "C-00379" },
  { id: "f-gator", category: "general_field", item: "Gators", rateBasis: "each", rate: 10000, recurringRate: null, sourceEstimate: "C-00379" },
  { id: "f-power", category: "office_setup", item: "Electric connect", rateBasis: "lump_sum_then_monthly", rate: 500, recurringRate: 175, sourceEstimate: "C-00379" },
];

function inputs(over: Partial<MarkupInputs> & { choices?: MarkupChoices } = {}): MarkupInputs {
  return {
    subtotal: { low: 1_000_000, high: 1_200_000 },
    ownerDirect: { low: 0, high: 0 },
    grossSquareFeet: 50_000,
    choices: { setup: "both", method: "pct_of_subtotal" },
    history: [history()],
    staffingRates: STAFF,
    fieldOfficeRates: OFFICE,
    feeParameter: parameter(0.0325),
    insuranceParameter: parameter(0.054),
    ...over,
  };
}

/** The ADR 0004 waterfall, written out once so each case checks against it. */
function waterfall(subtotal: number, gc: number, fee = 0.0325, insurance = 0.054) {
  const feeAmount = Math.round((subtotal + gc) * fee);
  const insuranceAmount = Math.round((subtotal + gc + feeAmount) * insurance);
  return { fee: feeAmount, insurance: insuranceAmount, total: subtotal + gc + feeAmount + insuranceAmount };
}

describe("computeMarkups, percent of subtotal", () => {
  it("prices GRs/GCs off history, then fee on subtotal plus GRs/GCs, then insurance on all of it", () => {
    const m = computeMarkups(inputs());

    expect(m.generalConditions.low).toBe(157_300);
    expect(m.generalConditions.high).toBe(188_760);
    expect(m.generalConditions.basis).toBe("15.73% of subtotal, from 1 job: Jefferson's Ferry");
    expect(m.generalConditions.label).toBe("General Requirements & General Conditions");
    expect(m.generalConditions.code).toBe("90 20 00");

    const low = waterfall(1_000_000, 157_300);
    const high = waterfall(1_200_000, 188_760);
    expect(m.fee.low).toBe(low.fee);
    expect(m.fee.high).toBe(high.fee);
    expect(m.insurance.low).toBe(low.insurance);
    expect(m.insurance.high).toBe(high.insurance);
    expect(m.total.low).toBe(low.total);
    expect(m.total.high).toBe(high.total);
    expect(m.fee.basis).toContain("3.25% of subtotal plus General Requirements & General Conditions");
    expect(m.insurance.basis).toContain("5.40%");
  });

  it("uses the mean of the history rows for the chosen setup and ignores the other setups", () => {
    const m = computeMarkups(
      inputs({
        choices: { setup: "gc_only", method: "pct_of_subtotal" },
        history: [
          history({ setup: "gc_only", pctOfSubtotal: 0.06, projectName: "B job" }),
          history({ setup: "gc_only", pctOfSubtotal: 0.08, projectName: "A job", projectId: "22222222-2222-4222-8222-222222222222" }),
          history({ setup: "both", pctOfSubtotal: 0.5 }),
        ],
      }),
    );

    expect(m.generalConditions.label).toBe("General Conditions");
    expect(m.generalConditions.low).toBe(70_000);
    expect(m.generalConditions.high).toBe(84_000);
    expect(m.generalConditions.basis).toBe("7.00% of subtotal, from 2 jobs: A job, B job");
    expect(m.generalConditions.source).toBe("history");
  });

  it("labels the General Requirements setup", () => {
    const m = computeMarkups(
      inputs({
        choices: { setup: "gr_only", method: "pct_of_subtotal" },
        history: [history({ setup: "gr_only", pctOfSubtotal: 0.03 })],
      }),
    );
    expect(m.generalConditions.label).toBe("General Requirements");
    expect(m.generalConditions.low).toBe(30_000);
  });

  it("uses the user's override over history and says so", () => {
    const m = computeMarkups(inputs({ choices: { setup: "both", method: "pct_of_subtotal", overrideRate: 0.1 } }));

    expect(m.generalConditions.low).toBe(100_000);
    expect(m.generalConditions.high).toBe(120_000);
    expect(m.generalConditions.source).toBe("override");
    expect(m.generalConditions.basis).toBe(
      "10.00% of subtotal, user override (history: 15.73% from 1 job: Jefferson's Ferry)",
    );
  });

  it("shows GRs/GCs as TBD outside the total when no history exists and no override is given", () => {
    const m = computeMarkups(inputs({ history: [] }));

    expect(m.generalConditions.tbd).toBe(true);
    expect(m.generalConditions.low).toBe(0);
    expect(m.generalConditions.high).toBe(0);
    expect(m.generalConditions.source).toBe("none");

    const low = waterfall(1_000_000, 0);
    expect(m.fee.low).toBe(low.fee);
    expect(m.total.low).toBe(low.total);
    expect(m.fee.basis).not.toContain("General Conditions");
    expect(m.total.basis).toContain("TBD");
    expect(m.assumptions.some((a) => a.includes("TBD and sits outside the total"))).toBe(true);
  });

  it("is TBD rather than borrowing another setup's history", () => {
    const m = computeMarkups(inputs({ choices: { setup: "gc_only", method: "pct_of_subtotal" } }));
    expect(m.generalConditions.tbd).toBe(true);
  });
});

describe("computeMarkups, dollars per GSF", () => {
  it("multiplies the mean history rate by gross square feet, so low and high match", () => {
    const m = computeMarkups(
      inputs({
        choices: { setup: "both", method: "usd_per_gsf" },
        history: [history({ usdPerGsf: 10 }), history({ usdPerGsf: 14, projectName: "Fieldstone" })],
      }),
    );

    expect(m.generalConditions.low).toBe(600_000);
    expect(m.generalConditions.high).toBe(600_000);
    expect(m.generalConditions.basis).toBe(
      "$12.00/GSF × 50,000 GSF, from 2 jobs: Fieldstone, Jefferson's Ferry",
    );
    const low = waterfall(1_000_000, 600_000);
    expect(m.total.low).toBe(low.total);
  });

  it("uses an override rate per GSF", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "gc_only", method: "usd_per_gsf", overrideRate: 8 }, history: [] }),
    );
    expect(m.generalConditions.low).toBe(400_000);
    expect(m.generalConditions.tbd).toBe(false);
    expect(m.generalConditions.basis).toBe("$8.00/GSF × 50,000 GSF, user override");
  });

  it("is TBD with no history and no override", () => {
    const m = computeMarkups(inputs({ choices: { setup: "both", method: "usd_per_gsf" }, history: [] }));
    expect(m.generalConditions.tbd).toBe(true);
  });
});

describe("computeMarkups, staffing and duration", () => {
  it("prices roles by weeks and field-office items by basis, with months at weeks over 4.33", () => {
    const weeks = 52;
    const months = weeks / WEEKS_PER_MONTH;
    const m = computeMarkups(
      inputs({
        history: [],
        choices: {
          setup: "gc_only",
          method: "staffing_duration",
          durationWeeks: weeks,
          staff: [{ rateId: "s-pm" }, { rateId: "s-spm", weeks: 26 }],
          fieldOffice: [
            { rateId: "f-trailer" },
            { rateId: "f-sign" },
            { rateId: "f-gator", quantity: 2 },
            { rateId: "f-power" },
          ],
        },
      }),
    );

    const office = 800 * months + 2500 + 10000 * 2 + (500 + 175 * months);
    expect(m.generalConditions.low).toBe(Math.round(52 * 5200 + 26 * 2600 + office));
    expect(m.generalConditions.high).toBe(Math.round(52 * 5200 + 26 * 2615.2 + office));
    expect(m.generalConditions.source).toBe("staffing");
    expect(m.generalConditions.basis).toContain("2 roles and 4 field-office items over 52 weeks");
    expect(m.generalConditions.basis).toContain("weeks / 4.33");
    expect(m.assumptions.some((a) => a.includes("52 weeks divided by 4.33"))).toBe(true);

    const low = waterfall(1_000_000, m.generalConditions.low);
    expect(m.fee.low).toBe(low.fee);
    expect(m.insurance.low).toBe(low.insurance);
  });

  it("scales with duration: a longer job costs more", () => {
    const choices = (durationWeeks: number): MarkupChoices => ({
      setup: "both",
      method: "staffing_duration",
      durationWeeks,
      staff: [{ rateId: "s-pm" }],
      fieldOffice: [{ rateId: "f-trailer" }],
    });
    const short = computeMarkups(inputs({ choices: choices(40) }));
    const long = computeMarkups(inputs({ choices: choices(60) }));
    expect(long.generalConditions.low).toBeGreaterThan(short.generalConditions.low);
  });

  it("is TBD when nothing was picked, rather than zero", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "both", method: "staffing_duration", durationWeeks: 52 } }),
    );
    expect(m.generalConditions.tbd).toBe(true);
  });

  it("refuses a missing duration and an unknown rate", () => {
    expect(() =>
      computeMarkups(inputs({ choices: { setup: "both", method: "staffing_duration", staff: [{ rateId: "s-pm" }] } })),
    ).toThrow(/duration in weeks/);
    expect(() =>
      computeMarkups(
        inputs({ choices: { setup: "both", method: "staffing_duration", durationWeeks: 10, staff: [{ rateId: "nope" }] } }),
      ),
    ).toThrow(/No staffing rate nope/);
  });
});

describe("computeMarkups, fee and insurance", () => {
  it("uses the user's fee and insurance rates in place of the parameters", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "both", method: "pct_of_subtotal", feeRate: 0.05, insuranceRate: 0.02 } }),
    );
    const low = waterfall(1_000_000, 157_300, 0.05, 0.02);
    expect(m.fee.low).toBe(low.fee);
    expect(m.insurance.low).toBe(low.insurance);
    expect(m.fee.source).toBe("override");
    expect(m.fee.basis).toContain("user override");
  });

  it("names the rate and when it was recorded, never the parameter key or who recorded it", () => {
    const m = computeMarkups(inputs());
    expect(m.fee.source).toBe("parameter");
    expect(m.fee.basis).toMatch(/^3\.25% of subtotal plus General Requirements & General Conditions, recorded \d{4}-\d{2}-\d{2}$/);
    expect(m.insurance.basis).toMatch(/, recorded \d{4}-\d{2}-\d{2}$/);
    for (const basis of [m.fee.basis, m.insurance.basis]) {
      expect(basis).not.toMatch(/fee\.rate|insurance\.rate|@/);
    }
  });

  it("refuses to run without a fee rate from either source", () => {
    expect(() => computeMarkups(inputs({ feeParameter: undefined }))).toThrow(/fee\.rate/);
    expect(() => computeMarkups(inputs({ insuranceParameter: undefined }))).toThrow(/insurance\.rate/);
  });

  it("reproduces Jefferson's Ferry's insurance on the running-total basis", () => {
    // 470,404.12 / (8,437,400.67 + 274,263.95) is the stated 5.40 percent.
    const m = computeMarkups(
      inputs({
        subtotal: { low: 8_437_401, high: 8_437_401 },
        history: [],
      }),
    );
    expect(Math.abs(m.fee.low - 274_264) / 274_264).toBeLessThan(0.001);
    expect(Math.abs(m.insurance.low - 470_404) / 470_404).toBeLessThan(0.001);
  });
});

describe("computeRom with markups", () => {
  const benchmark = (costCode: string, value: number, contractSide: "kulka" | "owner"): Benchmark => ({
    costCode,
    label: costCode,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: {
      kind: "actuals",
      sourceProjectIds: ["11111111-1111-4111-8111-111111111111"],
      exportLabel: "synthetic export",
      recordedBy: "automated test",
      recordedAt: "2026-08-27",
    },
    scopeSide: "building",
    contractSide,
  });

  const parameters: EngineParameters = {
    "weight.actuals": parameter(5),
    "weight.proest_budget": parameter(1),
    "weight.reviewed_judgment": parameter(2),
    "weight.llm_proposal": parameter(0.5),
    "flag.high_min_comparables": parameter(5),
    "flag.medium_min_comparables": parameter(2),
    "spread.high": parameter(0.1),
    "spread.medium": parameter(0.2),
    "spread.low": parameter(0.35),
    "fee.rate": parameter(0.0325),
    "insurance.rate": parameter(0.054),
  };

  const snapshot = {
    benchmarks: [benchmark("03", 100, "kulka"), benchmark("11", 10, "owner")],
    parameters,
    markupHistory: [history()],
  };

  it("keeps owner-direct lines out of the markup base and adds them back in total project cost", () => {
    const rom = computeRom(
      {
        projectType: "multifamily",
        constructionKind: "new",
        grossSquareFeet: 1000,
        markups: { setup: "both", method: "pct_of_subtotal" },
      },
      snapshot,
    );

    const m = rom.markups!;
    expect(m.subtotal.low).toBe(rom.kulkaContractTotal.low);
    expect(m.subtotal.high).toBe(rom.kulkaContractTotal.high);
    const owner = rom.lines.find((l) => l.contractSide === "owner")!;
    expect(m.ownerDirect).toEqual({ low: owner.low, high: owner.high });
    expect(m.generalConditions.low).toBe(Math.round(rom.kulkaContractTotal.low * 0.1573));
    expect(m.totalProjectCost.low).toBe(m.total.low + owner.low);
    // `total` still means trade cost, so the closing comparison reads what it always read.
    expect(rom.total.low).toBe(rom.kulkaContractTotal.low + owner.low);
    expect(rom.assumptions.some((a) => a.includes("ADR 0004 waterfall"))).toBe(true);
  });

  it("carries no markups when the answers name none", () => {
    const rom = computeRom(
      { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 1000 },
      snapshot,
    );
    expect(rom.markups).toBeUndefined();
  });
});

// LA-1383: General Requirements and General Conditions carried as two lines,
// the way Villa at Glen Cove files them. The rates are synthetic.
describe("computeMarkups, separate lines", () => {
  const VILLA = "22222222-2222-4222-8222-222222222222";
  const gr = history({ projectId: VILLA, projectName: "Villa at Glen Cove", setup: "gr_only", pctOfSubtotal: 0.03, usdPerGsf: 4 });
  const gc = history({ projectId: VILLA, projectName: "Villa at Glen Cove", setup: "gc_only", pctOfSubtotal: 0.1, usdPerGsf: 12 });
  const separate = (over: Partial<MarkupChoices> = {}): MarkupChoices => ({
    setup: "separate",
    method: "pct_of_subtotal",
    ...over,
  });

  it("puts General Requirements inside trade cost and rates General Conditions, fee and insurance on top of it", () => {
    const m = computeMarkups(inputs({ choices: separate(), history: [gr, gc, history()] }));

    expect(m.generalRequirements).toMatchObject({
      code: "01 00 00",
      label: "General Requirements",
      low: 30_000,
      high: 36_000,
      tbd: false,
      source: "history",
      basis: "3.00% of subtotal, from 1 job: Villa at Glen Cove",
    });
    expect(m.generalConditions).toMatchObject({
      code: "90 20 00",
      label: "General Conditions",
      low: 103_000,
      high: 123_600,
      tbd: false,
      basis: "10.00% of subtotal plus General Requirements, from 1 job: Villa at Glen Cove",
    });

    const low = waterfall(1_030_000, 103_000);
    const high = waterfall(1_236_000, 123_600);
    expect([m.fee.low, m.insurance.low, m.total.low]).toEqual([low.fee, low.insurance, low.total]);
    expect([m.fee.high, m.insurance.high, m.total.high]).toEqual([high.fee, high.insurance, high.total]);
    expect(m.fee.basis).toBe("3.25% of subtotal plus General Requirements and General Conditions, recorded 2026-09-23");
    expect(m.total.basis).toBe("Kulka's contract with every markup above");
  });

  it("leaves General Requirements TBD on its own and rates General Conditions on the subtotal alone", () => {
    const m = computeMarkups(inputs({ choices: separate(), history: [gc] }));

    expect(m.generalRequirements?.tbd).toBe(true);
    expect([m.generalRequirements?.low, m.generalRequirements?.high]).toEqual([0, 0]);
    expect([m.generalConditions.low, m.generalConditions.high]).toEqual([100_000, 120_000]);
    expect(m.total.low).toBe(waterfall(1_000_000, 100_000).total);
    expect(m.total.basis).toBe(
      "Kulka's contract with General Conditions, fee and insurance; General Requirements is TBD and not in it",
    );
    expect(m.assumptions[0]).toMatch(/^General Requirements is TBD and sits outside the total/);
  });

  it("leaves General Conditions TBD on its own while General Requirements still prices", () => {
    const m = computeMarkups(inputs({ choices: separate(), history: [gr] }));

    expect(m.generalRequirements?.tbd).toBe(false);
    expect(m.generalConditions.tbd).toBe(true);
    expect(m.total.low).toBe(waterfall(1_030_000, 0).total);
    expect(m.fee.basis).toBe("3.25% of subtotal plus General Requirements, recorded 2026-09-23");
    expect(m.total.basis).toBe(
      "Kulka's contract with General Requirements, fee and insurance; General Conditions is TBD and not in it",
    );
  });

  it("never divides a combined figure: with only combined history, both lines are TBD", () => {
    const m = computeMarkups(inputs({ choices: separate(), history: [history({ setup: "both" })] }));

    expect(m.generalRequirements?.tbd).toBe(true);
    expect(m.generalConditions.tbd).toBe(true);
    expect(m.total.low).toBe(waterfall(1_000_000, 0).total);
    expect(m.total.basis).toBe(
      "Kulka's contract with fee and insurance; General Requirements and General Conditions are TBD and not in it",
    );
    expect(m.assumptions.filter((a) => a.includes("is TBD and sits outside the total"))).toHaveLength(2);
  });

  it("prices each line from its own override", () => {
    const m = computeMarkups(inputs({ choices: separate({ grOverrideRate: 0.02, overrideRate: 0.08 }), history: [] }));

    expect([m.generalRequirements?.low, m.generalRequirements?.source]).toEqual([20_000, "override"]);
    expect([m.generalConditions.low, m.generalConditions.source]).toEqual([81_600, "override"]);
    expect(m.generalConditions.basis).toBe("8.00% of subtotal plus General Requirements, user override");
  });

  it("prices each line per GSF", () => {
    const m = computeMarkups(inputs({ choices: separate({ method: "usd_per_gsf" }), history: [gr, gc] }));

    expect([m.generalRequirements?.low, m.generalRequirements?.high]).toEqual([200_000, 200_000]);
    expect([m.generalConditions.low, m.generalConditions.high]).toEqual([600_000, 600_000]);
    expect(m.total.low).toBe(waterfall(1_200_000, 600_000).total);
  });

  it("prices General Conditions from staffing and General Requirements as a percent beside it", () => {
    const m = computeMarkups(
      inputs({
        choices: separate({ method: "staffing_duration", durationWeeks: 10, staff: [{ rateId: "s-pm" }] }),
        history: [gr],
      }),
    );

    expect(m.generalRequirements?.low).toBe(30_000);
    expect([m.generalConditions.low, m.generalConditions.source]).toEqual([52_000, "staffing"]);
  });

  it("refuses a General Requirements rate outside the separate setup, and a percent of one or more", () => {
    expect(() => computeMarkups(inputs({ choices: { setup: "both", method: "pct_of_subtotal", grOverrideRate: 0.02 } }))).toThrow(
      "only when the two lines are carried separately",
    );
    expect(() => computeMarkups(inputs({ choices: separate({ grOverrideRate: 1 }) }))).toThrow("fraction below one");
  });
});

describe("overheadLines", () => {
  it("lists the one GRs/GCs line for a combined setup and a stored run", () => {
    const m = computeMarkups(inputs());
    expect(overheadLines(m).map(({ key, name }) => [key, name])).toEqual([["gc", "GRs/GCs"]]);
  });

  it("lists General Requirements then General Conditions for separate lines", () => {
    const m = computeMarkups(inputs({ choices: { setup: "separate", method: "pct_of_subtotal" }, history: [] }));
    expect(overheadLines(m).map(({ key, name }) => [key, name])).toEqual([
      ["gr", "General Requirements"],
      ["gc", "General Conditions"],
    ]);
  });
});

// LA-1397: Allocated Resources. The plan's total enters the ADR 0004 waterfall
// where the percent method's figure would, at a range around it.
describe("computeMarkups, allocated resources", () => {
  const typed = (value: number) => ({ value, origin: "estimator" as const });
  const spreadParameters = { high: parameter(0.1), medium: parameter(0.2), low: parameter(0.35) };
  // $1,000 a day, 5 days, 40 weeks = $200,000; one $10,000 lump sum; 1,000 SF at $5.
  const plan = (confidence: ConfidenceFlag = "high"): ResourcePlan => ({
    schedule: { precon: typed(0), construction: typed(40), closeout: typed(0) },
    confidence,
    lines: [
      { id: "sup", label: "Superintendent", group: "Staff", basis: "time", per: "day", daysPerWeek: typed(5), phases: ["construction"], quantity: typed(1), rate: typed(1000) },
      { id: "permit", label: "Permits", group: "General Expenses", basis: "lump_sum", quantity: typed(1), rate: typed(10_000) },
      { id: "clean", label: "Final Cleaning", group: "General Expenses", basis: "unit", unit: "SF", quantity: typed(1000), rate: typed(5) },
    ],
  });
  const allocated = (over: Partial<MarkupChoices> = {}): MarkupChoices => ({
    setup: "gc_only",
    method: "allocated_resources",
    resourcePlan: plan(),
    ...over,
  });

  it("prices the plan and runs fee and insurance on top of it, in the ADR 0004 order", () => {
    const m = computeMarkups(inputs({ history: [], spreadParameters, choices: allocated() }));

    expect(m.generalConditions).toMatchObject({
      code: "90 20 00",
      label: "General Conditions",
      low: 193_500,
      high: 236_500,
      tbd: false,
      source: "allocated",
    });
    expect(m.generalConditions.plan?.total).toBe(215_000);
    expect(m.generalConditions.basis).toContain("3 lines over 40 weeks");
    expect(m.generalConditions.basis).toContain("high confidence");

    const low = waterfall(1_000_000, m.generalConditions.low);
    const high = waterfall(1_200_000, m.generalConditions.high);
    expect([m.fee.low, m.insurance.low, m.total.low]).toEqual([low.fee, low.insurance, low.total]);
    expect([m.fee.high, m.insurance.high, m.total.high]).toEqual([high.fee, high.insurance, high.total]);
  });

  it("widens the range at a lower confidence and keeps the same figure in the middle", () => {
    const m = computeMarkups(inputs({ history: [], spreadParameters, choices: allocated({ resourcePlan: plan("low") }) }));
    expect([m.generalConditions.low, m.generalConditions.high]).toEqual([Math.round(215_000 * 0.65), Math.round(215_000 * 1.35)]);
  });

  it("does not move with the subtotal the way a percent does", () => {
    const small = computeMarkups(inputs({ spreadParameters, choices: allocated(), subtotal: { low: 500_000, high: 500_000 } }));
    const large = computeMarkups(inputs({ spreadParameters, choices: allocated(), subtotal: { low: 5_000_000, high: 5_000_000 } }));
    expect(large.generalConditions.low).toBe(small.generalConditions.low);
  });

  it("prices the one line of the combined setup, and names it GRs/GCs", () => {
    const m = computeMarkups(inputs({ spreadParameters, choices: allocated({ setup: "both" }) }));
    expect(m.generalConditions.label).toBe("General Requirements & General Conditions");
    expect(m.generalConditions.plan?.total).toBe(215_000);
  });

  it("prices General Conditions from the plan and General Requirements as a percent beside it, under separate lines", () => {
    const m = computeMarkups(
      inputs({ history: [], spreadParameters, choices: allocated({ setup: "separate", grOverrideRate: 0.02 }) }),
    );
    expect(m.generalRequirements).toMatchObject({ low: 20_000, high: 24_000, source: "override" });
    expect(m.generalConditions.plan?.total).toBe(215_000);
    // Fee computes on subtotal, General Requirements and General Conditions.
    expect(m.fee.low).toBe(Math.round((1_000_000 + 20_000 + 215_000 * 0.9) * 0.0325));
  });

  it("is TBD when the plan has no lines, rather than zero", () => {
    const m = computeMarkups(
      inputs({ spreadParameters, choices: allocated({ resourcePlan: { ...plan(), lines: [] } }) }),
    );
    expect(m.generalConditions.tbd).toBe(true);
    expect(m.generalConditions.basis).toBe("No line was added to the Allocated Resources plan");
  });

  it("refuses to run without a plan or without the confidence's spread", () => {
    expect(() => computeMarkups(inputs({ spreadParameters, choices: allocated({ resourcePlan: undefined }) }))).toThrow(
      /needs a resource plan/,
    );
    expect(() => computeMarkups(inputs({ choices: allocated() }))).toThrow(/No engine parameter "spread.high"/);
  });

  it("keeps pricing a run recorded under Staffing and Duration exactly as it was", () => {
    const m = computeMarkups(
      inputs({ choices: { setup: "both", method: "staffing_duration", durationWeeks: 10, staff: [{ rateId: "s-pm" }] } }),
    );
    expect([m.generalConditions.low, m.generalConditions.source]).toEqual([52_000, "staffing"]);
  });

  it("reaches computeRom through the snapshot's spread parameters", () => {
    const rom = computeRom(
      {
        projectType: "multifamily",
        constructionKind: "new",
        grossSquareFeet: 1000,
        markups: allocated({ setup: "both" }),
      },
      {
        benchmarks: [],
        parameters: {
          "weight.actuals": parameter(5),
          "weight.proest_budget": parameter(1),
          "weight.reviewed_judgment": parameter(2),
          "weight.llm_proposal": parameter(0.5),
          "flag.high_min_comparables": parameter(5),
          "flag.medium_min_comparables": parameter(2),
          "fee.rate": parameter(0.0325),
          "insurance.rate": parameter(0.054),
          "spread.high": parameter(0.1),
          "spread.medium": parameter(0.2),
          "spread.low": parameter(0.35),
        } as EngineParameters,
      },
    );
    expect(rom.markups?.generalConditions.low).toBe(193_500);
  });
});

// LA-1398: under Separate Lines, General Requirements picks its own method.
// It stays in Division 01, inside trade cost, so General Conditions, fee and
// insurance compute on top of it whichever way each line is priced.
describe("computeMarkups, a method per line under separate lines", () => {
  const typed = (value: number) => ({ value, origin: "estimator" as const });
  const spreadParameters = { high: parameter(0), medium: parameter(0.2), low: parameter(0.35) };
  const VILLA = "22222222-2222-4222-8222-222222222222";
  const grHistory = history({ projectId: VILLA, projectName: "Villa at Glen Cove", setup: "gr_only", pctOfSubtotal: 0.03, usdPerGsf: 4 });
  const gcHistory = history({ projectId: VILLA, projectName: "Villa at Glen Cove", setup: "gc_only", pctOfSubtotal: 0.1, usdPerGsf: 12 });
  // General Requirements: 40 weeks of a $1,000-a-week laborer, $40,000, and 2,000 SF of cleaning at $5, $10,000.
  const grPlan: ResourcePlan = {
    schedule: { precon: typed(0), construction: typed(40), closeout: typed(0) },
    confidence: "high",
    lines: [
      { id: "lab", label: "Laborers", group: "Construction Labor & Clean-up", basis: "time", per: "week", phases: ["construction"], quantity: typed(1), rate: typed(1000) },
      { id: "clean", label: "Final Cleaning", group: "Construction Labor & Clean-up", basis: "unit", unit: "SF", quantity: typed(2000), rate: typed(5) },
    ],
  };
  // General Conditions: a $2,000-a-week superintendent for 40 weeks, $80,000.
  const gcPlan: ResourcePlan = {
    schedule: { precon: typed(0), construction: typed(40), closeout: typed(0) },
    confidence: "high",
    lines: [{ id: "sup", label: "Superintendent", group: "Staff", basis: "time", per: "week", phases: ["construction"], quantity: typed(1), rate: typed(2000) }],
  };
  const flat = { subtotal: { low: 1_000_000, high: 1_000_000 }, grossSquareFeet: 10_000, history: [grHistory, gcHistory], spreadParameters };

  // Each General Requirements method, and what it prices to on a $1,000,000 subtotal and 10,000 GSF.
  const grMethods = [
    { grMethod: "pct_of_subtotal" as const, gr: 30_000, source: "history" },
    { grMethod: "usd_per_gsf" as const, gr: 40_000, source: "history" },
    { grMethod: "allocated_resources" as const, gr: 50_000, source: "allocated" },
  ];
  // Each General Conditions method, and what it prices to on trade cost including General Requirements.
  const gcMethods = [
    { method: "pct_of_subtotal" as const, gc: (tradeCost: number) => Math.round(tradeCost * 0.1) },
    { method: "usd_per_gsf" as const, gc: () => 120_000 },
    { method: "allocated_resources" as const, gc: () => 80_000 },
  ];

  for (const g of grMethods) {
    for (const c of gcMethods) {
      it(`prices General Requirements by ${g.grMethod} and General Conditions by ${c.method}`, () => {
        const m = computeMarkups(
          inputs({
            ...flat,
            choices: {
              setup: "separate",
              method: c.method,
              grMethod: g.grMethod,
              ...(c.method === "allocated_resources" ? { resourcePlan: gcPlan } : {}),
              ...(g.grMethod === "allocated_resources" ? { grResourcePlan: grPlan } : {}),
            },
          }),
        );
        const tradeCost = 1_000_000 + g.gr;
        const gc = c.gc(tradeCost);
        expect(m.generalRequirements).toMatchObject({ code: "01 00 00", low: g.gr, high: g.gr, source: g.source, tbd: false });
        expect(m.generalConditions).toMatchObject({ code: "90 20 00", low: gc, high: gc, tbd: false });
        const expected = waterfall(tradeCost, gc);
        expect([m.fee.low, m.insurance.low, m.total.low]).toEqual([expected.fee, expected.insurance, expected.total]);
      });
    }
  }

  it("rates a percent General Conditions on the subtotal plus a plan-priced General Requirements", () => {
    const m = computeMarkups(
      inputs({ ...flat, choices: { setup: "separate", method: "pct_of_subtotal", overrideRate: 0.05, grMethod: "allocated_resources", grResourcePlan: grPlan } }),
    );
    expect(m.generalRequirements?.plan?.total).toBe(50_000);
    expect(m.generalConditions.low).toBe(52_500);
    expect(m.generalConditions.basis).toBe("5.00% of subtotal plus General Requirements, user override (history: 10.00% from 1 job: Villa at Glen Cove)");
  });

  it("keeps General Requirements following the old rule when no method of its own is named", () => {
    const perSf = computeMarkups(inputs({ ...flat, choices: { setup: "separate", method: "usd_per_gsf" } }));
    expect(perSf.generalRequirements?.low).toBe(40_000);
    const allocated = computeMarkups(
      inputs({ ...flat, choices: { setup: "separate", method: "allocated_resources", resourcePlan: gcPlan } }),
    );
    expect(allocated.generalRequirements?.low).toBe(30_000);
  });

  it("is TBD when the General Requirements plan has no lines, and General Conditions rates on the subtotal alone", () => {
    const m = computeMarkups(
      inputs({ ...flat, choices: { setup: "separate", method: "pct_of_subtotal", grMethod: "allocated_resources", grResourcePlan: { ...grPlan, lines: [] } } }),
    );
    expect(m.generalRequirements?.tbd).toBe(true);
    expect(m.generalConditions.low).toBe(100_000);
  });

  it("states the monthly conversion once when both lines carry monthly lines", () => {
    const monthly: ResourcePlan = {
      ...grPlan,
      lines: [{ id: "m", label: "Port-a-John", group: "Temporary Utilities", basis: "time", per: "month", phases: ["construction"], quantity: typed(1), rate: typed(90) }],
    };
    const m = computeMarkups(
      inputs({ ...flat, choices: { setup: "separate", method: "allocated_resources", resourcePlan: monthly, grMethod: "allocated_resources", grResourcePlan: monthly } }),
    );
    expect(m.assumptions.filter((one) => one.includes("30.42 days a month"))).toHaveLength(1);
  });

  it("refuses a General Requirements method outside separate lines, a plan-priced one with no plan, and a rate beside a plan", () => {
    expect(() => computeMarkups(inputs({ ...flat, choices: { setup: "both", method: "pct_of_subtotal", grMethod: "usd_per_gsf" } }))).toThrow(
      /General Requirements method applies only/,
    );
    expect(() =>
      computeMarkups(inputs({ ...flat, choices: { setup: "separate", method: "pct_of_subtotal", grMethod: "allocated_resources" } })),
    ).toThrow(/General Requirements plan/);
    expect(() =>
      computeMarkups(
        inputs({ ...flat, choices: { setup: "separate", method: "pct_of_subtotal", grMethod: "allocated_resources", grResourcePlan: grPlan, grOverrideRate: 0.02 } }),
      ),
    ).toThrow(/does not apply/);
    expect(() =>
      computeMarkups(inputs({ ...flat, choices: { setup: "separate", method: "usd_per_gsf", grMethod: "pct_of_subtotal", grOverrideRate: 4 } })),
    ).toThrow(/fraction below one/);
  });
});
