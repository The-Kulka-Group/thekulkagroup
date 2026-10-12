import { describe, expect, it } from "vitest";

import { tier1Flow } from "./question-flow";

import {
  factsQuestions,
  gatesFromResponses,
  lastQuestion,
  requiredAnswered,
  scopeQuestions,
} from "./new-budget-flow";

// LA-1141. The guided New budget flow's step split and its gate map, tested
// against the real tier1-flow.json the site reads everywhere else, so a
// passing test is a test of the file that ships, not of a copy of it.

describe("factsQuestions / scopeQuestions", () => {
  it("puts exactly the nine top-level facts on the Facts step, in the file's order", () => {
    const ids = factsQuestions(tier1Flow(), {}).map((q) => q.id);
    expect(ids).toEqual([
      "project_type",
      "construction_kind",
      "gross_square_feet",
      "stories_above_grade",
      "unit_count",
      "building_count",
      "zip",
      // LA-1245
      "labor_type",
      "parking_type",
    ]);
  });

  it("puts the nine scope gates on the Scope step, with no follow-up until its gate opens", () => {
    const ids = scopeQuestions(tier1Flow(), {}).map((q) => q.id);
    expect(ids).toEqual([
      "demolition",
      "levels_below_grade",
      "existing_building_tie_in",
      "site_conditions",
      "amenity_scope",
      "elevator",
      "retail_storefronts",
      "balconies",
      "radio_amplifier",
    ]);
  });

  it("shows demolition's follow-up on the Scope step only once demolition is answered yes", () => {
    const closed = scopeQuestions(tier1Flow(), { demolition: "no" }).map((q) => q.id);
    expect(closed).not.toContain("demolition_structure_count");

    const open = scopeQuestions(tier1Flow(), { demolition: "yes" }).map((q) => q.id);
    expect(open).toContain("demolition_structure_count");
  });

  it("shows the square-feet and structure-type follow-ups only once the count is one or more", () => {
    const zero = scopeQuestions(tier1Flow(), {
      demolition: "yes",
      demolition_structure_count: "0",
    }).map((q) => q.id);
    expect(zero).not.toContain("demolition_structure_square_feet");
    expect(zero).not.toContain("demolition_structure_type");

    const two = scopeQuestions(tier1Flow(), {
      demolition: "yes",
      demolition_structure_count: "2",
    }).map((q) => q.id);
    expect(two).toContain("demolition_structure_square_feet");
    expect(two).toContain("demolition_structure_type");
  });

  it("carries the file's own wording rather than anything hard-coded here", () => {
    const [projectType] = factsQuestions(tier1Flow(), {});
    expect(projectType.prompt).toBe("What kind of project is this?");
    expect(projectType.choices).toEqual([
      { value: "multifamily", label: "Multifamily" },
      { value: "self_storage", label: "Self Storage" },
    ]);
  });
});

describe("requiredAnswered", () => {
  it("is false until every required question in the list has an answer", () => {
    const facts = factsQuestions(tier1Flow(), {});
    expect(requiredAnswered(facts, {})).toBe(false);
    expect(
      requiredAnswered(facts, {
        project_type: "multifamily",
        construction_kind: "new",
        gross_square_feet: "42000",
        stories_above_grade: "4",
        unit_count: "120",
        parking_type: "none",
      }),
    ).toBe(true);
  });

  it("refuses a number answer of zero or blank", () => {
    const facts = factsQuestions(tier1Flow(), {});
    expect(
      requiredAnswered(facts, {
        project_type: "multifamily",
        construction_kind: "new",
        gross_square_feet: "0",
        stories_above_grade: "4",
        unit_count: "120",
        parking_type: "none",
      }),
    ).toBe(false);
  });

  // LA-1199: Matt confirmed on 2026-09-27 that Stories Above Grade and Unit
  // Count are required for a multifamily project and not for any other.
  // Building Count and ZIP stay optional on every project type.
  it("requires stories above grade and unit count only for a multifamily project", () => {
    const facts = factsQuestions(tier1Flow(), {});
    const withoutEither = {
      project_type: "multifamily",
      construction_kind: "new",
      gross_square_feet: "42000",
      parking_type: "none",
    };
    expect(requiredAnswered(facts, withoutEither)).toBe(false);

    const selfStorage = { ...withoutEither, project_type: "self_storage" };
    expect(requiredAnswered(facts, selfStorage)).toBe(true);
  });

  it("leaves building count and ZIP optional, and validates ZIP's shape when given", () => {
    const facts = factsQuestions(tier1Flow(), {});
    const complete = {
      project_type: "multifamily",
      construction_kind: "new",
      gross_square_feet: "42000",
      stories_above_grade: "4",
      unit_count: "120",
      parking_type: "none",
    };
    expect(requiredAnswered(facts, complete)).toBe(true);
    expect(requiredAnswered(facts, { ...complete, zip: "10956" })).toBe(true);
    expect(requiredAnswered(facts, { ...complete, zip: "not-a-zip" })).toBe(false);
  });

  it("accepts a structure count of zero, since that closes its own follow-ups rather than leaving them unanswered", () => {
    const responses = { demolition: "yes", demolition_structure_count: "0" };
    const countOnly = scopeQuestions(tier1Flow(), responses).filter(
      (q) => q.id === "demolition_structure_count",
    );
    expect(requiredAnswered(countOnly, responses)).toBe(true);
  });

  it("requires the square-feet and structure-type follow-ups once the count opens them", () => {
    const followUps = (responses: Record<string, string>) =>
      scopeQuestions(tier1Flow(), responses).filter((q) =>
        ["demolition_structure_square_feet", "demolition_structure_type"].includes(q.id),
      );

    const unanswered = { demolition: "yes", demolition_structure_count: "2" };
    expect(requiredAnswered(followUps(unanswered), unanswered)).toBe(false);

    const answered = {
      demolition: "yes",
      demolition_structure_count: "2",
      demolition_structure_square_feet: "18000",
      demolition_structure_type: "wood_frame_type_v",
    };
    expect(requiredAnswered(followUps(answered), answered)).toBe(true);
  });
});

describe("gatesFromResponses", () => {
  it("maps every answered gate onto its section", () => {
    const gates = gatesFromResponses(tier1Flow(), {
      demolition: "yes",
      demolition_structure_count: "2",
      levels_below_grade: "no",
      elevator: "dont_know",
    });
    expect(gates).toEqual({ demolition: "yes", levels_below_grade: "no", elevator: "dont_know" });
  });

  it("leaves an unanswered gate out entirely", () => {
    const gates = gatesFromResponses(tier1Flow(), { demolition: "no" });
    expect(gates).toEqual({ demolition: "no" });
  });

  it("does not map a closed follow-up, because it is not a branch gate", () => {
    const gates = gatesFromResponses(tier1Flow(), { demolition: "yes", demolition_structure_count: "3" });
    expect(gates.demolition_structure_count).toBeUndefined();
  });
});

describe("the steps at a price level (LA-2218)", () => {
  it("asks parking at Level 1, adds soil at Level 2 and balconies at Level 3", () => {
    const scope = (level: 1 | 2 | 3) => scopeQuestions(tier1Flow(), {}, level).map((q) => q.id);
    expect(factsQuestions(tier1Flow(), {}, 1).map((q) => q.id)).toContain("parking_type");
    expect(scope(1)).not.toContain("site_conditions");
    expect(scope(2)).toContain("site_conditions");
    expect(scope(2)).not.toContain("balconies");
    expect(scope(3)).toContain("balconies");
  });

  it("shows everything when no level is given", () => {
    expect(scopeQuestions(tier1Flow(), {}).map((q) => q.id)).toContain("balconies");
  });

  // LA-2209 review Q2: the building cards start on the last question the level asks.
  it("names the last question each level asks, never one the level hides", () => {
    for (const level of [1, 2, 3] as const) {
      const last = lastQuestion(tier1Flow(), {}, level);
      expect(last?.id).toBe("radio_amplifier");
      expect(last!.level).toBeLessThanOrEqual(level);
    }
  });

  // LA-2209 review S2: a gate the level does not ask saves as TBD, so a later
  // run off the project record keeps its items out of the total too.
  it("saves a gate the level does not ask as don't know, and keeps every answer given", () => {
    expect(gatesFromResponses(tier1Flow(), { parking_type: "surface" }, 1)).toMatchObject({
      site_conditions: "dont_know",
      balconies: "dont_know",
    });
    expect(gatesFromResponses(tier1Flow(), { site_conditions: "no" }, 1)).toMatchObject({
      site_conditions: "no",
      balconies: "dont_know",
    });
    expect(gatesFromResponses(tier1Flow(), {}, 2)).not.toHaveProperty("site_conditions");
    expect(gatesFromResponses(tier1Flow(), {}, 3)).toEqual({});
  });
});
