import type { PlanFigure, PlanLine, ResourcePlan } from "../resource-plan";

// Estimate C-00379, revision 1, 117 N. Long Beach Rd: the "General Conditions
// (GC-CM)" tab of `117 N Long Beach Rd GC's REV1.xlsx` (Dropbox, KULKA). Every
// line the sheet prices (quantity column D set) is copied here with the row it
// came from, so the golden test rebuilds the sheet's own $727,230 from its own
// lines and schedule. Rows the sheet lists but leaves at no quantity are not
// priced by the sheet and are left out.
//
// The schedule is the sheet's own dates, in weeks of seven calendar days:
// precon starts and finishes 2024-03-01 (0 days), construction runs
// 2024-10-01 to 2025-12-31 (456 days, the sheet's S13), close-out runs
// 2025-09-01 to 2025-10-01 (30 days, AE13). The sheet converts days to months
// at 30.42 days a month (AT11). Its rate multiplier (AT2) is 1.0.
//
// Staff rates are the sheet's daily rates (column AT, "Daily" at 1.0); the
// sheet's weekly figure (column AA) is that rate times the days per week in
// column U, so a Sr. Project Manager at 2 days is $1,300 x 2 = $2,600/week.

const SOURCE = "C-00379";

const sheet = (value: number): PlanFigure => ({ value, origin: "estimator", source: SOURCE });
const rate = (value: number): PlanFigure => ({ value, origin: "rate_card", source: SOURCE });

function role(row: number, label: string, daysPerWeek: number, dailyRate: number): PlanLine {
  return {
    id: `row-${row}`,
    label,
    group: "Staff",
    basis: "time",
    per: "day",
    daysPerWeek: sheet(daysPerWeek),
    phases: ["construction"],
    quantity: sheet(1),
    rate: rate(dailyRate),
  };
}

function monthly(row: number, label: string, monthlyRate: number): PlanLine {
  return {
    id: `row-${row}`,
    label,
    group: "Field Office",
    basis: "time",
    per: "month",
    phases: ["construction"],
    quantity: sheet(1),
    rate: rate(monthlyRate),
  };
}

function lumpSum(row: number, label: string, amount: number, group = "Field Office"): PlanLine {
  return { id: `row-${row}`, label, group, basis: "lump_sum", quantity: sheet(1), rate: rate(amount) };
}

export const C00379_GENERAL_CONDITIONS_TOTAL = 727_230;

/** The sheet's subtotals (rows 57, 209 and 220), to the dollar. */
export const C00379_GENERAL_CONDITIONS_GROUPS = [
  { group: "Staff", amount: 663_076 },
  { group: "Field Office", amount: 61_154 },
  { group: "General Expenses", amount: 3_000 },
];

export const C00379_GENERAL_CONDITIONS: ResourcePlan = {
  schedule: {
    precon: sheet(0),
    construction: sheet(456 / 7),
    closeout: sheet(30 / 7),
  },
  confidence: "high",
  lines: [
    // Construction staffing (rows 35 to 55): three roles carry a quantity.
    role(37, "Sr. Project Manager", 2, 1300),
    role(39, "Asst. Project Manager", 3, 563.6),
    role(47, "Senior Superintendent", 5, 1177.6),

    // Field offices and expenses (rows 69 to 208).
    monthly(70, "Field Office, Kulka Superintendent, Single Wide 12' x 60'", 800),
    lumpSum(72, "Single Wide Set-Up", 5525),
    lumpSum(91, "Relocate Single Wide Field Office", 5525),
    lumpSum(109, "Office Supplies, Kulka Superintendent Office", 500),
    lumpSum(116, "Field Office Equipment (Desks, File Cabinets), Kulka Superintendent Office", 2000),
    lumpSum(125, "Field Office Computer, Sr. Project Manager", 2750),
    lumpSum(135, "Field Office Computer, Senior Superintendent", 2750),
    lumpSum(152, "Tel/Data Service, Kulka Superintendent Office", 500),
    lumpSum(159, "Networking/Printer Setup, Kulka Superintendent Office", 3200),
    monthly(166, "ISP Service, Kulka Superintendent Office", 175),
    monthly(180, "Field Equipment", 250),
    monthly(189, "Storage Containers", 150),
    {
      id: "row-192",
      label: "Medical Kit, Field Office",
      group: "Field Office",
      basis: "unit",
      unit: "Each",
      quantity: sheet(1),
      rate: rate(500),
    },
    monthly(198, "Progress Photographs", 600),
    lumpSum(201, "Kulka Signage", 2000),
    lumpSum(202, "Project ID Sign", 2500),
    lumpSum(203, "Safety Signs", 2000),
    monthly(204, "Drinking Water", 120),

    // General expenses (rows 211 to 219).
    lumpSum(212, "Blueprinting", 3000, "General Expenses"),
  ],
};
