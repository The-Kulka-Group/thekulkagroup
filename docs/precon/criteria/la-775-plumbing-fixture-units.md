# LA-775: Fixture-Unit Pipe Sizing, Plumbing

Design pass. No code. This proposes how the app derives a fixture-unit quantity for
canonical work items 28 (Plumbing Rough-In and Piping) and 29 (Plumbing Fixtures),
MasterFormat Division 22. The source data for these items cites cost code 22.04000 for
fixture connections; item 28's rough-in lines carry no single consistent code across the
six source files, so this design cites the item numbers rather than one code.

**Revised 2026-09-28.** Matt's rule: the app answers building design and engineering
questions through a researched rule and never asks him. Only pricing questions go to him.
The New Budget setup now stores unit count, building count, stories above grade and ZIP,
so the chain of assumed ratios this design started from (GSF to unit count to bathrooms)
is mostly gone. Section 8 lists which old questions a rule now answers and which pricing
questions remain. Section 10 says what can be built now.

## 1. Criterion code and label

**Code:** P-1. **Label:** Fixture-Unit Sizing. **Feeds:** item 28 (Plumbing Rough-In and
Piping) and item 29 (Plumbing Fixtures), both Division 22.

## 2. Facts used

The ticket states that fixture points come from the unit mix and riser count comes from
building count and stories. The project now stores most of what that needs:

| Fact | Basis | How it is reached |
| --- | --- | --- |
| Unit Count | stated | `unitCount`, required for multifamily |
| Building Count | stated | `buildingCount`, defaults to 1 |
| Stories Above Grade | stated | `storiesAboveGrade`. P-1 does not need it; the sprinkler criteria do |
| ZIP | stated | `zip`, optional. Maps to a county through the HUD USPS ZIP Code Crosswalk |
| Governing plumbing code | derived | 2025 Plumbing Code of New York State outside NYC; NYC Plumbing Code 2022 in the five boroughs |
| Fixtures required per unit | derived | 2025 PCNYS Table 403.1, apartment house |
| Bathrooms per unit | derived, regional default | Census Characteristics of New Housing, Northeast, 2025 |
| Dishwasher per unit | derived | Kulka's own files price a dishwasher connection in every file (item 28, container 6) |
| Units per building | derived | Unit Count / Building Count, assuming an even split |

**Governing code.** The 2025 PCNYS, in force since December 31, 2025, is based on the
2024 International Plumbing Code. The NYC Plumbing Code 2022 is also IPC-based. The
Uniform Plumbing Code does not apply anywhere in New York, so P-1 uses the IPC fixture-unit
tables. This settles the code-edition question the first draft left open. This pass
checked the State tables only. A NYC project reads the same tables at low confidence until
the NYC tables are checked.

**Fixtures required per unit.** For an apartment house, 2025 PCNYS Table 403.1 requires
per dwelling unit one water closet, one lavatory, one bathtub or shower and one kitchen
sink, plus one automatic clothes washer connection per 20 dwelling units. That is one full
bathroom group per unit as a floor.

**Bathrooms per unit.** No code sets the number above that floor. The best published
source is the Census Bureau's Characteristics of New Housing. Of the multifamily units
completed in the Northeast in 2025, 68 percent had one bathroom, 3 percent had one and a
half, and 29 percent had two or more. P-1 turns that into a per-unit default:

- Full bathroom groups per unit = (0.68 x 1) + (0.03 x 1) + (0.29 x 2) = 1.29.
- Half baths per unit = 0.03.
- Counting "two or more" as two slightly understates the total. The card says so.

This default is the same for every project, so it is an assumed input. The estimator can
correct the bathroom count on the card. Riser count is gone from the list: fixture units
and flow do not depend on it, and risers are a layout decision the captured facts cannot
show.

## 3. The arithmetic

Fixture-unit sizing is arithmetic, not judgment. The code does all of it and builds the
`DerivedAssumption` directly, the same pattern as V-2 (`lib/rom/jack-criterion.ts`). No Jev
call is needed.

**Water supply fixture units (WSFU) per unit**, from 2025 PCNYS Table E103.3(2), private
fixtures, flush tank:

- Bathroom group, 3.6 each: 1.29 x 3.6 = 4.644.
- Half bath, water closet 2.2 plus lavatory 0.7: 0.03 x 2.9 = 0.087.
- Kitchen sink, 1.4.
- Dishwasher, 1.4.
- Laundry, one public 8 lb washer per 20 units at 3.0: 3.0 / 20 = 0.15.
- Total: 7.68 WSFU per unit.

Flush tank values apply because New York limits a water closet to 1.28 gallons per flush
(2025 PCNYS Table 604.4), which is a tank fixture in apartment work.

**Drainage fixture units (DFU) per unit**, from 2025 PCNYS Table 709.1:

- Bathroom group with a water closet of 1.6 gallons per flush or less, 5 each: 1.29 x 5 =
  6.45.
- Half bath, water closet 3 plus lavatory 1: 0.03 x 4 = 0.12.
- Kitchen sink with dishwasher, 2 (the table gives one value for the sink with a
  dishwasher, a disposer or both).
- Laundry, commercial washer at 3 per 20 units: 0.15.
- Total: 8.72 DFU per unit.

**Per building.** Multiply by units per building.

**Design flow.** WSFU converts to gallons per minute through 2025 PCNYS Table E103.3(3),
the column for systems mostly on flush tanks, interpolating between rows. Appendix E is
informative in New York, not part of the code, but it is the published Hunter method the
code points designers to.

**Building drain tier.** DFU sets the building drain size directly through 2025 PCNYS
Table 710.1(1). P-1 reads the table at 1/8 inch per foot, the minimum slope for 3- to
6-inch pipe (Table 704.1). The minimum slope gives the larger pipe, and the actual slope is
not known at budget time. The limits at 1/8 inch per foot are 180 DFU for 4-inch, 390 for
5-inch, 700 for 6-inch and 1,600 for 8-inch. At 8.72 DFU per unit that means:

| Building drain | Units per building |
| --- | --- |
| 4-inch | up to 20 |
| 5-inch | 21 to 44 |
| 6-inch | 45 to 80 |
| 8-inch | 81 to 183 |

The drain size is the tier because it is the one size the code sets from fixture units
alone. The water service size also depends on street pressure and pipe length, which the
app does not have.

**Worked sample (labeled sample, not a Kulka job): 48 units, one building.**

1. WSFU = 48 x 7.68 = 369.
2. Design flow: 300 WSFU = 85.0 gpm and 400 WSFU = 105.0 gpm. 369 interpolates to 85.0 +
   (0.69 x 20.0) = 98.8 gpm.
3. DFU = 48 x 8.72 = 419.
4. Building drain at 1/8 inch per foot: 419 is over 390 and under 700, so 6-inch.

The same 48 units split across two buildings give 24 units and 209 DFU each, a 5-inch drain
per building.

## 4. Confidence rules

The unit count is stated. The bathroom mix is the one assumed input, so confidence asks
whether the tier would hold across the real range of bathroom counts:

- The code works the DFU total twice more: at the code floor of one bathroom group per unit
  (7.15 DFU per unit) and at two full bathroom groups per unit (12.15 DFU per unit).
- High when all three results land in the same drain tier.
- Low when they straddle a tier boundary, when the building count is above one (the split
  across buildings is assumed), or when the ZIP places the project in NYC.

In the sample, one bath per unit gives 343 DFU (5-inch) and two give 583 DFU (6-inch), so
the card reads low. A 60-unit building gives 429, 523 and 729 DFU: 6-inch at the low end
and the Census mix, 8-inch at two baths. That card also reads low. Many projects will read
low until the estimator states the bath count, which is the honest result.

## 5. Feeding pricing (proposal for Matt)

Today items 28 and 29 price on fixture points and unit count directly; nothing in
`canonical-work-items.md` or `rom-spec.md` ties a benchmark to pipe size. Two ways this
could feed pricing, either needing Matt's confirmation:

- **Size-tier multiplier.** The drain tier nudges item 28's or 29's benchmark rate up or
  down a step, the way HVAC system type already forks a benchmark. The tiers are now set by
  the code (section 3). Needs a stated rate or multiplier from Matt for each tier.
- **New supporting item.** A distribution-sizing line becomes its own item under Structure
  Demolition's pattern (ADR 0006), priced only once Matt states a rate.

No dollar figure in this document proposes either.

## 6. Knock-on effects (flagged, not resolved)

- The bathroom default is regional and the same for every project. A luxury condo and a
  studio-heavy rental get the same mix until the estimator corrects it.
- Laundry follows the code floor of one common washer per 20 units. Units with their own
  washers add about 1.4 WSFU and 2 DFU each, which the default leaves out.
- Units per building assumes an even split across buildings.
- The NYC Plumbing Code's fixture-unit tables were not checked in this pass.
- The minimum-slope reading gives the larger drain. A building drain laid at 1/4 inch per
  foot can be one size smaller.

## 7. The three boundaries

1. **Output is a quantity and an assumption, never a schematic.** The card shows fixture
   units, a flow and a drain tier, not a pipe layout. The app does not read drawings or
   perform takeoffs.
2. **No calculation that needs a fact nobody has.** Every input is a stored field, a code
   table value, or the one labeled regional default for bathrooms.
3. **No new intake questions.** Unit count and building count are already asked. The
   bathroom mix comes from the Census default, not a question.

## 8. Open questions, sorted by Matt's 2026-09-28 rule

Resolved by a rule (engineering):

1. *Default bathrooms per unit, by product type.* Resolved. One full bathroom group per
   unit is the code floor (2025 PCNYS Table 403.1). The default above it is 1.29 full
   bathroom groups and 0.03 half baths per unit, from the Census Characteristics of New
   Housing, Northeast, 2025. Self storage has no dwelling units, so P-1 does not run for it.
2. *Building and riser count defaults, or wait for unit mix.* Resolved. Unit count and
   building count are stored fields now, so there is nothing to wait for. Riser count is
   dropped because fixture units and flow do not depend on it.
3. *Which code and table applies* (from the knock-on list). Resolved. The 2025 PCNYS and
   the NYC Plumbing Code 2022 are both IPC-based; P-1 uses Tables 403.1, 604.4, 709.1,
   710.1(1), E103.3(2) and E103.3(3).

Still for Matt (pricing):

1. Should fixture demand change the price through a tier multiplier on items 28 and 29, or
   through a new supporting item?
2. What rate or multiplier goes with each drain tier (4, 5, 6 and 8 inch)?
3. Do your job files show bathrooms per unit (for example V64, VA and VR's fixture lines)?
   If so, the app can use Kulka's own mix in place of the Census average.

## 9. Build ticket contents

- A code-only P-1 that builds and saves a `DerivedAssumption`, following
  `lib/rom/jack-criterion.ts`. No Jev call.
- Pure engine functions for WSFU per unit, DFU per unit, flow by interpolation, and drain
  tier, each citing its 2025 PCNYS table.
- The bathroom default as a stored reference value with its Census source and year, marked
  assumed, and replaced by the estimator's correction when there is one.
- The confidence test at one and two bathroom groups per unit.
- The card on the assumptions panel using the shared LA-860 mechanism, no new UI.
- Items 28 and 29 pricing unchanged until Matt picks a pricing mechanism (section 5).
- Tests against the worked sample in section 3, the two-building split, and a 60-unit case
  that crosses a tier.

## 10. Build readiness

**Inputs.** All available. Unit count (required for multifamily) and building count
(defaults to 1) are stored. ZIP is optional and only changes which code the card names.
Bathrooms per unit is not captured and comes from the labeled Census default.

**Adopted rules.** Fixture floor from 2025 PCNYS Table 403.1. Bathroom mix from the Census
Characteristics of New Housing, Northeast, 2025. WSFU from Table E103.3(2), flow from Table
E103.3(3), DFU from Table 709.1, drain tier from Table 710.1(1) at the Table 704.1 minimum
slope. IPC tables because both New York plumbing codes are IPC-based.

**Pricing left for Matt.** The pricing mechanism, the rate or multiplier per drain tier,
and whether his job files carry a bathroom count.

**Can it be built now?** Yes. P-1 can ship as a Design and Engineering card showing
fixture units, flow and drain tier, with items 28 and 29 priced as they are today. The
pricing answers become a stated follow-up that wires the tier into the rate.

## Sources

- NYS Department of State, 2025 Plumbing Code of New York State, adoption text (Tables
  403.1, 604.4, 704.1, 709.1, 710.1(1); Appendix E, Tables E103.3(2) and E103.3(3)):
  https://dos.ny.gov/system/files/documents/2025/07/2025pcnys_noa_2025-07-24.pdf
- NYS Education Department, effective date of the 2025 Uniform Code:
  https://www.nysed.gov/facilities-planning/news/2025-nys-uniform-code-and-state-energy-code-will-take-effect-december-31-0
- US Census Bureau, Characteristics of New Housing, Number of Multifamily Units Completed
  by Number of Bathrooms per Unit (2025 data, published July 1, 2026):
  https://www.census.gov/construction/chars/xls/mfu_bathrooms_cust.xls (index:
  https://www.census.gov/construction/chars/current.html)
- HUD USER, USPS ZIP Code Crosswalk Files:
  https://www.huduser.gov/portal/datasets/usps_crosswalk.html
- Repo: `docs/precon/canonical-work-items.md` items 28 and 29 (dishwasher connections in
  every file), `docs/precon/research/la-775-plumbing-fixture-unit-sizing.md`.
