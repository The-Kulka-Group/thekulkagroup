import { longDate, usd, wholeNumber, type BudgetPage, type Fact } from "@/lib/rom/presentation";

// LA-1488. The elements of a client budget page a reader can comment on, read
// off the same model the page renders from. The comment routes use it to check
// that an `element_id` exists on the version the reader is on, and to freeze the
// anchor (the label, text and figure the reader saw) beside the comment.
//
// The set is the page's own `data-el` ids and nothing else:
//
//   - A `data-el-ref` is a pointer to an id that is already here, so it adds none.
//   - LA-1504: the ledger is By Division. Each `division:<d>` opens to its items
//     (`line:<code>`, `unpriced:<code>`), each item's Basis (`assumption:<code>:<key>`)
//     and Inclusions and Exclusions (`inclusion:`, `exclusion:`), the division's
//     `confidence:<d>` and the owner items that would raise it (`raise:<d>:<key>`),
//     and its Scope Decisions (`gate:<key>`, moved here from What Is In).
//   - `ve` stays reserved: the VE control is empty until Kulka supplies options.
//
// `page:general` is always present: a comment on the budget as a whole, which
// sits on no element and so carries no section.
//
// Pure, like `presentBudget`: the same page always yields the same map, and
// every key comes from the snapshot's data, never from a label or a position.

export type AddressableElement = {
  /** The `data-el` id: `<kind>:<key>`, such as `line:31a` or `note:3fa9c1d2e0`. */
  id: string;
  /** The part of the id before the first colon, such as `line`. */
  kind: string;
  /** The `SectionHead.id` the element sits in (`your-number` for the opening band), or null for `page:general`. */
  section: string | null;
  /** What the page calls it, in the page's own title case. */
  label: string;
  /** The words the reader saw on the element, or "" when it shows none. */
  text: string;
  /** The number or value the element shows, as printed, or null when it shows none. */
  figure: string | null;
};

export const GENERAL_COMMENT_ID = "page:general";

export function addressableElements(page: BudgetPage): ReadonlyMap<string, AddressableElement> {
  const elements = new Map<string, AddressableElement>();
  const add = (id: string | null, section: string, label: string, text = "", figure: string | null = null) => {
    // An id is held once. A repeat (the page never makes one) keeps the first.
    if (id === null || elements.has(id)) return;
    elements.set(id, { id, kind: id.slice(0, id.indexOf(":")), section, label, text, figure });
  };

  const hasCriteria = page.criteria.length > 0;
  const r = page.record;
  const h = page.headline;

  // The opening band, then each section the page renders.
  add("section:your-number", "your-number", page.projectName, `${r.stageLabel}, Version ${r.version}`);
  for (const s of page.sections) {
    if (s.id === "design-and-engineering" && !hasCriteria) continue;
    add(s.el, s.id, s.title);
  }

  // The letter: the two rates it owns.
  for (const paragraph of page.letter.paragraphs) {
    for (const run of paragraph) {
      if (!run.figure || !run.el) continue;
      add(run.el, "letter", run.el === "record:per-sf" ? "Per Square Foot" : run.el === "record:per-unit" ? "Per Unit" : run.text, run.title ?? "", run.text);
    }
  }

  // Project Basis: the answers about the whole project, and any scope decision no division holds.
  if (r.coverSentence) add("record:cover", "the-project", "Cover Sentence", r.coverSentence);
  if (h.grossSquareFeet !== null) add("fact:grossSquareFeet:figure", "the-project", "Gross Area", "", `${wholeNumber(h.grossSquareFeet)} SF`);
  (page.projectBasis.facts as Fact[]).forEach((f) => add(f.el, "the-project", f.label, f.basisWords, f.value));
  const shownFacts = new Set(page.projectBasis.facts.map((f) => f.label));
  page.projectBasis.unplaced
    .filter((row) => row.el && !row.answers.every((a) => shownFacts.has(a.label)))
    .forEach((row) => add(row.el, "the-project", row.label, row.answers.map((a) => `${a.label}: ${a.answer}`).join(" · ")));

  // The Ledger, By Division (LA-1504): a division, its items and their Basis and
  // scope, its confidence and what would raise it, its scope decisions, and the foot.
  const money = "where-the-money-is";
  const confidenceWords = (tone: string) => ({ high: "High", medium: "Medium", low: "Low" })[tone] ?? "None";
  for (const d of page.divisions) {
    add(d.el, money, d.title, `${d.items.length + d.supporting.length} ${d.items.length + d.supporting.length === 1 ? "Item" : "Items"}`, d.items.length > 0 ? usd(d.likely) : "No Rate Yet");
    for (const item of d.items) {
      add(item.el, money, item.label, `${usd(item.low)} to ${usd(item.high)}`, usd(item.likely));
      item.basis.forEach((row) => add(row.el, money, row.label, `${row.value} · ${row.chip.text}`, null));
      item.includes.forEach((x) => add(x.el, money, "Inclusion", x.text));
      item.excludes.forEach((x) => add(x.el, money, "Exclusion", x.text));
    }
    d.supporting.forEach((u) => add(u.el, money, u.label, "No Rate Yet. Outside the total."));
    if (d.items.length > 0) add(`confidence:${d.division}`, money, `${d.title} Confidence`, `${confidenceWords(d.confidence)} Confidence`);
    d.raise.forEach((x) => add(x.el, money, x.label, `${x.value} · ${x.chip.text}`));
    for (const row of [...d.decisions.inThisJob, ...d.decisions.assumedPresent, ...d.decisions.notInThisJob, ...d.decisions.waiting]) {
      add(row.el || null, money, row.label, row.answers.map((x) => `${x.label}: ${x.answer}`).join(" · "));
    }
  }
  if (page.money.ownerScopes.length > 0) {
    add("total:trade-cost", "where-the-money-is", "All Trades, Owner-Direct Included", `${usd(h.tradeCost.low)} to ${usd(h.tradeCost.high)}`, usd(h.tradeCost.likely));
  }

  // Design and Engineering: the criteria, called out on the drawing.
  if (hasCriteria) page.criteria.forEach((c) => add(c.el, "design-and-engineering", c.label, c.method, c.value));

  // From Trades to Total. The Kulka contract row holds no id of its own: the
  // page puts `total:kulka-contract` and its low and high on the landed figure.
  for (const w of page.waterfall) {
    if (w.key === "kulka-contract") {
      add("total:kulka-contract", "from-trades-to-total", w.label, w.basis, usd(w.likely));
      add("total:kulka-contract:low", "from-trades-to-total", "Total Budget, Low", "", usd(w.low));
      add("total:kulka-contract:high", "from-trades-to-total", "Total Budget, High", "", usd(w.high));
    } else {
      add(w.el, "from-trades-to-total", w.label, w.basis, w.tbd ? "TBD" : usd(w.likely));
    }
    w.plan.forEach((p) => add(p.el, "from-trades-to-total", p.label, "", usd(p.amount)));
  }

  // Clarifications: the notes.
  page.notes.forEach((n) => add(n.el, "what-is-in", `Note ${n.number}`, n.text));
  // LA-1532: the pricing parameters are internal and no longer on the client page.

  // What Happens Next: the record and the footer.
  const next = "what-happens-next";
  add("record:prepared-for", next, "Prepared For", r.preparedFor ?? "Not Named");
  add("record:issued", next, "Issued", longDate(r.issuedAt));
  if (h.grossSquareFeet !== null) add("record:gross-area", next, "Gross Area", "", `${wholeNumber(h.grossSquareFeet)} SF`);
  if (h.unitCount !== null) add("record:units", next, "Units", "", wholeNumber(h.unitCount));
  add("record:validity", next, "Figures Valid", r.validityDays ? `${r.validityDays} days from issue` : "Not Set");
  add("record:project", next, "Project", page.projectName);
  add("record:version", next, "Version", `Version ${r.version}`);
  add("record:prepared-by", next, "Prepared By", `Prepared by ${r.preparedBy}`);

  // The budget as a whole.
  elements.set(GENERAL_COMMENT_ID, { id: GENERAL_COMMENT_ID, kind: "page", section: null, label: "This Budget", text: "", figure: null });
  return elements;
}
