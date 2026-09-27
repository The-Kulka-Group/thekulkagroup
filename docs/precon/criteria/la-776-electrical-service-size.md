# Electrical service size, derived assumption (LA-776)

Design pass only. No code changes. Written against the LA-860 mechanism
(`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`) and the three
boundaries LA-776 shares with LA-774.

> **Review note, 2026-09-27: this design needs another pass before a build ticket.**
> Two problems came up in review.
>
> 1. The method prices lighting and general load only, because the ticket keeps
>    appliance and HVAC load out of scope. That load is a small part of a real
>    building's service: the worked example gets 89,850 VA and a 300A service for
>    101,200 SF, far below what a building that size takes. A service size that low
>    would price Service and Distribution too low if anyone used it. The next pass
>    should either use the multifamily method, which accounts for each unit's load
>    and needs a unit count (see the shared intake gap in `README.md`), or say plainly
>    that E-1 is a lower bound and must not price the container on its own.
> 2. Jev's choice between single-phase and three-phase service does little work. A
>    multifamily building of this size runs on three-phase service, so the choice
>    would almost always land the same way. A better question for Jev is the method
>    choice in point 1, once a unit count exists.
>
> Also corrected in review: 300A is a standard rating, so step 3 of the worked example
> now steps 249 A up to 300A, not 400A.

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
| `elevator` branch gate (`tier1-flow.json` `elevator`) | stated, or assumed if "don't know" |

**Missing fact, flagged rather than added as a question.** The sibling
research raised NEC's optional multifamily method (220.84), which sizes its
demand factor by dwelling-unit count. Unit count is unreliable today:
`proposeGrossSquareFeet` in `rom-intake.ts` only receives it when an
estimator entered units instead of area. Section 3 resolves this by choosing
the NEC method that never needs unit count, rather than deriving or assuming
a number nobody gave us.

`elevator`'s "don't know" is a stated answer, not silence, but gives this
criterion nothing to reason from. This design marks that input `assumed`,
defaulting to "No," the way an unanswered informal sub-scope defaults to
absent elsewhere in the spine. The default only weakens confidence; it never
blocks the derivation.

## 3. The DerivationRequest

**Method: NEC's general method, Article 220 Part II, not the optional
multifamily method (220.84).** The general method needs only occupancy type
and gross square feet, both captured today, and never touches unit count,
unit mix, or any appliance or HVAC fact, keeping this inside boundary 2.

**Question Jev is asked:** given this project's size and whether it has an
elevator, is its service more likely single-phase or three-phase? That is
the one real judgment: the intake has no service-voltage question, and the
load math below yields VA, not amps, until a voltage and phase assumption
converts it. The candidates carry that assumption; the load math ahead of
them is identical and exact for both.

**Shared arithmetic:**
1. Connected load = grossSquareFeet × unit load for the occupancy, per NEC
   Table 220.12 ("Dwelling Units," 3 VA per square foot).
2. Apply NEC Table 220.42's demand factors for dwelling occupancy: the first
   3,000 VA at 100 percent, the next 117,000 VA at 35 percent, the remainder
   above 120,000 VA at 25 percent. Sum the three bands for demand load in VA.

**Candidates:**
- `single_phase`: "Smaller building, no elevator, 120/240V single-phase
  service." Amps = demand load ÷ 240.
- `three_phase`: "Larger building or an elevator present, 208Y/120V
  three-phase service." Amps = demand load ÷ (208 × √3).

Both round up to the next standard NEC service size (100, 200, 400, 600,
800, or 1200 amps).

**Worked example, sample project (101,200 GSF multifamily, elevator: yes):**
1. Connected load: 101,200 × 3 VA/SF = 303,600 VA.
2. Demand load: 3,000 + (117,000 × 0.35 = 40,950) + (183,600 × 0.25 =
   45,900) = 89,850 VA.
3. `three_phase`: 89,850 ÷ 360.3 ≈ 249 A, steps up to 300A, the next
   standard rating.
4. `single_phase`, for comparison: 89,850 ÷ 240 ≈ 374 A, rounds up to
   400A here, one size above the three-phase result.

**Reason lines:**
- High: "The elevator gate was answered directly, and the building's size
  clearly favors one service configuration over the other."
- Low: "The elevator gate reads don't know, or the size sits near the line
  between a single-phase and a three-phase service."

## 4. Confidence rules

High when the elevator gate carries a stated yes or no and the GSF is not
near the boundary between the two candidates' amperage. Low when the
elevator input is assumed, or the candidates land in a similar amperage
band, since the voltage assumption is then a real toss-up. The load
arithmetic is exact once occupancy and GSF are known; the uncertainty sits
entirely in the voltage assumption, matching the split the research document
already recommended.

## 5. Feeding pricing (proposal for Matt to confirm)

Service size in amps gives Service and Distribution its own quantity driver,
separate from item 31's blended $/SF rate, leaving branch power, lighting,
and everything else priced as today. No source file isolates a dollar figure
for this container, so pricing it needs a stated rate from Matt: a $/amp
figure or a lump-sum table by amperage band. Until then this criterion
shows its amp figure with no dollar amount, the way a TBD line shows a
quantity with no price.

## 6. Knock-on effects, flagged and not resolved

- If Matt later prices this container by amperage, item 31's blended $/SF
  rate should be checked for double-counting, since no source file ever
  separated this container's dollars out.
- Item 27's Fire Pump Dedicated Power Supply and item 31's Emergency
  Generator both touch service capacity; this design does not reconcile
  with either.
- LA-774 and LA-775 share this mechanism; the voltage/phase assumption
  pattern may be worth naming once, not reinvented per trade.

## 7. The three boundaries

1. **Quantity and assumption, never a schematic.** The output is an amp
   figure on a labeled, correctable card. No panel schedule, no one-line
   diagram.
2. **No fact nobody has.** The method needs only occupancy type, gross
   square feet, and the elevator gate, all captured today. Appliance and
   HVAC loads never enter the calculation.
3. **No new intake questions.** Every fact above already exists in
   `tier1-flow.json`. Unit count, which a different NEC method needs, is
   deliberately left unused rather than asked for.

## 8. Open questions for Matt

1. Should Service and Distribution price by a $/amp rate, or a lump-sum
   table banded by standard service size?
2. Should the elevator gate's "don't know" default to "No" for this
   criterion, or to "Yes," given most of Kulka's multifamily work runs
   multiple stories?
3. Is self-storage in scope for this criterion now, or should `E-1` stay
   multifamily-only until self-storage's own occupancy load is confirmed?

## 9. What the build ticket would contain

- Add `E-1` to the derived-assumption registry, wired to `projectType`,
  `grossSquareFeet`, and the `elevator` branch gate.
- Implement the shared NEC 220.12/220.42 arithmetic as a deterministic
  engine function returning both candidates' steps.
- Wire the `single_phase`/`three_phase` `DerivationRequest` through
  `deriveAssumption`, with the reason lines from section 3.
- Render the assumption card on the ROM face using the existing
  derived-assumption card component from LA-860.
- Leave Service and Distribution unpriced until Matt answers question 1.
- Test the arithmetic against the worked example and a case near the
  single-phase/three-phase amperage line.
