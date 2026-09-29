import type { Rom } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { heldCards, holdBack, holdsCostCode } from "./design-holds";

// LA-1324: a box a Design and Engineering card decides shows no figure until
// that card's moment has played, and stays out of the total until then.

const harbor = {
  project_type: "multifamily",
  construction_kind: "new",
  gross_square_feet: "118000",
  stories_above_grade: "6",
  unit_count: "107",
  building_count: "1",
};

describe("heldCards", () => {
  it("holds every card a multifamily job will play until it lands", () => {
    expect(heldCards(harbor, new Set())).toEqual(["S-1", "M-1", "E-1"]);
    expect(heldCards({ ...harbor, elevator: "yes", elevator_count: "2" }, new Set())).toEqual(["V-1", "S-1", "M-1", "E-1"]);
  });

  it("lets a card go once its moment lands", () => {
    expect(heldCards({ ...harbor, elevator: "yes", elevator_count: "2" }, new Set(["V-1", "M-1"]))).toEqual(["S-1", "E-1"]);
  });

  it("holds nothing on a job no card is coming for", () => {
    expect(heldCards({ ...harbor, project_type: "self_storage" }, new Set())).toEqual([]);
    // Two units a building is under NEC 220.84's three, so E-1 never comes.
    expect(heldCards({ ...harbor, unit_count: "4", building_count: "2" }, new Set())).toEqual(["S-1", "M-1"]);
    // An elevator with no count yet is off the field anyway, and V-1 cannot run.
    expect(heldCards({ ...harbor, elevator: "yes" }, new Set())).toEqual(["S-1", "M-1", "E-1"]);
  });
});

describe("holdsCostCode", () => {
  it("names the boxes each card decides", () => {
    const held = holdsCostCode(["V-1", "S-1", "M-1", "E-1"]);
    for (const code of ["26", "26a", "26g", "26i", "2", "34a", "30", "31"]) expect(held(code)).toBe(true);
    for (const code of ["3", "8", "34", "260", "27", "31a"]) expect(held(code)).toBe(false);
    expect(holdsCostCode(["M-1"])("31")).toBe(false);
  });
});

describe("holdBack", () => {
  const line = (costCode: string, low: number, high: number, contractSide: "kulka" | "owner" = "kulka") =>
    ({ costCode, low, high, breakoutOf: null, contractSide }) as unknown as Rom["lines"][number];
  const rom = {
    lines: [line("30", 100, 200), line("5", 10, 20), line("40", 1, 2, "owner")],
    total: { low: 111, high: 222 },
    kulkaContractTotal: { low: 110, high: 220 },
    markups: undefined,
  } as unknown as Rom;

  it("takes held lines out of both totals", () => {
    const held = holdBack(rom, (code) => code === "30");
    expect(held.total).toEqual({ low: 11, high: 22 });
    expect(held.kulkaContractTotal).toEqual({ low: 10, high: 20 });
    expect(held.lines).toBe(rom.lines);
  });

  it("leaves a carved-out line alone, since it adds nothing", () => {
    const carved = { ...rom, lines: [{ ...line("30", 100, 200), breakoutOf: "5" }, line("5", 10, 20)] } as unknown as Rom;
    expect(holdBack(carved, (code) => code === "30").total).toEqual({ low: 111, high: 222 });
  });

  it("returns the ROM as it is when nothing is held", () => {
    expect(holdBack(rom, () => false)).toBe(rom);
  });
});
