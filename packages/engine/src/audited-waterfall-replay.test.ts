import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runPartnershipWaterfall, type PartnershipCashFlowMonth, type PartnershipPlan, type PartnershipResult } from "./partnership-waterfall";

/*
 * LA-1863. Benjamin's own net equity cash flow, replayed through the engine waterfall, scores the
 * waterfall rules apart from the engine's property cash flow. The replay file holds deal figures, so it
 * stays in Dropbox next to the scorecard inputs (built by la-1863-waterfall-replay.py). Point
 * KULKA_MODEL_AUDIT_DIR at that folder to run it; without it the test skips. Output is percent off only.
 */

const AUDIT_DIR = process.env.KULKA_MODEL_AUDIT_DIR;
const REPLAY = AUDIT_DIR ? join(AUDIT_DIR, "benjamin", "waterfall-replay.json") : "";

type ReplayOutput =
  | "lpContributions" | "gpContributions" | "lpPreferredReturnAccrued" | "gpPreferredReturnAccrued"
  | "lpDistributions" | "gpDistributions" | "lpXirr" | "gpXirr" | "lpEquityMultiple" | "gpEquityMultiple"
  | "lpNetProfit" | "gpNetProfit" | "promoteTotal" | "lpPeakEquity" | "gpPeakEquity"
  | "lpPeakEquityMonth" | "gpPeakEquityMonth";

type Replay = {
  model: string;
  plan: PartnershipPlan;
  months: PartnershipCashFlowMonth[];
  /** A workbook_defect target comes from a known workbook error and must stay off. */
  targets: Array<{ id: string; output: ReplayOutput; expected: number | string; stage?: "workbook_defect"; reason?: string }>;
};

function outputs(result: PartnershipResult): Record<ReplayOutput, number | string | null> {
  return {
    lpContributions: result.lp.contributions,
    gpContributions: result.gp.contributions,
    lpPreferredReturnAccrued: result.lp.preferredReturnAccrued,
    gpPreferredReturnAccrued: result.gp.preferredReturnAccrued,
    lpDistributions: result.lp.distributions,
    gpDistributions: result.gp.distributions,
    lpXirr: result.lp.xirr,
    gpXirr: result.gp.xirr,
    lpEquityMultiple: result.lp.equityMultiple,
    gpEquityMultiple: result.gp.equityMultiple,
    lpNetProfit: result.lp.netProfit,
    gpNetProfit: result.gp.netProfit,
    promoteTotal: result.promoteTotal,
    lpPeakEquity: result.lp.peakEquity,
    gpPeakEquity: result.gp.peakEquity,
    lpPeakEquityMonth: result.lp.peakEquityMonth,
    gpPeakEquityMonth: result.gp.peakEquityMonth,
  };
}

describe.skipIf(!AUDIT_DIR)("partnership waterfall replay: Benjamin", () => {
  it("replays the workbook's net equity cash flow within a small tolerance of every saved LP and GP figure", () => {
    expect(existsSync(REPLAY), `${REPLAY} is missing`).toBe(true);
    const replay = JSON.parse(readFileSync(REPLAY, "utf8")) as Replay;
    const run = runPartnershipWaterfall(replay.months, replay.plan);
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    expect(run.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
    const actual = outputs(run.result!);
    const rows = replay.targets.map(({ id, output, expected, stage }) => {
      const value = actual[output];
      const percentOff = typeof value === "number" && typeof expected === "number" ? (value - expected) / Math.abs(expected) * 100 : null;
      return { id, output, stage, matched: typeof value === "string" || value === null ? value === expected : null, percentOff };
    });
    console.info(["| Target | Engine output | Percent off |", "|---|---|---:|", ...rows.map((row) => `| ${row.id} | ${row.output} | ${row.percentOff === null ? (row.matched ? "matched" : row.stage ? "workbook defect held off" : "off") : `${row.percentOff > 0 ? "+" : ""}${row.percentOff.toFixed(4)}%`} |`)].join("\n"));
    for (const row of rows) {
      if (row.stage === "workbook_defect") expect(row.matched ?? false, `${row.id} matches a workbook defect`).toBe(false);
      else if (row.percentOff === null) expect(row.matched, row.id).toBe(true);
      // IRRs compare an actual-day XIRR with the workbook's monthly IRR annualized, so they get a wider band.
      else expect(Math.abs(row.percentOff), row.id).toBeLessThan(row.output.endsWith("Xirr") ? 0.1 : 0.01);
    }
  });
});
