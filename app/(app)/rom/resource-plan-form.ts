import {
  applyScheduleProposal,
  PHASE_LABEL,
  proposedFigure,
  planFromStaffingChoices,
  priceResourcePlan,
  resolveLineSwitch,
  ruleById,
  ruleForGroup,
  SCHEDULE_PHASES,
  type ConfidenceFlag,
  type FigureOrigin,
  type LineRuleFacts,
  type LineRuleId,
  type LineSwitch,
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
  /**
   * The rule that switches the line on and off (LA-1402, line-rules.ts). Only
   * a line a rule governs has one; a line the estimator added has none.
   */
  ruleId?: LineRuleId;
  /**
   * The estimator's own switch. It wins over the rule until they reset it,
   * and a line they switched off never comes back on by itself.
   */
  manual?: "on" | "off";
};

/** The answers the rules read besides the plan's schedule. Null where the estimator has not given one. */
export type PlanAnswers = {
  storiesAboveGrade: number | null;
  grossSquareFeet: number | null;
  /** YYYY-MM-DD. No screen asks for it yet. */
  constructionStart?: string | null;
};

export const NO_ANSWERS: PlanAnswers = { storiesAboveGrade: null, grossSquareFeet: null };

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

/** A plan with no weeks typed and no lines. The proposed schedule (LA-1399) fills its weeks where it can. */
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
    ...(line.switch?.rule ? { ruleId: line.switch.rule } : {}),
    ...(line.switch?.by === "estimator" ? { manual: line.switch.on ? ("on" as const) : ("off" as const) } : {}),
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

/** What the rules read for this plan: the answers, and the construction weeks the plan carries. */
export function ruleFactsOf(form: PlanForm, answers: PlanAnswers): LineRuleFacts {
  const weeks = number(form.weeks.construction);
  return {
    storiesAboveGrade: answers.storiesAboveGrade,
    grossSquareFeet: answers.grossSquareFeet,
    constructionWeeks: weeks !== null && weeks > 0 ? weeks : null,
    constructionStart: answers.constructionStart ?? null,
  };
}

/**
 * A line's switch as it stands (LA-1402): the estimator's own where they set
 * one, otherwise its rule read against the answers and the schedule. Null for
 * a line no rule governs and nobody switched, which always prices.
 */
export function switchOf(line: PlanLineForm, form: PlanForm, answers: PlanAnswers): LineSwitch | null {
  const rule = line.ruleId ? ruleById(line.ruleId) : null;
  const result = rule ? rule.evaluate(ruleFactsOf(form, answers)) : null;
  return resolveLineSwitch(rule?.id ?? null, result, line.manual);
}

/** The plan the form describes, or what is wrong with it in words the screen shows. */
export function planFromForm(
  form: PlanForm,
  answers: PlanAnswers = NO_ANSWERS,
): { ok: true; plan: ResourcePlan } | { ok: false; error: string } {
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
    const lineSwitch = switchOf(line, form, answers);
    // A line that is off prices nothing, so it keeps what was typed and needs no more.
    const off = lineSwitch !== null && !lineSwitch.on;
    const quantity = number(line.quantity);
    if (!off && (quantity === null || !(quantity > 0))) return { ok: false, error: `${name} needs a quantity above zero.` };
    const rate = number(line.rate);
    if (!off && rate === null && line.noCardRate && line.rate.trim() === "") {
      return { ok: false, error: `Enter a rate for ${name}. The rate card has none for it.` };
    }
    if (!off && (rate === null || rate < 0)) return { ok: false, error: `${name} needs a rate of 0 or more.` };
    const common = {
      id: line.id,
      label: line.label.trim(),
      group: line.group,
      quantity: { value: quantity !== null && quantity > 0 ? quantity : 0, ...line.quantityFrom },
      rate: { value: rate !== null && rate >= 0 ? rate : 0, ...line.rateFrom },
      ...(lineSwitch ? { switch: lineSwitch } : {}),
    };
    if (line.basis === "lump_sum") {
      lines.push({ ...common, basis: "lump_sum" });
      continue;
    }
    if (line.basis === "unit") {
      if (!off && line.unit.trim() === "") return { ok: false, error: `${name} needs a unit, such as SF or Each.` };
      lines.push({ ...common, basis: "unit", unit: line.unit.trim() || "Each" });
      continue;
    }
    const weeks = number(line.weeks);
    if (!off && line.weeks.trim() !== "" && (weeks === null || weeks < 0)) {
      return { ok: false, error: `${name} needs its own weeks as 0 or more, or blank to use its phases.` };
    }
    const ownWeeks = weeks !== null && weeks >= 0;
    const phases = SCHEDULE_PHASES.filter((phase) => line.phases.includes(phase));
    if (!off && phases.length === 0 && !ownWeeks) {
      return { ok: false, error: `${name} needs at least one phase.` };
    }
    const days = number(line.daysPerWeek);
    const daysOk = days !== null && days > 0 && days <= 7;
    if (!off && line.per === "day" && !daysOk) {
      return { ok: false, error: `${name} is priced per day, so it needs days per week from 1 to 7.` };
    }
    const timed: PlanLine = {
      ...common,
      basis: "time",
      // A line that is off and lacks what its basis needs is kept as a weekly line, unpriced.
      per: off && line.per === "day" && !daysOk ? "week" : line.per,
      phases: phases.length === 0 && !ownWeeks ? ["construction"] : phases,
      ...(ownWeeks ? { weeks: { value: weeks as number, ...line.weeksFrom } } : {}),
    };
    if (timed.per === "day") timed.daysPerWeek = { value: days as number, ...line.daysFrom };
    lines.push(timed);
  }
  return { ok: true, plan: { schedule, lines, confidence: form.confidence } };
}

/**
 * The priced plan, or null while the form cannot be priced yet. Only for
 * showing each line's amount as the estimator types; the run prices the plan
 * itself.
 */
export function pricedPlanOf(form: PlanForm, answers: PlanAnswers = NO_ANSWERS) {
  const parsed = planFromForm(form, answers);
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

// ---- LA-1402: lines switched on and off by rule, or by hand -----------------

/** The estimator's switch on one line. It wins over the line's rule until reset. */
export function setLineSwitch(form: PlanForm, lineId: string, to: "on" | "off"): PlanForm {
  return { ...form, lines: form.lines.map((line) => (line.id === lineId ? { ...line, manual: to } : line)) };
}

/** Puts one line back under its rule. A line with no rule goes back on. */
export function resetLineSwitch(form: PlanForm, lineId: string): PlanForm {
  return {
    ...form,
    lines: form.lines.map((line) => {
      if (line.id !== lineId) return line;
      return withoutManual(line);
    }),
  };
}

/** Puts every line back under its rule. */
export function resetAllLineSwitches(form: PlanForm): PlanForm {
  return {
    ...form,
    lines: form.lines.map(withoutManual),
  };
}

function withoutManual(line: PlanLineForm): PlanLineForm {
  const rest = { ...line };
  delete rest.manual;
  return rest;
}

/**
 * The lines a new General Requirements plan opens with, one rule each
 * (LA-1402). They are General Requirements rate card rows a rule governs,
 * chosen because each has a rate on the card and a natural count of one: one
 * operator, one set of ductwork, one guard, one camera. Rows that price by
 * area or need a count from the building wait for LA-1401. The quantity
 * carries that, so it never reads as a measured figure.
 *
 * FOR MATT TO CONFIRM: which rows a plan opens with. The rate card is one
 * warehouse job (C-00379), so this is a starting set, not Kulka's standard.
 */
export const RULE_SEED_ROWS: { section: string; item: string }[] = [
  { section: "Hoists, Cranes & Scaffolding", item: "Materials Hoist - Equipment, Hoist Operator (O.E.) - Labor" },
  { section: "Cold Weather Protection", item: "Heater Type: Indirect Heaters (Ducted), Heaters Required, Transportation (to & Fro)" },
  {
    section: "Cold Weather Protection",
    item: "Temporary Heat & Prot. - Materials, Heater Type: Indirect Heaters (Ducted), Ductwork (Install & Remove)",
  },
  { section: "Security", item: "Security Guards" },
  { section: "Site Controls", item: "Webcam - Video, Cameras" },
  { section: "Site Controls", item: "Webcam - Video, Cellular Service" },
];

export const ONE_OF_EACH: FigureFrom = {
  origin: "proposed",
  ref: "one-of-each",
  source: "One, until quantities come from the project's facts (LA-1401)",
};

/**
 * A new General Requirements plan opened with the lines its rules switch. Only
 * a plan with no lines is opened this way, so a plan the estimator built, or
 * one saved before LA-1402, keeps exactly the lines it has. Each line follows
 * its rule, and shows it, from the moment it opens.
 */
export function withRuleLines(form: PlanForm, rates: GrRate[]): PlanForm {
  if (form.lines.length > 0) return form;
  const lines: PlanLineForm[] = [];
  for (const seed of RULE_SEED_ROWS) {
    const rate = rates.find((one) => one.section === seed.section && one.item === seed.item);
    if (!rate) continue;
    const rule = ruleForGroup(rate.section);
    if (!rule) continue;
    for (const line of linesFromGrRate(rate.id, rates, [...form.lines, ...lines])) {
      lines.push({ ...line, ruleId: rule.id, quantity: "1", quantityFrom: ONE_OF_EACH });
    }
  }
  return lines.length === 0 ? form : { ...form, lines };
}

/** The answers the rules read, from New Budget's answers as they stand. A blank or non-numeric answer is null. */
export function planAnswersFromResponses(responses: Readonly<Record<string, string | undefined>>): PlanAnswers {
  const read = (key: string): number | null => {
    const text = (responses[key] ?? "").trim();
    if (text === "") return null;
    const n = Number(text);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  return { storiesAboveGrade: read("stories_above_grade"), grossSquareFeet: read("gross_square_feet") };
}

/** The answers the rules read, from a saved project's facts. */
export function planAnswersFromProject(facts: { stories: number | null; grossSquareFeet: number | null } | null | undefined): PlanAnswers {
  return {
    storiesAboveGrade: facts?.stories && facts.stories > 0 ? facts.stories : null,
    grossSquareFeet: facts?.grossSquareFeet && facts.grossSquareFeet > 0 ? facts.grossSquareFeet : null,
  };
}
