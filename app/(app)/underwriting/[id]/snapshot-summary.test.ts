import { describe, expect, it } from "vitest";

import type { SavedUnderwritingInputSnapshot } from "@/lib/underwriting/runs";
import { snapshotSummary } from "./snapshot-summary";

const costLines = [{}, {}, {}] as SavedUnderwritingInputSnapshot["costLines"];
const schedule = { analysisStartMonth: "2025-12", saleMonth: "2029-09", costLines };

describe("snapshotSummary", () => {
  it("counts the cost lines and names the date range of a schedule run", () => {
    expect(snapshotSummary(schedule)).toBe("3 cost lines · 2025-12 to 2029-09");
  });

  it("reads a scenario run's inputs from its base and adds the scenario count", () => {
    const run = { base: schedule, scenarios: [{}, {}] } as unknown as SavedUnderwritingInputSnapshot;
    expect(snapshotSummary(run)).toBe("2 scenarios · 3 cost lines · 2025-12 to 2029-09");
  });

  it("uses the singular for one scenario", () => {
    const run = { base: schedule, scenarios: [{}] } as unknown as SavedUnderwritingInputSnapshot;
    expect(snapshotSummary(run)).toBe("1 scenario · 3 cost lines · 2025-12 to 2029-09");
  });

  it("summarizes a preliminary run by its intake figures", () => {
    expect(snapshotSummary({ grossBuildingSquareFeet: 120000, proposedUnits: 140, purchasePrice: 9500000, monthlyRent: 2400 }))
      .toBe("120,000 GSF · 140 units · $9,500,000 purchase · $2,400/month rent");
  });

  it("says no inputs were supplied only when the snapshot holds none", () => {
    expect(snapshotSummary({})).toBe("No calculation inputs were supplied.");
    const emptyScenarioRun = { base: {}, scenarios: [] } as unknown as SavedUnderwritingInputSnapshot;
    expect(snapshotSummary(emptyScenarioRun)).toBe("No calculation inputs were supplied.");
  });
});
