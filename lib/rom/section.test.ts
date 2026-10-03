import { describe, expect, it } from "vitest";

import { referencePublication } from "@/test/fixtures/published-budget";

import { presentBudget } from "./presentation";
import { DIAGRAM_LINE, LAYERS, drawSection, type SectionOptions } from "./section";

// LA-1459. The Section, drawn from the reference run's facts and criteria.

const page = () => presentBudget(referencePublication());

function options(over: Partial<SectionOptions> = {}): SectionOptions {
  const p = page();
  return {
    facts: p.drawing.facts,
    ink: new Map(Object.entries(p.drawing.ink)),
    criteria: p.drawing.criteria,
    notes: { ink: p.drawing.inkNote, noLayer: p.drawing.noLayer },
    idPrefix: "t",
    ...over,
  };
}

const layerKeys = (svg: string) => [...svg.matchAll(/<g data-layer="([^"]*)"/g)].map((m) => m[1]);

describe("drawSection", () => {
  it("draws from the fixture's facts: five stories, two hydraulic cars, balconies, surface parking, the structure that came down", () => {
    const svg = drawSection(options());

    expect(svg).toContain('data-stories="5"');
    expect(svg).toContain("5 Stories Above Grade");
    expect(svg).toContain("Level 5");
    expect(svg).toContain("Balconies, Screened");
    expect(svg).toContain("Surface Parking");
    expect(svg).toContain("Existing Structure, Removed");
    expect(svg).toContain("Elevator Bulkhead");
    expect(svg).toContain("MN Test #4");
    expect(svg).toContain("70 Units, 64,000 SF");
    // Two cars: one divider between the shafts.
    expect(layerKeys(svg)).toContain("element:elevator");
  });

  it("owns one layer per ledger row that has one, keyed by the row", () => {
    const p = page();
    const svg = drawSection(options());
    const keys = layerKeys(svg);
    const rowKeys = new Set(p.ledger.map((r) => r.key));

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(rowKeys.has(key), key).toBe(true);
    const owned = p.ledger.filter((r) => r.hasLayer).map((r) => r.key);
    expect(keys.sort()).toEqual(owned.sort());
    // Everything else on the sheet is a part, never a layer.
    const parts = [...svg.matchAll(/<g data-part="([^"]*)"/g)].map((m) => m[1]);
    expect(parts).toEqual(expect.arrayContaining(["sheet", "keyplan", "notes", "criteria", "general-notes", "levels"]));
    for (const part of parts) expect(part in LAYERS).toBe(false);
  });

  it("names every row with no layer in the sheet's notes, each by its own row", () => {
    const p = page();
    const svg = drawSection(options());
    for (const row of p.drawing.noLayer) expect(svg).toContain(`<tspan data-note="${row.key}">`);
    expect(svg).toContain("Appliances (Bought by the Owner)");
  });

  it("measures nothing in feet", () => {
    const svg = drawSection(options());
    const text = svg.replace(/<[^>]+>/g, " ");
    const labels = [...svg.matchAll(/aria-label="([^"]*)"/g)].map((m) => m[1]).join(" ");
    expect(`${text} ${labels}`).not.toMatch(/\d\s?(ft\b|'|′|"|″|feet|inch)/i);
  });

  it("says on its face that it is not a design", () => {
    const svg = drawSection(options());
    expect(svg).toContain(DIAGRAM_LINE);
    expect(svg).toContain("Building Section");
    expect(svg).toContain("The Kulka Group");
  });

  it("calls out the nine criteria with keyed tags", () => {
    const svg = drawSection(options());
    for (const code of ["A-1", "A-2", "E-1", "M-0", "M-1", "S-1", "V-1", "V-2", "V-3"]) expect(svg).toContain(`>${code}<`);
    expect(svg).toContain("1,600 A Service");
    expect(svg).toContain("Bar Building");
  });

  it("draws light ink for a layer priced from a placeholder rate", () => {
    // The reference run has no placeholder line, so the elevator layer is marked light by hand (LA-1483).
    const svg = drawSection(options({ ink: new Map([["element:elevator", "light" as const]]) }));
    const elevator = /<g data-layer="element:elevator"[\s\S]*?<\/g>/.exec(svg)![0];
    const concrete = /<g data-layer="line:2"[\s\S]*?<\/g>/.exec(svg)![0];
    expect(elevator).toContain('stroke="#A6A59D"');
    expect(concrete).toContain('stroke="#121211"');
    expect(concrete).not.toContain('stroke="#A6A59D"');
  });

  it("draws only the layers asked for, and the frame up to a story", () => {
    const drawn = new Set(["element:demolition", "line:2", "line:6", "line:7", "line:8"]);
    const svg = drawSection(options({ drawn, partial: { framing: 3 }, criteria: [] }));
    expect(layerKeys(svg).sort()).toEqual([...drawn].sort());
    expect(svg).toContain("Story 3 of 5");
    expect(svg).not.toContain("Level 5");
    expect(svg).not.toContain('data-part="criteria"');
  });

  it("marks what each story adds, so the page can raise the frame story by story", () => {
    const svg = drawSection(options());
    const framing = /<g data-layer="line:8"[\s\S]*?<\/g>/.exec(svg)![0];
    for (const n of [1, 2, 3, 4, 5]) expect(framing).toContain(`data-story="${n}"`);
    expect(svg).toContain("data-bracket=");
  });

  it("reverses to white on black for the band, with its own pattern ids", () => {
    const a = drawSection(options({ theme: "band", variant: "plain", idPrefix: "a" }));
    const b = drawSection(options({ idPrefix: "b" }));
    expect(a).toContain('fill="#0B0B0A"');
    expect(a).toContain('id="a-earth"');
    expect(a).not.toContain('data-part="notes"');
    expect(b).toContain('id="b-earth"');
    expect(a).not.toContain('id="b-earth"');
  });

  it("carries the phone crop as a second viewBox", () => {
    const svg = drawSection(options());
    expect(svg).toMatch(/data-vb-desk="0 0 1000 640"/);
    expect(svg).toMatch(/data-vb-phone="40 [\d.]+ 920 [\d.]+"/);
  });

  it("draws a different project from different facts without throwing", () => {
    const p = page();
    const other = drawSection(
      options({
        facts: { ...p.drawing.facts, stories: 3, belowGrade: true, elevators: 0, machineRooms: 0, balconies: false, parking: "Structured", demolition: false },
        criteria: [
          { code: "A-1", value: "Type IIB" },
          { code: "S-1", value: "Spread Footings" },
          { code: "V-1", value: "Hydraulic" },
        ],
      }),
    );
    const same = drawSection(options());

    expect(other).not.toBe(same);
    expect(other).toContain("3 Stories Above Grade");
    expect(other).toContain("Basement Slab");
    expect(other).not.toContain("Level 5");
    expect(other).not.toContain("Balconies, Screened");
    expect(other).not.toContain("Surface Parking");
    expect(other).not.toContain("Existing Structure, Removed");
    expect(layerKeys(other)).not.toContain("element:elevator");
    expect(layerKeys(other)).not.toContain("line:38");
    // No elevator, so no elevator callout even though the criterion was given.
    expect(other).not.toContain(">V-1<");
    expect(other).toContain(">A-1<");
  });

  it("holds a tall building on the sheet and a one-story one", () => {
    const p = page();
    for (const stories of [1, 2, 12, 24]) {
      const svg = drawSection(options({ facts: { ...p.drawing.facts, stories } }));
      expect(svg).toContain(`data-stories="${stories}"`);
      expect(svg).toContain(`${stories} Stories Above Grade`);
      for (const y of [...svg.matchAll(/ y1="(-?[\d.]+)"/g)].map((m) => Number(m[1]))) expect(y).toBeGreaterThanOrEqual(0);
    }
  });
});
