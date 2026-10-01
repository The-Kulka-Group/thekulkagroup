# Line Quantities: Which Resource Lines Fill Their Own Quantity

LA-1401, under LA-1394. Code: `packages/engine/src/quantity-rules.ts`. A rule reads the
project's facts and the schedule and gives a quantity, or names the fact it lacks. The line
shows where its quantity came from: the project's facts, the schedule, the rate card or the
estimator. A line that lacks a fact stays blank, and the plan will not price a line that is
on until the estimator enters a quantity. A blank quantity never prices as zero or one.

The estimator's own quantity wins, saves on the project and survives a rerun, until they
press Reset Quantity. A line nobody overrode works its quantity out afresh when a fact or
the schedule changes. A saved run keeps the quantities it recorded: the engine prices the
figures a plan carries and derives nothing.

The source is estimate C-00379, `117 N Long Beach Rd GC's REV1.xlsx` (Dropbox, KULKA),
tab `General Requirements (GC- CM)` unless a cell names another tab.

## The area basis

Matt decided on 2026-09-24 that Kulka prices on one basis: the project's total gross
square feet, garage included. Every per-area rule uses it.

C-00379 disagrees with itself. Final Cleaning (W44), OSHA Protection (W96) and
Exterminating (W115, `=AL14`) use 120,000 SF, which is the building footprint (Program
Data AC20). Finish Floor Protection (W110) and Fire Extinguishers (W211) use the named
range GSF, 68,016 (Program Data V61, the sum of a typed First Floor figure in V54). Nothing
on the sheet explains 68,016. The golden test keeps each line's own figure, so it does not
depend on which is right.

## The rules

| Rule | Lines it fills | Quantity | Source | For Matt to confirm |
| -- | -- | -- | -- | -- |
| Gross Area | Final Cleaning, OSHA Protection, Exterminating, Finish Floor Protection | The project's gross square feet. | Matt, 2026-09-24. C-00379 W44, W96, W110, W115. | None |
| Fire Extinguishers | Fire Extinguishers - During Construction | Gross square feet ÷ 3,000, not rounded. | W211, `=GSF/3000`, which gives 22.672 on 68,016. | Whether to round up. The sheet does not. |
| Exterior Barricades | Barricades [Exterior] | Site perimeter ÷ 60 LF, rounded up. | C-00379 types 30 (W105) on a 1,800 LF perimeter (Program Data AC15). The sheet has no formula; 60 LF is what those two imply. | `BARRICADE_SPACING_LF = 60` |
| Webcam Service | Webcam Cellular Service, Webcam Software | One per camera on the plan's Webcam Cameras line. | W59 and W60, `=W57*months`. | None |
| Temporary Heat Labor | Temporary Heat & Prot. - Labor | Winter weeks × 5 man-days. | W186, `=(W192*5)*1`. | `WINTER` |
| Heater Rental | Total Heater Rental, priced by the heater-month | Heaters × winter weeks ÷ 4, rounded up. Heaters are the heat load ÷ 700,000 BTU, rounded up. | W193, `=W191*ROUNDUP(W192/4)`, and U189. | `WINTER` |
| Heater Fuel | Total Fuel Consumption | Heaters × 5 gal/hr × 24 hours × winter weeks × 5 days. | U200, `=(W199*24*(W192*5))*W191`, and W199. | `WINTER` |
| Temporary Power | Electrical Consumption, Power | Amps × 120 V × 8 hours ÷ 1,000 × construction months × 22 days. | The "How to Calculate Kilowatt Hours" notes, AS216 to AX230. | `TEMP_SERVICE_VOLTS = 120` |
| Temporary Lighting | Electrical Consumption, Lighting | Amps × 120 V × 24 hours ÷ 1,000 × construction months × 22 days. | Same notes. | `TEMP_SERVICE_VOLTS = 120` |

Months are construction weeks × 7 ÷ 30.42, the sheet's own days per month (General
Conditions AT11).

## What the heat and power rules reproduce

The tests in `quantity-rules.test.ts` rebuild the sheet's figures from its inputs.

- Heat, from 5 heaters (W191) for 11 weeks (W192), both typed: 15 heater-months (W193),
  55 man-days (W186) and 33,000 gallons (U200). On that job every heat row was left
  unpriced, but the formulas stand.
- Power: 200 A × 120 V = 24,000 W, × 8 hours = 192 kWh a day, × 12 months × 22 days =
  50,688 kWh.
- Lighting: from 24,000 W, × 24 hours = 576 kWh a day, × 8 months × 22 days = 101,376 kWh.
  The note starts from "100 Amps x 120v = 24,000 watts", which is 12,000 W. The rule does
  the arithmetic, so it does not carry that slip.

Three places where the method departs from the sheet:

- **Heaters.** The ticket asks for heaters sized from the heat load. The sheet does not do
  that: it types 5 heaters, and its BTUs Required cell (U185, `=(((8*34)*1200)*4)`,
  1,305,600, inputs unlabeled) would give 2. No question asks for a heat load and no
  criterion works one out, so heater rental and fuel stay blank on every project today.
- **Weeks of heat.** The sheet types 11. The rule counts the construction days that fall
  in December to March, which needs a start date no screen asks for yet. On C-00379's own
  dates (construction from 2024-10-01 for 456 days) that gives 21.6 weeks, twice the
  sheet's figure. The sheet appears to heat only part of each winter. Matt should say
  whether heat runs every winter week or only after the building is enclosed.
- **Months of power.** The example types 12 and 8 months. The rule uses the construction
  months for both.

## Facts no question asks for yet

Each of these is null on every project, so the lines that need one stay blank and name it:
site perimeter, construction start date, heat load, and the temporary power and lighting
service amps. C-00379 has a site perimeter (1,800 LF); Kulka AI does not ask for one.

## Lines no rule fills

A line whose quantity is a judgment opens blank for the estimator: how many guards, hoist
operators or cameras a job needs is not a fact the project holds. That includes four of the
six lines a new General Requirements plan opens with (LA-1402, `RULE_SEED_ROWS`): Hoist
Operator, Security Guards, Webcam Cameras and Webcam Cellular Service (which fills once the
cameras are entered). The two lump sums, heater transportation and ductwork, open at one
lump sum, which is what the card's rate is.

A weekly or monthly line added from the rate card by hand also opens blank. Before LA-1401
it opened at a count of one marked as the estimator's, although nobody typed it.
