import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PARAMETER_NAMES, type ParameterName } from "@kulka/engine";

import type { ImpactData, ParameterHistoryEntry } from "@/lib/rom/parameters";

import { ParametersScreen } from "./ParametersScreen";

// LA-866: the Engine Parameters screen as the server renders it, in its key
// states. The values are the ones recorded today; the saved run is synthetic.

const VALUES: Record<ParameterName, number> = {
  "weight.actuals": 5,
  "weight.proest_budget": 1,
  "weight.reviewed_judgment": 2,
  "weight.llm_proposal": 0.5,
  "flag.high_min_comparables": 5,
  "flag.medium_min_comparables": 2,
  "spread.high": 0.1,
  "spread.medium": 0.2,
  "spread.low": 0.35,
  "fee.rate": 0.0325,
  "insurance.rate": 0.054,
};

const HISTORY: ParameterHistoryEntry[] = PARAMETER_NAMES.map((name, i) => ({
  id: `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
  name,
  value: VALUES[name],
  provenance: {
    kind: name === "spread.low" ? "backtest" : "reviewed_judgment",
    recordedBy: "Matt Nicosia",
    recordedAt: "2026-09-21",
    reason: `Synthetic stored reason for ${name}.`,
  },
  createdAt: "2026-09-21T12:00:00.000Z",
}));

const IMPACT: ImpactData = {
  runs: [
    {
      runId: "run-1",
      projectName: "Synthetic Project",
      startedAt: "2026-09-27T12:00:00.000Z",
      grossSquareFeet: 100000,
      answers: { projectType: "multifamily", constructionKind: "new", grossSquareFeet: 100000 },
      snapshotKey: "k",
    },
  ],
  snapshots: {
    k: {
      benchmarks: [
        {
          costCode: "TEST",
          label: "Synthetic",
          unit: "usd_per_gsf",
          value: 10,
          projectType: "multifamily",
          constructionKind: "new",
          provenance: { kind: "actuals", sourceProjectIds: ["p1"], exportLabel: "synthetic", recordedBy: "t", recordedAt: "2026-09-27" },
          scopeSide: "building",
          contractSide: "kulka",
        },
      ],
    },
  },
};

const NONE: ImpactData = { runs: [], snapshots: {} };

describe("ParametersScreen", () => {
  it("shows every parameter's current value, the worked example, and no save tray", () => {
    const html = renderToStaticMarkup(<ParametersScreen history={HISTORY} impact={IMPACT} />);
    for (const label of ["Blend Weights", "Actual Job Cost", "ProEst Budget", "Estimator Judgment", "Model Proposal"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("Confidence and Range");
    expect(html).toContain("Comparables Needed");
    expect(html).toContain("Anything that misses Medium");
    expect(html).toContain("Markups");
    expect(html).toContain('value="3.25"');
    expect(html).toContain('value="5.4"');
    // The worked example, through the engine: $23.41, medium, 3 of 5.
    expect(html).toContain("$23.41");
    expect(html).toContain("Medium, ±20%");
    expect(html).toContain("3 comparables. High needs 5.");
    expect(html).toContain("3 of 5 jobs");
    expect(html).toContain("Misses it");
    expect(html).toContain("59% of blend");
    // The saved run, unchanged.
    expect(html).toContain("Synthetic Project");
    expect(html).toContain("No change");
    // The tray is there but closed and out of the tab order.
    expect(html).toMatch(/class="pm-tray"[^>]*aria-hidden="true"/);
    expect(html).not.toContain("pm-row--changed");
  });

  it("marks a changed row, opens the tray, and keeps Save off until a reason is written", () => {
    const html = renderToStaticMarkup(
      <ParametersScreen history={HISTORY} impact={IMPACT} initialDrafts={{ "weight.llm_proposal": "1" }} />,
    );
    expect(html).toContain("pm-row--changed");
    expect(html).toContain("pm-tray pm-tray--on");
    expect(html).toContain("1 Change Not Saved");
    expect(html).toContain("weight.llm_proposal 0.5 → 1");
    expect(html).toContain("A reason is required to save.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save Changes<\/button>/);
  });

  it("enables Save once a reason is written and every value is valid", () => {
    const html = renderToStaticMarkup(
      <ParametersScreen
        history={HISTORY}
        impact={IMPACT}
        initialDrafts={{ "weight.llm_proposal": "1" }}
        initialReason="Synthetic reason."
      />,
    );
    expect(html).toContain("Saves as new history rows. The next ROM run uses them.");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Save Changes<\/button>/);
  });

  it("refuses inline what the engine refuses, and holds the example and the impact", () => {
    const html = renderToStaticMarkup(
      <ParametersScreen
        history={HISTORY}
        impact={IMPACT}
        initialDrafts={{ "flag.high_min_comparables": "1" }}
        initialReason="Synthetic reason."
      />,
    );
    expect(html).toContain("High cannot need fewer comparables than Medium.");
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain("pm-tier--bad");
    expect(html).toContain("Fix the marked values first.");
    expect(html).toContain("Fix the marked values to see the example.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Save Changes<\/button>/);
  });

  it("refuses a zero weight, since a run would refuse it", () => {
    const html = renderToStaticMarkup(
      <ParametersScreen history={HISTORY} impact={NONE} initialDrafts={{ "weight.actuals": "0" }} />,
    );
    expect(html).toContain("Use a weight above zero.");
  });

  it("opens a row's history with who, when, the full reason, and the provenance chip", () => {
    const html = renderToStaticMarkup(
      <ParametersScreen history={HISTORY} impact={NONE} initialOpen={["weight.actuals", "tier.low"]} />,
    );
    expect(html).toContain("Synthetic stored reason for weight.actuals.");
    expect(html).toContain("Sep 21, 2026, Matt Nicosia");
    expect(html).toContain("Reviewed Judgment");
    expect(html).toContain("Synthetic stored reason for spread.low.");
    expect(html).toContain('pm-prov pm-prov--backtest">Backtest');
    expect(html).toContain('aria-expanded="true"');
  });

  it("says so when there is no saved run to compare", () => {
    const html = renderToStaticMarkup(<ParametersScreen history={HISTORY} impact={NONE} />);
    expect(html).toContain("No saved run yet, so there is nothing to compare.");
  });
});
