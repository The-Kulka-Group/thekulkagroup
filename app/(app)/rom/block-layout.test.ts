import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Markups, MarkupLine, Rom, RomLine } from "@kulka/engine";

import type { RunRecord, RunSummary } from "@/lib/rom/run-records";

import {
  headlineMoney,
  headlineOf,
  headlineRates,
  midpoint,
  perSquareFoot,
  pricedTradesWords,
  tbdScopeWords,
  shortMoney,
  tradeBlocks,
  valueTier,
} from "./block-layout";
import { markupRows } from "./ledger";
import { Block } from "./RomRunner";
import { BlockPanel, TotalPanel } from "./RomPanels";
import { LiveBlock } from "./LiveBudget";
import { loadedRunFrom, runName, savedRunsFor, STRIP_RUNS } from "./saved-runs";
import type { FieldLink } from "./ShareBar";

const noLink: FieldLink = { onEnter: () => {}, onLeave: () => {}, item: null, onItem: () => {} };

// LA-1101. Synthetic lines, labelled as such. None of these is a Kulka cost.

function line(patch: Partial<RomLine> & Pick<RomLine, "costCode" | "low" | "high">): RomLine {
  return {
    label: `Synthetic ${patch.costCode}`,
    confidence: "high",
    heldForReview: false,
    comparableCount: 2,
    comparables: [],
    judgmentAdjustments: [],
    scopeSide: "building",
    contractSide: "kulka",
    detailLevel: null,
    element: null,
    breakoutOf: null,
    buyoutPackage: null,
    gateStatus: null,
    ...patch,
  };
}

function rom(lines: RomLine[], markups?: Markups): Rom {
  const adds = lines.filter((l) => l.breakoutOf === null);
  const total = {
    low: adds.reduce((s, l) => s + l.low, 0),
    high: adds.reduce((s, l) => s + l.high, 0),
  };
  return {
    lines,
    total,
    kulkaContractTotal: total,
    markups,
    carvedOut: { low: 0, high: 0 },
    notInThisJob: [],
    tbdGateItems: [],
    assumedPresentItems: [],
    unpricedItems: [],
    assumptions: [],
    parameters: {} as Rom["parameters"],
  };
}

function markupLine(label: string, low: number, high: number, tbd = false): MarkupLine {
  return { code: null, label, low, high, basis: `${label} basis`, tbd, source: "parameter" };
}

describe("the /rom block layout", () => {
  const lines = [
    line({ costCode: "09 2000", low: 900, high: 1100 }),
    line({ costCode: "26 0000", low: 1800, high: 2200, confidence: "low", heldForReview: true }),
    line({ costCode: "22 0000", low: 450, high: 550, gateStatus: "assumed_present" }),
    line({ costCode: "22 4000", low: 90, high: 110, breakoutOf: "22 0000" }),
    line({ costCode: "31 0000", low: 0, high: 0, gateStatus: "not_in_job" }),
    line({ costCode: "11 3000", low: 80, high: 120, contractSide: "owner" }),
  ];

  it("makes one block per line that adds, biggest first", () => {
    const blocks = tradeBlocks(rom(lines));

    expect(blocks.map((b) => b.costCode)).toEqual(["26 0000", "09 2000", "22 0000", "11 3000"]);
    expect(blocks[0].midpoint).toBe(2000);
    expect(blocks[0].share).toBe(1);
    expect(blocks[1].share).toBe(0.5);
  });

  it("keeps a breakout out of the field and inside its parent", () => {
    const blocks = tradeBlocks(rom(lines));
    const plumbing = blocks.find((b) => b.costCode === "22 0000")!;

    expect(blocks.some((b) => b.costCode === "22 4000")).toBe(false);
    expect(plumbing.breakouts.map((b) => b.costCode)).toEqual(["22 4000"]);
  });

  it("shows a status only where the engine set one", () => {
    const blocks = tradeBlocks(rom(lines));
    const byCode = new Map(blocks.map((b) => [b.costCode, b]));

    expect(byCode.get("26 0000")!.status).toEqual({ tone: "stuck", word: "Held for Review" });
    expect(byCode.get("22 0000")!.status).toEqual({ tone: "working", word: "Assumed Present" });
    expect(byCode.get("09 2000")!.status).toBeNull();
    expect(byCode.get("11 3000")!.ownerDirect).toBe(true);
  });

  // LA-1334: the header is always a total; the line under it says what it holds.
  const markupsOf = (ownerDirect = { low: 0, high: 0 }): Markups => ({
    choices: { setup: "both", method: "pct_of_subtotal" },
    subtotal: markupLine("Subtotal", 3000, 4000),
    generalConditions: markupLine("General Requirements & General Conditions", 0, 0, true),
    fee: markupLine("Fee", 100, 130),
    insurance: markupLine("Insurance", 50, 60),
    total: markupLine("Total", 3150, 4190),
    ownerDirect,
    totalProjectCost: { low: 3150 + ownerDirect.low, high: 4190 + ownerDirect.high },
    assumptions: [],
  });
  const pricedMarkups = (): Markups => ({
    ...markupsOf(),
    generalConditions: markupLine("General Requirements & General Conditions", 200, 260),
  });
  const facts = { grossSquareFeet: 10, unitCount: 2 };

  it("labels a figure without markups Total, and says it is trade cost", () => {
    const live = headlineOf(rom(lines), { ...facts, live: true });
    const saved = headlineOf(rom(lines), facts);

    expect(live.label).toBe("Total");
    expect(live.includes).toBe("trade cost so far");
    expect(saved.label).toBe("Total");
    expect(saved.includes).toBe("trade cost only, before GRs/GCs, fee and insurance");
    expect(live.low).toBe(900 + 1800 + 450 + 80);
    expect(live.midpoint).toBe(midpoint(live));
  });

  it("keeps the label and changes the includes line once markups are answered", () => {
    const before = headlineOf(rom(lines), { ...facts, live: true });
    const after = headlineOf(rom(lines, pricedMarkups()), { ...facts, live: true });

    expect(after.label).toBe(before.label);
    expect(after.includes).toBe("with GRs/GCs, fee and insurance");
    expect(after.includes).not.toBe(before.includes);
  });

  // LA-1369: a TBD markup sits outside the total, so the line must not claim it.
  it("leaves a TBD markup out of the includes line", () => {
    const total = headlineOf(rom(lines, markupsOf()), facts);
    const project = headlineOf(rom(lines, markupsOf({ low: 80, high: 120 })), facts);

    expect(total.includes).toBe("with fee and insurance");
    expect(project.includes).toBe("Kulka's contract with fee and insurance, plus owner-direct scope");
    expect(total.tbd).toEqual(["GRs/GCs"]);
  });

  // LA-1383: General Requirements and General Conditions carried as two lines.
  const separateMarkups = (gr: MarkupLine, gc: MarkupLine): Markups => ({
    ...markupsOf(),
    choices: { setup: "separate", method: "pct_of_subtotal" },
    generalRequirements: { ...gr, code: "01 00 00" },
    generalConditions: { ...gc, code: "90 20 00" },
  });

  it("names each unpriced line apart when the two lines are separate", () => {
    const one = headlineOf(
      rom(lines, separateMarkups(markupLine("General Requirements", 0, 0, true), markupLine("General Conditions", 200, 260))),
      facts,
    );
    const both = headlineOf(
      rom(lines, separateMarkups(markupLine("General Requirements", 0, 0, true), markupLine("General Conditions", 0, 0, true))),
      facts,
    );

    expect(one.tbd).toEqual(["General Requirements"]);
    expect(one.includes).toBe("with General Conditions, fee and insurance");
    expect(both.tbd).toEqual(["General Requirements", "General Conditions"]);
    expect(both.includes).toBe("with fee and insurance");
  });

  it("lists both lines in the Total panel and the Ledger's markup rows", () => {
    const markups = separateMarkups(markupLine("General Requirements", 90, 110), markupLine("General Conditions", 200, 260));
    const run = rom(lines, markups);
    const headline = headlineOf(run, facts);

    expect(headline.includes).toBe("with General Requirements, General Conditions, fee and insurance");
    const html = renderToStaticMarkup(createElement(TotalPanel, { rom: run, headline, grossSquareFeet: 10 }));
    expect(html).toContain("01 00 00 General Requirements");
    expect(html).toContain("90 20 00 General Conditions");
    expect(markupRows(run).map((row) => [row.key, row.label, row.amount])).toEqual([
      ["gr", "General Requirements", 100],
      ["gc", "General Conditions", 230],
      ["fee", "Fee", 115],
      ["ins", "Insurance", 55],
    ]);
  });

  it("keeps a combined setup to one GRs/GCs row", () => {
    expect(markupRows(rom(lines, pricedMarkups())).map((row) => row.label)).toEqual(["GRs/GCs", "Fee", "Insurance"]);
  });

  it("labels a figure with owner-direct scope Total project cost", () => {
    const headline = headlineOf(rom(lines, markupsOf({ low: 80, high: 120 })), facts);

    expect(headline.label).toBe("Total project cost");
    expect(headline.includes).toContain("plus owner-direct scope");
    expect(headline.low).toBe(3230);
  });

  it("heads a run with markups with the total, and names a TBD markup", () => {
    const markups = markupsOf();
    const headline = headlineOf(rom(lines, markups), { grossSquareFeet: 1000, unitCount: null });

    expect(headline.label).toBe("Total");
    expect(headline.low).toBe(3150);
    expect(headline.high).toBe(4190);
    expect(headline.tbd).toEqual(["GRs/GCs"]);

    const html = renderToStaticMarkup(
      createElement(TotalPanel, { rom: rom(lines, markups), headline, grossSquareFeet: 1000 }),
    );
    expect(html).toContain("TBD");
    expect(html).toContain("$3,150 to $4,190");
    expect(html).toContain("1,000 SF");
    expect(html).toContain("no narrower likely band");
  });

  it("puts $/GSF and $/unit on the midpoint", () => {
    const headline = headlineOf(rom(lines, markupsOf()), { grossSquareFeet: 10, unitCount: 2 });

    // A $3,670 midpoint over 10 GSF and 2 units.
    expect(headline.perGrossSquareFoot).toBe(367);
    expect(headline.perUnit).toBe(1835);
    expect(headlineRates(headline)).toBe("$367/GSF · $1.8k/unit");
  });

  it("leaves out $/unit with no unit count, and both rates with no area", () => {
    const noUnits = headlineOf(rom(lines), { grossSquareFeet: 10, unitCount: null });
    expect(noUnits.perUnit).toBeNull();
    expect(headlineRates(noUnits)).toBe(`$${Math.round(noUnits.midpoint / 10)}/GSF`);

    for (const grossSquareFeet of [0, null]) {
      const noArea = headlineOf(rom(lines), { grossSquareFeet, unitCount: null });
      expect(noArea.perGrossSquareFoot).toBeNull();
      expect(headlineRates(noArea)).toBeNull();
    }
    expect(headlineOf(rom(lines), { grossSquareFeet: 10, unitCount: 0 }).perUnit).toBeNull();
  });

  // LA-1337: what the figure leaves out, named, and apart from a TBD markup.
  const tbdItem = (costCode: string, label: string, driverCostCode?: string) => ({
    costCode,
    label,
    question: "Synthetic question",
    ...(driverCostCode ? { driverCostCode } : {}),
  });

  it("names TBD scope apart from a TBD markup, drivers first", () => {
    const withTbd = {
      ...rom(lines, markupsOf()),
      tbdGateItems: [tbdItem("03 3000", "cast-in-place concrete", "31 0000"), tbdItem("31 0000", "sitework")],
    };
    const headline = headlineOf(withTbd, facts);

    expect(headline.tbdScope).toEqual(["Sitework", "Cast-in-Place Concrete"]);
    expect(headline.tbd).toEqual(["GRs/GCs"]);
    expect(tbdScopeWords(headline.tbdScope)).toBe("Excludes 2 TBD: Sitework, Cast-in-Place Concrete");
  });

  it("never lets TBD scope move the figure", () => {
    const plain = headlineOf(rom(lines, markupsOf()), facts);
    const withTbd = headlineOf(
      { ...rom(lines, markupsOf()), tbdGateItems: [tbdItem("31 0000", "Sitework")] },
      facts,
    );

    expect(withTbd.midpoint).toBe(plain.midpoint);
    expect(withTbd.low).toBe(plain.low);
    expect(withTbd.high).toBe(plain.high);
  });

  it("reads TBD scope from the ROM it is given, when New Budget passes one", () => {
    const headline = headlineOf(rom(lines), { ...facts, live: true, tbdScope: [tbdItem("31 0000", "Sitework")] });

    expect(headline.tbdScope).toEqual(["Sitework"]);
    expect(headlineOf(rom(lines), facts).tbdScope).toEqual([]);
  });

  it("counts the trades in the figure, not breakouts or zeroed scope", () => {
    // Four lines add: the breakout and the not-in-job line do not.
    expect(headlineOf(rom(lines), facts).pricedTrades).toBe(4);
    expect(pricedTradesWords(4)).toBe("4 trades priced");
    expect(pricedTradesWords(1)).toBe("1 trade priced");
  });

  it("names three TBD items and counts the rest", () => {
    expect(tbdScopeWords([])).toBeNull();
    expect(tbdScopeWords(["A", "B", "C", "D", "E"])).toBe("Excludes 5 TBD: A, B, C +2 More");
  });

  it("formats the figures the way Round 14 does", () => {
    expect(shortMoney(4_213_000)).toBe("$4.21M");
    expect(shortMoney(640_400)).toBe("$640k");
    expect(shortMoney(8_500)).toBe("$8.5k");
    expect(shortMoney(420)).toBe("$420");
    expect(headlineMoney(41_234_000, { low: 37_000_000, high: 45_000_000 })).toBe("$41.2M");
    expect(headlineMoney(41_234_000, { low: 41_000_000, high: 41_400_000 })).toBe("$41.23M");
    expect(valueTier(1)).toBe("v1");
    expect(valueTier(0.3)).toBe("v2");
    expect(valueTier(0.05)).toBe("v4");
    expect(perSquareFoot(2_000_000, 100_000)).toBe(20);
    expect(perSquareFoot(2_000_000, null)).toBeNull();
  });

  it("draws a block with a name, one figure, a bar, and the status word", () => {
    const block = tradeBlocks(rom(lines))[0];
    const html = renderToStaticMarkup(createElement(Block, { block, selected: false, onOpen: vi.fn() }));

    expect(html).toContain("Synthetic 26 0000");
    expect(html).toContain("$2k");
    expect(html).toContain("Held for Review");
    expect(html).toContain("scaleX(1.0000)");
    expect(html).toContain('aria-pressed="false"');
  });

  it("puts a raw benchmark label in title case on a saved and a live single block", () => {
    const raw = lines.filter((l) => l.costCode !== "26 0000").concat([
      { ...lines[0], costCode: "22 0100", label: "plumbing rough-in" },
    ]);
    const block = tradeBlocks(rom(raw)).find((b) => b.costCode === "22 0100")!;

    const saved = renderToStaticMarkup(createElement(Block, { block, selected: false, onOpen: vi.fn() }));
    expect(saved).not.toContain("plumbing rough-in");
    expect(saved).toContain("Plumbing Rough-in");

    const live = renderToStaticMarkup(
      createElement(LiveBlock, {
        entryKey: block.costCode,
        block,
        waiting: false,
        selected: false,
        rollDelay: 0,
        link: noLink,
        onSelect: vi.fn(),
        register: () => {},
      }),
    );
    expect(live).not.toContain("plumbing rough-in");
    expect(live).toContain("Plumbing Rough-in");
  });

  it("names the jobs behind a block in its panel", () => {
    const block = tradeBlocks(rom(lines)).find((b) => b.costCode === "09 2000")!;
    const html = renderToStaticMarkup(
      createElement(BlockPanel, {
        block,
        grossSquareFeet: 100,
        drilldown: {
          phase: "ready",
          byCostCode: {
            "09 2000": {
              costCode: "09 2000",
              label: block.label,
              comparableCount: 1,
              judgments: [],
              excluded: [],
              framingReason: null,
              signals: [
                {
                  kind: "actuals",
                  rate: 10,
                  weight: 1,
                  weightShare: 1,
                  exportLabel: "Synthetic export",
                  recordedBy: "test",
                  recordedAt: "2026-09-01",
                  projects: [{ id: "p1", name: "Synthetic past project A" }],
                },
              ],
            },
          },
        },
      }),
    );

    expect(html).toContain("Synthetic past project A");
    expect(html).toContain("$10.00/SF");
    expect(html).toContain("Synthetic export");
    // The block's own rate: a $1,000 midpoint on 100 SF.
    expect(html).toContain("$10.00/SF</b> on");
  });
});

describe("the saved-runs strip", () => {
  const summary = (
    id: string,
    projectId: string,
    status: RunSummary["status"],
    startedAt = "2026-09-25T15:00:00.000Z",
  ): RunSummary => ({
    id,
    projectId,
    projectName: "Synthetic project",
    skill: "rom",
    status,
    startedAt,
    finishedAt: null,
    error: null,
    stepCount: 5,
    answerCount: null,
  });

  it("lists only this project's finished runs, newest first, capped", () => {
    const runs = [
      summary("a", "p1", "succeeded"),
      summary("b", "p2", "succeeded"),
      summary("c", "p1", "failed"),
      // An hour apart, so none of them is part of a burst.
      ...Array.from({ length: 12 }, (_, i) =>
        summary(`d${i}`, "p1", "succeeded", new Date(Date.parse("2026-09-25T14:00:00.000Z") - i * 3_600_000).toISOString()),
      ),
    ];
    const saved = savedRunsFor(runs, "p1");

    expect(saved[0].id).toBe("a");
    expect(saved).toHaveLength(STRIP_RUNS);
    expect(saved.every((run) => run.projectId === "p1" && run.status === "succeeded")).toBe(true);
    expect(savedRunsFor(runs, undefined)).toEqual([]);
  });

  it("shows only the last run of a burst of edits, and keeps runs further apart", () => {
    // Newest first, as the runs route returns them.
    const runs = [
      summary("burst-3", "p1", "succeeded", "2026-09-28T04:10:50.000Z"),
      summary("burst-2", "p1", "succeeded", "2026-09-28T04:10:20.000Z"),
      summary("burst-1", "p1", "succeeded", "2026-09-28T04:09:05.000Z"),
      summary("earlier", "p1", "succeeded", "2026-09-28T03:30:00.000Z"),
    ];
    expect(savedRunsFor(runs, "p1").map((run) => run.id)).toEqual(["burst-3", "earlier"]);
  });

  it("names a run by when it ran and how many questions it answered, never by its id", () => {
    // 2026-09-29 03:55 UTC is 11:55 PM on Sep 28 in New York.
    expect(runName("2026-09-29T03:55:00.000Z", 14)).toBe("Sep 28, 11:55 PM · 14 answers");
    expect(runName("2026-09-29T03:55:00.000Z", 1)).toBe("Sep 28, 11:55 PM · 1 answer");
    expect(runName("2026-09-29T03:55:00.000Z", null)).toBe("Sep 28, 11:55 PM");
  });

  it("loads a run with its area, and refuses one with no ROM", () => {
    const record = {
      ...summary("a", "p1", "succeeded"),
      answers: { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 100_000 },
      rom: rom(lines()),
      snapshotHash: null,
      steps: [],
    } as unknown as RunRecord;

    expect(loadedRunFrom(record)?.grossSquareFeet).toBe(100_000);
    expect(loadedRunFrom(record)?.unitCount).toBeNull();
    const withUnits = { ...record, answers: { ...record.answers, facts: { unitCount: 120 } } } as RunRecord;
    expect(loadedRunFrom(withUnits)?.unitCount).toBe(120);
    expect(loadedRunFrom({ ...record, rom: null })).toBeNull();

    function lines(): RomLine[] {
      return [line({ costCode: "09 2000", low: 900, high: 1100 })];
    }
  });
});
