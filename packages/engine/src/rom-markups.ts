// The markup waterfall below the ROM's trade subtotal (LA-1016).
//
// ADR 0004 files General Conditions at 90 20 00, fee at 90 30 00 and
// insurance at 90 40 00, and each computes on the running total of everything
// above it. So fee lands on the subtotal plus the GRs/GCs line, and insurance
// lands on the subtotal plus GRs/GCs plus fee.
//
// Like rom.ts, this is a pure function of its arguments. Every number it
// prints traces to a history row, a rate table row, an engine parameter with
// provenance, or a figure the user typed. Where none of those exists, the
// GRs/GCs line is TBD and sits outside the total rather than being guessed.

import type { EngineParameter } from "./rom";

/**
 * How a budget files General Requirements and General Conditions. "both" is
 * one combined line, the way four of Kulka's six budgets file it (ADR 0004).
 */
export type MarkupSetup = "both" | "gc_only" | "gr_only";

/**
 * How the GRs/GCs line is priced. `pct_of_subtotal` and `usd_per_gsf` read a
 * rate learned from imported budgets; `staffing_duration` prices a staffing
 * plan and field-office items the user picks over a job duration, because
 * general conditions are the costs that keep running when a job runs long.
 */
export type MarkupMethod = "pct_of_subtotal" | "usd_per_gsf" | "staffing_duration";

export type StaffPick = {
  /** A gc_staffing_rates row id. */
  rateId: string;
  /** Weeks this role is on the job. Defaults to the job duration. */
  weeks?: number;
};

export type FieldOfficePick = {
  /** A gc_field_office_rates row id. */
  rateId: string;
  /** How many of the item. Defaults to one. */
  quantity?: number;
};

/** What the user chose for the markups on one ROM. Recorded with the run's answers. */
export type MarkupChoices = {
  setup: MarkupSetup;
  method: MarkupMethod;
  /**
   * The user's own rate in place of history. A fraction of the subtotal for
   * `pct_of_subtotal` (0.12 is 12 percent), dollars per gross square foot for
   * `usd_per_gsf`. Ignored by `staffing_duration`.
   */
  overrideRate?: number;
  /** Job duration in weeks. Required by `staffing_duration`. */
  durationWeeks?: number;
  staff?: StaffPick[];
  fieldOffice?: FieldOfficePick[];
  /** The user's fee rate in place of the `fee.rate` parameter, as a fraction. */
  feeRate?: number;
  /** The user's insurance rate in place of the `insurance.rate` parameter, as a fraction. */
  insuranceRate?: number;
};

/** What a ROM runs with when the request names no markup choices. */
export const DEFAULT_MARKUP_CHOICES: MarkupChoices = {
  setup: "both",
  method: "pct_of_subtotal",
};

/** One real GRs/GCs figure from an imported budget (the markup_history table). */
export type MarkupHistoryRow = {
  projectId: string;
  projectName: string;
  setup: MarkupSetup;
  usdPerGsf: number;
  /** A fraction: 0.1573 is 15.73 percent of that budget's trade subtotal. */
  pctOfSubtotal: number;
  exportLabel: string;
  recordedBy: string;
  recordedAt: string;
};

/** One gc_staffing_rates row. */
export type StaffingRate = {
  id: string;
  role: string;
  daysPerWeek: number;
  weeklyRateLow: number;
  weeklyRateHigh: number;
  sourceEstimate: string;
};

export type FieldOfficeRateBasis = "monthly" | "lump_sum" | "each" | "lump_sum_then_monthly";

/** One gc_field_office_rates row. */
export type FieldOfficeRate = {
  id: string;
  category: string;
  item: string;
  rateBasis: FieldOfficeRateBasis;
  rate: number;
  recurringRate: number | null;
  sourceEstimate: string;
};

/**
 * Weeks in a month, for field-office items priced monthly: 52 weeks over 12
 * months is 4.33. Stated on the face of the ROM whenever it is used.
 */
export const WEEKS_PER_MONTH = 4.33;

export type Range = { low: number; high: number };

export type MarkupLine = {
  /** The ADR 0004 code, or null for the subtotal and totals. */
  code: string | null;
  label: string;
  low: number;
  high: number;
  /** One line of plain words saying where the number came from. */
  basis: string;
  /** True when nothing stands behind the line, so it sits outside the total. */
  tbd: boolean;
  /** Which kind of figure priced the line. */
  source: "trade" | "history" | "override" | "staffing" | "parameter" | "none" | "total";
};

export type Markups = {
  choices: MarkupChoices;
  /** Kulka's contract trade cost: the base the waterfall computes from. */
  subtotal: MarkupLine;
  generalConditions: MarkupLine;
  fee: MarkupLine;
  insurance: MarkupLine;
  /** Subtotal plus every markup that is not TBD. Kulka's contract total with markups. */
  total: MarkupLine;
  /** Owner-direct trade cost, which never carries Kulka's markups. */
  ownerDirect: Range;
  /** Kulka's contract total with markups plus owner-direct scope (CONTEXT.md: Total project cost). */
  totalProjectCost: Range;
  assumptions: string[];
};

export type MarkupInputs = {
  /** Kulka's contract trade cost, breakouts and owner-direct lines already out. */
  subtotal: Range;
  ownerDirect: Range;
  grossSquareFeet: number;
  choices: MarkupChoices;
  history: MarkupHistoryRow[];
  staffingRates: StaffingRate[];
  fieldOfficeRates: FieldOfficeRate[];
  feeParameter: EngineParameter | undefined;
  insuranceParameter: EngineParameter | undefined;
};

export const SETUP_LABEL: Record<MarkupSetup, string> = {
  both: "General Requirements & General Conditions",
  gc_only: "General Conditions",
  gr_only: "General Requirements",
};

const METHODS: readonly MarkupMethod[] = ["pct_of_subtotal", "usd_per_gsf", "staffing_duration"];
const SETUPS: readonly MarkupSetup[] = ["both", "gc_only", "gr_only"];

export function computeMarkups(inputs: MarkupInputs): Markups {
  const { choices } = inputs;
  validateChoices(choices);

  const assumptions: string[] = [];
  const subtotal: MarkupLine = {
    code: null,
    label: "Subtotal",
    low: inputs.subtotal.low,
    high: inputs.subtotal.high,
    basis: "Kulka's contract trade cost, owner-direct lines excluded",
    tbd: false,
    source: "trade",
  };

  const generalConditions = priceGeneralConditions(inputs, assumptions);
  const gc = generalConditions.tbd ? { low: 0, high: 0 } : generalConditions;

  const feeRate = rateFor(choices.feeRate, inputs.feeParameter, "fee.rate");
  const feeBase = { low: subtotal.low + gc.low, high: subtotal.high + gc.high };
  const gcWords = generalConditions.tbd ? "" : ` plus ${SETUP_LABEL[choices.setup]}`;
  const fee: MarkupLine = {
    code: "90 30 00",
    label: "Fee",
    low: Math.round(feeBase.low * feeRate.value),
    high: Math.round(feeBase.high * feeRate.value),
    basis: `${percent(feeRate.value)} of subtotal${gcWords}, ${feeRate.words}`,
    tbd: false,
    source: feeRate.source,
  };

  const insuranceRate = rateFor(choices.insuranceRate, inputs.insuranceParameter, "insurance.rate");
  const insuranceBase = { low: feeBase.low + fee.low, high: feeBase.high + fee.high };
  const insurance: MarkupLine = {
    code: "90 40 00",
    label: "Insurance",
    low: Math.round(insuranceBase.low * insuranceRate.value),
    high: Math.round(insuranceBase.high * insuranceRate.value),
    basis: `${percent(insuranceRate.value)} of subtotal${gcWords} and fee, ${insuranceRate.words}`,
    tbd: false,
    source: insuranceRate.source,
  };

  const total: MarkupLine = {
    code: null,
    label: "Total",
    low: insuranceBase.low + insurance.low,
    high: insuranceBase.high + insurance.high,
    basis: generalConditions.tbd
      ? `Kulka's contract with fee and insurance; ${SETUP_LABEL[choices.setup]} is TBD and not in it`
      : "Kulka's contract with every markup above",
    tbd: false,
    source: "total",
  };

  if (generalConditions.tbd) {
    assumptions.push(
      `${SETUP_LABEL[choices.setup]} is TBD and sits outside the total, because ${generalConditions.basis.charAt(0).toLowerCase()}${generalConditions.basis.slice(1)}. Fee and insurance compute without it.`,
    );
  }
  assumptions.push(
    "Fee computes on the subtotal plus the GRs/GCs line, and insurance on the subtotal, GRs/GCs, and fee, in the ADR 0004 waterfall order. Markups apply to Kulka's contract only; owner-direct scope carries none.",
  );

  return {
    choices,
    subtotal,
    generalConditions,
    fee,
    insurance,
    total,
    ownerDirect: inputs.ownerDirect,
    totalProjectCost: {
      low: total.low + inputs.ownerDirect.low,
      high: total.high + inputs.ownerDirect.high,
    },
    assumptions,
  };
}

function validateChoices(choices: MarkupChoices): void {
  if (!SETUPS.includes(choices.setup)) throw new Error(`Unknown markup setup "${choices.setup}".`);
  if (!METHODS.includes(choices.method)) throw new Error(`Unknown markup method "${choices.method}".`);
  if (choices.overrideRate !== undefined && !(choices.overrideRate > 0)) {
    throw new Error("A GRs/GCs override rate must be above zero.");
  }
  if (choices.method === "pct_of_subtotal" && choices.overrideRate !== undefined && !(choices.overrideRate < 1)) {
    throw new Error("A GRs/GCs percent override must be a fraction below one.");
  }
  for (const [name, rate] of [
    ["fee", choices.feeRate],
    ["insurance", choices.insuranceRate],
  ] as const) {
    if (rate !== undefined && markupRateProblem(rate)) {
      throw new Error(`A ${name} rate must be a fraction from zero up to one.`);
    }
  }
}

/**
 * True when a fee or insurance rate is one the waterfall refuses: anything
 * outside zero up to, but not including, one. The same rule holds for a
 * one-ROM override and for the recorded default (LA-866).
 */
export function markupRateProblem(rate: number): boolean {
  return !(rate >= 0 && rate < 1);
}

function rateFor(
  override: number | undefined,
  parameter: EngineParameter | undefined,
  name: string,
): { value: number; words: string; source: "override" | "parameter" } {
  if (override !== undefined) return { value: override, words: "user override", source: "override" };
  if (!parameter || !Number.isFinite(parameter.value)) {
    throw new Error(
      `No engine parameter "${name}" is recorded, so the engine cannot run. Record one with its provenance.`,
    );
  }
  if (markupRateProblem(parameter.value)) {
    throw new Error(`Engine parameter "${name}" must be a fraction from zero up to one.`);
  }
  return {
    value: parameter.value,
    // LA-1336: a budget names the rate and when it was recorded. The
    // parameter key and who recorded it stay on the Engine Parameters screen.
    words: `recorded ${parameter.provenance.recordedAt}`,
    source: "parameter",
  };
}

function priceGeneralConditions(inputs: MarkupInputs, assumptions: string[]): MarkupLine {
  const { choices } = inputs;
  const label = SETUP_LABEL[choices.setup];
  const line = (over: Omit<MarkupLine, "code" | "label">): MarkupLine => ({
    code: "90 20 00",
    label,
    ...over,
  });
  const tbd = (basis: string): MarkupLine => line({ low: 0, high: 0, basis, tbd: true, source: "none" });

  if (choices.method === "staffing_duration") return priceStaffing(inputs, line, tbd, assumptions);

  const rows = inputs.history
    .filter((row) => row.setup === choices.setup)
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.projectId.localeCompare(b.projectId));
  const from = historyWords(rows);

  if (choices.method === "pct_of_subtotal") {
    if (choices.overrideRate !== undefined) {
      const rate = choices.overrideRate;
      return line({
        low: Math.round(inputs.subtotal.low * rate),
        high: Math.round(inputs.subtotal.high * rate),
        basis: `${percent(rate)} of subtotal, user override${rows.length > 0 ? ` (history: ${percent(mean(rows.map((r) => r.pctOfSubtotal)))} ${from})` : ""}`,
        tbd: false,
        source: "override",
      });
    }
    if (rows.length === 0) {
      return tbd(`No imported budget records ${label} for this setup, and no override was given`);
    }
    const rate = mean(rows.map((r) => r.pctOfSubtotal));
    return line({
      low: Math.round(inputs.subtotal.low * rate),
      high: Math.round(inputs.subtotal.high * rate),
      basis: `${percent(rate)} of subtotal, ${from}`,
      tbd: false,
      source: "history",
    });
  }

  // usd_per_gsf: one rate times one area, so low and high are the same figure.
  if (choices.overrideRate !== undefined) {
    const amount = Math.round(choices.overrideRate * inputs.grossSquareFeet);
    return line({
      low: amount,
      high: amount,
      basis: `${perSf(choices.overrideRate)}/GSF × ${area(inputs.grossSquareFeet)} GSF, user override${rows.length > 0 ? ` (history: ${perSf(mean(rows.map((r) => r.usdPerGsf)))}/GSF ${from})` : ""}`,
      tbd: false,
      source: "override",
    });
  }
  if (rows.length === 0) {
    return tbd(`No imported budget records ${label} for this setup, and no override was given`);
  }
  const rate = mean(rows.map((r) => r.usdPerGsf));
  const amount = Math.round(rate * inputs.grossSquareFeet);
  return line({
    low: amount,
    high: amount,
    basis: `${perSf(rate)}/GSF × ${area(inputs.grossSquareFeet)} GSF, ${from}`,
    tbd: false,
    source: "history",
  });
}

function priceStaffing(
  inputs: MarkupInputs,
  line: (over: Omit<MarkupLine, "code" | "label">) => MarkupLine,
  tbd: (basis: string) => MarkupLine,
  assumptions: string[],
): MarkupLine {
  const { choices } = inputs;
  const weeks = choices.durationWeeks;
  if (weeks === undefined || !(weeks > 0)) {
    throw new Error("The staffing and duration method needs a job duration in weeks above zero.");
  }
  const staff = choices.staff ?? [];
  const fieldOffice = choices.fieldOffice ?? [];
  if (staff.length === 0 && fieldOffice.length === 0) {
    return tbd("No staff role or field-office item was picked");
  }

  const staffById = new Map(inputs.staffingRates.map((r) => [r.id, r]));
  const officeById = new Map(inputs.fieldOfficeRates.map((r) => [r.id, r]));
  const months = weeks / WEEKS_PER_MONTH;

  let low = 0;
  let high = 0;
  const sources = new Set<string>();
  for (const pick of staff) {
    const rate = staffById.get(pick.rateId);
    if (!rate) throw new Error(`No staffing rate ${pick.rateId}.`);
    const roleWeeks = pick.weeks ?? weeks;
    if (!(roleWeeks > 0)) throw new Error(`Weeks for ${rate.role} must be above zero.`);
    sources.add(rate.sourceEstimate);
    low += roleWeeks * rate.weeklyRateLow;
    high += roleWeeks * rate.weeklyRateHigh;
  }

  let usedMonths = false;
  for (const pick of fieldOffice) {
    const rate = officeById.get(pick.rateId);
    if (!rate) throw new Error(`No field-office rate ${pick.rateId}.`);
    const quantity = pick.quantity ?? 1;
    if (!(quantity > 0)) throw new Error(`Quantity for ${rate.item} must be above zero.`);
    sources.add(rate.sourceEstimate);
    let cost: number;
    switch (rate.rateBasis) {
      case "monthly":
        cost = rate.rate * months;
        usedMonths = true;
        break;
      case "lump_sum":
      case "each":
        cost = rate.rate;
        break;
      case "lump_sum_then_monthly":
        cost = rate.rate + (rate.recurringRate ?? 0) * months;
        usedMonths = true;
        break;
    }
    low += cost * quantity;
    high += cost * quantity;
  }

  const parts: string[] = [];
  if (staff.length > 0) parts.push(countWords(staff.length, "role"));
  if (fieldOffice.length > 0) parts.push(countWords(fieldOffice.length, "field-office item"));
  const monthWords = usedMonths ? `, monthly items at ${round2(months)} months (weeks / ${WEEKS_PER_MONTH})` : "";
  if (usedMonths) {
    assumptions.push(
      `Monthly field-office items price at ${round2(months)} months: ${weeks} weeks divided by ${WEEKS_PER_MONTH} weeks per month.`,
    );
  }

  return line({
    low: Math.round(low),
    high: Math.round(high),
    basis: `${parts.join(" and ")} over ${weeks} weeks, from rate tables ${[...sources].sort().join(", ")}${monthWords}`,
    tbd: false,
    source: "staffing",
  });
}

function historyWords(rows: MarkupHistoryRow[]): string {
  const names = [...new Set(rows.map((r) => r.projectName))];
  return `from ${countWords(rows.length, "job")}: ${names.join(", ")}`;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(2)}%`;
}

function perSf(value: number): string {
  return `$${value.toFixed(2)}`;
}

function area(value: number): string {
  return value.toLocaleString("en-US");
}

function round2(value: number): string {
  return value.toFixed(2);
}

function countWords(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}
