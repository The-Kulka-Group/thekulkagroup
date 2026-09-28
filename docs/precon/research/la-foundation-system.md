# Foundation system: spread footings, mat, deep foundations or ground improvement

Researched 2026-09-28 for the Design and Engineering layer. This file answers which foundation
system a 3 to 7 story multifamily job in New York most likely uses at conceptual budgeting, what
drives the choice, and what each choice adds to the budget. It ends with a rule the app could
run from facts the intake already stores. Everything here is a proposal for Matt to confirm.
Kulka AI states planning assumptions only. It does not read drawings or perform takeoffs, and it
never has a geotechnical report at this stage.

Code text carries the bearing values and the waterproofing rules. FHWA and NAVFAC manuals carry
the selection logic. USGS, NYSDOT and NRCS carry the regional geology. WoodWorks carries the
building weights. The arithmetic that joins them is ours and is marked as ours.

## Short answer

On good ground, a 3 to 7 story wood or light-gauge building sits on spread and continuous
footings with a slab on grade. That holds on most of Long Island's outwash sand and on most of
the till and rock of Rockland, Westchester and the Hudson Valley. Our arithmetic from published
building weights says footings under these buildings cover roughly 10 to 45 percent of the
footprint at the code's lowest sand value. A mat starts to pay only past about 50 percent.

Four things move a job off spread footings:

1. **Poor soil.** Uncontrolled fill, peat and marsh deposits, and soft lake clay. The code gives
   these no presumptive bearing value. NYSDOT says structures on muck or peat "nearly always
   require pile foundations" and buildings on lake-bottom sediments usually need piles "unless
   loads are very light." Light buildings on loose sand, fill or medium clay are the use case for
   ground improvement (rammed aggregate piers).
2. **A heavy podium.** One concrete podium level weighs about as much as the five wood stories
   on top of it. Podium loads also gather at columns.
3. **Water under a basement.** Groundwater above the lowest floor turns dampproofing into
   waterproofing and asks the floor to resist uplift, which is the textbook reason for a mat.
4. **A coastal V zone.** Federal flood rules require pilings or columns there and ban fill for
   structural support.

A basement adds full-height foundation walls, dampproofing or waterproofing, a footing drain,
and often excavation support and dewatering. Tying into an existing building adds underpinning
wherever the new work digs below the old footings.

## 1. Building loads and presumptive bearing values

### What the code allows without a report

New York State adopted the 2025 Building Code of New York State, based on the 2024 IBC,
effective December 31, 2025 (NYS Department of State, notice of adoption; UpCodes, BCNYS 2025).
Its Table 1806.2 gives these presumptive values (BCNYS 2025, Chapter 18, via UpCodes):

| Class | Material | Vertical allowable pressure |
| --- | --- | --- |
| 1 | Crystalline bedrock | 12,000 psf |
| 2 | Sedimentary and foliated rock | 4,000 psf |
| 3 | Sandy gravel and gravel (GW, GP) | 3,000 psf |
| 4 | Sand, silty sand, clayey sand, silty gravel, clayey gravel (SW, SP, SM, SC, GM, GC) | 2,000 psf |
| 5 | Clay, sandy clay, silty clay, clayey silt, silt, sandy silt (CL, ML, MH, CH) | 1,500 psf |

- Section 1806.2 says design values "shall not exceed" the table unless data support higher
  values. It also says "mud, organic silt, organic clays, peat or unprepared fill shall not be
  assumed to have a presumptive load-bearing capacity" without supporting data (IBC 2021
  Section 1806.2, Illinois adoption, via UpCodes).
- The model code allows no increase in vertical bearing for footing width or depth. Only
  lateral values get increases (IBC 2024 Section 1806.3, via UpCodes).
- Footings must be at least 12 inches deep and 12 inches wide (IBC 2024 Section 1809.4) and
  must extend below the frost line (BCNYS 2025 Section 1809.5).
- Table 1809.7 allows prescriptive light-frame footings only up to three floors: 12 by 6 inches
  for one floor, 15 by 6 for two, 18 by 8 for three (IBC 2024 Table 1809.7, via UpCodes).
  Four stories and up need an engineered footing.

### What a report often allows

A geotechnical report usually earns much higher values than the IBC table. Two public
references show the gap:

- **NYC Building Code 2022, Table 1806.1** (applies inside New York City only): dense granular
  soil 6 tons per square foot (12,000 psf), medium granular soil 3 tsf (6,000 psf), dense sandy
  gravel 10 tsf, hard clay 5 tsf. It lists "organic silts, organic clays, peats, soft clays, loose
  granular soils, loose silts, and varved silts" as "nominally unsatisfactory bearing material"
  (Section 1806.2.1). It caps satisfactory uncontrolled fill at 2 tsf (Section 1806.2.3).
- **NAVFAC DM-7.02 (1986), Table 1, Chapter 4**: very compact glacial till 8 to 12 tsf
  (10 recommended); coarse to medium sand, medium to compact, 2 to 4 tsf (3 recommended);
  loose sand 1.5 tsf.

So a Long Island outwash sand that the IBC holds to 2,000 psf could carry 6,000 psf or more
once a report classifies it. The IBC value is conservative. Using it at ROM stage makes footings
larger. It does not change the system on good ground.

### How heavy these buildings are

WoodWorks' five-story wood over one-story podium design example (2025) gives:

- Wood floor dead load 30 psf, plus 12.5 psf for walls, for 42.5 psf per floor. Residential live
  load 40 psf. Roof dead load 28 psf plus walls and parapets, 35 psf in the seismic weights. Roof
  live load 20 psf. (Table 1.1 and Table 1.2.)
- Floor plate 12,000 SF. Seismic weight 510 kips per wood floor, 420 kips at the roof, and
  2,632 kips at the concrete podium level. The five wood stories weigh 2,460 kips in total.
- A bearing wall with 13 ft of tributary floor carries 490 plf of dead load and 520 plf of live
  load per floor (Table 3.7).

Our division of those weights by the 12,000 SF plate: 42.5 psf per wood floor, 35 psf at the
roof, and 219 psf at the podium level. **The one concrete podium level weighs slightly more than
all five wood stories above it (2,632 kips against 2,460 kips).**

WoodWorks describes common podium jobs as "four or five stories of residential use over parking,
retail, commercial, and/or office," and "six or even seven stories" including the podium with
subterranean parking. It says Type III can reach five stories of wood framing in multifamily and
Type V-A four (WoodWorks, Code Path and Requirements for Mid-Rise Podium Projects).

Light-gauge (cold-formed steel) bearing-wall buildings usually span concrete floors: composite
deck, long-span deck or hollow-core plank (STRUCTURE magazine, Bruns, "Steel Stud Bearing
Walls"). The same source calls these wall systems "particularly desirable for 6- to 12-story"
multifamily. A second STRUCTURE article (Liescheidt, "Lightening the (Dead) Load on Floors")
puts a steel-and-concrete floor at 45 psf and implies about 68 psf for hollow-core plank.
Kulka's own Riverhead file prices "Floor Joists & Decking - Comslab," which is this kind of
floor (`canonical-work-items.md`).

### Our arithmetic: average pressure and footing coverage

This is ours, not a source. Average service pressure over the footprint is the sum of dead plus
live load on every level that the footings carry. The lowest slab bears on soil and is left out.
Per level, from the figures above:

- Wood floor: 42.5 + 40 = 82.5 psf.
- Light-gauge floor with concrete: 45 to 68 psf, plus 12.5 psf of walls, plus 40 psf live, for
  97.5 to 120.5 psf.
- Roof: 35 + 20 = 55 psf.
- Concrete podium level: 219 + 40 = 259 psf.

Coverage is that pressure divided by the allowable bearing value.

| Case | Levels the footings carry | Average pressure | Coverage at 2,000 psf (Class 4) | Coverage at 1,500 psf (Class 5) |
| --- | --- | --- | --- | --- |
| Wood, 3 stories on grade | 2 floors + roof | 220 psf | 11% | 15% |
| Wood, 4 stories on grade | 3 floors + roof | 303 psf | 15% | 20% |
| Wood, 5 stories on grade | 4 floors + roof | 385 psf | 19% | 26% |
| Light gauge, 5 stories on grade | 4 floors + roof | 445 to 537 psf | 22% to 27% | 30% to 36% |
| Light gauge, 7 stories on grade | 6 floors + roof | 640 to 778 psf | 32% to 39% | 43% to 52% |
| Wood 4 over 1 podium (5 stories) | podium + 3 floors + roof | 562 psf | 28% | 37% |
| Wood 5 over 1 podium (6 stories) | podium + 4 floors + roof | 644 psf | 32% | 43% |
| Wood 5 over 2 podium (7 stories) | 2 podium levels + 4 floors + roof | 903 psf | 45% | 60% |

Limits on this table, all ours:

- Live load is unreduced. Real design reduces it, which lowers every figure.
- Footing weight and backfill over the footing are left out, which raises every figure a little.
- Averages hide concentration. A 5 over 1 interior column with a 30 by 30 ft bay carries about
  900 SF x 644 psf, or 580 kips. At 2,000 psf that needs a footing about 17 ft square.
- A wood bearing wall in a five-story building on grade carries about 2,116 plf dead and
  2,120 plf live (WoodWorks Table 3.7, third row). At 2,000 psf that needs a continuous footing
  a little over 2 ft wide. Frost depth, not bearing, often sets the concrete quantity for these
  buildings.

### When a mat makes sense

- NAVFAC DM-7.02 (Chapter 4, Section 4): mats "are generally appropriate if the sum of individual
  footing base areas exceeds about one-half the total foundation area; if the subsurface strata
  contain cavities or compressible lenses; if shallow shear strain settlements predominate and the
  mat would equalize differential settlements; or if resistance to hydrostatic uplift is
  required."
- FHWA GEC 6 (Section 2.6): mats "are often economical when spread footings would cover more
  than about 50 percent of the footprint," citing Peck et al. (1974). Its main advantage is "its
  ability to bridge over soft spots and reduce differential movement."
- FHWA GEC 12 (Table 3-2) repeats the one-half rule for mats and adds "very heavy column loads."
- ACI 360R-10 (Section 1.2.9): "Mat foundations are typically more rigid and more heavily
  reinforced than common slabs-on-ground."

Put against the table above, no case reaches 50 percent coverage at 2,000 psf. The 5 over 2
podium gets close at 45 percent and passes it on Class 5 soil. So on good ground a mat is rare
for this building type. Mats show up for wet basements and for heavy podiums on weak soil.

## 2. When deep foundations or ground improvement become likely

### The selection logic

- FHWA GEC 12 (Section 3.2.1): spread footings "are generally more economical than deep
  foundations" where conditions suit them, with "competent soils within shallow depth" first on
  its list of favorable conditions.
- FHWA GEC 12 (Section 3.3): the most common reason for piles is that "the upper soil strata are
  too compressible or too weak to support heavy vertical loads." Other reasons are uplift,
  lateral load, scour, liquefiable soil, and sites next to planned future excavation.
- FHWA GEC 12 (Section 3.2.2): ground improvement with spread footings "may be more cost
  effective than deep foundation solutions" and should be evaluated.
- FHWA GEC 6 (Section 1, citing Briaud and Gibbens 1995): shallow foundations can generally be
  built for "50 to 65 percent of the cost for deep foundations." That figure comes from bridge
  work. We found no equivalent for buildings.

### Poor soil and fill

- The IBC gives no presumptive value for mud, organic silt, organic clay, peat or unprepared fill
  (Section 1806.2).
- NYC's code treats uncontrolled fill as usable only after test pits at every column and borings
  every 2,500 SF, and then only at 2 tsf or less (NYC BC 2022, Section 1806.2.3).
- NYSDOT's Geotechnical Design Manual, Chapter 3 (2013), Section 3.4.8, on muck, peat and marl:
  "Their shear strength is almost zero," water content often 500 percent of dry weight, and
  "Structures will nearly always require pile foundations."
- NYSDOT Section 3.4.6, lacustrine (lake-bottom) sediments: "Foundation conditions are usually
  poor." "Bridges and buildings will usually require pile foundations unless loads are very
  light." Section 3.6 adds that New York lake and marine clays "have a history of slope
  instability resulting in foundation problems, settlement," and landslides.
- NYSDOT Section 3.4.4, outwash: "In general, supplies an excellent foundation for both structures
  and embankments." It warns that outwash "may be relatively thin and over-lie soft silt and clay
  (lacustrine material) at shallow depth, in which case the characteristics of the lacustrine
  material may govern."

### Ground improvement

- FHWA GEC 13 (2017), Chapter 5: aggregate columns (stone columns and rammed aggregate piers)
  are "ideally suited for use in clays, silts, loose silty sands, and uncompacted fills." Rammed
  aggregate pier holes are 18 to 36 inches in diameter and typically 7 to 33 ft deep.
- FHWA GEC 13, Section 2.2.2: "Strata of peat and other organic materials, and very soft clays
  with a thickness greater than the diameter of the aggregate column can be inappropriate."
- FHWA GEC 13, Table 1-6 (November 2016 national unit costs): aggregate columns $15 to $60 per
  lineal foot. This is a transportation figure from 2016 and is not a rate for Kulka.
- Geopier (manufacturer): "Typical bearing pressures of 4 to 8+ ksf," costs "30 to 50 percent less
  than deep foundations," and cement-grouted rigid inclusions for organic soils, soft clay and
  peat (Geopier rammed aggregate pier systems page). These are the maker's own claims.

### Deep foundation types

FHWA GEC 12 Table 3-2 (modified from Bowles 1977) gives:

| Type | Suits | Difficult |
| --- | --- | --- |
| Driven piles | Poor surface soils over a bearing layer 15 to 300 ft down | Shallow hard layer, vibration-sensitive neighbors, boulder fields |
| Drilled shafts | Heavy column loads, bearing layer 25 to 300 ft down | Caving soils, artesian water, boulders, contaminated soil |
| Micropiles | Underpinning, low headroom, rubble fill, boulders, noise limits | Low lateral resistance |
| CFA (auger cast) piles | Medium to stiff clays, medium dense to dense sands, noise and vibration limits | Very soft soils, loose saturated sands, highly variable ground |

- FHWA GEC 8 (2007, Section 3.2.1): CFA piles "have been more widely used in private, commercial
  work" than in highway work, for speed and to limit noise and vibration "in heavily populated
  areas."
- CHANCE Technical Design Manual (Hubbell, manufacturer): helical piles run up to about 100 kips
  in tension and 200 kips in compression per pile, "relatively light to medium loads." The
  manual lists high water tables, weak surface soils, restricted access and underpinning as
  common uses.

### High groundwater

- BCNYS 2025 Section 1803.5.4: an investigation must find whether groundwater sits above or
  within 5 ft below the lowest floor where that floor is below grade.
- BCNYS 2025 Section 1805.1.3: if a dewatering system holds the water at least 6 inches below
  the lowest floor, dampproofing is enough. Section 1805.3: where hydrostatic pressure exists
  and no such system is designed, walls and floors must be waterproofed.
- IBC Section 1805.3.1: waterproofed floors "shall be of concrete and designed and constructed
  to withstand the hydrostatic pressures to which the floors will be subjected" (IBC 2021,
  Illinois adoption, via UpCodes).
- NAVFAC DM-7.02 lists resistance to hydrostatic uplift as a reason for a mat (quoted above).

### Coastal and flood sites

- 44 CFR 60.3(e)(4): new construction in Zones V1-30, VE and V must be "elevated on pilings and
  columns." 44 CFR 60.3(e)(6) prohibits "the use of fill for structural support of buildings" in
  those zones.
- BCNYS 2025 adds a New York amendment, Section 1804.5, that controls fill in flood hazard areas.

## 3. Regional defaults

### Long Island

- USGS (HA 730-M): till "forms the Harbor Hill and Ronkonkoma Terminal Moraines." Outwash
  "primarily of fine to coarse quartzose sand and gravel" lies "between and south of the two
  moraines." Glacial deposits reach about 600 ft thick in the Ronkonkoma Basin, and bedrock sits
  near 2,000 ft below sea level on the south coast.
- NYSDOT GDM Chapter 3 (Section 3.2.13): Long Island soils "are sandy with varying amounts of
  gravel." Moraine tills are "somewhat more compact and less stratified" than outwash. "Many
  tidal marsh areas are found along the shores" behind barrier beaches. "Bedrock, generally
  absent from Long Island," is buried under glacial deposits.
- NRCS Official Series Descriptions: Plymouth soils are "very deep, excessively drained sandy
  soils" in glaciofluvial deposits on Long Island. Montauk soils form in till on moraines and are
  "moderately deep to a densic contact." Ipswich mucky peat, over 130 cm of organic material,
  lies in tidal marshes in New York and neighboring states.
- USGS SIM 3270 (Monti, Como and Busciolano, 2010 data): the water table runs from 0 ft along the
  shore to more than 125 ft above sea level in northwestern Nassau. It forms "an east-west mound
  that coincides with the glacial moraine." Depth to water "reflects the topography," and the
  shallow areas mark "where potential substructure flooding may occur."
- USGS WRI 82-4056 (Doriski and Wilde-Katz, 1983): in southern Nassau and southwestern Suffolk,
  the "20-foot" clay's surface sits 20 to 40 ft below sea level and runs 0 to 30 ft thick. The
  Gardiners Clay sits 40 to 120 ft below sea level and runs 0 to 90 ft thick.
- NYSDEC: on Long Island, a Long Island Well Permit is required when well capacity on a property
  is over 45 gpm, and this covers "temporary or permanent dewatering wells." Capacity means
  installed pump capacity.
- OSHA 29 CFR 1926 Subpart P, Appendix A: "Granular soils including gravel, sand, and loamy
  sand" and "Submerged soil" are Type C. Appendix B: Type C slopes no steeper than 1½ to 1 for
  excavations under 20 ft, and deeper excavations need a registered engineer.

Our reading: central and north-central Long Island, on outwash or moraine away from the shore,
is spread footing ground with a deep water table. The south shore, the barrier islands and the
harbor fringes of the north shore combine a shallow water table, tidal marsh, filled marsh and,
in southern Nassau and southwestern Suffolk, a compressible clay 20 to 40 ft below sea level. A
basement or a heavy podium there is where waterproofing, dewatering, mats and piles come in.
Kulka's own files fit this. Jefferson's Ferry and the Riverhead Vue files price footings and a
slab on grade. West Shore Road alone carries a $350,000 pile allowance, and one Vue file carries
a $200,000 shoring allowance (`canonical-work-items.md`, items 2, 34 and 34a).

A 12 ft basement cut in Type C sand, opened as a slope, reaches 18 ft back from the wall line
before any working room. That is our arithmetic from the OSHA slope. On a tight lot or next to
another building, that means excavation support.

### Rockland

USGS SIR 2010-5245 (Heisig, 2010):

- Bedrock is "mantled by as much as 325 ft of unconsolidated glacial deposits and recent
  alluvium," but thickness varies widely. The thickness map starts at a 0 to 10 ft class and
  shows bedrock outcrops.
- Till "is the most widespread glacial deposit with thicknesses up to 190 ft." Areas of moderate
  permeability "correspond to higher altitudes and thin till." Dense lodgement till occurs in
  some areas of thick till.
- Bedrock is Newark basin sandstone and siltstone (Stockton and Passaic Formations), the
  Palisades diabase sill, and Highlands gneiss and granite in the northwest.
- Sand and gravel fill the Ramapo and Mahwah valleys, typically about 70 ft thick and up to
  140 ft.
- "Fine-grained (fine sand, silt, clay, and peat) stratified lacustrine deposits" overlie sand and
  gravel in the Hackensack River valley and the South Branch Minisceongo Creek valley, "as much as
  90 ft" thick.

### Orange, Ulster and Dutchess

- USGS OFR 97-241 (Wallkill River valley near Middletown, Orange County): lake silt and clay "are
  locally more than 100 ft thick in the area south of Middletown," the "Black dirt" area, under
  peat. Glacial deposits run from more than 150 ft thick to "less than 5 ft where they overlie
  bedrock on many of the hilltops." The rock surface "can change by as much as 100 ft within a
  distance of 500 ft."
- USGS SIM 2960 (Port Jervis trough, Sullivan and Ulster Counties): drillers' logs show outwash
  south of Summitville "underlain by as much as 275 feet of lacustrine silt and clay."
- USGS OFR 82-81 (Sprout and Fishkill creeks, Dutchess County): valley fill includes outwash,
  ice-contact sand and gravel, till, "and lacustrine silt and clay."
- NYSDOT GDM Chapter 3 (Section 3.2.9): the Hudson lowland is "underlain by weak sedimentary
  rocks." USGS state geologic map unit lists put shale, graywacke, phyllite, schist and marble
  across Dutchess, and shale, sandstone and conglomerate across Ulster.
- NYSDOT Section 3.4.3, thin tills: "Excavations deeper than a few feet will almost certainly
  encounter rock," and "Most structures can readily be founded on rock."
- NYSDOT Section 3.2.6.3, Hudson Highlands: "a rocky upland with little or no soil cover."

### Westchester

- NYSDOT Section 3.2.7: most of Westchester sits in the Manhattan Prong. "Glacial till, which is
  mostly sandy, lies over a highly irregular bedrock surface." Schist, gneiss and granodiorite
  form the ridges and "less resistant marble is the valley maker."
- USGS state geologic map, Westchester: Fordham Gneiss (27 percent), Manhattan Formation schist
  (17 percent), Inwood Marble (11 percent).

Our reading for the whole Rockland to Hudson Valley area: uplands put footings on till or rock,
which carries these buildings easily. Rock raises the cost of footings below frost, basements,
elevator pits and utility trenches. It rarely changes the foundation type. Valley bottoms can hold
tens of feet of lake clay and peat, and there NYSDOT expects piles for anything but light loads.
The same valley can hold both conditions within a short distance.

### Frost depth

Each jurisdiction sets its own frost line in Residential Code Table R301.2(1). Two published
examples: Town of Smithtown (Suffolk), 36 inches; Village of Rye Brook (Westchester), 42 inches.
Every perimeter footing goes at least that deep, even with no basement.

### Regional summary

| Region | Ground | Default we propose | Main risks |
| --- | --- | --- | --- |
| Long Island, inland and moraine | Outwash sand and gravel, compact sandy till | Spread Footings | Local kettle muck, fill |
| Long Island, south shore and harbors | Outwash near sea level, marsh, fill, 20-foot clay | Spread Footings, but poor soil likely where fill or marsh | Shallow water, flood zones, compressible layers |
| Rockland, Westchester, Highlands uplands | Thin to thick till over rock | Spread Footings | Rock excavation, sloping rock under one building |
| Hudson and Wallkill valley bottoms, Hackensack valley | Lake silt, clay and peat | Deep Foundations when poor soil is yes | Settlement, slope instability |

## 4. What each system changes in the budget

| System | What gets built | Canonical items it moves |
| --- | --- | --- |
| Spread Footings | Continuous footings under bearing walls, pads under columns, perimeter walls down to frost depth, slab on grade with vapor barrier | Item 2 Footings and Foundation Walls, Slab-on-Grade; item 34 excavation and backfill |
| Mat Foundation | One thick, heavily reinforced slab under the whole footprint that is also the lowest floor. More concrete and much more rebar per SF than a slab on grade, no separate footings | Item 2 (the mat replaces footings and slab); item 34 excavation to mat level |
| Deep Foundations | Piles (driven, auger cast, drilled or helical), pile caps, grade beams between caps, and a structural slab in place of the slab on grade. Pile tests | Item 34a pile allowance; item 2 caps, grade beams and structural slab |
| Ground Improvement | Aggregate piers under the footings (and under the slab if needed). Footings and slab on grade stay, often smaller | Item 34a or a new line; item 2 as for spread footings |
| Existing Foundations | Nothing new unless new loads or an addition | None |

### Slab on grade versus structural slab

ACI 360R-10 defines a slab-on-ground as "a slab, supported by ground, whose main purpose is to
support the applied loads by bearing on the ground." A structural slab spans between supports
instead, so it is thicker and carries far more rebar. Our reading of when each applies:

- **Slab on Grade**: good ground, and ground improvement jobs.
- **Structural Slab**: pile jobs, where the ground cannot be trusted to carry the floor, and
  basements with water pressure under the floor (IBC 1805.3.1).
- **Mat Slab**: when the mat is the foundation.

A podium building still has a lowest slab under its parking or retail level, plus the elevated
podium deck in item 3. `canonical-work-items.md` suggests that structured or underground parking
implies no slab on grade, based on VR's zeroed slab line. That is not how podium buildings are
built. We read VR's zero as scope carried elsewhere, not as a missing slab. Matt should confirm.

### What a basement or below-grade parking adds

Sourced rules:

- Full-height foundation walls that retain soil (IBC Section 1807).
- Dampproofing on walls and floors plus a subsoil drain where there is no water pressure
  (BCNYS 2025 Sections 1805.2 and 1805.4).
- Waterproofing from the bottom of the wall to 12 inches above the highest groundwater, and a
  floor designed for water pressure, where there is water pressure (BCNYS 2025 Section 1805.3;
  IBC 1805.3.1).
- Excavation support when a slope will not fit, designed by an engineer, with 10 days' written
  notice to neighbors and movement monitoring (BCNYS 2025 Section 3307).
- Dewatering, with a Long Island Well Permit over 45 gpm of pump capacity (NYSDEC).

Our reading: every one of these already exists as a container in item 2 or item 34, gated by
Levels Below Grade and Site Conditions. The foundation rule does not need to price them again.
It only has to pick the lowest slab and flag the mat case.

### Tying into an existing building

- BCNYS 2025 Section 1804.1: excavation "shall not reduce vertical or lateral support for any
  foundation or adjacent foundation without first underpinning or protecting the foundation."
- NYC BC 2022 Section 1817 goes further. An engineer must assess the neighboring building and
  name acceptable methods of support before foundation plan approval.
- FHWA GEC 12 names micropiles for underpinning. The CHANCE manual names helical piles for it.

Our reading: underpinning is likely when the new work goes below grade next to an existing
building, and possible when it does not, since new footings at frost depth can still undercut an
old shallow footing. It does not change the system for the new work.

## 5. Proposed decision rule

Two proposed criteria, following the V-1 and V-2 pattern. The codes are placeholders for Matt:

- **S-1, Foundation System.** Choices: Spread Footings, Mat Foundation, Deep Foundations, Ground
  Improvement, Existing Foundations.
- **S-2, Lowest Floor Slab.** Choices: Slab on Grade, Structural Slab, Mat Slab.

### Inputs

| Input | Where it comes from | Used for |
| --- | --- | --- |
| Construction kind | `construction_kind` | Renovation branch |
| Stories above grade | `stories_above_grade` | Levels the footings carry |
| Framing system (wood or metal) | `framingSystem` | Weight per floor |
| Parking type | `parking_type` (none, surface, structured, underground, don't know) | Podium levels; below-grade deck |
| Levels below grade | `levels_below_grade` (yes, no, don't know) | Basement; wet basement |
| Groundwater or poor soil | `site_conditions` (yes, no, don't know) | Poor ground branch |
| Existing building tie-in | `existing_building_tie_in` | Underpinning flag; addition branch |
| ZIP | `zip` | Rock flag; shore flag |
| New, optional: "Foundation System" (Spread Footings, Mat, Deep, Ground Improvement, Not Sure) | New question, like V-2's jack type | Estimator override |

Gross square feet, unit count and building count do not change the system. Average pressure per
square foot of footprint does not depend on floor area when floors stack. They still drive the
quantities downstream.

### Assumptions the rule makes (ours, not sourced)

- The allowable bearing value is 2,000 psf, IBC Class 4, in every region. It is the code's value
  for sand and for most till. A report will usually allow more.
- Per-level loads are the Section 1 figures: 82.5 psf per wood floor, 97.5 to 120.5 psf per
  light-gauge floor (the rule uses the high end), 55 psf at the roof, 259 psf per concrete deck.
- Structured parking means one podium level, or two when stories above grade is 7 or more.
  Underground parking means one concrete deck at grade over the garage.
- A building that goes below grade has an elevated ground floor.
- "Light" means no concrete deck and coverage of 30 percent or less. That covers wood or light
  gauge on grade up to five stories.
- Site Conditions yes cannot tell groundwater from poor soil. The rule treats it as either.
- ZIP regions reuse `rockPossible()` in `lib/rom/jack-criterion.ts` (prefixes 105 to 109 and 124
  to 126). A Long Island set would be 115, 117, 118 and 119, plus 110, which Nassau shares with
  Queens. The prefixes need checking against a ZIP-to-county table before they ship.

### Rule

1. **Stories above grade missing.** No derivation. The same rule as V-1: nothing invents a story
   count.
2. **Renovation.**
   - Tie-in no: S-1 **Existing Foundations**, S-2 not applicable, low confidence. Flag that new
     loads (a new floor, rooftop equipment) would need a check.
   - Tie-in yes or don't know: treat the work as an addition. Run steps 3 to 7 for it, keep
     confidence low, and flag underpinning.
3. **Arithmetic.** Elevated floors E = stories above grade minus 1, plus 1 if the building goes
   below grade. Concrete decks k = 0 for none or surface parking, 1 for structured (2 at 7 or
   more stories) or underground. Average pressure P = 55 + (E minus k) x floor load + k x 259.
   Coverage C = P / 2,000.
4. **Site conditions yes.**
   - Light and not below grade: S-1 **Ground Improvement**, S-2 **Slab on Grade**. Low.
   - Light and below grade: S-1 **Mat Foundation**, S-2 **Mat Slab**. Low. Water under a basement
     is the mat case, and piers do not solve water.
   - Heavy (a concrete deck, or C over 30 percent): S-1 **Deep Foundations**, S-2 **Structural
     Slab**. Low.
5. **Site conditions no.**
   - C of 50 percent or less: S-1 **Spread Footings**, S-2 **Slab on Grade**. If the building
     goes below grade, the basement floor is the slab on grade, dampproofed.
   - C over 50 percent: S-1 **Mat Foundation**, S-2 **Mat Slab**. Low.
6. **Site conditions don't know or unanswered.** Run step 5 for the priced base. Add "Ground
   Improvement or Deep Foundations" as a TBD line that sits outside the total, the way
   `rom-spec.md` treats every don't-know. Low.
7. **Flags that do not change S-1.**
   - ZIP in the rock set: Rock Excavation possible for footings and trenches, likely if the
     building goes below grade.
   - Long Island ZIP, below grade, and site conditions not "no": shallow water possible.
   - Tie-in yes: Underpinning likely if below grade, possible otherwise.
   - Parking underground but Levels Below Grade no: treat as below grade and flag the conflict.
8. **Override.** If the optional Foundation System question is answered, its answer replaces
   S-1, S-2 follows from it, and confidence becomes high.

A gauge for the card could show coverage from 0 to 100 percent with the line at 50: Spread
Footings below it, Mat above it. Poor soil moves the answer off the gauge, and the card should
say so.

### How confidence is set

There is never a geotechnical report at this stage, so confidence is low by default. It is high
only when every one of these holds:

- New construction.
- Site conditions answered no.
- Levels below grade answered no.
- Tie-in answered no.
- Parking none or surface, so no concrete deck.
- Coverage of 30 percent or less.

High reason line: "Light building on grade with no basement, and the estimator said no poor soil
or groundwater. Footings need about C of the footprint at the code's presumptive sand value."

Low reason line: "No geotechnical report, and at least one of these holds: poor soil or
groundwater is yes or unknown, the building goes below grade, a podium carries the load, coverage
is over 30 percent, or the work ties into an existing building."

Worked examples, all sample projects:

| Facts | S-1 | S-2 | Confidence |
| --- | --- | --- | --- |
| Wood, 4 stories, surface parking, no basement, site no, new | Spread Footings (C 15%) | Slab on Grade | High |
| Wood 5 over 1, structured parking, site no | Spread Footings (C 32%) | Slab on Grade, plus podium deck in item 3 | Low |
| Wood 5 over 2, structured parking, site no | Spread Footings (C 45%, near the mat line) | Slab on Grade | Low |
| Wood, 4 stories, no basement, site yes | Ground Improvement | Slab on Grade | Low |
| Wood, 5 stories, underground parking, site yes | Deep Foundations | Structural Slab | Low |
| Light gauge, 4 stories, basement, site yes | Mat Foundation | Mat Slab | Low |
| Renovation, no tie-in | Existing Foundations | Not applicable | Low |

### What the output drives

- **Spread Footings:** item 2 Footings and Foundation Walls, with perimeter walls to the local
  frost depth (36 to 42 inches in the two examples found). Item 2 Slab-on-Grade and vapor barrier.
- **Mat Foundation:** item 2 prices a mat in place of footings and the slab. Waterproofing goes
  under the mat when site conditions is yes.
- **Deep Foundations:** item 34a carries a pile allowance, flagged, since the pile type and length
  are unknown. Item 2 adds pile caps and grade beams, and the slab becomes structural. The only
  Kulka figure is West Shore Road's $350,000 allowance, one job. The allowance needs a stated
  figure from Matt.
- **Ground Improvement:** a flagged allowance in item 34a or a new line. Footings and the slab on
  grade stay in item 2. This needs a stated figure too.
- **Existing Foundations:** no new foundation lines.
- **Underpinning flag:** a flagged line, placement for Matt to decide.
- **Rock flag:** item 34's Rock Excavation container, which has no gate today.

### When confidence should be low

- Any answer in the benign list is yes, don't know or missing.
- A concrete podium or deck carries the building.
- Coverage is over 30 percent, and especially from 40 to 50 percent, where a mat becomes possible.
- The job is on the Long Island south shore or harbor fringe, or in a Hudson, Wallkill or
  Hackensack valley bottom. ZIP cannot place a site that finely, so the rule cannot see this. The
  estimator's Site Conditions answer is the only signal.
- The job is renovation, since the app does not know whether new foundations exist at all.

## What we could not find

- Any published count of which foundation systems Long Island or Hudson Valley multifamily jobs
  use. The regional defaults rest on geology sources and Kulka's own five priced files.
- Deep Foundations Institute, ADSC and Helical Pile Association guidance. Their manuals sit behind
  membership or purchase. The pile facts above come from FHWA manuals and one manufacturer manual.
- Any published New York cost for piles, aggregate piers, mats or structural slabs on buildings.
  The only cost ratios found are for bridges (GEC 6) and 2016 national transportation work
  (GEC 13), plus a manufacturer claim (Geopier).
- Depth to water by town on Long Island as numbers. USGS publishes it as a map and an online
  viewer. We read the pamphlet, not the map values.
- Depth to rock by town for Rockland, Orange, Ulster, Dutchess and Westchester as numbers. USGS
  shows it on figures, not tables.
- The NYS Geological Survey surficial geologic map (Lower Hudson sheet). We did not read it
  directly. The lake clay locations above come from USGS reports.
- NRCS Web Soil Survey building ratings for this building type. Its "Small Commercial Buildings"
  rating covers "structures that are less than three stories high and do not have basements,"
  and its dwellings ratings cover houses of three stories or less (NRCS rating text, as printed in
  a Web Soil Survey report). No site-level query was run.
- Frost depth for every town. Each jurisdiction sets its own. We found two.
- Evidence tying the south shore "20-foot" clay to building settlement. Its depth and thickness
  are sourced. Whether it governs a podium building there is our inference only.
- The base text of IBC 2024 Section 1806.2's line on organic soils and fill in the New York
  edition. We read it in the IBC 2021 model text as adopted by Illinois. The NYS 2025 table
  values match.
- A way to tell groundwater from poor soil in the stored facts. `site_conditions` joins them.
  Splitting the gate, and adding rock for Rockland and the Hudson Valley, would sharpen this rule.
  Both are Matt's call.
- Flood zone. The app does not store it and ZIP cannot tell a V zone from an A zone.

## Sources

- NYS Department of State, Notice of Adoption, 2025 Uniform Code (effective December 31, 2025):
  https://dos.ny.gov/notice-adoption
- Building Code of New York State 2025 (based on IBC 2024), Chapter 18, via UpCodes:
  https://up.codes/viewer/new_york/ibc-2024/chapter/18/soils-and-foundations
- Building Code of New York State 2025, Chapter 33, Section 3307, via UpCodes:
  https://up.codes/viewer/new_york/ibc-2024/chapter/33/safeguards-during-construction
- IBC 2021 Section 1806.2 and Table 1806.2 (Illinois adoption of the model text), via UpCodes:
  https://up.codes/s/presumptive-load-bearing-values
- IBC 2021 Section 1805.3 (Illinois adoption of the model text), via UpCodes:
  https://up.codes/s/waterproofing
- IBC 2024 Sections 1806.1 to 1806.3 (TWIA adoption of the model text), via UpCodes:
  https://up.codes/s/presumptive-load-bearing-values-of-soils
- IBC 2024 Section 1809.4 (TWIA adoption), via UpCodes: https://up.codes/s/depth-and-width-of-footings
- IBC 2024 Section 1809.7 and Table 1809.7 (TWIA adoption), via UpCodes:
  https://up.codes/s/prescriptive-footings-for-light-frame-construction
- NYC Building Code 2022, Chapter 18 (Tables 1806.1; Sections 1803.2, 1803.6, 1804.1, 1806.2,
  1817): https://www.nyc.gov/assets/buildings/codes-pdf/cons_codes_2022/2022BC_Chapter18_SoilsFoundationsWBwm.pdf
- NAVFAC DM-7.02, Foundations and Earth Structures (1986), Chapter 4, Table 1 and Section 4:
  https://vulcanhammer.net/wp-content/uploads/2017/01/dm7_02.pdf
- FHWA GEC 6, Shallow Foundations (FHWA-SA-02-054), Sections 1 and 2.6:
  https://www.fhwa.dot.gov/engineering/geotech/pubs/010943.pdf
- FHWA GEC 12, Design and Construction of Driven Pile Foundations, Volume I (FHWA-NHI-16-009),
  Chapter 3 and Table 3-2: https://www.fhwa.dot.gov/engineering/geotech/pubs/gec12/nhi16009_v1.pdf
- FHWA GEC 8, Design and Construction of Continuous Flight Auger Piles (2007), Section 3.2.1:
  https://www.fhwa.dot.gov/engineering/geotech/pubs/gec8/gec8.pdf
- FHWA GEC 13, Ground Modification Methods, Volume I (FHWA-NHI-16-027), Table 1-6 and Chapter 5:
  https://www.fhwa.dot.gov/engineering/geotech/pubs/nhi16027.pdf
- ACI 360R-10, Guide to Design of Slabs-on-Ground, Chapter 1 (public preview):
  https://www.concrete.org/portals/0/files/pdf/previews/360r-10web.pdf
- WoodWorks, Five-Story Light-Frame Wood Structure Over Podium, design example (2025), Tables 1.1,
  1.2 and 3.7: https://www.woodworks.org/wp-content/uploads/design_example_Five_Story_Light-Frame_Wood_Structure_Over-Podium_10.2025.pdf
- WoodWorks, Code Path and Requirements for Mid-Rise Podium Projects:
  https://www.woodworks.org/resources/code-path-and-requirements-for-podium-projects/
- STRUCTURE magazine, Bruns, "Steel Stud Bearing Walls":
  https://www.structuremag.org/article/steel-stud-bearing-walls-2/
- STRUCTURE magazine, Liescheidt, "Lightening the (Dead) Load on Floors":
  https://www.structuremag.org/article/lightening-the-dead-load-on-floors/
- Geopier, Rammed Aggregate Pier Systems (manufacturer page, read 2026):
  https://www.geopier.com/solutions/rammed-aggregate-pier-systems
- Hubbell, CHANCE Technical Design Manual, Edition 4 (manufacturer), Section 1:
  https://helicaldrilling.com/wp-content/uploads/2024/05/CHANCE-Technical-Design-Manual.pdf
- NYSDOT Geotechnical Design Manual, Chapter 3, Geology of New York State (2013), Sections 3.2.6,
  3.2.7, 3.2.9, 3.2.13, 3.4 and 3.6:
  https://www.dot.ny.gov/divisions/engineering/technical-services/geotechnical-engineering-bureau/geotech-eng-repository/GDM_Ch-3_Geology_of_NY.pdf
- USGS, HA 730-M, Long Island text: https://pubs.usgs.gov/ha/ha730/ch_m/M-text3.html
- USGS, Long Island hydrogeologic units:
  https://www.usgs.gov/centers/new-york-water-science-center/science/long-island-hydrogeologic-units
- USGS SIM 3270, Monti, Como and Busciolano, water table and depth to water, April to May 2010:
  https://pubs.usgs.gov/sim/3270/pdf/sim3270_monti_Map_text_content.pdf
- USGS WRI 82-4056, Doriski and Wilde-Katz, "20-foot" clay and Gardiners Clay (1983):
  https://pubs.usgs.gov/publication/wri824056
- USGS SIR 2010-5245, Heisig, Water resources of Rockland County, 2005 to 2007:
  https://pubs.usgs.gov/sir/2010/5245/pdf/sir2010-5245_heisig_508_03012011.pdf
- USGS OFR 97-241, Geohydrology and water quality of the Wallkill River valley near Middletown:
  https://ny.water.usgs.gov/archived_files/pubs/of/of97241/OF97-241.pdf
- USGS SIM 2960, Port Jervis trough valley-fill aquifer: https://pubs.usgs.gov/publication/sim2960
- USGS OFR 82-81, Sprout and Fishkill creeks valley-fill aquifer, Dutchess County:
  https://pubs.usgs.gov/publication/ofr8281
- USGS state geologic map units, Westchester County: https://mrdata.usgs.gov/geology/state/fips-unit.php?code=f36119
- USGS state geologic map units, Dutchess County: https://mrdata.usgs.gov/geology/state/fips-unit.php?code=f36027
- USGS state geologic map units, Ulster County: https://mrdata.usgs.gov/geology/state/fips-unit.php?code=f36111
- NRCS Official Series Description, Plymouth: https://soilseries.sc.egov.usda.gov/OSD_Docs/P/PLYMOUTH.html
- NRCS Official Series Description, Montauk: https://soilseries.sc.egov.usda.gov/OSD_Docs/M/MONTAUK.html
- NRCS Official Series Description, Ipswich: https://soilseries.sc.egov.usda.gov/OSD_Docs/I/IPSWICH.html
- NRCS Web Soil Survey rating text for Small Commercial Buildings, as printed in a Brunswick
  County, NC report: https://brunswickcountync.gov/DocumentCenter/View/6120/Soil-Survey-Small-Commercial-Buildings
- NYSDEC, Long Island Water Withdrawals (Long Island Well Permit):
  https://dec.ny.gov/environmental-protection/water/water-quantity/water-withdrawal-permits-reporting/long-island-water-withdrawals
- OSHA 29 CFR 1926 Subpart P, Appendix A (soil types):
  https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartPAppA
- OSHA 29 CFR 1926 Subpart P, Appendix B (sloping):
  https://www.osha.gov/laws-regs/regulations/standardnumber/1926/1926SubpartPAppB
- 44 CFR 60.3, floodplain management criteria, via Cornell LII:
  https://www.law.cornell.edu/cfr/text/44/60.3
- Town of Smithtown, Table R301.2(1) (frost line 36 inches):
  https://www.smithtownny.gov/DocumentCenter/View/5824/2020-Table-R30121-Climatic-and-Geographic-Design-Criteria-rev-Jan2022
- Village of Rye Brook, Table R301.2(1) (frost line 42 inches): https://ryebrook.civicweb.net/document/185032/
- Kulka AI, `docs/precon/canonical-work-items.md` (items 2, 3, 34, 34a), `docs/precon/rom-spec.md`,
  and `lib/rom/jack-criterion.ts` (`rockPossible()`).
