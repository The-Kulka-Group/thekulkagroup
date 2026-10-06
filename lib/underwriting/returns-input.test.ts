import { describe, expect, it } from "vitest";

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

  it("returns a typed field error for an invalid terminal cap rate", () => {
    try {
      parsePropertyReturns({ ...plan, terminalCapRatePercent: 0 });
      throw new Error("Expected property return validation to fail.");
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidPropertyReturns);
      expect((cause as InvalidPropertyReturns).fieldErrors).toEqual({
        terminalCapRatePercent: expect.stringMatching(/greater than zero/),
      });
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
