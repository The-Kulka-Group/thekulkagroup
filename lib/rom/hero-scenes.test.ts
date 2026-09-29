import { HYDRAULIC_MAX_FEET, TRACTION_MIN_FEET } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { SERVICE_RATINGS } from "./engineering-tables";
import { heroScene, JACK_BANDS } from "./hero-scenes";
import { HOLELESS_DEEP_PIT_FEET, HOLELESS_STANDARD_PIT_FEET, IN_GROUND_MAX_FEET } from "./jack-criterion";

// LA-1324: each Design and Engineering card plays on the hero stage as the
// picture of its own arithmetic. These are Harbor View's cards as the derive
// route returns them.

type Step = { label: string; result: string };
const card = (code: string, value: { kind: "spec"; text: string } | { kind: "quantity"; amount: number; unit: string }, steps: [string, string][]) => ({
  code,
  value,
  steps: steps.map(([label, result]): Step => ({ label, result })),
  correction: null,
});
const spec = (text: string) => ({ kind: "spec" as const, text });

describe("heroScene", () => {
  it("V-1 is the travel scale against the hydraulic and traction bands", () => {
    const scene = heroScene(
      card("V-1", spec("Hydraulic"), [
        ["Stories Above Grade", "6"],
        ["Travel", `50'-0" (50.0 ft)`],
        ["Band", "Over 35 ft, up to 55 ft -> Hydraulic"],
      ]),
    );
    expect(scene).toEqual({
      kind: "travel",
      travelFeet: 50,
      bands: [
        { to: HYDRAULIC_MAX_FEET, label: "Hydraulic" },
        { to: TRACTION_MIN_FEET, label: "Either" },
        { to: null, label: "Traction" },
      ],
      answer: "Hydraulic",
    });
  });

  it("V-2 is the same scale against the jack's reach", () => {
    const scene = heroScene(card("V-2", spec("In-Ground"), [["Travel", `50'-0" (50.0 ft)`]]));
    expect(scene).toMatchObject({ kind: "travel", travelFeet: 50, answer: "In-Ground" });
    expect(JACK_BANDS.map((b) => b.to)).toEqual([HOLELESS_STANDARD_PIT_FEET, HOLELESS_DEEP_PIT_FEET, IN_GROUND_MAX_FEET, null]);
  });

  it("V-3 counts cars and the rooms they share", () => {
    const scene = heroScene(
      card("V-3", spec("1 Machine Room"), [
        ["Elevators", "2"],
        ["Buildings", "1"],
        ["Machine Rooms", "1 (one per building, cars in one bank)"],
      ]),
    );
    expect(scene).toEqual({ kind: "rooms", cars: 2, buildings: 1, rooms: 1 });
  });

  it("S-1 draws the system under the building, with its coverage", () => {
    const scene = heroScene(
      card("S-1", spec("Deep Foundations"), [
        ["Coverage", "32% of the footprint at 2,000 psf"],
        ["Ground", "Poor soil or groundwater"],
        ["Lowest Floor Slab", "Structural Slab"],
      ]),
    );
    expect(scene).toEqual({ kind: "foundation", system: "Deep Foundations", coverage: 32, poorGround: true, slab: "Structural Slab" });
  });

  it("M-0 is the window share of the wall", () => {
    const scene = heroScene(card("M-0", spec("Standard Glazing Band"), [["Window to Wall", "19.9% (DOE mid-rise apartment)"]]));
    expect(scene).toEqual({ kind: "facade", percent: 19.9, elevated: false });
  });

  it("M-1 is the climate zone and what a ton cools there", () => {
    const scene = heroScene(
      card("M-1", { kind: "quantity", amount: 168, unit: "Tons" }, [
        ["Climate Zone", "Zone 5, Rockland or Orange County"],
        ["GSF per Ton", "701"],
      ]),
    );
    expect(scene).toEqual({ kind: "climate", zone: 5, place: "Rockland or Orange County", gsfPerTon: 701, tons: 168 });
  });

  it("E-1 is the amp ladder, the load and the rating above it", () => {
    const scene = heroScene(
      card("E-1", { kind: "quantity", amount: 2500, unit: "A Service" }, [["Service Load", "2,251 A at 208Y/120 V"]]),
    );
    expect(scene).toEqual({ kind: "amps", loadAmps: 2251, rating: 2500, ratings: [...SERVICE_RATINGS] });
  });

  it("A-1 is the height against the type's limit; A-2 is the plan", () => {
    expect(heroScene(card("A-1", spec("Type IIIA over Type IA Podium"), [["Height", "62 ft against 85 ft"]]))).toEqual({
      kind: "height",
      heightFeet: 62,
      limitFeet: 85,
      answer: "Type IIIA over Type IA Podium",
    });
    expect(heroScene(card("A-2", spec("L-Shape"), []))).toEqual({ kind: "plan", answer: "L-Shape" });
  });

  it("draws the estimator's correction, not the card's own answer", () => {
    const corrected = {
      ...card("E-1", { kind: "quantity" as const, amount: 2500, unit: "A Service" }, [["Service Load", "2,251 A at 208Y/120 V"]]),
      correction: { value: { kind: "quantity" as const, amount: 3000, unit: "A Service" } },
    };
    expect(heroScene(corrected)).toMatchObject({ rating: 3000 });
    const s1 = { ...card("S-1", spec("Deep Foundations"), []), correction: { value: spec("Mat Foundation") } };
    expect(heroScene(s1)).toMatchObject({ system: "Mat Foundation", coverage: null });
  });

  it("has no scene for a card it does not know, or one missing its numbers", () => {
    expect(heroScene(card("P-1", spec("Whatever"), []))).toBeNull();
    expect(heroScene(card("V-1", spec("Hydraulic"), []))).toBeNull();
  });
});
