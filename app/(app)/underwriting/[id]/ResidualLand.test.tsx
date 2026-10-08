import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  RESIDUAL_LAND_INPUT_VERSION,
  computePropertyReturns,
  runApartmentScenarioComparison,
  type ApartmentScenarioDefinition,
  type MonthlyCostLine,
  type ResidualLandPlan,
} from "@kulka/engine";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "../../../../packages/engine/src/fixtures/apartment-development-model-v2.98-scorecard";
import { ResidualLandResults } from "./ResidualLandResults";
import { ResidualLandSection } from "./ResidualLandSection";
import { ScenarioComparisonResults } from "./ScenarioComparisonResults";

const evidence = { sourceLabel: "Investment committee hurdle", sourceDate: "2026-10-08", reviewState: "working" as const };
const base = APARTMENT_DEVELOPMENT_V2_98_SCORECARD.engineInputs;
const plan = (targetValue: number): ResidualLandPlan => ({
  residualLandInputVersion: RESIDUAL_LAND_INPUT_VERSION,
  target: "development_spread",
  targetValue,
  landLineId: "land-costs",
  evidence,
});

describe("residual land views", () => {
  it("shows the solved price, both runs side by side, the search, the trace and the checks", () => {
    const run = computePropertyReturns({ ...base, residualLand: plan(100) });
    const residual = run.result!.residualLand!;
    expect(residual.status).toBe("solved");
    const html = renderToStaticMarkup(<ResidualLandResults result={run.result!} residual={residual} />);
    for (const text of ["Residual Land", "Development Spread 100 bps", "Solved", "Results at Stated Land and at the Residual", "Stated Land", "Residual Land", "Land Cash Cost", "Levered XIRR", "Residual Land Search", "Highest Price That Meets the Target", "Lowest Price Above It", "Residual Land Formula Trace", "found by bisection", "Residual Land Checks", "costLines."]) {
      expect(html).toContain(text);
    }
    expect(html).toContain(new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(residual.residualLineAmount!));
  });

  it("says why a target no land price meets has no residual and shows the end the search reached", () => {
    const run = computePropertyReturns({ ...base, residualLand: plan(5_000) });
    const residual = run.result!.residualLand!;
    expect(residual.status).toBe("below_minimum");
    const html = renderToStaticMarkup(<ResidualLandResults result={run.result!} residual={residual} />);
    expect(html).toContain("No Price Meets the Target");
    expect(html).toContain("even with this land line at one cent");
    expect(html).toContain("None Found");
    expect(html).toContain("$0.01");
    expect(html).toContain("Misses Target");
    expect(html).not.toContain("Results at Stated Land and at the Residual");
  });

  it("offers only land lines with a fixed amount", () => {
    const costLines = [
      { id: "land-costs", name: "Land Costs", category: "land", amount: 1_000 },
      { id: "land-fee", name: "Land Fee", category: "land", basis: { type: "percent_of_line", baseLineId: "land-costs", percent: 2 } },
      { id: "hard-costs", name: "Hard Costs", category: "hard_cost", amount: 1_000 },
    ] as MonthlyCostLine[];
    const html = renderToStaticMarkup(<ResidualLandSection residualLand={plan(100)} setResidualLand={() => undefined} costLines={costLines} fieldErrors={{ "residualLand.targetValue": "Target development spread must be greater than -10,000 and no more than 10,000 basis points." }} />);
    expect(html).toContain(">Land Costs</option>");
    expect(html).not.toContain("Land Fee");
    expect(html).not.toContain("Hard Costs");
    expect(html).toContain("bps");
    expect(html).toContain("no more than 10,000 basis points");
    expect(html).toContain("Investment committee hurdle");
  });

  it("shows only the switch when the case has no target", () => {
    const html = renderToStaticMarkup(<ResidualLandSection residualLand={undefined} setResidualLand={() => undefined} costLines={[]} fieldErrors={{}} />);
    expect(html).toContain("Solve for Residual Land");
    expect(html).not.toContain("Land Line to Price");
  });

  it("adds the residual land per scenario when the base carries a target", () => {
    const scenarios: ApartmentScenarioDefinition[] = [
      { id: "higher-vacancy", role: "downside", name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1", delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: evidence } },
      { id: "lower-exit-cap", role: "upside", name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1", delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: evidence } },
    ];
    const withTarget = renderToStaticMarkup(<ScenarioComparisonResults result={runApartmentScenarioComparison({ ...base, residualLand: plan(100) }, scenarios).result!} />);
    expect(withTarget).toContain("Residual Land Price");
    expect(withTarget).toContain("Total Land Cost at Residual");
    const withoutTarget = renderToStaticMarkup(<ScenarioComparisonResults result={runApartmentScenarioComparison(base, scenarios).result!} />);
    expect(withoutTarget).not.toContain("Residual Land Price");
  });
});
