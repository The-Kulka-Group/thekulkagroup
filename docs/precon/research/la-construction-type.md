# Construction type for new multifamily in New York

Researched 2026-09-28 for the Design and Engineering layer. This file answers which IBC
construction type a new Group R-2 building on Long Island, in Rockland or in the Hudson Valley
almost always uses, given the facts the intake already stores, and proposes a rule the app could
use to derive it. Everything here is a proposal for Matt to confirm. Kulka AI states planning
assumptions only. It does not read drawings or perform takeoffs.

Code tables carry the limits. WoodWorks, the National Fire Sprinkler Association and ICC's own
journal explain why podiums exist and how the NFPA 13R rules changed. We found no New York source
that says which type local projects use most often, so the rule's defaults are our reading and
are marked as such.

## Short answer

Outside New York City, a new R-2 building of up to four stories is almost always Type V wood.
Four stories needs Type VA; three or fewer can be VA or VB. Five stories of wood needs Type III
(IIIA or IIIB) and a full NFPA 13 sprinkler system. Anything taller in wood, or wood over a
garage, sits on a Type IA concrete podium under Section 510.2, with up to five stories of Type III
or four of Type V above it. Height is still measured from grade and is capped at 85 feet over
Type IIIA and 70 feet over Type VA. Load-bearing light-gauge steel is noncombustible, so the same
building can be Type IIB or IIA, both capped at five stories. NFPA 13R is allowed only up to four
stories counted from grade plane. Under the 2025 New York State code, in force since December 31,
2025, an R-2 building on 13R also needs its roof under 45 feet above fire truck access, which
makes four stories a borderline case. New York City does not permit Type V for R-2 at all.

## 1. Allowable stories, height and area for R-2

### Limits by type

All values are for Group R-2. "NFPA 13" is the IBC's "S" row (Section 903.3.1.1). "13R" is the
"S13R" row (Section 903.3.1.2). Area is the tabular allowable area per story before any frontage
increase. For a building of two or more stories on NFPA 13 it is the "SM" value; on 13R it equals
the unsprinklered "NS" value, since 13R earns no area increase.

| Type | Stories, NFPA 13 | Height, NFPA 13 | Stories, 13R | Height, 13R | Area per story, NFPA 13 (SM) | Area per story, 13R |
| --- | --- | --- | --- | --- | --- | --- |
| IA | unlimited | unlimited | 4 | 60 ft | unlimited | unlimited |
| IB | 12 | 180 ft | 4 | 60 ft | unlimited | unlimited |
| IIA | 5 | 85 ft | 4 | 60 ft | 72,000 sf | 24,000 sf |
| IIB | 5 | 75 ft | 4 | 60 ft | 48,000 sf | 16,000 sf |
| IIIA | 5 | 85 ft | 4 | 60 ft | 72,000 sf | 24,000 sf |
| IIIB | 5 | 75 ft | 4 | 60 ft | 48,000 sf | 16,000 sf |
| IV-A | 18 | 270 ft | 4 | 60 ft | 184,500 sf | 61,500 sf |
| IV-B | 12 | 180 ft | 4 | 60 ft | 123,000 sf | 41,000 sf |
| IV-C | 8 | 85 ft | 4 | 60 ft | 76,875 sf | 25,625 sf |
| IV-HT | 5 | 85 ft | 4 | 60 ft | 61,500 sf | 20,500 sf |
| VA | 4 | 70 ft | 4 | 60 ft | 36,000 sf | 12,000 sf |
| VB | 3 | 60 ft | 3 | 60 ft | 21,000 sf | 7,000 sf |

Sources: IBC 2021 Table 504.3 (height, R rows), Table 504.4 (stories, R-2 rows) and Table 506.2
(area, R-2 rows), read on the ICC Digital Codes site. We checked the same R-2 rows in the 2025
Building Code of New York State and they match. The 2020 Building Code of New York State carries
the same values for Types I, II, III, IV-HT and V. It has no IV-A, IV-B or IV-C columns, so tall
mass timber exists in New York State only under the 2025 code.

Notes from the same tables:

- Footnote h to all three tables says new Group R occupancies must be sprinklered under Section
  903.2.8. Footnote d says the NS values apply only to existing buildings. A new R-2 building is
  always sprinklered, which backs the intake's "sprinklers assumed yes."
- Building height runs from grade plane to the average height of the highest roof surface (IBC
  2021 Section 202). A basement is a story that is not a story above grade
  plane (Section 202), so a garage fully below grade does not count against Table 504.4.
- Section 510.5 adds one story and 10 feet to Type IIIA R-2 buildings when the first floor over
  the basement is 3-hour rated and the floor is split by 2-hour fire walls into areas of 3,000 sf
  or less. Section 510.6 lets Type IIA R-2 reach nine stories and 100 feet with 50 feet of clear
  space to other buildings and lot lines. Both are rare, and the rule below ignores them.

### How total area is figured

- Each story may not exceed the tabular value plus a frontage increase (IBC 2021 Section 506.2.1,
  Equation 5-1). The NYC version of the same section writes the equation as Aa = At + (NS x If)
  (NYC Building Code 2022, Section 506.2.1, on UpCodes). The frontage increase If runs from 0 to
  0.75 by Table 506.3.3, based on how much of the perimeter faces a street or open space and how
  wide that space is. At least 25 percent of the perimeter must face 20 feet or more of open space
  to earn any increase (Sections 506.3.1 and 506.3.2).
- A building over three stories is capped in total at the per-story figure times Sa, where Sa is
  3, or 4 when the building uses 13R (IBC 2021 Section 506.2.1, Equation 5-2). WoodWorks' design
  example applies the same three-times cap (WoodWorks, Five-Story Wood-Frame Structure over Podium
  Slab, 2017).
- Each part of a building split by fire walls counts as a separate building for area, height and
  type (Section 503.1). Fire walls in R-2 are 3-hour, or 2-hour in Type II or V construction
  (Table 706.4).

Working the table values through (our arithmetic, no frontage increase, then the largest
increase of 0.75 x NS):

| Type | NFPA 13, per story | NFPA 13, per story with max frontage | NFPA 13, total over 3 stories | 13R, per story | 13R, per story with max frontage | 13R, total at 4 stories |
| --- | --- | --- | --- | --- | --- | --- |
| VB | 21,000 | 26,250 | 3 stories max | 7,000 | 12,250 | 3 stories max |
| VA | 36,000 | 45,000 | 108,000 | 12,000 | 21,000 | 48,000 |
| IIIB | 48,000 | 60,000 | 144,000 | 16,000 | 28,000 | 64,000 |
| IIIA | 72,000 | 90,000 | 216,000 | 24,000 | 42,000 | 96,000 |
| IIB | 48,000 | 60,000 | 144,000 | 16,000 | 28,000 | 64,000 |
| IIA | 72,000 | 90,000 | 216,000 | 24,000 | 42,000 | 96,000 |

For buildings of two or three stories on NFPA 13 we read the SM value as the per-story limit,
since Table 506.2 defines SM as NFPA 13 buildings of two or more stories above grade plane. The
2021 wording of Equation 5-1 lists NS, S1, S13R and S13D but not SM. That reading is ours.

The 13R columns show why 13R rarely suits a large building: a four-story Type VA building on 13R
tops out at 12,000 sf per floor before frontage.

### NFPA 13 versus 13R, by code edition

The 13R story count comes from IBC Section 903.3.1.2, not from the tables alone, and it changed
twice across the editions that apply in New York.

| Code | When 13R is allowed in Group R | Podium stories counted from |
| --- | --- | --- |
| Building Code of New York State 2020 (IBC 2018 base) | Up to four stories, in buildings not over 60 feet above grade plane | The podium's horizontal assembly |
| IBC 2021 | Four stories or fewer above grade plane; highest floor 30 feet or less above the lowest fire department vehicle access; lowest floor 30 feet or less below it | Grade plane |
| Building Code of New York State 2025 (IBC 2024 base) | Four stories or fewer above grade plane; for R-2, roof assembly less than 45 feet above the lowest fire department vehicle access, measured to the eave of the highest pitched roof, the roof-to-wall line, or the top of the highest parapet, whichever is greatest; lowest floor 30 feet or less below access | Grade plane |

Sources: BCNYS 2020 Section 903.3.1.2; IBC 2021 Section 903.3.1.2; BCNYS 2025 Section 903.3.1.2,
all on ICC Digital Codes.

- **Which edition applies.** New York voted on July 25, 2025 to adopt the 2024 I-Codes with
  amendments, effective December 31, 2025 (ICC news release). The Department of State's notice
  says a project could follow either the 2025 or the 2020 Uniform Code until that date (NYS DOS,
  Notice of Adoption). A ROM built today should assume the 2025
  code. Past Kulka jobs permitted before 2026 may carry 13R over a podium, which the 2025 code no
  longer allows. That matters when those jobs are used as benchmarks.
- **Why it changed.** ICC's Building Safety Journal says the old podium wording let 13R reach
  buildings that looked like five or six stories, and that the change answered concern about
  unsprinklered attics sitting too high for fire department access. The 30-foot figure was
  picked to match the standpipe trigger (ICC Building Safety Journal, September 3, 2021).
- **What 13R leaves out.** 13R lets small bathrooms, small closets and combustible concealed
  spaces go without heads (NFSA, November 17, 2020). NFSA also reports an NMHC member estimate
  that NFPA 13 costs $1 to $2 more per square foot than 13R, before markup or a fire pump.
  That is a national trade-group figure from 2020, not a Kulka number.
- **No trade-ups with 13R.** A 13R building uses the S13R rows, so it gets no extra story, height
  or area for being sprinklered (Tables 504.3, 504.4 and 506.2; NFSA 2020).
- **The podium itself** must carry NFPA 13 throughout (Section 510.2, item 6).
- **Standpipes.** Class III standpipes are required where four or more stories are above or below
  grade plane, or the highest floor is more than 30 feet above fire department access. Class I is
  allowed in a building sprinklered to NFPA 13 or 13R (IBC 2021 Section 905.3.1).
- **Balconies.** A 13R building of Type V must sprinkler exterior balconies and decks that have a
  roof or deck above (IBC 2021 Section 903.3.1.2.1). `canonical-work-items.md` item 27 already
  notes the matching NFPA 13 rule for Type V balconies.

## 2. When a podium is used

### The code path

Section 510.2 lets a building be treated as two separate buildings, one above the other, when it
comes to area limits, fire wall continuity, story limits and construction type, when all of these
hold (IBC 2021 Section 510.2; the BCNYS 2020
and 2025 text is the same in substance):

1. A horizontal assembly of at least 3-hour fire-resistance rating separates them.
2. The building below, including that assembly, is Type IA.
3. Shaft, stair, ramp and escalator enclosures through the assembly are at least 2-hour.
4. The building above holds Group A (each under 300 occupants), B, M, R or S occupancies.
5. The building below is sprinklered to NFPA 13 and may hold any occupancy but Group H.
6. The total height in feet, measured from grade plane, stays within Table 504.3 for whichever
   building has the smaller allowable height.

The 2021 and 2025 text also lets interior exit stairs inside the Type IA podium be combustible
when the building above is Type III, IV or V and the stair is enclosed in 3-hour construction.

Section 510.4 is a second path for parking only. Where a one-story Type I garage (or open Type IV)
with a grade entrance sits under Group R, stories for the upper building's type are counted from
the floor above the garage. The floor between must meet the garage's type rating and the Section
508.4 separation (IBC 2021 Section 510.4). Height in feet still counts from grade.

### Why projects use one

- WoodWorks says the approach adds stories and density on small urban lots, and names common
  layouts of four to five residential stories over
  parking, retail or commercial space (WoodWorks, Code Path and Requirements for Mid-Rise Podium
  Projects). WoodWorks also states the upper-building limits: Type III can hold five stories of
  wood framing and Type V four.
- NFSA names three to five residential stories over parking, retail, commercial or office space
  as a common layout (NFSA 2020).
- WoodWorks' worked example is five stories of Type IIIA R-2 over a one-story Type IA podium, 62
  feet total, on NFPA 13. It notes that 13R would have capped the building at four stories and 60
  feet (WoodWorks design example, 2017, written to the 2012 IBC).
- Retail at grade does not by itself force a podium. The code allows R-2 over Group M in one
  building of Type V or III with a 1-hour separation when sprinklered (IBC 2021 Table 508.4). R-2
  over parking (S-2) is also a 1-hour separation when sprinklered (same table, footnote c).

### Common patterns

Stories and height caps are from Tables 504.3 and 504.4. The sample heights are our arithmetic
using the floor-to-floor figures Matt set on LA-784 (framed story 10'-0", podium story 12'-0",
retail story 15'-0"; `docs/precon/criteria/la-784-elevator-type.md`, Decision 4).

| Pattern | Upper type | Upper story cap | Total height cap from grade | Sample height | Sprinkler under BCNYS 2025 |
| --- | --- | --- | --- | --- | --- |
| 3 over 1 | VA | 4 | 70 ft | 12 + 30 = 42 ft | 13R only if the roof clears 45 ft; else NFPA 13 |
| 4 over 1 | VA | 4 | 70 ft | 12 + 40 = 52 ft | NFPA 13 (five stories from grade) |
| 5 over 1 | IIIA, or IIIB under 75 ft | 5 | 85 ft (75 ft) | 12 + 50 = 62 ft | NFPA 13 |
| 4 over 2 | VA | 4 | 70 ft | 24 + 40 = 64 ft | NFPA 13 |
| 5 over 2 | IIIA | 5 | 85 ft | 24 + 50 = 74 ft | NFPA 13 |
| 5 over 3 | IIIA | 5 | 85 ft | 36 + 50 = 86 ft | Over the cap at these floor heights |

### Mapping to the intake's facts (our reading)

- **Parking "structured."** A garage level inside the building footprint, so a concrete podium, or
  a Type I garage under Section 510.4. Either way the budget carries a concrete deck over the
  garage. `canonical-work-items.md` item 2 already says structured or underground parking implies
  a podium and no slab-on-grade. "Structured" could also mean a detached parking deck, which the
  intake cannot tell apart.
- **Parking "underground."** A concrete garage below grade with a deck over it. It adds no story
  above grade, so the wood type above is set by the framed stories alone.
- **Retail storefronts "yes."** Code does not require a podium. We assume a concrete retail story
  when the building has four or more stories, because a 15-foot storefront level under wood
  bearing walls is uncommon. That assumption is ours and needs Matt's view.
- **Six or seven stories of wood.** Past the five-story cap for any light wood type, so a podium
  of one or two levels is needed.
- **Eight or more stories.** No light-frame wood path fits at these floor heights. The building is
  concrete or steel (Type I), or mass timber (Type IV), which the intake cannot express.

## 3. Framing system and type

- **Types I and II** require the building elements in Table 601 to be noncombustible, with the
  exceptions in Section 603 (IBC 2021 Section 602.2). Section 603.1 still allows fire-retardant-
  treated wood in roof framing and in nonbearing partitions of 2 hours or less.
- **Type III** requires noncombustible exterior walls; the interior may be any permitted material.
  Fire-retardant-treated wood framing and sheathing is allowed inside exterior wall assemblies
  rated 2 hours or less (IBC 2021 Section 602.3; same text in BCNYS 2025). WoodWorks' design
  example makes the same point: five stories of light wood framing forces Type III (WoodWorks
  design example, 2017).
- **Type IV** is mass timber or noncombustible material, with minimum sizes and protection
  (Section 602.4). It is not light framing.
- **Type V** may use any material the code permits (Section 602.5).
- **Load-bearing cold-formed steel** is noncombustible. STRUCTURE magazine says mid-rise
  noncombustible framing most often runs five to twelve stories and 85 to 180 feet, mostly as
  Type IIA and IB, and walks through light-gauge steel over a podium under Section 510.2
  (Robert Warr, P.E., "Reaching Higher with Cold-Formed Steel Framing for Podium Structures,"
  written to the 2015 IBC).

| Intake framing | Types it can be | Likely type (our reading) |
| --- | --- | --- |
| Wood | VB, VA, IIIB, IIIA; IV only with mass timber | V up to four framed stories; III at five |
| Metal (load-bearing light-gauge) | IIB, IIA, IB when every element is noncombustible; IIIB or IIIA when the exterior walls are steel and floors are wood; V always allowed | IIB up to five framed stories; IIA when height or area passes IIB |
| Not set | Any of the above | Unknown |

Kulka's own jobs fit this, as far as the files go. Jefferson's Ferry (C00456, metal) carries
cold-formed panels and "Comslab" joists and decking (item 17), concrete on deck (item 3) and wood
trusses (item 8). That is a noncombustible floor system with a wood roof, which Section 603.1
allows in Type II if the trusses are fire-retardant-treated. VR, a podium job, prices LP Flame
Block sheathing, a fire-rated sheathing of the kind used in rated exterior walls (item 8). None
of the files states a construction type, so we treat these only as clues.

## 4. What changes in the budget

### Ratings by type

Hours of fire resistance by building element (IBC 2021 Table 601; same in BCNYS 2025).

| Type | Primary frame | Exterior bearing walls | Interior bearing walls | Floors | Roof |
| --- | --- | --- | --- | --- | --- |
| IA | 3 | 3 | 3 | 2 | 1½ |
| IB | 2 | 2 | 2 | 2 | 1 |
| IIA | 1 | 1 | 1 | 1 | 1 |
| IIB | 0 | 0 | 0 | 0 | 0 |
| IIIA | 1 | 2 | 1 | 1 | 1 |
| IIIB | 0 | 2 | 0 | 0 | 0 |
| IV-HT | heavy timber | 2 | 1 or heavy timber | heavy timber | heavy timber |
| VA | 1 | 1 | 1 | 1 | 1 |
| VB | 0 | 0 | 0 | 0 | 0 |

Footnote a lets the frame and bearing walls drop 1 hour where they carry only a roof. Footnote b
drops roof protection where the roof sits 20 feet or more above the floor below, in most
occupancies including R.

### Ratings that apply whatever the type

- **Unit separations.** Walls between dwelling units are 1-hour fire partitions, or ½-hour in
  Types IIB, IIIB and VB with NFPA 13 (IBC 2021 Section 708.3). Floors between units are 1-hour,
  with the same ½-hour exception (Section 711.2.4.3). So a Type VB or IIIB building still has
  rated floors between units; it only drops the rating on the structure itself.
- **Shafts.** Stair and elevator shafts are 2-hour where they connect four or more stories,
  counting basements, and 1-hour below that (Section 713.4).
- **Exterior walls by distance to the lot line.** For Group R: 1-hour under 10 feet; 1-hour from
  10 to under 30 feet, except 0 in Types IIB and VB; 0 at 30 feet or more (Table 705.5). Bearing
  walls must also meet Table 601.
- **Foam plastic in exterior walls.** In Types I, II, III and IV, walls with foam insulation must
  pass NFPA 285 (IBC 2021 Sections 2603.5 and 2603.5.5). Type V walls are exempt from that test.

### Cost items each answer touches

Item numbers and names are from `canonical-work-items.md`. This design sets no rates.

- **Podium (Type IA base).** Item 3, Elevated Slabs and Podium Deck, carries the 3-hour transfer
  slab, and its Podium Waterproofing Membrane container applies. Item 2's Slab-on-Grade container
  drops under the podium footprint. Item 5, CMU and Concrete Block Walls, or a gypsum shaft wall,
  carries 3-hour stair and elevator enclosures below the podium. Item 27 carries NFPA 13 in the
  garage at Ordinary Hazard. Any structural steel in the podium needs 3-hour protection for
  columns (item 7a, Fireproofing container).
- **Type III above.** Item 8, Wood Framing, carries fire-retardant-treated studs and sheathing in
  every exterior wall. Item 17, Metal Framing and Drywall, carries the extra gypsum layers for
  2-hour exterior bearing walls and, in IIIA, 1-hour floors and interior bearing walls. Items 12,
  Building Insulation, and 14, Siding and Exterior Wall Cladding, need an NFPA 285-tested wall if
  the wall uses foam insulation.
- **Type VA.** Item 17 carries 1-hour gypsum on floors, bearing walls and roof. No treated wood is
  required by type.
- **Type VB.** Item 17 drops the structural rating. Unit separations stay rated.
- **Type IIB or IIA (metal).** Item 17 carries load-bearing studs and joists. Item 3 carries
  concrete on deck. Item 8 carries fire-retardant-treated roof trusses if the roof is wood. Item
  7a's Fireproofing container applies to any structural steel in IIA, rated 1 hour.
- **Sprinkler type, NFPA 13 or 13R.** Item 27 carries the system. NFPA 13 adds heads in closets, small baths and
  concealed spaces that 13R skips. Type V adds sidewall heads under balconies (items 11 and 27).
  Item 27's Standpipe container applies at four or more stories. Item 16a, Residential Windows,
  loses opening area near lot lines on 13R, per item 27's own note.
- **Shaft rating.** Item 5 or a gypsum shaft wall system carries the shaft. Item 26a, Elevator
  Bulkhead, takes the same rating as the shaft (LA-784 Decision 5).
- **Any rated assembly.** Item 14a, Firestopping, grows with the number of rated walls and floors
  that pipes and ducts cross.
- **Fire walls.** When area runs past the limits, a fire wall would fall under item 5 or item 17.
  The rule only flags it, since no fire wall item exists today.
- **Elevator travel.** A podium level is 12'-0" against 10'-0" for a framed story (LA-784
  Decision 4), so the podium answer feeds V-1 and V-2 travel.

### Relative cost by type

ICC publishes average square-foot costs by occupancy and type for permit fees. For R-2 in August
2026: IA $241.56, IB $231.31, IIA $221.47, IIB $211.41, IIIA $190.52, IIIB $184.22, IV $210.88,
VA $167.24, VB $159.71 (ICC Building Valuation Data, August 2026). By our arithmetic, IIIA runs
about 14 percent over VA, VB about 5 percent under VA, and IIIB about 3 percent under IIIA. ICC
says the table is not an estimating guide, because it reflects only average costs. It is a
national average with no regional adjustment. It shows direction only and
should not become a Kulka rate.

## 5. Where New York City differs

The NYC Building Code 2022 has its own tables. For R-2 (NYC Building Code 2022, Tables 504.3,
504.4 and 506.2, on UpCodes):

| Type | Stories, NFPA 13 | Height, NFPA 13 | Stories, 13R | Height, 13R | Area per story, NFPA 13 (SM) |
| --- | --- | --- | --- | --- | --- |
| IA | unlimited | unlimited | 6 | 60 ft | unlimited |
| IB | unlimited | 420 ft | 6 | 60 ft | unlimited |
| IIA | 7 | 85 ft | 6 | 60 ft | unlimited |
| IIB | not permitted | not permitted | not permitted | not permitted | not permitted |
| IIIA | 7 | 85 ft | 6 | 60 ft | 48,000 sf |
| IIIB | 4 | 75 ft | 4 | 60 ft | 11,200 sf |
| IV-HT | 7 | 85 ft | 6 | 60 ft | 41,000 sf |
| VA | not permitted | not permitted | not permitted | not permitted | not permitted |
| VB | not permitted | not permitted | not permitted | not permitted | not permitted |

So a wood multifamily building in NYC is Type III, never Type V. NYC also shows 13R up to six
stories and 60 feet for several types, which differs from the State code. NYC's Section 510.2 has
the same six conditions as the IBC. We did not check how NYC treats treated-wood exterior walls
in Type III or read its Section 903.3.1.2. Kulka's work sits outside the city, so the rule below
only flags NYC.

## 6. Proposed decision rule

### Inputs

| Input | Where it comes from | Used for |
| --- | --- | --- |
| Project type | `project_type` | Rule runs only for multifamily |
| Construction kind | `construction_kind` | Rule runs only for new construction |
| Stories above grade (S) | `stories_above_grade`, required for multifamily | Stories from grade plane, height |
| Framing system | Project field `framingSystem`: wood, metal or not set | Type family |
| Parking type | `parking_type`: none, surface, structured, underground, dont_know | Podium, podium stories |
| Retail storefronts | `retail_storefronts` gate: yes, no, dont_know | Podium at four or more stories; 15-foot retail story |
| Levels below grade | `levels_below_grade` gate: yes, no, dont_know | Shaft rating, standpipe, podium below grade |
| Gross square feet | `gross_square_feet` | Area check |
| Building count | `building_count`, default 1 | Area per building |
| ZIP | `zip` | New York City check |
| Sprinklers | Assumed yes for new multifamily | Always sprinklered; the rule picks 13 or 13R |
| Floor-to-floor figures | LA-784 Decision 4 | Height check |
| Roof type, if stated | Planned gate in `rom-spec.md` (flat, pitched, don't know) | The 45-foot 13R roof test |
| New, optional: "Construction Type" override | Estimator correction on the card | Replaces the rule's output |

### Assumptions the rule makes (ours, not sourced)

- Stories Above Grade counts every story above grade, including a garage or retail level. A
  five-over-one is entered as 6.
- "Structured" parking means one garage level at grade inside the building. It could be two
  levels, or a separate parking deck.
- Ground-floor retail in a building of four or more stories sits on a concrete podium.
- When framing is not set, wood is the more likely frame for three- to five-story R-2 in Kulka's
  area. We found no source for that.
- Average story area is gross square feet divided by building count and stories. Gross square
  feet may include a garage level, which the podium's unlimited area would absorb.
- New York City ZIPs start 100, 101, 102, 103, 104, 112, 113, 114 and 116. The 110 prefix mixes
  Queens and Nassau, so the check needs a ZIP list, not a prefix test.
- The 2025 Building Code of New York State governs any new ROM.

### Rule

Terms: S is stories above grade. P is podium stories above grade. F is framed stories, S minus P.
H is estimated height.

1. **Gates.** If the project is not multifamily, or is a renovation, output "not applicable." A
   renovation keeps its existing type. If the ZIP is in New York City, go to step 9.
2. **Podium stories.** P = 1 if parking is structured. P = 1 if retail storefronts is yes and S is
   4 or more. Otherwise P = 0. Underground parking sets "podium below grade: yes" and adds nothing
   to P. Parking "don't know" leaves P = 0 and sets confidence low. Retail "don't know" counts as
   no and caps confidence at medium.
3. **Framed stories.** F = S minus P.
4. **Wood.**
   - F of 4 or less: **Type V**, default VA. VB is also allowed when F is 3 or less and the area
     fits VB.
   - F = 5: **Type III**, default IIIA. IIIB is also allowed when H is 75 feet or less and the area
     fits IIIB.
   - F of 6 or 7: past every light wood limit. Raise P to S minus 5 so F = 5. Output **Type IIIA
     over Type IA Podium**.
   - S of 8 or more: output **Type IA or IB**, with the flag "wood framing does not fit this
     height."
5. **Metal.**
   - F of 5 or less: **Type II**, default IIB. Move to IIA when H passes 75 feet or the area passes
     IIB.
   - F of 6 or more: add podium stories as in step 4, up to two. Past that, output **Type IB**.
   - Confidence is never above medium, because a metal-bearing-wall building with wood floors or
     a wood roof can be Type III or V.
6. **Framing not set.** Run the wood path and set confidence low, with the flag "Framing System
   not set."
7. **Height check.** H = 12 ft for each podium story (15 ft for a retail story) plus 10 ft for each
   framed story. Compare H with the upper type's NFPA 13 limit: VA 70, IIIB 75, IIIA 85, IIB 75,
   IIA 85. If H passes the default subtype's limit, step up (IIIB to IIIA, IIB to IIA). If H sits
   within 5 feet of the final limit, confidence is low.
8. **Area check, per building.** Average story area A = gross square feet ÷ building count ÷ S.
   Compare A with the per-story limit for the output type and sprinkler type (Section 1 table).
   When S is over 3, also compare A x F with the total limit.
   - Both under 90 percent of the no-frontage limit: pass.
   - Over the no-frontage limit but within the largest frontage increase: confidence low, note
     "needs frontage increase."
   - Over even that: confidence low, flag "fire walls likely." Fire walls are 2-hour in Types V
     and II and 3-hour in Type III (Table 706.4). The type does not change.
9. **New York City.** Wood gives **Type IIIA**; metal gives **Type IIA**; podium logic as above.
   Confidence is always low, with the flag "NYC Building Code: Type V and IIB not permitted for
   R-2."
10. **Sprinkler type.** Podium stories are always NFPA 13. The residential floors can use 13R only
    when S is 4 or less counting any podium story above grade, the area check passes against the
    13R limits, and the roof sits under 45 feet above fire truck access. The intake does not know
    parapet height or where the fire lane sits.
    - S of 3 or less and area passes: **NFPA 13R**, high.
    - S = 4 and area passes: 13R is possible, low. Carry **NFPA 13** as the priced default. A
      stated pitched roof makes 13R more likely, since the test measures to the eave.
    - Otherwise **NFPA 13**, high.
11. **Override.** An estimator's "Construction Type" answer replaces the output, and confidence
    becomes high.

### Output

- Construction type, as a spec string, for example "Type VA" or "Type IIIA over Type IA Podium."
  The card names the other subtype the code allows, if any.
- Podium: yes or no, with levels above grade and whether it sits below grade.
- Sprinkler type: NFPA 13 or NFPA 13R.
- Flags: framing not set, frontage or fire walls, NYC, wood does not fit.

Confidence covers the type family (V, III, II or I) and the podium answer. The A or B letter is a
stated default the estimator can change.

### Worked examples

These are sample projects, not Kulka jobs.

- **Three-story garden building.** Wood, surface parking, no retail, 30,000 gsf, one building.
  P = 0, F = 3: Type V, default VA. H = 30 ft against 70. A = 10,000 sf against VA's 13R limit of
  12,000: passes. S = 3: NFPA 13R. Output Type VA, no podium, 13R, high. The card notes VB is
  allowed: 10,000 sf passes VB's NFPA 13 limit of 21,000 but not its 13R limit of 7,000.
- **Five over one.** Wood, structured parking, 150,000 gsf, six stories, one building. P = 1,
  F = 5: Type IIIA over IA. H = 12 + 50 = 62 ft against 85 (IIIB's 75 also fits). A = 25,000 sf
  against 72,000; A x F = 125,000 against 216,000: passes. S = 6: NFPA 13. Output Type IIIA over
  Type IA Podium, NFPA 13, medium, because the podium level is assumed from "structured."
- **Four-story metal building.** Metal, no parking, 80,000 gsf, one building. P = 0, F = 4: Type
  IIB. H = 40 ft against 75. A = 20,000 sf against IIB's NFPA 13 limit of 48,000: passes. Against
  IIB's 13R limit of 16,000 it fails, so NFPA 13. Output Type IIB, no podium, NFPA 13, medium.
- **Retail with four floors above.** Wood, retail yes, surface parking, 100,000 gsf, five stories.
  P = 1, F = 4: Type VA over IA. H = 15 + 40 = 55 ft against 70. A = 20,000 sf against 36,000:
  passes. S = 5: NFPA 13. Output Type VA over Type IA Podium, medium, because five stories of
  Type IIIA with retail on the ground floor is also legal.

### When confidence should be high, medium or low

- **High:** framing is wood; parking is none or surface; retail is no, or S is 3 or less; not in
  NYC; H is more than 5 feet under its limit; area is under 90 percent of the no-frontage limit.
- **Medium:** the podium level is assumed from structured parking or retail; framing is metal;
  retail is yes and S is 4 or 5, where a podium and a plain wood building are both legal.
- **Low:** framing not set; parking "don't know"; two or more podium levels; area past the
  no-frontage limit; H within 5 feet of its limit; wood at eight stories or more; any NYC ZIP.

### What the output drives

Section 4 lists the items. In short, podium yes turns on item 3 and its waterproofing and turns
off slab-on-grade under the footprint. Type III turns on treated-wood exterior walls in item 8.
The type sets how many rated gypsum layers item 17 carries. The sprinkler answer sets item 27's
system type and standpipe container. Stories plus levels below grade set the shaft rating
(2-hour at four or more connected stories). The podium answer feeds V-1 and V-2 travel. None of
these outputs sets a rate. Each rate still needs a stated figure from Matt.

## What we could not find

- Which type Long Island, Rockland and Hudson Valley multifamily projects use most often. No
  state, county or trade source publishes it. The defaults for VA over VB and IIIA over IIIB are
  our reading.
- The construction type of any Kulka job. Jefferson's Ferry, Fieldstone, VR and the others do not
  state one in the files we read.
- The text of NFPA 13R and NFPA 13. NFPA sells them. The 13R scope above comes from IBC Section
  903.3.1.2 and NFSA's summary.
- ICC's commentary on whether SM or S1 is the per-story value for a two- or three-story building
  on NFPA 13 under the 2021 wording of Equation 5-1.
- A list of local laws on Long Island, in Rockland or in the Hudson Valley that set stricter
  construction or sprinkler rules under Executive Law §379. Towns, villages and Nassau County may
  adopt them with Code Council approval (NYS DOS, Code Outreach Program 2021-2018-3). We did not
  search each municipality.
- Whether the 2025 Building Code of New York State amends Chapter 5, 6 or 9 beyond the R-2 table
  rows and the sections we read (Tables 504.3, 504.4, 506.2 and 601; Sections 510.2, 602.3 and
  903.3.1.2).
- How NYC treats treated-wood exterior walls in Type III, and NYC's own Section 903.3.1.2.
- A regional or Kulka-specific cost difference between types. The only published figures are
  ICC's national permit-fee averages.
- The American Wood Council's 2021 Code Conforming Wood Design guide. Its web page did not give us
  a readable file.
- A source for typical parapet heights, which decide the 45-foot 13R test at four stories.

## Sources

- IBC 2021, Chapter 5, Tables 504.3, 504.4, 506.2, 506.3.3 and 508.4; Sections 503.1, 506.2,
  506.3, 510.2, 510.4, 510.5 and 510.6 (ICC Digital Codes):
  https://codes.iccsafe.org/content/IBC2021P2/chapter-5-general-building-heights-and-areas
- IBC 2021, Chapter 6, Table 601; Sections 602.2 to 602.5 and 603.1:
  https://codes.iccsafe.org/content/IBC2021P2/chapter-6-types-of-construction
- IBC 2021, Chapter 7, Sections 708.3, 711.2.4.3, 713.4; Tables 705.5 and 706.4:
  https://codes.iccsafe.org/content/IBC2021P2/chapter-7-fire-and-smoke-protection-features
- IBC 2021, Chapter 9, Sections 903.2.8, 903.3.1.2, 903.3.1.2.1 and 905.3.1:
  https://codes.iccsafe.org/content/IBC2021P2/chapter-9-fire-protection-and-life-safety-systems
- IBC 2021, Chapter 2, definitions of building height, story above grade plane, grade plane and
  basement: https://codes.iccsafe.org/content/IBC2021P2/chapter-2-definitions
- IBC 2021, Chapter 26, Sections 2603.5 and 2603.5.5:
  https://codes.iccsafe.org/content/IBC2021P2/chapter-26-plastic
- Building Code of New York State 2020, Chapter 5 (R-2 table rows, Sections 506.2.3, 510.2 and
  510.4): https://codes.iccsafe.org/content/NYSBC2020P1/chapter-5-general-building-heights-and-areas
- Building Code of New York State 2020, Chapter 9, Section 903.3.1.2:
  https://codes.iccsafe.org/content/NYSBC2020P1/chapter-9-fire-protection-and-life-safety-systems
- Building Code of New York State 2025, Chapter 5 (R-2 table rows, Sections 506.2 and 510.2):
  https://codes.iccsafe.org/content/NYSBC2025P1/chapter-5-general-building-heights-and-areas
- Building Code of New York State 2025, Chapter 6, Table 601 and Section 602.3:
  https://codes.iccsafe.org/content/NYSBC2025P1/chapter-6-types-of-construction
- Building Code of New York State 2025, Chapter 9, Section 903.3.1.2:
  https://codes.iccsafe.org/content/NYSBC2025P1/chapter-9-fire-protection-and-life-safety-systems
- NYS Department of State, Amended Notice of Adoption, 2025 Uniform Code (effective date and
  transition): https://dos.ny.gov/notice-adoption
- ICC news release, New York adopts the 2024 International Codes (vote July 25, 2025):
  https://www.iccsafe.org/about/periodicals-and-newsroom/the-state-of-new-york-strengthens-building-safety-and-resilience-by-adopting-the-2024-international-codes/
- NYS Department of State, Code Outreach Program 2021-2018-3, More Restrictive Construction
  Standards (February 11, 2021):
  https://dos.ny.gov/system/files/documents/2021/05/2021-2018-03-more-restrictive-construction-standards_2020-update.pdf
- NYC Building Code 2022, Chapter 5, Tables 504.3, 504.4 and 506.2, Section 510.2 (on UpCodes):
  https://up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/5/general-building-heights-and-areas-separation-of-occupancies
- ICC Building Safety Journal, "Significant changes to NFPA 13R sprinkler protection in the 2021
  International Building Code" (September 3, 2021):
  https://www.iccsafe.org/building-safety-journal/bsj-technical/significant-changes-to-nfpa-13r-sprinkler-protection-in-the-2021-international-building-code/
- National Fire Sprinkler Association, "NFPA 13 vs. NFPA 13R in Podium and Mixed-Use Construction"
  (November 17, 2020):
  https://nfsa.org/2020/11/17/nfpa-13-vs-nfpa-13r-in-podium-and-mixed-use-construction/
- WoodWorks, Code Path and Requirements for Mid-Rise Podium Projects (read 2026):
  https://www.woodworks.org/resources/code-path-and-requirements-for-podium-projects/
- WoodWorks, Design Example: Five-Story Wood-Frame Structure over Podium Slab (December 2017):
  https://www.woodworks.org/wp-content/uploads/Five-Story-Wood-Frame-Structure-over-Podium-Slab-WoodWorks-Dec-2017.pdf
- Robert Warr, P.E., "Reaching Higher with Cold-Formed Steel Framing for Podium Structures,"
  STRUCTURE magazine (written to the 2015 IBC):
  https://www.structuremag.org/article/reaching-higher-with-cold-formed-steel-framing-for-podium-structures/
- ICC, Building Valuation Data, August 2026:
  https://www.iccsafe.org/wp-content/uploads/BVD-BSJ-AUG2026.pdf
- Kulka AI, `config/rom/tier1-flow.json` (parking values, gates), `docs/precon/canonical-work-items.md`
  (items 2, 3, 5, 7a, 8, 11, 14a, 16a, 17, 26a, 27; Jefferson's Ferry and VR lines),
  `docs/precon/criteria/la-784-elevator-type.md` (Decisions 4 and 5), `docs/precon/rom-spec.md`
  (roof type gate).
