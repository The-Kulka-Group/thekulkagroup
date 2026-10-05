import { describe, expect, it } from "vitest";

import { presentBudget } from "@/lib/rom/presentation";
import { referencePublication } from "@/test/fixtures/published-budget";

import { deriveElevatorType } from "./elevator-criterion";
import { deriveFoundation } from "./foundation-criterion";
import { deriveGlazing, deriveTonnage } from "./hvac-criterion";
import { deriveJackType } from "./jack-criterion";
import { deriveMachineRooms } from "./machine-room-criterion";

// LA-1662. The seven reasons and three steps and inputs Matt approved on
// 2026-10-05, word for word (~/scrollcraft/frames/kulka-de-layers/data/
// reasons-rewrite.json and steps-rewrite.json).
const APPROVED: Record<string, string> = {
  "A-1": "Wood framing with no podium, clear of the type's height and area limits.",
  "A-2": "There is no site plan yet, so the shape follows from the floor plate's length alone.",
  "E-1":
    "Amenity space isn't measured yet, so the budget prices the common area at club rates with no pool or sauna equipment. Elevator motors use 40 HP until the elevator vendor's numbers come in.",
  "M-0": "Nothing in the code or the project facts sets window area, so the budget uses the standard glazing band.",
  "M-1":
    "The tonnage comes from the Department of Energy's code-minimum prototype for Zone 5, not a load calculation for this building. The prototype fits a new building with no garage and the same ventilation.",
  "S-1": "There is no geotechnical report yet, so the budget assumes adequate ground conditions and no rock removal.",
  "V-1":
    "Hydraulic and traction elevators are both common between 35 and 55 ft of travel, and this building has approximately 40 ft. The budget assumes hydraulic, the less expensive option, until additional details are provided.",
  "V-2":
    "Both jack types work at approximately 40 ft. The budget prices the well hole and casing in case the ground is wet. Confidence is low because shallow rock is possible in this area.",
  "V-3":
    "The two hydraulic cars share one machine room at the lowest landing, conditioned to the maker's range as IBC 3005.2 requires. Separate elevator cores would need two rooms. A traction elevator would need no machine room.",
};

describe("criterion reasons in the approved words", () => {
  it("rewrites a run published before LA-1662 as the page reads it", () => {
    const reasons = Object.fromEntries(presentBudget(referencePublication()).criteria.map((k) => [k.code, k.confidenceReason]));
    expect(reasons).toEqual(APPROVED);
  });

  it("rewrites the steps and inputs Matt approved, as the page reads them", () => {
    const criteria = presentBudget(referencePublication()).criteria;
    const of = (code: string) => criteria.find((k) => k.code === code)!;
    expect(of("E-1").inputs.find((i) => i.name === "Elevator Motor")?.value).toBe("40 HP Per Car [Placeholder]");
    expect(of("S-1").steps.find((s) => s.label === "Ground")?.result).toBe("Adequate Ground, No Rock Removal [Assumed]");
    expect(of("V-1").steps.find((s) => s.label === "Band")?.result).toBe("Hydraulic [Either Works, Less Expensive]");
  });

  it("writes the same words on a new run from the reference's facts", async () => {
    const rockZip = "10965";
    const s1 = deriveFoundation({
      constructionKind: "new",
      storiesAboveGrade: 5,
      framingSystem: "wood",
      parkingType: "surface",
      levelsBelowGrade: "no",
      siteConditions: "dont_know",
      tieIn: "no",
      zip: rockZip,
    });
    const v1 = await deriveElevatorType(null, { storiesAboveGrade: 5, framingSystem: "wood", hasTallerGroundFloor: false });
    const v2 = deriveJackType({ storiesAboveGrade: 5, framingSystem: "wood", hasTallerGroundFloor: false, belowGrade: "no", siteConditions: "dont_know", zip: rockZip });
    const v3 = deriveMachineRooms({ elevatorType: "hydraulic", typeSettled: false, elevatorCount: 2, buildingCount: 1, jackType: "in_ground", zip: rockZip });
    const m0 = deriveGlazing({ balconies: "yes", storefronts: "no" });
    const m1 = deriveTonnage({ constructionKind: "new", grossSquareFeet: 64_000, unitCount: 70, zip: rockZip, parkingType: "surface", band: "standard", bandSet: false });

    expect(s1.confidenceReason).toBe(APPROVED["S-1"]);
    expect(s1.steps.find((s) => s.label === "Ground")?.result).toBe("Adequate Ground, No Rock Removal [Assumed]");
    expect(v1!.assumption.steps.find((s) => s.label === "Band")?.result).toBe("Hydraulic [Either Works, Less Expensive]");
    expect(v1!.assumption.confidenceReason).toBe(APPROVED["V-1"]);
    expect(v2!.confidenceReason).toBe(APPROVED["V-2"]);
    expect(v3.confidenceReason).toBe(APPROVED["V-3"]);
    expect(m0.confidenceReason).toBe(APPROVED["M-0"]);
    expect(m1.confidenceReason).toBe(APPROVED["M-1"]);
  });
});
