import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOW_FILE,
  FlowAnswersInvalid,
  FlowDefinitionInvalid,
  lockedLevels,
  parseFlowDefinition,
  questionsAtLevel,
  readFlowAnswers,
  tier1Flow,
  visibleQuestions,
} from "@/lib/rom/question-flow";

// The point of LA-20 is that the file drives the flow. These tests read the
// shipped file, edit the copy in memory, and assert the flow changed, with no
// change to any code.

function shippedFile(): Record<string, unknown> {
  return JSON.parse(readFileSync(join(process.cwd(), FLOW_FILE), "utf8"));
}

type RawQuestion = Record<string, unknown> & { id: string };

function questionsOf(file: Record<string, unknown>): RawQuestion[] {
  return file.questions as RawQuestion[];
}

describe("the shipped tier-1 definition", () => {
  it("parses, and the site's flow is the file's flow", () => {
    const fromDisk = parseFlowDefinition(shippedFile());
    expect(tier1Flow()).toEqual(fromDisk);
  });

  it("carries no number that prices anything", () => {
    // The definition says what is asked and where the answer lands. What an
    // answer costs lives in the benchmarks and the engine parameters, never
    // here. The only number the file may carry is its own version.
    const file = shippedFile();
    const numbers: number[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "number") numbers.push(value);
      else if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") {
        // LA-2218: a question's level (1, 2 or 3) says when it appears, not what it costs.
        for (const [key, one] of Object.entries(value)) if (key !== "level") walk(one);
      }
    };
    walk({ ...file, version: undefined });
    expect(numbers).toEqual([]);
  });
});

describe("editing the definition changes the flow", () => {
  it("asks a question the file adds, with no code change", () => {
    const file = shippedFile();
    questionsOf(file).push({
      id: "elevator_stops",
      prompt: "How many elevator stops?",
      kind: "number",
      required: true,
      mapsTo: { target: "intake_field", name: "elevatorStops" },
    });

    const definition = parseFlowDefinition(file);
    const asked = visibleQuestions(definition, {}).map((question) => question.id);
    expect(asked).toContain("elevator_stops");
    expect(tier1Flow().questions.map((q) => q.id)).not.toContain("elevator_stops");
  });

  it("stops asking a question the file removes", () => {
    const file = shippedFile();
    file.questions = questionsOf(file).filter((question) => question.id !== "amenity_scope");

    const asked = visibleQuestions(parseFlowDefinition(file), {}).map((q) => q.id);
    expect(asked).not.toContain("amenity_scope");
  });

  it("reorders the questions when the file reorders them", () => {
    const file = shippedFile();
    const questions = questionsOf(file);
    file.questions = [...questions].reverse();

    const asked = visibleQuestions(parseFlowDefinition(file), {}).map((q) => q.id);
    expect(asked[0]).toBe(questions[questions.length - 1].id);
  });

  it("sends an answer to the engine input the file names, not a wired one", () => {
    const file = shippedFile();
    const question = questionsOf(file).find((one) => one.id === "gross_square_feet");
    if (!question) throw new Error("The shipped file no longer asks for gross square feet.");
    question.id = "building_area";

    const { answers } = readFlowAnswers(parseFlowDefinition(file), {
      project_type: "multifamily",
      construction_kind: "new",
      building_area: "42000",
      stories_above_grade: "4",
      unit_count: "120",
      parking_type: "surface",
      demolition: "no",
      levels_below_grade: "no",
      existing_building_tie_in: "no",
      site_conditions: "no",
      amenity_scope: "no",
      elevator: "no",
      retail_storefronts: "no",
      balconies: "no",
      radio_amplifier: "no",
    });

    expect(answers.grossSquareFeet).toBe(42000);
  });
});

const COMPLETE = {
  project_type: "multifamily",
  construction_kind: "new",
  gross_square_feet: "42000",
  stories_above_grade: "4",
  unit_count: "120",
  parking_type: "surface",
  demolition: "no",
  levels_below_grade: "no",
  existing_building_tie_in: "no",
  site_conditions: "no",
  amenity_scope: "no",
  elevator: "no",
  retail_storefronts: "no",
  balconies: "no",
  radio_amplifier: "no",
};

describe("branch gates", () => {
  it("asks a follow-up only once its gate is answered yes", () => {
    const definition = tier1Flow();
    const closed = visibleQuestions(definition, { demolition: "no" }).map((q) => q.id);
    const unanswered = visibleQuestions(definition, {}).map((q) => q.id);
    const open = visibleQuestions(definition, { demolition: "yes" }).map((q) => q.id);

    expect(unanswered).not.toContain("demolition_structure_count");
    expect(closed).not.toContain("demolition_structure_count");
    expect(open).toContain("demolition_structure_count");
  });

  it("records a don't know as a TBD section rather than as a zero", () => {
    const { recorded } = readFlowAnswers(tier1Flow(), {
      ...COMPLETE,
      site_conditions: "dont_know",
    });
    const flow = (recorded as { flow: { branchGates: Record<string, string>; tbdSections: string[]; tbdCount: number } }).flow;

    expect(flow.branchGates.site_conditions).toBe("dont_know");
    expect(flow.tbdSections).toEqual(["site_conditions"]);
    expect(flow.tbdCount).toBe(1);
  });

  it("records a no as a closed gate with no TBD against it", () => {
    const { recorded } = readFlowAnswers(tier1Flow(), COMPLETE);
    const flow = (recorded as { flow: { branchGates: Record<string, string>; tbdSections: string[] } }).flow;

    expect(flow.branchGates.demolition).toBe("no");
    expect(flow.tbdSections).toEqual([]);
  });

  it("refuses an answer that is not yes, no, or don't know", () => {
    expect(() => readFlowAnswers(tier1Flow(), { ...COMPLETE, demolition: "maybe" })).toThrow(
      FlowAnswersInvalid,
    );
  });

  // A gate inside a gate. Answering the outer one "no" has to close the whole
  // branch, or an answer left on the inner gate from an earlier pass keeps the
  // question under it alive and its answer reaches the engine.
  it("closes a whole nested branch when the gate above it closes", () => {
    const file = shippedFile();
    questionsOf(file).push(
      {
        id: "inner_gate",
        prompt: "Synthetic inner gate",
        kind: "branch_gate",
        required: true,
        opens: ["inner_follow_up"],
        mapsTo: { target: "branch_gate", section: "inner_gate" },
      },
      {
        id: "inner_follow_up",
        prompt: "Synthetic follow-up",
        kind: "number",
        required: true,
        mapsTo: { target: "intake_field", name: "innerFollowUp" },
      },
    );
    const outer = questionsOf(file).find((q) => q.id === "demolition")!;
    outer.opens = [...(outer.opens as string[]), "inner_gate"];

    const definition = parseFlowDefinition(file);
    const stale = { demolition: "no", inner_gate: "yes", inner_follow_up: "3" };

    const asked = visibleQuestions(definition, stale).map((q) => q.id);
    expect(asked).not.toContain("inner_gate");
    expect(asked).not.toContain("inner_follow_up");

    const { recorded } = readFlowAnswers(definition, { ...COMPLETE, ...stale });
    const flow = (recorded as { flow: { intakeFields: Record<string, unknown> } }).flow;
    expect(flow.intakeFields.innerFollowUp).toBeUndefined();
  });

  it("keeps a follow-up out of the record when its gate closed", () => {
    const { recorded } = readFlowAnswers(tier1Flow(), {
      ...COMPLETE,
      demolition_structure_count: "3",
    });
    const flow = (recorded as { flow: { intakeFields: Record<string, unknown> } }).flow;

    expect(flow.intakeFields.demolitionStructureCount).toBeUndefined();
  });
});

// LA-1155. A structure count of one or more opens the square-feet and
// structure-type follow-ups; a count of zero closes them, same as any other
// branch. A count answers a number question, not a "yes", so this exercises
// the parser's own number-answer opening condition, not the branch_gate path.
describe("the demolition structure-count follow-ups", () => {
  it("hides both follow-ups when the count is zero", () => {
    const asked = visibleQuestions(tier1Flow(), {
      demolition: "yes",
      demolition_structure_count: "0",
    }).map((q) => q.id);

    expect(asked).not.toContain("demolition_structure_square_feet");
    expect(asked).not.toContain("demolition_structure_type");
  });

  it("shows both follow-ups when the count is two or more", () => {
    const asked = visibleQuestions(tier1Flow(), {
      demolition: "yes",
      demolition_structure_count: "2",
    }).map((q) => q.id);

    expect(asked).toContain("demolition_structure_square_feet");
    expect(asked).toContain("demolition_structure_type");
  });

  it("accepts a count of zero as a complete answer, closing both follow-ups", () => {
    const { recorded } = readFlowAnswers(tier1Flow(), {
      ...COMPLETE,
      demolition: "yes",
      demolition_structure_count: "0",
    });
    const flow = (recorded as { flow: { intakeFields: Record<string, unknown> } }).flow;

    expect(flow.intakeFields.demolitionStructureCount).toBe(0);
    expect(flow.intakeFields.demolitionStructureSquareFeet).toBeUndefined();
    expect(flow.intakeFields.demolitionStructureType).toBeUndefined();
  });

  it("drops a stale square-feet and structure-type answer once the count falls back to zero", () => {
    const { recorded } = readFlowAnswers(tier1Flow(), {
      ...COMPLETE,
      demolition: "yes",
      // A prior pass answered these while the count was 2; the count then
      // dropped to zero without the surface clearing the stale answers.
      demolition_structure_count: "0",
      demolition_structure_square_feet: "18000",
      demolition_structure_type: "wood_frame_type_v",
    });
    const flow = (recorded as { flow: { intakeFields: Record<string, unknown> } }).flow;

    expect(flow.intakeFields.demolitionStructureSquareFeet).toBeUndefined();
    expect(flow.intakeFields.demolitionStructureType).toBeUndefined();
  });

  it("records the square feet and structure type intake fields when the count opens them", () => {
    const { recorded } = readFlowAnswers(tier1Flow(), {
      ...COMPLETE,
      demolition: "yes",
      demolition_structure_count: "2",
      demolition_structure_square_feet: "18000",
      demolition_structure_type: "wood_frame_type_v",
    });
    const flow = (recorded as { flow: { intakeFields: Record<string, unknown> } }).flow;

    expect(flow.intakeFields.demolitionStructureCount).toBe(2);
    expect(flow.intakeFields.demolitionStructureSquareFeet).toBe(18000);
    expect(flow.intakeFields.demolitionStructureType).toBe("wood_frame_type_v");
  });

  it("refuses a structure type the file never offered", () => {
    expect(() =>
      readFlowAnswers(tier1Flow(), {
        ...COMPLETE,
        demolition: "yes",
        demolition_structure_count: "1",
        demolition_structure_square_feet: "1000",
        demolition_structure_type: "spaceship",
      }),
    ).toThrow(FlowAnswersInvalid);
  });
});

describe("a number question opening a follow-up on its own answer", () => {
  it("refuses an opensWhen type this code does not know", () => {
    const file = shippedFile();
    const gate = questionsOf(file).find((one) => one.id === "demolition_structure_count");
    if (!gate) throw new Error("The shipped file no longer asks the structure count.");
    gate.opensWhen = { type: "number_above_zero" };
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  it("refuses an unknown key on the opensWhen condition, which is where a rate would arrive", () => {
    const file = shippedFile();
    const gate = questionsOf(file).find((one) => one.id === "demolition_structure_count");
    if (!gate) throw new Error("The shipped file no longer asks the structure count.");
    gate.opensWhen = { type: "number_at_least_one", ratePerUnit: 25 };
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  it("refuses opensWhen on a branch gate, which opens on yes already", () => {
    const file = shippedFile();
    const gate = questionsOf(file).find((one) => one.id === "demolition");
    if (!gate) throw new Error("The shipped file no longer gates demolition.");
    gate.opensWhen = { type: "number_at_least_one" };
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  it("refuses a number question that opens follow-ups with no opensWhen condition", () => {
    const file = shippedFile();
    const gate = questionsOf(file).find((one) => one.id === "demolition_structure_count");
    if (!gate) throw new Error("The shipped file no longer asks the structure count.");
    delete gate.opensWhen;
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });
});

describe("answers the engine cannot use", () => {
  it("refuses a missing required answer", () => {
    const without: Record<string, string> = { ...COMPLETE };
    delete without.gross_square_feet;
    expect(() => readFlowAnswers(tier1Flow(), without)).toThrow(FlowAnswersInvalid);
  });

  it("refuses a gross square feet of zero", () => {
    expect(() =>
      readFlowAnswers(tier1Flow(), { ...COMPLETE, gross_square_feet: "0" }),
    ).toThrow(FlowAnswersInvalid);
  });

  it("refuses a choice the file never offered", () => {
    expect(() =>
      readFlowAnswers(tier1Flow(), { ...COMPLETE, project_type: "hospital" }),
    ).toThrow(FlowAnswersInvalid);
  });
});

// LA-1199. Matt confirmed on 2026-09-27 that Stories Above Grade and Unit
// Count are required for a multifamily project and not for any other. Both
// stay visible on the Facts step either way (config/rom/tier1-flow.json's
// requiredWhen); only whether an answer is mandatory changes.
describe("requiredWhen: a question required only for a project type", () => {
  it("refuses a multifamily project with no stories above grade", () => {
    const without = { ...COMPLETE };
    delete (without as Record<string, string>).stories_above_grade;
    expect(() => readFlowAnswers(tier1Flow(), without)).toThrow(FlowAnswersInvalid);
  });

  it("refuses a multifamily project with no unit count", () => {
    const without = { ...COMPLETE };
    delete (without as Record<string, string>).unit_count;
    expect(() => readFlowAnswers(tier1Flow(), without)).toThrow(FlowAnswersInvalid);
  });

  it("accepts a self storage project with neither answered", () => {
    const without: Record<string, string> = { ...COMPLETE, project_type: "self_storage" };
    delete without.stories_above_grade;
    delete without.unit_count;
    const { answers } = readFlowAnswers(tier1Flow(), without);
    expect(answers.projectType).toBe("self_storage");
  });

  it("still asks the question (visible) for a project type where it is not required", () => {
    const asked = visibleQuestions(tier1Flow(), { project_type: "self_storage" }).map((q) => q.id);
    expect(asked).toContain("stories_above_grade");
    expect(asked).toContain("unit_count");
  });

  it("refuses requiredWhen alongside required: true, and a requiredWhen questionId that is not there", () => {
    const redundant = shippedFile();
    const question = questionsOf(redundant).find((one) => one.id === "gross_square_feet")!;
    question.requiredWhen = { questionId: "project_type", equals: ["multifamily"] };
    expect(() => parseFlowDefinition(redundant)).toThrow(FlowDefinitionInvalid);

    const dangling = shippedFile();
    const stories = questionsOf(dangling).find((one) => one.id === "stories_above_grade")!;
    stories.requiredWhen = { questionId: "nothing_of_the_sort", equals: ["multifamily"] };
    expect(() => parseFlowDefinition(dangling)).toThrow(FlowDefinitionInvalid);
  });
});

// LA-1199. ZIP is the file's first "text" kind question: free text, validated
// against an optional pattern rather than coerced to a number.
describe("a text question (ZIP)", () => {
  it("accepts a three-digit answer and leaves it out of the record when blank", () => {
    const withZip = readFlowAnswers(tier1Flow(), { ...COMPLETE, zip: "10956" });
    expect((withZip.recorded as { flow: { intakeFields: Record<string, unknown> } }).flow.intakeFields.zip).toBe(
      "10956",
    );

    const withoutZip = readFlowAnswers(tier1Flow(), COMPLETE);
    expect(
      (withoutZip.recorded as { flow: { intakeFields: Record<string, unknown> } }).flow.intakeFields.zip,
    ).toBeUndefined();
  });

  it("refuses an answer that is not five digits", () => {
    expect(() => readFlowAnswers(tier1Flow(), { ...COMPLETE, zip: "abc" })).toThrow(FlowAnswersInvalid);
    expect(() => readFlowAnswers(tier1Flow(), { ...COMPLETE, zip: "109" })).toThrow(FlowAnswersInvalid);
  });

  it("refuses a pattern on a question that is not text-kind, and an invalid regular expression", () => {
    const wrongKind = shippedFile();
    const grossArea = questionsOf(wrongKind).find((one) => one.id === "gross_square_feet")!;
    grossArea.pattern = "^[0-9]{3}$";
    expect(() => parseFlowDefinition(wrongKind)).toThrow(FlowDefinitionInvalid);

    const badPattern = shippedFile();
    const zip = questionsOf(badPattern).find((one) => one.id === "zip")!;
    zip.pattern = "([";
    expect(() => parseFlowDefinition(badPattern)).toThrow(FlowDefinitionInvalid);
  });
});

describe("a definition this code will not run", () => {
  it("refuses an unknown key on a question, which is where a rate would arrive", () => {
    const file = shippedFile();
    questionsOf(file)[0].costPerUnit = 250;
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  it("refuses a file that feeds no gross square feet to the engine", () => {
    const file = shippedFile();
    file.questions = questionsOf(file).filter((one) => one.id !== "gross_square_feet");
    expect(() => parseFlowDefinition(file)).toThrow(/grossSquareFeet/);
  });

  it("refuses an engine question hidden behind a gate", () => {
    const file = shippedFile();
    const gate = questionsOf(file).find((one) => one.id === "demolition");
    if (!gate) throw new Error("The shipped file no longer gates demolition.");
    gate.opens = ["gross_square_feet"];
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  it("refuses a choice the engine would reject", () => {
    const file = shippedFile();
    const question = questionsOf(file).find((one) => one.id === "project_type");
    if (!question) throw new Error("The shipped file no longer asks for a project type.");
    (question.choices as { value: string; label: string }[]).push({
      value: "hospital",
      label: "Hospital",
    });
    expect(() => parseFlowDefinition(file)).toThrow(/hospital/);
  });

  it("refuses two questions with the same id", () => {
    const file = shippedFile();
    questionsOf(file).push({ ...questionsOf(file)[0] });
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  it("refuses a gate that opens a question that is not there", () => {
    const file = shippedFile();
    const gate = questionsOf(file).find((one) => one.id === "demolition");
    if (!gate) throw new Error("The shipped file no longer gates demolition.");
    gate.opens = ["nothing_of_the_sort"];
    expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
  });

  // Both become facts under their own names, so sharing one name would leave a
  // gate answer sitting where an intake field's value should be, and a judgment
  // rule reading the wrong one.
  it("refuses an intake field named after a branch gate section", () => {
    const file = shippedFile();
    questionsOf(file).push({
      id: "synthetic_clash",
      prompt: "Synthetic clashing field",
      kind: "number",
      required: false,
      mapsTo: { target: "intake_field", name: "demolition" },
    });
    expect(() => parseFlowDefinition(file)).toThrow(/demolition/);
  });
});

describe("question levels (LA-2218)", () => {
  const ids = (level: 1 | 2 | 3, responses: Record<string, string> = {}) =>
    questionsAtLevel(tier1Flow(), responses, level).map((q) => q.id);

  it("shows soil only from Level 2 and balconies only at Level 3", () => {
    expect(ids(1)).toContain("parking_type");
    expect(ids(1)).not.toContain("site_conditions");
    expect(ids(1)).not.toContain("balconies");
    expect(ids(2)).toContain("site_conditions");
    expect(ids(2)).not.toContain("balconies");
    expect(ids(3)).toContain("site_conditions");
    expect(ids(3)).toContain("balconies");
  });

  it("keeps every other question at Level 1, so lower levels never lose a question", () => {
    const all = visibleQuestions(tier1Flow(), {}).map((q) => q.id);
    expect(ids(3)).toEqual(all);
    expect(ids(1)).toEqual(all.filter((id) => id !== "site_conditions" && id !== "balconies"));
  });

  it("combines the level with the gate rules", () => {
    expect(ids(1, { demolition: "yes" })).toContain("demolition_structure_count");
    expect(ids(1)).not.toContain("demolition_structure_count");
  });

  it("leaves answers alone when the level changes", () => {
    const responses = { site_conditions: "yes", balconies: "no" };
    const before = { ...responses };
    ids(1, responses);
    ids(3, responses);
    expect(responses).toEqual(before);
    // The run still reads a hidden answer, so moving down never drops one.
    expect(visibleQuestions(tier1Flow(), responses).map((q) => q.id)).toContain("site_conditions");
  });

  it("counts what each locked level adds", () => {
    expect(lockedLevels(tier1Flow(), {}, 1)).toEqual([
      { level: 2, added: 1 },
      { level: 3, added: 1 },
    ]);
    expect(lockedLevels(tier1Flow(), {}, 2)).toEqual([{ level: 3, added: 1 }]);
    expect(lockedLevels(tier1Flow(), {}, 3)).toEqual([]);
  });

  it("counts a locked follow-up only once its gate is open", () => {
    const file = shippedFile();
    questionsOf(file).push({
      id: "soil_depth",
      prompt: "How deep is the poor soil?",
      kind: "number",
      required: false,
      level: 3,
      mapsTo: { target: "intake_field", name: "soilDepth" },
    });
    const soil = questionsOf(file).find((one) => one.id === "site_conditions");
    if (!soil) throw new Error("The shipped file no longer asks about soil.");
    soil.opens = ["soil_depth"];
    const definition = parseFlowDefinition(file);
    expect(lockedLevels(definition, { site_conditions: "no" }, 1).find((l) => l.level === 3)?.added).toBe(1);
    expect(lockedLevels(definition, { site_conditions: "yes" }, 1).find((l) => l.level === 3)?.added).toBe(2);
  });

  it("refuses a level that is not 1, 2 or 3", () => {
    for (const bad of [0, 4, "2", 1.5]) {
      const file = shippedFile();
      questionsOf(file)[0].level = bad;
      expect(() => parseFlowDefinition(file)).toThrow(FlowDefinitionInvalid);
    }
  });

  it("refuses a follow-up that appears at a lower level than its gate", () => {
    const file = shippedFile();
    const count = questionsOf(file).find((one) => one.id === "demolition_structure_count");
    if (!count) throw new Error("The shipped file no longer asks the structure count.");
    count.level = 1;
    const gate = questionsOf(file).find((one) => one.id === "demolition");
    if (!gate) throw new Error("The shipped file no longer gates demolition.");
    gate.level = 2;
    expect(() => parseFlowDefinition(file)).toThrow(/level/i);
  });
});
