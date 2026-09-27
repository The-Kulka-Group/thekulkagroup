import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CriterionCard, CriterionPanel, type Criterion, DerivedCriteriaSection } from "./DerivedCriteria";

// LA-860. The Design Criteria cards as the server renders them. Every figure
// is synthetic.

function criterion(over: Partial<Criterion> = {}): Criterion {
  return {
    kind: "derived_assumption",
    id: "00000000-0000-4000-8000-0000000000a1",
    correctionId: null,
    code: "T-1",
    label: "Insulation, Walls and Attic",
    value: { kind: "spec", text: "R-20 Walls, R-49 Attic" },
    method: "Synthetic table lookup",
    inputs: [
      { name: "Climate Zone", value: "4A", basis: "assumed" },
      { name: "Construction", value: "Wood Frame", basis: "stated" },
    ],
    steps: [
      { label: "Climate zone", result: "4A" },
      { label: "Wall minimum", result: "R-20" },
    ],
    confidence: "high",
    confidenceReason: "Synthetic: the table is exact.",
    costCodes: ["07-200"],
    correction: null,
    ...over,
  };
}

const corrected = criterion({
  correctionId: "00000000-0000-4000-8000-0000000000b1",
  correction: {
    value: { kind: "spec", text: "R-21 Walls, R-49 Attic" },
    reason: "Owner spec",
    correctedBy: "estimator@kulka.invalid",
    correctedAt: "2026-09-27T15:00:00.000Z",
  },
});

const noop = () => {};

describe("CriterionCard", () => {
  it("shows the code, a Derived pill, the value, the label, and the confidence dot", () => {
    const html = renderToStaticMarkup(<CriterionCard item={criterion({ inputs: [criterion().inputs[1]] })} />);
    expect(html).toContain(">T-1<");
    expect(html).toContain("Derived");
    expect(html).toContain("R-20 Walls, R-49 Attic");
    expect(html).toContain("Insulation, Walls and Attic");
    expect(html).toContain("dc-dot--high");
    expect(html).toContain('aria-label="T-1 Insulation, Walls and Attic: R-20 Walls, R-49 Attic. High confidence."');
    expect(html).not.toContain("dc-card--leans");
  });

  it("wears the dashed assumed-fact flag when an input is assumed", () => {
    const html = renderToStaticMarkup(<CriterionCard item={criterion()} />);
    expect(html).toContain("dc-card--leans");
    expect(html).toContain("rests on an assumed fact");
    expect(html).toContain("Assumed Climate Zone.");
  });

  it("shows the Corrected state with Jev's value struck through and who set it", () => {
    const html = renderToStaticMarkup(<CriterionCard item={corrected} />);
    expect(html).toContain("Corrected");
    expect(html).not.toContain(">Derived<");
    expect(html).toContain("R-21 Walls, R-49 Attic");
    expect(html).toMatch(/class="dc-was">R-20 Walls, R-49 Attic</);
    expect(html).toContain("Set by estimator: Owner spec");
    expect(html).not.toContain("dc-card--leans");
    expect(html).not.toContain("dc-conf");
  });
});

describe("CriterionPanel", () => {
  it("shows the facts, the arithmetic, the confidence and the correction form", () => {
    const html = renderToStaticMarkup(
      <CriterionPanel item={criterion()} busy={false} error={null} onSave={noop} onRevert={noop} onPing={noop} />,
    );
    expect(html).toContain("From These Facts");
    expect(html).toContain("dc-fact dc-fact--assumed");
    expect(html).toContain("How Jev Got Here");
    expect(html).toMatch(/class="dc-res"><span>Wall minimum<\/span><b>R-20<\/b>/);
    expect(html).toContain("High confidence.");
    expect(html).toContain("Correct This Value");
    expect(html).toMatch(/<button type="submit" class="dc-btn dc-btn--pri" disabled="">Save Correction/);
  });

  it("offers Use Jev's Value once corrected", () => {
    const html = renderToStaticMarkup(
      <CriterionPanel item={corrected} busy={false} error={null} onSave={noop} onRevert={noop} onPing={noop} />,
    );
    expect(html).toContain("Use Jev&#x27;s Value");
    expect(html).toContain("estimator set this to <b>R-21 Walls, R-49 Attic</b> on Sep 27");
    expect(html).not.toContain("Save Correction");
  });
});

describe("DerivedCriteriaSection", () => {
  const props = {
    selectedCode: null,
    ping: null,
    onPing: noop,
    onOpen: noop,
    onEnter: noop,
    onLeave: noop,
  };

  it("shows nothing when the ROM has no derived assumptions", () => {
    expect(renderToStaticMarkup(<DerivedCriteriaSection items={[]} {...props} />)).toBe("");
  });

  it("counts the criteria that rest on an assumed fact", () => {
    const html = renderToStaticMarkup(
      <DerivedCriteriaSection items={[criterion(), corrected, criterion({ code: "T-2" })]} {...props} />,
    );
    expect(html).toContain("2 Rest on an Assumed Fact");
    expect(html).toContain("planning assumptions for the budget");
  });

  it("says Rests when one criterion rests on an assumed fact", () => {
    const html = renderToStaticMarkup(<DerivedCriteriaSection items={[criterion()]} {...props} />);
    expect(html).toContain("1 Rests on an Assumed Fact");
  });
});
