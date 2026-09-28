# Electrical service size, derived assumption (LA-776)

Design pass only. No code changes. Written against the LA-860 mechanism
(`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`) and the three
boundaries LA-776 shares with LA-774.

**Method changed in review, 2026-09-27.** The first pass priced general
lighting only and asked Jev to pick single-phase versus three-phase. Lighting
alone undersized the service, and buildings this size run three-phase almost
every time, so the phase choice gave Jev little to judge. That pass moved to
NEC's optional multifamily method.

**Revised 2026-09-28, under Matt's rule.** The app answers building design and
engineering questions through a researched rule and never asks Matt. Only
pricing questions go to him. This pass answers five of the six open questions
from the code, federal data and the utility's rules. It uses the facts the New
Budget flow now stores (unit count, building count, ZIP) and keeps one pricing
question. Two findings changed the method:

- NEC 220.84(B) adds a house load to every multifamily service. The amenity
  gate no longer decides whether a house load exists. It only changes how big
  it is.
- The per-unit load in the first worked example (8,000 VA) sat far below the
  NEC's own worked example unit (22,020 VA). The sample service came out near a
  third of what the code method gives.

## 1. Criterion and cost codes

Code `E-1`. Card label: **Electrical Service Size**.

Feeds item 31's Service and Distribution container (Division 26, ProEst code
family 26.05xxx), which `canonical-work-items.md` notes has "no dollar figure
isolated in any of the six files." This criterion gives it a quantity to
price against, once Matt sets a rate (section 5).

## 2. Facts used

| Fact | Where it comes from | Basis |
| --- | --- | --- |
| Project Type (`project_type`) | Intake | Stated. E-1 runs for multifamily only. |
| Construction Kind (`construction_kind`) | Intake | Stated |
| Gross Square Feet (`gross_square_feet`) | Intake | Stated |
| Unit Count (`unit_count`) | Intake, required for multifamily | Stated |
| Building Count (`building_count`) | Intake, defaults to 1 | Stated |
| ZIP (`zip`) | Intake | Stated. Names the county, and so the utility. |
| Amenity Scope (`amenity_scope` gate) | Intake | Stated, or low confidence on don't know |
| Elevator and Elevator Count (`elevator` gate, `elevator_count`) | Intake | Stated |
| Parking Type (`parking_type`) | Intake | Stated |
| Dwelling Share of Gross Area, 87 percent | DOE mid-rise apartment prototype | Assumed, sourced |
| Per-Unit Appliance Set | NEC 220.84(C), NEC Annex D Example D4(b), Census laundry data | Assumed, sourced |
| Elevator Motor, 40 HP per car | No primary source found | Assumed, low confidence |

**What the stored facts removed.** The first pass worked out Unit Count from
Gross Square Feet through an assumed GSF-per-unit ratio. Unit Count is now a
required intake field for multifamily, so that ratio and its chained error are
gone. Building Count lets the demand factor apply to each service, the way the
code applies it. ZIP tells the card which utility's service limits apply.

**No fact nobody has.** Every sourced default above is a code figure, a code
worked example, or a federal statistic. The card labels each one assumed, so
the estimator sees it and can override it.

## 3. The derivation

**Method: NEC's optional calculation for multifamily dwellings, 220.84.** It
applies one demand factor, set by unit count, to the total connected load of
the dwelling units. It then adds the house load at full value.

**Code decides every step, with no Jev call.** The first pass asked Jev whether
amenity scope adds a house load. The code answers that: a house load always
applies (220.84(B)). The one open fork, "don't know" on amenity scope, is
settled by the rule V-2 already uses for unknown ground: price the larger case
at low confidence. E-1 works like V-2 (`lib/rom/jack-criterion.ts`): the
engine does the arithmetic and builds the card directly.

### When the method applies

NEC 220.84(A) allows the method when three things hold:

1. No dwelling unit is on more than one feeder.
2. Each unit has electric cooking. An exception lets a building without
   electric cooking use this method with 8 kW per unit added for cooking,
   when that gives the lesser load.
3. Each unit has electric space heating or air conditioning, or both.

The Census Bureau counts 99 percent of new Northeast multifamily units
completed in 2025 with air conditioning, so condition 3 holds by default. E-1
always carries an 8 kW range per unit. That keeps the method valid whether the
building cooks on gas or on electric. New York's all-electric law points the
same way: the Second Circuit upheld it on June 30, 2026, though enforcement of
the state rule stays paused until the litigation ends. New York City's Local
Law 154 already limits fossil fuel in new buildings.

### Step 1. Split by building

NEC 230.2 supplies each building through one service, with listed exceptions.
Table 220.84 applies to the units on one service. So:

- Units per Building = Unit Count ÷ Building Count, rounded up.
- Gross Square Feet per Building = Gross Square Feet ÷ Building Count.
- Elevators per Building = Elevator Count ÷ Building Count, rounded up.

The even split is an assumption. When a building has fewer than 3 units,
220.84 does not apply. E-1 then shows no figure and says why.

### Step 2. Connected load per unit, 220.84(C)

| 220.84(C) item | Default per unit | Source |
| --- | --- | --- |
| (1) General lighting and receptacles | 3 VA per square foot × Average Unit Area | NEC 220.84(C)(1) |
| (2) Two small-appliance circuits | 3,000 VA | NEC 220.84(C)(2), 220.52(A) |
| (2) Laundry circuit | 1,500 VA | NEC 220.52(B) |
| (3) Range | 8,000 VA | 220.84(A)(2) exception basis; Annex D Example D4(b) |
| (3) Clothes dryer | 5,000 VA | NEC 220.54 minimum |
| (3) Water heater | 2,500 VA | Annex D Example D4(b) |
| (5) Larger of heating or air conditioning | 6,000 VA | Annex D Example D4(b) |

Average Unit Area = Gross Square Feet per Building × 0.87 ÷ Units per
Building. The 0.87 comes from DOE's mid-rise apartment prototype, where the
apartments take 87 percent of the gross area and corridors and a leasing office
take the rest (the high-rise prototype gives 89 percent).

Where each default comes from, and what it assumes:

- **Annex D Example D4(b)** is the NEC's own worked multifamily example: an
  840 square foot unit with an 8 kW range, 6 kW of electric heat and a 2.5 kW
  water heater, 22,020 VA connected per unit. E-1 keeps its appliances and
  replaces its floor area with the project's own.
- **Laundry in the unit.** The Census Bureau counts 63 percent of new
  Northeast multifamily units completed in 2025 with laundry in the unit, and
  87 percent nationally. In-unit laundry is the majority case, so E-1 includes
  the laundry circuit and the dryer. It errs high where laundry is shared.
- **Water heating.** A central water heater moves the 2,500 VA from the units
  to the house load.
- **Heating and cooling.** The 6,000 VA is the NEC example unit's heat, not a
  sized heat pump. Once M-1 (LA-777) is built, its tonnage per unit could
  replace this figure.

### Step 3. Dwelling demand

Dwelling Demand = Units per Building × Connected Load per Unit × the Table
220.84 factor for Units per Building. The table, as read from the NEC text:

| Units | Factor | Units | Factor | Units | Factor |
| --- | --- | --- | --- | --- | --- |
| 3 to 5 | 45% | 18 to 20 | 38% | 34 to 36 | 30% |
| 6 to 7 | 44% | 21 | 37% | 37 to 38 | 29% |
| 8 to 10 | 43% | 22 to 23 | 36% | 39 to 42 | 28% |
| 11 | 42% | 24 to 25 | 35% | 43 to 45 | 27% |
| 12 to 13 | 41% | 26 to 27 | 34% | 46 to 50 | 26% |
| 14 to 15 | 40% | 28 to 30 | 33% | 51 to 55 | 25% |
| 16 to 17 | 39% | 31 | 32% | 56 to 61 | 24% |
| | | 32 to 33 | 31% | 62 and over | 23% |

### Step 4. House load, 220.84(B)

NEC 220.84(B) says house loads are calculated under Part III and added to the
dwelling demand. The Table 220.84 factor does not reduce them. E-1 sizes the
parts the stored facts reach:

- **Common-area lighting and receptacles.** Common Area = Gross Square Feet per
  Building × 0.13, the non-dwelling share from the same DOE prototype. The unit
  load is 0.5 VA per square foot ("halls, corridors, closets, stairways") when
  amenity scope is no. It is 2 VA per square foot ("clubs") on the same area
  when amenity scope is yes or don't know. Both values are from the 2014 NEC
  Table 220.12, read for this pass. The 2020 edition rebuilt that table on
  energy-code lighting power and dropped the corridor row, so these values run
  higher than current code and err high. Charging the whole common area at the
  clubs rate is a stand-in, labeled low confidence, because the intake does not
  measure amenity space.
- **Elevators.** One motor per car. No manufacturer planning guide read for
  this pass gives motor ratings: documents from Otis, Schindler, KONE, TK
  Elevator and Nidec (Canton) were checked. **Proposed assumption, low
  confidence:** 40 HP per car. That is a stock Nidec (US Motors) dry hydraulic
  elevator motor, which a distributor lists for elevators "usually five stories
  or less." NEC Table 430.250 gives 114 A for 40 HP at 208 V three-phase, which
  is 41,070 VA. Following 220.50 and 430.24, the largest motor counts at 125
  percent and the rest at 100 percent. For a traction car this errs high. The
  elevator vendor's data replaces it.
- **Left out, and named on the card.** Pool and sauna heaters and pumps,
  corridor make-up air and other common HVAC, garage exhaust and lighting, site
  lighting, EV charging, and the fire pump (item 27, which NFPA 20 feeds
  separately). No stored fact sizes any of these.

### Step 5. Amps and service size

- **Voltage.** E-1 always uses 208Y/120 V three-phase. Apartments run on 120/208 V
  taken from a three-phase wye. PSEG Long Island, which serves Nassau and
  Suffolk, supplies 208Y/120 V up to 4,000 A for one service from a pad-mount
  transformer. It caps 480Y/277 V at 2,500 A (Red Book sections 3.5.2 and
  5.2.4).
- Amps = Service Load in VA ÷ (208 × 1.732).
- **Round up** to the next standard NEC 240.6(A) rating at 400 A or more: 400,
  450, 500, 600, 700, 800, 1,000, 1,200, 1,600, 2,000, 2,500, 3,000 or 4,000.
- **Above 4,000 A for one building**, E-1 still reports the amps. The card
  drops to low confidence and says the engineer would split the service (NEC
  230.2 allows more than one service for capacity) or go to 480Y/277 V with
  step-down transformers. PSEG Long Island must approve more than one service
  entrance. Outside PSEG Long Island's territory the 4,000 A figure is a
  planning limit, not the local utility's stated rule.

### Worked example

Sample project: 101,200 GSF multifamily, new construction, 107 units, one
building, ZIP 11743 (Huntington, Suffolk County, PSEG Long Island), amenity
scope yes, two elevators, surface parking. These are sample facts, not a Kulka
job.

1. Units per Building = 107. Demand factor, 62 and over = 23 percent.
2. Average Unit Area = 101,200 × 0.87 ÷ 107 = 823 square feet. Lighting =
   2,468 VA.
3. Connected Load per Unit = 2,468 + 3,000 + 1,500 + 8,000 + 5,000 + 2,500 +
   6,000 = 28,468 VA.
4. Dwelling Demand = 107 × 28,468 × 0.23 = 700,610 VA.
5. Common Area = 101,200 × 0.13 = 13,156 square feet. At the clubs rate,
   13,156 × 2 = 26,312 VA.
6. Elevators = 1.25 × 41,070 + 41,070 = 92,408 VA.
7. House Load = 26,312 + 92,408 = 118,720 VA.
8. Service Load = 700,610 + 118,720 = 819,330 VA. Amps = 819,330 ÷ 360.3 =
   2,274 A. That rounds up to a **2,500 A service** at 208Y/120 V.

For comparison, the same building with no amenity scope and no elevator:
700,610 + 6,578 = 707,188 VA, about 1,963 A, which rounds up to 2,000 A.

**Reason lines:**
- High: "New construction with no amenity scope and no elevator; every load in
  the figure comes from the NEC method and its worked example."
- Low, amenity: "Amenity scope is yes or don't know. Its space and equipment
  are not measured, so the common area is priced at the clubs rate and pool or
  sauna equipment is left out."
- Low, elevator: "Elevator motors carry a 40 HP placeholder until the elevator
  vendor's data replaces it."
- Low, renovation: "A renovation may keep its existing service, and NEC 220.87
  lets the engineer size from measured demand instead."
- Low, parking: "Gross square feet include a structured or underground garage,
  which inflates the unit area, and garage exhaust is not sized."
- Low, over 4,000 A: "One service at 208Y/120 V tops out at 4,000 A with PSEG
  Long Island; the engineer would split the service or go to 480Y/277 V."

## 4. Confidence rules

- **No figure** when the project is not multifamily, when Unit Count is blank,
  or when a building has fewer than 3 units. The card says which fact is
  missing and invents none, the same rule V-1 follows for Stories Above Grade.
- **High** when the project is new construction, amenity scope is no, the
  elevator gate is no, parking is none or surface, and each building needs
  4,000 A or less.
- **Low** otherwise, and the reason names every trigger that applies:
  renovation, amenity yes or don't know, elevator yes, structured or
  underground parking, or more than 4,000 A for one building.
- The per-unit appliance set and the dwelling share are assumed defaults, even
  though each is sourced. The card carries the assumed-fact flag
  (`showsAssumedFact`) for as long as the estimator leaves them uncorrected.

## 5. Feeding pricing (a question for Matt)

Service size in amps gives Service and Distribution its own quantity driver,
separate from item 31's blended rate per square foot. Branch power, lighting,
and everything else keep their current pricing. No source file isolates a
dollar figure for this container, so pricing it needs Matt's answer to the one
question in section 8. Until then E-1 shows its amps and service size with no
dollar amount, the way a TBD line shows a quantity with no price. A job with
more than one building has one service per building; the card shows the size
of each and the count.

## 6. Knock-on effects, flagged and not resolved

- The chain of assumptions is shorter. Unit Count is stated, so only the
  dwelling share and the appliance set remain assumed ahead of the arithmetic.
- The dwelling lighting load may overlap with item 31's Branch Power and
  Devices container, already priced per square foot. Pricing this container by
  amperage without checking risks double-counting.
- Item 27's Fire Pump Dedicated Power Supply and item 31's Emergency Generator
  both touch service capacity. This design does not reconcile with either.
- **Code edition.** New York State's 2025 Uniform Code took effect December 31,
  2025 and incorporates NFPA 70; trade sources report it references the 2023
  edition. New York City's 2025 Electrical Code is based on the 2020 edition.
  This pass read Article 220 in the 2014 text. The build should confirm Table
  220.84 and the 220.84(C) items against the 2020 and 2023 texts. They match in
  the editions we know, but that was not re-read online.
- If the state's all-electric rule stays paused and a building goes back to gas
  heat, the 6,000 VA heating term overstates. The 8 kW range stays valid either
  way, through the 220.84(A)(2) exception.

## 7. The three boundaries

1. **Quantity and assumption, never a schematic.** The output is an amp figure
   and a service size on a labeled card. There is no panel schedule and no
   one-line diagram.
2. **No fact nobody has.** The method reads intake facts, NEC defaults and
   federal data. It never asks for appliance or HVAC nameplate data. The two
   gaps no source fills, amenity equipment and elevator motors, show as named
   placeholders at low confidence.
3. **No new intake questions.** Every fact above is already in
   `tier1-flow.json`, or is a sourced default the card labels assumed.

Standing rule held too: E-1 sizes a planning quantity from code tables and
stated facts. Nothing here reads a drawing or performs a takeoff.

## 8. Open questions for Matt

**Resolved under the 2026-09-28 rule.** Each was an engineering question, so
the app now answers it:

| # | Question | Class | Rule adopted |
| --- | --- | --- | --- |
| 1 | What GSF-per-unit ratio should E-1 assume? | Engineering | Not needed. Unit Count is stored. |
| 2 | What per-unit VA default? | Engineering | NEC 220.84(C), item by item, with Annex D Example D4(b) appliances and in-unit laundry from Census data (section 3, step 2). |
| 3 | What VA default for the house load with amenity scope? | Engineering | NEC 220.84(B): a house load always applies. Amenity scope moves the common-area unit load from 0.5 to 2 VA per square foot, a labeled stand-in. No source sizes amenity equipment, so it stays out and named. |
| 4 | Should "don't know" on amenity price with or without the house load? | Engineering | Price it like yes, at low confidence, the rule V-2 uses for unknown ground. |
| 6 | Always 208Y/120 V, or vary by size? | Engineering | Always 208Y/120 V three-phase. Above 4,000 A for one building, flag a split service or 480Y/277 V (PSEG Long Island Red Book). |

**Still for Matt, pricing:**

5. Should Service and Distribution price by a rate per amp, or by a lump sum
   for each service size, and at what figures?

## 9. What the build ticket would contain

- Add `E-1` to the derived-assumption registry, reading Project Type,
  Construction Kind, Gross Square Feet, Unit Count, Building Count, ZIP,
  Amenity Scope, Elevator, Elevator Count and Parking Type.
- Implement steps 1 to 5 as pure engine functions: the building split, the
  220.84(C) connected load, Table 220.84, the 220.84(B) house load, and the
  amps with 240.6(A) rounding and the 4,000 A check.
- Build the card directly in code, the way `lib/rom/jack-criterion.ts` builds
  V-2, with no Jev call. Show every step as a card step.
- Render it with the existing derived-assumption card from LA-860.
- Leave Service and Distribution unpriced until Matt answers question 5.
- Test the arithmetic against the worked example and the comparison case, plus
  a two-building case and a two-unit building (no figure).

## 10. Sources

- NFPA 70 Article 220, 2014 text as read for this pass (220.12 and Table
  220.12, 220.52, 220.54, 220.84 and Table 220.84):
  https://site.ieee.org/icps-ehe/files/2015/11/13-9-NFPA-70_-National-Electrical-Code-NEC-Article-220.pdf
- NFPA 70 Annex D, Example D4(b), Optional Calculation for Multifamily
  Dwelling, read from the 2005 handbook text:
  https://flylib.com/books/en/2.419.1/example_no_d4_b_optional_calculation_for_multifamily_dwelling.html
- NEC 230.2, 240.6(A), 430.24, 220.50, 220.87 and Table 430.250 are cited from
  the code. Their text was not re-read online for this pass.
- US Census Bureau, Characteristics of New Housing 2025 (published July 1,
  2026), multifamily units completed by laundry location and by air
  conditioning:
  https://www.census.gov/construction/chars/xls/mfu_laundry_cust.xls and
  https://www.census.gov/construction/chars/xls/mfu_aircond_cust.xls
- DOE Building Energy Codes Program, IECC 2021 Mid-rise and High-rise
  Apartment prototypes (zone floor areas used for the 87 percent dwelling
  share): https://www.energycodes.gov/prototype-building-models
- PSEG Long Island Red Book, sections 3.5.2, 5.2.4 and 6.1.2, read from the
  2017 edition text: https://sceca.com/wp-content/uploads/2023/02/Redbook.pdf.
  Current edition: https://www.psegliny.com/buildingrenovationservices/codesandstandards/redbook
- Second Circuit, Mulhern Gas Co. v. Mosley, June 30, 2026:
  https://law.justia.com/cases/federal/appellate-courts/ca2/25-977/25-977-2026-06-30.html.
  On the paused state rule: https://www.nahb.org/blog/2026/07/gas-appliance-ban-upheld-in-new-york
- Nidec (US Motors) 40 HP dry hydraulic elevator motor listing:
  https://www.cshincorporated.com/dh40s2bf-3-phase-odp-dry-hydraulic-elevator-motor-40-hp/
- New York City 2025 Electrical Code, based on NFPA 70 2020:
  https://www.nyc.gov/site/buildings/codes/electrical-code.page
- New York State Uniform Code: https://dos.ny.gov/building-standards-and-codes

## 11. Build readiness

**Inputs.** Every input is available. Project Type, Construction Kind, Gross Square Feet,
Unit Count, Building Count, ZIP, Amenity Scope, Elevator, Elevator Count and
Parking Type are all stored by the live New Budget flow. Nothing is missing.
The build adds only constants: Table 220.84, the 240.6(A) ratings, one row of
Table 430.250 and the DOE dwelling share.

**Rules adopted.**
- NEC 220.84 optional method, applied per building (230.2).
- Connected load per unit from 220.84(C), with Annex D Example D4(b)
  appliances and in-unit laundry (Census 2025).
- House load always added (220.84(B)): common-area lighting at 2014 Table
  220.12 rates, and elevators at a labeled 40 HP placeholder.
- 208Y/120 V three-phase, rounded up to a 240.6(A) rating, with a 4,000 A
  check from the PSEG Long Island Red Book.
- "Don't know" on amenity prices like yes, at low confidence.

**Pricing still open.** One question remains: a rate per amp or a lump sum per
service size, and the figures.

**Verdict.** E-1 can be built now. The card would show amps and service size
with no dollar figure, and pricing would follow as a stated follow-up once Matt
answers question 5.
