import { describe, expect, it } from "vitest";

import {
  BARRICADE_RULE,
  BARRICADE_SPACING_LF,
  CAMERA_SERVICE_RULE,
  EXTINGUISHER_SF_EACH,
  FIRE_EXTINGUISHER_RULE,
  GROSS_AREA_RULE,
  type QuantityFacts,
} from "./quantity-rules";

// LA-1401. Each derived quantity is a pure function of the project's facts
// and the schedule. Each test names its source: a cell on estimate C-00379's
// General Requirements tab (`117 N Long Beach Rd GC's REV1.xlsx`), a decision
// Matt stated, or a constant marked for Matt to confirm. A rule that lacks a
// fact names the fact and gives no number.

const facts = (over: Partial<QuantityFacts> = {}): QuantityFacts => ({
  grossSquareFeet: null,
  constructionWeeks: null,
  ...over,
});

describe("gross area (final cleaning, OSHA protection, exterminating, floor protection)", () => {
  // Matt, 2026-09-24: every per-area line uses the project's total gross
  // square feet, garage included. C-00379 W44 and W96 carry a typed 120,000,
  // the building footprint on Program Data AC20.
  it("takes the project's total gross square feet", () => {
    expect(GROSS_AREA_RULE.evaluate(facts({ grossSquareFeet: 188_522 }))).toEqual({
      ok: true,
      value: 188_522,
      words: "188,522 SF, the project's gross square feet",
    });
  });

  it("reproduces C-00379's Final Cleaning quantity from its own area", () => {
    const result = GROSS_AREA_RULE.evaluate(facts({ grossSquareFeet: 120_000 }));
    expect(result.ok && result.value).toBe(120_000);
  });

  it("names the missing fact rather than guessing", () => {
    expect(GROSS_AREA_RULE.evaluate(facts())).toEqual({
      ok: false,
      missing: ["Gross Square Feet"],
      words: "Enter a quantity: the project has no gross square feet",
    });
  });
});

describe("fire extinguishers during construction", () => {
  // C-00379 W211: =GSF/3000, one extinguisher per 3,000 SF, not rounded.
  it("takes one per 3,000 SF, as the sheet's own formula", () => {
    expect(EXTINGUISHER_SF_EACH).toBe(3000);
  });

  it("reproduces C-00379's 22.672 from its 68,016 GSF", () => {
    const result = FIRE_EXTINGUISHER_RULE.evaluate(facts({ grossSquareFeet: 68_016 }));
    expect(result).toEqual({ ok: true, value: 22.672, words: "68,016 SF ÷ 3,000 SF each" });
  });

  it("names the missing area", () => {
    expect(FIRE_EXTINGUISHER_RULE.evaluate(facts())).toMatchObject({ ok: false, missing: ["Gross Square Feet"] });
  });
});

describe("exterior barricades (spacing for Matt to confirm)", () => {
  // C-00379 types 30 barricades (W105) on a 1,800 LF site perimeter (Program
  // Data AC15). The sheet has no formula; 60 LF each is what those two imply.
  it("reproduces C-00379's 30 from its 1,800 LF perimeter", () => {
    expect(BARRICADE_RULE.evaluate(facts({ sitePerimeterLf: 1800 }))).toEqual({
      ok: true,
      value: 30,
      words: "1,800 LF site perimeter ÷ 60 LF each",
    });
  });

  it("rounds up to whole barricades", () => {
    const result = BARRICADE_RULE.evaluate(facts({ sitePerimeterLf: 1801 }));
    expect(result.ok && result.value).toBe(31);
  });

  it("stays blank and names the site perimeter when the project has none", () => {
    expect(BARRICADE_RULE.evaluate(facts({ grossSquareFeet: 120_000 }))).toEqual({
      ok: false,
      missing: ["Site Perimeter"],
      words: "Enter a quantity: the project has no site perimeter",
    });
  });

  it("marks the spacing for Matt to confirm", () => {
    expect(BARRICADE_SPACING_LF).toBe(60);
    expect(BARRICADE_RULE.forMattToConfirm).toEqual(["BARRICADE_SPACING_LF"]);
  });
});

describe("webcam cellular service and software (one per camera)", () => {
  // C-00379 W59 and W60: =W57*months, one service per camera (W57).
  it("takes the plan's camera count", () => {
    expect(CAMERA_SERVICE_RULE.evaluate(facts({ cameraCount: 2 }))).toEqual({
      ok: true,
      value: 2,
      words: "One per camera, 2 cameras on this plan",
    });
  });

  it("stays blank until the plan has a camera count", () => {
    expect(CAMERA_SERVICE_RULE.evaluate(facts())).toMatchObject({ ok: false, missing: ["Camera Count"] });
  });
});
