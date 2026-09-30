import {
  SCHEDULE_PHASES,
  ruleById,
  type FigureOrigin,
  type LineSwitch,
  type PlanFigure,
  type PlanLine,
  type ResourcePlan,
  type SchedulePhase,
} from "@kulka/engine";

// LA-1397: checks an Allocated Resources plan a ROM request or a project save
// carries, before the engine prices it. The engine refuses a figure it cannot
// price; this says which one in words the screen can show. Only the fields a
// plan uses are kept, so what is recorded with a run is exactly what priced it.

export type ParsedResourcePlan = { ok: true; plan: ResourcePlan } | { ok: false; error: string };

const ORIGINS: readonly FigureOrigin[] = ["estimator", "rate_card", "proposed", "fact"];
const CONFIDENCES = ["high", "medium", "low"] as const;
const PERS = ["day", "week", "month"] as const;
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
    const lineSwitch = parseSwitch(raw.switch, raw.label);
    if (typeof lineSwitch === "string") return { ok: false, error: lineSwitch };
    // A line switched off prices nothing, so it may still lack a quantity.
    const off = lineSwitch?.on === false;
    const quantity = figure(raw.quantity, `The quantity of ${raw.label}`, off ? atLeastZero : aboveZero, off ? "must be zero or more" : "must be above zero");
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
    if (raw.basis !== "time") {
      return { ok: false, error: `Send the basis of ${raw.label} as "time", "unit" or "lump_sum".` };
    }
    if (!PERS.includes(raw.per as (typeof PERS)[number])) {
      return { ok: false, error: `Send what the rate of ${raw.label} is per as "day", "week" or "month".` };
    }
    const per = raw.per as (typeof PERS)[number];
    if (!Array.isArray(raw.phases) || raw.phases.some((p) => !SCHEDULE_PHASES.includes(p as SchedulePhase))) {
      return { ok: false, error: `Send the phases of ${raw.label} as a list of precon, construction and closeout.` };
    }
    const phases = SCHEDULE_PHASES.filter((phase) => (raw.phases as unknown[]).includes(phase));
    const line: PlanLine = { ...common, basis: "time", per, phases };
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
