# Pricing electrical service and HVAC for the Design and Engineering cards

Researched 28 September 2026 for the two pricing questions left open in
`docs/precon/criteria/la-776-electrical-service-size.md` (section 8, question 5) and
`docs/precon/criteria/la-777-hvac-tonnage.md` (section 5). This is research only. No code
or other file changed. Every figure below is a suggestion for Matt to accept, change or
reject. None is a Kulka number until he says so.

## Short answer

1. **Electrical service and distribution: price by a lump sum for each standard service
   size, plus a separate rate per dwelling unit.** The amp-driven part (service entrance,
   main switchboard, service conductors, feeders to the meter banks, customer-side utility
   work) prices from the table in section 1, about $80,000 for 800 A up to about $400,000
   for 4,000 A. The unit-driven part (one meter position, one unit feeder and one unit
   panel per apartment) prices at about $4,000 per unit, range $3,000 to $5,500. On the
   E-1 sample building (2,500 A, 107 units, 101,200 GSF) that comes to about $658,000, or
   $6.50 per GSF. That is 28 percent of a $23 per GSF electrical budget, inside the 20 to
   30 percent share one 2026 estimator source gives for service and switchgear. Confidence
   is low. No public source prices a multifamily service by amp rating, so the table is a
   build-up from the sources below, and Kulka's own subcontractor quotes should replace it
   row by row.
2. **HVAC: stay per square foot, with a rate for each system type, and show tons as a
   check.** In this app, tons are gross square feet times a fixed ratio, so a rate per ton
   is a rate per square foot in disguise. The only thing it adds is the glazing band, which
   would then move the budget by about 13 percent on a guess. Suggested 2026 rates for Long
   Island and Westchester, open shop, whole HVAC scope: PTAC or PTHP $13 per GSF ($10 to
   $17), split heat pump per apartment $18 ($13 to $23), VRF $26 ($20 to $34), central
   plant $36 ($28 to $48). At the app's 690 GSF per ton those equal about $9,000, $12,400,
   $17,900 and $24,800 per ton. Matt's blended $18 to $30 per GSF sits across the split and
   VRF rows, and the one closed buyout (Jeffersons Ferry, $18.64 per GSF) matches the split
   row.

## Location factor and escalation used throughout

**Location.** The app pins its own location factor at 1.00 (LA-689), because Kulka's
rates are already Long Island and Westchester rates. So every figure here is stated in
Long Island and Westchester dollars, 2026, open shop. National figures were converted with
one stated factor, **1.10**, built from two published RSMeans numbers:

- RSMeans City Cost Index, 2021 V2 (the latest free edition), for three-digit ZIP areas.
  Division 21 to 23 (fire suppression, plumbing and HVAC) and Division 26 to 27
  (electrical) run 122.6 and 122.5 for Hicksville (ZIPs 115, 117, 118), 123.6 and 123.3
  for Riverhead (119), and 119.3 and 127.6 for White Plains (106). Call it 1.22 to 1.24.
- RSMeans bases its installation index on union rates. Its own 4 to 7 story apartment
  model prices $193.94 per SF union and $174.26 open shop nationally, a ratio of 0.90.
- 1.225 times 0.90 is 1.10.

That product is an estimate. RSMeans publishes no open-shop factor for Long Island, and
the union gap on Long Island is likely wider than the national 10 percent, which would
pull the factor lower. Kulka's own data agrees with 1.10 on electrical: the RSMeans 2024
multifamily electrical median of $19.30 per SF times 1.10 is $21.23, against Jeffersons
Ferry's bought rate of $21.05.

For Rockland and the Hudson Valley, the same index gives Suffern (109) 105.2 and 103.8,
Poughkeepsie (125, 126) 104.3 and 106.9, Kingston (124) 109.8 and 104.5. That is 0.85 to
0.90 of Hicksville on union rates. The open-shop gap between the two markets is probably
smaller, so a multiplier of about 0.90 on the figures below is a reasonable first guess
for those counties. It is not built into any number here.

**Escalation.** Figures dated 2024 or 2025 were brought to mid-2026 with the Turner
Building Cost Index: 1,426 for 2024, 1,485 for 2025 and 1,552 for Q2 2026 (up 5.15
percent year over year). That is about 5 percent from January 2025 data and 9 percent
from January 2024 data. Rider Levett Bucknall gives New York City 4.40 percent year over
year for Q1 2026, which agrees. Older data used 1.30 (2020 and 2021 to 2026) and 1.42
(2018 to 2026) from the same Turner series.

**Equipment is moving faster than the general index.** The federal producer price index
for switchgear and switchboard apparatus (BLS series PCU335313335313) rose from 363.1 in
August 2025 to 411.5 in August 2026, 13.3 percent in one year, and 89 percent since
January 2020. The HVAC equipment index (PCU333415333415) rose 3.9 percent over the same
year. For budgets that carry into 2027, the switchgear-heavy part of the electrical
service deserves more escalation than the 4 to 5 percent general rate.

## 1. Electrical service and distribution

### Recommended method

Price the Service and Distribution container (item 31, container 1) in two parts:

1. **A lump sum for each standard service size**, taken from the table below by the
   rating E-1 already rounds to. One lump sum per building service.
2. **A rate per dwelling unit** for the meter position, the unit feeder and the unit
   panel.

Why not a plain rate per amp:

- **About two thirds of the money follows the unit count, not the amps.** Each apartment gets its
  own meter position, a 100 to 125 A feeder from the meter bank and a panel. The container
  definition in `canonical-work-items.md` includes "panels, feeders to sub-panels". On the
  sample building those items come to roughly $430,000 of about $658,000. A rate per amp
  would spread that across amps, so two buildings with the same service and different
  unit counts would price the same.
- **The amp-driven part is not a straight line.** A small service carries fixed costs
  (pad, conduit, grounding, meter-bank feeders) that make it cost more per amp. Large
  208 V services cost more per amp again: parallel conductor sets climb to 10 at 4,000 A,
  Central Hudson's three-phase transformers accept at most six conductor sets before a
  secondary enclosure is needed, and PSEG Long Island caps a padmount service at 4,000 A
  at 208Y/120 V. A table carries that curve. A single rate cannot.
- **A table row can be replaced by a real quote** without touching the others, which is
  how this should improve.

If Matt prefers one number anyway, the amp-driven part runs about $90 to $105 per amp at
the suggested figures, lowest in the middle of the range.

### Suggested lump sums, building-level part

Long Island and Westchester, 2026, open shop. One service at 208Y/120 V, three-phase,
four-wire.

| Service size | Suggested | Low | High | Suggested per amp |
| --- | --- | --- | --- | --- |
| 400 A | $42,000 | $30,000 | $65,000 | $105 |
| 800 A | $80,000 | $55,000 | $110,000 | $100 |
| 1,200 A | $115,000 | $85,000 | $165,000 | $96 |
| 1,600 A | $145,000 | $105,000 | $205,000 | $91 |
| 2,000 A | $180,000 | $130,000 | $255,000 | $90 |
| 2,500 A | $230,000 | $165,000 | $325,000 | $92 |
| 3,000 A | $290,000 | $205,000 | $410,000 | $97 |
| 4,000 A | $400,000 | $285,000 | $570,000 | $100 |

**Plus, per dwelling unit: $4,000 suggested, $3,000 to $5,500.** That covers one meter
position in a modular meter stack with its tenant breaker (about $500 to $900 installed),
one 100 to 125 A feeder from the meter bank to the unit at a typical 75 to 150 feet (about
$1,500 to $3,500), and one unit load center (about $900 to $1,500 installed).

**Worked check, E-1 sample building** (101,200 GSF, 107 units, 2,500 A):
$230,000 + 107 × $4,000 = $658,000, or $6.50 per GSF. The low case is $165,000 +
107 × $3,000 = $486,000 ($4.80 per GSF). The high case is $325,000 + 107 × $5,500 =
$914,000 ($9.03 per GSF). The RSMeans 2025 multifamily electrical median, $20.00 per SF,
times 1.10 and 1.05 is $23.10 per GSF, so the suggested figure is 28 percent of the whole
electrical budget.

### How the table was built

No public source prices a multifamily service by amp rating, so these rows are a
build-up. Each row adds five pieces, scaled to the service size:

- Customer-side utility work: transformer pad, primary and secondary conduit, ground
  rods, bollards. About $25,000 to $60,000 depending on distance.
- Service conductors from the transformer to the switchboard, in parallel sets of
  600 kcmil copper or 750 kcmil aluminum at roughly 400 A a set. Supplier listings show
  600 kcmil copper THHN at about $22.60 to $25.30 a foot in 2026. Aluminum runs well
  under half that, and most estimators will carry aluminum.
- The main switchboard with a main breaker and distribution section.
- Feeders from the switchboard to the meter banks, house panel, elevator and other
  building loads.
- Grounding, testing and the electrician's utility coordination.

The build-up was then checked against these published figures:

| Source | Figure | Adjusted to LI and Westchester 2026 |
| --- | --- | --- |
| Terrapin Construction Group, April 2026, citing RSMeans 2026 and 180 of its own projects | 400 A 208 V service $18,000 to $35,000 installed; 800 A $40,000 to $75,000; 2,000 A 480 V service with switchgear $180,000 to $320,000; service and switchgear 20 to 30 percent of the electrical contract | × 1.10: 400 A $20,000 to $39,000; 800 A $44,000 to $83,000 |
| DEI Power (switchboard maker), May 2026 | Low-voltage switchboard with basic installation: 800 A $40,000 to $70,000; 1,200 A $70,000 to $120,000; 2,000 A and up $100,000 to $200,000 | Equipment-heavy, used as given |
| RSMeans 2025 Project Costs, multifamily electrical, national, with overhead and profit | $10.95, $20.00, $29.50 per SF (quartile, median, quartile) | × 1.155: $12.65, $23.10, $34.07 per GSF |
| Kulka, Jeffersons Ferry | Electrical bought at $21.05 per SF | Not separable |

The table sits above Terrapin at 400 and 800 A because it adds customer-side utility work
and the meter-bank feeders. It sits near DEI's switchboard prices once the switchboard is
pulled out of each row. Both sources are firm marketing pages with no project detail, so
treat them as cross-checks, not anchors.

### What the figure includes

- Customer-furnished utility work at the transformer: pad, conduit, ground rods,
  bollards, and secondary (service) conductors to the building.
- Main switchboard or service equipment, with the house CT meter compartment where the
  utility requires one.
- Feeders to the meter banks, house panel and building equipment disconnects.
- Modular meter stacks, tenant breakers, unit feeders and unit panels (the per-unit
  part).
- Grounding and bonding, testing, the electrician's utility coordination, and the
  electrical permit.

### What the figure excludes

- **Utility company charges**, such as a line extension or contribution in aid of
  construction (PSEG Long Island) or the "incremental customer cost to supply service at
  your requested point of entry" (Con Edison). These vary by job and were not researched.
- **The transformer.** All three utilities checked furnish and own it (details below).
- **Primary cable where PSEG Long Island requires the customer to supply it.** Its
  padmount specification says that in areas outside its CIPUD program the customer
  procures and installs the primary cable. Add it when the utility's specification letter
  asks for it. No cost figure was found.
- Trenching, backfill and paving (site work).
- Emergency generator (container 6), fire pump dedicated service (container 7), elevator
  and equipment branch circuits (container 5), EV charging (31d), solar (31e), lighting,
  branch wiring and low voltage.
- **Ground-fault protection of equipment.** NEC 230.95 requires it on a service of 1,000 A
  or more only when the voltage to ground exceeds 150 V. At 208Y/120 V it is 120 V, so it
  is not required. A 480Y/277 V service over 1,000 A would need it.

**Avoid double counting.** Item 31 prices today as one blended rate per GSF that already
contains this container. If this container is priced from the table, the blended rate
has to drop by the same amount, about $5 to $7 per GSF on a building like the sample.

### Who owns the transformer (verified where noted)

| Utility and area | Transformer | Customer furnishes | Status |
| --- | --- | --- | --- |
| PSEG Long Island (Nassau, Suffolk) | "PSEG LI shall deliver the transformer and set it onto the concrete pad." | Pad and footing from approved precast suppliers, ground rods, all wiring, primary cable outside CIPUD areas, primary and secondary connections | Verified in its Three Phase Padmounted Transformer Specifications. Padmount sizes 75 to 1,500 kVA. Secondary service capped at 4,000 A at 208Y/120 V or 2,500 A at 480Y/277 V. |
| Con Edison (Westchester) | The company "will furnish, install and maintain the transformer and associated equipment" | Suitable space "without rental charge"; all wiring and equipment from the point of service termination; the pad foundation under its padmount standard EO-6229 and pad drawing EO-13775-B | Verified in the 2026 Blue Book, section on Space for Transformer Apparatus. Con Edison also offers a developer agreement to build vaults and reimburses at standard prices. |
| Central Hudson (Hudson Valley) | "The Company will furnish and install a pad-mounted transformer, terminate and connect the Customer's primary and secondary cables" | Box pad (required by tariff), ground rods, primary and secondary cables with 10 feet of slack | Verified in its Specifications and Requirements for Electric Installations. Three-phase units 75 to 2,000 kVA take at most six conductor sets. |
| Orange and Rockland (Rockland, Orange) | Probably the same pattern | Probably the pad | **Not verified.** O&R publishes a "Customer Guide to Padmounted Transformer Installations (Red Book)" but its text was not read. |
| NYSEG (parts of the Hudson Valley) | Not checked | Not checked | Not checked |

### Sources, question 1

- PSEG Long Island, Three Phase Padmounted Transformer Specifications:
  https://www.psegliny.com/-/media/PSEG/Global/GatherContentDocuments/6-6CodesandStandards/3phase.pdf
- Con Edison, Specifications for Electric Installations (Blue Book), 2026 edition:
  https://www.coned.com/-/media/files/coned/documents/small-medium-large-businesses/electricbluebook.pdf
- Con Edison, EO-6229, Padmounted Transformer Installation Requirements:
  https://www.coned.com/-/media/files/coned/documents/es/specs/eo-6229.pdf
- Central Hudson, Specifications and Requirements for Electric Installations:
  https://www.cenhud.com/globalassets/pdf/bluebook_electric_specs.pdf
- Orange and Rockland, Contractor Resources (lists the Red Book):
  https://www.oru.com/en/small-medium-sized-businesses/project-center/contractor-resources
- Terrapin Construction Group, Commercial Electrical Cost Per Square Foot (2026):
  https://terrapincg.com/news/commercial-electrical-cost-per-square-foot-2026
- DEI Power, True Cost of Replacing Electrical Switchgear:
  https://feeds.deipower.com/blog/electrical-switchgear-cost-estimate
- RSMeans, 2025 Project Costs (Square Foot Costs, section 50 17):
  https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2025-Project-Costs.pdf
- RSMeans, 2024 Project Costs:
  https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2024-Project-Costs.pdf
- RSMeans, City Cost Indexes 2021 V2:
  https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2021-CCI-LocationFactors-V2.pdf
- RSMeans, Apartment 4 to 7 Story model (union and open shop totals):
  https://www.rsmeans.com/model-pages/apartment-4-7-story
- BLS producer price index, switchgear and switchboard apparatus:
  https://data.bls.gov/timeseries/PCU335313335313
- Wire prices, supplier listings seen in search results only, not opened:
  https://nassaunationalcable.com/products/600-mcm-thhn-thwn-2-stranded-copper-building-wire
  and https://www.platt.com/s/600-mcm-stranded-copper-thhn?cat=vti4f2n5
- Meter bank cost per unit, a contractor blog in Tampa, weak:
  https://callperfectcatch.com/apartment-building-meter-bank-installation-cost-guide-2024/
- Kulka internal: `docs/precon/canonical-work-items.md` item 31, and
  `docs/precon/jeffersons-ferry-scope-comparison.md` (electrical bought at $21.05 per SF).

## 2. HVAC

### Recommended method

**Stay per GSF, with one rate for each HVAC System Type, and show tons as a check.**

- **Tons add no new information here.** M-1 computes tons as GSF times a DOE ratio for
  the climate zone and glazing band (about 690 GSF per ton in zone 4, standard band). A
  rate per ton is a rate per GSF multiplied by that ratio. The only thing it adds is the
  glazing band, which is the weakest input on the card. Pricing by the ton would let a
  glazing guess move the HVAC budget by about 13 percent.
- **The costs follow counts and system type, not tonnage.** A PTHP building pays per
  room, a split system per apartment, a VRF job per branch box and riser, and every
  system pays for ventilation, exhaust and dampers that have nothing to do with tons.
- **Every public source is per square foot.** RSMeans, NYSERDA's Buildings of Excellence
  data and NYSERDA's own multifamily guidance all report dollars per square foot. None
  reports dollars per DOE-sized ton.
- **Kulka's history is per square foot**, so a per-GSF rate compares directly with past
  jobs.

Use tons as a check: if the implied dollars per ton fall far outside the per-ton column
below, the system type or the square footage is probably wrong.

### Suggested rates

Long Island and Westchester, 2026, open shop, new multifamily of 3 to 7 stories. Whole
HVAC scope: in-unit equipment, distribution, ventilation and louvers, controls, common
area HVAC, and fire and smoke dampers (item 30 containers 1 to 5 and 8), plus the central
plant (container 6) in the central row. Stair pressurization (container 7) and fire pump
room heat (container 9) are not included.

| HVAC System Type | Suggested per GSF | Range per GSF | Per DOE ton at 690 GSF (suggested) | Range per DOE ton | Confidence |
| --- | --- | --- | --- | --- | --- |
| PTAC or PTHP, with separate ventilation | $13 | $10 to $17 | $9,000 | $6,900 to $11,700 | Low |
| Split heat pump per apartment, ducted or ductless | $18 | $13 to $23 | $12,400 | $9,000 to $15,900 | Medium |
| VRF, outdoor units serving several apartments | $26 | $20 to $34 | $17,900 | $13,800 to $23,500 | Medium |
| Central plant (four-pipe fan coils, water-source heat pumps on a loop, or air-to-water heat pumps) | $36 | $28 to $48 | $24,800 | $19,300 to $33,100 | Low |

**Compared with Matt's blended rate.** His $18 to $30 per GSF spans the split and VRF
rows. Jeffersons Ferry bought HVAC at $18.64 per SF, which matches the split row. The
files do not say which system each job used, so this match is suggestive only.

**Why the per-ton figures look high.** Market quotes of "installed cost per ton" usually
mean equipment and distribution divided by nameplate tons. The column above divides the
whole HVAC scope by DOE-sized tons. The whole scope adds ventilation, exhaust, common areas
and dampers, and DOE tons run below the nameplate total in a PTHP or ductless building,
where each room gets its own unit. For comparison, the market-style figures found were:

- PTHP: about $1,000 of material per unit including sleeve and grille, and $1,500
  installed per high-efficiency unit (NYSERDA 18-27, 2018). Escalated, that is about
  $2,100 per unit, or roughly $1,700 to $2,800 per nameplate ton for a 9,000 to
  15,000 Btu unit.
- Ductless heat pumps in 1 to 3 story New York homes: $4,483 per installed ton on
  average, range $2,824 to $6,550 (NYSERDA 22-04, installs 2017 to 2019). Escalated by
  1.42, about $6,400 per ton, range $4,000 to $9,300. These were retrofits, not new
  multifamily.
- VRF: $9,000 per ton in a budgeting example from a VRF estimating site (VRF Wizard), and
  $8,500 to $9,500 per ton in a search summary of commercial sources. Neither is
  New York data.

### How the rates were built

**RSMeans 2025 Project Costs, multifamily housing, national, January 2025, with overhead
and profit.** Mechanical (HVAC, with plumbing reported separately): $9.30 at the lower
quartile, $14.75 median, $35.50 at the upper quartile. Times 1.10 for location and 1.05
for escalation: **$10.74, $17.04 and $41.00 per GSF.** The lower half of that spread fits
PTHP buildings and the upper quartile fits central plants. RSMeans does not split its
sample by system.

**NYSERDA Buildings of Excellence, construction cost data (workbook dated February 2024).**
These are project estimates for low-carbon New York multifamily buildings entered in
Rounds 1 and 2 (2019 to 2021), with HVAC broken out and every project listing an ERV for
ventilation. Dollars per total building square foot:

| Group | Projects | HVAC per SF | HVAC per unit |
| --- | --- | --- | --- |
| VRF, New York City, new construction, 5 to 26 stories | 10 | $11.30 to $34.10, median $21.90 | $11,394 to $35,671, median $21,804 |
| VRF, Mid-Hudson (Hudson Green, 6 stories, 113 units, 120,799 SF) | 1 | $24.00 | $25,665 |
| Mini-split, upstate low-rise new construction (Capital Region, Central NY, Finger Lakes) | 3 | $6.20 to $14.40 | $5,986 to $14,059 |

Two VRF projects were left out: Tree of Life ($1.70 per SF, clearly a partial number) and
Engine 16 (a four-unit gut rehab). Escalated by 1.30, the New York City VRF median becomes
$28.50 per SF. New York City runs about 5 percent over Long Island on the RSMeans
mechanical index (129.7 against 122.6), and these are high-performance buildings, so $26
per GSF is the suggested VRF rate. Hudson Green escalated is $31, inside the range. The
upstate mini-split projects escalated by 1.30 and moved to Long Island costs by about
1.15 give $9 to $21 per GSF and $9,000 to $21,000 per unit. With common areas added, that
supports the split row at $13 to $23.

**NYSERDA, Choosing Air Source Heat Pumps for Multifamily Buildings (January 2021).**
Quotes gathered in New York: large VRF $15 to $34 per SF, average $22 (13 quotes); small
mini-splits and multi-splits $8 to $23 per SF, average $15 (8 quotes). In one building
quoted both ways by the same contractor, VRF came in 24 percent higher. Escalated by 1.30,
the averages are about $29 and $20, which agrees with the VRF and split rows.

**PTHP.** No Buildings of Excellence project used PTHPs, so this row leans on the RSMeans
lower half and on NYSERDA 18-27. A typical apartment with 1.4 bedrooms needs about 2.4
PTHPs at roughly $2,100 each installed, about $5,000, before ventilation, exhaust and
common areas. A 2026 Havtech comparison of six electrified systems for a 452-unit building
found PTHP the cheapest to install until capacity limits force two units per apartment.
Its chart values could not be read.

**Central plant.** The thinnest row. It uses the RSMeans upper quartile ($41 adjusted),
Havtech's finding that water-source heat pumps had the highest first cost of the six
systems, and the two mid-rise ground-source projects in the Buildings of Excellence data
($17.40 and $50.50 per SF before escalation), which sit at opposite ends.

### Sources, question 2

- NYSERDA, Buildings of Excellence Construction Cost Data (workbook):
  https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/BOE/2024-02-Buildings-of-Excellence-Construction-Cost-Data.xlsx
- NYSERDA, Choosing Air Source Heat Pumps for Multifamily Buildings (January 2021):
  https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/MPP-Existing-Buildings/library/TT---ChoosingAirSourceHeatPumpsforMultifamilyBuildings.pdf
- NYSERDA 18-27, High-Performance Packaged Terminal Heat Pump Market and Development
  (2018):
  https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Publications/Research/Other-Technical-Reports/18-27-PTHP-Market-Development.pdf
- NYSERDA 22-04, Replacing Fossil Fuel Heat with Mini-Split Heat Pumps in Urban Housing
  Stock (2022):
  https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Publications/PPSER/Program-Evaluation/22-04-Replacing-Fossil-Fuel-Heat-with-Mini-Split-Heat-Pumps-in-Urban-House-Stock.pdf
- RSMeans, 2025 Project Costs:
  https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2025-Project-Costs.pdf
- Havtech, Multifamily HVAC Cost Comparison, 6 Electrified Systems:
  https://www.havtech.com/resource/multifamily-hvac-comparison-across-six-electrified-systems/
- VRF Wizard, VRF System Installation Cost Budgeting:
  https://vrfwizard.com/vrf-system-installation-cost-budgeting/
- NYC HPD, VRF convening public summary (installation cost concerns, no figures):
  https://www.nyc.gov/assets/hpd/downloads/pdfs/services/vrf-convening-public-summary.pdf
- BLS producer price index, AC, refrigeration and warm air heating equipment:
  https://data.bls.gov/timeseries/PCU333415333415
- Turner Building Cost Index, Q1 2026:
  https://turnerconstruction.com/uploads/cost-index-Q1-2026.pdf
- Construction Dive on Turner Q2 2026 (5.15 percent year over year):
  https://www.constructiondive.com/news/turners-building-cost-index-q2-2026/826514/
- Rider Levett Bucknall, Construction Cost Report East, Q1 2026:
  https://www.rlb.com/americas/insight/rlb-construction-cost-report-east-q1-2026/
- Kulka internal: `docs/precon/canonical-work-items.md` item 30,
  `docs/precon/jeffersons-ferry-scope-comparison.md` (HVAC bought at $18.64 per SF), and
  `docs/precon/criteria/la-777-hvac-tonnage.md` (the DOE ratios).

## What we could not find

- **Any public price for a multifamily service by amp rating.** RSMeans assemblies
  (D5010, Electrical Service and Distribution) would give one, but they sit behind the
  subscription. The lump-sum table is therefore a build-up, and it is the weakest number
  in this document. The fastest fix is to ask Kulka's electrical subcontractors for the
  service and distribution line of a recent bid. Jeffersons Ferry's electrical contract
  (RFG Electrical, $656,865 for Divisions 26 and 28) is a place to start.
- **A current RSMeans City Cost Index.** The 2021 V2 table is the latest free one. Newer
  factors need a subscription.
- **An open-shop location factor for Long Island.** The 1.10 is derived, not published.
- **Utility charges.** PSEG Long Island, Con Edison and Central Hudson contribution or
  line extension costs were not researched, and neither was the cost of primary cable on
  Long Island where the customer must supply it.
- **Orange and Rockland and NYSEG transformer rules.** O&R's Red Book text was not read,
  and NYSEG was not checked.
- **Cost of a unit feeder or a meter position from a primary source.** The per-unit
  figure rests on estimating judgment and one weak blog.
- **New York cost data for PTHP or central-plant multifamily buildings from 2024 to
  2026.** Buildings of Excellence has none for PTHP and only two ground-source projects.
- **Any data priced per DOE-sized ton.** The per-ton column is the per-GSF rate
  converted, not a measured figure.
- **Havtech's chart values**, which are images and could not be read.
- **Split of the Buildings of Excellence HVAC figures** into equipment, distribution and
  ventilation. The workbook gives one HVAC total per project.
