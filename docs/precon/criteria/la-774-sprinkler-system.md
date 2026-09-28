# LA-774: Sprinkler System Criteria for a Better Pricing Quantity

Design pass only. No code changes here. This reuses the shipped LA-860 mechanism
(`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`) rather than inventing a
second one, per the ticket's own instruction to read the four sibling trade tickets
together first.

Item 27 (Fire Sprinkler System, Division 21) still prices at one blended dollar-per-gross-
square-foot rate today, per `canonical-work-items.md`'s own 2026-09-18 resolution. This
design proposes three criteria that give that item a better internal quantity than flat
square feet, without reopening the quantity driver itself.

**Revised 2026-09-28.** Matt's rule: the app answers building design and engineering
questions through a researched rule and never asks him. Only pricing questions go to him.
The New Budget setup now stores stories above grade, unit count, building count, ZIP,
framing system and elevator count, so the stand-ins this design used before (the elevator
gate as a height proxy, one assumed building, no location) are gone. Section 8 lists which
old questions a rule now answers and which pricing questions remain. Section 10 says what
can be built now.

## 1. Criteria and cost codes

- **SP-1, Hazard Classification Split.** Feeds item 27's Sprinkler Piping and Heads
  container, Division 21. Names the sprinkler standard the building must use (NFPA 13 or
  NFPA 13R) and splits total GSF into garage square feet (Ordinary Hazard Group 2) and
  residential square feet (Light Hazard).
- **SP-2, Standpipe System Requirement.** Feeds item 27's Standpipe System container,
  Division 21.
- **SP-3, Fire Pump Requirement.** Not built in this pass. Item 27's resolution keeps it an
  estimator-stated gate ("Fire Pump and Pump Room... stays an estimator-stated gate for
  now"). Under the 2026-09-28 rule it should get its own researched rule instead. Section
  10 flags that as follow-up work.
- **SP-4, Trash Chute Head Count.** Feeds item 27's Sprinkler Piping and Heads container,
  cross-referenced to item 23 (Trash Compactors and Chutes, ProEst code 14.09000 for the
  chute, 11.08200 for the compactor on JF's file). The building code sets the head count:
  heads at the top of each chute, at alternate floors, at the lowest intake, and in the
  terminal room (2025 BCNYS Section 903.2.11.2).

## 2. Facts used

Facts the project already stores (`config/rom/tier1-flow.json`, `lib/rom/projects.ts`):

- `grossSquareFeet` (stated). It includes the garage, per the single dollar-per-SF basis
  Matt set on 2026-09-24.
- `storiesAboveGrade` (stated, required for multifamily).
- `unitCount` (stated, required for multifamily).
- `buildingCount` (stated, defaults to 1).
- `zip` (stated, five digits, optional).
- `framingSystem` (wood or metal). The engine turns it into a floor-to-floor figure through
  `floorToFloorFor` (10'-0" for both, Matt's planning figures of 2026-09-27).
- `parkingType` (none, surface, structured, underground, or don't know).
- Gates: `levels_below_grade`, `retail_storefronts`, `amenity_scope`, `elevator` and
  `elevatorCount`.
- `projectType`. SP-1, SP-2 and SP-4 run for multifamily. Self storage is Group S-1, where
  the NFPA 13R rule does not apply and storage hazard needs its own rule, so the cards show
  "not built for self storage" rather than guessing.

Facts derived from those by a rule, each with its source in section 3:

- **Jurisdiction.** The ZIP maps to a county through the HUD USPS ZIP Code Crosswalk
  (ZIP to county file, the county holding the largest share of residential addresses).
  Bronx, Kings, New York, Queens and Richmond counties use the NYC Building Code 2022.
  Every other New York county uses the 2025 Building Code of New York State (2025 BCNYS),
  based on IBC 2024 and in force since December 31, 2025. With no ZIP, the card assumes
  the State code and says so.
- **Heights.** Roof height and highest-floor height come from stories above grade times
  the floor-to-floor figure, plus the extra ground-floor height when `retail_storefronts`
  is yes (15'-0", `RETAIL_GROUND_FLOOR_FEET`).
- **Garage area**, **standpipe risers**, **chute count** and **chute head count**, each by
  the rules in section 3.

Assumptions that remain because no source sets a value, each labeled on the card:

- **One parking level.** No code sets how much parking a building has. Local zoning does,
  and the intake does not capture stalls or parking levels. SP-1 assumes one full parking
  level (section 3).
- **Fire department access at grade.** The code measures heights from the lowest level of
  fire department vehicle access. The app takes that as the ground floor.
- **Parapet at the code minimum.** A flat roof's parapet is taken at the 30-inch minimum
  of 2025 BCNYS Section 705.12.1. The roof itself is assumed flat, the same assumption the
  insulation criterion makes (`la-781-insulation.md`).
- **Chute presence outside New York City.** No State code requires a trash chute. SP-4
  borrows the NYC threshold as its planning test (section 3).

## 3. The rules and arithmetic

The code does every step below. None of the three criteria needs a Jev call: once the
facts are known, the rules pick the answer. That is the same pattern as V-2
(`lib/rom/jack-criterion.ts`), which saves its `DerivedAssumption` with model
"engine-rule". The card still shows every step and takes the estimator's correction.

### SP-1, Hazard Classification Split

**Step 1, sprinkler standard.**

- State rule (2025 BCNYS Section 903.3.1.2). A Group R building may use NFPA 13R only when
  all of these hold: four stories or fewer above grade plane; for R-2, the roof assembly is
  less than 45 ft above the lowest fire department vehicle access, measured to the eave of
  the highest pitched roof, the roof-to-wall line, or the top of the highest parapet,
  whichever is greatest; and the lowest story is 30 ft or less below that access. Stories
  over a podium count from grade plane. Otherwise the building uses NFPA 13 (Section
  903.3.1.1).
- This changed on December 31, 2025. The 2020 BCNYS allowed 13R up to four stories and
  60 ft, and counted stories from a podium's horizontal assembly (2020 BCNYS Section
  903.3.1.2). A four-over-one podium building could use 13R then. It needs NFPA 13 now.
- NYC rule. The NYC Building Code 2022 allows NFPA 13R, as modified by its Appendix Q, in
  Group R buildings up to six stories (NYC BC Section 903.3.1.2). The construction type
  research (`docs/precon/research/la-construction-type.md`) reports that NYC's own height
  tables cap 13R at 60 ft and that NYC does not permit Type VA, VB or IIB for R-2, so a
  wood multifamily building in NYC is Type III.
- Roof height = stories above grade x floor-to-floor, plus the ground-floor extra, plus the
  30-inch parapet when the roof is flat.
- The garage always uses NFPA 13. Section 903.3.1.2 covers Group R occupancies only, and a
  podium's lower building must be sprinklered to NFPA 13 throughout (2025 BCNYS Section
  510.2, item 6). Section 903.2.8 requires sprinklers throughout every building with a
  Group R fire area.

**Step 2, garage area.** When `parkingType` is structured or underground:

- Floor plate = GSF / (stories above grade + 1 when `levels_below_grade` is yes). This
  assumes equal floors.
- Garage SF = one floor plate (the one-parking-level assumption).
- Implied stalls = garage SF / 360 SF per stall, shown on the card only so the estimator
  can judge whether one level is right. The 360 is the middle of the short-span range, 330
  to 390 SF per space, in the CCDC Boise Parking Structure Design Guidelines (first written
  by Carl Walker, Inc., updated by Kimley-Horn, 2016). A garage under apartments is short
  span because the column grid follows the floors above.
- Kulka cross-check: VA's own file splits sprinkler area into a 40,000 SF garage breakout
  and a 203,658 SF tower (item 27). The garage is 16 percent of the building, about what
  one full parking level under five others gives.

When `parkingType` is none or surface, garage SF is zero. When it is don't know, the card
shows both results and stays low confidence.

**Step 3, hazard class.** Garage area is Ordinary Hazard Group 2. The 2022 edition of NFPA
13 moved automobile parking from Ordinary Hazard Group 1 to Group 2 (NFSA, 2024), and the
2025 BCNYS references NFPA 13-22 (Chapter 35). The rest of the building is Light Hazard,
NFPA 13's class for spaces with a low quantity and combustibility of contents. Matt's
2026-09-19 finding in item 27 already treats residential floors this way.

Two limits, named on the card rather than guessed:

- NFPA 13's annex examples do not name mechanical, trash or compactor rooms. Designers often
  treat them as Ordinary Hazard by judgment. Their area is not captured and is small, so
  SP-1 leaves them in the Light Hazard pool and says so.
- When `retail_storefronts` is yes, retail contents usually classify above Light Hazard.
  The retail area is not captured, so SP-1 does not add it and holds confidence low.

**Worked samples (labeled samples, not Kulka jobs).**

- Sample A: 150,000 GSF, 6 stories above grade, no level below grade, structured parking,
  120 units, wood, Nassau County ZIP. (1) State code. Six stories is over four: NFPA 13
  throughout. (2) Floor plate = 150,000 / 6 = 25,000 SF. (3) Garage = 25,000 SF, Ordinary
  Hazard Group 2. Implied stalls = 25,000 / 360 = about 69, or 0.58 per unit. (4) Light
  Hazard = 150,000 - 25,000 = 125,000 SF.
- Sample B: 60,000 GSF, 4 stories, no parking, wood, Suffolk County ZIP. (1) Roof = 4 x 10
  = 40 ft, plus 2.5 ft parapet = 42.5 ft, under 45 ft. Four stories or fewer. NFPA 13R is
  allowed. (2) Garage = 0. (3) Light Hazard = 60,000 SF.
- Sample C: Sample B with a retail ground floor. Roof = 15 + (3 x 10) + 2.5 = 47.5 ft. That
  is not under 45 ft, so the building needs NFPA 13.

### SP-2, Standpipe System Requirement

**State rule (2025 BCNYS Section 905.3.1).** A standpipe is required when any of these
holds: four or more stories above or below grade plane; the highest story's floor more
than 30 ft above the lowest fire department vehicle access; or the lowest story's floor
more than 30 ft below the highest access. The building is sprinklered throughout (Section
903.2.8), so Class I is allowed in place of Class III (Section 905.3.1, Exception 1).

- Highest floor height = (stories above grade - 1) x floor-to-floor, plus the ground-floor
  extra. At 10'-0" floors the story count always decides first: a three-story building
  with a retail ground floor tops out at 15 + 10 = 25 ft.
- The captured facts give at most one level below grade, which never reaches the 30 ft
  below-grade trigger.

**NYC rule (NYC BC Section 905.3.1, per NYC DOB Code Notes, Standpipe Systems).** A Class
III standpipe is required in buildings of two or more stories with 10,000 SF or more on
any story; three or more stories with 7,500 SF or more on any story; any floor with an
occupant load of 30 or more at 55 ft or more above fire department access; or occupied
floors at 75 ft or more. A residential floor reaches 30 occupants at 6,000 SF (200 gross
SF per occupant, Table 1004.5). Class I may replace Class III in sprinklered buildings
when hose cabinets are provided. Floor area per story uses the floor plate from SP-1.

**Risers.** One riser per required exit stairway, since each required interior exit
stairway gets a hose connection at every story (Section 905.4, item 1).

- Each story needs two exits while its occupant load is 500 or fewer (Table 1006.3.3). At
  200 gross SF per occupant, that holds up to a 100,000 SF floor plate. Above that, three.
- An R-2 story at the fourth story or higher may not have a single exit (Table
  1006.3.4(1)). Every building that triggers the State standpipe rule therefore has at
  least two exit stairs.
- Risers = 2 per building (3 when the floor plate exceeds 100,000 SF), times building
  count.
- Roof. Where the roof slope is under 4 in 12, a hose connection serves the roof or sits at
  the top landing of the stair that reaches the roof (Section 905.4, item 5). Buildings of
  four or more stories need that stair (Section 1011.12). With the roof assumed flat, the
  spec adds the roof connection, not an extra riser.
- A level below grade adds a hose connection on that level, not a riser.

The 2025 change to NFPA 13R does not change SP-2. Class I is allowed under either
standard, and the story count already runs from grade plane.

**Worked samples.**

- Sample A from SP-1 (6 stories, 25,000 SF floor plate, Nassau). Six stories is four or
  more: required. Occupant load per story = 25,000 / 200 = 125, so two exits and two risers.
  Result: "Standpipe System: required, Class I, 2 risers, roof hose connection."
- Sample D: 3 stories, 36,000 GSF, retail ground floor, Suffolk. Highest floor = 25 ft.
  Fewer than four stories: not required.
- Sample E: 3 stories, 30,000 GSF, Kings County ZIP. NYC rule. Floor plate = 10,000 SF, two
  or more stories with 10,000 SF on a story: required.

### SP-4, Trash Chute Head Count

**Step 1, is there a chute?**

- In New York City a multiple dwelling of five or more stories with nine or more units
  must have a refuse chute, and an R-2 multiple dwelling of four or more stories with 12 or
  more units must have a compactor (NYC BC Section 1213).
- Outside the city no code requires a chute. The 2025 BCNYS regulates chute construction
  only (Section 713.13). SP-4 borrows the NYC thresholds as its planning test and marks the
  result low confidence outside the city.
- Recycling chute: absent. NYC BC Section 1213 lets a building use separate recycling
  chutes, or instead hold recyclables in 5 SF of floor area in each chute access room. No
  State code requires a recycling chute. The estimator can add one on the card.

**Step 2, how many?** One chute and one compactor per building. Item 23's quantity driver
is already "EA per building" (LA-720, 2026-09-20). Item 23 should read this same count so
the two never drift apart.

**Step 3, heads per chute (2025 BCNYS Section 903.2.11.2).** The code requires sprinklers
at the top of the chute, at alternate floors, at the lowest intake, and in the terminal
room.

- Intake floors N = stories above grade, minus 1 when `retail_storefronts` is yes, since
  retail floors carry no units.
- Chute heads = 1 (top) + 1 (lowest intake) + floor((N - 1) / 2) for alternate floors. For N
  of 2 or more, this puts a head at every other floor below the top.
- Terminal room: at least one head per chute. A large room needs more, but its size is not
  captured.
- The code adds heads when a chute runs more than one floor below its lowest intake. The
  captured facts never place the discharge that far down, so this adds nothing today.

**Worked samples.**

- Sample A from SP-1 (6 stories, 120 units, 1 building, Nassau). The borrowed NYC test is
  met (6 stories, 120 units). One chute, one compactor. N = 6. Chute heads = 1 + 1 +
  floor(5 / 2) = 4. Terminal room 1. Total 5 heads.
- Same sample with a recycling chute the estimator added: 4 more chute heads, sharing the
  terminal room. Total 9 heads.
- Sample B (4 stories, 40 units, Suffolk). Four stories is under the five-story test: no
  chute, so no chute heads. A compactor may still sit in a trash room, covered by SP-1's
  area coverage.

## 4. Confidence rules

Each card reads high or low, the same two levels `lib/rom/jev.ts` uses.

- **SP-1.** The standard (13 or 13R) is high when stories above grade and framing are
  stated. It is low at four stories when 13R is picked, because a floor-to-floor of
  10'-7 1/2" or more ((45 - 2.5) / 4 = 10.625 ft) would put the roof at 45 ft. The garage split is
  low whenever parking is structured, underground or don't know, since it rests on the
  one-level assumption. It is high when parking is none or surface. It is low when
  `retail_storefronts` is yes. The card shows the lower of the two parts.
- **SP-2.** High when stories above grade is stated and the ZIP places the project. Low when
  the ZIP is missing, since NYC and State rules can differ. With no stories, the card shows
  the missing fact and derives nothing, the same rule V-1 follows.
- **SP-4.** High in New York City when stories and unit count are stated, since the code
  requires the chute. Low elsewhere, because chute presence rests on the borrowed test.

## 5. Feeding pricing: a proposal for Matt to confirm

Item 27 prices at one blended rate today, $3.30 to $11.00 per SF across four files, per
`canonical-work-items.md`. This design proposes, not decides:

- SP-1's two pools (Light Hazard SF and garage SF) could each price at their own rate
  instead of one blended rate. Needs a stated rate from Matt for each; none exists in the
  repo today.
- SP-1's standard could carry its own rate step. The construction type research cites an
  NMHC member estimate, reported by NFSA in 2020, that NFPA 13 costs $1 to $2 more per SF
  than 13R. That is a national trade-group figure, not a Kulka number, and this design does
  not use it as a rate.
- SP-2's required or not-required answer would gate whether the Standpipe System
  container's scope applies, a presence gate, not a new rate.
- SP-4's head count would add a small EA line inside Sprinkler Piping and Heads. Needs a
  stated per-head rate from Matt; none exists today.

## 6. Knock-on effects, flagged and not resolved

- The ticket asks the four sibling tickets and LA-771 to share one derivation mechanism.
  This design reuses LA-860's shipped `DerivedAssumption` and saves through
  `saveDerivedAssumption`, as V-2 does.
- Past Kulka jobs permitted before 2026 may carry NFPA 13R over a podium, which the 2025
  code no longer allows. Their sprinkler rates may understate a 2026 job of the same shape.
- SP-1 now decides NFPA 13 versus 13R, the fact item 16a needs for window allowance near a
  property line. Item 16a does not read it yet.
- Cross-trade findings already named against item 27: fire pump room heating (item 30),
  fire pump dedicated power and controller signals (items 31 and 32). None are resolved
  here.
- NYC's Appendix Q changes to NFPA 13 and 13R are not modeled.
- Dry-pipe protection for an unheated garage stays with item 27's Dry System container,
  gated by parking type as before.

## 7. The three boundaries

1. **Output is a quantity and an assumption, never a schematic.** Every criterion renders
   only as a `DerivedAssumption` row: label, value, method, steps, confidence. Nothing here
   produces a layout or a drawing. The app does not read drawings or perform takeoffs.
2. **No hydraulic calculation.** Fire pump has no rule in this design. It stays outside
   this pass.
3. **No new intake questions.** Every fact is a stored project field, a rule applied to
   one, or a labeled assumption (one parking level, access at grade, minimum parapet,
   borrowed chute test).

## 8. Open questions, sorted by Matt's 2026-09-28 rule

Resolved by a rule (engineering):

1. *Garage-area fraction of GSF.* Resolved. One full parking level, sized as GSF divided by
   the building's levels, with implied stalls shown at 360 SF each (CCDC Boise guidelines).
   Labeled as an assumption, because zoning, not a code, sets parking supply.
2. *Elevator as height proxy, or real story count.* Resolved. Stories above grade is a
   stored field. SP-2 applies 2025 BCNYS Section 905.3.1 (NYC BC Section 905.3.1 in the
   city) and counts risers from Sections 905.4, 1006.3.3 and 1006.3.4.
3. *Default chute and compactor count.* Resolved. NYC BC Section 1213 sets presence in the
   city and serves as the borrowed test elsewhere. One chute and one compactor per
   building, matching item 23's LA-720 driver. Heads per 2025 BCNYS Section 903.2.11.2.
4. *Recycling chute as a gate or an assumed-absent default.* Resolved. No NYS or NYC code
   requires one, so it defaults to absent with no new gate. The estimator can add it on the
   card.

Still for Matt (pricing):

1. What should garage area and Light Hazard area each cost per square foot?
2. Should an NFPA 13R building price lower per square foot than a full NFPA 13 building?
3. What should one chute sprinkler head cost, installed?
4. Were V64, VA and VR sprinklered to NFPA 13R or full NFPA 13? This decides whether their
   rates still fit a 2026 job.

## 9. What the build ticket would contain

- SP-1, SP-2 and SP-4 as code-only criteria that build and save a `DerivedAssumption`,
  following `lib/rom/jack-criterion.ts`. No Jev call.
- A ZIP-to-county table from the HUD USPS ZIP Code Crosswalk, with a flag for the five NYC
  counties. The insulation criterion (LA-781) needs the same table.
- The NFPA 13 or 13R rule, State and NYC versions, reading stories, floor-to-floor, the
  retail gate and the flat-roof parapet.
- The standpipe rule, State and NYC versions, and the riser count.
- The chute presence test, counts and head arithmetic, cross-referenced to item 23.
- Item 27's price unchanged, still the flat blended rate, until Matt answers section 8.
- Tests: samples A to E above, a four-story 13R case at the boundary, a building with no
  stories, and a ZIP with no county.

## 10. Build readiness

**Inputs.** Every input the three criteria need is stored today: GSF, stories above grade,
unit count, building count, ZIP, framing system, parking type, and the below-grade, retail
and elevator gates. None is missing. Four facts the intake does not capture are covered by
labeled assumptions: the number of parking levels, the parapet height, the level of fire
department access, and chute presence outside NYC. A missing ZIP falls back to the State
code at low confidence.

**Adopted rules.**

- Sprinkler standard: 2025 BCNYS Section 903.3.1.2 (four stories from grade plane, R-2
  roof under 45 ft); NYC BC Section 903.3.1.2 (six stories); garage always NFPA 13 (Sections
  903.2.8 and 510.2).
- Hazard: garage Ordinary Hazard Group 2 (NFPA 13-22), residential Light Hazard.
- Garage size: one floor plate; stalls at 360 SF for display only.
- Standpipe: 2025 BCNYS Section 905.3.1 and NYC BC Section 905.3.1; Class I when
  sprinklered; risers from Sections 905.4, 1006.3.3 and 1006.3.4; roof connection from
  Sections 905.4 and 1011.12.
- Chute: NYC BC Section 1213 for presence; one per building; heads from 2025 BCNYS Section
  903.2.11.2; no recycling chute by default.

**Pricing left for Matt.** Rates for garage and Light Hazard area, whether 13R prices
lower, a per-head rate, and which standard his past podium jobs used.

**Can it be built now?** Yes. SP-1, SP-2 and SP-4 can ship as Design and Engineering cards
with item 27's price left at the flat blended rate. The pricing answers become a stated
follow-up that wires the pools and the head count into the rate. SP-3, the fire pump, is
not part of this build. It needs its own researched rule before it stops being an
estimator gate.

## Sources

- NYS Department of State, 2025 Building Code of New York State, adoption text (Sections
  510.2, 705.12.1, 713.13, 903.2.8, 903.2.10, 903.2.11.2, 903.3.1.2, 905.3.1, 905.4,
  1004.5, 1006.3.3, 1006.3.4, 1011.12; Chapter 35, NFPA 13-22):
  https://dos.ny.gov/system/files/documents/2025/07/2025bcnys_noa_2025-07-24_compressed.pdf
  (also on ICC Digital Codes: https://codes.iccsafe.org/content/NYSBC2025P1)
- NYS Education Department, effective date of the 2025 Uniform Code:
  https://www.nysed.gov/facilities-planning/news/2025-nys-uniform-code-and-state-energy-code-will-take-effect-december-31-0
- 2020 Building Code of New York State, Section 903.3.1.2, on UpCodes:
  https://up.codes/viewer/new_york/ibc-2018/chapter/9/fire-protection-and-life-safety-systems
- NYC Building Code 2022, Chapter 9, on UpCodes:
  https://up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/9/fire-protection-systems
- NYC DOB, Code Notes, Standpipe Systems (BC 905.3.1):
  https://www.nyc.gov/assets/buildings/pdf/code_notes_standpipe_systems.pdf
- NYC Building Code 2022, Section BC 1213, Refuse and Recyclable Storage, on UpCodes:
  https://up.codes/s/refuse-and-recyclable-storage
- NFSA, Fire Protection for Parking Garages (NFPA 13-2022 moves parking to Ordinary Hazard
  Group 2), 2024: https://nfsa.org/2024/04/30/fire-protection-for-parking-garages/
- NFPA, Occupancy Classifications in NFPA 13 (R. Zevotek), 2025:
  https://www.nfpa.org/news-blogs-and-articles/blogs/2025/01/14/occupancy-classifications-in-nfpa-13
- CCDC Boise, Parking Structure Design Guidelines, Section 13, Parking Layout Efficiency:
  https://ccdcboise.com/wp-content/uploads/2014/11/CCDC-Boise-Parking-Structure-Design-Guidelines_2016-Final-Draft-08-04-2016.pdf
- HUD USER, USPS ZIP Code Crosswalk Files:
  https://www.huduser.gov/portal/datasets/usps_crosswalk.html
- Repo: `docs/precon/research/la-construction-type.md` (13R history, NYC construction
  types, NFSA cost note), `packages/engine/src/elevator.ts` (floor-to-floor figures).
