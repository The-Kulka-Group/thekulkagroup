import { describe, expect, it } from "vitest";

import {
  BARRICADE_RULE,
  BARRICADE_SPACING_LF,
  CAMERA_SERVICE_RULE,
  EXTINGUISHER_SF_EACH,
  FIRE_EXTINGUISHER_RULE,
  GROSS_AREA_RULE,
  HEAT_FUEL_RULE,
  HEAT_LABOR_RULE,
  HEATER_OUTPUT_BTU,
  HEATER_RENTAL_RULE,
  heatersRequired,
  heaterRentalMonths,
  heatFuelGallons,
  heatLaborManDays,
  winterWeeks,
  kwhOverMonths,
  kwhPerDay,
  TEMP_LIGHTING_RULE,
  TEMP_POWER_RULE,
  watts,
  QUANTITY_RULES,
  quantityRuleForRow,
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

describe("every quantity rule states its source", () => {
  it("has a statement, a source with a cell or a decision, and its constants for Matt to confirm", () => {
    for (const rule of QUANTITY_RULES) {
      expect(rule.statement.length).toBeGreaterThan(20);
      expect(rule.source).toMatch(/C-00379|Matt/);
      expect(Array.isArray(rule.forMattToConfirm)).toBe(true);
    }
  });

  it("finds the rule for a rate card row, and none for a row no rule fills", () => {
    expect(quantityRuleForRow("Construction Labor & Clean-up", "Final Cleaning")?.id).toBe("gross_area");
    expect(quantityRuleForRow("Security", "Security Guards")).toBeNull();
  });
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

describe("temporary heat, C-00379's Cold Weather Protection method", () => {
  // C-00379 rows 185 to 200. Its inputs: 5 heaters (W191) for 11 weeks (W192).
  it("rents heaters by the started four-week month: W193 =W191*ROUNDUP(W192/4) gives 15", () => {
    expect(heaterRentalMonths(5, 11)).toBe(15);
  });

  it("takes one laborer a working day of heat: W186 =(W192*5)*1 gives 55 man-days", () => {
    expect(heatLaborManDays(11)).toBe(55);
  });

  it("burns fuel around the clock on working days: U200 =(W199*24*(W192*5))*W191 gives 33,000 gallons", () => {
    expect(heatFuelGallons(5, 11)).toBe(33_000);
  });

  it("sizes heaters from the heat load at 700,000 BTU each (U189), rounded up", () => {
    expect(HEATER_OUTPUT_BTU).toBe(700_000);
    expect(heatersRequired(1_400_000)).toBe(2);
    expect(heatersRequired(1_400_001)).toBe(3);
    // U185 carries 1,305,600 BTUs, =(((8*34)*1200)*4), with no label on its
    // inputs. The method gives 2 heaters from it; the sheet types 5 (W191).
    expect(heatersRequired(1_305_600)).toBe(2);
  });

  it("counts the construction days that fall in December to March, in weeks", () => {
    // C-00379's construction, 2024-10-01 for 456 days, meets 121 winter days
    // in 2024-25 and 30 in December 2025: 151 days. The sheet typed 11 weeks.
    expect(winterWeeks("2024-10-01", 456 / 7)).toBeCloseTo(151 / 7, 6);
    expect(winterWeeks("2025-04-01", 20)).toBe(0);
  });
});

describe("temporary heat lines from the project", () => {
  const winter = { constructionStart: "2025-12-01", constructionWeeks: 8 };

  it("fills heat labor from the winter weeks the schedule crosses", () => {
    expect(HEAT_LABOR_RULE.evaluate(facts(winter))).toEqual({
      ok: true,
      value: 40,
      words: "8 winter weeks × 5 days, one laborer a day",
    });
  });

  it("leaves heat labor blank without a start date, naming it", () => {
    expect(HEAT_LABOR_RULE.evaluate(facts({ constructionWeeks: 60 }))).toMatchObject({
      ok: false,
      missing: ["Construction Start Date"],
    });
  });

  it("leaves heater rental and fuel blank without the building's heat load", () => {
    for (const rule of [HEATER_RENTAL_RULE, HEAT_FUEL_RULE]) {
      expect(rule.evaluate(facts(winter))).toMatchObject({ ok: false, missing: ["Heat Load"] });
    }
  });

  it("fills heater rental and fuel from the heat load and winter weeks", () => {
    const withLoad = facts({ ...winter, heatLoadBtuPerHour: 3_000_000 });
    expect(HEATER_RENTAL_RULE.evaluate(withLoad)).toEqual({
      ok: true,
      value: 10,
      words: "5 heaters × 2 four-week months of winter",
    });
    expect(HEAT_FUEL_RULE.evaluate(withLoad)).toEqual({
      ok: true,
      value: 24_000,
      words: "5 heaters × 5 gal/hr × 24 hours × 40 working days",
    });
  });

  it("gives no number when construction meets no winter week", () => {
    const summer = facts({ constructionStart: "2025-04-01", constructionWeeks: 20, heatLoadBtuPerHour: 3_000_000 });
    for (const rule of [HEAT_LABOR_RULE, HEATER_RENTAL_RULE, HEAT_FUEL_RULE]) {
      const result = rule.evaluate(summer);
      expect(result.ok).toBe(false);
      expect(result.words).toMatch(/no winter/i);
    }
  });
});

describe("temporary power, C-00379's Temporary Utilities method", () => {
  // C-00379's "How to Calculate Kilowatt Hours" notes, AX216 to AX230:
  // amps × volts = watts; × hours a day; ÷ 1,000; × months × 22 days a month.
  it("reproduces the power example: 200 A × 120 V, 8 hours, 12 months gives 50,688 kWh", () => {
    expect(watts(200, 120)).toBe(24_000);
    expect(kwhPerDay(24_000, 8)).toBe(192);
    expect(kwhOverMonths(192, 12)).toBe(50_688);
  });

  it("reproduces the lighting example from its 24,000 W: 24 hours, 8 months gives 101,376 kWh", () => {
    expect(kwhPerDay(24_000, 24)).toBe(576);
    expect(kwhOverMonths(576, 8)).toBe(101_376);
  });

  it("does not repeat the lighting note's slip: 100 A × 120 V is 12,000 W, not 24,000", () => {
    expect(watts(100, 120)).toBe(12_000);
  });

  it("fills the power line's kWh from the temporary service amps and construction months", () => {
    // 30.42 days a month (C-00379 AT11): 52 weeks is 11.966 months.
    const result = TEMP_POWER_RULE.evaluate(facts({ temporaryPowerAmps: 200, constructionWeeks: 52 }));
    expect(result.ok && result.value).toBeCloseTo(50_543.59, 2);
    expect(result.words).toBe("200 A × 120 V × 8 hours a day = 192 kWh a day × 11.97 months × 22 days");
  });

  it("leaves both kWh lines blank without the temporary service amps, naming them", () => {
    expect(TEMP_POWER_RULE.evaluate(facts({ constructionWeeks: 52 }))).toMatchObject({
      ok: false,
      missing: ["Temporary Power Amps"],
    });
    expect(TEMP_LIGHTING_RULE.evaluate(facts({ constructionWeeks: 52 }))).toMatchObject({
      ok: false,
      missing: ["Temporary Lighting Amps"],
    });
  });

  it("marks the example's 120 volts for Matt to confirm", () => {
    expect(TEMP_POWER_RULE.forMattToConfirm).toContain("TEMP_SERVICE_VOLTS");
  });
});
