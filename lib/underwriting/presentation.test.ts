import { describe, expect, it } from "vitest";

import type { UnderwritingCase } from "./cases";
import type { SavedUnderwritingRun } from "./runs";
import { buildUnderwritingReviewItems, UNDERWRITING_LIMITATIONS } from "./presentation";

const savedCase: UnderwritingCase = {
  id: "00000000-0000-4000-8000-000000000001",
  caseNumber: 1,
  sheetNumber: "U-101",
  name: "Synthetic review case",
  address: "100 Example Avenue",
  developmentType: "ground_up_multifamily",
  status: "working",
  caseRevision: 2,
  proposedUnits: 10,
  grossBuildingSquareFeet: 10_000,
  factMetadata: {
    proposedUnits: {
      reviewState: "done",
      lastChangedAt: "2026-09-02T00:00:00.000Z",
      caseRevision: 2,
    },
    grossBuildingSquareFeet: {
      sourceLabel: "Program memo",
      sourceDate: "2026-09-01",
      reviewState: "working",
      lastChangedAt: "2026-09-02T00:00:00.000Z",
      caseRevision: 2,
    },
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  assumptions: [{
    name: "purchasePrice",
    key: "purchase_price",
    label: "Purchase price",
    value: 1,
    unit: "usd",
    sourceKind: "user_supplied",
    sourceLabel: "",
    sourceDate: "",
    reviewState: "working",
    lastChangedAt: "2026-09-02T00:00:00.000Z",
  }],
};

describe("buildUnderwritingReviewItems", () => {
  it("combines missing facts, stale calculations, source gaps, and working assumptions", () => {
    const items = buildUnderwritingReviewItems(savedCase, undefined, true);
    expect(items.map((item) => item.id)).toEqual([
      "fact-source-label-proposedUnits",
      "fact-source-date-proposedUnits",
      "fact-averageUnitSquareFeet",
      "fact-review-state-grossBuildingSquareFeet",
      "calculation-current-revision",
      "source-label-purchasePrice",
      "source-date-purchasePrice",
      "review-state-purchasePrice",
    ]);
  });

  it("includes every calculation issue from the current revision", () => {
    const run = {
      caseRevision: savedCase.caseRevision,
      issues: [
        { inputKey: "monthlyRent", code: "missing", message: "Average monthly rent is required." },
        { inputKey: "exitCapRatePercent", code: "must_be_positive", message: "Exit cap rate must be greater than zero." },
      ],
    } as SavedUnderwritingRun;
    const items = buildUnderwritingReviewItems({ ...savedCase, averageUnitSquareFeet: 800 }, run, true);
    expect(items.filter((item) => item.severity === "stuck")).toHaveLength(2);
  });
});

describe("underwriting limitations", () => {
  it("names the annual timing, full-balance interest, omitted models, and approval boundary", () => {
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/same annual period/i);
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/full loan balance for one year/i);
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/construction draws.*investor returns/i);
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/do not record a finance approval/i);
  });
});
