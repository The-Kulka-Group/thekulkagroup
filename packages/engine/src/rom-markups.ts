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

import { priceResourcePlan, type PricedPlan, type ResourcePlan } from "./resource-plan";
import type { ConfidenceFlag, EngineParameter } from "./rom";

/**
 * How a budget files General Requirements and General Conditions. "both" is
 * one combined line, the way four of Kulka's six budgets file it (ADR 0004).
 * "separate" carries them as two lines, the way Villa at Glen Cove files them
 * (LA-1383): General Requirements in Division 01, inside trade cost, and
 * General Conditions at 90 20 00 on top of it.
 */
export type MarkupSetup = "both" | "gc_only" | "gr_only" | "separate";

/**
 * The setups a history row can carry. A split budget records one gr_only row
 * and one gc_only row for the same project, so "separate" never needs its own.
 */
export type MarkupHistorySetup = Exclude<MarkupSetup, "separate">;

/**
 * How the GRs/GCs line is priced. `pct_of_subtotal` and `usd_per_gsf` read a
 * rate learned from imported budgets. `allocated_resources` (LA-1397) prices a
 * line-by-line plan over a phased schedule (resource-plan.ts).
 *
 * `staffing_duration` (LA-1016) is retired: nothing offers it, and a project
 * that saved it opens as the equivalent plan. The engine still prices it so a
 * run recorded under it prices exactly as it was recorded.
 */
export type MarkupMethod = "pct_of_subtotal" | "usd_per_gsf" | "allocated_resources" | "staffing_duration";

/**
 * How General Requirements prices on its own line under the "separate" setup
 * (LA-1398): from history or the user's rate, as a percent of the subtotal or
 * dollars per GSF, or by its own Allocated Resources plan.
 */
export type GrMethod = "pct_of_subtotal" | "usd_per_gsf" | "allocated_resources";

export const GR_METHODS: readonly GrMethod[] = ["pct_of_subtotal", "usd_per_gsf", "allocated_resources"];

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
  /**
   * The user's own General Requirements rate when the setup is "separate", in
   * place of history. `overrideRate` then prices General Conditions alone.
   * Dollars per GSF under `usd_per_gsf`, a fraction of the subtotal otherwise:
   * staffing and field office price General Conditions, so General
   * Requirements prices as a percent of subtotal beside them.
   */
  grOverrideRate?: number;
  /**
   * General Requirements' own method when the setup is "separate" (LA-1398).
   * Absent, it follows the rule every run before LA-1398 priced by: dollars
   * per GSF when `method` is `usd_per_gsf`, a percent of subtotal otherwise.
   * See `grMethodOf`.
   */
  grMethod?: GrMethod;
  /** The plan General Requirements prices by when `grMethod` is `allocated_resources`. */
  grResourcePlan?: ResourcePlan;
  /**
   * The plan `allocated_resources` prices: the GRs/GCs line, or General
   * Conditions alone when the setup is "separate".
   */
  resourcePlan?: ResourcePlan;
  /** Job duration in weeks. Required by `staffing_duration`, which only stored runs carry. */
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
  setup: MarkupHistorySetup;
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
  source: "trade" | "history" | "override" | "staffing" | "allocated" | "parameter" | "none" | "total";
  /** The priced plan behind the line, when Allocated Resources priced it. */
  plan?: PricedPlan;
};

export type Markups = {
  choices: MarkupChoices;
  /** Kulka's contract trade cost: the base the waterfall computes from. */
  subtotal: MarkupLine;
  /**
   * General Requirements on its own line, present only when the setup is
   * "separate". It files at Division 01, inside trade cost (ADR 0004).
   */
  generalRequirements?: MarkupLine;
  /** The GRs/GCs line, or General Conditions alone when the setup is "separate". */
  generalConditions: MarkupLine;
  fee: MarkupLine;
  insurance: MarkupLine;
  /** Subtotal plus every markup that is not TBD. Kulka's contract total with markups. */
  total: MarkupLine;
  /** Owner-direct trade cost, which never carries Kulka's markups. */
  ownerDirect: Range;
  /** Kulka's contract total with markups plus owner-direct scope (GLOSSARY.md: Total project cost). */
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
  /**
   * The engine's range at each confidence, for a plan priced by Allocated
   * Resources: its total ± the spread at the plan's confidence.
   */
  spreadParameters?: Partial<Record<ConfidenceFlag, EngineParameter>>;
};

export const SETUP_LABEL: Record<MarkupSetup, string> = {
  both: "General Requirements & General Conditions",
  gc_only: "General Conditions",
  gr_only: "General Requirements",
  separate: "General Requirements and General Conditions",
};

/** ADR 0004: General Requirements is MasterFormat Division 01. */
export const GENERAL_REQUIREMENTS_CODE = "01 00 00";

/**
 * How General Requirements prices under the "separate" setup: its own method
 * when the choices name one, otherwise the rule runs before LA-1398 priced by,
 * so a stored run prices exactly as it was recorded.
 */
export function grMethodOf(choices: MarkupChoices): GrMethod {
  return choices.grMethod ?? (choices.method === "usd_per_gsf" ? "usd_per_gsf" : "pct_of_subtotal");
}

const METHODS: readonly MarkupMethod[] = ["pct_of_subtotal", "usd_per_gsf", "allocated_resources", "staffing_duration"];
const SETUPS: readonly MarkupSetup[] = ["both", "gc_only", "gr_only", "separate"];

/**
 * The GRs/GCs line a run carries, or its two lines when the setup is
 * "separate", each with the name a screen shows it by. Every screen that lists
 * the markups reads them through here, so a split budget shows both.
 */
export function overheadLines(markups: Markups): { key: "gr" | "gc"; name: string; line: MarkupLine }[] {
  if (!markups.generalRequirements) {
    return [{ key: "gc", name: "GRs/GCs", line: markups.generalConditions }];
  }
  return [
    { key: "gr", name: "General Requirements", line: markups.generalRequirements },
    { key: "gc", name: "General Conditions", line: markups.generalConditions },
  ];
}

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

  const separate = choices.setup === "separate";
  const generalRequirements = separate ? priceGeneralRequirements(inputs, assumptions) : undefined;
  const gr = generalRequirements && !generalRequirements.tbd ? generalRequirements : { low: 0, high: 0 };
  // ADR 0004: trade cost includes General Requirements, and every 90-series
  // item computes on top of it, so a split budget's General Conditions rates
  // on the subtotal plus General Requirements.
  const tradeCost = { low: subtotal.low + gr.low, high: subtotal.high + gr.high };
  const generalConditions = priceGeneralConditions(inputs, tradeCost, assumptions);
  const gc = generalConditions.tbd ? { low: 0, high: 0 } : generalConditions;

  const overhead = [generalRequirements, generalConditions].filter((line): line is MarkupLine => line !== undefined);
  const priced = overhead.filter((line) => !line.tbd).map((line) => line.label);
  const unpriced = overhead.filter((line) => line.tbd).map((line) => line.label);

  const feeRate = rateFor(choices.feeRate, inputs.feeParameter, "fee.rate");
  const feeBase = { low: tradeCost.low + gc.low, high: tradeCost.high + gc.high };
  const gcWords = priced.length > 0 ? ` plus ${andWords(priced)}` : "";
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
    basis:
      unpriced.length > 0
        ? `Kulka's contract with ${priced.length > 0 ? `${andWords(priced)}, ` : ""}fee and insurance; ${andWords(unpriced)} ${unpriced.length === 1 ? "is" : "are"} TBD and not in it`
        : "Kulka's contract with every markup above",
    tbd: false,
    source: "total",
  };

  for (const line of overhead.filter((one) => one.tbd)) {
    assumptions.push(
      `${line.label} is TBD and sits outside the total, because ${line.basis.charAt(0).toLowerCase()}${line.basis.slice(1)}. Fee and insurance compute without it.`,
    );
  }
  assumptions.push(
    separate
      ? "General Requirements sits inside trade cost, General Conditions computes on the subtotal plus General Requirements, fee on both, and insurance on both and fee, in the ADR 0004 waterfall order. Markups apply to Kulka's contract only; owner-direct scope carries none."
      : "Fee computes on the subtotal plus the GRs/GCs line, and insurance on the subtotal, GRs/GCs, and fee, in the ADR 0004 waterfall order. Markups apply to Kulka's contract only; owner-direct scope carries none.",
  );

  return {
    choices,
    subtotal,
    ...(generalRequirements ? { generalRequirements } : {}),
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
  if (choices.method === "allocated_resources" && !choices.resourcePlan) {
    throw new Error("The Allocated Resources method needs a resource plan.");
  }
  if (choices.grMethod !== undefined || choices.grResourcePlan !== undefined) {
    if (choices.setup !== "separate") {
      throw new Error("A General Requirements method applies only when the two lines are carried separately.");
    }
    if (choices.grMethod !== undefined && !GR_METHODS.includes(choices.grMethod)) {
      throw new Error(`Unknown General Requirements method "${choices.grMethod}".`);
    }
  }
  const grMethod = grMethodOf(choices);
  if (choices.setup === "separate" && grMethod === "allocated_resources" && !choices.grResourcePlan) {
    throw new Error("General Requirements priced by Allocated Resources needs a General Requirements plan.");
  }
  if (choices.grOverrideRate !== undefined) {
    if (choices.setup !== "separate") {
      throw new Error("A General Requirements rate applies only when the two lines are carried separately.");
    }
    if (grMethod === "allocated_resources") {
      throw new Error("A General Requirements rate does not apply when its plan prices it.");
    }
    if (!(choices.grOverrideRate > 0)) throw new Error("A General Requirements override rate must be above zero.");
    if (grMethod !== "usd_per_gsf" && !(choices.grOverrideRate < 1)) {
      throw new Error("A General Requirements percent override must be a fraction below one.");
    }
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

/**
 * The GRs/GCs line, or General Conditions alone when the setup is "separate".
 * `base` is what a percent rate applies to: the subtotal, plus General
 * Requirements when it is carried on its own line.
 */
function priceGeneralConditions(inputs: MarkupInputs, base: Range, assumptions: string[]): MarkupLine {
  const { choices } = inputs;
  const separate = choices.setup === "separate";
  const label = separate ? SETUP_LABEL.gc_only : SETUP_LABEL[choices.setup];
  const line = (over: Omit<MarkupLine, "code" | "label">): MarkupLine => ({
    code: "90 20 00",
    label,
    ...over,
  });
  const tbd = (basis: string): MarkupLine => line({ low: 0, high: 0, basis, tbd: true, source: "none" });

  if (choices.method === "staffing_duration") return priceStaffing(inputs, line, tbd, assumptions);
  if (choices.method === "allocated_resources") {
    return priceAllocated(choices.resourcePlan!, inputs.spreadParameters, line, tbd, assumptions);
  }

  // A split budget's General Conditions reads the budgets that record General
  // Conditions on its own line; it never divides a combined figure (ADR 0004).
  const setup: MarkupHistorySetup = separate ? "gc_only" : (choices.setup as MarkupHistorySetup);
  return priceFromHistory(inputs, setup, choices.overrideRate, base, separate ? "subtotal plus General Requirements" : "subtotal", line, tbd);
}

/**
 * General Requirements on its own line, for the "separate" setup. It prices
 * by its own method (LA-1398): its own Allocated Resources plan, or from the
 * budgets that record General Requirements alone, or the user's own rate, as
 * a percent of the subtotal or dollars per GSF. `grMethodOf` keeps runs
 * recorded before LA-1398 pricing as they were.
 */
function priceGeneralRequirements(inputs: MarkupInputs, assumptions: string[]): MarkupLine {
  const line = (over: Omit<MarkupLine, "code" | "label">): MarkupLine => ({
    code: GENERAL_REQUIREMENTS_CODE,
    label: SETUP_LABEL.gr_only,
    ...over,
  });
  const tbd = (basis: string): MarkupLine => line({ low: 0, high: 0, basis, tbd: true, source: "none" });
  const method = grMethodOf(inputs.choices);
  if (method === "allocated_resources") {
    return priceAllocated(inputs.choices.grResourcePlan!, inputs.spreadParameters, line, tbd, assumptions);
  }
  return priceFromHistory(
    { ...inputs, choices: { ...inputs.choices, method } },
    "gr_only",
    inputs.choices.grOverrideRate,
    inputs.subtotal,
    "subtotal",
    line,
    tbd,
  );
}

function priceFromHistory(
  inputs: MarkupInputs,
  setup: MarkupHistorySetup,
  overrideRate: number | undefined,
  base: Range,
  baseWords: string,
  line: (over: Omit<MarkupLine, "code" | "label">) => MarkupLine,
  tbd: (basis: string) => MarkupLine,
): MarkupLine {
  const { choices } = inputs;
  const label = SETUP_LABEL[setup];
  const rows = inputs.history
    .filter((row) => row.setup === setup)
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.projectId.localeCompare(b.projectId));
  const from = historyWords(rows);

  if (choices.method === "pct_of_subtotal") {
    if (overrideRate !== undefined) {
      const rate = overrideRate;
      return line({
        low: Math.round(base.low * rate),
        high: Math.round(base.high * rate),
        basis: `${percent(rate)} of ${baseWords}, user override${rows.length > 0 ? ` (history: ${percent(mean(rows.map((r) => r.pctOfSubtotal)))} ${from})` : ""}`,
        tbd: false,
        source: "override",
      });
    }
    if (rows.length === 0) {
      return tbd(`No imported budget records ${label} for this setup, and no override was given`);
    }
    const rate = mean(rows.map((r) => r.pctOfSubtotal));
    return line({
      low: Math.round(base.low * rate),
      high: Math.round(base.high * rate),
      basis: `${percent(rate)} of ${baseWords}, ${from}`,
      tbd: false,
      source: "history",
    });
  }

  // usd_per_gsf: one rate times one area, so low and high are the same figure.
  if (overrideRate !== undefined) {
    const amount = Math.round(overrideRate * inputs.grossSquareFeet);
    return line({
      low: amount,
      high: amount,
      basis: `${perSf(overrideRate)}/GSF × ${area(inputs.grossSquareFeet)} GSF, user override${rows.length > 0 ? ` (history: ${perSf(mean(rows.map((r) => r.usdPerGsf)))}/GSF ${from})` : ""}`,
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

/**
 * A line priced by Allocated Resources (LA-1397): the plan's total, with a
 * range at the plan's confidence, the same spread the engine puts on a trade
 * line at that confidence. The total does not move with the subtotal.
 */
function priceAllocated(
  plan: ResourcePlan,
  spreads: MarkupInputs["spreadParameters"],
  line: (over: Omit<MarkupLine, "code" | "label">) => MarkupLine,
  tbd: (basis: string) => MarkupLine,
  assumptions: string[],
): MarkupLine {
  if (plan.lines.length === 0) return tbd("No line was added to the Allocated Resources plan");
  const priced = priceResourcePlan(plan);
  // A plan whose lines are all switched off prices nothing. That is a "don't
  // know", not a zero, so the line stays out of the total.
  if (priced.lines.length === 0) return tbd("Every line of the Allocated Resources plan is switched off");
  const spread = spreads?.[plan.confidence];
  if (!spread || !Number.isFinite(spread.value)) {
    throw new Error(
      `No engine parameter "spread.${plan.confidence}" is recorded, so the engine cannot run. Record one with its provenance.`,
    );
  }
  if (!(spread.value >= 0 && spread.value < 1)) {
    throw new Error(`Engine parameter "spread.${plan.confidence}" must be a fraction from zero up to one.`);
  }

  const phases = (["precon", "construction", "closeout"] as const).filter((phase) => priced.weeks[phase] > 0);
  const totalWeeks = phases.reduce((sum, phase) => sum + priced.weeks[phase], 0);
  const sources = [...new Set(priced.lines.flatMap((one) => (one.rate.source ? [one.rate.source] : [])))].sort();
  const months = priced.lines.some((one) => one.basisWords.includes("/month"));
  const monthWords =
    "Allocated Resources prices monthly lines at 30.42 days a month, the conversion Kulka's own General Conditions sheet uses.";
  if (months && !assumptions.includes(monthWords)) assumptions.push(monthWords);

  return line({
    low: Math.round(priced.exactTotal * (1 - spread.value)),
    high: Math.round(priced.exactTotal * (1 + spread.value)),
    basis:
      `Allocated Resources, ${countWords(priced.lines.length, "line")} over ${round2Words(totalWeeks)} weeks, ` +
      `${formatDollars(priced.total)} at ${plan.confidence} confidence (± ${percentWhole(spread.value)})` +
      (sources.length > 0 ? `, rates from ${sources.join(", ")} and the estimator` : ", rates from the estimator"),
    tbd: false,
    source: "allocated",
    plan: priced,
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

/** "a", "a and b". */
function andWords(words: string[]): string {
  return words.length <= 1 ? (words[0] ?? "") : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
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

function round2Words(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDollars(value: number): string {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function percentWhole(fraction: number): string {
  return `${Number((fraction * 100).toFixed(2))}%`;
}

function round2(value: number): string {
  return value.toFixed(2);
}

function countWords(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}
