import { describe, expect, it } from "vitest";

import { choicesFor, factsFor, stepNumber, valueText } from "./engineering";

// LA-1281, LA-1282, LA-1318: the helpers that show a Design and Engineering
// criterion's answer, the answers it offers, and the facts it sets.

const E1 = {
  code: "E-1",
  steps: [{ label: "Service Load", result: "2,274 A at 208Y/120 V" }],
  value: { kind: "quantity" as const, amount: 2500, unit: "A Service" },
};

describe("valueText and factsFor", () => {
  it("formats a quantity with its unit", () => {
    expect(valueText(E1.value)).toBe("2,500 A Service");
    expect(valueText({ kind: "spec", text: "Hydraulic" })).toBe("Hydraulic");
  });

  it("sets the facts the live budget prices the elevator cards by", () => {
    expect(factsFor("V-1", "Traction")).toEqual({ elevatorType: "traction" });
    expect(factsFor("V-2", "In-Ground")).toEqual({ hydraulicJackType: "in_ground" });
    expect(factsFor("V-3", "2 Machine Rooms")).toEqual({ elevatorMachineRooms: "2", elevatorMachineRoomHvac: "yes" });
    expect(factsFor("V-3", "None")).toEqual({ elevatorMachineRooms: "0", elevatorMachineRoomHvac: "no" });
    expect(factsFor("S-1", "Deep Foundations")).toEqual({});
  });
});

describe("choicesFor", () => {
  it("offers E-1 the rating either side of the one it landed on", () => {
    expect(choicesFor(E1)).toEqual(["2,000 A Service", "2,500 A Service", "3,000 A Service"]);
    expect(choicesFor({ ...E1, value: { kind: "quantity", amount: 400, unit: "A Service" } })).toEqual([
      "400 A Service",
      "450 A Service",
    ]);
    // Past 4,000 A there is no standard rating to offer.
    expect(choicesFor({ ...E1, value: { kind: "quantity", amount: 4300, unit: "A Service" } })).toEqual([]);
  });

  it("offers A-1 its type and the others the code allows", () => {
    const steps = [{ label: "Also Allowed", result: "Type IIIB over Type IA Podium" }];
    expect(choicesFor({ code: "A-1", steps, value: { kind: "spec", text: "Type IIIA over Type IA Podium" } })).toEqual([
      "Type IIIA over Type IA Podium",
      "Type IIIB over Type IA Podium",
    ]);
    expect(choicesFor({ code: "A-1", steps: [{ label: "Also Allowed", result: "None" }], value: { kind: "spec", text: "Type VA" } })).toEqual([
      "Type VA",
    ]);
  });

  it("offers M-0 its two bands", () => {
    expect(choicesFor({ code: "M-0", steps: [], value: { kind: "spec", text: "Standard Glazing Band" } })).toEqual([
      "Standard Glazing Band",
      "Elevated Glazing Band",
    ]);
  });
});

describe("stepNumber", () => {
  it("reads a step's number with its commas", () => {
    expect(stepNumber(E1, "Service Load")).toBe(2274);
  });
});

describe("A-2 (LA-1325)", () => {
  it("offers the four shapes", () => {
    expect(choicesFor({ code: "A-2", steps: [], value: { kind: "spec", text: "L-Shape" } })).toEqual(["Bar", "L-Shape", "U-Shape", "Courtyard"]);
  });
});
