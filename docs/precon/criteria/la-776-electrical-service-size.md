# Electrical service size, derived assumption (LA-776)

Design pass only. No code changes. Written against the LA-860 mechanism
(`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`) and the three
boundaries LA-776 shares with LA-774.

**Method changed in review, 2026-09-27.** The first pass priced general
lighting only and asked Jev to pick single-phase versus three-phase. Lighting
alone undersized the service, and buildings this size run three-phase almost
every time, so the phase choice gave Jev little to judge. This pass uses
NEC's optional multifamily method, and asks Jev a fork that moves the
result: whether amenity scope adds a house load on top of the dwelling-unit
demand.

## 1. Criterion and cost codes

Code `E-1`. Card label: **Electrical Service Size**.

Feeds item 31's Service and Distribution container (Division 26, ProEst code
family 26.05xxx), which `canonical-work-items.md` notes has "no dollar figure
isolated in any of the six files." This criterion gives it a quantity to
price against, once Matt sets a rate (section 5).

## 2. Facts used

| Fact, named as the intake stores it | Basis |
| --- | --- |
| `projectType` (`tier1-flow.json` `project_type`) | stated |
| `grossSquareFeet` (`tier1-flow.json` `gross_square_feet`) | stated |
| `amenityScope` branch gate (`tier1-flow.json` `amenity_scope`) | stated, or assumed if "don't know" |
| Unit Count | assumed |
| GSF per Unit | assumed, needs a stated value from Matt |
| Per-Unit Electrical Load | assumed, needs a stated value from Matt |
| House Load, amenity scope only | assumed, needs a stated value from Matt |

**Missing fact, handled like `la-775-plumbing-fixture-units.md`.** The
optional multifamily method needs a unit count. `README.md` already names
unit count as missing from the live intake, and `proposeGrossSquareFeet` in
`rom-intake.ts` takes a GSF-per-unit ratio without storing one anywhere. This
design derives Unit Count the way P-1 does: Gross Square Feet divided by a
GSF-per-unit ratio, marked assumed, the ratio needing a stated value from
Matt by product type. No new intake question.

**Per-Unit Electrical Load is also a named assumption, not a computed one.**
The optional method sizes each unit's lighting, small-appliance, laundry, and
fixed-in-place appliance circuits as one connected load per unit, before any
demand factor. Working out real appliance and HVAC nameplate ratings would
guess at scope this ticket keeps out (boundary 2), so this design bundles it
into one stated planning default per unit, in VA, that Matt sets. The worked
example below uses a sample number for it, labeled as such.

## 3. The DerivationRequest

**Method: NEC's optional calculation for multifamily dwellings (220.84),**
not the general method used in the first pass. It applies a demand factor to
the total connected load by unit count, giving a realistic service size
instead of pricing lighting alone.

**Question Jev is asked:** does this project's amenity scope, a pool,
activity room, sauna or similar, add a house load on top of the dwelling-unit
demand? NEC 220.84(A) treats house loads as a separate addition, computed by
the standard method and not reduced by the dwelling demand factor, so whether
one applies is a real fork. The `amenityScope` gate answers it when stated;
"don't know" is the case where nothing points either way, and confidence
should read low.

**Shared arithmetic, both candidates:**
1. Unit Count = grossSquareFeet ÷ GSF per Unit (assumed ratio).
2. Connected dwelling load = Unit Count × Per-Unit Electrical Load (assumed
   planning default, VA).
3. Apply NEC Table 220.84's demand factor for the unit-count bracket (it
   declines from 45 percent at 3 to 5 units to 23 percent at 62 units and
   over) to get the dwelling demand load in VA.

**Candidates:**
- `no_house_load`: "Amenity scope answered no, or don't know." Service size
  = dwelling demand load only.
- `with_house_load`: "Amenity scope answered yes." Service size = dwelling
  demand load plus a stated House Load planning default (VA), added at full
  value per 220.84(A).

Both convert VA to amps at a fixed 208Y/120V three-phase service, common at
this scale, then round up to the next standard NEC size (400, 600, 800, or
1200 amps). The voltage is a fixed default applied to every run, not
something Jev judges, and is flagged as an open question below.

**Worked example, sample project (101,200 GSF multifamily, amenity scope:
yes). Every figure below is a sample planning default, not a stored Kulka
number.**
1. Unit Count = 101,200 ÷ 950 (sample GSF/unit) ≈ 106.5, rounds to 107 units.
2. Connected dwelling load = 107 × 8,000 VA (sample per-unit load) =
   856,000 VA.
3. Demand factor for 107 units (62-and-over bracket) = 23 percent. Dwelling
   demand load = 856,000 × 0.23 = 196,880 VA.
4. `with_house_load`: add a sample 40,000 VA house load = 236,880 VA total.
   Amps = 236,880 ÷ (208 × 1.732) ≈ 658 A, rounds up to an 800A service.
5. `no_house_load`, for comparison: 196,880 VA only, ≈ 546 A, rounds up to a
   600A service.

**Reason lines:**
- High: "The amenity scope gate was answered directly, so whether a house
  load applies is settled either way."
- Low: "The amenity scope gate reads don't know, so nothing points to
  whether a house load applies."

## 4. Confidence rules

High when `amenityScope` carries a stated yes or no. Low when it reads
"don't know," since neither candidate then has anything pointing to it over
the other, regardless of how far apart their amperage lands. The uncertainty
is about which load applies, not the arithmetic once chosen. Every input
feeding the shared arithmetic is already assumed, so this card also carries
the separate assumed-fact flag (`showsAssumedFact`), the same split LA-775
uses.

## 5. Feeding pricing (proposal for Matt to confirm)

Service size in amps gives Service and Distribution its own quantity driver,
separate from item 31's blended $/SF rate, leaving branch power, lighting,
and everything else priced as today. No source file isolates a dollar figure
for this container, so pricing it needs a stated rate from Matt: a $/amp
figure or a lump-sum table by band, separate from the planning defaults
above, which set the quantity, not the price. Until then this criterion
shows its amp figure with no dollar amount, the way a TBD line shows a
quantity with no price.

## 6. Knock-on effects, flagged and not resolved

- Three assumed figures chain: GSF per Unit, Unit Count, and Per-Unit
  Electrical Load. An error in the first compounds through the rest, the
  same risk `la-775-plumbing-fixture-units.md` flags.
- The dwelling general-lighting load here may overlap with item 31's Branch
  Power and Devices container, already priced per square foot. Pricing this
  container by amperage without checking risks double-counting.
- Item 27's Fire Pump Dedicated Power Supply and item 31's Emergency
  Generator both touch service capacity; this design does not reconcile
  with either.

## 7. The three boundaries

1. **Quantity and assumption, never a schematic.** The output is an amp
   figure on a labeled card. No panel schedule, no one-line diagram.
2. **No fact nobody has.** The method reads project type, gross square feet,
   and the amenity scope gate, all captured today. It never asks for
   individual appliance or HVAC nameplate data; per-unit and house loads are
   single, named planning defaults, not an itemized guess.
3. **No new intake questions.** Unit Count, GSF per Unit, Per-Unit Electrical
   Load, and House Load are all reached by assumption from facts already in
   `tier1-flow.json`.

## 8. Open questions for Matt

1. What GSF-per-unit ratio should E-1 assume, by product type?
2. What per-unit VA default should stand in for each unit's lighting,
   small-appliance, laundry, and fixed appliance load?
3. What VA default should the added house load use when amenity scope is
   present?
4. Should "don't know" on amenity scope price with or without the added
   house load?
5. Should Service and Distribution price by a $/amp rate, or a lump-sum
   table banded by service size?
6. Should the VA-to-amps step always assume 208Y/120V three-phase, or vary
   by building size?

## 9. What the build ticket would contain

- Add `E-1` to the derived-assumption registry, wired to `projectType`,
  `grossSquareFeet`, and the `amenityScope` gate.
- Implement GSF-to-unit-count and unit-count-to-demand-load (NEC Table
  220.84), plus the optional house-load addition, as deterministic engine
  functions.
- Wire the `no_house_load`/`with_house_load` `DerivationRequest` through
  `deriveAssumption`, with the reason lines from section 3.
- Render the assumption card using the existing derived-assumption card
  component from LA-860.
- Leave Service and Distribution unpriced until Matt answers question 5.
- Test the arithmetic against the worked example, using the sample
  defaults, not a live TypeSafe call.
