import type { RomLine } from "@kulka/engine";
import { describe, expect, it } from "vitest";

import { sourceOf } from "@/app/(app)/rom/ledger";
import { referencePublication } from "@/test/fixtures/published-budget";

import { clientBasis, clientSource, presentBudget, rateUsd } from "./presentation";

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
    expect(page.money.scopes).toHaveLength(35);
    expect(page.money.ownerScopes.map((s) => s.el)).toEqual(["line:22"]);
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

// LA-1459: the client ledger in MasterFormat order, and what the section is drawn from.
describe("the client ledger", () => {
  it("orders every row by division, then cost code, the owner's rows in their division", () => {
    const page = presentBudget(referencePublication());
    const rows = page.ledger.map((r) => [r.division, r.label]);

    expect(rows.slice(0, 6)).toEqual([
      ["02", "Demolition"],
      ["03", "Concrete & Site Concrete"],
      ["03", "Gypcrete"],
      ["04", "Masonry"],
      ["05", "Misc Steel Stairs Mesh Screens + Canopy"],
      ["06", "Wood Framing - Install + Wood Framing - Supply"],
    ]);
    expect(rows.find(([, label]) => label === "Appliances")).toEqual(["11", "Appliances"]);
    expect(rows[rows.length - 1][0]).toBe("32");
    expect(page.ledger).toHaveLength(page.money.scopes.length + page.money.ownerScopes.length);
    expect(new Set(page.ledger.map((r) => r.key)).size).toBe(page.ledger.length);
  });

  it("prints each row's rate per SF to the cent and its share of the contract", () => {
    const page = presentBudget(referencePublication());
    const drywall = page.ledger.find((r) => r.key === "line:17")!;
    const appliances = page.ledger.find((r) => r.label === "Appliances")!;

    expect(drywall.perSquareFoot).toBe("$50.69");
    expect(drywall.shareOfContract).toBe("16%");
    expect(drywall.sourceText).toBe("Kulka Rate");
    expect(appliances.shareOfContract).toBeNull();
    expect(page.ledger.find((r) => r.key === "element:elevator")!.sourceText).toBe("Elevators: Kulka Rate · Elevator Bulkhead: Kulka Rate");
  });

  it("inks a layer light only when a placeholder rate prices it, and says nothing of past jobs (LA-1483)", () => {
    const page = presentBudget(referencePublication());
    const { drawing } = page;

    // The reference run has no placeholder line, so every layer draws in full ink and the drawing carries no ink note.
    expect(Object.values(drawing.ink).every((ink) => ink === "full")).toBe(true);
    expect(drawing.lightRows).toEqual([]);
    expect(drawing.inkNote).toBe("");
    expect(drawing.noLayer.map((r) => r.label)).toEqual([
      "Wood Stairs",
      "Finish Carpentry",
      "Millwork",
      "Ceramic Tile",
      "Painting",
      "Specialties & F.E. + Signage",
      "Appliances (Bought by the Owner)",
      "Countertops",
      "Window Treatments",
      "Furnishings & Fireplace",
    ]);
  });

  it("reads the section's facts off the snapshot and the criteria", () => {
    const { facts } = presentBudget(referencePublication()).drawing;

    expect(facts).toEqual({
      project: "MN Test #4",
      version: 1,
      date: "September 28, 2026",
      stories: 5,
      belowGrade: false,
      units: 70,
      grossArea: "64,000 SF",
      parking: "Surface",
      demolition: true,
      elevators: 2,
      elevatorType: "Hydraulic",
      jack: "In-Ground",
      machineRooms: 1,
      balconies: true,
      storefront: false,
      form: "Bar",
    });
  });

  it("builds the figure line by line and lands it on the contract figure", () => {
    const page = presentBudget(referencePublication());
    const running = page.waterfall.map((w) => [w.key, w.running]);

    expect(running).toEqual([
      ["subtotal", 17_430_471],
      ["gc", 18_650_604],
      ["fee", 19_256_749],
      ["insurance", 20_296_613],
      ["kulka-contract", null],
      ["owner-direct", null],
      ["total-project-cost", null],
    ]);
  });
});

describe("client wording", () => {
  it("maps every source label the saved budget uses to a client word", () => {
    expect(clientSource("AI Figure")).toBe("Placeholder Rate");
    expect(clientSource("AI, This Budget Only")).toBe("Placeholder Rate");
    expect(clientSource("This Budget Only")).toBe("Kulka Rate");
    expect(clientSource("Stated Rate")).toBe("Kulka Rate");
    // LA-1483: a figure built from past jobs reads Kulka Rate, with no job count.
    expect(clientSource("1 Kulka Job")).toBe("Kulka Rate");
    expect(clientSource("4 Kulka Jobs, Judgment")).toBe("Kulka Rate");
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
    expect(scope.lines[0].basis).toMatch(/^A Placeholder Rate, applied to this project's quantity/);
    expect(page.drawing.ink["line:19"]).toBe("light");
    expect(page.drawing.inkNote).toBe("Light ink is a placeholder rate until Kulka states one.");
    expect(page.restsOn.placeholder).toBe(1);
    expect(JSON.stringify(page)).not.toMatch(/AI Figure|\bAI\b/);
  });

  it("rewrites the run's basis sentences for the client", () => {
    expect(
      clientBasis(
        "7.00% of subtotal, user override (history: 11.49% from 2 jobs: Fieldstone North Broadway (C00449), Jefferson's Ferry NW ILU Building 1 (C00456))",
      ),
    ).toBe("7.00% of subtotal, set by Kulka's estimator.");
    expect(clientBasis("3.25% of subtotal plus General Requirements & General Conditions, parameter fee.rate, someone@example.com 2026-09-23")).toBe(
      "3.25% of subtotal plus General Requirements and General Conditions, Kulka's stated rate, set 2026-09-23",
    );
    expect(clientBasis("5.40% of subtotal plus GRs/GCs and fee, recorded 2026-09-23")).toBe(
      "5.40% of subtotal plus General Requirements and General Conditions and fee, Kulka's stated rate, set 2026-09-23",
    );
    expect(clientBasis("9.50% of subtotal, from 1 job: Fieldstone North Broadway (C00449)")).toBe("9.50% of subtotal");
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
      "Range widths and markup rates are recorded pricing parameters, each with its own provenance, listed with this budget.",
    );
    expect(page.waterfall.find((w) => w.key === "subtotal")!.basis).toBe("Every scope above, added up. Owner-direct scope is kept out and added back below.");
  });
});

describe("notes", () => {
  it("numbers the run's notes in its own order, the same on every render", () => {
    const first = presentBudget(referencePublication()).notes;
    const again = presentBudget(referencePublication()).notes;

    expect(again).toEqual(first);
    expect(first.map((n) => n.el)).toEqual(Array.from({ length: 14 }, (_, i) => `note:${i + 1}`));
    // LA-1483: the run's "rest on estimator judgment with no measured Kulka figure" note is left out, and the rest renumber.
    expect(first.map((n) => n.text).join("\n")).not.toMatch(/estimator judgment|measured Kulka figure/);
    expect(first[7].text).toMatch(/^Not in this job, so removed from the total: Overhead Doors \(parking type\)/);
  });
});

describe("sections", () => {
  it("shows every section, in the spec's reading order, at the page's one depth", () => {
    const page = presentBudget(referencePublication());

    // LA-1309, "Sections". LA-1462 drops the Summary, Detail and Full depths:
    // the client page shows everything, so no section or fact carries a tier.
    expect(page.sections.map((s) => s.id)).toEqual([
      "letter",
      "the-project",
      "where-the-money-is",
      "design-and-engineering",
      "from-trades-to-total",
      "what-is-in",
      "what-happens-next",
    ]);
    expect(page.sections.every((s) => !("tier" in s))).toBe(true);
    expect(page.project.facts.every((f) => !("tier" in f))).toBe(true);
  });

  it("asks every stated fact's question in words, never as the field's label", () => {
    const page = presentBudget(referencePublication());
    const stated = page.project.facts.filter((f) => f.basis === "stated" && f.key !== "framingSystem");

    expect(stated.length).toBeGreaterThan(0);
    for (const fact of stated) {
      expect(fact.basisWords, fact.key).toMatch(/\?$/);
      expect(fact.basisWords, fact.key).not.toBe(fact.label);
    }
  });

  it("keeps the engine snapshot hash off the record", () => {
    const page = presentBudget(referencePublication());

    expect("snapshotHash" in page.record).toBe(false);
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
    expect(lineOf(page, "10").basis).toContain("Low confidence: the range is 30% each side of the figure.");
    expect(lineOf(page, "13").basis).toContain("Medium confidence: the range is 15% each side of the figure.");
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

describe("a rate per SF or per unit", () => {
  it("prints a rate under $100 to the cent, and whole dollars above", () => {
    expect(rateUsd(0.14)).toBe("$0.14");
    expect(rateUsd(3.7077)).toBe("$3.71");
    expect(rateUsd(99.994)).toBe("$99.99");
    expect(rateUsd(231.4)).toBe("$231");
    expect(rateUsd(25_000)).toBe("$25,000");
  });
});

describe("the letter", () => {
  const text = (runs: { text: string }[]) => runs.map((r) => r.text).join("");

  it("writes six paragraphs from the reference run's own facts (LA-1467)", () => {
    const { letter } = presentBudget(referencePublication());

    expect(letter.date).toBe("September 28, 2026");
    expect(letter.greeting).toBeNull();
    expect(letter.title).toBe("Your budget, and what it rests on.");
    expect(letter.signature).toEqual({ name: "The Kulka Group", role: "Estimating" });
    const paragraphs = letter.paragraphs.map(text);
    expect(paragraphs).toHaveLength(6);
    expect(paragraphs[0]).toBe(
      "You asked Kulka to price a 70-unit multifamily building: 5 stories of wood framing, 64,000 gross square feet, with surface parking. First, one structure of 15,000 square feet comes down. This budget prices that program as you described it, before any drawings exist, from the rates Kulka has stated.",
    );
    expect(paragraphs[1]).toBe(
      "We expect Kulka's contract to come to $20,296,613. Nothing is drawn yet, so every line is a range rather than a point, and the contract could land anywhere between $13,842,806 and $26,750,419 as the design settles. With what you buy direct, the total project cost is $20,532,042, or $317 per square foot and $289,952 per unit.",
    );
    expect(paragraphs[2]).toBe(
      "Every priced line rests on a rate Kulka has stated. No line here is a bid.",
    );
    expect(paragraphs[3]).toBe(
      "Where a decision has not been made, we have assumed one and marked it. 9 design criteria set the construction type (Type IIIA), the foundation (spread footings), the electrical service (1,600 A), the elevators (2 hydraulic cars, 1 machine room) and the cooling load (91 tons). Each is called out on the section drawing inside, and each is yours to change.",
    );
    expect(paragraphs[4]).toBe(
      "One question is still open: \u201CAre there known groundwater or poor soil conditions?\u201D Until it is answered, what waits on it sits outside the total rather than inside it as a guess.",
    );
    expect(paragraphs[5]).toBe(
      "Read the facts on the next page. If one is wrong, tell us and we reprice from the corrected fact. Then comes Design Development. Kulka's estimators price the design development drawings, and the range narrows.",
    );
  });

  it("names each figure once, pointing at the element that owns its id", () => {
    const { letter } = presentBudget(referencePublication());
    const figures = letter.paragraphs.flat().filter((r) => r.figure);
    expect(figures.map((r) => [r.text, r.el ?? null, r.elRef ?? null])).toEqual([
      ["70", null, null],
      ["64,000", null, null],
      ["15,000", null, null],
      ["$20,296,613", null, "total:kulka-contract"],
      ["$13,842,806", null, "total:kulka-contract:low"],
      ["$26,750,419", null, "total:kulka-contract:high"],
      ["$20,532,042", null, "total:total-project-cost"],
      ["$317", "record:per-sf", null],
      ["$289,952", "record:per-unit", null],
    ]);
  });

  it("says what the lines rest on without naming a past job, a job count or a split from jobs (LA-1483)", () => {
    const publication = referencePublication();
    const line = publication.snapshot.rom.lines.find((l) => l.costCode === "19")!;
    line.comparables = line.comparables.map((c) => ({ ...c, kind: "llm_proposal" as const }));
    line.comparableCount = 0;

    const paragraph = text(presentBudget(publication).letter.paragraphs[2]);

    expect(paragraph).toBe("37 of the 38 priced lines rest on rates Kulka has stated. The other one carries a placeholder rate until Kulka states one. No line here is a bid.");
    expect(paragraph).not.toMatch(/job|building|completed|built/i);
  });

  it("greets the reader the publication names", () => {
    const publication = referencePublication();
    publication.snapshot.copy.preparedFor = "Harbor Point Partners";
    expect(presentBudget(publication).letter.greeting).toBe("To Harbor Point Partners,");
  });
});
