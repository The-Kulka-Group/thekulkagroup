import { describe, expect, it } from "vitest";

import { referencePublication } from "@/test/fixtures/published-budget";

import { addressableElements } from "./addressable-elements";
import { isAssumptionElement, isElementId } from "./budget-comments";
import { NO_DIVISION } from "./drill-down";
import { presentBudget, type Publication } from "./presentation";

// LA-1504. The ledger By Division on MN Test #4, as the LA-1479 frames draw it,
// and the drill-down's ids under the LA-1480 scheme.

const page = (publication: Publication = referencePublication()) => presentBudget(publication);

/** MN Test #4 as a snapshot published after LA-1502 would carry it, for the lines the frames open. */
function withLineFields(): Publication {
  const publication = referencePublication();
  const rom = publication.snapshot.rom;
  const line = (code: string) => rom.lines.find((l) => l.costCode === code)!;
  const approved = { drafter: "ai" as const, draftedBy: "devin@example.com", draftedAt: "2026-10-02T00:00:00Z", approvedBy: "devin@example.com", approvedAt: "2026-10-02T00:00:00Z" };
  Object.assign(line("1a"), {
    inputs: ["demolitionStructureCount", "demolitionStructureSquareFeet", "demolitionStructureType", "grossSquareFeet"],
    quantity: { amount: 15000, unit: "usd_per_sf_of_structure" },
    includes: [{ text: "Slab-on-Grade and Footings", ...approved }, { text: "Not Yet Approved", ...approved, approvedBy: null, approvedAt: null }],
    excludes: [{ text: "Hazardous Material Survey and Abatement", ...approved }],
  });
  Object.assign(line("1"), { inputs: ["demolition", "grossSquareFeet"] });
  Object.assign(line("26"), { inputs: ["elevatorCount", "grossSquareFeet"], raisedBy: [{ kind: "criterion", code: "V-2" }, { kind: "criterion", code: "V-1" }] });
  Object.assign(line("34"), { inputs: ["site_conditions", "grossSquareFeet"], raisedBy: [{ kind: "question", key: "site_conditions" }, { kind: "criterion", code: "S-1" }] });
  for (const l of rom.lines) if (!l.inputs) l.inputs = ["grossSquareFeet"];
  return publication;
}

describe("the ledger by division on MN Test #4", () => {
  it("groups the rows into their MasterFormat divisions, in order, with the frames' figures", () => {
    const divisions = page().divisions;
    expect(divisions.map((d) => d.division)).toEqual(["02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12", "13", "14", "21", "22", "23", "26", "27", "28", "31", "32", "33"]);
    const d02 = divisions[0];
    expect(d02).toMatchObject({ el: "division:02", title: "Existing Conditions", confidence: "low", perSquareFoot: "$3.37", shareOfContract: "1%" });
    expect(d02.likely).toBe(215_859);
    expect(d02.items.map((i) => i.costCode)).toEqual(["1a", "1"]);
    expect(d02.layers).toEqual(["element:demolition"]);
  });

  it("files the four disconnects under 33 Utilities and keeps the elevator's supporting items under 14 (Matt, 2026-10-02)", () => {
    const divisions = page().divisions;
    const d33 = divisions.find((d) => d.division === "33")!;
    expect(d33.items).toEqual([]);
    expect(d33.supporting.map((u) => u.costCode)).toEqual(["28a", "28b", "31f", "36a"]);
    expect(d33.confidence).toBe("none");
    expect(d33.perSquareFoot).toBeNull();
    const d14 = divisions.find((d) => d.division === "14")!;
    expect(d14.items.map((i) => i.costCode)).toEqual(["26", "26a"]);
    expect(d14.supporting).toHaveLength(7);
  });

  it("keeps the trade total: every priced line shows once, in one division", () => {
    const p = page();
    const codes = p.divisions.flatMap((d) => d.items.map((i) => i.costCode));
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.sort()).toEqual(p.ledger.flatMap((r) => r.scope.lines.map((l) => l.costCode)).sort());
    const sum = p.divisions.reduce((s, d) => s + d.likely, 0);
    expect(Math.round(sum)).toBe(Math.round(p.ledger.reduce((s, r) => s + r.scope.likely, 0)));
  });

  it("marks Equipment as bought by the owner and leaves it out of the contract's share", () => {
    const d11 = page().divisions.find((d) => d.division === "11")!;
    expect(d11.ownerDirect).toBe(true);
    expect(d11.shareOfContract).toBeNull();
  });

  it("moves each coded scope decision from What Is In to its division", () => {
    const divisions = page().divisions;
    const at = (d: string) => divisions.find((x) => x.division === d)!.decisions;
    expect(at("08").notInThisJob.map((r) => [r.el, r.answers])).toEqual([
      ["gate:15a", [{ label: "Parking", answer: "Surface" }]],
      ["gate:16", [{ label: "Retail Storefronts", answer: "No" }]],
    ]);
    expect(at("03").notInThisJob.map((r) => r.el)).toEqual(["gate:3"]);
    expect(at("28").notInThisJob.map((r) => r.el)).toEqual(["gate:32a"]);
    expect(at("31").waiting.map((r) => r.el)).toEqual(["gate:34a"]);
  });

  it("gives every item a Rate row, and a criterion that prices it, and nothing the snapshot lacks", () => {
    const d03 = page().divisions.find((d) => d.division === "03")!;
    const concrete = d03.items.find((i) => i.costCode === "2")!;
    expect(concrete.basis.map((b) => [b.el, b.label, b.value, b.chip.text])).toEqual([
      ["assumption:2:S-1", "Foundation System", "Spread Footings", "Planning Assumption"],
      ["assumption:2:rate", "Rate", "Rate on File", "Kulka Rate"],
    ]);
    // A snapshot published before LA-1502 has no inputs, scope lists or owner items: nothing fills them.
    expect(concrete.includes).toEqual([]);
    expect(d03.raise).toEqual([]);
  });
});

describe("with the LA-1502 line fields", () => {
  it("puts each answer a line prices on in its Basis, with its quantity", () => {
    const sd = page(withLineFields()).divisions[0].items.find((i) => i.costCode === "1a")!;
    expect(sd.basis.map((b) => [b.el, b.label, b.value, b.chip.text])).toEqual([
      ["assumption:1a:demolitionStructureCount", "Structures Coming Down", "1", "Stated"],
      ["assumption:1a:demolitionStructureSquareFeet", "Area Coming Down", "15,000 SF", "Stated"],
      ["assumption:1a:demolitionStructureType", "Structure Coming Down", "Steel Frame with Concrete on Metal Deck (Type II)", "Stated"],
      ["assumption:1a:grossSquareFeet", "Gross Area", "64,000 SF", "Stated"],
      ["assumption:1a:quantity", "Quantity", "15,000 SF of Structure", "From Your Answers"],
      ["assumption:1a:rate", "Rate", "Rate on File", "Kulka Rate"],
    ]);
  });

  it("shows approved Inclusions and Exclusions only, each keyed by its own words", () => {
    const sd = page(withLineFields()).divisions[0].items.find((i) => i.costCode === "1a")!;
    expect(sd.includes.map((x) => x.text)).toEqual(["Slab-on-Grade and Footings"]);
    expect(sd.excludes.map((x) => x.text)).toEqual(["Hazardous Material Survey and Abatement"]);
    expect(sd.includes[0].el).toMatch(/^inclusion:1a:[0-9a-f]{10}$/);
    expect(sd.excludes[0].el).toMatch(/^exclusion:1a:[0-9a-f]{10}$/);
  });

  it("lists the owner items that would raise a division, criteria first, with no counts", () => {
    const divisions = page(withLineFields()).divisions;
    const d14 = divisions.find((d) => d.division === "14")!;
    expect(d14.raise.map((r) => [r.el, r.tag, r.label, r.value, r.chip.text])).toEqual([
      ["raise:14:V-1", "V-1", "Elevator Type", "Hydraulic", "Planning Assumption"],
      ["raise:14:V-2", "V-2", "Hydraulic Jack Type", "In-Ground", "Planning Assumption"],
    ]);
    const d31 = divisions.find((d) => d.division === "31")!;
    expect(d31.raise.map((r) => [r.el, r.tag, r.chip.text])).toEqual([
      ["raise:31:S-1", "S-1", "Planning Assumption"],
      ["raise:31:site_conditions", "Open", "Waiting on You"],
    ]);
  });

  it("moves an answer out of Project Basis only when every line that reads it sits in one division", () => {
    const p = page(withLineFields());
    const kept = p.projectBasis.facts.map((f) => f.key);
    // Gross area prices every line, so it stays with the whole project.
    expect(kept).toContain("grossSquareFeet");
    expect(kept).not.toContain("demolitionStructureType");
    expect(kept).not.toContain("elevatorCount");
    expect(p.projectBasis.moved.map((m) => [m.division, m.answers])).toEqual([
      ["02", ["Demolition", "Structures Coming Down", "Area Coming Down", "Structure Coming Down"]],
      ["14", ["Elevators"]],
      ["31", ["Groundwater or Poor Soil"]],
    ]);
    // A section's gate now goes where its answer went.
    expect(p.divisions.find((d) => d.division === "02")!.decisions.inThisJob.map((r) => r.el)).toEqual(["gate:demolition"]);
  });
});

describe("the drill-down's ids", () => {
  it("are addressable, well formed, and once each, and only Basis, scope and raise rows take a flag", () => {
    const p = page(withLineFields());
    const elements = addressableElements(p);
    const ids = [...elements.keys()];
    const drill = ids.filter((id) => /^(division|line|unpriced|assumption|inclusion|exclusion|confidence|raise):/.test(id));
    expect(drill.length).toBeGreaterThan(100);
    for (const id of drill) expect(isElementId(id), id).toBe(true);
    expect(ids).toContain("confidence:14");
    expect(ids).toContain("raise:31:site_conditions");
    expect(ids).not.toContain("confidence:33");
    for (const id of drill) {
      const flaggable = /^(assumption|inclusion|exclusion|raise):/.test(id);
      expect(isAssumptionElement(id), id).toBe(flaggable);
    }
  });

  it("falls back to the row a line sits in today when the snapshot states no division for it", () => {
    const publication = referencePublication();
    publication.snapshot.rom.lines[0].division = null;
    expect(page(publication).divisions.every((d) => d.division !== NO_DIVISION)).toBe(true);
  });
});
