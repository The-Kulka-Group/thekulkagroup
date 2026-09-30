// Quantities from the project's facts (LA-1401, spec LA-1394). A General
// Requirements line whose quantity follows from the building, such as final
// cleaning by gross area, fills it in from a named rule. Each rule is a pure
// function of the facts and the schedule, and states its rule and its source
// the way a Design and Engineering criterion does (docs/precon/criteria).
//
// Where a rule needs a fact the project lacks, it says which one and gives no
// number. The line's quantity then stays blank and the plan cannot price it
// until the estimator enters one. A blank quantity never prices as zero or one.
//
// Where the source sheet shows a method (C-00379's Cold Weather Protection and
// Temporary Utilities sections), the rule follows it and records the cell.
// A factor that is neither in Kulka's data nor stated by Matt is a named
// constant marked FOR MATT TO CONFIRM.
//
// The estimator's own quantity always wins, until they reset it
// (app/(app)/rom/resource-plan-form.ts). A saved run keeps the quantities it
// recorded: the engine prices a plan's figures as given and derives nothing.

import { WINTER } from "./line-rules";
import { monthsIn } from "./resource-plan";

/** What the rules read. Null where the project has no such fact. */
export type QuantityFacts = {
  /** The project's total gross square feet, garage included (Kulka's single $/SF basis, 2026-09-24). */
  grossSquareFeet: number | null;
  /** Weeks of the construction phase, from the proposed or entered schedule. */
  constructionWeeks: number | null;
  /** The site's perimeter in LF. No question asks for it yet. */
  sitePerimeterLf?: number | null;
  /** The cameras on the plan's own Webcam Cameras line, where it has a quantity. */
  cameraCount?: number | null;
  /** When construction starts, YYYY-MM-DD. No screen asks for it yet. */
  constructionStart?: string | null;
  /** The building's heat load in BTU per hour. No question asks for it, and no criterion works it out yet. */
  heatLoadBtuPerHour?: number | null;
  /** Amps of the temporary power service. No question asks for it yet. */
  temporaryPowerAmps?: number | null;
  /** Amps of the temporary lighting service. No question asks for it yet. */
  temporaryLightingAmps?: number | null;
};

export type QuantityRuleId = "gross_area" | "fire_extinguishers" | "barricades"
  | "camera_service"
  | "heat_labor"
  | "heater_rental"
  | "heat_fuel"
  | "temp_power"
  | "temp_lighting";

/** A derived quantity, or the facts it lacks. */
export type QuantityResult =
  | { ok: true; value: number; words: string }
  | { ok: false; missing: string[]; words: string };

export type QuantityRule = {
  id: QuantityRuleId;
  name: string;
  /** Where the quantity came from: a project fact, or the schedule alone. */
  origin: "fact" | "schedule";
  /**
   * The unit the line is priced by, where it differs from the rate card row's
   * basis. C-00379 prices heater rental by the heater-month (W193), although
   * the row's unit is months.
   */
  unit?: string;
  /** The rate card rows (section and item) whose quantity the rule fills. */
  rows: readonly { section: string; item: string }[];
  /** The rule in one sentence. */
  statement: string;
  /** Where the rule and its figures come from, with the sheet's cells. */
  source: string;
  /** The named constants in the rule that are for Matt to confirm. Empty where none are. */
  forMattToConfirm: readonly string[];
  evaluate: (facts: QuantityFacts) => QuantityResult;
};

const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const count = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function noNumber(words: string): QuantityResult {
  return { ok: false, missing: [], words: `Enter a quantity: ${words}` };
}

function missing(...facts: string[]): QuantityResult {
  const list = facts.map((fact) => fact.toLowerCase());
  const words = list.length === 1 ? list[0] : `${list.slice(0, -1).join(", ")} or ${list[list.length - 1]}`;
  return { ok: false, missing: facts, words: `Enter a quantity: the project has no ${words}` };
}

// ---- Gross area ---------------------------------------------------------

export const GROSS_AREA_RULE: QuantityRule = {
  id: "gross_area",
  name: "Gross Area",
  origin: "fact",
  rows: [
    { section: "Construction Labor & Clean-up", item: "Final Cleaning" },
    { section: "Temporary & OSHA Protection", item: "OSHA Protection" },
    { section: "Temporary & OSHA Protection", item: "Exterminating" },
    { section: "Temporary & OSHA Protection", item: "Finish Floor Protection" },
  ],
  statement: "The quantity is the project's total gross square feet, garage included.",
  source:
    "Matt, 2026-09-24: every per-area line prices on total gross square feet including garage. C-00379 uses two areas: W44, W96 and W115 carry 120,000 SF, the building footprint (Program Data AC20), and W110 carries the GSF name, 68,016 (Program Data V61), a typed figure nothing on the sheet explains.",
  forMattToConfirm: [],
  evaluate(facts) {
    if (!known(facts.grossSquareFeet)) return missing("Gross Square Feet");
    return { ok: true, value: facts.grossSquareFeet, words: `${count(facts.grossSquareFeet)} SF, the project's gross square feet` };
  },
};

// ---- Fire extinguishers -------------------------------------------------

/** Square feet per extinguisher during construction: C-00379 W211, =GSF/3000. */
export const EXTINGUISHER_SF_EACH = 3000;

export const FIRE_EXTINGUISHER_RULE: QuantityRule = {
  id: "fire_extinguishers",
  name: "Fire Extinguishers",
  origin: "fact",
  rows: [{ section: "Cold Weather Protection", item: "Fire Extinguishers - During Construction" }],
  statement: `One extinguisher per ${count(EXTINGUISHER_SF_EACH)} SF of gross area, not rounded, as the sheet prices it.`,
  source:
    "C-00379 W211, =GSF/3000, which gives 22.672 on its 68,016 GSF. The sheet does not round the count, so neither does the rule. The area is the project's total gross square feet (Matt, 2026-09-24).",
  forMattToConfirm: [],
  evaluate(facts) {
    if (!known(facts.grossSquareFeet)) return missing("Gross Square Feet");
    return {
      ok: true,
      value: facts.grossSquareFeet / EXTINGUISHER_SF_EACH,
      words: `${count(facts.grossSquareFeet)} SF ÷ ${count(EXTINGUISHER_SF_EACH)} SF each`,
    };
  },
};

// ---- Exterior barricades ------------------------------------------------

/**
 * FOR MATT TO CONFIRM. Linear feet of site perimeter per exterior barricade.
 * C-00379 types 30 barricades (W105) and a 1,800 LF site perimeter (Program
 * Data AC15), which imply 60 LF each; the sheet has no formula linking them.
 */
export const BARRICADE_SPACING_LF = 60;

export const BARRICADE_RULE: QuantityRule = {
  id: "barricades",
  name: "Exterior Barricades",
  origin: "fact",
  rows: [{ section: "Temporary & OSHA Protection", item: "Barricades [Exterior]" }],
  statement: `One exterior barricade per ${BARRICADE_SPACING_LF} LF of site perimeter, rounded up.`,
  source:
    "C-00379 types 30 barricades (W105) on a 1,800 LF site perimeter (Program Data AC15). The 60 LF spacing is what those two figures imply, not a formula on the sheet, so it is for Matt to confirm. No New Budget question asks for the site perimeter yet, so the line stays blank until the estimator enters it.",
  forMattToConfirm: ["BARRICADE_SPACING_LF"],
  evaluate(facts) {
    if (!known(facts.sitePerimeterLf)) return missing("Site Perimeter");
    return {
      ok: true,
      value: Math.ceil(facts.sitePerimeterLf / BARRICADE_SPACING_LF),
      words: `${count(facts.sitePerimeterLf)} LF site perimeter ÷ ${BARRICADE_SPACING_LF} LF each`,
    };
  },
};

// ---- Webcam service -----------------------------------------------------

export const CAMERA_SERVICE_RULE: QuantityRule = {
  id: "camera_service",
  name: "Webcam Service",
  origin: "fact",
  rows: [
    { section: "Site Controls", item: "Webcam - Video, Cellular Service" },
    { section: "Site Controls", item: "Webcam - Video, Software" },
  ],
  statement: "One cellular service and one software licence per camera, for the months of construction.",
  source:
    "C-00379 W59 and W60, =W57*months: the camera count (W57) times the construction months. The months come from the line's phases; the count comes from the plan's Webcam Cameras line, which the estimator enters.",
  forMattToConfirm: [],
  evaluate(facts) {
    if (!known(facts.cameraCount)) return missing("Camera Count");
    const n = facts.cameraCount;
    return { ok: true, value: n, words: `One per camera, ${count(n)} ${n === 1 ? "camera" : "cameras"} on this plan` };
  },
};

// ---- Temporary heat -----------------------------------------------------
//
// C-00379's Cold Weather Protection section (rows 184 to 202) sizes temporary
// heat from BTUs required, heaters, weeks of heat and fuel. On that job every
// row was left unpriced (column D blank), but the formulas stand. Its inputs
// are 5 heaters (W191, typed) for 11 weeks (W192, typed).

/** Output of one IDF-700 indirect ducted heater, BTU per hour: C-00379 U189. */
export const HEATER_OUTPUT_BTU = 700_000;

/** Fuel one heater burns, gallons per hour: C-00379 W199. */
export const HEATER_FUEL_GPH = 5;

/** Hours a day the heaters run: C-00379 U200 (the 24 in its formula). */
export const HEAT_HOURS_PER_DAY = 24;

/** Working days a week of heat: C-00379 W186 and U200 (the 5 in their formulas). */
export const HEAT_DAYS_PER_WEEK = 5;

/** Weeks per heater rental month, rounded up: C-00379 W193, ROUNDUP(W192/4). */
export const HEAT_WEEKS_PER_RENTAL_MONTH = 4;

/** Heaters to meet a heat load, rounded up. The sheet does not link the two; the ticket asks for it. */
export function heatersRequired(heatLoadBtuPerHour: number): number {
  return Math.ceil(heatLoadBtuPerHour / HEATER_OUTPUT_BTU);
}

/** Heater-months of rental: C-00379 W193, =W191*ROUNDUP(W192/4). */
export function heaterRentalMonths(heaters: number, heatWeeks: number): number {
  return heaters * Math.ceil(heatWeeks / HEAT_WEEKS_PER_RENTAL_MONTH);
}

/** Man-days of heat labor, one laborer each working day: C-00379 W186, =(W192*5)*1. */
export function heatLaborManDays(heatWeeks: number): number {
  return heatWeeks * HEAT_DAYS_PER_WEEK;
}

/** Gallons of fuel: C-00379 U200, =(W199*24*(W192*5))*W191. */
export function heatFuelGallons(heaters: number, heatWeeks: number): number {
  return HEATER_FUEL_GPH * HEAT_HOURS_PER_DAY * heatWeeks * HEAT_DAYS_PER_WEEK * heaters;
}

const DAY_MS = 86_400_000;

/**
 * Weeks of construction that fall in winter, December to March (line-rules.ts
 * WINTER, for Matt to confirm), counted day by day from the start date.
 * Null without a readable start date or construction weeks.
 */
export function winterWeeks(start: string | null | undefined, constructionWeeks: number | null): number | null {
  if (typeof start !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(start) || !known(constructionWeeks)) return null;
  const from = Date.parse(`${start}T00:00:00Z`);
  if (!Number.isFinite(from)) return null;
  let days = 0;
  for (let day = 0; day < constructionWeeks * 7; day += 1) {
    const month = new Date(from + day * DAY_MS).getUTCMonth() + 1;
    if (month >= WINTER.startMonth || month <= WINTER.endMonth) days += 1;
  }
  return days / 7;
}

const weeksText = (n: number) => `${count(n)} winter ${n === 1 ? "week" : "weeks"}`;

/** The winter weeks a heat rule works from, or why it has none. */
function heatWeeksOf(facts: QuantityFacts): number | QuantityResult {
  if (!known(facts.constructionWeeks)) return missing("Construction Weeks");
  const weeks = winterWeeks(facts.constructionStart, facts.constructionWeeks);
  if (weeks === null) return missing("Construction Start Date");
  if (weeks === 0) return noNumber("construction meets no winter week");
  return weeks;
}

const HEAT_SOURCE =
  "C-00379's Cold Weather Protection section, rows 184 to 202. Its weeks of heat (W192) are typed; here they are the construction days that fall in December to March (WINTER in line-rules.ts, for Matt to confirm), which needs a start date no screen asks for yet. On C-00379's own dates that gives 21.6 weeks against the sheet's typed 11.";

export const HEAT_LABOR_RULE: QuantityRule = {
  id: "heat_labor",
  name: "Temporary Heat Labor",
  origin: "schedule",
  rows: [{ section: "Cold Weather Protection", item: "Temporary Heat & Protection, Temporary Heat & Prot. - Labor" }],
  statement: "One laborer each working day of winter construction, five days a week.",
  source: `W186, =(W192*5)*1. ${HEAT_SOURCE}`,
  forMattToConfirm: ["WINTER"],
  evaluate(facts) {
    const weeks = heatWeeksOf(facts);
    if (typeof weeks !== "number") return weeks;
    return { ok: true, value: heatLaborManDays(weeks), words: `${weeksText(weeks)} × ${HEAT_DAYS_PER_WEEK} days, one laborer a day` };
  },
};

/** The heaters and winter weeks both heater rules work from, or why they have none. */
function heatersAndWeeks(facts: QuantityFacts): { heaters: number; weeks: number } | QuantityResult {
  if (!known(facts.heatLoadBtuPerHour)) return missing("Heat Load");
  const weeks = heatWeeksOf(facts);
  if (typeof weeks !== "number") return weeks;
  return { heaters: heatersRequired(facts.heatLoadBtuPerHour), weeks };
}

export const HEATER_RENTAL_RULE: QuantityRule = {
  id: "heater_rental",
  name: "Heater Rental",
  origin: "fact",
  unit: "Heater-Months",
  rows: [{ section: "Cold Weather Protection", item: "Heater Type: Indirect Heaters (Ducted), Heaters Required, Total Heater Rental" }],
  statement: `Heaters to meet the heat load at ${count(HEATER_OUTPUT_BTU)} BTU each, rented by the started four-week month of winter construction.`,
  source: `W193, =W191*ROUNDUP(W192/4), and U189 (700,000 BTU a heater). The sheet types its 5 heaters (W191) rather than sizing them; its BTUs Required (U185, 1,305,600) would give 2. No question asks for the heat load yet. ${HEAT_SOURCE}`,
  forMattToConfirm: ["WINTER"],
  evaluate(facts) {
    const inputs = heatersAndWeeks(facts);
    if (!("heaters" in inputs)) return inputs;
    const months = Math.ceil(inputs.weeks / HEAT_WEEKS_PER_RENTAL_MONTH);
    return {
      ok: true,
      value: heaterRentalMonths(inputs.heaters, inputs.weeks),
      words: `${inputs.heaters} ${inputs.heaters === 1 ? "heater" : "heaters"} × ${months} four-week ${months === 1 ? "month" : "months"} of winter`,
    };
  },
};

export const HEAT_FUEL_RULE: QuantityRule = {
  id: "heat_fuel",
  name: "Heater Fuel",
  origin: "fact",
  rows: [
    {
      section: "Cold Weather Protection",
      item: "Temporary Heat & Protection, Temporary Heat & Prot. - Fuel, Total Fuel Consumption",
    },
  ],
  statement: `Each heater burns ${HEATER_FUEL_GPH} gallons an hour, ${HEAT_HOURS_PER_DAY} hours a day, on each working day of winter construction.`,
  source: `U200, =(W199*24*(W192*5))*W191, with W199 (5 gallons an hour). No question asks for the heat load yet. ${HEAT_SOURCE}`,
  forMattToConfirm: ["WINTER"],
  evaluate(facts) {
    const inputs = heatersAndWeeks(facts);
    if (!("heaters" in inputs)) return inputs;
    return {
      ok: true,
      value: heatFuelGallons(inputs.heaters, inputs.weeks),
      words: `${inputs.heaters} ${inputs.heaters === 1 ? "heater" : "heaters"} × ${HEATER_FUEL_GPH} gal/hr × ${HEAT_HOURS_PER_DAY} hours × ${count(heatLaborManDays(inputs.weeks))} working days`,
    };
  },
};

// ---- Temporary power ----------------------------------------------------
//
// C-00379's Temporary Utilities section prices Power and Lighting by the kWh
// (rows 217 and 218, $0.25) and shows its method in the notes headed "How to
// Calculate Kilowatt Hours" (AS216 to AX230): amps × volts = watts; watts ×
// hours a day; ÷ 1,000 = kWh a day; × months × 22 days a month. Its worked
// example: power, 200 A × 120 V, 8 hours, 12 months = 50,688 kWh; lighting,
// 24,000 W, 24 hours, 8 months = 101,376 kWh. The lighting note starts from
// "100 Amps x 120v = 24,000 watts", which is 12,000 W; the rule does the
// arithmetic, so it does not carry that slip. Both rows were left unpriced on
// that job and are marked for the Owner.

/**
 * FOR MATT TO CONFIRM. Volts of the temporary service. 120 V is the sheet's
 * worked example (AX223), not that job's service.
 */
export const TEMP_SERVICE_VOLTS = 120;

/** Hours a day temporary power runs: the sheet's example, AX225 (normal working hours). */
export const TEMP_POWER_HOURS_PER_DAY = 8;

/** Hours a day temporary lighting runs: the sheet's example, AX226. */
export const TEMP_LIGHTING_HOURS_PER_DAY = 24;

/** Days a month of consumption: the sheet's example, AX229 and AX230. */
export const TEMP_DAYS_PER_MONTH = 22;

export function watts(amps: number, volts: number): number {
  return amps * volts;
}

export function kwhPerDay(wattsDrawn: number, hoursPerDay: number): number {
  return (wattsDrawn * hoursPerDay) / 1000;
}

export function kwhOverMonths(kwhADay: number, months: number): number {
  return kwhADay * months * TEMP_DAYS_PER_MONTH;
}

function kwhRule(
  id: "temp_power" | "temp_lighting",
  name: string,
  item: string,
  fact: string,
  ampsOf: (facts: QuantityFacts) => number | null | undefined,
  hours: number,
  hoursConstant: string,
): QuantityRule {
  return {
    id,
    name,
    origin: "fact",
    rows: [{ section: "Temporary Utilities", item }],
    statement: `The temporary service's amps × ${TEMP_SERVICE_VOLTS} V × ${hours} hours a day, in kWh, × the months of construction × ${TEMP_DAYS_PER_MONTH} days a month.`,
    source: `C-00379's "How to Calculate Kilowatt Hours" notes, AS216 to AX230, with ${hoursConstant} and ${TEMP_DAYS_PER_MONTH} days a month from its example. The example types its months (12 and 8); here they are the construction weeks at 30.42 days a month (AT11). No question asks for the service's amps yet.`,
    forMattToConfirm: ["TEMP_SERVICE_VOLTS"],
    evaluate(facts) {
      const amps = ampsOf(facts);
      const lacking = [...(known(amps) ? [] : [fact]), ...(known(facts.constructionWeeks) ? [] : ["Construction Weeks"])];
      if (lacking.length > 0) return missing(...lacking);
      const daily = kwhPerDay(watts(amps as number, TEMP_SERVICE_VOLTS), hours);
      const months = monthsIn(facts.constructionWeeks as number);
      return {
        ok: true,
        value: kwhOverMonths(daily, months),
        words: `${count(amps as number)} A × ${TEMP_SERVICE_VOLTS} V × ${hours} hours a day = ${count(daily)} kWh a day × ${count(months)} months × ${TEMP_DAYS_PER_MONTH} days`,
      };
    },
  };
}

export const TEMP_POWER_RULE = kwhRule(
  "temp_power",
  "Temporary Power",
  "Electrical Consumption, Power (Normal Working Hours)",
  "Temporary Power Amps",
  (facts) => facts.temporaryPowerAmps,
  TEMP_POWER_HOURS_PER_DAY,
  "8 hours a day (AX225)",
);

export const TEMP_LIGHTING_RULE = kwhRule(
  "temp_lighting",
  "Temporary Lighting",
  "Electrical Consumption, Lighting",
  "Temporary Lighting Amps",
  (facts) => facts.temporaryLightingAmps,
  TEMP_LIGHTING_HOURS_PER_DAY,
  "24 hours a day (AX226)",
);

// ---- All rules ----------------------------------------------------------

export const QUANTITY_RULES: readonly QuantityRule[] = [
  GROSS_AREA_RULE,
  FIRE_EXTINGUISHER_RULE,
  BARRICADE_RULE,
  CAMERA_SERVICE_RULE,
  HEAT_LABOR_RULE,
  HEATER_RENTAL_RULE,
  HEAT_FUEL_RULE,
  TEMP_POWER_RULE,
  TEMP_LIGHTING_RULE,
];

export function quantityRuleById(id: string): QuantityRule | null {
  return QUANTITY_RULES.find((rule) => rule.id === id) ?? null;
}

/** The rule that fills a rate card row's quantity, or null where none does. */
export function quantityRuleForRow(section: string, item: string): QuantityRule | null {
  return QUANTITY_RULES.find((rule) => rule.rows.some((row) => row.section === section && row.item === item)) ?? null;
}
