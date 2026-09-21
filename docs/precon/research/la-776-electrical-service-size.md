# Electrical service size from NEC tables (LA-776)

**Superseded by the real ticket, read 2026-09-21.** This research was written while
Linear was unreachable, inferred from the title and sibling pattern rather than LA-776's
actual body. The real ticket already decided to use Jev, as a bounded propose-and-correct
reasoning step (shown arithmetic, low confidence, estimator corrects), scoped down to
just service size on purpose, not a full panel takeoff and not a lookup-replacement
question. This document's underlying code facts (NEC 220 unit-area method, etc.) are
still useful background; its "Jev isn't needed" conclusion is not current guidance. See
LA-776 in Linear for the real scope.

Researched 20 September 2026. Every claim below carries the source it came from: TypeSafe's
own live docs, or a National Electrical Code reference. This is research and a design
recommendation. No application code changed.

## Scope note before anything else

LA-776's exact ticket body could not be fetched (Linear API outage at the time this research
was queued). The scope below is inferred from the ticket title, "Electrical service size from
NEC tables (Jev)," and from the pattern of its fully-specified sibling LA-771, all seven
opened the same day under parent LA-675. This document's own findings suggest the inferred
scope is close but not exact: see "Is this the right ticket to Jev at all" below. Confirm
against the real ticket body once Linear is reachable again.

## What Jev and TypeSafe actually are

TypeSafe's own skill (`~/.claude/skills/typesafe-ai/SKILL.md`) frames Jev as a "System One
model": it "turns natural language and application state into typed judgments and
probabilities," not a database or a search engine. Its own guidance is explicit about what
belongs in code instead: "Keep known rules, calculations, exact lookups, and execution in
code." That line alone is the first signal that a fixed engineering table is not what Jev is
for.

Reading the live docs confirms this in more detail:

- **Input.** Jev takes a `state` field only, a plain string or structured JSON/array of text
  supplied in the request. Per the current model, it "accepts text input only. It evaluates
  strings, JSON objects, and arrays of text." Images and other media are not yet supported.
  ([docs.typesafe.ai/concepts/system-one.md](https://docs.typesafe.ai/concepts/system-one.md))
- **Output.** Three typed primitives: Choice (pick one of a defined set), Score (a
  probability-weighted position on an ordered rubric), and Noul (probability that a yes/no
  proposition is true). Noul in particular: "A Noul question asks the TypeSafe model to
  evaluate a yes/no question and return the probability that the answer is yes."
  ([docs.typesafe.ai/primitives/noul.md](https://docs.typesafe.ai/primitives/noul.md))
- **What it cannot do.** The API reference is direct on this point: the evaluation endpoint
  "operates exclusively on provided data. It cannot browse the web or query databases. It
  performs structured reasoning and judgment solely on the state submitted in each request."
  ([docs.typesafe.ai/api.md](https://docs.typesafe.ai/api.md))
- **Confidence.** Every answer carries a probability distribution and a derived confidence
  score, with the docs' own framing: "If an intelligent system, whether human or machine,
  cannot express honest uncertainty, the system cannot be trusted." The recommended pattern is
  tiered thresholds (act automatically above roughly 0.9, confirm or flag in the middle band,
  route to a person below roughly 0.5), stated per action rather than as one global cutoff.
  ([docs.typesafe.ai/confidence.md](https://docs.typesafe.ai/confidence.md))

So Jev is a judgment layer over facts you already hold, or already fetched, in the request.
It has no jurisdiction database, no code-text corpus, and no live lookup capability of its
own. Anywhere this repo's own vocabulary says "Jev looks it up," what actually has to happen
is: something else (a search, a scrape, a maintained dataset, a person) retrieves the fact,
and Jev is only useful if there's a genuinely ambiguous piece of text to interpret once that
fact is in hand.

## Is this the right ticket to send to Jev at all

Short answer: mostly no. Electrical service amperage from unit count, unit mix, and equipment
load is a fixed, code-published calculation, not a judgment call.

NEC Article 220 (NFPA 70) sets out the standard and optional methods for feeder and service
load calculations. For multifamily specifically, the optional method at 220.84 is the
relevant one: general lighting/receptacle load at 3 VA per square foot, plus the nameplate
load of fastened-in-place and permanently connected appliances, run through the demand
factors published in Table 220.84, then added to house loads calculated separately under
Part III. It applies only when every dwelling unit has electric cooking and electric heat
and/or air conditioning, and is fed by a single feeder; outside those conditions the standard
method in Part II applies instead.
([EC&M, Multifamily Dwelling Unit Service and Feeder Calculations](https://www.ecmweb.com/national-electrical-code/code-basics/article/20891826/multifamily-dwelling-unit-service-and-feeder-calculations);
[Free NEC 220.84 Multifamily Load Calculator, walking through the same steps](https://www.calculatorsconversion.com/en/free-nec-220-84-multifamily-load-calculator-step-by-step-feeder-service-workflow/))

That is a formula and a table, not a semantic judgment. Given unit count, unit mix, floor
area, and which fastened-in-place equipment exists (electric cooking, electric heat/AC, and
so on), the amperage is deterministic. This is exactly the class of thing TypeSafe's own
guidance says to keep in code: "known rules, calculations, exact lookups, and execution."
The ROM engine should implement NEC 220 (in practice, 220.84 for multifamily, falling back to
the Part II standard method when a unit isn't fully electric) as a deterministic function,
the same way the rest of the engine's math already lives in code rather than in a prompt
(`CONTEXT.md`'s own definition of "Engine": "The deterministic code that turns answers and
database values into a ROM. Math lives here, never in a prompt.").

Where jurisdiction actually enters is narrower than the ticket title suggests: which NEC
edition a given municipality has adopted, and what local amendments it layers on top. The
NEC is republished every three years, and adoption is not uniform: "Each state, county, or
municipality decides independently whether to adopt the code, which edition to use, and what
local amendments to layer on top," and jurisdictions "may regularly omit or modify some
sections, or add their own requirements." New York in particular is one of the states that
"leave adoption to local jurisdictions" rather than adopting statewide.
([National Electrical Authority, NEC Adoption Status by State](https://nationalelectricalauthority.com/nec-adoption-by-state/);
see also [NEMA's adoption guidance PDF](https://www.nema.org/docs/default-source/technical-document-library/adoption-of-the-national-electrical-code-by-state-or-local-jurisdiction.pdf))
Since Kulka's work is concentrated in Nassau and Suffolk counties (per
`docs/precon/cost-index-research.md`), and New York leaves NEC adoption to local AHJs, the
edition/amendment question is real and does vary town to town. That is the part of this
ticket that is genuinely a jurisdiction fact, not an engineering calculation.

But per the primary docs above, Jev is not the tool for that lookup either, because it cannot
browse or query anything; it can only judge state already handed to it. The actual jurisdiction
lookup (which edition a given AHJ enforces, what it amended) needs the same retrieval
mechanism LA-771 is already scoped to build for other jurisdiction facts (EV-ready
percentages, solar-ready-zone applicability; see `docs/precon/canonical-work-items.md` around
items 31d and 31e, both of which explicitly defer to LA-771 for the same reason). Jev would
only enter the picture on top of that retrieval, if an amendment's text is ambiguous enough to
need semantic interpretation before code can act on it, which is a much smaller and later
problem than "resolve service amperage."

## What this means concretely for LA-776

1. **Compute service amperage in the engine, deterministically**, from unit count, unit mix,
   floor area, and equipment load facts (electric cooking yes/no, electric heat/AC yes/no,
   and any other fastened-in-place equipment) using NEC 220 (220.84 optional method for
   qualifying multifamily, Part II standard method otherwise). These facts are largely ones
   the ROM already captures or gates on: the existing HVAC system type gate, the gas building
   gate, and unit mix/count already discussed in `docs/precon/rom-spec.md`.
2. **Treat "which NEC edition and amendments apply" as a jurisdiction fact**, resolved the
   same way LA-771 resolves other jurisdiction facts, from the project's address and AHJ. This
   is a retrieval/data problem, not a Jev judgment. If the same lookup infrastructure ends up
   built for LA-771, LA-776 should consume it rather than building a second jurisdiction
   lookup.
3. **Jev's role here, if any, is narrow**: interpreting an ambiguous local amendment's text
   once retrieved (for example, an AHJ's ordinance that doesn't cleanly map to a standard NEC
   demand-factor table), not computing the load or determining the edition. Given how few of
   Kulka's jurisdictions likely have non-standard amendments to service sizing specifically
   (versus, e.g., EV-ready percentages, which are the kind of add-on rule state legislatures
   actually vary), this may not come up often enough to need Jev at all for this ticket.

## Confidence and sourcing for a derived answer

This is decision-relevant scope (it sizes an electrical service, which feeds a real subcontract
value), not a cost benchmark, so it should not carry a benchmark's confidence flag (high,
medium, low driven by comparable count and spread, per `docs/precon/rom-spec.md`'s
"Confidence flag" definition). It is a derived fact, and the ROM should show it the way it
shows other derived facts, not the way it shows a benchmarked cost:

- **Show the arithmetic.** The rom-spec already sets this pattern for duration and GSF-per-unit
  proposals: "The proposal shows its arithmetic and carries a low confidence flag." Service
  amperage should do the same: show unit count, unit mix, equipment inputs, which NEC method
  and edition was applied, and the resulting table lookup, on the face of the ROM, not just
  the final number.
- **Cite the code edition and section used**, the same way a benchmark cites provenance
  (`docs/precon/rom-spec.md`'s "Provenance": "which projects, which export, or whose reviewed
  judgment produced it, and when"). For a code-derived fact the equivalent is: which NEC
  edition, which section (220.84 vs. Part II), and which jurisdiction's amendment record, with
  a retrieval date. If the jurisdiction/edition fact came from a person's stated answer rather
  than a verified lookup, that should be visible too, not folded silently into "derived."
  Stale or unavailable jurisdiction data must not silently default to a wrong edition, the
  same way rom-spec insists "Silence is never read as zero" for TBD branch gates.
  If the edition can't be confirmed for a project's jurisdiction, the amperage line should read
  as unresolved (its own TBD-equivalent) rather than compute off an assumed edition, given the
  jurisdiction volatility documented above.
- **Because deterministic math and a jurisdiction fact are different failure modes, split the
  confidence signal**: the calculation itself (given the inputs) is exact, not probabilistic,
  once the edition and equipment facts are known. The uncertainty lives entirely in whether
  the equipment facts and the jurisdiction's adopted edition/amendment are correct or current,
  not in the arithmetic. Flagging the whole line "low confidence" the way a thin-data benchmark
  is flagged would misstate where the real risk sits, and would collide with the confidence
  flag definition already reserved for benchmarks.

## Does this generalize to other trades' table-lookup gates

Yes, and the fire alarm notification gate in `docs/precon/rom-spec.md` already names the same
pattern for a different code trigger: "Usually a building-height code trigger, so this may be
derivable from stories rather than asked outright, the same way elevator stops derive from
stories." Any gate whose answer is a fixed function of code-published tables and captured
project facts (stories, occupancy type, unit count, equipment) belongs in the deterministic
engine, the same as service amperage. Elevator stops (LA-784) is the model already cited in
this repo's own docs for exactly this shape.

The dividing line to apply case by case, going forward:

- **Deterministic table/formula, known inputs already captured or capturable as a fact**: put
  it in the engine, no Jev. Service amperage (this ticket) and, per rom-spec's own hint, fire
  alarm notification type by building height are both plausibly this shape.
- **Genuinely jurisdiction-variable, no formula resolves it from project facts alone**: this is
  LA-771's lane (EV-ready percentage, solar-ready-zone reach, emergency responder radio
  coverage, fire alarm notification triggers that actually vary by AHJ amendment). The lookup
  itself is a retrieval/data problem; Jev is not fetching it and its own docs say so plainly.
- **Ambiguous text once retrieved**: this is the only place Jev's actual strength (a Noul or
  Choice judgment over supplied state) fits in this family of gates, and it is a small,
  late-stage layer on top of retrieval, not the retrieval itself.

Most of these seven sibling tickets are worth re-checking against this same split before any
of them get built: the title "from NEC tables (Jev)" pattern, if it repeats across siblings,
may be steering more of them toward Jev than the actual mechanism (a published table) calls
for.

## Open questions for Matt

1. Does the real LA-776 ticket body (once Linear is reachable) actually ask for a jurisdiction
   lookup of NEC edition/amendment, or does it ask for the load calculation itself to be
   "Jev'd"? The title alone reads as the latter, which this research says is the wrong shape.
2. Should the deterministic NEC 220 calculation for service amperage become its own canonical
   work item / engine function now, ahead of the jurisdiction-edition lookup, since it does not
   depend on LA-771's retrieval work being done first?
3. Are there any known Nassau/Suffolk AHJs with electrical amendments that actually change
   service sizing (as opposed to adoption lag on which edition is enforced)? If none are known,
   the jurisdiction piece of this ticket may be low priority relative to the deterministic
   calculation itself.
4. Do the other six sibling tickets (LA-774, 775, 777, 781, 784, and the fully-specified
   LA-771) need the same "is this actually a Jev job" check applied before they're built? This
   research only covers LA-776.
