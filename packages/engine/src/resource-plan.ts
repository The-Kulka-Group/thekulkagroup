// Allocated Resources (LA-1397, spec LA-1394): a markup line priced line by
// line, the way Kulka builds General Conditions on a real job (estimate
// C-00379). Each line has a quantity, a basis and a rate. The basis is time
// (the weeks or months of one or more schedule phases), a unit such as SF, or
// a lump sum.
//
// Nothing here knows which markup line it prices. rom-markups.ts hands a plan
// to priceResourcePlan for General Conditions today; LA-1398 hands one over
// for General Requirements the same way.
//
// Like rom.ts, this is a pure function of its arguments. It reads no rate
// table and proposes nothing: every figure on a plan is typed by the
// estimator, read from a rate card, or (later, LA-1399 and LA-1400) proposed
// by a stated rule, and each says which.

import type { LineSwitch } from "./line-rules";
import type { QuantityRuleId } from "./quantity-rules";
import type { ConfidenceFlag } from "./rom";
import type { FieldOfficeRate, StaffingRate } from "./rom-markups";

export type SchedulePhase = "precon" | "construction" | "closeout";

export const SCHEDULE_PHASES: readonly SchedulePhase[] = ["precon", "construction", "closeout"];

export const PHASE_LABEL: Record<SchedulePhase, string> = {
  precon: "Precon",
  construction: "Construction",
  closeout: "Close-Out",
};

/**
 * Where a figure on a plan came from.
 *
 * - `estimator`: typed, or kept, by the estimator.
 * - `rate_card`: read from a Kulka rate table row (`ref` is the row id).
 * - `proposed`: filled in by a stated rule the estimator has not touched
 *   (`ref` names the rule). The proposed schedule sets it on a phase's weeks
 *   (LA-1399, schedule-proposal.ts); the staff plan (LA-1400) is to follow.
 * - `fact`: a quantity worked out from project facts by a named rule (LA-1401,
 *   quantity-rules.ts; `ref` is the rule id), such as gross area for final
 *   cleaning.
 * - `schedule`: a quantity worked out from the schedule alone by a named rule,
 *   such as heat labor from the winter weeks construction crosses.
 *
 * An estimator's edit replaces the whole figure with origin `estimator`, so a
 * proposal never overwrites a value somebody typed.
 */
export type FigureOrigin = "estimator" | "rate_card" | "proposed" | "fact" | "schedule";

export type PlanFigure = {
  value: number;
  origin: FigureOrigin;
  /** The rate row id, rule name or fact key behind the figure. */
  ref?: string;
  /** Where it came from in words a budget can show, such as an estimate number. */
  source?: string;
  /**
   * The rate card row behind the figure has no rate for it, so the value is a
   * placeholder zero the estimator must replace. A line whose rate needs entry
   * refuses to price while it is on; it never prices silently at zero.
   */
  needsEntry?: true;
};

/** The weeks of each phase. */
export type PlanSchedule = Record<SchedulePhase, PlanFigure>;

type PlanLineCommon = {
  /** Unique within the plan. */
  id: string;
  label: string;
  /** The heading the line sits under, such as Staff or Field Office. */
  group: string;
  /** How many: people in a role, offices, units. A lump sum's quantity multiplies it. */
  quantity: PlanFigure;
  /** Dollars per day, week or month for a time line; per unit; or the lump sum itself. */
  rate: PlanFigure;
  /**
   * Whether the line prices, and who decided (LA-1402, line-rules.ts). A line
   * with no switch prices, as every plan saved before LA-1402 does. A line
   * switched off stays in the plan, unpriced, so a saved run shows it.
   */
  switch?: LineSwitch;
  /**
   * The rule that fills the quantity from the project's facts (LA-1401). Kept
   * when the estimator overrides the quantity, so a reset can go back to it.
   * The engine prices the quantity as given and never derives it.
   */
  quantityRule?: QuantityRuleId;
};

/** A line that runs for the length of its phases, or for its own weeks. */
export type TimePlanLine = PlanLineCommon & {
  basis: "time";
  /** What the rate is per. A per-day rate needs days per week. */
  per: "day" | "week" | "month";
  daysPerWeek?: PlanFigure;
  phases: SchedulePhase[];
  /** The line's own weeks, in place of its phases', such as a role on for part of construction. */
  weeks?: PlanFigure;
};

export type UnitPlanLine = PlanLineCommon & {
  basis: "unit";
  /** What one unit is, such as SF, Days or Each. */
  unit: string;
};

export type LumpSumPlanLine = PlanLineCommon & { basis: "lump_sum" };

/** A line that prices: every figure its basis needs is on it. */
export type PricingPlanLine = TimePlanLine | UnitPlanLine | LumpSumPlanLine;

export type PlanBasis = PricingPlanLine["basis"];

/**
 * A line switched off (LA-1402), kept as the estimator left it. It prices
 * nothing, so only its id, label, group, basis and switch are sure to be
 * there; any other figure is kept where it was given, and nothing checks it.
 */
export type OffPlanLine = Pick<PlanLineCommon, "id" | "label" | "group" | "quantityRule"> & {
  basis: PlanBasis;
  switch: LineSwitch & { on: false };
  quantity?: PlanFigure;
  rate?: PlanFigure;
  unit?: string;
  per?: TimePlanLine["per"];
  phases?: SchedulePhase[];
  daysPerWeek?: PlanFigure;
  weeks?: PlanFigure;
};

export type PlanLine = PricingPlanLine | OffPlanLine;

/** Whether a line prices: every line does unless it is switched off. */
export function isLineOn(line: PlanLine): line is PricingPlanLine {
  return line.switch?.on !== false;
}

export type ResourcePlan = {
  schedule: PlanSchedule;
  lines: PlanLine[];
  /** The confidence the plan's total carries a range at. */
  confidence: ConfidenceFlag;
};

export type PricedPlanLine = {
  id: string;
  label: string;
  group: string;
  basis: PlanBasis;
  quantity: PlanFigure;
  rate: PlanFigure;
  /** Unrounded dollars. */
  amount: number;
  /** The line's quantity, basis and rate in plain words, such as "44 weeks × 2 days/week at $1,000/day". */
  basisWords: string;
};

export type PricedPlan = {
  lines: PricedPlanLine[];
  /** Each group's amount, in the order the groups first appear, rounded to the dollar. */
  groups: { group: string; amount: number }[];
  /** Rounded to the dollar. */
  total: number;
  /** Unrounded, for the range around it. */
  exactTotal: number;
  weeks: Record<SchedulePhase, number>;
  confidence: ConfidenceFlag;
};

/**
 * Days in a month, for lines priced by the month: the conversion C-00379
 * itself uses (cell AT11). A phase of `w` weeks is `w × 7 / 30.42` months.
 */
export const DAYS_PER_MONTH = 30.42;

export function monthsIn(weeks: number): number {
  return (weeks * 7) / DAYS_PER_MONTH;
}

export function priceResourcePlan(plan: ResourcePlan): PricedPlan {
  const weeks = {} as Record<SchedulePhase, number>;
  for (const phase of SCHEDULE_PHASES) {
    const value = plan.schedule[phase]?.value;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${PHASE_LABEL[phase]} weeks must be zero or more.`);
    }
    weeks[phase] = value;
  }

  const seen = new Set<string>();
  const lines = plan.lines.filter(isLineOn).map((line): PricedPlanLine => {
    if (seen.has(line.id)) throw new Error(`Plan line ${line.id} appears twice.`);
    seen.add(line.id);
    const quantity = line.quantity.value;
    const rate = line.rate.value;
    if (!Number.isFinite(quantity) || !(quantity > 0)) throw new Error(`The quantity of ${line.label} must be above zero.`);
    if (!Number.isFinite(rate) || rate < 0) throw new Error(`The rate of ${line.label} must be zero or more.`);
    if (line.rate.needsEntry) throw new Error(`Enter a rate for ${line.label}. The rate card has none for it.`);
    const common = {
      id: line.id,
      label: line.label,
      group: line.group,
      basis: line.basis,
      quantity: line.quantity,
      rate: line.rate,
    };
    const times = quantity === 1 ? "" : `${count(quantity)} × `;

    switch (line.basis) {
      case "lump_sum":
        return {
          ...common,
          amount: quantity * rate,
          basisWords: quantity === 1 ? `Lump Sum ${dollars(rate)}` : `${times}${dollars(rate)} Lump Sum`,
        };
      case "unit":
        return {
          ...common,
          amount: quantity * rate,
          basisWords: `${count(quantity)} ${line.unit} at ${dollars(rate)}/${line.unit}`,
        };
      case "time": {
        if (line.weeks === undefined && line.phases.length === 0) {
          throw new Error(`${line.label} runs over no phase and has no weeks of its own.`);
        }
        const own = line.weeks?.value;
        if (own !== undefined && (!Number.isFinite(own) || own < 0)) {
          throw new Error(`The weeks of ${line.label} must be zero or more.`);
        }
        const lineWeeks = own ?? line.phases.reduce((sum, phase) => sum + weeks[phase], 0);
        const phaseWords = own === undefined ? `, ${line.phases.map((p) => PHASE_LABEL[p]).join(" and ")}` : "";
        if (line.per === "day") {
          const days = line.daysPerWeek?.value;
          if (days === undefined || !Number.isFinite(days) || !(days > 0 && days <= 7)) {
            throw new Error(`${line.label} is priced by the day, so it needs days per week from above zero up to seven.`);
          }
          return {
            ...common,
            amount: quantity * lineWeeks * days * rate,
            basisWords: `${times}${count(lineWeeks)} weeks × ${count(days)} days/week at ${dollars(rate)}/day${phaseWords}`,
          };
        }
        if (line.per === "week") {
          return {
            ...common,
            amount: quantity * lineWeeks * rate,
            basisWords: `${times}${count(lineWeeks)} weeks at ${dollars(rate)}/week${phaseWords}`,
          };
        }
        const months = monthsIn(lineWeeks);
        return {
          ...common,
          amount: quantity * months * rate,
          basisWords: `${times}${count(months)} months at ${dollars(rate)}/month${phaseWords}`,
        };
      }
    }
  });

  const groupTotals = new Map<string, number>();
  for (const line of lines) groupTotals.set(line.group, (groupTotals.get(line.group) ?? 0) + line.amount);
  const exactTotal = lines.reduce((sum, line) => sum + line.amount, 0);

  return {
    lines,
    groups: [...groupTotals].map(([group, amount]) => ({ group, amount: Math.round(amount) })),
    total: Math.round(exactTotal),
    exactTotal,
    weeks,
    confidence: plan.confidence,
  };
}

/**
 * A project saved under Staffing and Duration (LA-1016), opened as the
 * equivalent Allocated Resources plan. The job's weeks become the
 * construction phase; each role becomes a construction line at its rate-card
 * day rate (the weekly rate over its days per week), keeping its own weeks
 * where it had them; each field-office item becomes a line on its own basis.
 * A connect-then-monthly item becomes two lines, the connect and the monthly
 * service. A pick whose rate row no longer exists is left out.
 *
 * Only a project's saved choice goes through here. A stored run keeps its
 * Staffing and Duration choices and prices exactly as it was recorded.
 *
 * Two figures can differ from the old method's: a role's rate is the low end
 * of its rate-card row, and monthly items price at 30.42 days a month rather
 * than 4.33 weeks a month.
 *
 * A field-office row priced at $0, or a connect-then-monthly row with no
 * monthly rate, keeps its line with the rate marked `needsEntry`, so the plan
 * will not price until the estimator enters one (the same rule as a General
 * Requirements row with no rate). The old method priced such a row at zero,
 * and a run it recorded still does.
 */
export function planFromStaffingChoices(
  choices: {
    durationWeeks?: number;
    staff?: { rateId: string; weeks?: number }[];
    fieldOffice?: { rateId: string; quantity?: number }[];
  },
  staffingRates: StaffingRate[],
  fieldOfficeRates: FieldOfficeRate[],
): ResourcePlan {
  const typed = (value: number): PlanFigure => ({ value, origin: "estimator" });
  const staffById = new Map(staffingRates.map((rate) => [rate.id, rate]));
  const officeById = new Map(fieldOfficeRates.map((rate) => [rate.id, rate]));
  const lines: PlanLine[] = [];
  const used = new Map<string, number>();
  const idFor = (rateId: string, suffix = "") => {
    const key = `${rateId}${suffix}`;
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    return n === 1 ? key : `${key}-${n}`;
  };

  for (const pick of choices.staff ?? []) {
    const rate = staffById.get(pick.rateId);
    if (!rate) continue;
    lines.push({
      id: idFor(rate.id),
      label: rate.role,
      group: "Staff",
      basis: "time",
      per: "day",
      daysPerWeek: { value: rate.daysPerWeek, origin: "rate_card", ref: rate.id, source: rate.sourceEstimate },
      phases: ["construction"],
      ...(pick.weeks !== undefined ? { weeks: typed(pick.weeks) } : {}),
      quantity: typed(1),
      rate: { value: rate.weeklyRateLow / rate.daysPerWeek, origin: "rate_card", ref: rate.id, source: rate.sourceEstimate },
    });
  }

  for (const pick of choices.fieldOffice ?? []) {
    const rate = officeById.get(pick.rateId);
    if (!rate) continue;
    const quantity = typed(pick.quantity ?? 1);
    const figure = (value: number | null): PlanFigure =>
      value !== null && value > 0
        ? { value, origin: "rate_card", ref: rate.id, source: rate.sourceEstimate }
        : { value: 0, origin: "rate_card", ref: rate.id, source: rate.sourceEstimate, needsEntry: true };
    const monthly = (id: string, label: string, value: number | null): PlanLine => ({
      id,
      label,
      group: "Field Office",
      basis: "time",
      per: "month",
      phases: ["construction"],
      quantity,
      rate: figure(value),
    });
    switch (rate.rateBasis) {
      case "monthly":
        lines.push(monthly(idFor(rate.id), rate.item, rate.rate));
        break;
      case "lump_sum":
        lines.push({ id: idFor(rate.id), label: rate.item, group: "Field Office", basis: "lump_sum", quantity, rate: figure(rate.rate) });
        break;
      case "each":
        lines.push({ id: idFor(rate.id), label: rate.item, group: "Field Office", basis: "unit", unit: "Each", quantity, rate: figure(rate.rate) });
        break;
      case "lump_sum_then_monthly":
        lines.push({ id: idFor(rate.id), label: rate.item, group: "Field Office", basis: "lump_sum", quantity, rate: figure(rate.rate) });
        lines.push(monthly(idFor(rate.id, "-monthly"), `${rate.item}, Monthly Service`, rate.recurringRate));
        break;
    }
  }

  return {
    schedule: { precon: typed(0), construction: typed(choices.durationWeeks ?? 0), closeout: typed(0) },
    lines,
    confidence: "high",
  };
}

function count(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function dollars(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}
