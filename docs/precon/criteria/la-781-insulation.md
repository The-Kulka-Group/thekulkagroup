# LA-781: Insulation R-Value and Type card design

Design pass only. No code. Confirms the LA-860 mechanism (`derived-assumptions.ts`,
`lib/rom/jev.ts`) for two criteria under item 12, Building Insulation: thermal envelope
insulation and acoustic insulation. Same shape as V-1 (`la-784-elevator-type.md`).

**Revised 2026-09-28.** Matt's rule: the app answers building design and engineering
questions through a researched rule and never asks him. Only pricing questions go to him.
The New Budget setup now stores ZIP, stories above grade and framing system, so the
climate zone no longer needs a Long Island default, and the energy code's own tables pick
the R-values. Section 8 lists which old questions a rule now answers and which pricing
questions remain. Section 10 says what can be built now.

## 1. Cards

**I-1. Thermal Envelope Insulation.** Feeds cost code 07.02000, item 12's only confirmed
code in the six source files (`canonical-work-items.md:998`). Roof and continuous
insulation have no separate confirmed code today; flagged in section 6.

**I-2. Acoustic Insulation, Demising and Partition Walls.** Also feeds 07.02000. Kept
separate from I-1 per the ticket: two code regimes, sound transmission and energy code,
sharing one canonical item.

## 2. Facts

- **Climate Zone.** Derived, not asked. The ZIP maps to a county through the HUD USPS ZIP
  Code Crosswalk (ZIP to county file, the county holding the largest share of residential
  addresses). The county gives the zone from the 2025 Energy Conservation Construction
  Code of New York State (2025 ECCCNYS), [NY] Tables C301.1(1) and R301.1(1):
  - Zone 4: Bronx, Kings, Nassau, New York, Queens, Richmond, Suffolk, Westchester.
  - Zone 5: Albany, Allegany, Broome, Cattaraugus, Cayuga, Chautauqua, Chemung, Columbia,
    Cortland, Dutchess, Erie, Genesee, Greene, Livingston, Monroe, Niagara, Onondaga,
    Ontario, Orange, Orleans, Oswego, Putnam, Rensselaer, Rockland, Saratoga, Schenectady,
    Schoharie, Schuyler, Seneca, Steuben, Tioga, Tompkins, Washington, Wayne, Wyoming,
    Yates.
  - Zone 6: Chenango, Clinton, Delaware, Essex, Franklin, Fulton, Hamilton, Herkimer,
    Jefferson, Lewis, Madison, Montgomery, Oneida, Otsego, St. Lawrence, Sullivan, Ulster,
    Warren.
  - New York City's five counties are all zone 4, and the 2025 NYC Energy Conservation Code
    fixes zone 4A for projects in the city (Section R301.1).
  - With no ZIP, the card assumes zone 4, where most Kulka work sits, and reads low. When a
    ZIP touches counties in different zones, the card uses the county with the most
    residential addresses and reads low. A ZIP outside New York gets no zone from this
    table and the card says so.
- **Energy code and provisions.** Derived. Outside NYC the 2025 ECCCNYS applies. It is
  based on the 2024 IECC with State amendments and took effect December 31, 2025. In NYC
  the 2025 NYC Energy Conservation Code (2025 NYCECC) applies. Under the State's own
  definition, an R-2 building of not more than three stories above grade plane is a
  residential building and uses the residential tables. At four stories or more it uses
  the commercial tables, Group R column (Section C402.1.3). Self storage uses the commercial
  tables, All Other column.
- **Energy Code Path.** Assumed prescriptive, R-value method. This is the neutral planning
  choice, not a guess: the performance path compares a design against a standard
  reference design built to the prescriptive values (2025 ECCCNYS Table R405.4.2(1) uses
  the Table R402.1.2 U-factors; the commercial path has a matching Table C407.4.1(1)). The
  card carries its own reason line for this assumption, separate from the R-value result.
- **Roof Type.** Assumed low slope, insulation entirely above the deck. No code picks a
  roof form. The State code defines a low-slope roof as less than 2 in 12. Kulka's own
  evidence points to flat: V64 and VR carry tapered polyiso matching their TPO roof area
  (`canonical-work-items.md:1044`). This stays an assumption with no new gate. The
  estimator can correct it on the card to pitched.
- **Framing System.** Stated when the project's `framingSystem` is set (wood or metal);
  otherwise assumed wood, matching all six source jobs. "Metal" means load-bearing
  cold-formed steel (`lib/rom/framing.ts`). The energy code keys its wall rows on the wall
  assembly, not the structure, so wood and metal cover the product types:
  - State commercial tables: Table C402.1.3 has no cold-formed steel row. Its "wood framed
    and other" row covers wood and cold-formed steel stud cavities (footnote h), so both
    read that row.
  - NYC commercial tables: 2025 NYCECC Table C402.1.3 has its own "metal framed" row for
    cold-formed steel studs.
  - Residential tables (State and NYC): a steel-frame wall must meet the wall U-factor of
    Table R402.1.2, U-0.045 (Section R402.2.7).
  - A steel-frame structure with cold-formed steel infill walls counts as metal framing.
    Mass wall rows apply only to concrete or masonry exterior walls. None of the six source
    jobs has those above a podium garage, and the garage itself is unconditioned. A concrete
    or masonry residential building is the one case the field cannot express; the estimator
    corrects the card for it.
- **Garage below conditioned floors.** From `parkingType`. When parking is structured or
  underground, the floor over the garage is an envelope floor. Its area is the garage area
  from the sprinkler criterion (`la-774-sprinkler-system.md`, one floor plate). The garage
  is assumed unconditioned.
- **Interior Partition Wall Area.** Derived, not asked, from item 17's Gypsum Wall Board
  Installation container, already in square feet (`canonical-work-items.md:1561`).

## 3. The rules and arithmetic

### I-1, Thermal Envelope Insulation

Once the facts are known, the energy code tables pick every value. The code does the
lookups and builds the `DerivedAssumption` directly, the same pattern as V-2
(`lib/rom/jack-criterion.ts`). No Jev call is needed.

Steps: (1) ZIP to county to climate zone. (2) Stories above grade to residential or
commercial provisions. (3) Prescriptive R-value method. (4) Roof row from the roof type.
(5) Wall row from the framing system. (6) Floor-over-garage row when parking is structured
or underground.

**2025 ECCCNYS values (outside NYC).** Residential values come from [NY] Table R402.1.3
and are the same in zones 4, 5 and 6. Commercial values come from [NY] Table C402.1.3,
Group R column.

| Component | Residential, 3 stories or fewer | Commercial, zone 4 | Commercial, zone 5 | Commercial, zone 6 |
| --- | --- | --- | --- | --- |
| Roof, insulation entirely above deck | R-30ci | R-33ci | R-33ci | R-34ci |
| Roof, attic (pitched) | R-49 ceiling; R-38 counts where full height over the top plate (R402.2.1) | R-53 | R-53 | R-55 |
| Wall, wood framed | R-30, or R-20 + R-5ci, or R-13 + R-10ci, or R-20ci | R-13 + R-4.5ci, or R-19 + R-1.5ci | R-11 + R-10ci, or R-19 + R-5ci, or R-21 + R-4ci | R-11 + R-12ci, or R-19 + R-7ci, or R-21 + R-5ci |
| Wall, cold-formed steel | U-0.045 maximum (R402.2.7) | Same as wood framed | Same as wood framed | Same as wood framed |
| Wall, mass | R-15 or R-20 (second value when most insulation is inside) | R-13.3ci | R-15.2ci | R-17.5ci |
| Floor over garage | R-30, or R-19 + R-7.5ci, or R-20ci | R-16.7ci (mass floor) | R-16.7ci | R-16.7ci |

**2025 NYCECC values (zone 4A).** The residential rows match the State rows above. The
commercial Group R rows are: roof above deck R-33ci, attic R-53, wood framed R-13 + R-4.5ci
or R-19 + R-1.5ci, metal framed R-13 + R-8.5ci, mass wall R-13.3ci, mass floor R-16.7ci.

One finding changes the earlier draft. Continuous insulation is not only a metal-framing
item. Every wood wall row above needs either continuous insulation or R-30 in the cavity
alone, which a 2x6 wall with batts cannot hold. The draft's rule, "continuous insulation
only when framing is metal", is removed.

**Worked samples (labeled samples, not Kulka jobs).**

- Sample A: 80,000 GSF, 5 stories, wood, Nassau County ZIP, no garage. (1) Nassau, zone 4.
  (2) Five stories: commercial provisions, Group R. (3) Prescriptive R-value method. (4)
  Roof assumed low slope: R-33ci above deck. (5) Wood: R-13 + R-4.5ci or R-19 + R-1.5ci.
  Value: "Roof R-33ci above deck; walls R-13 + R-4.5ci or R-19 + R-1.5ci; 2025 ECCCNYS Table
  C402.1.3, zone 4, Group R, prescriptive."
- Sample B: 3 stories, wood, Rockland County ZIP. (1) Rockland, zone 5. (2) Three stories:
  residential provisions. (4) Roof R-30ci above deck. (5) Walls R-30, or R-20 + R-5ci, or
  R-13 + R-10ci, or R-20ci.
- Sample C: Sample A moved to Orange County with metal framing and structured parking. (1)
  Orange, zone 5. (5) Cold-formed steel reads the wood framed row: R-11 + R-10ci, or R-19 +
  R-5ci, or R-21 + R-4ci. (6) Floor over the garage R-16.7ci, over the garage area from the
  sprinkler criterion.
- If the estimator corrects the roof to pitched, Sample A's roof becomes R-53 attic
  insulation and Sample B's becomes an R-49 ceiling.

**Reason lines.** High: "Climate zone, provisions and framing are stated, and the estimator
confirmed the roof type." Low: "The roof type is assumed low slope," or "The ZIP is missing
or spans two zones," or "Framing is not set, so wood is assumed."

### I-2, Acoustic Insulation

**Question:** "Does a stated acoustic requirement beyond code minimum apply, or does the
code minimum govern?"

- `code_minimum`: Value: spec, "STC 50, Mineral Wool Batt, Interior Demising and Partition
  Walls." Method: walls and floor-ceiling assemblies separating dwelling units from each
  other, or from public or service areas, need STC 50 when lab tested (ASTM E90), or NNIC
  45 when field tested (2025 BCNYS Section 1206.2). Sample: (1) Interior Partition Wall
  Area (item 17), 120,000 SF. (2) STC requirement, code minimum, STC 50. (3) Coverage,
  120,000 SF at STC 50.
- `stated_upgrade`: Value: spec, "STC 54+, Mineral Wool Batt, per Stated Requirement."
  Same sample area; step 2 reads a stated requirement instead of the code minimum.

**Reason lines:** High: "No acoustic requirement was stated, so the code minimum governs."
Low: "A stated requirement conflicts with, or is not clearly above, the code minimum."

## 4. Confidence

I-1 reads low while the roof type is assumed, which is every run until the estimator
confirms or corrects the roof on the card. It also reads low when the ZIP is missing or
spans two zones, or when framing is not set. Once the roof is confirmed and the ZIP,
stories and framing are stated, I-1 is high, because every other value is a direct table
lookup. The reason line always says that the wall values are code values for the stated
facts and that the roof rests on the roof type.

I-2 is high by default, since the code minimum governs unless a requirement is stated. It
is low only if a stated requirement creates ambiguity against that minimum.

## 5. Pricing, proposed

I-1 and I-2 both price against item 12's confirmed code, 07.02000, at $1.25 to $1.50 per SF
for batt and $8.50 per SF for spray foam, all already stated in
`canonical-work-items.md:998-1000` from V64 and VA. Above-deck polyiso, continuous wall
insulation and insulation under a floor over the garage have no rate in any of the six
files. Each needs a stated rate from Matt before it prices as its own line rather than
folding into the blended batt rate.

V64, VA and VR were designed under the 2020 energy code. Their files show R-21 batts and
no continuous wall insulation line. Under the 2025 tables a wall needs continuous
insulation or a deeper cavity, so rates drawn from those jobs may understate a 2026 wall.

## 6. Knock-on effects, flagged and not resolved

- Roof type has no gate by design. The assumption stays until the estimator corrects the
  card.
- Tapered polyiso and continuous insulation have no cost code of their own; both fold into
  07.02000 until Matt splits the code or states it stays blended.
- The floor over a garage is not one of item 12's containers today. I-1 shows it, but item
  12 has nowhere to price it yet.
- The 2025 ECCCNYS commercial provisions also add thermal bridging limits (Table C402.1.4)
  and required additional efficiency credits (Section C406), one of which adds R-10
  continuous roof insulation. Neither is modeled.
- A town may adopt a stricter local energy code. This pass did not check any.
- The garage is assumed unconditioned. A heated garage changes the floor and garage wall
  rows.

## 7. The three boundaries

1. **Output is a quantity and a spec assumption, never a schematic.** Both values are
   `spec` strings naming R-values and materials, the same shape as every other
   `DerivedAssumption`. No assembly drawing, no drawing reading, no takeoff.
2. **No calculation that needs a fact nobody has, without flagging it.** Energy code path
   and roof type are the two assumptions, each with its own reason line. Everything else
   comes from a stored field or a code table.
3. **No new intake questions.** Climate zone comes from the ZIP. Provisions come from
   stories above grade. Roof type and energy code path are labeled assumptions the
   estimator can correct on the card. Framing System and Interior Partition Wall Area reuse
   fields that already exist.

## 8. Open questions, sorted by Matt's 2026-09-28 rule

Resolved by a rule (engineering):

1. *Should Roof Type ship as a tier-1 gate?* Resolved: no new gate. No code picks a roof
   form, so I-1 assumes low slope (under 2 in 12, the State definition) from Kulka's V64
   and VR evidence, reads low, and takes the estimator's correction on the card.
2. *Should Framing System widen to steel-framed and mass wall?* Resolved: no. The energy
   code keys its rows on the wall assembly. Wood and metal cover it: in the State
   commercial table both read "wood framed and other" (Table C402.1.3, footnote h); NYC has
   a metal framed row; residential steel frame meets U-0.045 (Section R402.2.7). Mass walls
   occur only at an unconditioned podium garage.
3. *What R-value applies when path and roof type are both assumed?* Resolved. The
   prescriptive R-value table, the baseline the performance path is measured against
   (Tables R405.4.2(1) and C407.4.1(1)), read on the row for the assumed roof type. Not the
   stricter of two candidates.
4. *Is 4A the right default climate zone?* Resolved. The zone comes from the ZIP's county
   through [NY] Tables C301.1(1) and R301.1(1). NYC is always 4A. The zone 4 default
   applies only when the ZIP is missing, and then reads low.

Still for Matt (pricing):

1. Should above-deck polyiso and continuous wall insulation get their own cost codes, or
   stay in the 07.02000 batt rate?
2. What should above-deck polyiso, continuous wall insulation and insulation under a floor
   over the garage each cost per square foot?

## 9. Build ticket contents

- I-1 as a code-only criterion that builds and saves a `DerivedAssumption`, following
  `lib/rom/jack-criterion.ts`. No Jev call.
- A ZIP-to-county table from the HUD USPS ZIP Code Crosswalk and the county-to-zone table
  above. The sprinkler criterion (LA-774) needs the same ZIP-to-county table.
- The R-value tables in section 3, State and NYC, keyed by provisions, zone, component and
  framing, each row citing its table.
- Roof Type and Energy Code Path as assumed facts with stated defaults, replaced by the
  estimator's correction when there is one.
- Framing System read from the existing project field; assumed wood when null.
- I-2 wired to item 17's wall board area.
- The shared derived-assumption card and correction flow from LA-860; no new UI.
- Test cases: samples A to C; no ZIP (zone 4, low); a ZIP spanning two zones (low); roof
  corrected to pitched (high when the rest is stated); a stated acoustic requirement above
  code minimum (I-2 low, I-1 unaffected).

## 10. Build readiness

**Inputs.** All available: ZIP (optional, with a labeled zone 4 fallback), stories above
grade, framing system, parking type and project type. Roof type is not captured and stays
a labeled assumption the estimator can correct. The build needs one new reference table,
ZIP to county, shared with LA-774.

**Adopted rules.** Climate zone from [NY] Tables C301.1(1) and R301.1(1) by county; NYC
zone 4A (2025 NYCECC Section R301.1). Residential provisions at three stories or fewer,
commercial Group R at four or more (2025 ECCCNYS definition of residential building,
Section C402.1.3). Prescriptive R-value method. R-values from [NY] Tables R402.1.3 and
C402.1.3, and 2025 NYCECC Tables R402.1.3 and C402.1.3. Steel-frame residential walls at
U-0.045 (Section R402.2.7). Acoustic STC 50 or NNIC 45 (2025 BCNYS Section 1206.2).

**Pricing left for Matt.** Whether polyiso and continuous insulation get their own cost
codes, and the rates for polyiso, continuous wall insulation and floor-over-garage
insulation.

**Can it be built now?** Yes. I-1 and I-2 can ship as Design and Engineering cards showing
the code R-values and STC, with item 12 priced at its blended batt rate as today. The
pricing answers become a stated follow-up that splits the lines and prices them.

## Sources

- NYS Department of State, 2025 Energy Conservation Construction Code of New York State,
  adoption text (definition of residential building; [NY] Tables C301.1(1), R301.1(1),
  C402.1.2, C402.1.3, R402.1.2, R402.1.3, R405.4.2(1); Sections R402.2.1, R402.2.7):
  https://dos.ny.gov/system/files/documents/2025/07/2025ecccnys_noa_2025-07-24.pdf
  (also on ICC Digital Codes: https://codes.iccsafe.org/content/NYSECC2025P1)
- Insulation Institute, New York Energy Code summary of the 2025 ECCCNYS residential
  requirements, December 2025:
  https://insulationinstitute.org/wp-content/uploads/2025/12/N112-NY-Energy-Code-1225.pdf
- NYC DOB, 2025 NYC Energy Conservation Code, Chapter R3 (Section R301.1, zone 4A):
  https://www.nyc.gov/assets/buildings/codes-pdf/energy_code_2025/2025nycecc_r3.pdf
- NYC DOB, 2025 NYCECC, Chapter R4 (Table R402.1.3):
  https://www.nyc.gov/assets/buildings/codes-pdf/energy_code_2025/2025nycecc_r4.pdf
- NYC DOB, 2025 NYCECC, Chapter C4 (Table C402.1.3):
  https://www.nyc.gov/assets/buildings/codes-pdf/energy_code_2025/2025nycecc_c4.pdf
- NYS Department of State, 2025 Building Code of New York State, Section 1206.2:
  https://dos.ny.gov/system/files/documents/2025/07/2025bcnys_noa_2025-07-24_compressed.pdf
- NYS Education Department, effective date of the 2025 Uniform Code and Energy Code:
  https://www.nysed.gov/facilities-planning/news/2025-nys-uniform-code-and-state-energy-code-will-take-effect-december-31-0
- HUD USER, USPS ZIP Code Crosswalk Files:
  https://www.huduser.gov/portal/datasets/usps_crosswalk.html
- Repo: `docs/precon/canonical-work-items.md` item 12, `lib/rom/framing.ts`,
  `docs/precon/research/la-781-insulation-r-value.md`.
