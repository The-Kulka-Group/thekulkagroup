# LA-777: HVAC tonnage from code-minimum envelope and ventilation

Design pass only, no code changes. Uses the shared derived-assumption mechanism
shipped in LA-860 (`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`).

**Revised 2026-09-28, under Matt's rule.** The app answers building design and
engineering questions through a researched rule and never asks Matt. Only
pricing questions go to him. This pass answers three of the five open
questions outright and the engineering half of a fourth. It uses the facts the
New Budget flow now stores (ZIP, unit count, stories, parking type). Two
pricing questions stay with Matt. The largest change is in M-1's last step:
the missing square-feet-per-ton benchmark now comes from DOE's own
code-minimum apartment models, sized in New York weather.

## 1. Criteria and cost codes

Two cards, so window area carries its own flag instead of hiding inside the
tonnage arithmetic.

- **M-0, "Window Area and Orientation."** A spec choice: the glazing band this
  building's walls likely carry. Feeds M-1.
- **M-1, "HVAC Tonnage."** A quantity in tons, feeding Item 30's containers 1
  (In-Unit Equipment), 2 (Distribution), 3 (Ventilation and Louvers), and
  conditionally 6 (Central Plant Equipment), per `canonical-work-items.md`.

Both cards read **Climate Zone**, a fact shared with LA-781 and owned by
neither. It is now derived from the project's ZIP (section 2).

## 2. Facts used

These facts are stated, all from `tier1-flow.json`: Project Type (`project_type`), Gross
Square Feet (`gross_square_feet`), Construction Kind (`construction_kind`),
ZIP (`zip`), Unit Count (`unit_count`), Stories Above Grade
(`stories_above_grade`), Parking Type (`parking_type`), Balconies
(`balconies`, a gate), Retail Storefronts (`retail_storefronts`, a gate).

Climate Zone is derived from ZIP. Unit Mix by Bedroom Count is assumed, from a
sourced default.

M-1 runs for multifamily only. DOE publishes no self-storage prototype, so a
self-storage project gets no tonnage card until a separate rule is written.

### Climate Zone, from ZIP

The first pass assumed zone 4A for every job because the intake had no
address. The intake now stores a five-digit ZIP, so the zone comes from a code
table:

1. **ZIP to county.** Use HUD's USPS ZIP-to-County crosswalk, which HUD updates
   every quarter. A ZIP that crosses a county line takes the county holding the
   largest share of its residential addresses (the file's `RES_RATIO` field).
2. **County to zone.** Use New York's Table C301.1(1) (commercial) and Table
   R301.1(1) (residential) in the 2025 Energy Conservation Construction Code
   of New York State. That code took effect December 31, 2025 and is based on
   the 2024 IECC. Both tables list the same counties:

| Zone | New York counties |
| --- | --- |
| 4 | Bronx, Kings, Nassau, New York, Queens, Richmond, Suffolk, Westchester |
| 5 | Albany, Allegany, Broome, Cattaraugus, Cayuga, Chautauqua, Chemung, Columbia, Cortland, Dutchess, Erie, Genesee, Greene, Livingston, Monroe, Niagara, Onondaga, Ontario, Orange, Orleans, Oswego, Putnam, Rensselaer, Rockland, Saratoga, Schenectady, Schoharie, Schuyler, Seneca, Steuben, Tioga, Tompkins, Washington, Wayne, Wyoming, Yates |
| 6 | Chenango, Clinton, Delaware, Essex, Franklin, Fulton, Hamilton, Herkimer, Jefferson, Lewis, Madison, Montgomery, Oneida, Otsego, St. Lawrence, Sullivan, Ulster, Warren |

The New York table prints the zone number with no moisture letter. The first
pass's "4A" is zone 4 here. The table matters for Kulka's own area: Rockland,
Putnam, Orange and Dutchess are zone 5, so the old 4A default was wrong there.

- **Stated** when the ZIP maps to one county, or when every county it touches
  shares one zone.
- **Assumed, low confidence** when the ZIP's counties sit in different zones,
  when the ZIP is blank, or when the ZIP is outside New York. The card then
  uses zone 4, since most Kulka work is on Long Island, and says why. Adding
  New Jersey and Connecticut counties from the base IECC table is a follow-up
  if Kulka takes work there.

LA-781 reads the same derived fact, so one ZIP correction rederives both
tickets' cards.

### Unit Mix by Bedroom Count

No code or standard sets a default bedroom mix, so this uses federal data. The
Census Bureau's Characteristics of New Housing for 2025 (published July 1,
2026) counts new Northeast multifamily units completed as 13 percent studios,
42 percent one-bedroom, 37 percent two-bedroom and 8 percent three bedrooms or
more. That is **1.40 bedrooms per unit** on average, counting "three or more"
as three, which makes 1.40 a floor. The national mix gives 1.50. M-1 uses the
Northeast figure. The fact carries `basis: "assumed"` and feeds only M-1's
ventilation check (step 5 below).

## 3. DerivationRequests

### M-0, Window Area and Orientation

**Question:** "Do the facts point this building toward a standard window-to-wall
ratio, or an elevated one?"

**Candidates:**
- `standard`: "No balconies, no storefronts, or the two disagree." Value: spec
  "Standard Glazing Band," a 19.9 percent window-to-wall ratio, the ratio in
  DOE's mid-rise apartment prototype. Method: "Default ratio, no signal toward
  more glass."
- `elevated`: "Balconies and storefronts both present." Value: spec "Elevated
  Glazing Band," a 29.8 percent ratio, the ratio in DOE's high-rise apartment
  prototype. That sits at New York's prescriptive cap: vertical glazing of no
  more than 30 percent of the gross above-grade wall (2025 code, Section
  C402.5.1). Method: "Balcony doors and storefront glazing both push window
  area above the default."

**Confidence:** high, "Balconies and storefronts agree, both present or both
absent." low, "No code or intake fact measures window area directly; even an
agreeing signal is a proxy, not a measurement." Set `highConfidenceAt` at 0.9,
so this card reads low most of the time by design: window area is the one
input in this chain that code never fixes. Code only caps it.

### M-1, HVAC Tonnage

**Code decides every step, with no Jev call.** Every step below is a table read or arithmetic,
so the engine builds the card directly, the way V-2 does
(`lib/rom/jack-criterion.ts`).

**Paths:**
- `code_minimum`, new construction: tonnage from DOE's code-minimum model.
- `code_minimum_floor`, renovation: the same figure, at low confidence. New
  York's code (Section C503.1) makes altered work meet new-construction rules
  without requiring the unaltered parts of the building to comply. A
  renovation that keeps its walls and windows can therefore perform worse
  than the model, so the figure is a floor. The first pass sent this case back
  to the estimator. Under Matt's rule the app gives the floor and says so.

**Engine arithmetic:**
1. Read Climate Zone, derived from ZIP (section 2).
2. Pick the DOE prototype from M-0's band: Standard Glazing Band uses the
   mid-rise apartment prototype, and Elevated Glazing Band uses the high-rise
   prototype.
3. Read the prototype's tons per 1,000 gross square feet for that zone, from
   the table below.
4. Tons = Gross Square Feet × that ratio ÷ 1,000, rounded to a whole ton.
5. **Ventilation check.** Average Dwelling Area = Gross Square Feet × 0.87 ÷
   Unit Count (0.87 is the apartment share of gross area in the mid-rise
   prototype). ASHRAE 62.2 sets each unit's whole-dwelling rate at 0.03 cfm per
   square foot plus 7.5 cfm per person, with persons equal to bedrooms plus
   one. With 1.40 bedrooms that is 0.03 × Area + 18 cfm per unit. Divide by
   the area for cfm per 1,000 square feet. Both prototypes carry 0.026 cubic
   meters per second of outdoor air per 950 square foot apartment, about 55
   cfm, or 58 cfm per 1,000 square feet. When the project's rate is higher
   (roughly when the average unit is under 643 square feet), the ratio may
   understate the ventilation load, and the card drops to low confidence and
   says so. The check adds no tons; it only flags.

**Tons per 1,000 gross square feet, from DOE's IECC 2021 apartment
prototypes:**

| Zone (DOE weather file) | Standard band: mid-rise, 4 stories, 19.9% glazing | Elevated band: high-rise, 10 stories, 29.8% glazing |
| --- | --- | --- |
| 4 (New York, JFK Airport) | 1.45 (688 GSF per ton) | 1.64 (609 GSF per ton) |
| 5 (Buffalo) | 1.43 (701 GSF per ton) | 1.61 (619 GSF per ton) |
| 6 (Rochester, Minnesota) | 1.49 (672 GSF per ton) | 1.71 (584 GSF per ton) |

**What these numbers are.** Each is the rated total cooling capacity EnergyPlus
sized for every apartment's cooling coil, with zone multipliers counted,
divided by the model's gross floor area (33,741 square feet for the mid-rise
with 31 units, 84,351 for the high-rise with 79 units). We summed the coils
from the "Component Sizing Summary" in each model's output file in DOE's zip.
Each model sizes with a 1.2 cooling sizing factor (its `Sizing:Parameters`),
so the ratio is an equipment size with DOE's margin built in, not a bare load.
The models use the IECC 2021 envelope for each zone, per-unit split DX with a
gas furnace in the mid-rise, and water-to-air heat pumps in the high-rise.
Both leave corridors unconditioned.

The two prototypes differ in height as well as glazing. The high-rise's ratio
therefore mixes a glazing effect with a smaller roof share per floor. It is
used for the elevated band because its glazing matches the code cap. DOE's
zone 6 model runs Rochester, Minnesota weather, its representative city for
that zone, not an upstate New York station.

**Worked example, sample project only:** 130,000 GSF multifamily, new
construction, 140 units, ZIP 11743 (Huntington, Suffolk County), balconies
yes, storefronts no, surface parking.
1. Suffolk is zone 4. Climate Zone is stated.
2. Balconies and storefronts disagree, so M-0 gives Standard Glazing Band.
   M-1 uses the mid-rise prototype.
3. Ratio for zone 4, standard band: 1.453 tons per 1,000 GSF.
4. Tons = 130,000 × 1.453 ÷ 1,000 = 188.9, so **189 tons**, about 688 GSF per
   ton.
5. Average Dwelling Area = 130,000 × 0.87 ÷ 140 = 808 square feet. ASHRAE
   62.2: 0.03 × 808 + 7.5 × 2.40 = 42.2 cfm per unit, or 52.3 cfm per 1,000
   square feet. That is under the prototype's 58, so the check passes.

With the elevated band the same building gives 130,000 × 1.643 ÷ 1,000 = 214
tons. The first pass's example gave 91 tons from a single-family Manual J
average (1,431 square feet per ton). That figure was never a multifamily
number, and it carried no sizing margin.

## 4. Confidence rules

**M-0** is high only when Balconies and Retail Storefronts agree, and low
otherwise, including when either is unanswered.

**M-1** is high when the project is new construction, Climate Zone is stated
from the ZIP, parking is none or surface, and the ventilation check passes. It
is low, with a reason naming each trigger, for:
- a renovation (the figure is a floor, Section C503.1);
- an assumed Climate Zone (ZIP blank, outside New York, or split across zones);
- structured or underground parking, because Gross Square Feet then include an
  uncooled garage of unknown size and the figure errs high;
- a failed ventilation check.

Unit Mix and M-0's band carry `basis: "assumed"`, so `showsAssumedFact` flags
M-1 while either stays uncorrected. A correction to either card records
reason, who, and when, with the computed value kept underneath, the same as
any other override.

## 5. Feeding pricing, a question for Matt

Item 30 prices today as a blended rate, $18.00 to $30.00 per square foot across
three files (`canonical-work-items.md`, Item 30), gated by HVAC System Type but
not split by it for lack of tagged data. One option is to price containers 1,
2, 3, and 6 as tonnage times a rate per ton that still forks by HVAC System
Type (PTAC, ducted split, central plant), the gate already in `rom-spec.md`.
**No per-ton rate exists for any system type.** Whether to move to per-ton
pricing at all is Matt's call (section 8). Containers 4, 5, 7, 8, and 9 keep
their existing drivers.

## 6. Knock-on effects, flagged and not resolved

- Tonnage-based pricing waits on Matt's pricing answer and on per-ton rates by
  HVAC System Type, LA-687/LA-720 work.
- Climate Zone is shared state. A ZIP correction should rederive both this
  ticket's cards and LA-781's. `rederive` and `changedCriteria` support this;
  nothing wires the three cards to one stored fact yet.
- New York's 2025 code is based on the 2024 IECC. DOE's newest apartment
  prototypes on its site use the 2021 IECC. The 2024 envelope is the same or
  tighter, so the 2021 ratio may err slightly high.
- The IECC treats an R-2 building of three stories or fewer as residential,
  under the residential envelope tables. Both prototypes are four stories or
  taller and follow the commercial tables, so a walk-up gets a stand-in ratio.
- The prototypes leave corridors unconditioned. New York multifamily corridors
  usually get conditioned make-up air, which the ratio leaves out.
- Tonnage now scales with gross area, not with the unit mix, so Unit Mix only
  feeds the ventilation check.

## 7. The three boundaries

1. **Output is a quantity and an assumption, never a schematic.** M-0 and M-1
   show as labeled cards with arithmetic and a correction control, the shape
   already shipped for duration and GSF-per-unit. They are never a load-calc
   report or anything mistakable for a Manual J submittal. The card says the
   ratio comes from DOE's code-minimum model, not from a load calculation for
   this building.
2. **No calculation on an unstated fact without flagging it.** Unit Mix and
   M-0's band carry `basis: "assumed"`. Climate Zone carries it too whenever
   it falls back to zone 4.
3. **No new intake questions.** Every fact above already exists in
   `tier1-flow.json`, or is a sourced default the card labels assumed.

Standing rule held too: M-1 sizes a planning quantity from code tables, DOE
models and stated facts. Nothing here reads a drawing or performs a takeoff.

## 8. Open questions for Matt

**Resolved under the 2026-09-28 rule.** Each was an engineering question, so
the app now answers it:

| # | Question | Class | Rule adopted |
| --- | --- | --- | --- |
| 1 | Confirm IECC 4A as the default Climate Zone | Engineering | ZIP to county through HUD's crosswalk, then county to zone through New York's Table C301.1(1) and R301.1(1). Zone 4 stays only as a labeled fallback. |
| 3 | What default bedroom mix? | Engineering | Census 2025, new Northeast multifamily: 13, 42, 37 and 8 percent, 1.40 bedrooms per unit. |
| 4, first half | What turns airflow and envelope into tons? | Engineering | DOE IECC 2021 apartment prototypes: tons per 1,000 GSF by zone and glazing band, with an ASHRAE 62.2 ventilation check. |
| 5 | Is the M-0 and M-1 split right? | Engineering | Keep it. Window share is the one input code leaves open, and each band now maps to a DOE prototype, a swing of about 13 percent that the M-0 card makes visible. |

**Still for Matt, pricing and job data:**

2. Should HVAC price by tonnage times a rate per ton for each system type, or
   stay per square foot with tonnage shown as a check?
4. Do any closed Kulka jobs record installed tonnage, so we can check the DOE
   ratio against real work?

## 9. What the build ticket would contain

- Climate Zone as a derived fact that LA-777 and LA-781 both read: a New York
  ZIP-to-county table built from HUD's crosswalk, and the county-to-zone table
  above.
- M-0's DerivationRequest, wired through `lib/rom/jev.ts`, with the two band
  values set to 19.9 and 29.8 percent.
- M-1 built directly in code: the prototype ratio table (six numbers, with
  their provenance), the tonnage arithmetic and the ventilation check, as pure
  functions tested apart from any Jev call.
- M-1's tonnage wired into Item 30's containers 1, 2, 3, and 6 only if Matt
  picks per-ton pricing and supplies rates.
- M-0 and M-1 rendered in the assumptions panel with the existing card,
  correction, and revert UI from LA-860.
- Tests: the worked example, a zone 5 ZIP (a Rockland ZIP), a ZIP that crosses
  zones, a renovation, a small-unit project that fails the ventilation check,
  and a `rederive` test for a ZIP correction reaching both tickets' cards.

## 10. Sources

- 2025 Energy Conservation Construction Code of New York State, Tables
  C301.1(1) and R301.1(1), and Sections C302.1 and R302.1:
  https://up.codes/viewer/new_york/iecc-2024/chapter/CE_3/ce-general-requirements
  and https://up.codes/viewer/new_york/iecc-2024/chapter/RE_3/re-general-requirements
- Same code, Section C402.5.1 (30 percent glazing cap):
  https://up.codes/viewer/new_york/iecc-2024/chapter/CE_4/ce-commercial-energy-efficiency
- Same code, Section C503.1 (alterations):
  https://up.codes/viewer/new_york/iecc-2024/chapter/CE_5/ce-existing-buildings
- Effective date and IECC 2024 basis: https://codes.iccsafe.org/content/NYSECC2025P1
- HUD USPS ZIP Code Crosswalk Files:
  https://www.huduser.gov/portal/datasets/usps_crosswalk.html
- US Census Bureau, Characteristics of New Housing 2025, multifamily units
  completed by number of bedrooms:
  https://www.census.gov/construction/chars/xls/mfu_bedrooms_cust.xls
- DOE Building Energy Codes Program, prototype building models:
  https://www.energycodes.gov/prototype-building-models. Files read:
  https://www.energycodes.gov/sites/default/files/2023-10/IECC_ApartmentMidRise_STD2021.zip
  and https://www.energycodes.gov/sites/default/files/2023-10/IECC_ApartmentHighRise_STD2021.zip
  (NewYork, Buffalo and Rochester output tables).
- ASHRAE 62.2, Section 4.1.1, total required ventilation rate:
  https://up.codes/s/total-required-ventilation-rate-ashrae-62-2-4-1-1
- Earlier sources kept for context: Energy Vanguard on load calculations versus
  rules of thumb,
  https://www.energyvanguard.com/blog/air-conditioner-sizing-load-calculations-vs-rules-of-thumb/,
  and GreenBuildingAdvisor on Manual J results,
  https://www.greenbuildingadvisor.com/article/manual-j-load-calculations-vs-rules-of-thumb

## 11. Build readiness

**Inputs.** Every input is available. Project Type, Gross Square Feet, Construction
Kind, ZIP, Unit Count, Stories Above Grade, Parking Type, Balconies and Retail
Storefronts are all stored by the live New Budget flow. Nothing is missing
from the intake. The build adds data, not questions: a New York ZIP-to-county
table from HUD's crosswalk, the county-to-zone table and the six DOE ratios.

**Rules adopted.**
- Climate Zone from ZIP, through HUD's crosswalk and New York's Table
  C301.1(1) and R301.1(1), with zone 4 as a labeled fallback.
- M-0 bands set to DOE's prototype glazing, 19.9 and 29.8 percent, the second
  at New York's 30 percent cap.
- M-1 tonnage from DOE's IECC 2021 apartment prototypes, by zone and band.
- Ventilation check with ASHRAE 62.2 and the Census 2025 Northeast bedroom
  mix (1.40 bedrooms per unit).
- Renovations get the code-minimum figure as a floor, at low confidence.

**Pricing still open.** Two questions remain: per-ton or per-square-foot
pricing, and whether any closed job records installed tonnage.

**Verdict.** M-0 and M-1 can be built now. M-1 would show tons with no dollar
figure and would not change Item 30's price until Matt answers question 2.
Question 4 is a calibration check, not a blocker.
