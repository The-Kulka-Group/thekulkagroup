import { describe, expect, it } from "vitest";

import type { UnderwritingCase } from "./cases";
import { buildUnderwritingReview } from "./presentation";
import { isReviewSectionKey, planSectionDone, withReviewDone } from "./review-done";

const base: UnderwritingCase = {
  id: "00000000-0000-4000-8000-000000000001",
  caseNumber: 1,
  sheetNumber: "U-101",
  name: "Synthetic case",
  address: "100 Example Avenue",
  developmentType: "ground_up_multifamily",
  status: "working",
  caseRevision: 2,
  proposedUnits: 10,
  grossBuildingSquareFeet: 10_000,
  factMetadata: {
    proposedUnits: { sourceLabel: "Memo", sourceDate: "2026-09-01", reviewState: "working", lastChangedAt: "2026-09-02T00:00:00.000Z", caseRevision: 2 },
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-02T00:00:00.000Z",
  assumptions: [{
    name: "purchasePrice", key: "purchase_price", label: "Purchase price", value: 1, unit: "usd",
    sourceKind: "user_supplied", sourceLabel: "Memo", sourceDate: "2026-09-01", reviewState: "working",
    lastChangedAt: "2026-09-02T00:00:00.000Z",
  }],
};

describe("withReviewDone", () => {
  it("sets every nested working review state to done and leaves other values alone", () => {
    const input = { a: { reviewState: "working", value: 1 }, list: [{ reviewState: "working" }, { reviewState: "done" }], note: "working" };
    expect(withReviewDone(input)).toEqual({ a: { reviewState: "done", value: 1 }, list: [{ reviewState: "done" }, { reviewState: "done" }], note: "working" });
    expect(input.a.reviewState).toBe("working");
  });
});

describe("planSectionDone", () => {
  it("marks only the facts when the facts section is done", () => {
    const plan = planSectionDone(base, "facts");
    if (plan?.save !== "case") throw new Error("expected a case plan");
    expect(plan.draft.factMetadata?.proposedUnits?.reviewState).toBe("done");
    expect(plan.draft.factMetadata?.grossBuildingSquareFeet?.reviewState).toBe("done");
    expect(plan.draft.assumptionMetadata?.purchasePrice?.reviewState).toBe("working");
  });

  it("marks only the assumptions when the assumptions section is done", () => {
    const plan = planSectionDone(base, "assumptions");
    if (plan?.save !== "case") throw new Error("expected a case plan");
    expect(plan.draft.assumptionMetadata?.purchasePrice?.reviewState).toBe("done");
    expect(plan.draft.factMetadata?.proposedUnits?.reviewState).toBe("working");
  });

  it("returns nothing for a section the case has not saved", () => {
    expect(planSectionDone(base, "costs")).toBeUndefined();
    expect(planSectionDone(base, "operations")).toBeUndefined();
    expect(planSectionDone(base, "scenarios")).toBeUndefined();
  });

  it("sets every cost line to done in one plan and drops the count", () => {
    const withCosts = {
      ...base,
      costSchedule: {
        analysisStartMonth: "2026-01", saleMonth: "2026-12",
        costLines: ["hard", "soft"].map((id) => ({
          id, name: id, category: "hard_cost", amount: 1, unit: "usd", startMonth: "2026-02", endMonth: "2026-10",
          distributionMethod: "s_curve", distributionVersion: "s_curve.smoothstep.v1", sourceLabel: "Bid", sourceDate: "2026-09-01",
          reviewState: "working", lastChangedAt: "2026-09-02T00:00:00.000Z",
        })),
      },
    } as unknown as UnderwritingCase;
    const before = buildUnderwritingReview(withCosts, undefined, true);
    expect(before.groups.find((group) => group.key === "costs")?.workingCount).toBe(2);
    const plan = planSectionDone(withCosts, "costs");
    if (plan?.save !== "schedule") throw new Error("expected a schedule plan");
    expect(plan.schedule.costLines.map((line) => line.reviewState)).toEqual(["done", "done"]);
    const after = buildUnderwritingReview({ ...withCosts, costSchedule: plan.schedule } as unknown as UnderwritingCase, undefined, true);
    expect(after.groups.find((group) => group.key === "costs")).toBeUndefined();
    expect(after.count).toBe(before.count - 2);
  });
});

describe("isReviewSectionKey", () => {
  it("accepts section keys only", () => {
    expect(isReviewSectionKey("capital")).toBe(true);
    expect(isReviewSectionKey("calculation")).toBe(false);
    expect(isReviewSectionKey(undefined)).toBe(false);
  });
});
