import { describe, expect, it } from "vitest";

import { renderBudgetPage } from "@/app/b/[token]/render";
import { addressableElements, GENERAL_COMMENT_ID } from "@/lib/rom/addressable-elements";
import { noteKey, presentBudget } from "@/lib/rom/presentation";
import { referencePublication } from "@/test/fixtures/published-budget";

// LA-1488. The ids a reader can comment on are the page's own `data-el` ids,
// read off the model, plus `page:general`.

const model = () => presentBudget(referencePublication());
const dataEls = (html: string) => [...html.matchAll(/data-el="([^"]*)"/g)].map((m) => m[1]);

/** A publication whose run lists the given assumptions, in order, over the reference run. */
function withAssumptions(assumptions: string[]) {
  const publication = referencePublication();
  publication.snapshot.rom.assumptions = assumptions;
  return presentBudget(publication);
}

describe("render parity", () => {
  it("returns exactly the data-el ids the page renders, plus page:general", () => {
    const page = model();
    const ids = new Set(addressableElements(page).keys());
    const rendered = new Set(dataEls(renderBudgetPage(page)));

    expect(ids.has(GENERAL_COMMENT_ID)).toBe(true);
    expect(new Set([...ids].filter((id) => id !== GENERAL_COMMENT_ID))).toEqual(rendered);
  });

  it("returns the same ids as the printed page", () => {
    const page = model();
    const ids = new Set(addressableElements(page).keys());
    ids.delete(GENERAL_COMMENT_ID);
    const printed = new Set(dataEls(renderBudgetPage(page, { print: true })));

    expect(ids).toEqual(printed);
  });

  it("holds each id once and gives every element a section, a kind and a label", () => {
    const page = model();
    const elements = [...addressableElements(page).values()];

    for (const el of elements) {
      expect(el.id.startsWith(`${el.kind}:`), el.id).toBe(true);
      expect(el.label, el.id).not.toBe("");
      if (el.id !== GENERAL_COMMENT_ID) expect(el.section, el.id).not.toBeNull();
    }
    expect(new Set(elements.map((e) => e.id)).size).toBe(elements.length);
  });

  it("freezes a line's label, basis and figure for the anchor", () => {
    const page = model();
    // A single-line scope holds its line's id on the scope itself, so take a line with its own.
    const line = [...page.money.scopes, ...page.money.ownerScopes].flatMap((s) => s.lines).find((l) => l.el !== null)!;
    const el = addressableElements(page).get(line.el!)!;

    expect(el.kind).toBe("line");
    expect(el.section).toBe("where-the-money-is");
    expect(el.label).toBe(line.label);
    expect(el.figure).toMatch(/^\$/);
  });
});

describe("page:general", () => {
  it("is always present, on no section", () => {
    const general = addressableElements(model()).get(GENERAL_COMMENT_ID);

    expect(general).toEqual({ id: "page:general", kind: "page", section: null, label: "This Budget", text: "", figure: null });
  });

  it("is never a rendered data-el", () => {
    expect(dataEls(renderBudgetPage(model()))).not.toContain(GENERAL_COMMENT_ID);
  });
});

/** The reference run with benchmark-style cost codes, so every item carries its division and By Division builds. */
function divisionPage() {
  const publication = referencePublication();
  const rom = publication.snapshot.rom;
  const renamed = new Map(rom.lines.map((line, i) => [line.costCode, `${String((i % 30) + 2).padStart(2, "0")}-${100 + i}`]));
  for (const line of rom.lines) {
    line.costCode = renamed.get(line.costCode)!;
    if (line.driverCostCode) line.driverCostCode = renamed.get(line.driverCostCode);
  }
  rom.unpricedItems = [];
  return presentBudget(publication);
}

describe("division items", () => {
  it("point at the Ledger's line by elRef and hold no id of their own", () => {
    const groups = divisionPage().money.divisions!;
    const items = groups.flatMap((g) => g.items);

    expect(groups.length).toBeGreaterThan(0);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.el).toBeNull();
      expect(item.elRef).toMatch(/^line:/);
    }
  });

  it("each elRef names an id the Ledger holds", () => {
    const page = divisionPage();
    const ids = new Set(addressableElements(page).keys());

    for (const item of page.money.divisions!.flatMap((g) => g.items)) expect(ids.has(item.elRef), item.elRef).toBe(true);
  });

  it("never lets a division item id into the element set", () => {
    const ids = [...addressableElements(divisionPage()).keys()];

    expect(ids.filter((id) => /^division:[^:]+:/.test(id))).toEqual([]);
  });
});

describe("note keys", () => {
  const texts = ["Alpha note about the site.", "Bravo note about the frame.", "Charlie note about the roof.", "Delta note about the finish."];

  it("names a note by a hash of its words, not its position", () => {
    const notes = withAssumptions(texts).notes;

    expect(notes.map((n) => n.el)).toEqual(texts.map((t) => `note:${noteKey(t)}`));
    expect(notes.map((n) => n.number)).toEqual([1, 2, 3, 4]);
    for (const n of notes) expect(n.el).toMatch(/^note:[0-9a-f]{10}$/);
  });

  it("keeps every other key when a middle assumption is dropped", () => {
    const before = withAssumptions(texts).notes;
    const after = withAssumptions([texts[0], texts[2], texts[3]]).notes;

    expect(after.map((n) => n.key)).toEqual([before[0].key, before[2].key, before[3].key]);
    // The printed number moves up, and the id does not.
    expect(after.map((n) => n.number)).toEqual([1, 2, 3]);
  });

  it("keeps the keys when a note is added at the front", () => {
    const before = withAssumptions(texts).notes;
    const after = withAssumptions(["Zulu note added first.", ...texts]).notes;

    expect(after.slice(1).map((n) => n.key)).toEqual(before.map((n) => n.key));
  });

  it("does not rename the id when the client wording changes, only when the run's words do", () => {
    expect(noteKey(texts[0])).toBe(noteKey(texts[0]));
    expect(noteKey(texts[0])).not.toBe(noteKey(texts[1]));
  });

  it("suffixes a repeated note -2, -3 in the order the run wrote them", () => {
    const notes = withAssumptions([texts[0], texts[1], texts[0], texts[0]]).notes;
    const base = noteKey(texts[0]);

    expect(notes.map((n) => n.key)).toEqual([base, noteKey(texts[1]), `${base}-2`, `${base}-3`]);
    expect(new Set(notes.map((n) => n.el)).size).toBe(4);
  });

  it("puts every note in the element set under its model id", () => {
    const page = model();
    const elements = addressableElements(page);

    for (const n of page.notes) {
      const el = elements.get(n.el);
      expect(el, n.el).toBeDefined();
      expect(el!.kind).toBe("note");
      expect(el!.text).toBe(n.text);
    }
  });
});
