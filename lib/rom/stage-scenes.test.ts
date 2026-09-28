import { describe, expect, it } from "vitest";

import type { Question } from "./question-flow";
import { answerMoment, cardMoment, setupMoment } from "./stage-scenes";
import { stageFactsFromResponses } from "./stage-model";

// LA-1318: what each New Budget answer and Design and Engineering card plays
// on the stage, and the facts the stage draws from before anything is saved.

const gate = (id: string, prompt: string): Question => ({ id, prompt, kind: "branch_gate" }) as Question;
const parking: Question = {
  id: "parking_type",
  prompt: "What kind of parking does the project have?",
  kind: "choice",
  choices: [
    { value: "structured", label: "Structured" },
    { value: "surface", label: "Surface" },
  ],
} as Question;

describe("answerMoment", () => {
  it("builds the podium for structured parking and names the choice", () => {
    expect(answerMoment(parking, "structured")).toEqual({
      source: "parking_type",
      tag: "Parking",
      title: "Parking",
      answer: "Structured",
      parts: ["podium"],
    });
    // Surface parking puts nothing on the model, so it plays as a caption only.
    expect(answerMoment(parking, "surface")?.parts).toEqual([]);
  });

  it("builds what a Yes adds to the building, and nothing for a No", () => {
    const below = gate("levels_below_grade", "Does the new building go below grade?");
    expect(answerMoment(below, "yes")).toMatchObject({ tag: "Below Grade", answer: "Yes", parts: ["basement"] });
    expect(answerMoment(below, "no")).toMatchObject({ answer: "No", parts: [] });
    expect(answerMoment(gate("balconies", "Do the units have balconies?"), "yes")?.parts).toEqual(["balconies"]);
  });

  it("formats a number and plays nothing for a skipped one", () => {
    const count = { id: "elevator_count", prompt: "Elevator Count", kind: "number" } as Question;
    expect(answerMoment(count, "2")).toMatchObject({ tag: "Elevators", answer: "2", parts: [] });
    const area = { id: "demolition_structure_square_feet", prompt: "How many square feet?", kind: "number" } as Question;
    expect(answerMoment(area, "8000")?.answer).toBe("8,000");
    expect(answerMoment(area, " ")).toBeNull();
  });
});

describe("cardMoment and setupMoment", () => {
  it("names a card by its code and builds its part", () => {
    expect(cardMoment("S-1", "Deep Foundations")).toEqual({
      source: "S-1",
      tag: "S-1",
      title: "Foundation System",
      answer: "Deep Foundations",
      parts: ["foundation"],
    });
    expect(cardMoment("M-1", "189 Tons").parts).toEqual(["units"]);
  });

  it("brings the glass with the building unless M-0 will decide it", () => {
    expect(setupMoment(6, 118000, true)).toMatchObject({ answer: "6 Stories, 118,000 SF", parts: ["massing"], tag: "" });
    expect(setupMoment(1, 9000, false)).toMatchObject({ answer: "1 Story, 9,000 SF", parts: ["massing", "glass"] });
  });
});

describe("stageFactsFromResponses", () => {
  it("reads the answers as they stand", () => {
    expect(
      stageFactsFromResponses({
        gross_square_feet: "118000",
        stories_above_grade: "6",
        unit_count: "107",
        building_count: "",
        parking_type: "structured",
        elevator: "yes",
        elevator_count: "2",
        levels_below_grade: "no",
        balconies: "yes",
      }),
    ).toEqual({
      grossSquareFeet: 118000,
      stories: 6,
      unitCount: 107,
      buildingCount: 1,
      parkingType: "structured",
      elevatorCount: 2,
      belowGrade: false,
      balconies: true,
      retail: false,
    });
  });

  it("draws no elevator until the job has one", () => {
    expect(stageFactsFromResponses({ elevator: "no", elevator_count: "2" }).elevatorCount).toBe(0);
    expect(stageFactsFromResponses({ gross_square_feet: "abc" }).grossSquareFeet).toBeNull();
  });
});
