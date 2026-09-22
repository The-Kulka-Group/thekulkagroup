import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  FLOW_FILE,
  FlowAnswersInvalid,
  FlowDefinitionInvalid,
  parseFlowDefinition,
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
      else if (value && typeof value === "object") Object.values(value).forEach(walk);
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
      parking_type: "surface",
      demolition: "no",
      levels_below_grade: "no",
      existing_building_tie_in: "no",
      site_conditions: "no",
      amenity_scope: "no",
    });

    expect(answers.grossSquareFeet).toBe(42000);
  });
});

const COMPLETE = {
  project_type: "multifamily",
  construction_kind: "new",
  gross_square_feet: "42000",
  parking_type: "surface",
  demolition: "no",
  levels_below_grade: "no",
  existing_building_tie_in: "no",
  site_conditions: "no",
  amenity_scope: "no",
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
