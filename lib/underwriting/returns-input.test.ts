import { describe, expect, it } from "vitest";

import type { MonthlyCostLine } from "@kulka/engine";

import { InvalidPropertyReturns, parsePropertyReturns } from "./returns-input";

const plan = {
  saleInputVersion: "property_returns_inputs.v1",
  terminalCapRatePercent: 5.75,
  sellingCostPercent: 1.5,
  forwardNoiConvention: "forward_twelve_month_noi.v1",
  cashFlowDateConvention: "month_end_dates.v1",
  xirrConvention: "xirr_actual_365.v1",
  saleAssumptionEvidence: evidence(),
} as const;

describe("parsePropertyReturns", () => {
  it("keeps versioned sale terms and evidence without adding defaults", () => {
    expect(parsePropertyReturns(plan)).toEqual(plan);
  });

  it("keeps a sale tax basis and drops evidence and fields it does not use", () => {
    const saleTax = {
      saleTaxInputVersion: "sale_tax_inputs.v1",
      valueBasis: "full_tax_plus_abatement_value",
      abatementDiscountRatePercent: 6.5,
      saleTaxEvidence: { valueBasis: { reviewState: "working" }, abatementDiscountRatePercent: { reviewState: "working" } },
    };
    expect(parsePropertyReturns({ ...plan, saleTax: { ...saleTax, extra: "value" } }).saleTax).toEqual(saleTax);
    expect(() => parsePropertyReturns({ ...plan, saleTax: { ...saleTax, valueBasis: "scheduled_tax" } })).toThrow(InvalidPropertyReturns);
  });

  it("keeps a partnership waterfall and drops fields it does not know", () => {
    const working = { reviewState: "working" };
    const partnership = {
      partnershipInputVersion: "partnership_inputs.v1",
      lpFundingSharePercent: 75,
      fundingOrder: "pari_passu",
      lpEntryMonth: "2024-06",
      preferredReturn: { ratePercent: 10, accrual: "compound_monthly" },
      tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
      finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
      partnershipEvidence: { funding: working, preferredReturn: working, promoteTiers: working },
    };
    const parsed = parsePropertyReturns({
      ...plan,
      partnership: {
        ...partnership,
        extra: "value",
        tiers: [{ ...partnership.tiers[0], note: "drop" }],
        partnershipEvidence: { ...partnership.partnershipEvidence, funding: { ...working, extra: true } },
      },
    });
    expect(parsed.partnership).toEqual(partnership);
    const { lpEntryMonth, preferredReturn, ...withoutOptional } = partnership;
    void lpEntryMonth;
    void preferredReturn;
    const plain = { ...withoutOptional, partnershipEvidence: { funding: working, promoteTiers: working } };
    expect(parsePropertyReturns({ ...plan, partnership: plain }).partnership).toEqual(plain);
    expect(() => parsePropertyReturns({ ...plan, partnership: { ...partnership, lpFundingSharePercent: 0 } })).toThrow(InvalidPropertyReturns);
  });

  it("keeps a residual land target, drops fields it does not know, and checks the line against the cost schedule", () => {
    const residualLand = {
      residualLandInputVersion: "residual_land_inputs.v1",
      target: "levered_xirr",
      targetValue: 15,
      landLineId: "land",
      evidence: { sourceLabel: "Investment committee hurdle", reviewState: "working" },
    };
    const parsed = parsePropertyReturns({ ...plan, residualLand: { ...residualLand, note: "drop", evidence: { ...residualLand.evidence, extra: true } } });
    expect(parsed.residualLand).toEqual(residualLand);
    expect(parsePropertyReturns({ ...plan, residualLand: null }).residualLand).toBeUndefined();
    const fieldErrorsFor = (body: unknown, costLines?: MonthlyCostLine[]) => {
      try {
        parsePropertyReturns(body, costLines);
      } catch (cause) {
        expect(cause).toBeInstanceOf(InvalidPropertyReturns);
        return (cause as InvalidPropertyReturns).fieldErrors;
      }
      return {};
    };
    expect(fieldErrorsFor({ ...plan, residualLand: { ...residualLand, target: "equity_multiple", landLineId: "" } })).toEqual({
      "residualLand.target": expect.stringMatching(/Target must be/),
      "residualLand.landLineId": expect.stringMatching(/Choose the land line/),
    });
    expect(fieldErrorsFor({ ...plan, residualLand: { ...residualLand, targetValue: -100, evidence: { reviewState: "maybe" } } }, [])).toEqual({
      "residualLand.targetValue": expect.stringMatching(/Target XIRR/),
      "residualLand.evidence.reviewState": expect.stringMatching(/Working on It or Done/),
    });
    const line = { name: "Land", unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "done" } as const;
    expect(fieldErrorsFor({ ...plan, residualLand }, [{ ...line, id: "land", category: "land", amount: 1_000_000 }])).toEqual({});
    expect(fieldErrorsFor({ ...plan, residualLand }, [{ ...line, id: "other", category: "land", amount: 1_000_000 }])).toEqual({
      "residualLand.landLineId": expect.stringMatching(/not on the cost schedule/),
    });
    expect(fieldErrorsFor({ ...plan, residualLand }, [{ ...line, id: "land", category: "hard_cost", amount: 1_000_000 }])).toEqual({
      "residualLand.landLineId": expect.stringMatching(/not a land line/),
    });
    expect(fieldErrorsFor({ ...plan, residualLand }, [{ ...line, id: "land", category: "land", basis: { type: "per_unit", rate: 50_000 } }])).toEqual({
      "residualLand.landLineId": expect.stringMatching(/priced by a basis/),
    });
  });

  it("returns a typed field error for an invalid terminal cap rate", () => {
    try {
      parsePropertyReturns({ ...plan, terminalCapRatePercent: 0 });
      throw new Error("Expected property return validation to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidPropertyReturns);
      expect((cause as InvalidPropertyReturns).fieldErrors).toEqual({
        terminalCapRatePercent: expect.stringMatching(/greater than zero/),
      });
      // LA-1944: the message beside Save names the field that failed.
      expect((cause as InvalidPropertyReturns).message).toMatch(/^Review the property sale and returns fields\. .*greater than zero/);
      expect((cause as InvalidPropertyReturns).issues).toEqual([
        expect.objectContaining({ path: "terminalCapRatePercent", code: "invalid_percent" }),
      ]);
    }
  });

  it("rejects unsupported conventions and invalid evidence dates", () => {
    expect(() => parsePropertyReturns({
      ...plan,
      xirrConvention: "monthly_irr.v0",
      saleAssumptionEvidence: {
        ...plan.saleAssumptionEvidence,
        saleMonth: { reviewState: "done", sourceDate: "2026-99-01" },
      },
    })).toThrow("Review the property sale and returns fields.");
  });

  it.each([
    ["sourceLabel", 42, "invalid_source_label"],
    ["sourceLabel", "x".repeat(501), "text_too_long"],
    ["sourceDate", 20260902, "invalid_source_date"],
    ["reviewState", 1, "invalid_review_state"],
  ])("returns a typed issue for invalid sale evidence %s", (field, value, code) => {
    try {
      parsePropertyReturns({
        ...plan,
        saleAssumptionEvidence: {
          ...plan.saleAssumptionEvidence,
          terminalCapRatePercent: { reviewState: "working", [field]: value },
        },
      });
      throw new Error("Expected sale evidence validation to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidPropertyReturns);
      expect((cause as InvalidPropertyReturns).issues).toContainEqual(expect.objectContaining({
        path: `saleAssumptionEvidence.terminalCapRatePercent.${field}`,
        code,
      }));
    }
  });
});

function evidence() {
  const item = () => ({ sourceLabel: "Owner model", sourceDate: "2026-09-02", reviewState: "done" as const });
  return {
    saleMonth: item(), terminalCapRatePercent: item(), sellingCostPercent: item(),
    forwardNoiConvention: item(), cashFlowDateConvention: item(), xirrConvention: item(),
  };
}
