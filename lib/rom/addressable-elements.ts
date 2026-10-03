import { longDate, usd, wholeNumber, type BudgetPage, type Fact } from "@/lib/rom/presentation";

// LA-1488. The elements of a client budget page a reader can comment on, read
// off the same model the page renders from. The comment routes use it to check
// that an `element_id` exists on the version the reader is on, and to freeze the
// anchor (the label, text and figure the reader saw) beside the comment.
//
// The set is the page's own `data-el` ids and nothing else:
//
//   - A `data-el-ref` is a pointer to an id that is already here, so it adds none.
//   - `division:<d>` names a group the By Division view builds in the model but
//     the page does not render yet. It joins when LA-1479's build renders it.
//   - The drill-down kinds (`assumption`, `inclusion`, `exclusion`, `confidence`,
//     `raise`, `ve`) join when LA-1479's build gives the model their keys.
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

  // What You Told Us.
  if (r.coverSentence) add("record:cover", "the-project", "Cover Sentence", r.coverSentence);
  if (h.grossSquareFeet !== null) add("fact:grossSquareFeet:figure", "the-project", "Gross Area", "", `${wholeNumber(h.grossSquareFeet)} SF`);
  page.project.facts.forEach((f: Fact) => add(f.el, "the-project", f.label, f.basisWords, f.value));

  // The Ledger: a scope row, the lines inside it, and the foot.
  const noRate = "No Rate Yet. Outside the total.";
  for (const row of page.ledger) {
    const sc = row.scope;
    if (sc.kind === "unpriced") add(sc.el, "where-the-money-is", sc.label, noRate);
    else if (sc.kind === "line") add(sc.el, "where-the-money-is", sc.label, sc.lines[0].basis, usd(sc.likely));
    else {
      add(sc.el, "where-the-money-is", sc.label, `${sc.lines.length} priced. Together between ${usd(sc.low)} and ${usd(sc.high)}.`, usd(sc.likely));
      sc.lines.forEach((l) => add(l.el, "where-the-money-is", l.label, l.basis, usd(l.likely)));
      sc.unpriced.forEach((u) => add(u.el, "where-the-money-is", u.label, noRate));
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
      add("total:kulka-contract:low", "from-trades-to-total", "Kulka Contract, Low", "", usd(w.low));
      add("total:kulka-contract:high", "from-trades-to-total", "Kulka Contract, High", "", usd(w.high));
    } else {
      add(w.el, "from-trades-to-total", w.label, w.basis, w.tbd ? "TBD" : usd(w.likely));
    }
    w.plan.forEach((p) => add(p.el, "from-trades-to-total", p.label, "", usd(p.amount)));
  }

  // What Is In, and What Is Not: the gates, the notes and the parameters.
  const g = page.gates;
  for (const row of [...g.answeredYes, ...g.assumedPresent, ...g.notInThisJob, ...g.waiting]) {
    add(row.el, "what-is-in", row.label, row.decidedBy.map((d) => `${d.question ?? d.gate}: ${d.answer}`).join(" · "));
  }
  page.notes.forEach((n) => add(n.el, "what-is-in", `Note ${n.number}`, n.text));
  page.parameters.forEach((p) => add(p.el, "what-is-in", p.label, `Set by ${p.recordedBy}, ${p.recordedAt}`, p.value));

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
