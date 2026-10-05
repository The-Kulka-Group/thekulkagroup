# LA-777 research: HVAC tonnage from envelope/ventilation (Jev)

**Superseded by the real ticket, read 2026-09-21.** This research was written while
Linear was unreachable, inferred from the title and sibling pattern rather than LA-777's
actual body. The real ticket already decided to use Jev, as a bounded propose-and-correct
reasoning step (shown arithmetic, low confidence, estimator corrects), with the
unassumable window-area/orientation input flagged as the weakest link on purpose, not a
lookup-replacement question. This document's underlying code facts (code-minimum envelope,
ventilation-rate formula, etc.) are still useful background; its "Jev isn't needed"
conclusion is not current guidance. See LA-777 in Linear for the real scope.

Research only. No application code was written or changed for this ticket.

## Scope note: this ticket's real body was not read

LA-777's own description could not be fetched from Linear (the Linear MCP connection
was unavailable during this research session. This looks like an auth or connection
failure. It is not confirmed to be the same outage noted when the ticket was queued.
Everything below is
built from the ticket title, the LA-771 sibling pattern found in this repo's own docs
(see "What LA-771's sibling pattern actually shows" below), and the task brief's
inferred scope. **If the real LA-777 body asks something narrower or different, that
should override this document.** Flag this gap when posting the Linear comment.

## What Jev is

Jev is TypeSafe AI's "System One" model: a model class that returns typed, calibrated
decisions instead of generated text. It answers one of three question shapes against a
block of state the caller supplies:

- **Choice**: pick one of up to 255 named options.
- **Score**: a position on a 2-to-10-level ordered scale.
- **Noul**: a yes/no probability (0 to 1).

Every answer carries a confidence value, and the documentation frames confidence as a
routing signal, not decoration: "High confidence: act automatically. Medium confidence:
proceed with caution. Low confidence: do not act. Route to a human, request
clarification, or fall back to a different system."
(https://docs.typesafe.ai/confidence)

Sources read directly for this ticket:
- https://docs.typesafe.ai/introduction: what Jev is, inputs and outputs, the three
  question types, and the statement that complex problems should be decomposed into
  separate atomic questions rather than asked as one.
- https://docs.typesafe.ai/concepts/system-one: scope. "System One models are trained
  for calibrated decisions... optimized for fast judgments, not multi-step derivation or
  engineering estimation." Also: "System One models do not write replies, produce code,
  or generate explanations of their reasoning."
- https://docs.typesafe.ai/primitives: the exact call shape. A `state` object (JSON:
  "a conversation, a record, a policy") plus a map of named questions, each with `type`,
  `instructions`, and (for choice/score) `criteria`. Confirms directly: **"The API
  performs no external retrieval or lookups... it evaluates what's supplied by the
  user, with no autonomous database or external data access."**
- https://docs.typesafe.ai/introduction/quickstart: a worked request/response example,
  consistent with the above. Jev judges only the text in `state`; it does not fetch an
  address, a jurisdiction, or any other external fact on its own.
- https://docs.typesafe.ai/patterns: the four documented usage patterns (Speculative
  Fan-Out, Confidence-Gated Routing, Composite Scoring, Intent Routing). None of them is
  a jurisdiction/code lookup pattern, and none combines Jev with an external database or
  a geocoder as a built-in capability.

**This last point matters for how this repo currently talks about Jev.** `GLOSSARY.md`
defines "Code lookup" as: "Jev looks it up from the project's address and jurisdiction."
`rom-spec.md` (line 161-163) says the same: "Jev is the tool for that lookup, given the
project's address and jurisdiction." Read against Jev's own docs, that phrasing
overstates what Jev itself does. Jev has no retrieval step. Something else in the stack
(a code database, a jurisdiction/AHJ resolver, or the ROM's own `web_search` tool per
`rom-spec.md`'s Chat surface section) would have to turn an address into the relevant
code text first; Jev's role is the typed judgment *over* that already-retrieved text,
not the lookup itself. This is a framing correction that applies to every "Jev gate" in
this repo, not just LA-777, but it is worth stating here because it changes what "Jev
can do X" should mean in this ticket's own write-up.

## Is HVAC tonnage a Jev problem at all

No, not primarily, and the task brief's instinct to scrutinize this framing is correct.

HVAC tonnage (cooling and heating capacity) is normally sized with ACCA Manual J
(residential load calculation) and Manual S (equipment selection against that load), or
their commercial analogs, from building envelope data (wall, roof, and window area and
insulation, orientation, infiltration), internal and solar gains, and outdoor air
requirements under ASHRAE 62.1. That is arithmetic run over a set of inputs, not a
classification or a code citation. Two points from the trade press back this up:

- Manual J sizes within roughly plus-or-minus 5 percent; a flat square-feet-per-ton rule
  of thumb runs roughly plus-or-minus 30 percent, because the rule of thumb "collapses
  every variable that actually drives cooling load... into a single constant."
  (https://www.energyvanguard.com/blog/air-conditioner-sizing-load-calculations-vs-rules-of-thumb/)
- A rule-of-thumb sqft-per-ton figure commonly runs 400 to 600 sqft/ton in casual use,
  but a real analysis of completed Manual J results averages closer to 1,431 sqft/ton,
  about a thousand sqft/ton higher than the folk number, and the spread runs from roughly
  350 to 800+ sqft/ton depending on climate zone and envelope quality.
  (https://www.greenbuildingadvisor.com/article/manual-j-load-calculations-vs-rules-of-thumb,
  https://airfixture.com/resources/blog/ton-per-square-footage-commercial-hvac)

Both a full Manual J/S calculation and a sqft-per-ton rule of thumb are deterministic
math over stated inputs, not a judgment among a small set of named options and not a
code lookup. That places tonnage sizing squarely inside what Kulka's own architecture
calls the **Engine** layer ("deterministic code that turns answers and database values
into a ROM. Math lives here, never in a prompt," `GLOSSARY.md`), not inside a Jev call.
Jev's own docs agree from the other direction: System One models are "not [for]
multi-step derivation or engineering estimation"
(https://docs.typesafe.ai/concepts/system-one). Jev names exactly the kind of task
tonnage sizing is as one it is not built for.

This also lines up with how the repo's other Jev tickets are scoped. LA-774 (the
sibling fire-pump/standpipe/sprinkler-hazard ticket referenced in
`docs/precon/canonical-work-items.md` lines 2138-2141 and 2769-2776) proposes Jev to
classify NFPA 13 hazard classification (Ordinary vs. Light Hazard) and to answer whether
a jurisdiction requires in-building radio coverage. Both are genuinely one-of-a-few-
named-options questions turning on a code citation or jurisdiction fact, the shape Jev's
`choice` and `noul` primitives are built for. HVAC tonnage is not that shape: it is a
continuous quantity (a decimal tonnage figure) produced by combining several stated
numeric inputs, which is a `score`-primitive misfit at best (Jev's `score` type is a
2-to-10-level ordered scale, not a continuous engineering output) and a bad fit for any
of Jev's three primitives.

### What LA-771's sibling pattern actually shows

LA-771 (fully specified per the task brief, though its body was not independently
fetched here, per the same Linear access gap noted above) was described as the template all
seven siblings (LA-771/774/775/776/777/781/784) follow. Two of the siblings confirmed in
this repo's own docs, LA-774 (fire-pump/hazard/radio-coverage) and the emergency
responder radio coverage gate LA-774 references, are genuinely code/jurisdiction
questions: they turn on a fact specific to a municipality's adopted code and AHJ, the
same category `rom-spec.md` describes for fire alarm notification type. **HVAC tonnage
does not share that shape.** Tonnage is not a fact a jurisdiction states; it is a number
an engineer computes. If the other five siblings (LA-775/776/781/784) are also genuinely
code/jurisdiction questions, LA-777 may be the one sibling in the batch that was
templated onto the wrong pattern. That should be confirmed against the real LA-771 body
and the real LA-777 body once Linear access is restored, since this document cannot
verify it directly.

## What Jev could determine here, and how, if used narrowly

Even though tonnage itself should not be a Jev call, there is a narrower, legitimate use
for Jev inside this same gate, worth naming so the recommendation isn't just "don't use
Jev":

- **HVAC system type** (PTAC vs. ducted split vs. central plant) is exactly the kind of
  small-named-set judgment Jev's `choice` primitive is built for, if Kulka ever has
  enough project facts (unit count, building height, ownership model, amenity scope) to
  make that call instead of asking the estimator outright. But this is LA-687's
  question, not LA-777's. See the next section.
- If a future gate needs to know whether a specific jurisdiction's energy code (e.g. a
  local IECC/ASHRAE 90.1 amendment) forces a particular equipment class or minimum
  efficiency that changes which sqft-per-ton band applies, *that* sub-question (a
  jurisdiction fact, already-retrieved) is a legitimate `noul` or `choice` call over
  retrieved code text. It still would not replace the load-calculation arithmetic that
  turns envelope and ventilation data into a tonnage number; it would only narrow which
  formula or benchmark band the engine reaches for.

In short: if Jev appears in LA-777 at all, its role should be confined to a small
classification sub-question feeding the engine's math, never the tonnage number itself.

## Confidence and sourcing recommendation

Whatever produces the tonnage figure, this is decision-relevant scope (it sizes a real
subcontract), not a cost benchmark pulled from a database row, so it should carry the
same discipline `rom-spec.md` already applies elsewhere:

- Show the arithmetic on the face of the ROM, the same pattern already used for the
  duration proposal and the GSF-per-unit conversion ("The proposal shows its arithmetic
  and carries a low confidence flag until the back catalogue is bigger," `rom-spec.md`
  lines 178-181; "stated on the face of the ROM as an assumption, arithmetic shown,
  flagged low confidence," lines 192-194). A derived tonnage figure should follow the
  same convention: state the sqft-per-ton (or Manual-J-style) benchmark used, the inputs
  it was applied to, and the resulting tonnage, not just a dollar line.
- Flag it **low confidence** until Kulka has enough closed jobs with known tonnage and
  known system type to check the derived figure against actuals. This is the same bar
  `rom-spec.md` already sets for the HVAC system-type blended rate (lines 143-153) and
  for the duration and GSF proposals.
- Because a sqft-per-ton constant is explicitly a simplification (per Energy Vanguard
  and GreenBuildingAdvisor above), the ROM should say plainly that this is a rule-of-
  thumb figure standing in for a real load calculation, not present it as an engineered
  number. This also protects the "never claim or imply AI reads drawings or performs
  takeoffs" rule in `docs/agents/issue-tracker.md` and `CLAUDE.md`: a derived tonnage
  benchmark is not a Manual J calculation and should never be labeled as one.
- If a Jev sub-question is ever added (per the narrow use above), its confidence score
  should gate exactly the way `docs.typesafe.ai/confidence` recommends: high confidence
  can set the classification automatically, low confidence should fall back to asking
  the estimator outright, consistent with how every other gate in `rom-spec.md` already
  falls back to asked-outright when its derivation or lookup isn't built yet.

## Relationship to LA-687 (HVAC system type)

LA-687 tracks a separate, prior question: "what mix of HVAC system type (PTAC, ducted
split, central plant) Kulka's jobs actually run," needed before the existing HVAC System
Type gate in `rom-spec.md` (lines 143-153) can price differently by system type instead
of one blended rate. That gate already exists and is about **which pricing form Item 30
uses**: a data-availability problem (no file names which system any of the five
priced jobs used) blocking a categorical split.

LA-777, as inferred, is about **the tonnage quantity itself**: how much capacity a
given project needs, independent of which system type prices it. The two are adjacent
but distinct axes on the same HVAC item: system type is a `choice`-shaped classification
question (and a real Jev candidate once enough tagged data exists, or an estimator
question per Matt's LA-687 note); tonnage is a `quantity` produced by envelope and
ventilation math (an Engine-layer calculation, not a Jev call). Neither should be
conflated with the other in the build: tonnage sizing feeds the quantity a system-type
rate gets multiplied against, but the system-type classification does not change how
tonnage itself is computed. `rom-spec.md` should eventually show both as separate,
named inputs to Item 30, not folded into a single gate.

## Open questions for Matt

1. Confirm LA-777's actual scope once Linear access is restored. This document is
   built on an inferred scope, and the LA-771-sibling pattern comparison above suggests
   HVAC tonnage may not fit that pattern the way the other siblings do.
2. Does Kulka have enough closed multifamily jobs with a known unit tonnage (even
   without system-type detail) to derive a first-pass sqft-per-ton benchmark by product
   type, the same way GSF-per-unit and duration benchmarks were seeded? If not, this
   starts in the LLM-proposed, low-confidence bucket like every other benchmark with no
   Kulka data yet.
3. Should climate zone be a stored project fact (Kulka's jobs are Long Island/tri-state,
   likely one or two IECC climate zones) or is the variation small enough across Kulka's
   actual project geography to fold into a single blended rate for now, the same
   reasoning already applied to rock exclusion and the HVAC system-type blended rate?
4. Should this ticket be re-scoped or closed as "not a Jev ticket" once the real LA-777
   body is confirmed, with the actual engine work (a sqft-per-ton benchmark and formula)
   captured as a normal build ticket instead of a Jev-research one?
