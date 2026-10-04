import type { BenchmarkUnit, RomLine, ScopeEntry, UnpricedItem } from "@kulka/engine";

import { divisionTitle } from "@/app/(app)/rom/ledger";
import { divisionFor, divisionRank, statedDivisions } from "@/app/(app)/rom/field-order";
import { ITEM_DIVISION_MAP } from "@/lib/rom/masterformat-item-divisions";

import type { BlockClassification } from "@kulka/engine";
import type { PublishedBudgetSnapshot } from "./published-snapshot";

// LA-1504 (frames docs/frames/la-1479, scored 92 by Matt on 2026-10-02). The
// ledger By Division: each MasterFormat division opens to its items, its
// confidence and the scope decisions that belong to it, and each item opens
// to its Basis and its Inclusions and Exclusions.
//
// Everything here is read from the snapshot. Where the snapshot has no data
// (a snapshot published before LA-1502 has no line inputs, quantities,
// scope lists or owner items), the field comes back empty and the page shows
// nothing for it. Nothing is filled in from labels or guessed.
//
// Ids follow the LA-1480 spec's scheme ("Id scheme for the LA-1479
// drill-down"): `division:<d>`, `line:<code>`, `unpriced:<code>`,
// `assumption:<code>:<key>`, `inclusion:<code>:<key>`, `exclusion:<code>:<key>`,
// `confidence:<d>` and `raise:<d>:<key>`. An inclusion's key is a hash of its
// own words, the way a note's is, because a scope entry carries no other key.

export type Tone = "high" | "medium" | "low" | "none" | "working" | "quiet";
export type Chip = { tone: Tone; text: string };

/** One row of an item's Basis: an answer it prices on, a criterion that prices it, its rate or its quantity. */
export type BasisRow = { el: string; label: string; value: string; chip: Chip; tag: string | null };

/** One approved Inclusion or Exclusion. */
export type ScopeText = { el: string; text: string };

/** What the drill-down needs from a priced line the page already shows. */
export type ItemSource = {
  costCode: string;
  label: string;
  low: number;
  high: number;
  likely: number;
  confidence: "high" | "medium" | "low";
  /** "Kulka Rate" or "Placeholder Rate". */
  sourceText: string;
};

/**
 * How an item is priced, as a count at a rate: "64,000 GSF at $50.69 per GSF".
 * `el` is the Basis row the statement reads back, or null for one worked out
 * here (an elevator's figure over its cars).
 */
export type PricedAs = { el: string | null; quantity: string; rate: string };

export type DivisionItem = ItemSource & {
  el: string;
  basis: BasisRow[];
  /** Lead first, then the same figure another way. Empty when no quantity is known. */
  pricedAs: PricedAs[];
  includes: ScopeText[];
  excludes: ScopeText[];
};

export type SupportingItem = { el: string; costCode: string; label: string };

/** An owner item that would raise a division's confidence. */
export type RaiseRow = { el: string; tag: string; label: string; value: string; chip: Chip };

/** A scope decision, moved here from What Is In. */
export type DecisionRow = { el: string; label: string; answers: { label: string; answer: string }[] };

export type DivisionRow = {
  /** `division:<d>`, also the row's id. */
  el: string;
  division: string;
  title: string;
  low: number;
  high: number;
  likely: number;
  confidence: "high" | "medium" | "low" | "none";
  ownerDirect: boolean;
  perSquareFoot: string | null;
  shareOfContract: string | null;
  /** The section's layer keys this division draws: the ledger rows whose priced lines sit here. */
  layers: string[];
  items: DivisionItem[];
  supporting: SupportingItem[];
  raise: RaiseRow[];
  decisions: { inThisJob: DecisionRow[]; assumedPresent: DecisionRow[]; notInThisJob: DecisionRow[]; waiting: DecisionRow[] };
};

/** A gate row as the page model already has it. */
export type GateInput = { el: string | null; label: string; decidedBy: { question: string | null; gate: string; answer: string }[] };

export type FactInput = { el: string; key: string; label: string; value: string; basis: "stated" | "assumed"; basisWords: string; assumedBy: string | null };
export type CriterionInput = { code: string; label: string; value: string; settled: boolean };

export type DrillDownInput = {
  snapshot: PublishedBudgetSnapshot;
  /** The ledger rows the page already built: their key (the layer key), division, and the cost codes inside. */
  rows: { key: string; division: string | null; ownerDirect: boolean; lines: string[]; unpriced: string[] }[];
  /** The page's priced lines, by cost code. */
  items: ReadonlyMap<string, ItemSource>;
  facts: readonly FactInput[];
  criteria: readonly CriterionInput[];
  gates: { answeredYes: GateInput[]; assumedPresent: GateInput[]; notInThisJob: GateInput[]; waiting: GateInput[] };
  /** The Kulka contract's likely figure, for each division's share. */
  contractLikely: number;
  grossSquareFeet: number | null;
  /** The elevator cars the answers give, 0 for none. */
  elevatorCount: number;
  classifications: readonly BlockClassification[];
  keyOf: (text: string) => string;
  usd: (n: number) => string;
  rateUsd: (n: number) => string;
  wholeNumber: (n: number) => string;
  titleCase: (text: string) => string;
};

export type ProjectBasis = {
  /** The answers that stay with the whole project. */
  facts: FactInput[];
  /** Where the other answers went, by division, in division order. */
  moved: { division: string; title: string; answers: string[]; removed: string[] }[];
  /** Scope decisions no division holds. */
  unplaced: DecisionRow[];
};

/**
 * Matt, 2026-10-02: the utility disconnects live in Site Work, so By Division
 * files them under 33 Utilities. LA-1502's migration states the same for new
 * runs (`block_classification.ledger_division`); this keeps a snapshot
 * published before it in line with his decision.
 */
const FILED_UNDER_33: ReadonlySet<string> = new Set(["28a", "28b", "31f", "36a"]);

const UNIT_WORDS: Record<BenchmarkUnit, string | null> = {
  usd_per_gsf: "SF",
  usd_lump_sum: null,
  usd_per_sf_of_structure: "SF of Structure",
  usd_each_structure: "Structures",
  usd_per_stop: "Stops",
  usd_each_elevator: "Elevators",
  usd_each_machine_room: "Machine Rooms",
};

/** One of a quantity's unit, after "per": $50.69 per SF. Null for a lump sum. */
const PER_UNIT_WORDS: Record<BenchmarkUnit, string | null> = {
  usd_per_gsf: "SF",
  usd_lump_sum: null,
  usd_per_sf_of_structure: "SF of Structure",
  usd_each_structure: "Structure",
  usd_per_stop: "Stop",
  usd_each_elevator: "Elevator",
  usd_each_machine_room: "Machine Room",
};

/**
 * LA-1535. The rate an item carries, worked back from its figure and its
 * quantity: "$50.69 per SF". Every item read "Rate on File" before, which
 * left a reader like Dan asking where the number came from. A snapshot
 * published before LA-1502 has no quantity, so the rate there reads per SF
 * of this building, which is what the figure works out to.
 */
function rateWords(likely: number, quantity: RomLine["quantity"], input: DrillDownInput): string | null {
  if (quantity) {
    const per = PER_UNIT_WORDS[quantity.unit];
    if (per === null) return `${input.usd(likely)} Lump Sum`;
    if (quantity.amount > 0) return `${input.rateUsd(likely / quantity.amount)} per ${per}`;
  }
  const gsf = input.grossSquareFeet;
  return gsf ? `${input.rateUsd(likely / gsf)} per SF of This Building` : null;
}

/**
 * The elevators line. A snapshot published before LA-1502 prices it per SF
 * with no quantity; the approved card (LA-1558) leads with it by the car.
 */
const ELEVATORS_CODE = "26";

function pricedAsOf(code: string, likely: number, line: RomLine | undefined, input: DrillDownInput): PricedAs[] {
  const out: PricedAs[] = [];
  const quantity = line?.quantity ?? null;
  const cars = input.elevatorCount;
  if (!quantity && code === ELEVATORS_CODE && cars > 0) {
    out.push({ el: null, quantity: `${cars} ${cars === 1 ? "Car" : "Cars"}`, rate: `${input.usd(likely / cars)} per Car` });
  }
  if (line?.perUnit) {
    out.push({ el: `assumption:${code}:per-unit`, quantity: `${input.wholeNumber(line.perUnit.unitCount)} Units`, rate: `${input.usd(line.perUnit.usdPerUnit)} per Unit` });
  }
  if (quantity) {
    const unit = UNIT_WORDS[quantity.unit];
    const per = PER_UNIT_WORDS[quantity.unit];
    if (unit && per && quantity.amount > 0) {
      out.push({ el: `assumption:${code}:rate`, quantity: `${input.wholeNumber(quantity.amount)} ${unit}`, rate: `${input.rateUsd(likely / quantity.amount)} per ${per}` });
    }
  } else if (input.grossSquareFeet) {
    out.push({ el: `assumption:${code}:rate`, quantity: `${input.wholeNumber(input.grossSquareFeet)} GSF`, rate: `${input.rateUsd(likely / input.grossSquareFeet)} per GSF` });
  }
  return out;
}

const isApproved = (entry: ScopeEntry) => entry.approvedBy !== null && entry.approvedAt !== null;

function markOf(lines: readonly { confidence: "high" | "medium" | "low" }[]): DivisionRow["confidence"] {
  if (lines.length === 0) return "none";
  if (lines.every((l) => l.confidence === "high")) return "high";
  if (lines.some((l) => l.confidence === "low")) return "low";
  return "medium";
}

/** The key of the last row, for lines with no division. Never a MasterFormat number. */
export const NO_DIVISION = "none";

/** "02 Existing Conditions" to "Existing Conditions". */
function titleOf(division: string): string {
  if (division === NO_DIVISION) return "Other Items";
  const full = divisionTitle(division);
  return full.startsWith(`${division} `) ? full.slice(division.length + 1) : full;
}

export function drillDown(input: DrillDownInput): { divisions: DivisionRow[]; projectBasis: ProjectBasis } {
  const { snapshot, rows } = input;
  const rom = snapshot.rom;
  const lineByCode = new Map<string, RomLine>(rom.lines.map((l) => [l.costCode, l]));
  const unpricedByCode = new Map<string, UnpricedItem>((rom.unpricedItems ?? []).map((u) => [u.costCode, u]));
  const factByKey = new Map(input.facts.map((f) => [f.key, f]));
  const criterionByCode = new Map(input.criteria.map((c) => [c.code, c]));
  const stated = statedDivisions(input.classifications);

  // Where each cost code sits: the run's own division (LA-1502), else the row it is in today.
  const rowOf = new Map<string, (typeof rows)[number]>();
  for (const row of rows) for (const code of [...row.lines, ...row.unpriced]) rowOf.set(code, row);
  // A line with no division anywhere sits in one last row, so every line still shows once.
  const divisionOfLine = (code: string): string => lineByCode.get(code)?.division ?? rowOf.get(code)?.division ?? NO_DIVISION;
  const divisionOfUnpriced = (code: string): string =>
    unpricedByCode.get(code)?.division ?? (FILED_UNDER_33.has(code) ? "33" : (rowOf.get(code)?.division ?? NO_DIVISION));

  type Building = Omit<DivisionRow, "low" | "high" | "likely" | "confidence" | "perSquareFoot" | "shareOfContract" | "raise"> & { owner: boolean[] };
  const byDivision = new Map<string, Building>();
  const groupFor = (division: string): Building => {
    let group = byDivision.get(division);
    if (!group) {
      group = {
        el: `division:${division}`,
        division,
        title: titleOf(division),
        ownerDirect: false,
        owner: [],
        layers: [],
        items: [],
        supporting: [],
        decisions: { inThisJob: [], assumedPresent: [], notInThisJob: [], waiting: [] },
      };
      byDivision.set(division, group);
    }
    return group;
  };

  for (const row of rows) {
    for (const code of row.lines) {
      const division = divisionOfLine(code);
      const source = input.items.get(code);
      if (!source) continue;
      const group = groupFor(division);
      group.items.push(itemOf(source, lineByCode.get(code), input, factByKey));
      group.owner.push(row.ownerDirect);
      if (!group.layers.includes(row.key)) group.layers.push(row.key);
    }
    for (const code of row.unpriced) {
      const division = divisionOfUnpriced(code);
      const item = unpricedByCode.get(code);
      if (!item) continue;
      groupFor(division).supporting.push({ el: `unpriced:${code}`, costCode: code, label: input.titleCase(item.label) });
    }
  }

  // Each answer a line prices on goes to that line's division, when every line that reads it sits in one division.
  const homesOf = new Map<string, Set<string>>();
  for (const line of rom.lines) {
    const division = divisionOfLine(line.costCode);
    for (const key of line.inputs ?? []) homesOf.set(key, (homesOf.get(key) ?? new Set()).add(division));
  }
  const homeOf = (key: string): string | null => {
    const homes = homesOf.get(key);
    return homes && homes.size === 1 ? [...homes][0] : null;
  };

  // Scope decisions: a gate on a cost code goes to that code's division; a gate on a whole section goes where its answer went.
  const unplaced: DecisionRow[] = [];
  const decision = (g: GateInput): DecisionRow => ({
    el: g.el ?? "",
    label: g.label,
    answers: g.decidedBy.map((d) => ({ label: factLabelFor(d, input.facts) ?? input.titleCase(d.gate), answer: d.answer })),
  });
  const place = (rowsIn: GateInput[], slot: keyof DivisionRow["decisions"]) => {
    for (const g of rowsIn) {
      const key = g.el?.startsWith("gate:") ? g.el.slice(5) : null;
      if (!key) continue;
      // A cost code opens with a digit; a section key ("levels_below_grade") never does.
      const division = /^\d/.test(key) ? divisionFor(key, stated, ITEM_DIVISION_MAP) : homeOf(key);
      const group = division ? byDivision.get(division) : undefined;
      if (group) group.decisions[slot].push(decision(g));
      else unplaced.push(decision(g));
    }
  };
  place(input.gates.answeredYes, "inThisJob");
  place(input.gates.assumedPresent, "assumedPresent");
  place(input.gates.notInThisJob, "notInThisJob");
  place(input.gates.waiting, "waiting");

  const gsf = input.grossSquareFeet;
  const divisions: DivisionRow[] = [...byDivision.values()]
    .sort((a, b) => divisionRank(a.division === NO_DIVISION ? null : a.division) - divisionRank(b.division === NO_DIVISION ? null : b.division))
    .map(({ owner, ...group }) => {
      const low = group.items.reduce((s, i) => s + i.low, 0);
      const high = group.items.reduce((s, i) => s + i.high, 0);
      const likely = group.items.reduce((s, i) => s + i.likely, 0);
      const ownerDirect = owner.length > 0 && owner.every(Boolean);
      const priced = group.items.length > 0;
      return {
        ...group,
        low,
        high,
        likely,
        ownerDirect,
        confidence: markOf(group.items),
        perSquareFoot: priced && gsf ? input.rateUsd(likely / gsf) : null,
        shareOfContract: priced && !ownerDirect ? `${Math.round((input.contractLikely > 0 ? likely / input.contractLikely : 0) * 100)}%` : null,
        raise: raiseOf(group.division, group.items, lineByCode, factByKey, criterionByCode),
      };
    });

  // Project Basis keeps the answers no single division holds.
  const movedKeys = new Set(input.facts.map((f) => f.key).filter((key) => homeOf(key) !== null));
  const moved = divisions
    .map((d) => ({
      division: d.division,
      title: d.title,
      answers: input.facts.filter((f) => movedKeys.has(f.key) && homeOf(f.key) === d.division).map((f) => f.label),
      removed: d.decisions.notInThisJob.map((r) => r.label),
    }))
    .filter((m) => m.answers.length > 0);
  return { divisions, projectBasis: { facts: input.facts.filter((f) => !movedKeys.has(f.key)), moved, unplaced } };
}

function factLabelFor(d: GateInput["decidedBy"][number], facts: readonly FactInput[]): string | null {
  if (d.question) {
    const fact = facts.find((f) => f.basisWords === d.question);
    if (fact) return fact.label;
  }
  return null;
}

const chipFor = (fact: FactInput): Chip =>
  fact.basis === "assumed" ? { tone: "working", text: fact.assumedBy ? `Assumed, ${fact.assumedBy}` : "Assumed" } : { tone: "quiet", text: "Stated" };

function itemOf(source: ItemSource, line: RomLine | undefined, input: DrillDownInput, factByKey: ReadonlyMap<string, FactInput>): DivisionItem {
  const code = source.costCode;
  const basis: BasisRow[] = [];
  for (const key of line?.inputs ?? []) {
    const fact = factByKey.get(key);
    if (fact) basis.push({ el: `assumption:${code}:${key}`, label: fact.label, value: fact.value, chip: chipFor(fact), tag: null });
  }
  for (const criterion of input.snapshot.criteria) {
    if (!criterion.costCodes.includes(code)) continue;
    const shown = input.criteria.find((c) => c.code === criterion.code);
    if (!shown) continue;
    basis.push({
      el: `assumption:${code}:${criterion.code}`,
      label: shown.label,
      value: shown.value,
      chip: shown.settled ? { tone: "quiet", text: "Settled" } : { tone: "working", text: "Planning Assumption" },
      tag: criterion.code,
    });
  }
  const placeholder = source.sourceText === "Placeholder Rate";
  const quantity = line?.quantity ?? null;
  const unit = quantity ? UNIT_WORDS[quantity.unit] : null;
  if (quantity && unit) {
    basis.push({ el: `assumption:${code}:quantity`, label: "Quantity", value: `${input.wholeNumber(quantity.amount)} ${unit}`, chip: { tone: "quiet", text: "From Your Answers" }, tag: null });
  }
  if (line?.perUnit) {
    basis.push({
      el: `assumption:${code}:per-unit`,
      label: "Priced per Unit",
      value: `${input.usd(line.perUnit.usdPerUnit)} across ${input.wholeNumber(line.perUnit.unitCount)} units`,
      chip: { tone: "quiet", text: "From Your Answers" },
      tag: null,
    });
  }
  basis.push({
    el: `assumption:${code}:rate`,
    label: "Rate",
    value: rateWords(source.likely, quantity, input) ?? (placeholder ? "Placeholder Until Kulka States a Rate" : "Kulka Rate"),
    chip: placeholder ? { tone: "working", text: "Placeholder Rate" } : { tone: source.confidence, text: "Kulka Rate" },
    tag: null,
  });
  const scope = (entries: readonly ScopeEntry[] | undefined, kind: "inclusion" | "exclusion"): ScopeText[] => {
    const seen = new Map<string, number>();
    return (entries ?? []).filter(isApproved).map((entry) => {
      const base = input.keyOf(entry.text);
      const nth = (seen.get(base) ?? 0) + 1;
      seen.set(base, nth);
      return { el: `${kind}:${code}:${nth === 1 ? base : `${base}-${nth}`}`, text: entry.text };
    });
  };
  return { ...source, el: `line:${code}`, basis, pricedAs: pricedAsOf(code, source.likely, line, input), includes: scope(line?.includes, "inclusion"), excludes: scope(line?.excludes, "exclusion") };
}

function raiseOf(
  division: string,
  items: readonly DivisionItem[],
  lineByCode: ReadonlyMap<string, RomLine>,
  factByKey: ReadonlyMap<string, FactInput>,
  criterionByCode: ReadonlyMap<string, CriterionInput>,
): RaiseRow[] {
  const questions = new Map<string, RaiseRow>();
  const criteria = new Map<string, RaiseRow>();
  for (const item of items) {
    for (const r of lineByCode.get(item.costCode)?.raisedBy ?? []) {
      if (r.kind === "question") {
        const fact = factByKey.get(r.key);
        if (fact && !questions.has(r.key)) {
          questions.set(r.key, { el: `raise:${division}:${r.key}`, tag: "Open", label: fact.label, value: fact.value, chip: { tone: "working", text: "Waiting on You" } });
        }
      } else {
        const c = criterionByCode.get(r.code);
        if (c && !criteria.has(r.code)) {
          criteria.set(r.code, { el: `raise:${division}:${r.code}`, tag: r.code, label: c.label, value: c.value, chip: { tone: "working", text: "Planning Assumption" } });
        }
      }
    }
  }
  // Criteria first by code, then the open questions, as frame 04 lists them.
  return [...[...criteria.values()].sort((a, b) => a.tag.localeCompare(b.tag)), ...[...questions.values()].sort((a, b) => a.label.localeCompare(b.label))];
}
