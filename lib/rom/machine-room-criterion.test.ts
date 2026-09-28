import { describe, expect, it } from "vitest";

import {
  deriveMachineRooms,
  inNewYorkCity,
  machineRoomsCount,
  machineRoomsText,
  type MachineRoomFacts,
} from "./machine-room-criterion";

// LA-1269. V-3's rule, from docs/precon/research/la-elevator-machine-rooms.md, Section 6.

function facts(over: Partial<MachineRoomFacts> = {}): MachineRoomFacts {
  return {
    elevatorType: "hydraulic",
    typeSettled: true,
    elevatorCount: 1,
    buildingCount: 1,
    jackType: "in_ground",
    zip: "11743",
    ...over,
  };
}

const answer = (f: MachineRoomFacts) => {
  const derived = deriveMachineRooms(f);
  return { value: derived.value.kind === "spec" ? derived.value.text : "", confidence: derived.confidence };
};

describe("deriveMachineRooms", () => {
  it("gives a hydraulic car its own machine room, high when nothing could split or remove it", () => {
    expect(answer(facts())).toEqual({ value: "1 Machine Room", confidence: "high" });
  });

  it("puts two hydraulic cars in one building in one shared room, low since separate cores would double it", () => {
    expect(answer(facts({ elevatorCount: 2 }))).toEqual({ value: "1 Machine Room", confidence: "low" });
  });

  it("gives each building its own room", () => {
    expect(answer(facts({ elevatorCount: 2, buildingCount: 2 }))).toEqual({ value: "2 Machine Rooms", confidence: "high" });
    expect(answer(facts({ elevatorCount: 1, buildingCount: 3 })).value).toBe("1 Machine Room");
  });

  it("drops to low when a holeless jack outside NYC could go roomless, or V-1 could flip", () => {
    expect(answer(facts({ jackType: "holeless" })).confidence).toBe("low");
    expect(answer(facts({ jackType: "holeless", zip: "11201" })).confidence).toBe("high");
    expect(answer(facts({ typeSettled: false })).confidence).toBe("low");
  });

  it("gives machine-room-less traction no room, always low", () => {
    expect(answer(facts({ elevatorType: "traction", jackType: null, elevatorCount: 2 }))).toEqual({
      value: "None",
      confidence: "low",
    });
  });

  it("states the counts the card's diagram draws, and feeds item 26g", () => {
    const derived = deriveMachineRooms(facts({ elevatorCount: 3, buildingCount: 2 }));
    expect(derived.steps.find((step) => step.label === "Elevators")?.result).toBe("3");
    expect(derived.steps.find((step) => step.label === "Machine Rooms")?.result).toMatch(/^2/);
    expect(derived.costCodes).toEqual(["26g"]);
  });
});

describe("helpers", () => {
  it("words and reads a count", () => {
    expect(machineRoomsText(0)).toBe("None");
    expect(machineRoomsText(1)).toBe("1 Machine Room");
    expect(machineRoomsText(2)).toBe("2 Machine Rooms");
    expect(machineRoomsCount("None")).toBe(0);
    expect(machineRoomsCount("2 Machine Rooms")).toBe(2);
  });

  it("tells NYC ZIPs from Nassau ones sharing the 110 prefix", () => {
    expect(inNewYorkCity("11201")).toBe(true);
    expect(inNewYorkCity("11004")).toBe(true);
    expect(inNewYorkCity("11030")).toBe(false);
    expect(inNewYorkCity("11743")).toBe(false);
  });
});
