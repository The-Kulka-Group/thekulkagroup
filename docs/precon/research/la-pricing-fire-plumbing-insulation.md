# Pricing suggestions: sprinklers, plumbing drain tiers, and envelope insulation

Research note, written 2026-09-28. It answers the pricing questions left for Matt in
section 8 of `docs/precon/criteria/la-774-sprinkler-system.md`,
`la-775-plumbing-fixture-units.md` and `la-781-insulation.md`. Every figure here is a
suggestion for Matt to accept, change or reject. None of it is wired into the app, and none
of it should be written into `canonical-work-items.md` until Matt states the number
himself.

The basis for every figure is new multifamily, 3 to 7 stories, wood frame or wood over a
concrete podium, on Long Island, in Westchester, Rockland or the Hudson Valley, open shop
labor, priced in 2026 dollars as a subcontractor's installed price to Kulka (material,
labor, the sub's overhead and profit, no GC markup).

## Short answer

| Question | Suggested figure | Range | Confidence |
| --- | --- | --- | --- |
| 4a. Sprinkler, residential Light Hazard area, NFPA 13 wet | $4.00 per SF | $3.25 to $5.25 | Medium. Kulka's own bought rate anchors it |
| 4b. Sprinkler, garage, Ordinary Hazard Group 2, dry | $6.50 per SF of garage | $5.00 to $8.50 | Low to medium |
| 4c. Same garage if heated, wet | $5.00 per SF of garage | $4.00 to $6.50 | Low |
| 5. NFPA 13R against NFPA 13 | Yes, lower by $1.00 per SF of Light Hazard area (about 25 percent) | $0.50 to $1.75 lower | Low. Only one published figure, from 2020 |
| 6. One trash chute sprinkler head, installed | $850 each | $600 to $1,400 | Low. Built up, not published |
| 6. Freeze protection adder, where a chute head sits in a cold space | $300 per head | $150 to $500 | Low |
| 8. How fixture demand should change price | A new supporting line priced per building by drain tier. Not a multiplier on items 28 and 29 | n/a | High on the method |
| 9. Drain tier step above the 4-inch base, per building | 5-inch +$5,000; 6-inch +$9,000; 8-inch +$20,000 | See section 9 | Low. No published tier data exists |
| 11. Separate cost codes for polyiso and continuous insulation | Yes. Give roof polyiso, wall continuous insulation and floor over garage each their own code | n/a | High on the method |
| 12a. Polyiso above deck, R-33ci (4 stories and up) | $4.25 per SF of roof | $2.50 to $5.50 | Medium |
| 12a. Polyiso above deck, R-30ci (3 stories or fewer) | $3.90 per SF of roof | $2.25 to $5.00 | Medium |
| 12b. Wall continuous insulation, R-5 foam board | $2.25 per SF of wall | $1.50 to $3.25 | Medium |
| 12b. Wall continuous insulation, R-7.5 to R-10 foam board | $3.00 per SF of wall | $2.25 to $4.25 | Low to medium |
| 12b. Wall continuous insulation, R-10 mineral wool board | $4.50 per SF of wall | $3.50 to $6.00 | Low to medium |
| 12c. Insulation under a concrete floor over an unheated garage, R-16.7ci | $4.50 per SF of garage ceiling | $3.25 to $6.50 | Low to medium |
| 12c. Wood floor over a garage, R-30 batts between joists | $2.00 per SF | $1.50 to $2.75 | Medium |

Two cautions apply to everything below. First, public cost data for fire sprinklers and
insulation is thin and much of it comes from contractor marketing pages, not audited cost
studies. I say which is which. Second, Kulka's own bought and budgeted rates are the best
evidence for Long Island, and where they exist I anchor on them over national figures.

## How national figures were moved to 2026 and to Kulka's region

**Escalation.** The Turner Building Cost Index stood at 1172 in the first quarter of 2021
and at 1552 in the second quarter of 2026, a rise of 32 percent
([Turner, Q1 2021](https://www.turnerconstruction.com/insights/construction-costs-remain-relatively-stable-in-first-quarter-of-2021);
[Construction Dive, Q2 2026](https://www.constructiondive.com/news/turners-building-cost-index-q2-2026/826514/)).
The same index rose 5.15 percent in the year to Q2 2026, up from a 3.4 percent yearly pace
in late 2024. I used:

- 2020 or 2021 data: times 1.32.
- 2024 data: times 1.09 (about 3.4 percent, then 5.15 percent). Approximate.
- 2025 data: times 1.05.

Turner tracks nonresidential building, so it may overstate multifamily escalation in a soft
apartment market. Insulation materials are running hotter than the index: Gordian's
fiberglass insulation price was up 13.5 percent year over year in July 2026
([Gordian, Insulation Cost Updates](https://www.gordian.com/resources/insulation-cost-updates/)).

**Location.** The RSMeans 2021 location factors (commercial, building systems, national
average = 100) give these totals for Kulka's area
([RSMeans 2021 CCI Location Factors, V2](https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2021-CCI-LocationFactors-V2.pdf)):

| RSMeans location (ZIP) | Total factor |
| --- | --- |
| Hicksville (115, 117, 118), covers Nassau and western Suffolk | 122.6 |
| Riverhead (119), eastern Suffolk | 125.3 |
| White Plains (106) | 118.6 |
| Yonkers (107) | 121.1 |
| New Rochelle (108) | 115.2 |
| Suffern (109), Rockland | 108.1 |
| Poughkeepsie (125, 126) | 113.9 |
| Kingston (124) | 113.1 |
| Monticello (127) | 112.7 |

RSMeans prices on union labor. Its own 4 to 7 story apartment model puts open shop about 10
percent below union ($174.26 against $193.94 per SF, national, 2019 data)
([RSMeans, Apartment 4-7 Story](https://www.rsmeans.com/model-pages/apartment-4-7-story)).
Applying that 10 percent to the table gives about 1.10 for Long Island and 1.04 to 1.09 for
Westchester. For Rockland and the Hudson Valley the same arithmetic falls to about 0.97 to
1.03, which I think reads too low, because the union gap is smaller there than nationally.
One sprinkler data point also warns that national figures run low in the New York suburbs:
the NFPA home sprinkler cost study found $2.47 per SF in Greenburgh, Westchester, against a
national average of $1.35 ([NFSA, 2020](https://nfsa.org/2020/09/15/the-true-cost-to-install-a-residential-sprinkler-system/)).

**Stated factor used in this note:** 1.10 for Long Island and Westchester, 1.05 for
Rockland and the Hudson Valley, applied to national open shop figures. The suggested
figures in this note are for Long Island. For Rockland and Hudson Valley jobs, multiply a
national-based figure by 1.05 / 1.10, about 0.95. Kulka's own rates are already local and
get no factor.

`docs/precon/cost-index-research.md` notes that Gordian's standard license does not permit
putting RSMeans factors inside Kulka's software. I used them once, by hand, for this note.
The app should store the figure Matt picks, not the RSMeans factor.

---

## Sprinklers

### 4. Installed cost per SF: garage and residential Light Hazard

**Suggestion.**

- Residential Light Hazard area, NFPA 13, wet: **$4.00 per SF**, range $3.25 to $5.25.
- Garage, Ordinary Hazard Group 2, dry pipe: **$6.50 per SF of garage**, range $5.00 to
  $8.50.
- Garage if heated, wet: **$5.00 per SF**, range $4.00 to $6.50.

**What is included.** Heads, branch lines, cross mains, risers, floor control valve
assemblies, hangers, seismic bracing where required, hydraulic design, shop drawings and
the sprinkler permit. For the garage, also the dry pipe valve and trim, the air compressor,
auxiliary drains, and galvanized pipe, which many designers now specify for dry systems.
Not included, because item 27 prices them as separate containers: Class I standpipe, fire
pump, fire service backflow and water service, fire alarm, and heat for the dry valve room.

**Why dry in the garage.** An open or enclosed garage under apartments in New York freezes,
so the designer uses a dry system or a preaction system unless the garage is heated.
NFPA 13-2022 puts garages in Ordinary Hazard Group 2 at 0.20 gpm per SF over 1,500 SF, and a
dry system must add at least 30 percent to the design area
([Consulting-Specifying Engineer, May 2025](https://www.csemag.com/new-parking-garages-must-deal-with-more-robust-fire-protection-requirements/)).
More water and a larger design area mean larger pipe, which is why the garage prices above
the residential floors.

**How I got there.**

- *Kulka's own evidence (local, no factor).* Jefferson's Ferry ILNW Building 1, a 22,800
  SF building on Long Island, bought its whole sprinkler package from KG Mechanical for
  $93,000, which is $4.08 per SF, with no change orders recorded
  (`docs/precon/jeffersons-ferry-scope-comparison.md`). That price is all in, so it
  already carries fixed costs a small building spreads over few square feet. The Vue files
  from 2023 carry $3.30 (VR) and $6.00 (V64 and VA) as conceptual budgets, not buyouts.
  VA priced its 40,000 SF garage at the same $6.00 as its tower, which is the gap LA-774
  set out to fix.
- *Published ranges (national, contractor guides, 2026).* Wet systems $2.00 to $4.50 per SF,
  dry $3.50 to $6.00, parking structures on dry pipe $3.50 to $6.50
  ([TechMEP Estimates](https://www.techmepestimates.com/blog/fire-protection-estimating-guide/)).
  Wet Light Hazard $2.50 to $5.00, wet Ordinary Hazard $3.50 to $7.00, dry Ordinary Hazard
  $5.00 to $9.00, residential new construction wet $1.50 to $3.50
  ([Spectrum Fire Protection](https://spectrumforfireprotection.com/blog/fire-sprinkler-system-cost)).
  These are marketing pages without a stated method, so I use them for the shape of the
  answer (dry garage runs about 1.4 to 1.9 times a wet Light Hazard floor), not as the
  number.
- *Industry figure for garages.* The Precast/Prestressed Concrete Institute put the cost to
  install and maintain dry pipe sprinklers in open parking structures at about $3 per SF in
  July 2021 ([PCI white paper WP-21-01](https://www.pci.org/PCI_Docs/Design_Resources/Design_for_Fire/WP-21-01.pdf)).
  PCI argued against sprinkler mandates, so this figure had no reason to run high. Times
  1.32 for escalation and 1.10 for location gives about $4.35. That was before the 2022
  move from Ordinary Hazard Group 1 to Group 2 and the larger dry design area, so I treat
  it as the low side.
- *Arithmetic.* Light Hazard: JF's $4.08 all in, less some fixed cost a larger building
  spreads out, plus the fact that item 27 prices standpipe and pump separately, points to
  about $3.50 to $4.50 for piping and heads on a 60,000 to 250,000 SF building. I suggest
  $4.00. Garage: 1.6 times $4.00 is $6.40, inside the PCI-escalated low side ($4.35) and the
  guides' dry Ordinary Hazard high side ($9.00 times 1.10). I suggest $6.50.

**Location and escalation.** National figures carried 1.10 and the escalation stated above.
Kulka's JF rate is 2025 to 2026 Long Island money and carried neither.

### 5. Should NFPA 13R price lower than NFPA 13?

**Suggestion.** Yes. Price the Light Hazard area of an NFPA 13R building **$1.00 per SF
lower** than NFPA 13, range $0.50 to $1.75 lower. On a $4.00 base that is about 25 percent.
The garage stays on NFPA 13 in every case, so its rate does not change.

**Why it is cheaper.** NFPA 13R lets the designer leave out sprinklers in small bathrooms,
closets and combustible concealed spaces, allows a lower water discharge that can shrink
pipe sizes, and needs a shorter water supply duration
([NFSA, NFPA 13 vs. NFPA 13R in Podium Construction, 2020](https://nfsa.org/2020/11/17/nfpa-13-vs-nfpa-13r-in-podium-and-mixed-use-construction/)).

**The one published figure.** NMHC members estimated that NFPA 13 costs $1 to $2 more per
SF than NFPA 13R (reported by NFSA, 2020, same link). Times 1.32 and 1.10 that becomes $1.45
to $2.90. I suggest less than that, for two reasons. Much of the gap in that estimate comes
from attic protection under pitched roofs, and the insulation criterion assumes Kulka's
roofs are low slope, which removes most attic sprinklers. And a flat roof wood building on
NFPA 13 can often avoid sprinklers in the roof and floor cavities by filling them with
noncombustible insulation, which the building already carries. NFPA Journal's claim that
NFPA 13 costs "four to six times more" than 13R (quoted in the same NFSA article) does not
match any contractor figure I found, and I did not use it.

**When it applies.** Under the 2025 BCNYS, NFPA 13R is allowed only in Group R buildings of
four stories or fewer with a roof under 45 ft, with stories over a podium counted from grade
plane (criteria doc, SP-1). So this discount reaches Kulka's 3 and 4 story garden and
walk-up buildings, and at most a three-over-one podium, where it applies to the residential
floors only. Every 5 to 7 story building, and every four-over-one podium, prices at the NFPA
13 rate.

### 6. One trash chute sprinkler head, installed

**Suggestion.** **$850 per head**, range $600 to $1,400. Where a head sits in a space that
can freeze (the top head at an uninsulated roof vent, or a termination room open to an
unheated garage), add **$300 per head**, range $150 to $500.

**What is included.** The sprinkler contractor's branch drop from the floor's nearest
branch line into the chute throat, the fittings and the connection to the head, hangers,
and the added hydraulic design. The head and its shield are normally furnished by the chute
manufacturer: the CHUTES International installation manual says one head at the top comes
standard, that heads are needed at the top intake, alternate floors and the bottom intake,
and that the heads furnished with the chute "should be installed and piped (by others)"
([CHUTES International installation manual](https://www.chutes.com/wp-content/uploads/Internal-Chute-Installation-Manual-6-21-18-002.pdf)).
Wilkinson's specification calls for a 1/2-inch, 165 degree head with shield above the top
intake and at every other intake
([Wilkinson Hi-Rise specification](https://www.whrise.com/wp-content/uploads/2014/01/WHR-trash-chute-specs-copy.rtf)).
So item 23 carries the heads and item 27 carries the piping. The chute's flushing spray head
is plumbing, not sprinkler work.

**How I got there.** No source publishes a chute head price. I built it up. A Light Hazard
system at $4.00 per SF with each residential head covering roughly 150 to 200 SF works out
to $600 to $800 of system cost per head. A chute head is an isolated head with its own drop
into a rated shaft, usually in steel pipe, so it costs at least that and often more. I
suggest $850. The low end ($600) fits a chute room right beside a riser. The high end
($1,400) fits a long drop in steel through a rated shaft wall.

**Freeze protection.** The usual answer is a dry pendent or dry sidewall head, not heat
trace. A 10-inch Tyco DS-1 dry sidewall head lists at $149.03 against about $10 to $30 for a
standard head ([24hr.supply listing](https://24hr.supply/tyco-ty3335-603419100-10-ds-1-155f-dry-sidewall-chrome-quick-response-fire-sprinkler-head/)).
With the extra labor and the sub's markup, $300 per head covers it. Where the termination
room sits in a dry-piped garage, the designer may feed the bottom head from the garage dry
system at little extra cost. Most chute heads sit inside the heated building and need no
adder.

---

## Plumbing

### 8. Multiplier on items 28 and 29, or a new supporting line?

**Recommendation.** Use a **new supporting line**, priced once per building by drain tier.
Do not put a multiplier on items 28 and 29.

**Why.**

1. **Items 28 and 29 already scale with demand.** They price per fixture point and per
   unit (LA-720 driver split). A building with twice the fixtures already gets twice the
   fixture cost. A multiplier that rises with the drain tier would charge for the same
   fixtures twice.
2. **The drain tier is a per-building fact, and its cost is per building.** Each building
   has one building drain. Upsizing it from 4 to 8 inches costs the same whether the
   building has 25 or 150 units in that tier. A per-building line prices it where the cost
   lives. It also fits item 28's Plumbing Service container, which the canonical items file
   already defines as "per building."
3. **The dollars are small, and a multiplier would inflate them.** Section 9 shows that the
   step from a 4-inch to a 6-inch drain costs about $9,000 per building. A 100-unit,
   125,000 SF building carries a plumbing scope near $1.8 million at the RSMeans 2025
   national median for multifamily ($14.45 per SF; quartiles $9.00 and $19.55,
   [RSMeans 2025 Project Costs](https://www.rsmeans.com/media/wysiwyg/quarterly_updates/2025-Project-Costs.pdf)).
   A 2 percent multiplier would add $36,000, four times the real upsize cost.
4. **Economies of scale run the other way.** Shared plumbing (building drain, water
   service, mains) costs less per unit as unit count rises, even when the pipe gets bigger.
   A multiplier that rises with the tier pushes per-unit cost the wrong direction.
5. **It follows the house pattern.** The criteria doc already names this option under
   Structure Demolition's pattern (ADR 0006): a supporting item that prices only once Matt
   states a rate.

### 9. Rate for each drain tier

**Say it plainly first.** No published cost data gives plumbing cost by building drain
tier. RSMeans, the contractor guides and the cost studies I found price plumbing per SF or
per fixture. The figures below are a derived, defensible approach, not a published rate.

**Suggested per-building line: the step above a 4-inch base.** The 4-inch drain is already
inside item 28's piping allowance, so the new line prices only the upsize.

| Building drain | Suggested adder per building | Range | Relative installed cost of the drain |
| --- | --- | --- | --- |
| 4-inch | $0 (base) | n/a | 1.00 |
| 5-inch | +$5,000 | $2,500 to $8,000 | 1.25 |
| 6-inch | +$9,000 | $5,000 to $14,000 | 1.45 |
| 8-inch | +$20,000 | $12,000 to $30,000 | 2.00 |

**How the relative cost was set.**

- *Material rises steeply with size.* Charlotte Pipe's 2026 list prices for no-hub cast
  iron pipe per 10-ft length are $328.60 for 4-inch, $472.70 for 5-inch, $564.90 for 6-inch
  and $878.40 for 8-inch, ratios of 1.00, 1.44, 1.72 and 2.67
  ([Charlotte Pipe NH-126, effective January 1, 2026](https://hub.charlottepipe.com/Products/Assets/02A-Cast_Iron_List_Price/NH-126%20(11-13-25).pdf)).
  Schedule 40 PVC, common under slab, follows nearly the same curve by weight per 100 ft:
  205.5, 272.5, 361.2 and 543.6 lb, ratios of 1.00, 1.33, 1.76 and 2.65
  ([Charlotte Pipe PVC Schedule 40 data sheet](https://hub.charlottepipe.com/Products/Assets/02C-PVC_List_Price/PDS-PVC-40-PE-PIPE-124.pdf)).
- *Labor and trenching rise more slowly.* A wider trench and heavier pipe take longer, but
  the crew, the layout and the backfill are much the same. This part is my judgment, not a
  published labor table. I could not reach MCAA or RSMeans labor units by pipe size.
- *Blend.* Taking material near 40 percent of an installed under-slab drain gives the
  installed ratios in the table: 1.00, 1.25, 1.45 and 2.00.

**How the dollars were set.** One published figure puts 4-inch no-hub cast iron, installed
above a ceiling, at $38 to $58 per LF in 2026, all in with hangers and fittings
([PILARS plumbing cost guide](https://pilars.ai/trades/plumbing/cost-estimating)). Under a
slab, with trench and backfill, I assumed about $70 per LF in Kulka's region. For a building
drain of about 250 LF inside the building (a sample assumption for a 25,000 SF floor plate,
not a derived quantity), the 4-inch drain costs about $17,500. The ratios give $21,900 for
5-inch, $25,400 for 6-inch and $35,000 for 8-inch, so the steps above 4-inch are about
$4,400, $7,900 and $17,500. I rounded up to $5,000, $9,000 and $20,000 to cover the larger
cleanouts, the house trap or backwater valve where required, and the larger fittings at the
foundation wall. The range spans building drains of about 150 to 350 LF and $55 to $90 per
LF.

**What this line leaves out.** The site sewer beyond 5 ft outside the foundation belongs to
sitework and utilities. The water service size depends on street pressure and pipe length,
which the app does not have, so the tier does not set it. Stacks are sized by their own
fixture load and mostly stay 3 or 4 inches, so they are not in this line.

**A better source Matt may hold.** If any Kulka buyout breaks out a building drain or an
underground sanitary line by size, that one number would replace the $70 per LF assumption
and make this line far more reliable than anything published.

---

## Insulation

### 11. Separate cost codes for above-deck polyiso and continuous wall insulation?

**Recommendation.** Yes. Give each of these its own cost code, separate from the 07.02000
batt rate:

1. **Roof insulation above deck (polyiso)**, MasterFormat 07 22 00, Roof and Deck
   Insulation. It is installed by the roofer as part of the roof system.
2. **Wall continuous insulation**, MasterFormat 07 21 13, Board Insulation (or the
   insulated sheathing line, if Kulka carries ZIP-R under framing).
3. **Floor over an unheated garage**, MasterFormat 07 21 29, Sprayed Insulation, or 07 21 13
   when board is used.

Matt picks the ProEst numbers. I did not invent them.

**Why.**

- *Different trades.* Polyiso goes on with the roofing. Wall board goes on with the
  sheathing, weather barrier or siding. Garage ceiling insulation goes on with spray
  fireproofing or a spray insulation sub. Batts go in with the drywall package. A blended
  rate hides which sub carries what, and buyout comparisons get muddy.
- *Different quantities.* Roof insulation follows roof area (one floor plate). Continuous
  insulation follows opaque exterior wall area. Garage insulation follows garage area.
  Batts follow wall and partition area. One GSF-driven rate cannot track four quantities
  that change in different ways as a building gets taller or wider.
- *Different unit costs.* Batts run $1.25 to $1.50 per SF in Kulka's files. Polyiso and
  continuous insulation run two to four times that per SF of their own area (section 12).
  Folding them into the batt rate either underprices them or overprices the batts.
- *The code moves them separately.* V64, VA and VR were designed to the 2020 energy code.
  The 2025 code raises roof insulation above deck to R-33ci for buildings of four stories or
  more, and many wall rows now call for continuous insulation (criteria doc, section 3).
  Separate codes let each line follow its own code row.
- *The evidence already splits.* V64 and VR price roof and deck iso board on their own
  lines (item 12 sources, r81 and r86). The split matches how Kulka already estimates.

### 12a. Polyiso above deck

**Suggestion.**

- R-33ci (commercial energy code path, Group R buildings of four stories or more): **$4.25
  per SF of roof**, range $2.50 to $5.50.
- R-30ci (residential path, three stories or fewer): **$3.90 per SF of roof**, range $2.25
  to $5.00.
- Tapered polyiso: add 10 to 25 percent to the insulation cost
  ([The Roofing Brief, June 2026](https://theroofingbrief.com/tpo-roof-installation-cost/)).

**Code check.** The task said "about R-30." The 2025 ECCCNYS, effective December 31, 2025,
requires R-33ci above deck in climate zone 4 for commercial buildings, which include Group R
buildings over three stories. PIMA shows it met with two layers of 2.9-inch polyiso
(R-33.6) ([PIMA New York fact sheet, December 2025](https://cdn.ymaws.com/www.polyiso.org/resource/resmgr/state_energy_fact_sheets/2026_footer_update/ny_pima_state_energy_12_2025.pdf)).
The insulation criteria doc agrees: R-30ci residential, R-33ci commercial.

**What is included.** Two staggered layers of polyiso board, fasteners and plates or
adhesive, and installation labor. Not included: the membrane, a cover board ($0.50 to $0.80
per SF for gypsum, $0.40 to $0.65 for high density polyiso, per The Roofing Brief), a vapor
retarder, crickets, and the roof deck.

**How I got there.**

- *Material.* A 2.5-inch GAF EnergyGuard polyiso board (R-15.3) lists at $58.80 per 4x8
  sheet at retail, $1.84 per SF, or about $0.12 per R per SF
  ([Super Arbor listing](https://superarbor.io/products/gaf-energyguard-iso-polyiso-rigid-insulation-board-2-5-in-x-4-ft-x-8-ft-sheet)).
  R-33 is about $4.00 per SF at retail. A roofing sub buying by the truckload pays less; I
  assumed 25 to 35 percent less, about $2.60 to $3.00.
- *Labor and fastening.* Two layers, fastened or adhered: about $0.85 to $1.45 per SF in
  Kulka's region (judgment).
- *Sub markup.* 10 to 15 percent.
- *Result.* About $3.80 to $5.10 per SF for R-33. I suggest $4.25.
- *Low end.* The Roofing Brief puts R-30 polyiso at about $1.80 per SF installed and R-38 at
  about $2.30 (2026, national, no stated method). Times 1.10 and scaled to R-33 that is about
  $2.40. I set the low end of the range at $2.50 to keep that source in view, but it sits
  below the material cost I found, so I do not rely on it.
- *High side check.* NYSERDA's 2019 cost study for NYStretch priced a small added layer of
  above-deck insulation at $0.3881 per SF for R-2.2, New York cost factors, RSMeans 2018
  ([NYSERDA Report 19-34](https://www.nyserda.ny.gov/-/media/Project/Nyserda/Files/Programs/Energy-Code-Training/commercial-cost-analysis-report.pdf)).
  That is extruded polystyrene priced as an increment, and a thin increment carries
  far more labor per R than a full roof, so it overstates. It still points to the upper
  half of the range.

### 12b. Continuous exterior insulation on wood-frame walls

**Suggestion, per SF of opaque wall area.**

| System | Suggested | Range |
| --- | --- | --- |
| R-5: 1-inch foil-faced polyiso over sheathing, seams taped | $2.25 | $1.50 to $3.25 |
| R-7.5 to R-10: 1.5 to 2-inch polyiso | $3.00 | $2.25 to $4.25 |
| R-10: 2.5-inch mineral wool board (for a noncombustible or fire-rated wall) | $4.50 | $3.50 to $6.00 |
| Furring strips or clips, when the cladding needs its own attachment layer | add $1.00 to $2.00 | n/a |
| ZIP-R insulated sheathing, cost above standard ZIP sheathing | $1.50 to $2.75 | n/a |

**Which row a building needs.** For Group R buildings over three stories, the 2025 State
commercial table allows R-13 + R-4.5ci or R-19 + R-1.5ci on wood walls. So a 4 to 7 story
wood building can meet code with a thin layer, and the R-5 row covers it. Buildings of three
stories or fewer on the residential path need R-20 + R-5ci or R-13 + R-10ci, or R-30 in the
cavity (criteria doc, section 3).

**What is included.** Board, fasteners, seam tape, and labor to install. Not included:
furring or clips (listed separately), the weather barrier where the foam is not used as
one, window and door jamb extensions, flashing changes, and scaffolding or lifts, which
Kulka usually carries with the siding.

**How I got there.**

- *Published base.* PNNL's national cost study for the 2021 IECC found that 1-inch polyiso
  or EPS (R-5) costs $0.98 per SF of wall installed, from RSMeans 2020
  ([PNNL-31019, 2021 IECC national cost-effectiveness](https://documents.dnrec.delaware.gov/Admin/Hearings/2025-R-CCE-0008/Exhibits/2021-IECC-PNNL-National-Cost-Effectiveness.pdf)).
  Times 1.32 and 1.10 gives $1.42. That study models a two-story house.
- *Multifamily adjustment.* On a 4 to 7 story building the crew works from lifts or
  scaffold, tapes every seam, and wraps every window opening. I added 40 to 60 percent for
  that, which is judgment, giving about $2.00 to $2.25. I suggest $2.25.
- *Material checks for the thicker rows.* Rockwool Comfortboard 80, 2 inches (R-8.4), lists
  at $124.99 per 40 SF bag, $3.12 per SF at retail
  ([Warehoos listing](https://warehoos.com/products/2-inch-x-2-x-4-rockwool-comfortboard-80-40-square-foot-per-bag)).
  At R-10, with a trade discount, material is about $2.40 to $2.90, and labor and fasteners
  add about $1.00 to $1.50, hence $4.50. ZIP-R R-9.6 lists at $102.05 per 4x8 sheet, $3.19
  per SF ([Hancock Lumber listing](https://shop.hancocklumber.com/product/zip-2-4-x8-r-sheathing-r9-6)),
  against roughly $1.00 per SF for standard ZIP sheathing, which is where the ZIP-R row
  comes from.

### 12c. Insulation under a floor over an unheated garage

**Suggestion.**

- Concrete podium slab over the garage, R-16.7ci (commercial mass floor row): **$4.50 per
  SF of garage ceiling**, range $3.25 to $6.50.
- Wood-framed floor over a garage (residential path, R-30 or R-19 + R-7.5ci): **$2.00 per
  SF** for R-30 batts between joists, range $1.50 to $2.75.

**The typical approaches under a podium slab, and what each costs.**

1. *Spray-applied cellulose (for example K-13).* R-3.7 per inch, so R-16.7 needs about 4.5
   inches. Above about 3 to 4 inches the maker's High-R system uses stick pins and lath to
   hold it up ([International Cellulose, K-13 High-R](https://www.spray-on.com/products/highr/)).
   One installer's guide prices 4 inches and more at $3.00 to $4.50 per SF, with urban work
   20 to 30 percent above rural
   ([Bahl Fireproofing, K13 installation cost](https://bahlfireproofing.com/k13-installation-cost-complete-budget-guide/)).
   In Kulka's region that suggests about $3.50 to $5.00. It also absorbs sound and leaves a
   finished garage ceiling.
2. *Closed-cell spray foam plus a thermal barrier.* R-16.7 is about 2.6 inches at R-6.5 per
   inch. Home Innovation Research Labs priced closed-cell foam at $1.83 per SF for 2 inches
   and $2.75 for 3 inches as the sub's price to the builder, national, 2021
   ([NAIMA / Home Innovation, Insulation Costs for New Construction Homes](https://insulationinstitute.org/wp-content/uploads/2021/11/NAIMA-Insulation-Costs-FINAL-9.28.2021-rev1.pdf)).
   Interpolated to 2.6 inches that is about $2.38, or $3.45 after escalation and location.
   Foam left exposed in a garage needs a thermal barrier or an approved intumescent
   coating, which I estimate at $1.00 to $2.00 per SF installed (judgment; one supplier
   quotes $0.25 to $0.60 per SF for the coating material alone,
   [RDR Technologies](https://rdrtechnologies.com/blog/much-intumescent-paint-cost)). That
   makes $4.45 to $5.45.
3. *Mineral wool board pinned or adhered to the slab.* I found no reliable installed price.
   Consumer guides give $2.50 to $7.50 per SF for mineral wool across all uses. I estimate
   $4.50 to $6.50 for a garage soffit with a facing, which is judgment.

Option 1 or 2 is what I would expect most New York podium jobs to use, and both land near
$4.50.

**Wood floor.** Home Innovation priced R-21 kraft batts at $1.39 per SF to the builder in
2021. R-30 batts cost more, and overhead work in a garage is slower. About $1.55 in 2021
money, times 1.32 and 1.10, gives about $2.25. Kulka's own 2023 files carry R-21 batts at
$1.25 to $1.50, so I suggest $2.00 as the middle.

---

## What we could not find

- **A current RSMeans or Gordian sprinkler assembly price in public view.** RSMeans prices
  Light Hazard and Ordinary Hazard wet and dry systems per SF in its assemblies data, but
  those tables sit behind the subscription. The free model page for a 4 to 7 story
  apartment shows only totals, from 2019 data.
- **Any NFSA, NIST or HUD study of multifamily sprinkler cost per SF.** The NFPA and NFSA
  cost studies cover one- and two-family homes on NFPA 13D. The only multifamily figure is
  the NMHC estimate of $1 to $2 per SF between NFPA 13 and 13R, from 2020.
- **Cumming or RLB cost reports with a fire protection or insulation line.** Their public
  reports give totals per SF by building type and market, not trade-level lines.
- **A published price for a trash chute sprinkler head or its piping.** Section 6 is a
  build-up.
- **Plumbing cost by building drain size, or labor hours by pipe diameter.** No source ties
  plumbing cost to fixture units or drain tier. The Craftsman estimator and MCAA labor
  units were not reachable in public previews. Section 9 rests on manufacturer list price
  ratios and a stated labor assumption.
- **An installed price for mineral wool board under a garage slab.** Only consumer ranges
  exist.
- **Open shop location factors for Kulka's counties.** RSMeans factors are union based. The
  10 percent open shop adjustment comes from one national RSMeans model and is applied here
  by judgment.
- **Whether V64, VA and VR used NFPA 13R or 13.** This is question 4 in the sprinkler
  criteria doc and only Matt's files or the fire protection drawings can answer it. It
  matters because a 2023 podium job on NFPA 13R would understate a 2026 NFPA 13 job by about
  the section 5 figure.
