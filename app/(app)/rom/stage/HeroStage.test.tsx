import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { StoredDerivedAssumption } from "@/lib/rom/derived-assumptions";
import { stageBuilding } from "@/lib/rom/stage-model";
import type { StageEvent } from "@/lib/rom/stage-scenes";

import { HeroStage } from "./HeroStage";

// LA-1324: every card draws its picture on the hero stage, and marks its
// answer once its moment lands. Harbor View's cards, as the derive route
// returns them.

type Value = StoredDerivedAssumption["value"];
const card = (code: string, value: Value, steps: [string, string][]) =>
  ({ code, value, steps: steps.map(([label, result]) => ({ label, result })), correction: null }) as unknown as StoredDerivedAssumption;
const spec = (text: string): Value => ({ kind: "spec", text });

const HARBOR_VIEW: Record<string, StoredDerivedAssumption> = {
  "V-1": card("V-1", spec("Hydraulic"), [["Travel", `50'-0" (50.0 ft)`]]),
  "V-2": card("V-2", spec("In-Ground"), [["Travel", `50'-0" (50.0 ft)`]]),
  "V-3": card("V-3", spec("1 Machine Room"), [["Elevators", "2"], ["Buildings", "1"]]),
  "A-1": card("A-1", spec("Type IIIA over Type IA Podium"), [["Height", "62 ft against 85 ft"]]),
  "A-2": card("A-2", spec("L-Shape"), []),
  "S-1": card("S-1", spec("Deep Foundations"), [["Coverage", "32% of the footprint at 2,000 psf"], ["Ground", "Poor soil or groundwater"]]),
  "M-0": card("M-0", spec("Standard Glazing Band"), [["Window to Wall", "19.9% (DOE mid-rise apartment)"]]),
  "M-1": card("M-1", { kind: "quantity", amount: 168, unit: "Tons" }, [["Climate Zone", "Zone 5, Rockland or Orange County"], ["GSF per Ton", "701"]]),
  "E-1": card("E-1", { kind: "quantity", amount: 2500, unit: "A Service" }, [["Service Load", "2,251 A at 208Y/120 V"]]),
};

const building = stageBuilding(
  { grossSquareFeet: 118_000, stories: 6, unitCount: 107, buildingCount: 1, parkingType: "structured", elevatorCount: 2, belowGrade: false, balconies: true, retail: false },
  Object.values(HARBOR_VIEW),
);

const event = (code: string, title: string, answer: string): StageEvent => ({ id: 1, source: code, tag: code, title, answer, parts: [] });
const render = (code: string, answer: string, landed: boolean) =>
  renderToStaticMarkup(
    <HeroStage moment={{ event: event(code, "Title", answer), landed }} criteria={HARBOR_VIEW} building={building} rail={[]} />,
  );

describe("HeroStage", () => {
  it.each([
    ["V-1", "Travel of 50 ft, in the Either band"],
    ["V-2", "Travel of 50 ft, in the In-Ground band"],
    ["V-3", "2 cars and 1 machine room"],
    ["A-1", "Height of 62 ft, in the Within the Type band"],
    ["A-2", "L-Shape plan, 2 wings"],
    ["S-1", "Deep Foundations, 32% coverage, on poor ground"],
    ["M-0", "Windows are 19.9% of the wall"],
    ["M-1", "Climate zone 5, 701 square feet a ton"],
    ["E-1", "A 2,500 amp service for a 2,251 amp load"],
  ])("draws %s", (code, label) => {
    const html = render(code, "Answer", true);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('data-phase="land"');
    expect(html).toContain("Answer");
  });

  it("holds the answer back until the moment lands", () => {
    const html = render("E-1", "2,500 A Service", false);
    expect(html).toContain('data-phase="play"');
    expect(html).not.toContain("2,500 A Service");
  });

  it("names an answer with no picture, and waits for the first moment", () => {
    const answer = renderToStaticMarkup(
      <HeroStage
        moment={{ event: { id: 2, source: "parking_type", tag: "Parking", title: "Parking", answer: "Structured", parts: ["podium"] }, landed: true }}
        criteria={HARBOR_VIEW}
        building={building}
        rail={[]}
      />,
    );
    expect(answer).toContain("Structured");
    expect(answer).not.toContain("<svg");
    const idle = renderToStaticMarkup(<HeroStage moment={null} criteria={{}} building={null} rail={[{ code: "S-1", state: "designing" }]} />);
    expect(idle).toContain("Design and Engineering");
    expect(idle).toContain('data-state="designing"');
  });
});
