# LA-771: Looking up code-driven branch gates by jurisdiction, using Jev

Research and design recommendation only. No code changed for this ticket.

## The two gates this is about

From `docs/precon/rom-spec.md` (branch gates section), surfaced during LA-720's trade
review and confirmed by Matt on 2026-09-19:

- **Emergency responder radio coverage** (yes/no/don't know): required above a
  code-triggered building size and signal-survey threshold that varies by AHJ.
- **Fire alarm notification type** (voice evacuation vs. horn and strobe, don't know):
  usually triggered by building height and occupancy classification, also varies by
  jurisdiction.

Both fall back to asked outright until a jurisdiction lookup exists. `GLOSSARY.md` and
`rom-spec.md` both name Jev as the intended tool for that lookup, "given the project's
address and jurisdiction." This document checks that claim against Jev's own
documentation.

## What Jev actually is

Jev is the first "System One" model from TypeSafe AI, a company that came out of
stealth on 2026-09-15. It is not a chat model. A request sends **state** (the context
you supply) plus **questions** (Choice, Score, or Noul) and gets back typed answers
with probabilities and confidence, evaluated in parallel, in one call.

Source: [Introduction](https://docs.typesafe.ai/introduction.md) — "Jev is TypeSafe's
flagship model and the first System One model... evaluates typed questions against a
state and returns structured results directly," rather than generating text.

## Can Jev take a jurisdiction and return a structured code judgment

No, not on its own. This is the central finding of this research, and it corrects the
implication in the current docs wording.

**Jev has no built-in knowledge base, live data access, or lookup capability.** It
judges only the state the caller passes in. The state and API docs are explicit about
this:

- [State](https://docs.typesafe.ai/concepts/state.md): "State is the content you ask a
  System One model to evaluate," passed in the `state` field of the request. TypeSafe
  does not fetch external data itself; it only evaluates what the caller supplies.
  There is no mention anywhere in the docs of jurisdiction, geography, or an external
  knowledge source.
- [API reference](https://docs.typesafe.ai/api.md): the request is `POST
  https://api.typesafe.ai/v1/systemone` with `state`, `model`, and `questions`. There
  is no endpoint or parameter for an address, a jurisdiction code, or a location.

So a call like "given this address, does the AHJ require voice evacuation?" is not a
call Jev can answer directly. There is no code-lookup primitive. What Jev can do is
**judge a specific claim against source text you already have**, the same pattern its
citation-checking cookbook uses:

[Citation verification cookbook](https://docs.typesafe.ai/cookbooks/citation_check.md):
given a claim and a document section, a Choice question asks whether the surrounding
context "supports," "contradicts," or is silent on the claim. The cookbook's own
generalization note: this textual-entailment pattern "works wherever you need to
validate claims against authoritative source material," explicitly including
building codes as an example.

Applied here, the real shape of "code lookup" is two steps, not one:

1. **Retrieval** (not Jev's job): find the applicable code section or amendment for
   the project's municipality and AHJ, given its address. This has to come from
   somewhere else, for example a code database or search, a jurisdiction-mapping
   service, or a human-curated table.
2. **Judgment** (Jev's job): given that retrieved code text as state, ask a Noul or
   Choice question such as "does this code text require voice evacuation for a
   building of this height and occupancy" and get back an answer with a probability
   and confidence.

Jev is the second half. The first half, resolving an address to a jurisdiction and
finding that jurisdiction's current code text, is not something these docs show Jev
doing, and it is not addressed anywhere in the use-case map either:
[Use-case map](https://docs.typesafe.ai/concepts/use-case-map.md) lists legal/
compliance document classification and risk-indicator use cases, but nothing about
construction, permitting, or building codes specifically.

## Live lookup vs. cached jurisdiction table

Recommendation: cache, not a live call at ROM-compute time, for the same reason the
rest of the ROM engine already uses stored, dated values instead of recomputing them
on the fly.

The existing pattern in this codebase is dated-and-versioned reference data:
`supabase/migrations/20260827120000_rom_schema.sql` records every benchmark with
`provenance_kind`, `provenance_recorded_by`, and `provenance_recorded_at date`, and the
ROM domain vocabulary in `rom-spec.md` defines **Provenance** as "the recorded source
of a number: which projects, which export, or whose reviewed judgment produced it, and
when." A code requirement by jurisdiction fits this shape exactly: it changes rarely,
on a knowable cadence (code adoption cycles, amendment publication), not per-request.

Two more reasons to prefer a cache:

- **Jev's own model-version guidance points the same way.** From
  [Models](https://docs.typesafe.ai/models.md): aliases like `jev-latest` "move when a
  new release ships, so the answers behind it can change without a change on your
  side," and the docs recommend pinning a specific version and moving to a new one "on
  your own schedule" once thresholds are tuned. A ROM answer that silently changes
  because a model alias updated, on a question that affects pricing, is the wrong kind
  of instability for this engine.
- **Latency and cost.** Retrieval plus a model call at compute time adds a network
  round trip (or two) to every ROM that touches these gates, for a question whose
  answer is stable for months at a time.

So: build a `jurisdiction_code_requirements` (or similarly named) table keyed by AHJ,
holding the resolved answer for each code-driven gate, with the same provenance
columns the rest of the schema uses (who/what produced it, when, and what source text
or Jev call backed it). Refresh it on a cadence tied to code-adoption cycles, or
on demand when a new jurisdiction is first encountered, not on every ROM run. The
research and retrieval mechanism (how a jurisdiction's current code text gets found
and kept current) is itself unresolved and is scoped out of this ticket, per the
instructions — that is the next ticket, once this shape is confirmed with Matt.

## Confidence and sourcing: how this should look different from an estimator-stated answer

This is decision-relevant scope, so it deserves its own section rather than folding
into the recommendation above.

Jev's confidence is not a correctness signal. From
[Confidence](https://docs.typesafe.ai/confidence.md): confidence reflects how
concentrated the model's probability distribution is, not whether the answer is
right — "a highly confident but wrong answer still scores high on confidence." The
docs' own three-tier guidance: above roughly 0.9, act automatically; in the middle,
proceed with caution and consider confirmation; below roughly 0.5, route to a human
and don't act on it. They're explicit that "a confidence threshold is not one number"
and should scale with the cost of being wrong.

For this ROM, being wrong on a code-driven gate is not a cosmetic error: it changes
which form a required item prices under (rom-spec.md's own definition of what a branch
gate does), and it's licensed, code-triggered scope on the emergency-radio gate
specifically. That argues for a stricter bar than a generic UI suggestion would use.

Concretely, an AI-derived code answer should be visually and structurally distinct
from an estimator-stated one on the ROM face:

- **Estimator-stated** answers (gas building, roof type today) carry no confidence
  mark; a person said so.
- **Derived** answers (elevator stops from stories) already have a place in the
  domain model as tool-derived facts.
- **AI-derived code answers** need a third mark: something like "code lookup,
  confidence: high/medium/low, as of [date], source: [AHJ document or Jev call
  reference]." This lines up with the existing **Confidence flag** concept in
  `rom-spec.md` (high/medium/low, low flags hold the line for human review) but should
  say plainly that the source is a jurisdiction lookup, not a comparable-driven
  benchmark, so a reviewer knows what kind of confidence they're looking at.
- Anything below the "route to human" threshold should behave like "don't know" does
  today: TBD on the schedule of values, not silently defaulted, with the estimator
  able to override it the same way any other benchmark gets overridden.

## Does this generalize past these two gates

Partially. The **judgment mechanism** generalizes (retrieved code text in, Noul/Choice
question out, same citation-check pattern), so a third code-driven gate would not need
new Jev plumbing. But **each gate still needs its own retrieval and question design**:

- What triggers the requirement (building size and a signal survey for emergency
  radio; height and occupancy classification for fire alarm notification) differs per
  gate, so the state you hand Jev, and the exact question you ask it, has to be
  written per gate.
- Which source document holds the answer (an IBC/NFPA amendment, a local fire code
  supplement, a state building code) differs per jurisdiction and may differ per gate
  within the same jurisdiction.
- The rom-spec.md text already flags a related case worth checking before this ticket's
  successor is built: fire alarm notification "may be derivable from stories rather
  than asked outright, the same way elevator stops derive from stories," which would
  make it a **derived** fact instead of a **looked-up** one for at least some
  jurisdictions. That distinction changes which of the three answer-mechanisms
  (stated / derived / looked-up) applies, and it's worth resolving per gate rather than
  assuming every future code-driven gate needs a full jurisdiction lookup.

So: reusable plumbing, not a reusable answer. Each future code-driven gate is its own
research pass to confirm what triggers it and where the authoritative text lives, even
once the Jev-judgment half is built once.

## Open questions for Matt

1. Who or what does the retrieval half (address to AHJ, AHJ to current code text)?
   Jev doesn't do this, so it's either a separate data source/service, a periodic
   human-curated table, or both. This is the actual unresolved scope of the next
   ticket.
2. What refresh cadence is realistic for a jurisdiction table, given how often these
   specific code triggers (signal-survey thresholds, height/occupancy triggers for
   notification type) actually change in Kulka's Long Island / tri-state footprint?
3. Should the fire alarm notification gate be re-checked as a **derived** fact (from
   stories, like elevator stops) before building a jurisdiction lookup for it at all,
   since that would remove it from this ticket's scope entirely for at least some
   jurisdictions?
4. TypeSafe AI is three days old as a public product as of this research
   (came out of stealth 2026-09-15, per public reporting). Worth a stability check —
   pricing, API stability, company durability — before committing production ROM
   pricing logic to it, separate from the technical fit question this document answers.

## Sources consulted

All read live from docs.typesafe.ai on 2026-09-20:

- https://docs.typesafe.ai/introduction.md
- https://docs.typesafe.ai/concepts/state.md
- https://docs.typesafe.ai/api.md
- https://docs.typesafe.ai/confidence.md
- https://docs.typesafe.ai/cookbooks/citation_check.md
- https://docs.typesafe.ai/model-jaggedness/jev-1.13.md
- https://docs.typesafe.ai/models.md
- https://docs.typesafe.ai/concepts/use-case-map.md
- https://docs.typesafe.ai/llms.txt (documentation index)

Company background (secondary, for the open question on vendor maturity only):
[typesafe.ai](https://typesafe.ai/), reported via web search 2026-09-20.

Repo sources: `GLOSSARY.md`; `docs/precon/rom-spec.md` (branch gates section, lines
~100-172); `supabase/migrations/20260827120000_rom_schema.sql` (benchmark provenance
columns).
