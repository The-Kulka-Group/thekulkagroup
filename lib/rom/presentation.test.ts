import type { RomLine } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { sourceOf } from "@/app/(app)/rom/ledger";
import { referencePublication } from "@/test/fixtures/published-budget";

import { clientBasis, clientSource, presentBudget } from "./presentation";

// LA-1418. The presentation model, from the reference run. Expected figures
// are the ones the LA-1416 reference page printed from the same run.

describe("presentBudget", () => {
  it("puts the Kulka contract, its range and the two derived figures up front", () => {
    const page = presentBudget(referencePublication());

    expect(page.headline.kulkaContract).toEqual({ low: 13_842_806, high: 26_750_419, likely: 20_296_612.5 });
    expect(page.headline.totalProjectCost).toEqual({ low: 13_995_835, high: 27_068_249, likely: 20_532_042 });
    expect(page.headline.perSquareFoot?.value).toBe(317);
    expect(page.headline.perSquareFoot?.arithmetic).toBe("Kulka contract over gross area, garage included: $20,296,613 over 64,000 SF");
    expect(page.headline.perUnit?.value).toBe(289_952);
    expect(page.headline.perUnit?.arithmetic).toBe("Kulka contract over the unit count: $20,296,613 over 70 units");
  });
});

describe("the ledger", () => {
  it("adds up to the run's own totals to the cent, Kulka's trades and owner-direct apart", () => {
    const page = presentBudget(referencePublication());
    const sum = (scopes: { low: number; high: number }[]) => ({
      low: scopes.reduce((s, x) => s + x.low, 0),
      high: scopes.reduce((s, x) => s + x.high, 0),
    });

    // Reference run: subtotal 11,888,024 to 22,972,917; owner-direct 153,029 to 317,830.
    expect(sum(page.money.scopes)).toEqual({ low: 11_888_024, high: 22_972_917 });
    expect(sum(page.money.ownerScopes)).toEqual({ low: 153_029, high: 317_830 });
    expect(page.money.trades).toEqual({ low: 11_888_024, high: 22_972_917, likely: 17_430_470.5 });
  });

  it("orders scopes largest first, folds an element's lines under it, and shows eight at Summary", () => {
    const page = presentBudget(referencePublication());

    expect(page.money.scopes.slice(0, 3).map((s) => [s.el, s.likely])).toEqual([
      ["line:17", 3_244_169.5],
      ["line:28", 1_812_021.5],
      ["line:31", 1_237_763],
    ]);
    const elevator = page.money.scopes.find((s) => s.el === "element:elevator")!;
    expect(elevator.likely).toBe(378_700);
    expect(elevator.lines.map((l) => l.costCode).sort()).toEqual(["26", "26a"]);
    expect(elevator.unpriced.map((u) => u.el)).toEqual(["unpriced:26b", "unpriced:26c", "unpriced:26e", "unpriced:26f", "unpriced:26g", "unpriced:26h", "unpriced:26i"]);
    expect(page.money.scopes.filter((s) => s.tier === "summary")).toHaveLength(8);
    expect(page.money.rest).toEqual({ count: 27, low: 4_368_512, high: 8_191_787, likely: 6_280_149.5 });
    expect(page.money.ownerScopes.map((s) => [s.el, s.tier])).toEqual([["line:22", "summary"]]);
  });

  it("leaves By Division off when the snapshot carries no division, and adds up when it does", () => {
    // The reference run's cost codes are canonical item numbers ("31a"), whose
    // division lives in a table the snapshot does not freeze.
    expect(presentBudget(referencePublication()).money.divisions).toBeNull();

    const publication = referencePublication();
    const rom = publication.snapshot.rom;
    // Benchmark-style codes carry their division: "09-900" is Division 09.
    const renamed = new Map(rom.lines.map((line, i) => [line.costCode, `${String((i % 30) + 2).padStart(2, "0")}-${100 + i}`]));
    for (const line of rom.lines) {
      line.costCode = renamed.get(line.costCode)!;
      if (line.driverCostCode) line.driverCostCode = renamed.get(line.driverCostCode);
    }
    rom.unpricedItems = [];
    const divisions = presentBudget(publication).money.divisions!;

    expect(divisions).not.toBeNull();
    expect(divisions.reduce((s, d) => s + d.low, 0)).toBe(11_888_024);
    expect(divisions.reduce((s, d) => s + d.high, 0)).toBe(22_972_917);
  });
});

describe("client wording", () => {
  it("maps every source label the saved budget uses to a client word", () => {
    expect(clientSource("AI Figure")).toBe("Placeholder Rate");
    expect(clientSource("AI, This Budget Only")).toBe("Placeholder Rate");
    expect(clientSource("This Budget Only")).toBe("Kulka Rate");
    expect(clientSource("Stated Rate")).toBe("Kulka Rate");
    expect(clientSource("1 Kulka Job")).toBe("1 Kulka Job");
    expect(clientSource("4 Kulka Jobs, Judgment")).toBe("4 Kulka Jobs");
    expect(clientSource("No Rate Yet")).toBe("No Rate Yet");
  });

  it("calls a line the model proposed a Placeholder Rate, never an AI figure", () => {
    const publication = referencePublication();
    const line = publication.snapshot.rom.lines.find((l) => l.costCode === "19")!;
    line.comparables = line.comparables.map((c) => ({ ...c, kind: "llm_proposal" as const }));
    line.comparableCount = 0;

    const page = presentBudget(publication);
    const scope = page.money.scopes.find((s) => s.el === "line:19")!;

    expect(scope.chip.text).toBe("Placeholder Rate");
    expect(scope.lines[0].comparables[0].kindWords).toBe("Placeholder Rate");
    expect(page.restsOn.placeholder).toBe(1);
    expect(JSON.stringify(page)).not.toMatch(/AI Figure|\bAI\b/);
  });

  it("rewrites the run's basis sentences for the client", () => {
    expect(
      clientBasis(
        "7.00% of subtotal, user override (history: 11.49% from 2 jobs: Fieldstone North Broadway (C00449), Jefferson's Ferry NW ILU Building 1 (C00456))",
      ),
    ).toBe(
      "7.00% of subtotal, set by Kulka's estimator (Kulka's completed jobs average 11.49% across 2 jobs: Fieldstone North Broadway (C00449), Jefferson's Ferry NW ILU Building 1 (C00456))",
    );
    expect(clientBasis("3.25% of subtotal plus General Requirements & General Conditions, parameter fee.rate, someone@example.com 2026-09-23")).toBe(
      "3.25% of subtotal plus General Requirements and General Conditions, Kulka's stated rate, set 2026-09-23",
    );
    expect(clientBasis("5.40% of subtotal plus GRs/GCs and fee, recorded 2026-09-23")).toBe(
      "5.40% of subtotal plus General Requirements and General Conditions and fee, Kulka's stated rate, set 2026-09-23",
    );
    expect(clientBasis("9.50% of subtotal, from 1 job: Fieldstone North Broadway (C00449)")).toBe(
      "9.50% of subtotal, the average of Kulka's completed job: Fieldstone North Broadway (C00449)",
    );
    expect(clientBasis("No imported budget records General Conditions for this setup, and no override was given")).toBe(
      "Kulka has no recorded rate for General Conditions on this setup yet, and none was set",
    );
    expect(clientBasis("2 roles and 1 field-office item over 60 weeks, from rate tables C-00379, monthly items at 13.86 months (weeks / 4.33)")).toBe(
      "2 roles and 1 field-office item over 60 weeks, from Kulka's rate tables (C-00379), monthly items at 13.86 months (weeks divided by 4.33)",
    );
  });

  it("writes notes and basis sentences with no internal wording", () => {
    const page = presentBudget(referencePublication());
    const text = [...page.notes.map((n) => n.text), ...page.waterfall.map((w) => w.basis), ...page.criteria.flatMap((c) => [c.method, c.confidenceReason])].join("\n");

    expect(text).not.toMatch(/user override|history:|parameter (fee|insurance)\.rate|@|\bROM\b|engine parameters|GRs\/GCs|ADR|\bmodel\b|\bAI\b|\bJev\b|\bLLM\b/);
    expect(page.notes[3].text).toBe(
      "Blend weights, flag thresholds, and range widths are recorded pricing parameters, each with its own provenance, listed with this budget.",
    );
    expect(page.waterfall.find((w) => w.key === "subtotal")!.basis).toBe("Every scope above, added up. Owner-direct scope is kept out and added back below.");
  });
});

describe("notes", () => {
  it("numbers the run's notes in its own order, the same on every render, five at Summary", () => {
    const first = presentBudget(referencePublication()).notes;
    const again = presentBudget(referencePublication()).notes;

    expect(again).toEqual(first);
    expect(first.map((n) => n.el)).toEqual(Array.from({ length: 15 }, (_, i) => `note:${i + 1}`));
    expect(first.filter((n) => n.tier === "summary").map((n) => n.number)).toEqual([1, 2, 3, 4, 5]);
    expect(first[8].text).toMatch(/^Not in this job, so removed from the total: Overhead Doors \(parking type\)/);
  });
});

describe("tiers", () => {
  it("shows each section at the tiers the spec's table gives it", () => {
    const page = presentBudget(referencePublication());
    const tierOf = Object.fromEntries(page.sections.map((s) => [s.id, s.tier]));

    // LA-1309, "Sections, and what each tier shows".
    expect(tierOf).toEqual({
      "your-number": "summary",
      "the-project": "summary",
      "where-the-money-is": "summary",
      "what-this-rests-on": "summary",
      "design-and-engineering": "detail",
      "from-trades-to-total": "summary",
      "what-is-in": "summary",
      "what-happens-next": "summary",
    });
    // The Project: the facts that price the most at Summary, every fact at Detail.
    expect(page.project.facts.filter((f) => f.tier === "summary").map((f) => f.label)).toEqual([
      "Project Type",
      "Construction",
      "Gross Area",
      "Framing",
      "Stories Above Grade",
      "Units",
      "Labor",
      "Parking",
    ]);
    expect(page.project.facts.filter((f) => f.basis === "assumed").every((f) => f.tier === "detail")).toBe(true);
  });
});

describe("the stage bar", () => {
  it("names four stages and marks the published one, with words and no figures", () => {
    const page = presentBudget(referencePublication());

    expect(page.stages.map((s) => [s.label, s.current])).toEqual([
      ["Conceptual Budget", true],
      ["Design Development", false],
      ["Pre-Construction", false],
      ["Contract", false],
    ]);
    expect(page.stages.map((s) => s.words).join(" ")).not.toMatch(/\d/);
    expect(page.next.nextStage?.label).toBe("Design Development");
  });
});

describe("element ids", () => {
  it("gives every priced line, unpriced item, markup, criterion, gate, note and total exactly one id", () => {
    const page = presentBudget(referencePublication());
    const scopes = [...page.money.scopes, ...page.money.ownerScopes];
    const ids = [
      ...scopes.map((s) => s.el),
      ...scopes.flatMap((s) => s.lines.map((l) => l.el)),
      ...scopes.flatMap((s) => s.unpriced.map((u) => u.el)),
      ...page.waterfall.map((w) => w.el),
      ...page.criteria.map((c) => c.el),
      ...[...page.gates.answeredYes, ...page.gates.notInThisJob, ...page.gates.waiting, ...page.gates.assumedPresent].map((g) => g.el),
      ...page.notes.map((n) => n.el),
    ].filter((id): id is string => id !== null);

    expect(new Set(ids).size).toBe(ids.length);
    const rom = referencePublication().snapshot.rom;
    for (const line of rom.lines.filter((l) => l.breakoutOf === null && l.gateStatus !== "not_in_job" && l.gateStatus !== "tbd")) {
      expect(ids.filter((id) => id === `line:${line.costCode}`)).toHaveLength(1);
    }
    for (const item of rom.unpricedItems) expect(ids.filter((id) => id === `unpriced:${item.costCode}`)).toHaveLength(1);
    expect(ids.filter((id) => id.startsWith("markup:"))).toEqual(["markup:90-20-00", "markup:90-30-00", "markup:90-40-00"]);
    expect(ids.filter((id) => id.startsWith("criterion:"))).toHaveLength(9);
    expect(ids).toContain("gate:elevator");
    expect(ids).toContain("gate:34a");
  });
});

// Review fixes on PR 130.

function lineOf(page: ReturnType<typeof presentBudget>, costCode: string) {
  const scopes = [...page.money.scopes, ...page.money.ownerScopes];
  for (const scope of scopes) {
    const line = scope.lines.find((l) => l.costCode === costCode);
    if (line) return line;
  }
  throw new Error(`No line ${costCode} on the page.`);
}

describe("a line's range, from the frozen parameters", () => {
  it("prints the spread the snapshot froze, not a fixed figure", () => {
    const publication = referencePublication();
    const parameters = publication.snapshot.rom.parameters!;
    parameters["spread.low"] = { ...parameters["spread.low"]!, value: 0.3 };
    parameters["spread.medium"] = { ...parameters["spread.medium"]!, value: 0.15 };

    const page = presentBudget(publication);

    // Line 10 is low confidence and line 13 medium in the reference run.
    expect(lineOf(page, "10").basis).toContain("Low confidence: the range is 30% each side of the blend.");
    expect(lineOf(page, "13").basis).toContain("Medium confidence: the range is 15% each side of the blend.");
  });

  it("says the range is as shown, with no percentage, when the parameter is absent", () => {
    const publication = referencePublication();
    delete publication.snapshot.rom.parameters!["spread.low"];

    const basis = lineOf(presentBudget(publication), "10").basis;

    expect(basis).toContain("Low confidence: the range is as shown.");
    expect(basis).not.toMatch(/\d+% each side/);
  });
});

describe("a source label with no client word", () => {
  it("reads Kulka Figure rather than failing the page", () => {
    expect(clientSource("Something New")).toBe("Kulka Figure");
  });

  it("maps every label ledger.ts gives a line today, so a new one is caught here", () => {
    const base = referencePublication().snapshot.rom.lines.find((l) => l.costCode === "13")!;
    const comparable = base.comparables[0];
    const variants: RomLine[] = [
      { ...base, comparables: [] },
      { ...base, comparables: [{ ...comparable, kind: "llm_proposal" }] },
      { ...base, comparables: [{ ...comparable, exportLabel: "This project only. Stated for this budget." }] },
      { ...base, comparables: [{ ...comparable, exportLabel: "This project only. A suggestion, accepted." }] },
      { ...base, comparableCount: 0, comparables: [{ ...comparable, kind: "reviewed_judgment" }] },
      { ...base, comparableCount: 1 },
      { ...base, comparableCount: 3 },
      { ...base, comparableCount: 2, comparables: [{ ...comparable, kind: "reviewed_judgment" }] },
    ];
    const labels = new Set([...variants.map((line) => sourceOf(line).text), "No Rate Yet"]);
    // One line down each branch of sourceOf. A branch added there needs a line here.
    expect([...labels].sort()).toEqual(["1 Kulka Job", "2 Kulka Jobs, Judgment", "3 Kulka Jobs", "AI Figure", "AI, This Budget Only", "No Rate Yet", "Stated Rate", "This Budget Only"]);
    for (const label of labels) expect(clientSource(label), label).not.toBe("Kulka Figure");
  });
});

describe("a comparable's rate, in the unit the snapshot knows", () => {
  it("prints a per-unit line's comparables per unit", () => {
    // Line 10 priced per unit: its rate is per GSF of this project, times 914.29 SF per unit.
    const line = lineOf(presentBudget(referencePublication()), "10");
    expect(line.comparables[0].rate).toBe("$231 per unit");
  });

  it("prints a comparable the import recorded per GSF per SF", () => {
    const line = lineOf(presentBudget(referencePublication()), "13");
    expect(line.comparables.map((c) => c.rate)).toEqual(["$4 per SF", "$6 per SF"]);
  });

  it("prints a figure whose unit the snapshot does not know as a rate, with no unit", () => {
    const page = presentBudget(referencePublication());
    // Line 1's first figure is one job's $25,000 demolition line, a lump sum, not a rate per SF.
    expect(lineOf(page, "1").comparables[0].rate).toBe("$25,000 rate");

    const publication = referencePublication();
    const line = publication.snapshot.rom.lines.find((l) => l.costCode === "13")!;
    line.comparables = line.comparables.map((c) => ({ ...c, kind: "llm_proposal" as const, exportLabel: null, rate: 50 }));
    expect(lineOf(presentBudget(publication), "13").comparables[0].rate).toBe("$50 rate");
  });
});

describe("the markup method, in words", () => {
  function wordsFor(method: string) {
    const publication = referencePublication();
    const markups = publication.snapshot.rom.markups!;
    markups.choices = { ...markups.choices, method } as typeof markups.choices;
    return presentBudget(publication).markupWords;
  }

  it("says line by line for an Allocated Resources plan", () => {
    const words = wordsFor("allocated_resources");
    expect(words).toContain("line by line, from an allocated resources plan");
    expect(words).not.toContain("staffing");
  });

  it("keeps the staffing words for staffing and duration only", () => {
    expect(wordsFor("staffing_duration")).toContain("from staffing and job duration");
    expect(wordsFor("pct_of_subtotal")).not.toContain("staffing");
  });
});
