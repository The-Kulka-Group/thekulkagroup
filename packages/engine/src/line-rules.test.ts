import { describe, expect, it } from "vitest";

import {
  COLD_WEATHER_RULE,
  HOISTING_MIN_STORIES,
  HOISTING_RULE,
  LINE_RULES,
  ruleForGroup,
  SECURITY_MIN_CONSTRUCTION_WEEKS,
  SECURITY_MIN_GSF,
  SITE_SECURITY_RULE,
  WINTER,
  resolveLineSwitch,
  type LineRuleFacts,
} from "./line-rules";

// LA-1402. Each rule is a pure function of the project's answers and the
// schedule. Each test names the rule's source. A rule whose threshold is not
// in Kulka's data is marked for Matt to confirm, and the test says so.

const facts = (over: Partial<LineRuleFacts> = {}): LineRuleFacts => ({
  storiesAboveGrade: null,
  grossSquareFeet: null,
  constructionWeeks: null,
  constructionStart: null,
  ...over,
});

describe("every rule states its source", () => {
  it("has a rule, a source and a confirmation flag on each rule", () => {
    for (const rule of LINE_RULES) {
      expect(rule.statement.length).toBeGreaterThan(20);
      expect(rule.source.length).toBeGreaterThan(20);
      expect(typeof rule.forMattToConfirm).toBe("boolean");
    }
  });
});

describe("hoisting and scaffolding (threshold for Matt to confirm)", () => {
  it("is on from the named story count and shows the fact", () => {
    const result = HOISTING_RULE.evaluate(facts({ storiesAboveGrade: HOISTING_MIN_STORIES + 1 }));
    expect(result).toEqual({ state: "on", words: `On: ${HOISTING_MIN_STORIES + 1} stories` });
  });
  it("is on at exactly the threshold", () => {
    expect(HOISTING_RULE.evaluate(facts({ storiesAboveGrade: HOISTING_MIN_STORIES })).state).toBe("on");
  });
  it("is off below it", () => {
    expect(HOISTING_RULE.evaluate(facts({ storiesAboveGrade: 1 }))).toEqual({ state: "off", words: "Off: 1 story" });
  });
  it("is unknown when stories were not answered", () => {
    const result = HOISTING_RULE.evaluate(facts());
    expect(result.state).toBe("unknown");
    expect(result.words).toMatch(/stories/i);
  });
  it("is marked for Matt to confirm", () => {
    expect(HOISTING_RULE.forMattToConfirm).toBe(true);
  });
});

describe("cold-weather protection (winter from the schedule)", () => {
  it("is unknown when the schedule has no construction weeks", () => {
    const result = COLD_WEATHER_RULE.evaluate(facts());
    expect(result.state).toBe("unknown");
    expect(result.words).toMatch(/left for the estimator/i);
  });

  it("is on with no start date once the run is longer than the longest stretch clear of winter", () => {
    // Calendar arithmetic: winter is Dec to Mar (121 days), so any run of 245 days or more meets it.
    const clear = 365 - 121;
    expect(WINTER.days).toBe(121);
    const weeks = Math.ceil((clear + 1) / 7);
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: weeks })).state).toBe("on");
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 65 }))).toEqual({
      state: "on",
      words: "On: 65 weeks of construction cannot avoid winter",
    });
  });

  it("is unknown, not off, for a short run with no start date", () => {
    const result = COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 20 }));
    expect(result.state).toBe("unknown");
    expect(result.words).toMatch(/no start date/i);
  });

  it("with a start date, is on when the run crosses December to March", () => {
    const result = COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 20, constructionStart: "2026-10-05" }));
    expect(result.state).toBe("on");
    expect(result.words).toMatch(/^On: /);
  });

  it("with a start date, is off when the run stays clear of winter", () => {
    const result = COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 20, constructionStart: "2026-04-06" }));
    expect(result.state).toBe("off");
  });

  it("counts the last week of winter and the first day of it", () => {
    // Starts 31 March 2026 for one week: touches winter on 31 March.
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 1, constructionStart: "2026-03-31" })).state).toBe("on");
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 1, constructionStart: "2026-04-01" })).state).toBe("off");
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 1, constructionStart: "2026-11-25" })).state).toBe("on");
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 1, constructionStart: "2026-11-24" })).state).toBe("off");
  });

  it("treats a start date it cannot read as no start date", () => {
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 20, constructionStart: "soon" })).state).toBe("unknown");
  });

  it("is zero weeks of construction, unknown", () => {
    expect(COLD_WEATHER_RULE.evaluate(facts({ constructionWeeks: 0 })).state).toBe("unknown");
  });

  it("flags the winter months for Matt to confirm", () => {
    expect(COLD_WEATHER_RULE.forMattToConfirm).toBe(true);
  });
});

describe("site security and controls (thresholds for Matt to confirm)", () => {
  it("is on for a large building", () => {
    const result = SITE_SECURITY_RULE.evaluate(facts({ grossSquareFeet: SECURITY_MIN_GSF, constructionWeeks: 20 }));
    expect(result.state).toBe("on");
    expect(result.words).toBe(`On: ${SECURITY_MIN_GSF.toLocaleString("en-US")} SF`);
  });
  it("is on for a long job even when the area is unknown", () => {
    const result = SITE_SECURITY_RULE.evaluate(facts({ constructionWeeks: SECURITY_MIN_CONSTRUCTION_WEEKS }));
    expect(result).toEqual({ state: "on", words: `On: ${SECURITY_MIN_CONSTRUCTION_WEEKS} weeks of construction` });
  });
  it("is off when both are known and both are below", () => {
    expect(SITE_SECURITY_RULE.evaluate(facts({ grossSquareFeet: 40_000, constructionWeeks: 30 })).state).toBe("off");
  });
  it("is unknown when one is below and the other is not known", () => {
    expect(SITE_SECURITY_RULE.evaluate(facts({ grossSquareFeet: 40_000 })).state).toBe("unknown");
    expect(SITE_SECURITY_RULE.evaluate(facts({ constructionWeeks: 30 })).state).toBe("unknown");
    expect(SITE_SECURITY_RULE.evaluate(facts()).state).toBe("unknown");
  });
  it("is marked for Matt to confirm", () => {
    expect(SITE_SECURITY_RULE.forMattToConfirm).toBe(true);
  });
});

describe("which rule governs a group", () => {
  it("maps the rate card sections", () => {
    expect(ruleForGroup("Hoists, Cranes & Scaffolding")).toBe(HOISTING_RULE);
    expect(ruleForGroup("Cold Weather Protection")).toBe(COLD_WEATHER_RULE);
    expect(ruleForGroup("Security")).toBe(SITE_SECURITY_RULE);
    expect(ruleForGroup("Site Controls")).toBe(SITE_SECURITY_RULE);
    expect(ruleForGroup("Staff")).toBeNull();
  });
});

describe("resolving a line's switch", () => {
  const sw = (...args: Parameters<typeof resolveLineSwitch>) => resolveLineSwitch(...args)!;
  const on = { state: "on" as const, words: "On: 5 stories" };
  const off = { state: "off" as const, words: "Off: 1 story" };
  const unknown = { state: "unknown" as const, words: "Unknown: no stories" };

  it("follows the rule when the estimator has not touched the line", () => {
    expect(sw("hoisting", on, undefined)).toEqual({ on: true, by: "rule", rule: "hoisting", words: "On: 5 stories" });
    expect(sw("hoisting", off, undefined).on).toBe(false);
  });
  it("leaves an unknown line off and says it is the estimator's call", () => {
    const one = sw("hoisting", unknown, undefined);
    expect(one.on).toBe(false);
    expect(one.unknown).toBe(true);
  });
  it("lets a hand switch win over every rule result, and says so", () => {
    for (const result of [on, off, unknown]) {
      expect(sw("hoisting", result, "off").on).toBe(false);
      expect(sw("hoisting", result, "on").on).toBe(true);
    }
    const one = sw("hoisting", off, "on");
    expect(one.by).toBe("estimator");
    expect(one.rule).toBe("hoisting");
    expect(one.words).toMatch(/switched on by the estimator/i);
  });
  it("switches a line no rule governs only by hand", () => {
    expect(resolveLineSwitch(null, null, undefined)).toBeNull();
    expect(sw(null, null, "off")).toMatchObject({ on: false, by: "estimator" });
  });
});
