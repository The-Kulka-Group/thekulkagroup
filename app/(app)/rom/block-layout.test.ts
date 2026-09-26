import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Markups, MarkupLine, Rom, RomLine } from "@kulka/engine";

import type { RunRecord, RunSummary } from "@/lib/rom/run-records";

import {
  headlineMoney,
  headlineOf,
  midpoint,
  perSquareFoot,
  shortMoney,
  tradeBlocks,
  valueTier,
} from "./block-layout";
import { Block } from "./RomRunner";
import { BlockPanel, TotalPanel } from "./RomPanels";
import { loadedRunFrom, savedRunsFor, STRIP_RUNS } from "./saved-runs";

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

    expect(byCode.get("26 0000")!.status).toEqual({ tone: "stuck", word: "Held for review" });
    expect(byCode.get("22 0000")!.status).toEqual({ tone: "working", word: "Assumed present" });
    expect(byCode.get("09 2000")!.status).toBeNull();
    expect(byCode.get("11 3000")!.ownerDirect).toBe(true);
  });

  it("heads a run without markups with trade cost", () => {
    const headline = headlineOf(rom(lines));

    expect(headline.label).toBe("Trade cost");
    expect(headline.low).toBe(900 + 1800 + 450 + 80);
    expect(headline.midpoint).toBe(midpoint(headline));
  });

  it("heads a run with markups with the total, and names a TBD markup", () => {
    const markups: Markups = {
      choices: { setup: "both", method: "pct_of_subtotal" },
      subtotal: markupLine("Subtotal", 3000, 4000),
      generalConditions: markupLine("General Requirements & General Conditions", 0, 0, true),
      fee: markupLine("Fee", 100, 130),
      insurance: markupLine("Insurance", 50, 60),
      total: markupLine("Total", 3150, 4190),
      ownerDirect: { low: 0, high: 0 },
      totalProjectCost: { low: 3150, high: 4190 },
      assumptions: [],
    };
    const headline = headlineOf(rom(lines, markups));

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
    expect(html).toContain("Held for review");
    expect(html).toContain("scaleX(1.0000)");
    expect(html).toContain('aria-pressed="false"');
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
  const summary = (id: string, projectId: string, status: RunSummary["status"]): RunSummary => ({
    id,
    projectId,
    projectName: "Synthetic project",
    skill: "rom",
    status,
    startedAt: "2026-09-25T15:00:00.000Z",
    finishedAt: null,
    error: null,
    stepCount: 5,
  });

  it("lists only this project's finished runs, newest first, capped", () => {
    const runs = [
      summary("a", "p1", "succeeded"),
      summary("b", "p2", "succeeded"),
      summary("c", "p1", "failed"),
      ...Array.from({ length: 12 }, (_, i) => summary(`d${i}`, "p1", "succeeded")),
    ];
    const saved = savedRunsFor(runs, "p1");

    expect(saved[0].id).toBe("a");
    expect(saved).toHaveLength(STRIP_RUNS);
    expect(saved.every((run) => run.projectId === "p1" && run.status === "succeeded")).toBe(true);
    expect(savedRunsFor(runs, undefined)).toEqual([]);
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
    expect(loadedRunFrom({ ...record, rom: null })).toBeNull();

    function lines(): RomLine[] {
      return [line({ costCode: "09 2000", low: 900, high: 1100 })];
    }
  });
});
