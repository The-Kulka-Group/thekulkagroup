# LA-775: Fixture-unit pipe sizing, Plumbing (Jev)

**Superseded by the real ticket, read 2026-09-21.** This research was written while
Linear was unreachable, inferred from the title and sibling pattern rather than LA-775's
actual body. The real ticket already decided to use Jev, as a bounded propose-and-correct
reasoning step (shown arithmetic, low confidence, estimator corrects), not as a
lookup-replacement question. This document's underlying code facts (fixture-unit tables,
etc.) are still useful background; its "Jev isn't needed" conclusion is not current
guidance. See LA-775 in Linear for the real scope.

Research only. No code was written or changed for this ticket.

## Scope note (read first)

LA-775's own ticket body could not be fetched: the Linear MCP connector requires
authorization that was not available during this research session, on top of the API
outage noted in the ticket brief. Everything below works from the title, the LA-771
sibling pattern, and the repo's own definitions in `GLOSSARY.md` and
`docs/precon/rom-spec.md`. See "Scope may not match the ticket" below: the research
turned up a reason to doubt the inferred scope, not just a gap in fetching it.

## What Jev is

Jev is TypeSafe's first "System One" model. It takes **state** (a string or a JSON
object or array describing the situation) plus one or more typed **questions**, and
returns a typed judgment with a probability, not generated text. The three question
types:

- **Choice**: pick one option from a named set, with a probability per option and a
  `confidence` score.
- **Noul**: a yes/no probability for one condition.
- **Score**: a position on an ordered, described scale.

Source: [System One](https://docs.typesafe.ai/concepts/system-one.md), [Choice
primitive](https://docs.typesafe.ai/primitives/choice.md), [HTTP
API](https://docs.typesafe.ai/api.md).

The docs state directly what System One models are **not** for: "deterministic
computation (exact math, calculations)," "database lookups (retrieving specific
records)," "text generation," "free-form reasoning." (System One overview page,
above.) That line is the crux of this ticket.

This matches how the repo already defines Jev's job. `GLOSSARY.md`'s "Code lookup"
entry: Jev is for the case where "the answer turns on a code requirement specific to
the project's municipality and authority having jurisdiction... rather than on a fact
the estimator can state from memory or one the tool can derive from another captured
field." `docs/precon/rom-spec.md` (lines ~154-164) restates the same three-way split
for every gate: stated outright by the estimator, derived from another captured fact
in code, or looked up by Jev from the project's address and jurisdiction, reserved for
facts that "trigger off a building code amendment specific to the project's
municipality and AHJ" — its worked examples are emergency responder radio coverage and
fire alarm notification type.

## Is Jev even the right tool here, or is this a direct table lookup

**This is a direct, deterministic table lookup. Jev is not the tool for the sizing
step itself.**

Fixture-unit pipe sizing is a published, code-defined procedure with three inputs,
none of which require semantic judgment:

1. Count fixture units from the fixture schedule/unit mix, using the fixture's fixed
   fixture-unit value from the code's own table (e.g., a lavatory is worth a fixed
   number of water-supply fixture units; a water closet another fixed number).
2. Convert fixture units to a design flow rate. The classic method is Hunter's Curve
   (Roy B. Hunter, 1940), a fixed, published, non-linear conversion, still the basis
   for the water-supply sizing tables in both major model codes. Reference points from
   the curve: 10 FU = 8 GPM, 20 FU = 14 GPM, 50 FU = 29 GPM, 100 FU = 48 GPM, 200 FU =
   75 GPM. (Source: [Hunter's Horizontal Drain Capacities and the Uniform Plumbing
   Code](https://www.phcppros.com/articles/2074-hunter-rsquo-s-horizontal-drain-capacities-and-the-uniform-plumbing-code-part-1);
   [PDHonline Course M126, Sizing Plumbing Water System](https://pdhonline.com/courses/m126/m126content.pdf).)
3. Look up the minimum pipe diameter in the code's published table, indexed by total
   fixture units, available pressure range, and developed pipe length. In the IPC this
   is Table 610.4 ("Water Supply and Distribution"); in the UPC it is Table 610.3 (2015
   edition numbering). (Source: [610.4 Sizing Water Supply and Distribution Systems,
   UpCodes](https://up.codes/s/sizing-water-supply-and-distribution-systems); [Size of
   Meter and Building Supply Pipe Using Table 610.4,
   UpCodes](https://up.codes/s/size-of-meter-and-building-supply-pipe-using-table-610-4);
   published [UPC Table 610.3
   text](https://www.mcwd.dst.ca.us/files/3c54d4925/Table-610.3.pdf).) UpCodes'
   description of how to use the IPC table is itself a deterministic lookup procedure:
   "select the appropriate pressure range group, then select the length column... and
   follow down the column to a fixture unit value equal to or exceeding the total
   number of fixture units required."

None of that is a judgment call. It is arithmetic (sum fixture units) plus two table
lookups (fixture units → flow, flow/pressure/length → diameter). The ROM engine should
implement it directly as a deterministic function, the same way `GLOSSARY.md` defines
**Engine**: "The deterministic code that turns answers and database values into a ROM.
Math lives here, never in a prompt." Routing this through an AI/jurisdiction tool would
put math in a place `rom-spec.md` and `GLOSSARY.md` both say math does not belong.

### Where Jev could still matter: which code edition/variant applies

The one part of this that is not a pure calculation is knowing **which** table to use.
IPC and UPC assign different fixture-unit values to the same fixture types and
structure their tables somewhat differently, and jurisdictions amend them locally (a
state or county can adopt IPC, UPC, or a locally amended version of either, and can
change minimum pipe sizes or fixture-unit values in the adoption ordinance). That is
exactly the shape of fact `rom-spec.md` reserves for Jev: something that "turns on a
code requirement specific to the project's municipality and authority having
jurisdiction" and that Kulka cannot reasonably ask an estimator to know from memory.

So the honest split, in the repo's own vocabulary:

- **Derive/compute (engine, no AI):** fixture unit totals, Hunter's Curve conversion,
  and the final table lookup for diameter.
- **Code lookup (Jev, if built):** which code family and edition governs the project
  (IPC vs. UPC, and any local amendment to the fixture-unit table or minimum sizes),
  keyed off the project's address/jurisdiction — the same mechanism `GLOSSARY.md`
  already names for other AHJ-specific gates.

This is a narrow, low-frequency lookup (which code edition, not which pipe size), and
it is very likely the same underlying capability LA-676's other AHJ-lookup gates
(emergency responder radio coverage, fire alarm notification) already need once that
"code lookup" tool exists. It should not be built as a one-off for plumbing.

### What a Jev call for the code-edition question would look like

If/when the general code-lookup tool exists, the plumbing-specific piece would be one
`choice` question over state that includes the project's address/jurisdiction, of the
same shape as any other Jev call:

```json
POST https://api.typesafe.ai/v1/systemone
{
  "state": {
    "project_address": "...",
    "jurisdiction": "..."
  },
  "model": "jev-latest",
  "questions": {
    "plumbing_code_edition": {
      "type": "choice",
      "instructions": "Which plumbing code and edition governs new construction water supply piping at this address?",
      "criteria": {
        "ipc_2021": "International Plumbing Code, 2021 edition, as adopted without amendment",
        "upc_2021": "Uniform Plumbing Code, 2021 edition, as adopted without amendment",
        "locally_amended": "A local jurisdiction amendment changes the fixture-unit table or minimum pipe sizes from the base code"
      }
    }
  }
}
```

Response shape (per the [Choice primitive](https://docs.typesafe.ai/primitives/choice.md)
and [HTTP API](https://docs.typesafe.ai/api.md) docs): a `choice` field with the
selected option, a `probabilities` object across all options, and a `confidence` score
computed from how concentrated that distribution is. Sources: same two pages as above.

Once the edition/variant is known, the engine picks the matching table and computes
the rest deterministically. TypeSafe's own docs do not describe a cookbook for
"which regulation/jurisdiction variant applies" specifically — the closest documented
patterns are **Classification** ("one known category should win") and **Model
Routing** (a category selects the next code path), which is the same shape as picking
a code edition. Source: [Use-case
map](https://docs.typesafe.ai/concepts/use-case-map.md).

## Scope may not match the ticket

Two things worth flagging clearly, because they suggest LA-775 as titled may not be
buildable as scoped, or may not be needed at all right now:

1. **The ROM's plumbing cost model does not currently use pipe diameter as a cost
   driver at all.** `docs/precon/canonical-work-items.md` items 28 (Plumbing
   rough-in and piping) and 29 (Plumbing fixtures) both price off **fixture points**
   (bath fixtures) and **unit count** (kitchen fixtures), decided by Matt on
   2026-09-19 during LA-720: "same driver split as item 29... Bath connections price
   on fixture points; kitchen and appliance connections price on unit count." Nothing
   in the canonical work items list, the ROM spec, or GLOSSARY.md ties pipe diameter,
   pipe length, or a Hunter's-Curve flow figure to any benchmark. If pipe sizing
   doesn't feed a cost line, it's not clear what a ROM conceptual budgeting tool needs
   it for — Kulka's own five priced files apparently didn't need it either (per the
   canonical-work-items.md evidence review, none of the five files break out piping
   cost by pipe diameter).
2. **"Pipe sizing" is an engineering-design output, not a cost-estimating input.**
   Everywhere else in this repo, "Jev"/"code lookup" gates are used to pick which
   cost form a benchmark prices under (e.g., central plant vs. per-unit water
   heating), not to perform an engineering calculation Kulka would hand to a licensed
   engineer anyway. A ROM tool computing actual code-compliant pipe diameters reads
   like a different kind of deliverable (an engineering aid) than what the rest of the
   ROM spec describes (a ranged conceptual budget with a confidence flag). Worth
   confirming with Matt whether LA-775 is really about a cost driver Kulka wants
   (e.g., "does the fixture count imply a bigger/more expensive water service and
   distribution system, which should push the Plumbing Service or Fixtures and
   Rough-In benchmark up a tier") rather than literal pipe-diameter output.

If the real intent is closer to (2) as a proxy — total fixture units as a rough signal
for "is this a large-service building" — that is a much smaller, still-deterministic
calculation (sum fixture units, maybe bucket into size tiers) and still doesn't need
Jev for anything but the code-edition question above, if even that.

## Confidence and sourcing recommendation

Because a wrong pipe-diameter or code-edition answer is decision-relevant (it could
put wrong scope in front of a developer or, worse, feed an under-sized system
assumption), it should not be shown the way a cost benchmark is shown on a ROM line.
Recommendation, consistent with `rom-spec.md`'s existing confidence-flag and
provenance rules:

- The deterministic table-lookup part (fixture units → flow → diameter) should carry
  **no AI confidence score at all** — it is arithmetic against a cited code table, so
  it should be shown as a plain computed value with a citation to the exact code
  section and table used (e.g., "IPC Table 610.4, 2021 edition"), the same way
  `rom-spec.md` requires provenance ("every number traces to the projects, export, or
  reviewed judgment that produced it").
- The code-edition/jurisdiction question, if it goes through Jev, should use the
  three-tier confidence framework the TypeSafe docs recommend: high confidence acts
  automatically, medium confidence flags for review, low confidence falls back to
  asking the estimator outright — exactly the fallback `rom-spec.md` already specifies
  for the fire alarm and emergency responder gates ("Until it does, these two gates
  fall back to asked outright"). Source: [Confidence
  guidance](https://docs.typesafe.ai/confidence.md), which states "a confidence
  threshold is not one number" and should scale with the cost of being wrong — this is
  a higher-stakes gate than a cost benchmark, so the threshold to act automatically
  should sit high, not at whatever default a generic classifier uses.
- Because this output could plausibly be read as scope/engineering guidance rather
  than a cost estimate, any UI surface should visibly label it as a conceptual
  planning assumption, not a substitute for the mechanical engineer's actual pipe
  sizing calculation.

## Does this generalize to other trades' table-lookup gates

Yes, and it's worth stating as a general pattern rather than re-deriving it per trade.
Several likely candidates share the same shape as this one, code-published sizing or
capacity tables driven by a countable quantity, not a jurisdiction judgment:

- Electrical service and feeder sizing from connected/demand load (NEC Table 310.16
  and demand factor tables) — same "sum a quantity, convert via a fixed procedure,
  look up a fixed table" shape as fixture-unit pipe sizing.
- Fire sprinkler pipe sizing from hydraulic demand (NFPA 13 tables), gas piping sizing
  from BTU load and length (fuel gas code tables), and HVAC duct sizing from CFM
  (ductulator/ASHRAE tables) are all the same shape again.

For every one of these, the same two-part split applies: the sizing/capacity table
itself is a deterministic engine function with a code citation, and Jev (or whatever
the eventual code-lookup tool is) is only needed for the narrower question of which
code edition or local amendment governs, if that varies the table or minimum values.
That narrower question is the one worth building once, generically, rather than once
per trade gate. This lines up with `rom-spec.md`'s own framing that a gate's answer
source (stated, derived, or looked up) is "worth stating per gate rather than
assuming," and with LA-676 being the parent for exactly this kind of trade-by-trade
review.

## Open questions for Matt

1. Does the ROM's plumbing model actually need a pipe diameter or design flow number
   for anything, given items 28/29 price off fixture points and unit count today? Or
   is LA-775 really asking whether total fixture units should push the Plumbing
   Service / Fixtures and Rough-In benchmark into a different pricing tier (a much
   smaller, still-deterministic addition)?
2. If pipe sizing is wanted as a literal output (for the client-facing document or for
   an internal sanity check), is it in scope for a *conceptual* budgeting tool at all,
   or is that closer to what the mechanical engineer's actual drawings will show later
   and out of place here?
3. Does the code-edition/jurisdiction lookup this ticket would depend on already exist
   as its own ticket, or does LA-775 need to wait on the general Jev code-lookup build
   the fire alarm and emergency responder gates are also waiting on (per
   `rom-spec.md`)? Building this per-trade first would duplicate that work.
4. Should the "does this generalize to other trades" list above (electrical, fire
   sprinkler, gas piping, HVAC duct sizing) become its own LA-675 sibling ticket for a
   single shared pattern, instead of one ticket per trade re-deriving the same
   table-lookup-vs-Jev distinction?
