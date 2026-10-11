import { describe, expect, it } from "vitest";

import type { Question } from "./question-flow";
import { answerMoment, CARD_ORDER, cardForPart, cardMoment, decisionsFor, setupMoment } from "./stage-scenes";
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
      parts: ["podium", "podiumDeck", "garageCoating", "garageWaterproofing", "garageElectrical", "garageSprinklers", "garageDrySprinklers"],
    });
    // LA-2216: surface parking lays the striped lot beside the building.
    expect(answerMoment(parking, "surface")?.parts).toEqual(["surfaceLot"]);
  });

  it("builds what a Yes adds to the building, and nothing for a No", () => {
    const below = gate("levels_below_grade", "Does the new building go below grade?");
    expect(answerMoment(below, "yes")).toMatchObject({ tag: "Below Grade", answer: "Yes", parts: ["basement"] });
    expect(answerMoment(below, "no")).toMatchObject({ answer: "No", parts: [] });
    // LA-2219: a balcony draws as full, with its rail and door, until Full or Juliet says otherwise.
    expect(answerMoment(gate("balconies", "Do the units have balconies?"), "yes")?.parts).toEqual(["balconies", "balconyRail", "balconyDoors"]);
  });

  it("draws the slabs, rails and doors for full balconies, and the Juliet rail and doors for Juliet (LA-2219, LA-2220)", () => {
    const type: Question = {
      id: "balcony_type",
      prompt: "What kind of balconies do the units have?",
      kind: "choice",
      required: true,
      level: 3,
      choices: [
        { value: "full", label: "Full" },
        { value: "juliet", label: "Juliet" },
      ],
      mapsTo: { target: "intake_field", name: "balconyType" },
    };
    expect(answerMoment(type, "full")).toMatchObject({ tag: "Balcony Type", answer: "Full", parts: ["balconies", "balconyRail", "balconyDoors"] });
    // LA-2220: a Juliet balcony draws its rail across the door, with no slab.
    expect(answerMoment(type, "juliet")?.parts).toEqual(["julietRail", "balconyDoors"]);
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
        balcony_type: "full",
        balcony_count: "25",
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
      poorSoil: false,
      balconyType: "full",
      balconyCount: 25,
    });
  });

  it("draws no elevator until the job has one", () => {
    expect(stageFactsFromResponses({ elevator: "no", elevator_count: "2" }).elevatorCount).toBe(0);
    expect(stageFactsFromResponses({ gross_square_feet: "abc" }).grossSquareFeet).toBeNull();
  });
});

describe("A-2 and cardForPart (LA-1325)", () => {
  it("plays Building Form after Construction Type and builds the massing", () => {
    expect(CARD_ORDER.indexOf("A-2")).toBe(CARD_ORDER.indexOf("A-1") + 1);
    expect(cardMoment("A-2", "L-Shape")).toMatchObject({ source: "A-2", tag: "A-2", title: "Building Form", parts: ["massing"] });
  });

  it("opens the card that decided the part clicked", () => {
    const all = new Set(["A-1", "A-2", "S-1", "V-1", "V-2", "V-3", "M-0", "M-1", "E-1"]);
    expect(cardForPart("foundation", all)).toBe("S-1");
    expect(cardForPart("basement", all)).toBe("S-1");
    expect(cardForPart("podium", all)).toBe("A-1");
    expect(cardForPart("massing", all)).toBe("A-2");
    expect(cardForPart("glass", all)).toBe("M-0");
    expect(cardForPart("elevators", all)).toBe("V-1");
    expect(cardForPart("units", all)).toBe("M-1");
    expect(cardForPart("service", all)).toBe("E-1");
    expect(cardForPart("balconies", all)).toBeNull();
  });

  it("falls back to the next card that shaped the part, or none", () => {
    expect(cardForPart("massing", new Set(["A-1"]))).toBe("A-1");
    expect(cardForPart("elevators", new Set(["V-3"]))).toBe("V-3");
    expect(cardForPart("service", new Set(["A-1"]))).toBeNull();
  });
});

describe("decisionsFor (LA-1325)", () => {
  it("lists each card once, bottom up, with every part it decided", () => {
    const codes = new Set(["A-1", "A-2", "S-1", "V-1", "V-2", "M-0", "M-1", "E-1"]);
    expect(decisionsFor(["foundation", "basement", "podium", "massing", "glass", "balconies", "elevators", "units", "service"], codes)).toEqual([
      { code: "S-1", title: "Foundation System", parts: ["foundation", "basement"] },
      { code: "A-1", title: "Construction Type", parts: ["podium"] },
      { code: "A-2", title: "Building Form", parts: ["massing"] },
      { code: "M-0", title: "Window Area", parts: ["glass"] },
      { code: "V-1", title: "Elevator Type", parts: ["elevators"] },
      { code: "M-1", title: "HVAC Tonnage", parts: ["units"] },
      { code: "E-1", title: "Electrical Service", parts: ["service"] },
    ]);
  });

  it("leaves out a part the building does not have, and a card it does not have", () => {
    expect(decisionsFor(["foundation", "massing", "glass"], new Set(["A-1", "S-1"]))).toEqual([
      { code: "S-1", title: "Foundation System", parts: ["foundation"] },
      { code: "A-1", title: "Construction Type", parts: ["massing"] },
    ]);
  });
});
