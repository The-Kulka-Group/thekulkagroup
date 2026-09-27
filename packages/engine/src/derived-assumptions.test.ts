import { describe, expect, it } from "vitest";

import {
  applyCorrection,
  changedCriteria,
  effectiveValue,
  formatDerivedValue,
  InvalidDerivedAssumption,
  rederive,
  restsOnAssumedFact,
  revertCorrection,
  showsAssumedFact,
  validateDerivedAssumption,
  type DerivedAssumption,
  type DerivedCorrection,
} from "./derived-assumptions";

// LA-860. Every figure is synthetic, for the logic only. None is a Kulka
// number or a real code result.

function assumption(over: Partial<DerivedAssumption> = {}): DerivedAssumption {
  return {
    kind: "derived_assumption",
    code: "M-1",
    label: "HVAC Cooling Capacity",
    value: { kind: "quantity", amount: 148, unit: "Tons" },
    method: "Synthetic rule of thumb",
    inputs: [
      { name: "Gross Area", value: "59,200 SF", basis: "stated" },
      { name: "Climate Zone", value: "4A", basis: "stated" },
    ],
    steps: [
      { label: "Gross area", result: "59,200 SF" },
      { label: "Cooling capacity", result: "148 tons" },
    ],
    confidence: "low",
    confidenceReason: "A synthetic rule of thumb.",
    costCodes: ["23-100"],
    correction: null,
    ...over,
  };
}

const correction: DerivedCorrection = {
  value: { kind: "quantity", amount: 160, unit: "Tons" },
  reason: "Synthetic: mechanical engineer's early number",
  correctedBy: "estimator@kulka.invalid",
  correctedAt: "2026-09-27T15:00:00.000Z",
};

describe("restsOnAssumedFact", () => {
  it("is false when every input is stated", () => {
    expect(restsOnAssumedFact(assumption())).toBe(false);
  });

  it("is true as soon as any one input is assumed", () => {
    const leaning = assumption({
      inputs: [
        { name: "Gross Area", value: "59,200 SF", basis: "stated" },
        { name: "Climate Zone", value: "4A", basis: "assumed" },
      ],
    });
    expect(restsOnAssumedFact(leaning)).toBe(true);
    expect(showsAssumedFact(leaning)).toBe(true);
  });

  it("stops flagging the card once the estimator corrects it", () => {
    const leaning = assumption({ inputs: [{ name: "Climate Zone", value: "4A", basis: "assumed" }] });
    const corrected = applyCorrection(leaning, correction);
    expect(restsOnAssumedFact(corrected)).toBe(true);
    expect(showsAssumedFact(corrected)).toBe(false);
  });
});

describe("applyCorrection and revertCorrection", () => {
  it("makes the correction win and keeps Jev's value underneath", () => {
    const corrected = applyCorrection(assumption(), correction);
    expect(effectiveValue(corrected)).toEqual(correction.value);
    expect(corrected.value).toEqual({ kind: "quantity", amount: 148, unit: "Tons" });
  });

  it("goes back to Jev's value on revert", () => {
    const reverted = revertCorrection(applyCorrection(assumption(), correction));
    expect(reverted.correction).toBeNull();
    expect(effectiveValue(reverted)).toEqual({ kind: "quantity", amount: 148, unit: "Tons" });
  });

  it("refuses a correction with no reason", () => {
    expect(() => applyCorrection(assumption(), { ...correction, reason: "  " })).toThrow(InvalidDerivedAssumption);
  });

  it("refuses words where Jev proposed a quantity, and a different unit", () => {
    expect(() => applyCorrection(assumption(), { ...correction, value: { kind: "spec", text: "More" } })).toThrow(
      "Correct a quantity with a number.",
    );
    expect(() =>
      applyCorrection(assumption(), { ...correction, value: { kind: "quantity", amount: 5, unit: "kW" } }),
    ).toThrow("Correct this quantity in Tons.");
  });
});

describe("rederive after a fact change", () => {
  it("takes Jev's new value when nobody corrected it", () => {
    const next = assumption({ value: { kind: "quantity", amount: 170, unit: "Tons" } });
    expect(effectiveValue(rederive(assumption(), next))).toEqual(next.value);
  });

  it("keeps the estimator's value when it was corrected, with Jev's new value underneath", () => {
    const previous = applyCorrection(assumption(), correction);
    const next = assumption({ value: { kind: "quantity", amount: 170, unit: "Tons" } });
    const merged = rederive(previous, next);
    expect(effectiveValue(merged)).toEqual(correction.value);
    expect(merged.value).toEqual(next.value);
  });

  it("names only the criteria whose shown value moved", () => {
    const before = [assumption(), applyCorrection(assumption({ code: "V-1" }), correction)];
    const after = [
      assumption({ value: { kind: "quantity", amount: 170, unit: "Tons" } }),
      rederive(before[1], assumption({ code: "V-1", value: { kind: "quantity", amount: 99, unit: "Tons" } })),
    ];
    expect(changedCriteria(before, after)).toEqual(["M-1"]);
  });
});

describe("validateDerivedAssumption", () => {
  it("accepts a whole record", () => {
    expect(() => validateDerivedAssumption(assumption())).not.toThrow();
  });

  it("refuses a record with no facts or no arithmetic", () => {
    expect(() => validateDerivedAssumption(assumption({ inputs: [] }))).toThrow(InvalidDerivedAssumption);
    expect(() => validateDerivedAssumption(assumption({ steps: [] }))).toThrow(InvalidDerivedAssumption);
  });
});

describe("formatDerivedValue", () => {
  it("shows a quantity with its unit and a spec in its own words", () => {
    expect(formatDerivedValue({ kind: "quantity", amount: 1480, unit: "Tons" })).toBe("1,480 Tons");
    expect(formatDerivedValue({ kind: "spec", text: "NFPA 13R, Wet-Pipe" })).toBe("NFPA 13R, Wet-Pipe");
  });
});
