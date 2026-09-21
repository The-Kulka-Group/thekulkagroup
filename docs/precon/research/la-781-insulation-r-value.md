# LA-781: Insulation R-value/type from climate zone (Jev)

Research memo. No code was written or changed for this ticket. This is a design
recommendation only.

## Scope caveat

LA-781's own ticket body could not be fetched: the Linear MCP connection in this
session was unauthenticated, and the earlier outage noted in the ticket brief was
still not resolved when this research ran. Everything below is built from the
ticket title, the sibling-ticket pattern (LA-771/774/775/776/777/784, all created
2026-09-20 under parent LA-675), and this repo's own definitions in `CONTEXT.md`
and `docs/precon/rom-spec.md`. If the real ticket asks for something narrower or
broader than "does climate zone determine required R-value/type, and does Jev need
to be involved," that should be checked against the actual ticket text before this
memo is treated as final. Flagged again in the Linear comment draft.

## Is Jev needed here? No, not for this specific gate.

The chain this gate needs is two deterministic lookups, both of which are public
and static:

1. **Address or county to ASHRAE/IECC climate zone.** The IECC pulls its climate
   zone assignments directly from ANSI/ASHRAE Standard 169 and publishes the
   result as a county-by-county table in IECC Section C301.1 (commercial) /
   R301.1 (residential). Every US county has a fixed zone assignment in that
   table; it does not change per project, only per code edition (the zone map
   was last rebuilt for the 2021 IECC using ~25 years of data from over 4,000
   weather stations). Source: [2021 IECC Chapter 3](https://codes.iccsafe.org/content/IECC2021P1/chapter-4-re-residential-energy-efficiency)
   and [ASHRAE Standard 169-2020](https://www.ashrae.org/file%20library/technical%20resources/standards%20and%20guidelines/standards%20addenda/169_2020_a_20211029.pdf).
2. **Climate zone to required R-value/type.** IECC Table R402.1.2 (residential)
   and the parallel Table C402.1.3 (commercial) give the minimum ceiling, wall,
   floor, and fenestration values for each of the eight zones directly, as a
   flat table with no judgment call in it. Source: [2021 IECC Table R402.1.2](https://codes.iccsafe.org/content/IECC2021P1/chapter-4-re-residential-energy-efficiency),
   summarized at [Building America Solution Center](https://basc.pnnl.gov/information/2009-2021-iecc-and-irc-minimum-insulation-requirements-new-homes).

Both steps are table lookups against public reference data, not natural-language
understanding, classification, or a probabilistic judgment. That matters because
it is also what TypeSafe's own documentation says Jev is not for. Its concept
docs describe System One as built for "semantic decisions and language
understanding," with the explicit design split that "code owns control flow" and
model calls happen only where a decision needs judgment
([System One](https://docs.typesafe.ai/concepts/system-one.md)). The build guide
is more direct: "Work backward to the judgments it needs. Keep known rules,
calculations, exact lookups, and execution in code"
([how to build with System One](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md)).
A climate-zone-to-R-value table is exactly the "exact lookup" case that guidance
tells you to keep in code. There is also no cookbook or pattern on TypeSafe's own
docs index for jurisdiction, address, or code-compliance lookups of this kind;
the closest sibling pattern in this repo (LA-774, fire sprinkler hazard
classification) uses Jev to reason through an engineering judgment call
internally, never to state a plain code citation outright, which is a different
shape of problem than this one.

**Recommendation: do not route this gate through Jev or TypeSafe at all.** It
should be two small static lookup tables shipped in the ROM engine.

## What Jev/TypeSafe could add, if anything

The one place a lookup-only approach gets genuinely harder is not the R-value
table, it is **which code edition and which local amendments actually apply in
the project's jurisdiction.** Climate zone assignment is stable and near-universal
(states rarely override ASHRAE 169 zone boundaries), but the base code edition a
jurisdiction enforces, and whether it has layered stricter local amendments on
top, varies by state and lags the national three-year IECC cycle:

- DOE's Building Energy Codes Program tracks state-by-state adoption status
  against IECC/ASHRAE 90.1 editions precisely because it varies; states are
  scored by an energy-index equivalence method, not a simple "adopted this
  edition" flag, and states must recertify against each new national edition
  (2024 IECC certifications are due by December 30, 2026). Source:
  [energycodes.gov/status](https://www.energycodes.gov/status).
- New York is a concrete, relevant example given Kulka's Long Island project
  base: the 2020 Energy Conservation Construction Code of New York State is
  based on the **2018** IECC, not the current edition, and New York City runs
  its own NYC Energy Conservation Code layered with stricter local amendments
  on top of the state base code. Some municipalities separately opt into
  NYStretch, a further ~10-12% tightening. Sources:
  [NYSECC 2020, ICC Digital Codes](https://codes.iccsafe.org/content/NYSECC2020P1),
  [2020 NYCECC preface](https://codes.iccsafe.org/content/NYCECC2020P1/preface),
  [NYS Energy Code vs. NYCECC vs. NYStretch, MeltPlan](https://www.meltplan.com/blogs/nys-energy-code-vs-nycecc-vs-nystretch-a-compliance-guide).

So the real variable is "which of {state base edition, city amendment, optional
stretch code} governs at this address," not "what R-value does zone 4A require."
That is still closer to a reference-table problem (state adoption tables, a
short list of NY municipalities on NYStretch) than to a natural-language
judgment call, and DOE and NY State already publish the tables needed to encode
it directly. Where it could tip into something Jev is actually built for is if a
specific municipality's adoption is only documented as unstructured text (a
local code amendment PDF, a town resolution) that has to be interpreted rather
than looked up in a maintained table. That is speculative for LA-781
specifically and not confirmed by anything read for this memo; it is closer to
the shape of LA-774's fire-hazard reasoning than to a table lookup. Flagged as
an open question below rather than a finding.

## Recommended direct-lookup-table alternative

Two static tables, versioned by IECC edition, embedded in the ROM engine, no
external call:

1. **County to climate zone**, keyed by state + county, sourced from IECC
   C301.1/R301.1 (itself sourced from ASHRAE 169). Re-derived only when the ROM
   engine adopts a new IECC edition, which per the CONTEXT.md/rom-spec pattern
   for other code-driven gates would be a deliberate, reviewed update, not a
   live lookup.
2. **Climate zone + edition to R-value/type**, sourced from Table R402.1.2 /
   C402.1.3 for whichever IECC edition the engine targets.

A per-project override field for the known jurisdiction exceptions (NYC's local
amendments, NYStretch adopters) is the honest way to cover the edition/amendment
gap above without pretending the table lookup already resolves it. That override
can start as a short hardcoded list (Kulka's actual project geography is
concentrated on Long Island per `rom-spec.md`) and only needs a real lookup
service if and when Kulka starts pricing outside that footprint.

## Confidence and sourcing recommendation

`rom-spec.md`'s existing pattern separates two different kinds of gate answer:
a fact the estimator states outright, a fact the tool derives from another
captured field (e.g., elevator stops from stories), and a fact the tool looks up
from code (Jev, for fire alarm notification type and emergency responder radio
coverage today). Insulation R-value/type is the derived-and-looked-up case, but
unlike the fire/life-safety gates it is not a probabilistic judgment call. It is
a direct code citation: zone 4A, 2021 IECC Table R402.1.2, R-value X. TypeSafe's
own guidance on this distinction: Choice/Noul/Score confidence "summarizes
distribution concentration, not overall workflow correctness," and its
risk-scaled-threshold guidance says different actions should be gated at
different confidence levels depending on the cost of being wrong
([confidence](https://docs.typesafe.ai/confidence.md)). There is no distribution
to summarize here, since a table lookup has one right answer given a correct
address, so the ROM should show this line as a **derived fact with a citation**
(climate zone, IECC edition, and table/section number), not as an LLM-proposed
value carrying a low-confidence flag the way this repo flags LLM-proposed
benchmarks elsewhere (`rom-spec.md`'s HVAC system type gate, for example, stays
low confidence because it is genuinely unresolved by any file in the dataset).
The one thing that should carry a flag is the jurisdiction/edition override
above: if the project's address falls inside a known local-amendment
jurisdiction and the estimator has not confirmed it, that is worth a visible
note, separate from the R-value number itself, since the record in
`rom-spec.md` treats code-triggered scope as something to state as a fact once
derivable rather than something to hedge indefinitely.

This is lower stakes than the fire/life-safety gates in the same list
(emergency responder radio coverage, fire alarm notification type), which stay
`asked outright` today specifically because Jev's lookup for them does not exist
yet and getting them wrong has life-safety and licensing consequences per
`CONTEXT.md`'s "Code lookup" definition. Insulation R-value being off by one
zone is a budget-accuracy problem, not a life-safety problem, so it does not
need the same asked-outright fallback or the same AI-sourcing caution; a cited
table lookup with a visible source citation is enough.

## Does this generalize to other trades' climate-zone-driven gates?

Likely yes, for the same reason: any gate whose answer is "look up a public code
table by location" rather than "make a judgment call specific to this project"
is a lookup-table candidate, not a Jev candidate. Candidates worth checking
against the LA-720 container work using the same test applied here (is the
answer a flat table keyed by a public, static input, or does it require
interpreting unstructured local text or an engineering judgment):

- Wind speed / exposure category (ASCE 7, also address-driven, also a published
  map/table).
- Ground snow load (ASCE 7, county/region tables, same pattern as the climate
  zone map).
- Frost depth for footing design (varies by jurisdiction, sometimes published
  as a state or county table, sometimes only as a fixed local-amendment number,
  which is closer to the "unstructured local text" case flagged above and worth
  checking case by case rather than assuming it is always a clean table).
- Seismic design category (ASCE 7 / USGS seismic hazard data, also
  address-driven, though the underlying hazard values there are continuous
  rather than a simple zone table and may be a genuinely different shape of
  problem).

The fire/life-safety gates already in the intake (fire alarm notification,
emergency responder radio coverage) are the opposite case on purpose: their
correct answer depends on a specific municipality's adopted amendment text, not
a public numeric table, which is why `rom-spec.md` names Jev for them
specifically and not for this gate.

## Open questions for Matt

1. Does the real LA-781 ticket ask for something beyond "does climate zone
   determine R-value/type, and is Jev needed" (for example, unit-level
   fenestration schedules, continuous-insulation compliance paths, or something
   about R-value trade-offs under the IECC's performance path rather than the
   prescriptive table)? Worth confirming once Linear access is back, since this
   memo only covers the prescriptive-table reading.
2. Which IECC edition should the engine target for v1: 2021, 2024, or NY's own
   2020 NYSECC (itself pinned to 2018 IECC)? This changes both tables and needs
   a decision independent of the Jev question.
3. Is Kulka's project geography narrow enough (Long Island per `rom-spec.md`)
   that a short hardcoded list of local-amendment jurisdictions (NYC, any known
   NYStretch towns) covers the real cases, or does the pipeline already need to
   handle out-of-footprint projects where that list would not be trustworthy?
4. Should the jurisdiction/edition override note (the one non-lookup part of
   this gate) be its own small branch gate in the intake, or a silent
   engine-side flag the estimator only sees if it fires? `rom-spec.md`'s
   pattern leans toward the estimator seeing it, but this ticket did not ask
   that question directly and it is worth confirming rather than assuming.
