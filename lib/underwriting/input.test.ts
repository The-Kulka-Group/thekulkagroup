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
  ])("rejects an invalid draft", (body, message) => {
    expect(() => parseCaseDraft(body)).toThrow(new InvalidCaseDraft(message));
  });
});
