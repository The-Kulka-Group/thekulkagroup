import type { PlanFigure, PlanLine, ResourcePlan } from "../resource-plan";

// Estimate C-00379, revision 1, 117 N. Long Beach Rd: the "General
// Requirements (GC- CM)" tab of `117 N Long Beach Rd GC's REV1.xlsx`
// (Dropbox, KULKA). Every line the sheet prices (quantity column D set and a
// dollar figure in column AL) is copied here with the row it came from, so the
// golden test rebuilds the tab's own total from its own lines. Each line on the
// tab is D x W x AA: quantity, duration or count, and rate.
//
// The tab's own total (AL247, also V4 "Current TOTAL") is $359,429.69. The
// spec's $389,416 is not produced by these lines. It is Summary!AF36, which
// reads BZ36, a typed figure in the Summary column headed "Rev.3 Orig. Budget
// Numbers". No formula links it to this tab. The gap, $29,986.48, matches no
// line or section here, and Insurances & Bonds prices at $0 on the tab.
//
// Left out, because the sheet prices them at $0: Domestic Water Tank Refill
// (row 225, quantity 1 but no count in W), and rows 64, 77 and 78, which carry
// a $0 or "Included" with no quantity.
//
// The schedule is the tab's own, read from the General Conditions tab:
// construction 2024-10-01 to 2025-12-31 (456 days, 65.14 weeks, 14.99 months
// at 30.42 days a month), close-out 2025-09-01 to 2025-10-01 (30 days). No
// priced line runs over close-out or precon.

const SOURCE = "C-00379";

const sheet = (value: number): PlanFigure => ({ value, origin: "estimator", source: SOURCE });
const rate = (value: number): PlanFigure => ({ value, origin: "rate_card", source: SOURCE });

const LABOR = "Construction Labor & Clean-up";
const SITE = "Site Controls";
const OSHA = "Temporary & OSHA Protection";
const SURVEY = "Surveying, Site Safety & Consultants";
const PERMITS = "Permits, Fees & Expediting";
const COLD = "Cold Weather Protection";
const UTILITIES = "Temporary Utilities";

function unit(row: number, group: string, label: string, unitName: string, quantity: number, unitRate: number): PlanLine {
  return { id: `row-${row}`, label, group, basis: "unit", unit: unitName, quantity: sheet(quantity), rate: rate(unitRate) };
}

function monthly(row: number, group: string, label: string, quantity: number, monthlyRate: number): PlanLine {
  return {
    id: `row-${row}`,
    label,
    group,
    basis: "time",
    per: "month",
    phases: ["construction"],
    quantity: sheet(quantity),
    rate: rate(monthlyRate),
  };
}

/** The tab's own total, AL247, to the dollar. */
export const C00379_GENERAL_REQUIREMENTS_TOTAL = 359_430;

/**
 * The figure the spec quoted: Summary!AF36, a typed "Rev.3 Orig. Budget
 * Numbers" value that no line on the tab produces.
 */
export const C00379_GENERAL_REQUIREMENTS_SUMMARY_FIGURE = 389_416;

/** The tab's section subtotals (column AL, rows 53 to 233), to the dollar. Sections at $0 are not listed. */
export const C00379_GENERAL_REQUIREMENTS_GROUPS = [
  { group: LABOR, amount: 194_143 },
  { group: SITE, amount: 31_868 },
  { group: OSHA, amount: 69_000 },
  { group: SURVEY, amount: 47_500 },
  { group: PERMITS, amount: 2_500 },
  { group: COLD, amount: 3_401 },
  { group: UTILITIES, amount: 11_018 },
];

/**
 * The area each per-area line used, as the tab states it. LA-1394 question 4
 * is open: the General Conditions tab and Project Data carry 68,016 GSF, while
 * two lines here carry a typed 120,000 SF (the tab's "sf Data" cell AL14). The
 * fire extinguisher line computes its count from the 68,016 GSF. The golden
 * test uses each line's own figure, so it does not depend on the answer.
 */
export const C00379_GENERAL_REQUIREMENTS_AREAS = {
  "row-44": { line: "Final Cleaning", area: 120_000, from: "typed 120,000 SF in column W, the tab's sf Data (AL14)" },
  "row-96": { line: "OSHA Protection", area: 120_000, from: "typed 120,000 GSF in column W, the tab's sf Data (AL14)" },
  "row-211": {
    line: "Fire Extinguishers, During Construction",
    area: 68_016,
    from: "GSF / 3,000 in column W, where GSF is Project Data's 68,016, giving 22.672 extinguishers",
  },
} as const;

export const C00379_GENERAL_REQUIREMENTS: ResourcePlan = {
  schedule: {
    precon: sheet(0),
    construction: sheet(456 / 7),
    closeout: sheet(30 / 7),
  },
  confidence: "high",
  lines: [
    // Construction Labor & Clean-up (rows 19 to 52).
    {
      // W21 is the construction weeks less 12.
      id: "row-21",
      label: "Laborer Foreman",
      group: LABOR,
      basis: "time",
      per: "week",
      phases: ["construction"],
      weeks: sheet(456 / 7 - 12),
      quantity: sheet(1),
      rate: rate(1400),
    },
    {
      // One 20 CY pull a week for the construction weeks.
      id: "row-31",
      label: "Dumpsters, 20 CY",
      group: LABOR,
      basis: "time",
      per: "week",
      phases: ["construction"],
      quantity: sheet(1),
      rate: rate(825),
    },
    unit(44, LABOR, "Final Cleaning", "SF", 120_000, 0.55),

    // Site Controls (rows 54 to 92).
    unit(57, SITE, "Webcam, Cameras", "Each", 1, 4000),
    monthly(59, SITE, "Webcam, Cellular Service", 1, 100),
    monthly(60, SITE, "Webcam, Software", 1, 500),
    unit(61, SITE, "Webcam, Installation & Removal", "Each", 1, 600),
    unit(66, SITE, "Temporary Site Fencing, Gates", "Each", 2, 850),
    unit(67, SITE, "Temporary Site Fencing, Fencing", "LF", 800, 20),
    // AA68 is $12 plus 8.75 percent tax.
    unit(68, SITE, "Temporary Site Fencing, Sandbags", "Each", 44, 13.05),

    // Temporary & OSHA Protection (rows 94 to 116).
    unit(96, OSHA, "OSHA Protection", "GSF", 120_000, 0.45),
    unit(105, OSHA, "Barricades, Exterior", "Each", 30, 500),

    // Surveying, Site Safety & Consultants (rows 142 to 161).
    unit(146, SURVEY, "Survey Crew", "Crew Days", 19, 2500),

    // Permits, Fees & Expediting (rows 163 to 180). AH172 is a typed $2,500.
    { id: "row-172", label: "Misc Permits", group: PERMITS, basis: "lump_sum", quantity: sheet(1), rate: rate(2500) },

    // Cold Weather Protection (rows 182 to 212).
    unit(211, COLD, "Fire Extinguishers, During Construction", "Each", 68_016 / 3000, 150),

    // Temporary Utilities (rows 214 to 232).
    monthly(221, UTILITIES, "Port-a-John", 4, 90),
    monthly(223, UTILITIES, "Sanitary Facilities, Sanitary", 1, 250),
    monthly(224, UTILITIES, "Sanitary Facilities, Domestic", 1, 125),
  ],
};
