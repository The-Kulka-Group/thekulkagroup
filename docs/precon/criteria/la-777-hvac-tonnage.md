# LA-777: HVAC tonnage from code-minimum envelope and ventilation

Design pass only, no code changes. Uses the shared derived-assumption mechanism
shipped in LA-860 (`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`).

## 1. Criteria and cost codes

Two cards, so window area carries its own flag instead of hiding inside the
tonnage arithmetic.

- **M-0, "Window Area and Orientation."** A spec choice: the glazing band this
  building's walls likely carry. Feeds M-1.
- **M-1, "HVAC Tonnage."** A quantity in tons, feeding Item 30's containers 1
  (In-Unit Equipment), 2 (Distribution), 3 (Ventilation and Louvers), and
  conditionally 6 (Central Plant Equipment), per `canonical-work-items.md`.

Both cards also read **Climate Zone**, a fact shared with LA-781, owned by neither.

## 2. Facts used

Stated, all from `tier1-flow.json`: Gross Square Feet (`gross_square_feet`),
Construction Kind (`construction_kind`), Balconies (`balconies`, a gate), Retail
Storefronts (`retail_storefronts`, a gate).

Assumed: Climate Zone, Unit Mix by Bedroom Count. Neither is captured today, and per
the ticket's third boundary neither becomes a new question:

- **Climate Zone**: assumed, stated default IECC 4A, because most of Kulka's work is on
  Long Island, which sits in zone 4A. Matt should confirm it, since parts of the
  tri-state area fall in zone 5A. `tier1-flow.json` has no address field; `rom-system-design.md`
  lists one as a future `projects` column, not yet wired in. Once it exists, Climate
  Zone flips to derived-from-location and stated, for this ticket and LA-781 alike.
- **Unit Mix by Bedroom Count**: `rom-spec.md` already puts this in the assumed
  bucket. Assumed here too, stated default distribution Matt confirms (open
  question 3).

## 3. DerivationRequests

### M-0, Window Area and Orientation

**Question:** "Do the facts point this building toward a standard window-to-wall
ratio, or an elevated one?"

**Candidates:**
- `standard`: "No balconies, no storefronts, or the two disagree." Value: spec
  "Standard Glazing Band." Method: "Default ratio, no signal toward more glass than
  code minimum."
- `elevated`: "Balconies and storefronts both present." Value: spec "Elevated
  Glazing Band." Method: "Balcony doors and storefront glazing both push window
  area above the default."

**Confidence:** high, "Balconies and storefronts agree, both present or both
absent." low, "No code or intake fact measures window area directly; even an
agreeing signal is a proxy, not a measurement." Set `highConfidenceAt` at 0.9, so
this card reads low most of the time by design: window area is the one input in
this chain that code never resolves.

### M-1, HVAC Tonnage

**Question:** "Does the code-minimum envelope and ventilation path fit this
project, or does something about it fall outside that path?"

**Candidates:**
- `code_minimum`: "New construction, or a renovation resetting the envelope to
  current code." Value: quantity in tons, engine-computed (steps below). Method:
  "IECC prescriptive envelope table plus the ASHRAE 62.2 ventilation formula,
  converted to tonnage."
- `not_derivable`: "A renovation keeping its existing envelope and glazing." Value:
  spec "Ask the estimator for tonnage directly." Method: "Code-minimum math assumes
  a code-compliant envelope; a partial renovation that keeps existing walls and
  windows does not have one."

**Confidence:** high, "New construction on a stated climate zone; the code-minimum
path almost always applies." low, "A renovation, or a climate zone still carrying
its assumed default, makes the code-minimum path a guess."

**Engine arithmetic for `code_minimum`:**
1. Read Climate Zone; look up the IECC prescriptive envelope table for that zone
   (wall R-value, roof R-value, window U-factor).
2. Read M-0's band; split the exterior wall area implied by Gross Square Feet into
   an opaque share and a window share using that ratio.
3. Compute the envelope's heat transfer coefficient from the R-values, U-factor,
   and the two shares.
4. Read Unit Mix; compute required outdoor airflow per the ASHRAE 62.2 formula (a
   floor-area term plus a per-bedroom term), summed across the mix.
5. Convert the coefficient and airflow to tonnage using a climate-zone sqft-per-ton
   benchmark. **No such benchmark exists yet** (open question 4); until it does,
   this step has no stored figure to run on.

**Worked example, a sample project only:** 130,000 GSF multifamily, Climate Zone
4A (assumed default), Standard Glazing Band, unit mix at Matt's stated default.
Using the real Manual-J average already cited in the research doc (about 1,431
sqft/ton, sourced there to GreenBuildingAdvisor and AirFixture), a rough base figure
is 130,000 ÷ 1,431 ≈ 91 tons, before step 4's airflow addition nudges it up a few
tons. Illustrative arithmetic shape only, not a Kulka number.

## 4. Confidence rules

M-0 is high only when Balconies and Retail Storefronts agree, low otherwise,
including when either is unanswered. M-1 is high only when construction is new and
Climate Zone is stated, low for any renovation or while Climate Zone stays assumed.
A correction to either card records reason, who, and when, Jev's value kept
underneath, same as any other override.

## 5. Feeding pricing, a proposal for Matt

Item 30 prices today as a blended rate, $18.00 to $30.00 per square foot across
three files (`canonical-work-items.md`, Item 30), gated by HVAC System Type but not
split by it for lack of tagged data. Proposal: once M-1 produces a tonnage, price
containers 1, 2, 3, and 6 as tonnage times a rate per ton that still forks by HVAC
System Type (PTAC, ducted split, central plant), the gate already in `rom-spec.md`.
**No per-ton rate exists for any system type. Needs a stated rate from Matt** before
this prices anything. Containers 4, 5, 7, 8, and 9 keep their existing drivers.

## 6. Knock-on effects, flagged and not resolved

- Tonnage-based pricing waits on the HVAC System Type per-ton rates, LA-687/LA-720
  work.
- Climate Zone is shared state: a correction on either ticket's card should
  re-derive the other. `rederive` and `changedCriteria` support this; nothing wires
  the two cards to one stored fact yet.
- A job outside Long Island/tri-state gets M-1 quietly wrong on the 4A default
  until corrected, with no address field to catch the mismatch.
- M-1's ventilation step depends on Unit Mix, which depends on the GSF-per-unit
  conversion (LA-678) running first when a call gives units, not area.

## 7. The three boundaries

1. **Output is a quantity and an assumption, never a schematic.** M-0 and M-1 show
   as labeled cards with arithmetic and a correction control, the shape already
   shipped for duration and GSF-per-unit, never a load-calc report or anything
   mistakable for a Manual J submittal.
2. **No calculation on an unstated fact without flagging it.** Climate Zone, Unit
   Mix, and M-0's band all carry `basis: "assumed"`, so `showsAssumedFact` flags
   M-1 for as long as any stays uncorrected.
3. **No new intake questions.** Every fact above already exists in
   `tier1-flow.json`, or is marked assumed with a stated default rather than asked.

Standing rule held too: M-1 sizes a planning quantity from code tables and a stated
default. Nothing here reads a drawing or performs a takeoff.

## 8. Open questions for Matt

1. Confirm IECC 4A as Climate Zone's default until an address field exists.
2. Move HVAC pricing to tonnage times a per-ton rate, or keep $/SF with tonnage as
   a check figure only?
3. What default bedroom-mix distribution should the ventilation step use?
4. Any closed job with known tonnage to seed a sqft-per-ton benchmark by climate
   zone, or does this start fully low confidence?
5. Is the M-0/M-1 split right, or should window area fold into M-1's own input
   list without its own card?

## 9. What the build ticket would contain

- Climate Zone as a shared assumed fact both LA-777 and LA-781 read, with Matt's
  confirmed default and a path to stated once location is captured.
- M-0's DerivationRequest, wired through `lib/rom/jev.ts`.
- M-1's DerivationRequest, with the section 3 arithmetic as a pure function tested
  independently of Jev.
- The sqft-per-ton benchmark table, initially empty, with provenance.
- M-1's tonnage wired into Item 30's containers 1, 2, 3, and 6, forking by HVAC
  System Type once Matt supplies the per-ton rates.
- M-0 and M-1 rendered in the assumptions panel with the existing card, correction,
  and revert UI from LA-860.
- Tests: engine arithmetic, a fixture test per DerivationRequest against a fake
  `JevClient`, and a `rederive` test for a Climate Zone correction reaching both
  tickets' cards.
