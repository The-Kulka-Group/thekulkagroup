// Switching plan lines on and off from the project's answers (LA-1402, spec
// LA-1394). Each rule is a pure function of the answers and the schedule. It
// says on, off or unknown, in words the line can show ("On: 5 stories").
//
// A rule states its rule and its source, the way a Design and Engineering
// criterion does (docs/precon/criteria). Where a threshold is not in Kulka's
// data and Matt has not stated it, the rule says so with `forMattToConfirm`,
// and the constant carries the same mark. Nothing here is invented precision:
// an answer the rule needs and does not have makes the line unknown, and an
// unknown line is left for the estimator.
//
// The estimator's own switch always wins, until they reset it. The engine
// prices only lines that are on (resource-plan.ts).

/** What the rules read: answers the estimator gave, and the plan's schedule. */
export type LineRuleFacts = {
  storiesAboveGrade: number | null;
  grossSquareFeet: number | null;
  /** Weeks of the construction phase, from the proposed or entered schedule. Null or 0 when it has none. */
  constructionWeeks: number | null;
  /**
   * When construction starts, YYYY-MM-DD. No screen asks for it yet, so it is
   * usually null and cold-weather protection then rests on weeks alone.
   */
  constructionStart?: string | null;
};

export type RuleState = "on" | "off" | "unknown";

export type RuleResult = {
  state: RuleState;
  /** The line's reason in plain words, such as "On: 5 stories". */
  words: string;
};

export type LineRuleId = "hoisting" | "cold_weather" | "site_security";

export type LineRule = {
  id: LineRuleId;
  name: string;
  /** The rate card sections whose lines the rule switches. */
  sections: readonly string[];
  /** The rule in one sentence. */
  statement: string;
  /** Where the rule and its figures come from. */
  source: string;
  /** True where a figure in the rule is not in Kulka's data and Matt has not stated it. */
  forMattToConfirm: boolean;
  evaluate: (facts: LineRuleFacts) => RuleResult;
};

const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n > 0;
const stories = (n: number) => `${n} ${n === 1 ? "story" : "stories"}`;
const weeksWords = (n: number) => `${n} ${n === 1 ? "week" : "weeks"}`;

// ---- Hoisting and scaffolding -------------------------------------------

/**
 * FOR MATT TO CONFIRM. The story count from which hoisting and scaffolding
 * come on. Kulka's data holds no threshold: C-00379, a warehouse, leaves its
 * hoist lines blank. Four is the placeholder, not a finding.
 */
export const HOISTING_MIN_STORIES = 4;

export const HOISTING_RULE: LineRule = {
  id: "hoisting",
  name: "Hoisting and Scaffolding",
  sections: ["Hoists, Cranes & Scaffolding"],
  statement: `Hoisting and scaffolding lines come on when the building has ${HOISTING_MIN_STORIES} or more stories above grade.`,
  source:
    "The story count comes from the New Budget answer Stories Above Grade. The threshold is not in Kulka's data (C-00379 leaves its hoist lines blank), so it is for Matt to confirm.",
  forMattToConfirm: true,
  evaluate(facts) {
    if (!known(facts.storiesAboveGrade)) {
      return { state: "unknown", words: "Unknown: no stories answered. Left for the estimator" };
    }
    const n = facts.storiesAboveGrade;
    return n >= HOISTING_MIN_STORIES
      ? { state: "on", words: `On: ${stories(n)}` }
      : { state: "off", words: `Off: ${stories(n)}` };
  },
};

// ---- Cold-weather protection --------------------------------------------

/**
 * FOR MATT TO CONFIRM. Winter is December to March, in Kulka's Northeast
 * market. `longestClearDays` is calendar arithmetic from it: April 1 to
 * November 30 is 244 days, the longest stretch with no winter day in it.
 */
export const WINTER = { startMonth: 12, endMonth: 3, days: 121, longestClearDays: 244 } as const;

const DAY_MS = 86_400_000;

function parseDay(value: string | null | undefined): number | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function inWinter(time: number): boolean {
  const month = new Date(time).getUTCMonth() + 1;
  return month >= WINTER.startMonth || month <= WINTER.endMonth;
}

export const COLD_WEATHER_RULE: LineRule = {
  id: "cold_weather",
  name: "Cold-Weather Protection",
  sections: ["Cold Weather Protection"],
  statement:
    "Cold-weather protection comes on when construction runs into December to March. With a start date, it counts the days. With weeks alone, it comes on once construction is longer than the longest stretch clear of winter (244 days), and stays unknown below that.",
  source:
    "Calendar arithmetic on the schedule's construction weeks, proposed (LA-1399) or entered. The December to March window is for Matt to confirm. C-00379 priced cold-weather protection (55 man-days of labor, heaters for 11 weeks).",
  forMattToConfirm: true,
  evaluate(facts) {
    const weeks = facts.constructionWeeks;
    if (!known(weeks)) {
      return { state: "unknown", words: "Unknown: the schedule has no construction weeks. Left for the estimator" };
    }
    const start = parseDay(facts.constructionStart);
    if (start === null) {
      if (weeks * 7 > WINTER.longestClearDays) {
        return { state: "on", words: `On: ${weeksWords(weeks)} of construction cannot avoid winter` };
      }
      return {
        state: "unknown",
        words: `Unknown: no start date, so ${weeksWords(weeks)} of construction may or may not meet winter. Left for the estimator`,
      };
    }
    let crosses = false;
    for (let day = 0; day < weeks * 7; day += 1) {
      if (inWinter(start + day * DAY_MS)) {
        crosses = true;
        break;
      }
    }
    const from = facts.constructionStart as string;
    return crosses
      ? { state: "on", words: `On: ${weeksWords(weeks)} of construction from ${from} meet winter` }
      : { state: "off", words: `Off: ${weeksWords(weeks)} of construction from ${from} stay clear of winter` };
  },
};

// ---- Site security and controls -----------------------------------------

/** FOR MATT TO CONFIRM. Gross area from which site security and controls come on. */
export const SECURITY_MIN_GSF = 100_000;

/** FOR MATT TO CONFIRM. Weeks of construction from which site security and controls come on. */
export const SECURITY_MIN_CONSTRUCTION_WEEKS = 52;

export const SITE_SECURITY_RULE: LineRule = {
  id: "site_security",
  name: "Site Security and Controls",
  sections: ["Security", "Site Controls"],
  statement: `Site security and site controls come on when the building is ${SECURITY_MIN_GSF.toLocaleString("en-US")} SF or more, or construction runs ${SECURITY_MIN_CONSTRUCTION_WEEKS} weeks or more.`,
  source:
    "Gross area from the New Budget answers, weeks from the schedule. No question asks for the site's own size, so building area stands in for it. Both thresholds are for Matt to confirm. C-00379 (120,000 SF, 65 weeks of construction) carries guards, cameras and fencing, which fits the rule and does not set it.",
  forMattToConfirm: true,
  evaluate(facts) {
    const area = known(facts.grossSquareFeet) ? facts.grossSquareFeet : null;
    const weeks = known(facts.constructionWeeks) ? facts.constructionWeeks : null;
    if (area !== null && area >= SECURITY_MIN_GSF) {
      return { state: "on", words: `On: ${area.toLocaleString("en-US")} SF` };
    }
    if (weeks !== null && weeks >= SECURITY_MIN_CONSTRUCTION_WEEKS) {
      return { state: "on", words: `On: ${weeksWords(weeks)} of construction` };
    }
    if (area !== null && weeks !== null) {
      return { state: "off", words: `Off: ${area.toLocaleString("en-US")} SF and ${weeksWords(weeks)} of construction` };
    }
    return {
      state: "unknown",
      words: `Unknown: ${area === null ? "no area answered" : "no construction weeks in the schedule"}. Left for the estimator`,
    };
  },
};

export const LINE_RULES: readonly LineRule[] = [HOISTING_RULE, COLD_WEATHER_RULE, SITE_SECURITY_RULE];

/** The rule that switches lines in a group (a rate card section), or null for a group no rule governs. */
export function ruleForGroup(group: string): LineRule | null {
  return LINE_RULES.find((rule) => rule.sections.includes(group)) ?? null;
}

export function ruleById(id: string): LineRule | null {
  return LINE_RULES.find((rule) => rule.id === id) ?? null;
}

/**
 * A line's switch as it stands: whether it prices, and who decided.
 *
 * - `by: "rule"`: the estimator has not touched it, so it follows its rule.
 *   An unknown rule leaves it off and marks it for the estimator.
 * - `by: "estimator"`: the estimator switched it by hand. That wins over the
 *   rule until they reset it.
 */
export type LineSwitch = {
  on: boolean;
  by: "rule" | "estimator";
  /** The rule id, kept on a hand-switched line so a reset can go back to it. */
  rule?: LineRuleId;
  words: string;
  /** The rule could not say and no hand switch was made. */
  unknown?: boolean;
};

export function resolveLineSwitch(
  rule: LineRuleId | null,
  result: RuleResult | null,
  manual: "on" | "off" | undefined,
): LineSwitch | null {
  if (manual !== undefined) {
    const words = manual === "on" ? "On: switched on by the estimator" : "Off: switched off by the estimator";
    return { on: manual === "on", by: "estimator", ...(rule ? { rule } : {}), words };
  }
  if (rule === null || result === null) return null;
  return {
    on: result.state === "on",
    by: "rule",
    rule,
    words: result.words,
    ...(result.state === "unknown" ? { unknown: true } : {}),
  };
}
