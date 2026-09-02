import { describe, expect, it } from "vitest";

import { InvalidCaseDraft, parseCaseDraft } from "./input";

describe("parseCaseDraft", () => {
  it("keeps supplied precision and leaves blank inputs missing", () => {
    expect(
      parseCaseDraft({
        name: "  Saved case  ",
        address: " 100 Test Avenue ",
        proposedUnits: 24,
        assumptions: { debtPercent: 64.125, monthlyRent: undefined },
      }),
    ).toEqual({
      name: "Saved case",
      address: "100 Test Avenue",
      proposedUnits: 24,
      averageUnitSquareFeet: undefined,
      grossBuildingSquareFeet: undefined,
      assumptions: { debtPercent: 64.125 },
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
        },
      }).assumptions,
    ).toEqual({
      purchasePrice: 0,
      softCostPercent: 0,
      contingencyPercent: 0,
      vacancyPercent: 0,
      operatingExpensePercent: 0,
    });
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
      "Source date is required.",
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
