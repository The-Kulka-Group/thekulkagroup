import {
  isLineOn,
  SCHEDULE_PHASES,
  quantityRuleById,
  ruleById,
  type FigureOrigin,
  type LineSwitch,
  type OffPlanLine,
  type PlanFigure,
  type PlanLine,
  type ResourcePlan,
  type SchedulePhase,
  type TimePlanLine,
} from "@kulka/engine";

import type { GrRate } from "./gr-rates";

// LA-1397: checks an Allocated Resources plan a ROM request or a project save
// carries, before the engine prices it. The engine refuses a figure it cannot
// price; this says which one in words the screen can show. Only the fields a
// plan uses are kept, so what is recorded with a run is exactly what priced it.

export type ParsedResourcePlan = { ok: true; plan: ResourcePlan } | { ok: false; error: string };

// Every origin the app itself records is accepted. "proposed", "fact" and
// "schedule" are the app's own provenance for figures its rules filled in
// (schedule-proposal.ts, quantity-rules.ts); nothing here re-derives them, so
// a caller could send one for a figure it typed. The engine prices the value
// either way, and the origin only says where the figure came from.
const ORIGINS: readonly FigureOrigin[] = ["estimator", "rate_card", "proposed", "fact", "schedule"];
const CONFIDENCES = ["high", "medium", "low"] as const;
const PERS = ["day", "week", "month"] as const;
const BASES = ["time", "unit", "lump_sum"] as const;
const MAX_LINES = 300;
const MAX_TEXT = 200;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== "" && value.length <= MAX_TEXT;

function figure(value: unknown, what: string, rule: (n: number) => boolean, words: string): PlanFigure | string {
  if (!isObject(value) || typeof value.value !== "number" || !Number.isFinite(value.value)) {
    return `Send ${what} as a number.`;
  }
  if (!rule(value.value)) return `${what} ${words}.`;
  const origin = value.origin ?? "estimator";
  if (!ORIGINS.includes(origin as FigureOrigin)) return `Send ${what}'s origin as one of ${ORIGINS.join(", ")}.`;
  const out: PlanFigure = { value: value.value, origin: origin as FigureOrigin };
  if (value.ref !== undefined && value.ref !== null) {
    if (!isText(value.ref)) return `Send ${what}'s ref as text.`;
    out.ref = value.ref;
  }
  if (value.source !== undefined && value.source !== null) {
    if (!isText(value.source)) return `Send ${what}'s source as text.`;
    out.source = value.source;
  }
  return out;
}

const atLeastZero = (n: number) => n >= 0;
const aboveZero = (n: number) => n > 0;

/** A line's switch (LA-1402), or an error in words the screen can show. A line with none prices. */
function parseSwitch(value: unknown, label: string): LineSwitch | undefined | string {
  if (value === undefined || value === null) return undefined;
  if (!isObject(value) || typeof value.on !== "boolean") return `Send the switch of ${label} with on as true or false.`;
  if (value.by !== "rule" && value.by !== "estimator") return `Send who switched ${label} as "rule" or "estimator".`;
  if (typeof value.words !== "string" || value.words.length > MAX_TEXT) return `Send the switch words of ${label} as text.`;
  const out: LineSwitch = { on: value.on, by: value.by, words: value.words };
  if (value.rule !== undefined && value.rule !== null) {
    const rule = typeof value.rule === "string" ? ruleById(value.rule) : null;
    if (!rule) return `Send the rule of ${label} as a rule the app knows.`;
    out.rule = rule.id;
  }
  if (value.unknown === true) out.unknown = true;
  return out;
}

/**
 * A line switched off, kept as sent (LA-1402). It prices nothing, so nothing
 * on it beyond its name, group, basis and switch is required or checked. A
 * figure is kept where it is a number; anything else on it is dropped rather
 * than recorded.
 */
function offLine(
  raw: Record<string, unknown>,
  head: { id: string; label: string; group: string },
  lineSwitch: OffPlanLine["switch"],
  quantityRule: PlanLine["quantityRule"],
): OffPlanLine {
  const kept = (value: unknown): PlanFigure | undefined => {
    const read = figure(value, "", () => true, "");
    return typeof read === "string" ? undefined : read;
  };
  const line: OffPlanLine = {
    id: head.id,
    label: head.label.trim(),
    group: head.group.trim(),
    basis: raw.basis as OffPlanLine["basis"],
    switch: lineSwitch,
    ...(quantityRule ? { quantityRule } : {}),
  };
  const quantity = kept(raw.quantity);
  if (quantity) line.quantity = quantity;
  const rate = kept(raw.rate);
  if (rate) line.rate = rate;
  if (isText(raw.unit)) line.unit = raw.unit.trim();
  if (PERS.includes(raw.per as (typeof PERS)[number])) line.per = raw.per as OffPlanLine["per"];
  if (Array.isArray(raw.phases)) line.phases = SCHEDULE_PHASES.filter((phase) => (raw.phases as unknown[]).includes(phase));
  const days = kept(raw.daysPerWeek);
  if (days) line.daysPerWeek = days;
  const weeks = kept(raw.weeks);
  if (weeks) line.weeks = weeks;
  return line;
}

export function parseResourcePlan(value: unknown): ParsedResourcePlan {
  if (!isObject(value)) return { ok: false, error: "Send markups.resourcePlan as an object." };
  if (!isObject(value.schedule)) return { ok: false, error: "Send the plan's schedule." };

  const schedule = {} as ResourcePlan["schedule"];
  for (const phase of SCHEDULE_PHASES) {
    const read = figure(value.schedule[phase], `${phase} weeks`, atLeastZero, "must be zero or more");
    if (typeof read === "string") return { ok: false, error: read };
    schedule[phase] = read;
  }

  const confidence = value.confidence ?? "high";
  if (!CONFIDENCES.includes(confidence as (typeof CONFIDENCES)[number])) {
    return { ok: false, error: 'Send the plan\'s confidence as "high", "medium" or "low".' };
  }

  if (!Array.isArray(value.lines)) return { ok: false, error: "Send the plan's lines as a list." };
  if (value.lines.length > MAX_LINES) return { ok: false, error: `A plan holds at most ${MAX_LINES} lines.` };

  const ids = new Set<string>();
  const lines: PlanLine[] = [];
  for (const raw of value.lines) {
    if (!isObject(raw)) return { ok: false, error: "Send each plan line as an object." };
    if (!isText(raw.id) || ids.has(raw.id)) return { ok: false, error: "Each plan line needs its own id." };
    ids.add(raw.id);
    if (!isText(raw.label)) return { ok: false, error: "Each plan line needs a name." };
    if (!isText(raw.group)) return { ok: false, error: `${raw.label} needs a group.` };
    if (!BASES.includes(raw.basis as (typeof BASES)[number])) {
      return { ok: false, error: `Send the basis of ${raw.label} as "time", "unit" or "lump_sum".` };
    }
    const lineSwitch = parseSwitch(raw.switch, raw.label);
    if (typeof lineSwitch === "string") return { ok: false, error: lineSwitch };
    let quantityRule: PlanLine["quantityRule"];
    if (raw.quantityRule !== undefined && raw.quantityRule !== null) {
      const rule = typeof raw.quantityRule === "string" ? quantityRuleById(raw.quantityRule) : null;
      if (!rule) return { ok: false, error: `Send the quantity rule of ${raw.label} as a rule the app knows.` };
      quantityRule = rule.id;
    }
    if (lineSwitch?.on === false) {
      lines.push(offLine(raw, { id: raw.id, label: raw.label, group: raw.group }, { ...lineSwitch, on: false }, quantityRule));
      continue;
    }
    const quantity = figure(raw.quantity, `The quantity of ${raw.label}`, aboveZero, "must be above zero");
    if (typeof quantity === "string") return { ok: false, error: quantity };
    const rate = figure(raw.rate, `The rate of ${raw.label}`, atLeastZero, "must be zero or more");
    if (typeof rate === "string") return { ok: false, error: rate };
    const common = {
      id: raw.id,
      label: raw.label.trim(),
      group: raw.group.trim(),
      quantity,
      rate,
      ...(lineSwitch ? { switch: lineSwitch } : {}),
      ...(quantityRule ? { quantityRule } : {}),
    };

    if (raw.basis === "lump_sum") {
      lines.push({ ...common, basis: "lump_sum" });
      continue;
    }
    if (raw.basis === "unit") {
      if (!isText(raw.unit)) return { ok: false, error: `${raw.label} needs a unit.` };
      lines.push({ ...common, basis: "unit", unit: raw.unit.trim() });
      continue;
    }
    if (!PERS.includes(raw.per as (typeof PERS)[number])) {
      return { ok: false, error: `Send what the rate of ${raw.label} is per as "day", "week" or "month".` };
    }
    const per = raw.per as (typeof PERS)[number];
    if (!Array.isArray(raw.phases) || raw.phases.some((p) => !SCHEDULE_PHASES.includes(p as SchedulePhase))) {
      return { ok: false, error: `Send the phases of ${raw.label} as a list of precon, construction and closeout.` };
    }
    const phases = SCHEDULE_PHASES.filter((phase) => (raw.phases as unknown[]).includes(phase));
    const line: TimePlanLine = { ...common, basis: "time", per, phases };
    if (raw.weeks !== undefined && raw.weeks !== null) {
      const weeks = figure(raw.weeks, `The weeks of ${raw.label}`, atLeastZero, "must be zero or more");
      if (typeof weeks === "string") return { ok: false, error: weeks };
      line.weeks = weeks;
    }
    if (phases.length === 0 && !line.weeks) {
      return { ok: false, error: `${raw.label} needs a phase or weeks of its own.` };
    }
    if (per === "day") {
      const days = figure(
        raw.daysPerWeek,
        `The days per week of ${raw.label}`,
        (n) => n > 0 && n <= 7,
        "must be above zero and at most seven",
      );
      if (typeof days === "string") return { ok: false, error: days };
      line.daysPerWeek = days;
    }
    lines.push(line);
  }

  return { ok: true, plan: { schedule, lines, confidence: confidence as ResourcePlan["confidence"] } };
}

/**
 * The words refusing a plan that prices a General Requirements rate card row
 * marked not priceable (Insurances & Bonds: fee and insurance are already
 * markups, so pricing them here counts them twice), or null when it prices
 * none. The form never offers such a row; this refuses one sent another way.
 * A figure names its row by its ref. Only a line that prices is checked: a
 * line switched off is kept as sent.
 */
export function unpriceableRateError(plan: ResourcePlan, grRates: readonly GrRate[]): string | null {
  const held = new Map(grRates.filter((rate) => !rate.priceable).map((rate) => [rate.id, rate]));
  if (held.size === 0) return null;
  for (const line of plan.lines.filter(isLineOn)) {
    for (const figure of [line.rate, line.quantity]) {
      const row = figure.ref ? held.get(figure.ref) : undefined;
      if (!row) continue;
      return `${line.label} prices ${row.item} from ${row.section}, which the rate card marks not priceable. ${row.notPriceableReason ?? ""}`.trim();
    }
  }
  return null;
}
