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

  it("shows source and review gaps for saved monthly cost lines", () => {
    const items = buildUnderwritingReviewItems({
      ...savedCase,
      costSchedule: {
        analysisStartMonth: "2026-01",
        saleMonth: "2026-12",
        costLines: [{
          id: "hard",
          name: "Hard cost",
          category: "hard_cost",
          amount: 1_000_000,
          unit: "usd",
          startMonth: "2026-02",
          endMonth: "2026-10",
          distributionMethod: "s_curve",
          distributionVersion: "s_curve.smoothstep.v1",
          reviewState: "working",
          lastChangedAt: "2026-09-02T00:00:00.000Z",
        }],
      },
    }, undefined, false);

    expect(items.map(({ id }) => id)).toEqual(expect.arrayContaining([
      "cost-source-label-hard",
      "cost-source-date-hard",
      "cost-review-state-hard",
    ]));
  });

  it("shows source and review gaps for apartment operation lines", () => {
    const items = buildUnderwritingReviewItems({
      ...savedCase,
      apartmentOperations: {
        inputVersion: "apartment_operations_inputs.v1",
        operationStartMonth: "2026-06",
        growthStartMonth: "2026-06",
        preleasedUnits: 0,
        leaseUpUnitsPerMonth: 5,
        annualIncomeGrowthPercent: 3,
        annualExpenseGrowthPercent: 3,
        rentAdjustmentLossPercent: 0,
        freeRentPercent: 0,
        vacancyPercent: 5,
        creditLossPercent: 1,
        assumptionEvidence: workingAssumptionEvidence(),
        residentialUnitTypes: [{
          id: "studio", name: "Studio", units: 10, nonRevenueUnits: 0,
          averageAreaSf: 550,
          monthlyMarketRent: 1_500, reviewState: "working",
        }],
        otherIncomeLines: [],
        operatingExpenseLines: [],
        capitalExpenditureLines: [],
        lastChangedAt: "2026-09-02T00:00:00.000Z",
      },
    }, undefined, false);

    expect(items.map(({ id }) => id).filter((id) => id.includes("studio"))).toEqual([
      "operations-source-label-studio",
      "operations-source-date-studio",
      "operations-review-state-studio",
    ]);
  });

  it("shows source and review gaps for capital assumptions", () => {
    const item = () => ({ reviewState: "working" as const });
    const items = buildUnderwritingReviewItems({
      ...savedCase,
      developmentCapital: {
        capitalInputVersion: "development_capital_inputs.v1",
        targetDebtSharePercent: 65,
        annualInterestRatePercent: 8,
        loanFeePercent: 1,
        fundingOrder: "equity_first.v1",
        interestTreatment: "capitalized_net_operating_cash.v1",
        interestConvention: "opening_balance_monthly.v1",
        feeMonth: "2026-01",
        payoffMonth: "2026-12",
        capitalAssumptionEvidence: {
          targetDebtSharePercent: item(), annualInterestRatePercent: item(), loanFeePercent: item(), fundingOrder: item(),
          interestTreatment: item(), interestConvention: item(), feeMonth: item(), payoffMonth: item(),
        },
        lastChangedAt: "2026-09-02T00:00:00.000Z",
      },
    }, undefined, false);

    expect(items.filter(({ id }) => id.startsWith("capital-assumption-"))).toHaveLength(24);
  });

  it("shows source and review gaps for sale assumptions", () => {
    const item = () => ({ reviewState: "working" as const });
    const items = buildUnderwritingReviewItems({
      ...savedCase,
      propertyReturns: {
        saleInputVersion: "property_returns_inputs.v1",
        terminalCapRatePercent: 5.75,
        sellingCostPercent: 1.5,
        forwardNoiConvention: "forward_twelve_month_noi.v1",
        cashFlowDateConvention: "month_end_dates.v1",
        xirrConvention: "xirr_actual_365.v1",
        saleAssumptionEvidence: {
          saleMonth: item(), terminalCapRatePercent: item(), sellingCostPercent: item(),
          forwardNoiConvention: item(), cashFlowDateConvention: item(), xirrConvention: item(),
        },
        lastChangedAt: "2026-09-02T00:00:00.000Z",
      },
    }, undefined, false);

    expect(items.filter(({ id }) => id.startsWith("returns-assumption-"))).toHaveLength(18);
  });
});

function workingAssumptionEvidence() {
  return {
    operationStartMonth: { reviewState: "working" as const },
    growthStartMonth: { reviewState: "working" as const },
    preleasedUnits: { reviewState: "working" as const },
    leaseUpUnitsPerMonth: { reviewState: "working" as const },
    annualIncomeGrowthPercent: { reviewState: "working" as const },
    annualExpenseGrowthPercent: { reviewState: "working" as const },
    rentAdjustmentLossPercent: { reviewState: "working" as const },
    freeRentPercent: { reviewState: "working" as const },
    vacancyPercent: { reviewState: "working" as const },
    creditLossPercent: { reviewState: "working" as const },
  };
}

describe("underwriting limitations", () => {
  it("names the annual timing, full-balance interest, omitted models, and approval boundary", () => {
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/same annual period/i);
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/full loan balance for one year/i);
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/construction draws.*investor returns/i);
    expect(UNDERWRITING_LIMITATIONS.join(" ")).toMatch(/do not record a finance approval/i);
  });
});
