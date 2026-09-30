import {
  applyScheduleProposal,
  PHASE_LABEL,
  proposedFigure,
  planFromStaffingChoices,
  priceResourcePlan,
  SCHEDULE_PHASES,
  type ConfidenceFlag,
  type FigureOrigin,
  type PlanBasis,
  type PlanFigure,
  type PlanLine,
  type ResourcePlan,
  type ScheduleProposal,
  type SchedulePhase,
} from "@kulka/engine";

import type { GrRate } from "@/lib/rom/gr-rates";
import type { MarkupOptions } from "@/lib/rom/markup";

// LA-1397: the Allocated Resources plan as the Run Settings and New Budget
// forms hold it. Every number is text while the estimator types; each keeps
// where it came from, so a rate read off the rate card says so until the
// estimator changes it. The engine prices the plan; nothing here adds up.

/** Where a figure came from, without its value. */
export type FigureFrom = { origin: FigureOrigin; ref?: string; source?: string };

export const TYPED: FigureFrom = { origin: "estimator" };

export type PlanLineForm = {
  id: string;
  label: string;
  group: string;
  basis: PlanBasis;
  per: "day" | "week" | "month";
  phases: SchedulePhase[];
  unit: string;
  quantity: string;
  rate: string;
  daysPerWeek: string;
  /** The line's own weeks, in place of its phases'. Blank uses the phases. */
  weeks: string;
  quantityFrom: FigureFrom;
  rateFrom: FigureFrom;
  daysFrom: FigureFrom;
  weeksFrom: FigureFrom;
  /**
   * The rate card row the line came from carries no rate (LA-1398), so the
   * estimator has to enter one. A blank rate never prices as zero.
   */
  noCardRate?: boolean;
};

export type PlanForm = {
  weeks: Record<SchedulePhase, string>;
  weeksFrom: Record<SchedulePhase, FigureFrom>;
  confidence: ConfidenceFlag;
  lines: PlanLineForm[];
};

export const PLAN_GROUPS = ["Staff", "Field Office", "General Expenses"] as const;

/**
 * The General Requirements sections a plan offers (LA-1398), in the order the
 * C-00379 tab lists them. Insurances & Bonds is not among them: its rows are
 * not priceable, because fee and insurance are already markups (LA-1394
 * question 3).
 */
export const GR_PLAN_GROUPS = [
  "Construction Labor & Clean-up",
  "Site Controls",
  "Temporary & OSHA Protection",
  "Security",
  "Hoists, Cranes & Scaffolding",
  "Surveying, Site Safety & Consultants",
  "Permits, Fees & Expediting",
  "Cold Weather Protection",
  "Temporary Utilities",
] as const;

export const BASIS_LABEL: Record<PlanBasis, string> = {
  time: "By Time",
  unit: "By Unit",
  lump_sum: "Lump Sum",
};

export const PER_LABEL: Record<PlanLineForm["per"], string> = {
  day: "Per Day",
  week: "Per Week",
  month: "Per Month",
};

export const CONFIDENCE_LABEL: Record<ConfidenceFlag, string> = {
  high: "High Confidence",
  medium: "Medium Confidence",
  low: "Low Confidence",
};

/**
 * Where the proposed schedule stands on the screen (LA-1399): applied and
 * shown, being asked for, or failed with words the screen shows.
 */
export type ScheduleView =
  | { kind: "ready"; proposal: ScheduleProposal }
  | { kind: "pending" }
  | { kind: "failed"; error: string };

/**
 * The plan with a schedule proposal applied (LA-1399). A phase the estimator
 * typed keeps its text; a blank or proposed phase takes the proposal's weeks,
 * or goes blank where the proposal leaves it blank.
 */
export function applyProposalToPlanForm(form: PlanForm, proposal: ScheduleProposal): PlanForm {
  const current = {} as Record<SchedulePhase, PlanFigure | null>;
  for (const phase of SCHEDULE_PHASES) {
    const typed = form.weeks[phase].trim();
    current[phase] = typed === "" ? null : { value: Number(typed), ...form.weeksFrom[phase] };
  }
  const applied = applyScheduleProposal(current, proposal);
  const weeks = { ...form.weeks };
  const weeksFrom = { ...form.weeksFrom };
  for (const phase of SCHEDULE_PHASES) {
    if (applied[phase] === current[phase] && current[phase] !== null) continue;
    const figure = applied[phase];
    weeks[phase] = figure ? String(figure.value) : "";
    weeksFrom[phase] = figure ? from(figure) : TYPED;
  }
  return { ...form, weeks, weeksFrom };
}

/** One phase put back to the proposal's weeks, or blank where the proposal has none. */
export function resetPhaseToProposal(form: PlanForm, phase: SchedulePhase, proposal: ScheduleProposal): PlanForm {
  const figure = proposedFigure(proposal, phase);
  return {
    ...form,
    weeks: { ...form.weeks, [phase]: figure ? String(figure.value) : "" },
    weeksFrom: { ...form.weeksFrom, [phase]: figure ? from(figure) : TYPED },
  };
}

/** A plan with no weeks typed and no lines, the way Allocated Resources starts until LA-1399 and LA-1400 propose one. */
export function emptyPlanForm(): PlanForm {
  return {
    weeks: { precon: "", construction: "", closeout: "" },
    weeksFrom: { precon: TYPED, construction: TYPED, closeout: TYPED },
    confidence: "high",
    lines: [],
  };
}

const text = (value: number | undefined) => (value === undefined ? "" : String(value));

function from(figure: PlanFigure | undefined): FigureFrom {
  if (!figure) return TYPED;
  return {
    origin: figure.origin,
    ...(figure.ref ? { ref: figure.ref } : {}),
    ...(figure.source ? { source: figure.source } : {}),
  };
}

function lineForm(line: PlanLine): PlanLineForm {
  return {
    id: line.id,
    label: line.label,
    group: line.group,
    basis: line.basis,
    per: line.basis === "time" ? line.per : "week",
    phases: line.basis === "time" ? line.phases : ["construction"],
    unit: line.basis === "unit" ? line.unit : "",
    quantity: text(line.quantity.value),
    rate: text(line.rate.value),
    daysPerWeek: line.basis === "time" ? text(line.daysPerWeek?.value) : "",
    weeks: line.basis === "time" ? text(line.weeks?.value) : "",
    quantityFrom: from(line.quantity),
    rateFrom: from(line.rate),
    daysFrom: from(line.basis === "time" ? line.daysPerWeek : undefined),
    weeksFrom: from(line.basis === "time" ? line.weeks : undefined),
  };
}

export function planFormFrom(plan: ResourcePlan): PlanForm {
  return {
    weeks: {
      precon: text(plan.schedule.precon.value),
      construction: text(plan.schedule.construction.value),
      closeout: text(plan.schedule.closeout.value),
    },
    weeksFrom: {
      precon: from(plan.schedule.precon),
      construction: from(plan.schedule.construction),
      closeout: from(plan.schedule.closeout),
    },
    confidence: plan.confidence,
    lines: plan.lines.map(lineForm),
  };
}

function number(value: string): number | null {
  if (value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** The plan the form describes, or what is wrong with it in words the screen shows. */
export function planFromForm(form: PlanForm): { ok: true; plan: ResourcePlan } | { ok: false; error: string } {
  const schedule = {} as ResourcePlan["schedule"];
  for (const phase of SCHEDULE_PHASES) {
    const weeks = number(form.weeks[phase]);
    if (weeks === null || weeks < 0) {
      return { ok: false, error: `Enter ${PHASE_LABEL[phase]} weeks, 0 or more. Type 0 for a phase the job skips.` };
    }
    schedule[phase] = { value: weeks, ...form.weeksFrom[phase] };
  }
  if (form.lines.length === 0) return { ok: false, error: "Add at least one line to the plan." };

  const lines: PlanLine[] = [];
  for (const line of form.lines) {
    const name = line.label.trim() || "A line";
    if (line.label.trim() === "") return { ok: false, error: "Give every line a name." };
    const quantity = number(line.quantity);
    if (quantity === null || !(quantity > 0)) return { ok: false, error: `${name} needs a quantity above zero.` };
    const rate = number(line.rate);
    if (rate === null && line.noCardRate && line.rate.trim() === "") {
      return { ok: false, error: `Enter a rate for ${name}. The rate card has none for it.` };
    }
    if (rate === null || rate < 0) return { ok: false, error: `${name} needs a rate of 0 or more.` };
    const common = {
      id: line.id,
      label: line.label.trim(),
      group: line.group,
      quantity: { value: quantity, ...line.quantityFrom },
      rate: { value: rate, ...line.rateFrom },
    };
    if (line.basis === "lump_sum") {
      lines.push({ ...common, basis: "lump_sum" });
      continue;
    }
    if (line.basis === "unit") {
      if (line.unit.trim() === "") return { ok: false, error: `${name} needs a unit, such as SF or Each.` };
      lines.push({ ...common, basis: "unit", unit: line.unit.trim() });
      continue;
    }
    const weeks = number(line.weeks);
    if (line.weeks.trim() !== "" && (weeks === null || weeks < 0)) {
      return { ok: false, error: `${name} needs its own weeks as 0 or more, or blank to use its phases.` };
    }
    if (line.phases.length === 0 && weeks === null) {
      return { ok: false, error: `${name} needs at least one phase.` };
    }
    const timed: PlanLine = {
      ...common,
      basis: "time",
      per: line.per,
      phases: SCHEDULE_PHASES.filter((phase) => line.phases.includes(phase)),
      ...(weeks !== null ? { weeks: { value: weeks, ...line.weeksFrom } } : {}),
    };
    if (line.per === "day") {
      const days = number(line.daysPerWeek);
      if (days === null || !(days > 0 && days <= 7)) {
        return { ok: false, error: `${name} is priced per day, so it needs days per week from 1 to 7.` };
      }
      timed.daysPerWeek = { value: days, ...line.daysFrom };
    }
    lines.push(timed);
  }
  return { ok: true, plan: { schedule, lines, confidence: form.confidence } };
}

/**
 * The priced plan, or null while the form cannot be priced yet. Only for
 * showing each line's amount as the estimator types; the run prices the plan
 * itself.
 */
export function pricedPlanOf(form: PlanForm) {
  const parsed = planFromForm(form);
  if (!parsed.ok) return null;
  try {
    return priceResourcePlan(parsed.plan);
  } catch {
    return null;
  }
}

function freshId(taken: Set<string>, base: string): string {
  let id = base;
  for (let n = 2; taken.has(id); n += 1) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

/**
 * The lines one rate-card row adds: a role runs through construction at its
 * day rate; a field-office item keeps its own basis, and a connect-then-
 * monthly item adds the connect and the monthly service.
 */
export function linesFromRateCard(
  kind: "staff" | "office",
  rateId: string,
  options: Pick<MarkupOptions, "staffingRates" | "fieldOfficeRates">,
  existing: PlanLineForm[],
): PlanLineForm[] {
  const plan = planFromStaffingChoices(
    kind === "staff" ? { staff: [{ rateId }] } : { fieldOffice: [{ rateId }] },
    options.staffingRates,
    options.fieldOfficeRates,
  );
  const taken = new Set(existing.map((line) => line.id));
  return plan.lines.map((line) => ({ ...lineForm(line), id: freshId(taken, line.id) }));
}

/**
 * The General Requirements rate card rows a plan may add, by section. A row
 * marked not priceable (Insurances & Bonds) is never offered.
 */
export function grRateOptions(rates: GrRate[]): { section: string; rates: GrRate[] }[] {
  const sections = new Map<string, GrRate[]>();
  for (const rate of rates) {
    if (!rate.priceable) continue;
    sections.set(rate.section, [...(sections.get(rate.section) ?? []), rate]);
  }
  return [...sections].map(([section, rows]) => ({ section, rates: rows }));
}

/**
 * The line one General Requirements rate card row adds (LA-1398), under its
 * own section. A weekly or monthly row runs through construction at its rate;
 * a unit row keeps its unit, with the quantity left for this job, since the
 * card's quantity is the warehouse's; any other row is a lump sum.
 *
 * A row marked not priceable adds nothing. A row with no rate, or a rate of
 * zero, adds the line with the rate blank, so the plan cannot be priced until
 * the estimator enters one. It never prices silently at zero.
 */
export function linesFromGrRate(rateId: string, rates: GrRate[], existing: PlanLineForm[]): PlanLineForm[] {
  const rate = rates.find((one) => one.id === rateId);
  if (!rate || !rate.priceable) return [];
  const taken = new Set(existing.map((line) => line.id));
  const hasRate = rate.rate !== null && rate.rate > 0;
  const common = {
    ...blankLine([], rate.section),
    id: freshId(taken, `gr-${rate.id}`),
    label: rate.item,
    rate: hasRate ? String(rate.rate) : "",
    rateFrom: hasRate ? { origin: "rate_card" as const, ref: rate.id, source: rate.sourceEstimate } : TYPED,
    ...(hasRate ? {} : { noCardRate: true }),
  };
  switch (rate.basis) {
    case "phase_weeks":
      return [{ ...common, basis: "time", per: "week", phases: ["construction"] }];
    case "phase_months":
      return [{ ...common, basis: "time", per: "month", phases: ["construction"] }];
    case "unit":
      return [{ ...common, basis: "unit", unit: rate.unit ?? "", quantity: "" }];
    default:
      return [{ ...common, basis: "lump_sum" }];
  }
}

/** A line of the estimator's own, not from the rate card. */
export function blankLine(existing: PlanLineForm[], group: string = "General Expenses"): PlanLineForm {
  const taken = new Set(existing.map((line) => line.id));
  return {
    id: freshId(taken, "own-line"),
    label: "",
    group,
    basis: "lump_sum",
    per: "week",
    phases: ["construction"],
    unit: "",
    quantity: "1",
    rate: "",
    daysPerWeek: "",
    weeks: "",
    quantityFrom: TYPED,
    rateFrom: TYPED,
    daysFrom: TYPED,
    weeksFrom: TYPED,
  };
}

/** Where a figure came from, in the words a budget shows, to follow "from". */
export function originWords(figure: FigureFrom): string {
  switch (figure.origin) {
    case "rate_card":
      return figure.source ? `the rate card, ${figure.source}` : "the rate card";
    case "proposed":
      return "a proposal, a planning assumption";
    case "fact":
      return "the project's facts";
    case "estimator":
      return "the estimator";
  }
}
