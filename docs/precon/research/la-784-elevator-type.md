# LA-784: elevator type, hydraulic vs traction

**Superseded by the real ticket, read 2026-09-21.** This research was written while
Linear was unreachable, inferred from the title and sibling pattern rather than LA-784's
actual body. The real ticket already decided to use Jev, as a bounded propose-and-correct
reasoning step (shown arithmetic, low confidence, estimator corrects) deriving elevator
type from Stories Above Grade, not a lookup-replacement question. This document's
underlying code fact (the hydraulic/traction FPM threshold) is still useful background.
Separately: this document's West Shore Road "rate mislabeled as outlier" observation was
already resolved by Matt in `canonical-work-items.md` item 26 before this research ran
(same conclusion, technology difference not a rate error), so it wasn't new information.
See LA-784 in Linear for the real scope.

Researched 2026-09-20. Scope note up front: LA-784's own ticket body could not be
fetched (Linear API outage while this research was queued). The scope below is
inferred from the ticket title, the LA-771 sibling template, and two mentions of
LA-784 already in this repo (`docs/precon/canonical-work-items.md`, quoted below),
which independently confirm the inferred framing. See "Ticket scope check" at the
end for the flag on this.

## Answer up front: Jev is not needed for the core split

Hydraulic versus traction is decided by one number Kulka already asks for: building
height, expressed as stories or total travel distance. That is not a jurisdiction
fact. It is a fixed engineering ceiling on what a hydraulic system can lift, the same
kind of fact the ROM already uses to derive elevator stop count from stories
(`docs/precon/rom-spec.md:136-138`, `docs/precon/rom-spec.md:154-164`). No code
lookup, no address, no AHJ involved.

TypeSafe's own documentation for Jev backs this up directly, independent of anything
Kulka-specific:

- "Use code when you can. It is reliable and cheap. Avoid agent `while` loops when a
  software workflow can express the same behavior."
  ([docs.typesafe.ai/concepts/how-to-build-with-system-one](https://docs.typesafe.ai/concepts/how-to-build-with-system-one))
- "When information is already known or directly derivable from existing data,
  deterministic approaches are more appropriate. System One is for fuzzy
  jurisdictional questions and nuanced interpretation, not straightforward lookups."
  ([docs.typesafe.ai/concepts/system-one](https://docs.typesafe.ai/concepts/system-one))
- Jev's three answer shapes are one-of-N choice (up to 255 options), a 2-to-10 level
  scale, and a yes/no probability, all meant for judgment calls where the input is
  unstructured text or state and the right answer is genuinely uncertain
  ([docs.typesafe.ai/primitives](https://docs.typesafe.ai/primitives),
  [typesafe.ai/blog/introducing-system-one-models-and-jev](https://typesafe.ai/blog/introducing-system-one-models-and-jev)).
  Elevator type from a travel-distance threshold has no uncertainty to calibrate;
  it is a lookup against a fixed number.

I checked TypeSafe's public cookbook index for anything resembling a
jurisdiction-lookup or code-compliance pattern
([docs.typesafe.ai/patterns](https://docs.typesafe.ai/patterns),
[docs.typesafe.ai/cookbooks/parallel_questions](https://docs.typesafe.ai/cookbooks/parallel_questions),
cross-referenced against the community index at
[github.com/AbdelStark/awesome-typesafe](https://github.com/AbdelStark/awesome-typesafe)).
None exists. The documented patterns are confidence-gated routing, composite
scoring, speculative fan-out, intent routing, reranking, semantic search,
guardrails, extraction, and classification, none of which match "look up a fact
about a specific municipality." That is consistent with `GLOSSARY.md`'s own
definition of code lookup as Jev's job when a fact "turns on a code requirement
specific to the project's municipality and authority having jurisdiction" rather
than one "the tool can derive from another captured field" (`GLOSSARY.md:31-38`).
Elevator type is squarely the second kind.

## The deterministic rule

Travel distance is the driver, not story count directly, though story count is a
usable proxy since Kulka's floor-to-floor heights sit in a narrow band for
multifamily. Thresholds, from multiple industry sources (ASME A17.1 governs the
mechanical code itself but does not publish a bare "hydraulic caps at X feet" line
in its public abstract; the figure below is the consistent practical number cited
by mechanical and architectural references that interpret A17.1 alongside
manufacturer product limits):

- Conventional hydraulic: about 60 feet of travel, roughly 4 to 6 stories
  ([archtoolbox.com/elevator-types](https://www.archtoolbox.com/elevator-types/)).
  Hole-less telescoping hydraulic tops out lower, around 50 feet, and non-telescoping
  hole-less around 20 feet, but Kulka's own data (JF, V64: "Hydraulic Elevator 6-Stop
  100 FPM," `docs/precon/canonical-work-items.md:2026-2027`) already sits at the
  conventional 60-foot class, so that is the number to encode.
- Machine-room-less (MRL) traction: up to about 250 feet of travel, speeds to 500
  FPM, no dedicated machine room since equipment lives in the hoistway
  ([archtoolbox.com/elevator-types](https://www.archtoolbox.com/elevator-types/)).
- Geared traction: up to about 250 feet.
- Gearless traction: up to roughly 2,000 feet, the only option for true high-rise
  ([archtoolbox.com/elevator-types](https://www.archtoolbox.com/elevator-types/)).

Kulka's multifamily work (per `docs/precon/rom-spec.md`, garden-style and mid-rise,
mostly under 6-7 stories per the sprinkler/standpipe thresholds already coded
elsewhere in `canonical-work-items.md:2149`, `:2178`) will rarely if ever reach the
traction-mandatory zone on true high-rise product; the live decision in practice is
almost always hydraulic (at or under ~60 ft / 5-6 stories) versus MRL traction
(the practical default above that line for anything under ~20 stories). Gearless
traction is a high-rise case outside Kulka's current product mix and can stay a
manual override rather than a branch in the rule.

Proposed rule, expressed on travel distance (or stories as a proxy, using Kulka's
own already-derived floor-to-floor convention):

- Travel distance (or stories) at or under the hydraulic ceiling: hydraulic.
- Above it, up to the MRL ceiling (~250 ft): machine-room-less traction.
- Above that: conventional geared or gearless traction (manual/estimator call,
  since Kulka has no data at this height today).

This is a derived field, the same shape as elevator stops from stories
(`docs/precon/rom-spec.md:136-138`) and standpipe from stories
(`docs/precon/canonical-work-items.md:2178`). It needs no new question on the
intake. It does need the threshold value and the machine-room-vs-hoistway cost
consequence wired into the elevator canonical item, which `canonical-work-items.md`
already flags as unresolved: "a traction elevator (LA-784) needs a penthouse machine
room instead of a small ground-level one, a real construction cost on items 2, 8,
and 13 that none of them currently name as its own line"
(`docs/precon/canonical-work-items.md:2072-2074`). MRL removes even the small
ground-level room, so the three-way split (hydraulic ground room, MRL no room,
traction penthouse room) carries three different costs on those items, not two.

## Jurisdiction-specific angle: none found for type selection itself

I looked specifically for a code-driven reason a jurisdiction would force traction
over hydraulic (or vice versa) independent of travel distance, the same shape as the
two gates in `rom-spec.md` that genuinely are AHJ lookups (emergency responder radio
coverage, fire alarm notification type). I did not find one:

- NYC Building Code Chapter 30 (Elevators and Conveying Systems), as codified at
  [up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/30](https://up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/30/elevators-and-conveying-systems),
  amended by Local Law 77 of 2023, governs elevator lobbies, required elevators per
  occupancy, and seismic support of mechanical systems, but nothing found there ties
  the hydraulic-vs-traction choice to the AHJ; that choice stays a travel-distance
  and product-availability question.
- NYC previously had a standalone Machine-Room-Less Elevators rule (1 RCNY §103-08 /
  §3610-02), now repealed and folded into Appendix K of the Building Code
  ([codelibrary.amlegal.com/codes/newyorkcity/latest/NYCrules/0-0-0-3187](https://codelibrary.amlegal.com/codes/newyorkcity/latest/NYCrules/0-0-0-3187)).
  That is a code-organization change (where MRL rules live in the code), not a
  jurisdiction-specific restriction on which elevator type is allowed.
- Seismic design (NYC Building Code §301.18 and parallel IBC/ASCE 7 provisions)
  governs how an elevator's supports, rails, and machine mounts are braced for
  earthquake loads. It changes engineering detail and cost within whichever type is
  chosen; it is not documented anywhere I found as a reason to choose hydraulic over
  traction or the reverse. Long Island is low seismic hazard, so this is unlikely to
  matter for Kulka's own jobs regardless.

If Matt or the trade knows of a real municipality that restricts elevator type
directly (for example, a fire department that will not permit a piston bored into
soil beneath a slab on a site with contamination concerns, or a hoistway pressurization
rule that only some AHJs enforce), that would be worth naming explicitly, because it
would move part of this gate back into "needs a lookup" territory. Nothing in the
public code record surfaced that; this section should be treated as "not found," not
"confirmed absent."

## Confidence and sourcing recommendation

This is decision-relevant scope (it changes what gets bid and built), not a cost
benchmark, so per `rom-spec.md`'s confidence-flag convention it should carry a
confidence flag like any other derived field, but it does not need the same
AI-sourcing distinction the fire/life-safety gates need. Those gates
(fire alarm notification, emergency responder radio coverage) need a citation back
to a specific code section because the answer depends on an AHJ's discretionary
amendment that could be wrong or could change; getting it wrong means the ROM
priced against a code requirement that does not actually apply. Elevator type from
travel distance is a fixed engineering fact, not a lookup that can be stale or
mis-jurisdictioned. Recommended treatment:

- Show the derived answer on the ROM face the way elevator stops already show,
  stating the driver ("6 stories, 60 ft travel: hydraulic") so the estimator can
  see and override the arithmetic, same pattern as the duration and GSF-per-unit
  proposals in `rom-spec.md`.
  High confidence by default, since it is a fixed rule, not a probabilistic call.
- The MRL-vs-conventional-traction split above the hydraulic line is worth a
  slightly lower confidence flag than the hydraulic/traction split itself, since
  Kulka has no closed-job data above roughly 6 stories yet (per the trade-cost
  review in `canonical-work-items.md`) and the boundary between MRL and full
  traction has more product-choice variability (contractor and manufacturer
  preference) than the hydraulic ceiling does.
- No jurisdiction citation is needed on the ROM face for this gate, unlike fire
  alarm notification or emergency responder radio coverage, because there is no
  jurisdiction dependency to disclose.

## Does this generalize to other trades' "derivable" gates?

Yes, and `rom-spec.md` already names the pattern twice on its own before this
ticket existed: elevator stops from stories (`rom-spec.md:136-138`) and, in the same
sentence, fire alarm notification flagged as "usually a building-height code
trigger... worth checking before it becomes a real question." The same question is
worth asking of every gate currently filed under Jev/code-lookup before the Jev
build (LA-invoked, not yet built per `rom-spec.md:161-163`) gets scoped: is the
deciding fact really jurisdiction-specific, or is it a fact, like height, unit count,
or levels below grade, that the ROM already captures or derives, wearing a code
citation as its justification rather than its actual dependency. Standpipe system
(`canonical-work-items.md:2178`) and stair pressurization
(`canonical-work-items.md:2404`) are both flagged in this repo as "conditional on
building height," the same shape as elevator type. A short pass through the other
LA-771/774/775/776/777/781 siblings with the same question (does the deciding fact
already live in captured project data, yes/no) would likely close several of them
the same way this one closes, before any of them justify building the Jev
integration at all.

## Open questions for Matt

1. Does Kulka's own data ever cross into MRL-vs-conventional-traction territory (7+
   stories), or is hydraulic-vs-MRL the only split that matters for the current
   multifamily product line? This changes whether the third tier of the rule needs
   building now or can wait.
2. Is there a real jurisdiction case (a specific town, fire marshal, or site
   condition) that restricts elevator type independent of height, the kind of
   thing that would turn this back into a genuine code-lookup gate for a subset of
   jobs? Nothing in the public code record surfaced one; this needs the trade's own
   knowledge to close out, same as the gas-building and PTAC-prevalence gates in
   `rom-spec.md`.
3. Should the machine-room cost consequence (ground-level for hydraulic, none for
   MRL, penthouse for traction) get its own canonical item now, or ride inside the
   Elevators item as a driven variant? `canonical-work-items.md` flags this as open
   against items 2, 8, and 13.
4. Confirm the real LA-784 scope once Linear is reachable again. Everything above
   assumes the ticket is "derive elevator type from travel distance/stories,"
   which two independent mentions already in this repo's own research doc support
   (see next section), but the ticket's own acceptance criteria, if it specifies
   something narrower or broader (for example, if it also wants the machine-room
   cost item built, not just the type derivation), should supersede this document.

## Ticket scope check

Before this research started, LA-784's scope was inferred only from its title and
the LA-771 sibling pattern. Two references to LA-784 already exist in this repo,
written by Matt on 2026-09-20 during the LA-720 trade review, and they independently
confirm the inferred framing rather than contradicting it:

> "West Shore's higher number most likely reflects a different elevator type
> entirely, not the same product priced differently. See LA-784, opened to derive
> elevator type from building height."
> (`docs/precon/canonical-work-items.md:2054-2055`)

> "a traction elevator (LA-784) needs a penthouse machine room instead of a small
> ground-level one, a real construction cost on items 2, 8, and 13 that none of
> them currently name as its own line"
> (`docs/precon/canonical-work-items.md:2072-2074`)

Both call it a derivation problem tied to building height, not a jurisdiction
lookup. No evidence found that the real ticket scope differs from what this
document assumes. The one gap: the second quote suggests the ticket, or a
follow-on, may also expect the machine-room cost consequence to be worked out, not
just the type flag. That is noted as open question 3 above rather than assumed
in scope here, since the ticket title names only "elevator type."
