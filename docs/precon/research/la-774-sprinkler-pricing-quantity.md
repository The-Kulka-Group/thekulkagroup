# LA-774: internal sprinkler pricing quantity, and whether Jev is the right tool

Researched 2026-09-20. LA-774's own ticket body could not be fetched: Linear was
unavailable during this research session. This document uses the repo's own record of
LA-774's scope, found in `docs/precon/canonical-work-items.md` item 27 (Fire sprinkler
system, Division 21), which is more specific than the title alone suggests. See "Scope
correction" below before reading the rest.

## Scope correction: read this first

The ticket title, "Internal sprinkler pricing quantity (Jev)," and the LA-771 sibling
pattern suggest a general question: can Jev determine the sprinkler system's pricing
quantity from project facts. The repo already answers a narrower and more specific
version of that question. `canonical-work-items.md` item 27 records, dated 2026-09-19
and 2026-09-20:

- The quantity driver for the whole item is settled: gross square feet, an "accepted
  known limitation" as of the Summary's 2026-09-18 resolution. LA-774 does not reopen
  that.
- The real gap: this one item blends five containers (piping and heads, standpipe,
  fire pump, alarm interface work, and related required items) into one flat rate per
  square foot, with no internal split. Matt's finding, recorded 2026-09-19: VA's own
  cost file prices its garage level and its tower level at the same $6.00/SF, but NFPA
  13 hazard classification says a garage should cost more per square foot than a
  residential corridor. That is a real gap in the data, not an unexplained spread.
- The item states its own proposal directly: "See LA-774 for the proposal to have Jev
  reason through hazard classification, standpipe, and fire pump internally to get a
  better pricing quantity than flat square feet, never as an engineered system shown
  to anyone."

So LA-774 is about three specific sub-problems inside the existing GSF-driven item, not
about replacing GSF as the driver or about sprinkler quantity in general:

1. Hazard classification (NFPA 13): does a given space price at Light, Ordinary, or
   Extra Hazard.
2. Standpipe: does the building need one, and what class.
3. Fire pump: does the building need one.

The rest of this document answers the assignment's questions against this corrected
scope. If Matt's actual LA-774 ticket text says something different, that difference
should be reconciled before any of this gets built; the Linear comment at the end flags
this plainly.

## What Jev is

Jev is TypeSafe's first "System One model." System One models are "built to make fast,
structured decisions that software can use directly," and unlike a general chat model
they "do not write replies, produce code, or generate explanations of their reasoning"
([System One](https://docs.typesafe.ai/concepts/system-one.md)). A call gives the model
**state**, which is "the content you ask a System One model to evaluate... a support
message, a passage of text, or the current state of your application," passed in the
`state` field of the request
([State](https://docs.typesafe.ai/concepts/state.md)). The model answers one or more
**questions** posed against that state, each shaped as one of three primitives:

- **Choice**: pick one of a defined set of options, with a full probability
  distribution across the options
  ([Choice](https://docs.typesafe.ai/primitives/choice.md)).
- **Score**: a probability-weighted position on ordered levels.
- **Noul**: probability that a yes/no condition holds, with no separate confidence
  value (per the typesafe-ai skill's primitive summary, matching the primitives
  overview at [docs.typesafe.ai/primitives.md](https://docs.typesafe.ai/primitives.md)).

The important fact for this ticket: **state is supplied entirely by the calling
application. Jev does not fetch external or live data on its own.** The docs are
explicit that the responsibility for assembling relevant facts, text, and context sits
with the caller, not the model
([State](https://docs.typesafe.ai/concepts/state.md)). Jev has no built-in web search,
database, or jurisdiction/code-lookup capability. It also accepts text input only, no
images or drawings.

This matters against this repo's own definition of Jev in `CONTEXT.md`: "Code lookup...
Jev looks it up from the project's address and jurisdiction." Read against the primary
docs, that description is shorthand for an application Kulka would build on top of Jev,
not a capability Jev ships with. Some other component (a real code database, or the
ROM chat surface's existing `web_search` tool, per `docs/precon/rom-spec.md`) would have
to retrieve the jurisdiction-specific code text first; Jev's role would be to turn that
retrieved text, plus the project's facts, into a typed answer. Jev is the judgment
layer, not the lookup itself.

## What Jev can determine here, and how

Applying the Choice primitive to each of LA-774's three sub-problems:

### 1. Hazard classification

NFPA 13 defines hazard classification by the use and contents of a space, not by
jurisdiction: Light Hazard ("low quantity and combustibility of contents"), Ordinary
Hazard Group 1, Ordinary Hazard Group 2 (moderate severity, rising stockpile-height
allowances), and Extra Hazard Group 1/2 (high combustible loading or
flammable-vapor-generating processes)
([NFPA 13 Occupancy Classifications for Fire Sprinkler Systems, phcppros](https://www.phcppros.com/articles/21011-nfpa-13-occupancy-classifications-for-fire-sprinkler-systems);
category list confirmed at
[Occupancy Classifications in NFPA 13, nfpa.org](https://www.nfpa.org/news-blogs-and-articles/blogs/2025/01/14/occupancy-classifications-in-nfpa-13)).
This is a national engineering standard, not an AHJ amendment: it does not vary by
municipality the way emergency responder radio coverage or fire alarm notification
type do (per `docs/precon/rom-spec.md`'s own framing of what makes those two gates a
Jev problem).

That has a direct consequence: if Kulka's intake already captures each space's use as a
clean structured value (garage, residential corridor, mechanical room, storage), hazard
classification is a fixed lookup table, occupancy type to hazard class, and belongs in
the engine as deterministic code. That matches this repo's own stated principle: "Math
lives here, never in a prompt" (`CONTEXT.md`, Engine). No AI call is needed for that
case.

A Choice call only earns its place if the input is not already a clean category, for
example a free-text space description an estimator typed rather than picked from a
list. In that shape, `state` would carry the description, `criteria` would carry the
five hazard-class definitions and examples, and `instructions` would ask which class
the space falls under. That is a well-formed Choice task by TypeSafe's own guidance
("Ask independent questions over the same state together," `Compose and verify`
section, typesafe-ai skill), but it is solving a data-entry/normalization problem, not
a code-jurisdiction lookup problem.

### 2. Standpipe

`canonical-work-items.md` already calls this "stories-derived," and the primary sources
back that up: standpipes are commonly required at four or more stories above or below
grade, or where the highest occupied floor sits more than 30 feet above the lowest
level of fire department vehicle access, per the International Building Code, which
references NFPA 14 for installation
([When are Standpipes Required?, NFSA](https://nfsa.org/2021/04/26/when-are-standpipes-required/)).
Kulka's ROM already captures story count (see the elevator-stops precedent in
`docs/precon/rom-spec.md`, derived the same way). This needs no AI call of any kind,
Jev or otherwise: it is arithmetic on a field the intake already has.

### 3. Fire pump

This is the one sub-problem that does not fit Jev, or any code-lookup tool, cleanly.
Whether a project needs a fire pump turns on comparing the sprinkler system's
hydraulically calculated demand (a function of hazard classification, building area,
and height) against the water supply actually available at the site. "Where demand
exceeds supply at a given flow rate, a fire pump becomes mandatory to make up the
difference"
([NFPA 20: Fire pump design, Consulting-Specifying Engineer](https://www.csemag.com/nfpa-20-fire-pump-design/)).
Available water supply is not a code provision at all; it is site-specific utility
data, ordinarily established by a flow test the fire protection engineer runs, not
something published in a code book or a municipal ordinance that a lookup, AI or
otherwise, could retrieve. Kulka's ROM does not capture flow-test data today and has no
plausible route to it at ROM-intake time, since the ROM runs before that testing
happens. Jev cannot supply this answer because no source, live or cached, holds the
fact yet.

## Is this the right tool for sprinkler quantity?

Mostly no, and the repo's own hazard-classification finding says so once traced through.

- Hazard classification is a straightforward engineering-table lookup (NFPA 13 by
  occupancy type), not a jurisdiction-specific code question. It belongs in the
  deterministic engine. A Jev Choice call is only worth adding on top of that table if
  Kulka's intake stays free-text for space use rather than structured, and even then it
  is solving data normalization, not a "Jev problem" in the sense `CONTEXT.md` defines
  one.
- Standpipe needs no lookup of any kind; it derives from a field the ROM already
  captures.
- Fire pump needs real site data (a water flow test) that does not exist at ROM-intake
  time. No version of Jev, live or cached, resolves this; it stays a fact someone
  states or a gate answered "don't know."

None of the three sub-problems is the AHJ-specific, address-and-jurisdiction kind of
question `CONTEXT.md`'s Jev definition describes (the kind emergency responder radio
coverage or fire alarm notification type are). LA-774, read this way, is not really a
Jev ticket. It is mostly a data-modeling question (does the ROM capture per-space use
at all, so a lookup table has something to key off) and one honest gap (fire pump) that
no lookup tool, AI or code-based, can close without new data Kulka does not have yet.

## Live lookup vs. cached reference table

If any of this gets built, it splits into two different things with two different
answers:

- **The NFPA 13 hazard-class-to-rate table itself** should be a stored, dated,
  versioned reference, matching the pattern this repo already uses for benchmarks: the
  `benchmarks` table in
  `supabase/migrations/20260827120000_rom_schema.sql` carries `provenance_kind`,
  `provenance_recorded_by`, and `provenance_recorded_at date` on every stored value, and
  `docs/precon/cost-index-research.md` treats "vintage" as a first-class concept for any
  external reference number Kulka relies on. NFPA 13's hazard-class definitions change
  only on a new code edition, not per project, so recomputing or re-deriving them live
  on every ROM run buys nothing and adds a failure mode.
- **Applying that table to one project's specific space mix** (how much of this
  project's GSF is garage versus corridor versus mechanical) is inherently per-project,
  the same shape as the GSF-per-unit and duration proposals `docs/precon/rom-spec.md`
  already describes as live, per-run engine output shown on the face of the ROM with
  its arithmetic and a confidence flag. If this gets built, it belongs in that same
  live-per-run category, not the cached table.
- The real blocker to either one: the ROM's intake does not currently capture a
  space-by-space area breakdown at all. Every dollar in item 27 sits in one blended GSF
  number today (`canonical-work-items.md`, "Containers" note on item 27). Building the
  hazard-class table solves nothing until the intake has a garage-vs-corridor split to
  apply it to. That is a data-capture decision, not a Jev decision, and should come
  first.

## Confidence and sourcing recommendation

This is decision-relevant scope, not a cost benchmark: it changes what gets priced, not
just what it costs. That puts it on the high-consequence side of TypeSafe's own
guidance: "different actions within the same system should be gated at different
levels depending on the consequences of getting it wrong," and thresholds should reflect
that a Choice/Score confidence score "summarizes distribution concentration, not overall
workflow correctness or permission to act" (typesafe-ai skill, `Compose and verify`;
[Confidence](https://docs.typesafe.ai/confidence.md)). Concretely, if a hazard-class
Choice call is ever built:

- It should show on the ROM face the same way the GSF-per-unit and duration proposals
  already do: labeled as a derived value, arithmetic or reasoning visible, carrying a
  confidence flag, not presented as a stated fact.
- The repo's `benchmarks` table currently supports only three `provenance_kind` values:
  `actuals`, `proest_budget`, `reviewed_judgment` (`supabase/migrations/20260827120000_rom_schema.sql`).
  None of these cleanly names "a raw AI judgment, not yet reviewed by a person." Using
  `reviewed_judgment` for an unreviewed Jev output would misstate its provenance; this
  needs either a new provenance kind or an explicit rule that an AI-derived hazard class
  is never written to a `benchmarks` row until a person reviews it, same as any other
  judgment promotion under the admin-permission rule already in `rom-spec.md`.
  Structurally this matches the existing distinction in `rom-spec.md`'s data rules,
  where an LLM-proposed figure is "flagged low and weighted below every measured
  value," but that language was written for cost benchmarks, not for a scope-determining
  classification, and item 27's own note is explicit that this must never surface as "an
  engineered system shown to anyone." A hazard class an estimator has not confirmed
  should read as an assumption on the ROM, the same as any other unconfirmed input, not
  as a fact.
- Because hazard classification directly changes a fire-suppression cost, not a
  cosmetic finish choice, this is closer to the high-consequence end of the confidence
  spectrum TypeSafe describes. Low confidence should route to a person, not silently
  price the item at whatever class scored highest.

## Open questions for Matt

1. Does LA-774's actual ticket text match the scope this document infers from
   `canonical-work-items.md` item 27 (hazard classification, standpipe, fire pump), or
   does it ask something broader about sprinkler quantity in general? Linear was down
   during this research; this should be confirmed once it is back.
2. Does the ROM intend to ever capture a space-by-space area breakdown (garage versus
   corridor versus mechanical, etc.), or does item 27 stay one blended GSF number
   permanently? Nothing in this ticket is worth building until that is decided, since
   the hazard-class table has nothing to apply itself to otherwise.
3. Should a hazard-classification value ever be treated as a permanent branch gate
   (estimator states it, three-answer gate) instead of a derived value at all, the same
   way HVAC system type and water heating system are estimator-stated facts today per
   `rom-spec.md`, given the fire pump sub-problem shows that at least part of this
   division's scope cannot be derived from anything the ROM captures?
4. If a hazard-class Choice call does get built, what closes the provenance gap noted
   above: a new `provenance_kind`, or a rule that AI output never reaches the
   `benchmarks` table unreviewed?
