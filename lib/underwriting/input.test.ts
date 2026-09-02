import { describe, expect, it } from "vitest";

import { InvalidCaseDraft, parseCaseDraft } from "./input";

describe("parseCaseDraft", () => {
  it("keeps supplied precision and leaves blank inputs missing", () => {
    expect(
      parseCaseDraft({
        name: "  Saved case  ",
        address: " 100 Test Avenue ",
        proposedUnits: 24,
        assumptions: { debtPercent: 64.125, interestRatePercent: 7.25, monthlyRent: undefined },
      }),
    ).toEqual({
      name: "Saved case",
      address: "100 Test Avenue",
      proposedUnits: 24,
      averageUnitSquareFeet: undefined,
      grossBuildingSquareFeet: undefined,
      assumptions: { debtPercent: 64.125, interestRatePercent: 7.25 },
    });
  });

  it("accepts zero for the approved bounded percentages", () => {
    expect(
      parseCaseDraft({
        name: "Saved case",
        address: "100 Test Avenue",
        assumptions: {
          purchasePrice: 0,
          softCostPercent: 0,
          contingencyPercent: 0,
          vacancyPercent: 0,
          operatingExpensePercent: 0,
          debtPercent: 0,
          interestRatePercent: 0,
        },
      }).assumptions,
    ).toEqual({
      purchasePrice: 0,
      softCostPercent: 0,
      contingencyPercent: 0,
      vacancyPercent: 0,
      operatingExpensePercent: 0,
      debtPercent: 0,
      interestRatePercent: 0,
    });
  });

  it("allows all-equity debt with a missing interest rate", () => {
    expect(parseCaseDraft({
      name: "All-equity case",
      address: "100 Test Avenue",
      assumptions: { debtPercent: 0 },
    }).assumptions).toEqual({ debtPercent: 0 });
  });

  it("requires a positive interest rate when debt is positive", () => {
    expect(() => parseCaseDraft({
      name: "Debt case",
      address: "100 Test Avenue",
      assumptions: { debtPercent: 65, interestRatePercent: 0 },
    })).toThrow("Interest rate must be greater than zero when debt is greater than zero.");
  });

  it("validates and keeps source details for supplied assumptions", () => {
    expect(
      parseCaseDraft({
        name: "Saved case",
        address: "100 Test Avenue",
        assumptions: { exitCapRatePercent: 5.375 },
        assumptionMetadata: {
          exitCapRatePercent: {
            sourceLabel: "Owner model",
            sourceDate: "2026-08-19",
            reviewState: "done",
          },
        },
      }).assumptionMetadata,
    ).toEqual({
      exitCapRatePercent: {
        sourceLabel: "Owner model",
        sourceDate: "2026-08-19",
        reviewState: "done",
      },
    });
  });

  it("keeps missing source evidence missing and applies optional common evidence", () => {
    expect(parseCaseDraft({
      name: "Saved case",
      address: "100 Test Avenue",
      proposedUnits: 24,
      assumptions: { purchasePrice: 100 },
    })).not.toHaveProperty("assumptionMetadata");

    expect(parseCaseDraft({
      name: "Saved case",
      address: "100 Test Avenue",
      proposedUnits: 24,
      assumptions: { purchasePrice: 100 },
      commonSourceLabel: "Program memo",
      commonSourceDate: "2026-08-19",
    })).toMatchObject({
      factMetadata: {
        proposedUnits: {
          sourceLabel: "Program memo",
          sourceDate: "2026-08-19",
          reviewState: "working",
        },
      },
      assumptionMetadata: {
        purchasePrice: {
          sourceLabel: "Program memo",
          sourceDate: "2026-08-19",
          reviewState: "working",
        },
      },
    });
  });

  it.each([
    [{ address: "100 Test Avenue" }, "Case name is required."],
    [{ name: "Saved case" }, "Property address is required."],
    [
      { name: "Saved case", address: "100 Test Avenue", proposedUnits: 4.5 },
      "Proposed units must be a whole number.",
    ],
    [
      { name: "Saved case", address: "100 Test Avenue", assumptions: { debtPercent: 101 } },
      "Debt cannot exceed 100 percent.",
    ],
    [
      {
        name: "Saved case",
        address: "100 Test Avenue",
        assumptions: { purchasePrice: 100 },
        assumptionMetadata: {
          purchasePrice: {
            sourceLabel: "Owner model",
            sourceDate: "2026-99-19",
            reviewState: "done",
          },
        },
      },
      "Source date must be a valid date.",
    ],
  ])("rejects an invalid draft", (body, message) => {
    expect(() => parseCaseDraft(body)).toThrow(message);
  });

  it("returns the field that failed validation", () => {
    try {
      parseCaseDraft({ name: "Saved case", address: "100 Test Avenue", proposedUnits: 1.5 });
    } catch (cause) {
      expect(cause).toBeInstanceOf(InvalidCaseDraft);
      expect((cause as InvalidCaseDraft).fieldErrors).toEqual({
        proposedUnits: "Proposed units must be a whole number.",
      });
    }
  });
});
