# LA-781: Insulation R-Value and Type card design

Design pass only. No code. Confirms the LA-860 mechanism (`derived-assumptions.ts`,
`lib/rom/jev.ts`) for two criteria under item 12, Building Insulation: thermal envelope
insulation and acoustic insulation. Same shape as V-1 (`la-784-elevator-type.md`).

## 1. Cards

**I-1. Thermal Envelope Insulation.** Feeds cost code 07.02000, item 12's only confirmed
code in the six source files (`canonical-work-items.md:998`). Roof and continuous
insulation have no separate confirmed code today; flagged in section 6.

**I-2. Acoustic Insulation, Demising and Partition Walls.** Also feeds 07.02000. Kept
separate from I-1 per the ticket: two code regimes, sound transmission and energy code,
sharing one canonical item.

## 2. Facts

- **Climate Zone.** Shared with LA-777. Not captured today: `tier1-flow.json` and
  `lib/rom/projects.ts` have no address, city, or location field, so `rom-spec.md`'s
  "derives from location already captured" does not match the built intake. Proposal: mark it
  assumed with a default of 4A, because most of Kulka's work is on Long Island, which
  sits in zone 4A. No new question. If a location field ships for LA-777 or
  LA-771, both criteria rederive from it and Climate Zone becomes stated.
- **Energy Code Path.** Prescriptive or performance. Not asked or derivable anywhere.
  Assumed, default "Prescriptive," the one place this design assumes rather than looks
  up, per the ticket, with its own reason line separate from the R-value result.
- **Roof Type.** The ticket calls this an existing gate. It is not live: `rom-spec.md`
  lists it among "four more, narrower" gates Matt confirmed on 2026-09-20, but
  `lib/rom/gates.ts`'s `SCOPE_QUESTIONS`, the nine gates wired today, has no
  roof entry, nor does `tier1-flow.json`. Same gap as the fire alarm, HVAC system type,
  and water heating gates named alongside it. Proposal: assumed, default "Flat," reasoned
  from V64 and VR's tapered-polyiso evidence (`canonical-work-items.md:1044`). No new
  question; once the gate ships, on its own ticket, both roof-driven criteria rederive.
- **Framing System.** Narrower than "Structure Type." `lib/rom/framing.ts` and
  `lib/rom/projects.ts` only accept `"wood"` or `"metal"`, though `rom-spec.md` and
  `canonical-work-items.md:665` describe Structure Type as also offering steel-framed.
  Stated when the project's `framingSystem` is set; otherwise assumed "wood," matching
  all six source jobs. Continuous insulation gates on `framingSystem = "metal"` today;
  steel-framed or mass-wall has nowhere to land until the field's range widens (section 6).
- **Interior Partition Wall Area.** Derived, not asked, from item 17's Gypsum Wall
  Board Installation container, already in square feet (`canonical-work-items.md:1561`).

## 3. The DerivationRequests

**I-1. Question:** "Does this roof condition insulate above the deck or below it?"

- `above_deck`: Flat roof, tapered polyiso doing double duty as thermal value and
  slope-to-drain. Value: spec, "R-30 Tapered Polyiso, Above Deck, IECC Zone 4A
  Prescriptive." Sample, 80,000 GSF, flat roof: (1) Climate Zone → 4A. (2) Energy Code
  Path → Prescriptive (assumed). (3) IECC Table R402.1.2, Zone 4A, roof → R-30 minimum.
  (4) Roof Type → Flat (assumed). (5) Flat routes to above-deck polyiso, R-30
  continuous. (6) Framing System → Wood (assumed): no continuous wall insulation added.
- `below_deck`: Pitched roof, cavity insulation in the attic or rafter space. Value:
  spec, "R-49 Batt, Attic/Rafter Cavity, IECC Zone 4A Prescriptive." Same sample zone and
  path. (4) Roof Type → Pitched (assumed). (5) Pitched routes to below-deck cavity, R-49
  batt. (6) Framing System → Metal (assumed for this branch): continuous insulation added
  over the cavity batt for thermal bridging.

Both samples are labelled sample, neither a real Kulka job.

**Reason lines:** High: "Climate Zone, Energy Code Path, Roof Type, and Framing System
are all stated rather than assumed." Low: "One of those four rests on an assumed fact."

**I-2. Question:** "Does a stated acoustic requirement beyond code minimum apply, or
does the code minimum govern?"

- `code_minimum`: Value: spec, "STC 50, Mineral Wool Batt, Interior Demising and
  Partition Walls." Method: "IBC sound transmission minimum between dwelling units."
  Sample: (1) Interior Partition Wall Area (item 17) → 120,000 SF. (2) STC requirement,
  IBC minimum → STC 50. (3) Coverage → 120,000 SF at STC 50.
- `stated_upgrade`: Value: spec, "STC 54+, Mineral Wool Batt, per Stated Requirement."
  Same sample area; step 2 reads a stated requirement instead of the code minimum.

**Reason lines:** High: "No acoustic requirement was stated, so the code minimum, which
multifamily construction essentially never falls below, governs." Low: "A stated
requirement conflicts with, or is not clearly above, the IBC minimum."

## 4. Confidence

I-1 is high only when Roof Type, Framing System, and Energy Code Path are all stated,
not assumed; low whenever any one is assumed, which is every run today, since none of
the three has a live gate or field yet. I-2 is high by default, since STC 50 is close to
a universal fact in multifamily construction; low only if a stated requirement creates
ambiguity against the code minimum.

## 5. Pricing, proposed

I-1 and I-2 both price against item 12's confirmed code, 07.02000, at $1.25 to $1.50 per
SF for batt and $8.50 per SF for spray foam, all already stated in
`canonical-work-items.md:998-1000` from V64 and VA. Above-deck polyiso and continuous
insulation have no rate in any of the six files; needs a stated rate from Matt before
either prices as its own line rather than folding into the blended batt rate.

## 6. Knock-on effects, flagged and not resolved

- Roof Type and Energy Code Path have no live gate; every I-1 result is low confidence
  until one ships. Not this ticket's fix.
- Framing System's live range (wood, metal) is narrower than Structure Type's documented
  range (also steel-framed, mass-wall); a steel-framed or mass-wall project has no value
  to select today.
- Tapered polyiso and continuous insulation have no cost code of their own; both fold
  into 07.02000 until Matt splits the code or states it stays blended.

## 7. The three boundaries

1. **Output is a quantity and a spec assumption, never a schematic.** Both values are
   `spec` strings naming an R-value and a material, the same shape as every other
   `DerivedAssumption`. No assembly drawing, no drawing reading, no takeoff.
2. **No calculation that needs a fact nobody has, without flagging it.** Energy Code
   Path is the one place this design assumes rather than looks up, per the ticket, with
   its own reason line separate from the R-value result. Roof Type and Framing System's
   live gaps get the same treatment.
3. **No new intake questions.** Climate Zone, Roof Type, and Energy Code Path are all
   marked assumed with a stated default rather than asked. Framing System and Interior
   Partition Wall Area reuse fields that already exist.

## 8. Open questions for Matt

1. Should Roof Type ship as a real tier-1 gate now, ahead of the other narrower gates
   `rom-spec.md` documents but `gates.ts` does not yet wire?
2. Should Framing System's live range widen to include steel-framed and mass-wall before
   I-1 needs it, or should the design fall back to "metal" for both until then?
3. What R-value should the assumed Energy Code Path use when Roof Type is also assumed:
   the stricter candidate, or one stated default?
4. Is 4A the right default Climate Zone for every Kulka project, or does it need a
   per-project override before LA-777 and this criterion both rely on it?
5. Should above-deck polyiso and continuous insulation get their own cost codes under
   07.02000, or stay blended into the existing batt rate?

## 9. Build ticket contents

- Wire I-1 and I-2's `DerivationRequest`s into item 12's engine path.
- Add Roof Type and Energy Code Path as assumed facts with stated defaults, rederiving
  once a real field or gate ships.
- Read Framing System from the existing project field; assumed "wood" when null.
- Read Interior Partition Wall Area from item 17's wall board container, not a new
  question.
- Reuse the shared derived-assumption card and correction flow from LA-860; no new UI.
- Test cases: all facts assumed (low), Roof Type assumed with the rest stated (still
  low), and a stated acoustic requirement above code minimum (I-2 low, I-1 unaffected).
