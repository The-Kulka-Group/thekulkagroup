import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  computeRom,
  PARAMETER_NAMES,
  type Benchmark,
  type DataSnapshot,
  type DerivedAssumption,
  type EngineParameters,
  type MarkupChoices,
  type Rom,
} from "@kulka/engine";

import { deriveBuildingForm } from "@/lib/rom/building-form-criterion";
import { publicWording } from "@/lib/rom/derived-assumptions";
import { deriveConstructionType } from "@/lib/rom/construction-type-criterion";
import { deriveElectricalService } from "@/lib/rom/electrical-criterion";
import { deriveElevatorType } from "@/lib/rom/elevator-criterion";
import { deriveFoundation } from "@/lib/rom/foundation-criterion";
import { deriveGlazing, deriveTonnage, glazingBand } from "@/lib/rom/hvac-criterion";
import { deriveJackType } from "@/lib/rom/jack-criterion";
import type { JevClient } from "@/lib/rom/jev";
import { deriveMachineRooms } from "@/lib/rom/machine-room-criterion";

import { headlineOf, tradeBlocks } from "./block-layout";
import { CriterionCard, CriterionPanel, type Criterion } from "./DerivedCriteria";
import { initialMarkupForm, MarkupControls } from "./Markups";
import { BlockPanel, type Drilldown, NotesPanel, TotalPanel } from "./RomPanels";
import { ResourcePlanEditor, ScheduleProposalNote } from "./ResourcePlanEditor";
import {
  emptyPlanForm,
  linesFromGrRate,
  linesFromRateCard,
  RULE_SEED_ROWS,
  setLineSwitch,
  withRuleLines,
} from "./resource-plan-form";

// LA-1333. A budget is a document Kulka hands a developer, so nothing on it
// may read like the inside of the software: no repository path, no internal
// model name, no email address and no engine parameter key. The criteria come
// from the real criterion functions on synthetic facts, so a new criterion or
// a new branch of an old one is checked the moment a fact set reaches it.
// LA-1336 adds the Total, trade detail and notes panels, from a real run.

/** What must never reach a budget screen, each with the reason it failed. */
const LEAKS: [RegExp, string][] = [
  [/docs\//, "a repository path"],
  [/\.md\b/, "a Markdown file name"],
  [/\bjev\b/i, "the internal model's name"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/, "an email address"],
  ...PARAMETER_NAMES.map((name): [RegExp, string] => [
    new RegExp(name.replace(/\./g, "\\.")),
    `the engine parameter ${name}`,
  ]),
];

function leaksIn(html: string): string[] {
  return LEAKS.filter(([pattern]) => pattern.test(html)).map(([pattern, why]) => `${why}: ${html.match(pattern)![0]}`);
}

// Synthetic facts. None of these is a Kulka project.
const gates = ["yes", "no", "dont_know", null] as const;
const framings = ["wood", "metal", null] as const;

function fakeClient(pick: "hydraulic" | "traction", confidence: number): JevClient {
  return { systemOne: async () => ({ model: "test", answers: { pick: { choice: pick, confidence } } }) } as JevClient;
}

async function everyCriterion(): Promise<DerivedAssumption[]> {
  const out: (DerivedAssumption | null)[] = [];
  for (const stories of [1, 4, 6, 9, 14]) {
    for (const framingSystem of framings) {
      out.push(deriveBuildingForm({ grossSquareFeet: 120_000, storiesAboveGrade: stories, buildingCount: 1 }));
      for (const parkingType of ["none", "surface", "structured", "underground", null]) {
        for (const retailStorefronts of gates) {
          out.push(
            deriveConstructionType({
              storiesAboveGrade: stories,
              framingSystem,
              parkingType,
              retailStorefronts,
              grossSquareFeet: 120_000,
              buildingCount: 1,
              zip: "10001",
            }),
          );
        }
      }
      for (const hasTallerGroundFloor of [false, true]) {
        const elevator = { storiesAboveGrade: stories, framingSystem, hasTallerGroundFloor };
        for (const client of [null, fakeClient("hydraulic", 0.9), fakeClient("traction", 0.5)]) {
          out.push((await deriveElevatorType(client, elevator))?.assumption ?? null);
        }
        for (const belowGrade of gates) {
          for (const zip of ["10001", "12401", null]) {
            out.push(deriveJackType({ ...elevator, belowGrade, siteConditions: belowGrade, zip }));
          }
        }
      }
      for (const levelsBelowGrade of gates) {
        for (const constructionKind of ["new", "renovation"] as const) {
          out.push(
            deriveFoundation({
              constructionKind,
              storiesAboveGrade: stories,
              framingSystem,
              parkingType: "structured",
              levelsBelowGrade,
              siteConditions: levelsBelowGrade,
              tieIn: levelsBelowGrade,
              zip: "10001",
            }),
          );
        }
      }
    }
  }
  for (const balconies of gates) {
    for (const storefronts of gates) {
      const glazing = deriveGlazing({ balconies, storefronts });
      out.push(glazing);
      const band = glazing.value.kind === "spec" ? glazingBand(glazing.value.text) : glazingBand("");
      for (const zip of ["10001", "99501", null]) {
        out.push(
          deriveTonnage({
            constructionKind: "new",
            grossSquareFeet: 120_000,
            unitCount: 110,
            zip,
            parkingType: "surface",
            band,
            bandSet: balconies !== null,
          }),
        );
      }
    }
  }
  for (const elevatorCount of [0, 1, 4]) {
    for (const amenityScope of gates) {
      out.push(
        deriveElectricalService({
          constructionKind: "new",
          grossSquareFeet: 120_000,
          unitCount: 110,
          buildingCount: 2,
          amenityScope,
          elevatorCount,
          parkingType: "structured",
        }),
      );
    }
    for (const elevatorType of ["hydraulic", "traction"] as const) {
      for (const jackType of ["in_ground", "holeless", "roped", null] as const) {
        for (const zip of ["10001", "12401", null]) {
          out.push(
            deriveMachineRooms({ elevatorType, typeSettled: true, elevatorCount, buildingCount: 2, jackType, zip }),
          );
        }
      }
    }
  }
  return out.filter((item): item is DerivedAssumption => item !== null);
}

function stored(assumption: DerivedAssumption, correctedBy: string | null): Criterion {
  return {
    ...assumption,
    id: "00000000-0000-4000-8000-0000000000c1",
    correctionId: correctedBy ? "00000000-0000-4000-8000-0000000000c2" : null,
    correction: correctedBy
      ? { value: assumption.value, reason: "Synthetic correction", correctedBy, correctedAt: "2026-09-29T15:00:00.000Z" }
      : null,
  };
}

const noop = () => {};

describe("the copy guard", () => {
  it("catches each kind of leak it is meant to catch", () => {
    expect(leaksIn("(docs/precon/criteria/la-777-hvac-tonnage.md)")).toHaveLength(2);
    expect(leaksIn("Jev picked Hydraulic")).toHaveLength(1);
    expect(leaksIn("recorded by estimator@kulka.invalid")).toHaveLength(1);
    expect(leaksIn("parameter fee.rate")).toHaveLength(1);
    expect(leaksIn("Fee 3.25%, recorded 2026-09-23")).toEqual([]);
  });

  it("finds nothing internal on any Design and Engineering card or its detail", async () => {
    const criteria = await everyCriterion();
    // Every criterion code the engine has, so a new one cannot slip past.
    expect(new Set(criteria.map((item) => item.code))).toEqual(
      new Set(["A-1", "A-2", "E-1", "M-0", "M-1", "S-1", "V-1", "V-2", "V-3"]),
    );

    const found = new Map<string, string[]>();
    for (const assumption of criteria) {
      for (const item of [stored(assumption, null), stored(assumption, "estimator@kulka.invalid")]) {
        const html =
          renderToStaticMarkup(<CriterionCard item={item} />) +
          renderToStaticMarkup(
            <CriterionPanel item={item} busy={false} error={null} onSave={noop} onRevert={noop} onPing={noop} />,
          );
        for (const leak of leaksIn(html)) found.set(`${item.code} ${leak}`, [item.method]);
      }
    }
    expect([...found.keys()]).toEqual([]);
  });

  it("reads a criterion saved before LA-1333 without its path or the model's name", () => {
    // Wording as runs stored it before LA-1333. The stored rows are never rewritten.
    const saved = [
      "NEC 220.84 optional multifamily calculation, one service per building (docs/precon/criteria/la-776-electrical-service-size.md).",
      "Travel sits in the either band; Jev picked Traction from the facts given.",
      "Travel below 35 ft. No Jev client is configured, so V-1 proposes Hydraulic without calling Jev.",
      "Either -- no Jev client configured, proposing Hydraulic",
    ];
    const read = saved.map(publicWording);

    expect(read.flatMap(leaksIn)).toEqual([]);
    expect(read[0]).toBe("NEC 220.84 optional multifamily calculation, one service per building.");
    expect(read[1]).toBe("Travel sits in the either band; picked Traction from the facts given.");
  });

  it("finds nothing internal on the Total, trade detail or notes panels", () => {
    const rom = recordedRun();
    const blocks = tradeBlocks(rom);
    const headline = headlineOf(rom, { grossSquareFeet: 100_000, unitCount: 110 });
    const html = [
      renderToStaticMarkup(<TotalPanel rom={rom} headline={headline} grossSquareFeet={100_000} />),
      renderToStaticMarkup(<NotesPanel rom={rom} blocks={blocks} onOpenBlock={noop} />),
      ...blocks.map((block) =>
        renderToStaticMarkup(<BlockPanel block={block} drilldown={drilldownFor(rom)} grossSquareFeet={100_000} />),
      ),
    ].join("");

    expect(rom.markups?.fee.source).toBe("parameter");
    expect(html).toContain("recorded 2026-09-23");
    expect(html).toContain("by estimator");
    expect(leaksIn(html)).toEqual([]);
  });

  it("finds nothing internal on an Allocated Resources plan, in the Total panel or its editor (LA-1397)", () => {
    const figure = (value: number, origin: "estimator" | "rate_card" | "proposed" | "fact" = "estimator") => ({
      value,
      origin,
      ...(origin === "rate_card" ? { ref: "00000000-0000-4000-8000-0000000000a1", source: "C-00379" } : {}),
      ...(origin === "fact" ? { ref: "grossSquareFeet" } : {}),
    });
    const rom = recordedRun({
      setup: "separate",
      method: "allocated_resources",
      grOverrideRate: 0.02,
      resourcePlan: {
        schedule: { precon: figure(4, "proposed"), construction: figure(60), closeout: figure(4) },
        confidence: "medium",
        lines: [
          { id: "a", label: "Senior Superintendent", group: "Staff", basis: "time", per: "day", daysPerWeek: figure(5), phases: ["construction", "closeout"], quantity: figure(1), rate: figure(1177.6, "rate_card") },
          { id: "b", label: "single wide trailer rental", group: "Field Office", basis: "time", per: "month", phases: ["construction"], quantity: figure(1), rate: figure(800, "rate_card") },
          { id: "c", label: "Final Cleaning", group: "General Expenses", basis: "unit", unit: "SF", quantity: figure(100_000, "fact"), rate: figure(0.25, "proposed") },
          { id: "d", label: "Permits", group: "General Expenses", basis: "lump_sum", quantity: figure(1), rate: figure(5000) },
        ],
      },
    });
    const html = renderToStaticMarkup(
      <TotalPanel rom={rom} headline={headlineOf(rom, { grossSquareFeet: 100_000, unitCount: null })} grossSquareFeet={100_000} />,
    );
    expect(html).toContain("Single Wide Trailer Rental");
    expect(html).toContain("Rate from the rate card, C-00379");
    expect(leaksIn(html)).toEqual([]);

    const options = {
      staffingRates: [
        { id: "s", role: "Senior Superintendent", daysPerWeek: 5, weeklyRateLow: 5888, weeklyRateHigh: 5888, sourceEstimate: "C-00379" },
      ],
      fieldOfficeRates: [],
      feeRate: recordedParameter(0.0325),
      insuranceRate: recordedParameter(0.054),
      historyCounts: { both: 0, gc_only: 0, gr_only: 0 },
    };
    const form = initialMarkupForm(options, rom.markups!.choices);
    const editor = renderToStaticMarkup(
      <ResourcePlanEditor
        options={options}
        plan={{ ...form.plan, lines: [...form.plan.lines, ...linesFromRateCard("staff", "s", options, form.plan.lines)] }}
        onChange={noop}
        disabled={false}
        lineName="General Conditions"
      />,
    );
    expect(editor).toContain("Add Your Own Line");
    expect(leaksIn(editor)).toEqual([]);
  });

  it("finds nothing internal on a General Requirements plan, in the Total panel, Run Settings or its editor (LA-1398)", () => {
    const figure = (value: number, origin: "estimator" | "rate_card" = "estimator") => ({
      value,
      origin,
      ...(origin === "rate_card" ? { ref: "00000000-0000-4000-8000-0000000000b1", source: "C-00379" } : {}),
    });
    const rom = recordedRun({
      setup: "separate",
      method: "pct_of_subtotal",
      overrideRate: 0.05,
      grMethod: "allocated_resources",
      grResourcePlan: {
        schedule: { precon: figure(0), construction: figure(60), closeout: figure(4) },
        confidence: "medium",
        lines: [
          { id: "clean", label: "final cleaning", group: "Construction Labor & Clean-up", basis: "unit", unit: "SF", quantity: figure(100_000), rate: figure(0.55, "rate_card") },
          { id: "john", label: "Port-a-John", group: "Temporary Utilities", basis: "time", per: "month", phases: ["construction"], quantity: figure(4), rate: figure(90, "rate_card") },
        ],
      },
    });
    const html = renderToStaticMarkup(
      <TotalPanel rom={rom} headline={headlineOf(rom, { grossSquareFeet: 100_000, unitCount: null })} grossSquareFeet={100_000} />,
    );
    expect(html).toContain("01 00 00 General Requirements");
    expect(html).toContain("Final Cleaning");
    expect(html).toContain("Rate from the rate card, C-00379");
    expect(leaksIn(html)).toEqual([]);

    const grRate = (id: string, section: string, item: string, rate: number | null, priceable = true) => ({
      id,
      section,
      item,
      unit: "SF",
      basis: "unit" as const,
      phase: null,
      rate,
      jobQuantity: 120_000,
      note: null,
      flaggedFor: null,
      priceable,
      notPriceableReason: priceable ? null : "Fee and insurance are already markups.",
      sourceEstimate: "C-00379",
      sourceJob: "117 N. Long Beach Rd, one 120,000 SF warehouse",
      singleJobWarehouse: true,
    });
    const options = {
      staffingRates: [],
      fieldOfficeRates: [],
      grRates: [
        grRate("00000000-0000-4000-8000-0000000000b1", "Construction Labor & Clean-up", "Final Cleaning", 0.55),
        grRate("00000000-0000-4000-8000-0000000000b2", "Permits, Fees & Expediting", "Building Permit Fee", null),
        grRate("00000000-0000-4000-8000-0000000000b3", "Insurances & Bonds", "Builder's Risk", null, false),
      ],
      feeRate: recordedParameter(0.0325),
      insuranceRate: recordedParameter(0.054),
      historyCounts: { both: 0, gc_only: 0, gr_only: 0 },
    };
    const form = initialMarkupForm(options, rom.markups!.choices);
    const settings = renderToStaticMarkup(<MarkupControls options={options} form={form} onChange={noop} disabled={false} />);
    expect(settings).toContain("General Requirements Method");
    expect(settings).toContain("General Conditions Method");
    expect(settings).not.toContain("Builder&#x27;s Risk</option>");
    expect(leaksIn(settings)).toEqual([]);

    const editor = renderToStaticMarkup(
      <ResourcePlanEditor
        options={options}
        plan={{ ...form.grPlan, lines: [...form.grPlan.lines, ...linesFromGrRate("00000000-0000-4000-8000-0000000000b2", options.grRates, form.grPlan.lines)] }}
        onChange={noop}
        disabled={false}
        lineName="General Requirements"
        kind="gr"
      />,
    );
    expect(editor).toContain("The rate card has no rate for this line, so enter one.");
    expect(editor).toContain("Building Permit Fee, No Rate on the Card");
    expect(editor).not.toContain("Insurances &amp; Bonds");
    expect(leaksIn(editor)).toEqual([]);
  });

  it("reads a Total panel saved before LA-1336 without the parameter key or who recorded it", () => {
    // How a run stored a parameter-priced markup before LA-1336. The stored run is never rewritten.
    const rom = recordedRun();
    const old = "parameter fee.rate, estimator@kulka.invalid 2026-09-23";
    const saved: Rom = {
      ...rom,
      markups: { ...rom.markups!, fee: { ...rom.markups!.fee, basis: `3.25% of subtotal, ${old}` } },
    };
    const html = renderToStaticMarkup(
      <TotalPanel rom={saved} headline={headlineOf(saved, { grossSquareFeet: 100_000, unitCount: null })} grossSquareFeet={100_000} />,
    );

    expect(html).toContain("3.25% of subtotal, recorded 2026-09-23");
    expect(leaksIn(html)).toEqual([]);
  });

  it("finds nothing internal in the proposed schedule (LA-1399)", () => {
    const phase = (weeks: number | null) => ({ weeks, jobNumbers: weeks === null ? [] : ["TEST-0001"], reason: "Scaled." });
    const html = renderToStaticMarkup(
      <ScheduleProposalNote
        schedule={{
          kind: "ready",
          proposal: {
            status: "proposed",
            phases: { precon: phase(12), construction: phase(62), closeout: phase(null) },
            jobs: [{ jobNumber: "TEST-0001", name: "Synthetic Test Job", why: "Same type." }],
            reasoning: "One close job.",
            model: "claude-opus-5",
            proposedAt: "2026-09-29",
            inputKey: "v1-test",
          },
        }}
      />,
    );
    expect(leaksIn(html)).toEqual([]);
    expect(html).not.toContain("claude-opus-5");
  });

  it("finds nothing internal on the rule lines of a General Requirements plan, and shows each rule's words (LA-1402)", () => {
    const grRate = (id: string, section: string, item: string) => ({
      id,
      section,
      item,
      unit: "Weeks",
      basis: "phase_weeks" as const,
      phase: null,
      rate: 1800,
      jobQuantity: null,
      note: null,
      flaggedFor: null,
      priceable: true,
      notPriceableReason: null,
      sourceEstimate: "C-00379",
      sourceJob: "117 N. Long Beach Rd, one 120,000 SF warehouse",
      singleJobWarehouse: true,
    });
    const options = {
      staffingRates: [],
      fieldOfficeRates: [],
      feeRate: recordedParameter(0.0325),
      insuranceRate: recordedParameter(0.054),
      historyCounts: { both: 0, gc_only: 0, gr_only: 0 },
      grRates: RULE_SEED_ROWS.map((seed, i) => grRate(`00000000-0000-4000-8000-00000000c${i}`, seed.section, seed.item)),
    };
    const seeded = withRuleLines({ ...emptyPlanForm(), weeks: { precon: "0", construction: "60", closeout: "0" } }, options.grRates);
    const hand = setLineSwitch(seeded, seeded.lines[0].id, "off");
    const html = renderToStaticMarkup(
      <ResourcePlanEditor
        options={options}
        plan={hand}
        onChange={noop}
        disabled={false}
        lineName="General Requirements"
        kind="gr"
        answers={{ storiesAboveGrade: 6, grossSquareFeet: 10_000 }}
      />,
    );
    expect(html).toContain("Off: switched off by the estimator");
    expect(html).toContain("On: 60 weeks of construction cannot avoid winter");
    expect(html).toContain("Reset to Rule");
    expect(html).toContain("Reset All Lines to Their Rules");
    expect(html).toContain("Switch On");
    expect(leaksIn(html)).toEqual([]);
  });
});

describe("plan quantities from the project's facts (LA-1401)", () => {
  it("shows where each quantity came from, names a missing fact, and finds nothing internal", () => {
    const grRate = (id: string, section: string, item: string, unit: string, basis: "unit" | "phase_weeks", rate: number) => ({
      id,
      section,
      item,
      unit,
      basis,
      phase: null,
      rate,
      jobQuantity: null,
      note: null,
      flaggedFor: null,
      priceable: true,
      notPriceableReason: null,
      sourceEstimate: "C-00379",
      sourceJob: "117 N. Long Beach Rd, one 120,000 SF warehouse",
      singleJobWarehouse: true,
    });
    const grRates = [
      grRate("00000000-0000-4000-8000-0000000000d1", "Construction Labor & Clean-up", "Final Cleaning", "SF", "unit", 0.55),
      grRate("00000000-0000-4000-8000-0000000000d2", "Temporary & OSHA Protection", "Barricades [Exterior]", "Each", "unit", 500),
      grRate("00000000-0000-4000-8000-0000000000d3", "Security", "Security Guards", "Weeks", "phase_weeks", 2600),
      grRate("00000000-0000-4000-8000-0000000000d4", "Temporary & OSHA Protection", "OSHA Protection", "GSF", "unit", 0.45),
    ];
    const options = {
      staffingRates: [],
      fieldOfficeRates: [],
      feeRate: recordedParameter(0.0325),
      insuranceRate: recordedParameter(0.054),
      historyCounts: { both: 0, gc_only: 0, gr_only: 0 },
      grRates,
    };
    let plan = { ...emptyPlanForm(), weeks: { precon: "0", construction: "60", closeout: "0" } };
    for (const rate of grRates) plan = { ...plan, lines: [...plan.lines, ...linesFromGrRate(rate.id, grRates, plan.lines)] };
    // The estimator typed their own OSHA Protection area.
    plan = { ...plan, lines: plan.lines.map((line) => (line.label === "OSHA Protection" ? { ...line, quantity: "90000", quantityFrom: { origin: "estimator" as const } } : line)) };
    const html = renderToStaticMarkup(
      <ResourcePlanEditor
        options={options}
        plan={plan}
        onChange={noop}
        disabled={false}
        lineName="General Requirements"
        kind="gr"
        answers={{ storiesAboveGrade: 6, grossSquareFeet: 120_000 }}
      />,
    );
    expect(html).toContain("Quantity from the project&#x27;s facts: 120,000 SF, the project&#x27;s gross square feet.");
    expect(html).toContain("Enter a quantity: the project has no site perimeter.");
    expect(html).toContain("Enter a count.");
    expect(html).toContain("Runs 60 weeks, the schedule&#x27;s Construction weeks.");
    expect(html).toContain("Quantity from the estimator, in place of the rule.");
    expect(html).toContain("Reset Quantity");
    expect(html).not.toMatch(/gross_area|site_perimeter|quantityRule/);
    expect(leaksIn(html)).toEqual([]);
  });
});

// A run as the engine records it, with every recorder an email address, the
// way a signed-in account records one. Every figure is synthetic.
const RECORDER = "estimator@kulka.invalid";

function recordedParameter(value: number) {
  return {
    value,
    provenance: { kind: "reviewed_judgment" as const, recordedBy: RECORDER, recordedAt: "2026-09-23", reason: "synthetic" },
  };
}

function recordedRun(markups: MarkupChoices = { setup: "both", method: "pct_of_subtotal", overrideRate: 0.08 }): Rom {
  const values: Record<string, number> = {
    "weight.actuals": 5,
    "weight.proest_budget": 1,
    "weight.reviewed_judgment": 0.5,
    "weight.llm_proposal": 0.25,
    "flag.high_min_comparables": 5,
    "flag.medium_min_comparables": 2,
    "spread.high": 0.1,
    "spread.medium": 0.2,
    "spread.low": 0.35,
    "fee.rate": 0.0325,
    "insurance.rate": 0.054,
  };
  const parameters = Object.fromEntries(
    Object.entries(values).map(([name, value]) => [name, recordedParameter(value)]),
  ) as EngineParameters;
  const benchmark = (costCode: string, label: string, value: number, kind: "actuals" | "llm_proposal"): Benchmark => ({
    costCode,
    label,
    unit: "usd_per_gsf",
    value,
    projectType: "multifamily",
    constructionKind: "new",
    provenance: { kind, sourceProjectIds: [], exportLabel: "Synthetic export", recordedBy: RECORDER, recordedAt: "2026-09-01" },
    scopeSide: "building",
    contractSide: "kulka",
  });
  const snapshot: DataSnapshot = {
    benchmarks: [
      benchmark("09-900", "Finishes", 12, "actuals"),
      benchmark("26-100", "Electrical", 25, "llm_proposal"),
      benchmark("11-300", "Appliances", 3, "actuals"),
    ],
    parameters,
    branchGateItems: [],
  };
  return computeRom(
    {
      projectType: "multifamily",
      constructionKind: "new",
      grossSquareFeet: 100_000,
      markups,
    },
    snapshot,
  );
}

function drilldownFor(rom: Rom): Drilldown {
  return {
    phase: "ready",
    byCostCode: Object.fromEntries(
      rom.lines.map((line) => [
        line.costCode,
        {
          costCode: line.costCode,
          label: line.label,
          comparableCount: 1,
          excluded: [],
          framingReason: null,
          signals: [
            {
              kind: "actuals",
              rate: 12,
              weight: 5,
              weightShare: 1,
              exportLabel: "Synthetic export",
              recordedBy: RECORDER,
              recordedAt: "2026-09-01",
              projects: [{ id: "p1", name: "Synthetic past project A" }],
            },
          ],
          judgments: [
            { ruleId: "r1", adjustmentUsdPerGsf: 3, appliedUsdPerGsf: 1.5, weight: 0.5, recordedBy: RECORDER, recordedAt: "2026-09-05" },
          ],
        },
      ]),
    ),
  };
}
