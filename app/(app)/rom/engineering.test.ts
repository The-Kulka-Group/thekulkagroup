import { describe, expect, it } from "vitest";

import { choicesFor, ladderPosition, ratingLabel, stepNumber, valueFromChoice, valueText, windowBays } from "./engineering";

// LA-1281, LA-1282: the helpers the Design and Engineering card draws E-1,
// M-0 and M-1 with.

const E1 = {
  code: "E-1",
  steps: [{ label: "Service Load", result: "2,274 A at 208Y/120 V" }],
  value: { kind: "quantity" as const, amount: 2500, unit: "A Service" },
};

describe("valueText and valueFromChoice", () => {
  it("formats a quantity with its unit, and reads a picked one back in the same unit", () => {
    expect(valueText(E1.value)).toBe("2,500 A Service");
    expect(valueText({ kind: "spec", text: "Hydraulic" })).toBe("Hydraulic");
    expect(valueFromChoice(E1, "3,000 A Service")).toEqual({ kind: "quantity", amount: 3000, unit: "A Service" });
    expect(valueFromChoice({ value: { kind: "spec", text: "Standard Glazing Band" } }, "Elevated Glazing Band")).toEqual({
      kind: "spec",
      text: "Elevated Glazing Band",
    });
  });
});

describe("choicesFor", () => {
  it("offers E-1 the rating either side of the one it landed on", () => {
    expect(choicesFor(E1)).toEqual(["2,000 A Service", "2,500 A Service", "3,000 A Service"]);
    expect(choicesFor({ ...E1, value: { kind: "quantity", amount: 400, unit: "A Service" } })).toEqual([
      "400 A Service",
      "450 A Service",
    ]);
    // Past 4,000 A there is no standard rating to offer.
    expect(choicesFor({ ...E1, value: { kind: "quantity", amount: 4300, unit: "A Service" } })).toEqual([]);
  });

  it("offers M-0 its two bands", () => {
    expect(choicesFor({ code: "M-0", steps: [], value: { kind: "spec", text: "Standard Glazing Band" } })).toEqual([
      "Standard Glazing Band",
      "Elevated Glazing Band",
    ]);
  });
});

describe("the ladder, the facade and step numbers", () => {
  it("reads a step's number with its commas", () => {
    expect(stepNumber(E1, "Service Load")).toBe(2274);
  });

  it("places a load between the centres of the ratings around it", () => {
    // 13 rungs: 2,000 A is rung 9's centre, 2,500 A rung 10's.
    expect(ladderPosition(2000)).toBeCloseTo((9.5 / 13) * 100);
    expect(ladderPosition(2250)).toBeCloseTo((10 / 13) * 100);
    expect(ladderPosition(200)).toBeCloseTo((0.25 / 13) * 100);
    expect(ladderPosition(5000)).toBe(100);
  });

  it("labels ratings short enough for a rung", () => {
    expect(ratingLabel(450)).toBe("450");
    expect(ratingLabel(1200)).toBe("1.2k");
    expect(ratingLabel(2000)).toBe("2k");
  });

  it("spreads each floor's windows evenly: 2 of 10 bays, or 3", () => {
    expect(windowBays(2, 10)).toEqual([2, 7]);
    expect(windowBays(3, 10)).toEqual([1, 5, 8]);
  });
});
