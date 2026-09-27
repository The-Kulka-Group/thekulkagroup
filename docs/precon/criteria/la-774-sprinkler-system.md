# LA-774: Sprinkler System Criteria for a Better Pricing Quantity

Design pass only. No code changes here. This reuses the shipped LA-860 mechanism
(`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`) rather than inventing a
second one, per the ticket's own instruction to read the four sibling trade tickets
together first.

Item 27 (Fire Sprinkler System, Division 21) still prices at one blended dollar-per-gross-
square-foot rate today, per `canonical-work-items.md`'s own 2026-09-18 resolution. This
design proposes three criteria that give that item a better internal quantity than flat
square feet, without reopening the quantity driver itself.

## 1. Criteria and cost codes

- **SP-1, Hazard Classification Split.** Feeds item 27's Sprinkler Piping and Heads
  container, Division 21. Splits total GSF into Ordinary Hazard square feet (garage,
  mechanical, trash and compactor rooms) and Light Hazard square feet (units, corridors),
  per NFPA 13.
- **SP-2, Standpipe System Requirement.** Feeds item 27's Standpipe System container,
  Division 21.
- **SP-3, Fire Pump Requirement.** Not a Jev criterion. Boundary 2 below keeps this an
  estimator-stated or height-derived gate, matching item 27's own resolution
  ("Fire Pump and Pump Room... stays an estimator-stated gate for now"). Named here so
  the three sub-problems the ticket lists stay together, not because this design adds a
  DerivationRequest for it.
- **SP-4, Trash Chute Head Count.** Feeds item 27's Sprinkler Piping and Heads container,
  cross-referenced to item 23 (Trash Compactors and Chutes, ProEst code 14.09000 for the
  chute, 11.08200 for the compactor on JF's file). This is Matt's mid-review addition: NFPA
  13 requires a head at every chute's top service opening and another at the compactor
  room's hopper or discharge area.

## 2. Facts used

Facts already captured, as `config/rom/tier1-flow.json` and `lib/rom/question-flow.ts`
name them today:

- `grossSquareFeet` (engine_input, stated).
- `parkingType` (intake_field, stated: none, surface, structured, underground, or don't
  know).
- `amenityScope` (branch_gate, stated yes/no).
- `projectType` (engine_input, stated: multifamily or self storage).
- `elevator` (branch_gate, stated yes/no, no stop count captured).
- `levelsBelowGrade` (branch_gate, stated yes/no).

Facts this design assumes and the intake does not capture:

- **Story count.** Neither `tier1-flow.json` nor `question-flow.ts` has a stories or
  floor-count field. `rom-spec.md` twice describes elevator stops and fire alarm
  notification as things that "derive from stories," but that field itself is not built.
  This design does not add a stories question. SP-2 instead treats `elevator` (already
  captured) as a proxy for height, and marks Story Count itself as an assumed fact with
  no stated default yet, flagged low until Matt states one or the field is added
  elsewhere.
- **Garage area fraction of GSF.** No per-space breakdown exists in the intake or in any
  benchmark. SP-1 marks this an assumed fact, the same shape as the existing GSF-per-unit
  benchmark (stored per product type, not asked as a question), with no default value
  set yet.
- **Trash chute count and compactor count per building.** Item 23's own quantity driver
  (EA per building) is settled by LA-720, but no stated per-project count exists in the
  intake. SP-4 marks both assumed, defaulting to whatever count item 23 itself assumes,
  so the two never diverge.
- **Recycling chute present.** Item 23 calls this "conditional, spec-driven... zero
  evidence anywhere." SP-4 assumes absent by default, the same pattern the emergency
  generator gate uses.

## 3. DerivationRequests

**SP-1, Hazard Classification Split.** Question: does this project carry a meaningful
share of Ordinary Hazard area (garage, mechanical), or is it almost entirely Light Hazard?

- Candidate A, Structured or Underground Parking Present. Value: quantity in square feet.
  Method: NFPA 13 Ordinary Hazard Group 1 for garage and mechanical space, Light Hazard
  for the rest. Steps: (1) take `grossSquareFeet`; (2) apply the assumed garage-area
  fraction to get Ordinary Hazard SF; (3) the remainder is Light Hazard SF. Sample project,
  labeled sample only: 150,000 GSF, structured parking, garage fraction assumed at 15
  percent for illustration only, no stated rate behind it. Ordinary Hazard SF: 150,000 x
  0.15 = 22,500. Light Hazard SF: 150,000 - 22,500 = 127,500.
- Candidate B, No Structured Parking. Value: all 150,000 SF as Light Hazard, garage
  fraction zero.
- Reasons: high when `parkingType` is a clean stated answer (structured, underground,
  surface, or none) and the assumed garage fraction is not doing the deciding; low when
  `parkingType` is "don't know" or the garage-fraction default is the only thing choosing
  between candidates.

**SP-2, Standpipe System Requirement.** Question: given this building's height proxy, is a
standpipe system required under IBC, referencing NFPA 14?

- Candidate A, Standpipe Required. Value: spec text, "Standpipe System: required, Class I
  wet, one riser per exit stair." Method: IBC's roughly four-story or 30-foot standpipe
  trigger, read here through `elevator` = yes as a proxy since story count is not yet
  captured. Steps: (1) `elevator` = yes; (2) treat as a stand-in for crossing the height
  trigger; (3) assign required. Sample project: elevator present, `levelsBelowGrade` = yes
  adds one riser extension below grade. Result: standpipe required, two risers.
- Candidate B, Standpipe Not Required. `elevator` = no, below both thresholds in the
  typical case. Result: not required.
- Reasons: high when `elevator` is a clean stated yes or no and no other proxy is doing
  the work; low whenever Story Count is the input deciding the answer, since it
  is assumed, not stated, until it exists as a real fact.

**SP-4, Trash Chute Head Count.** Question: how many dedicated NFPA 13 sprinkler heads
does this building's chute system require?

- Candidate A, Trash Chute Only. Value: quantity in heads. Method: one head at each
  chute's top service opening, one at the compactor room's hopper or discharge area.
  Steps: (1) chute count (assumed default, per building); (2) compactor count (assumed
  default, per building); (3) heads = chute count + compactor count. Sample project: one
  building, one chute, one compactor. Heads: 1 + 1 = 2.
- Candidate B, Trash and Recycling Chutes. A parallel recycling chute needs its own
  top-opening head. Heads = (chute count x 2) + compactor count. Same sample project with
  a recycling chute added: (1 x 2) + 1 = 3.
- Reasons: high when chute count, compactor count, and recycling-chute presence are all
  stated by the estimator, read off item 23's own entered counts, rather than defaulted;
  low when any of the three rests on the assumed default, which is the common case until
  item 23 carries a real per-project count.

## 4. Confidence rules

Confidence follows the shipped mechanism in `lib/rom/jev.ts`: Jev's returned probability
on the picked candidate at or above 0.8 reads high, below reads low
(`DEFAULT_HIGH_CONFIDENCE_AT`). The wrapper already tells Jev to weigh an assumed fact as
uncertain, so confidence naturally drops whenever a criterion's deciding input is assumed
rather than stated. All three criteria above have at least one assumed input today (garage
fraction, story count, chute or compactor count), so expect low confidence across the
board until Matt states real defaults or the fields become captured facts.

## 5. Feeding pricing: a proposal for Matt to confirm

Item 27 prices at one blended rate today, $3.30 to $11.00 per SF across four files, per
`canonical-work-items.md`. This design proposes, not decides:

- Once SP-1 splits GSF into Ordinary and Light Hazard SF, the Sprinkler Piping and Heads
  container could price each pool at its own rate instead of one blended rate. Needs a
  stated rate from Matt for each hazard class; none exists in the repo today.
- SP-2's required or not-required answer would gate whether the Standpipe System
  container's existing scope applies, a presence gate, not a new rate.
- SP-4's head count would add a small EA line inside Sprinkler Piping and Heads. Needs a
  stated per-head rate from Matt; none exists today.

## 6. Knock-on effects, flagged and not resolved

- The ticket asks the four sibling tickets and LA-771 to share one derivation mechanism.
  This design reuses LA-860's shipped `DerivedAssumption` and `deriveAssumption()` rather
  than proposing a sixth one.
- Cross-trade findings already named against item 27 in `canonical-work-items.md`: fire
  pump room heating (item 30), fire pump dedicated power and controller signals (items 31
  and 32), and the NFPA 13 versus 13R distinction that affects window allowance (item
  16a). None are resolved here.
- Item 23's own quantity driver review (LA-720) is still open. SP-4 inherits whatever
  chute and compactor count that review settles on.

## 7. The three boundaries

1. **Output is a quantity and an assumption, never a schematic.** Every criterion above
   renders only as a `DerivedAssumption` row: label, value, method, steps, confidence.
   Nothing here produces a layout or a drawing.
2. **No hydraulic calculation.** Fire pump has no DerivationRequest in this design. It
   stays the existing stated or height-derived gate.
3. **No new intake questions.** Every fact above is either an existing field in
   `tier1-flow.json` or `question-flow.ts`, or an assumed default flagged plainly (garage
   fraction, story count, chute count, compactor count, recycling-chute presence). None
   of these becomes a new node in the question flow file.

## 8. Open questions for Matt

1. What garage-area fraction of GSF should SP-1 assume by default when parking is
   structured or underground?
2. Should SP-2 keep using `elevator` as its height proxy, or should story count become a
   real captured field, outside this ticket, before SP-2 ships?
3. What are the Ordinary Hazard and Light Hazard per-square-foot rates that would replace
   today's one blended sprinkler rate?
4. What default chute count and compactor count per building should SP-4 assume until
   LA-720 settles item 23's own quantity driver?
5. What per-head rate should price the two or three dedicated chute and compactor
   sprinkler heads SP-4 adds?
6. Should recycling-chute presence stay an assumed-absent default, the same as the
   emergency generator, or does Matt want it as a real branch gate?

## 9. What the build ticket would contain

- Derivation modules for SP-1, SP-2, and SP-4, each calling `deriveAssumption()` with the
  facts and candidates above.
- The benchmarks this design leaves open (garage fraction, the two hazard-class rates, the
  per-head chute rate), each with provenance, once Matt states them.
- Wiring item 27's Sprinkler Piping and Heads container to price against SP-1's two SF
  pools instead of the single blended rate, behind a flag until backtested.
- Wiring the Standpipe System container's presence to SP-2's assumption.
- The chute and compactor head-count line inside Sprinkler Piping and Heads, cross-
  referenced to item 23's own counts so the two never drift apart.
- A backtest of the two-rate hazard split against VA's own garage-and-tower split before
  it replaces the current flat rate.
- Confirmation with Matt on whether story count becomes a real captured field, since SP-2
  depends on the elevator proxy only until then.
