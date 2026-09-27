# LA-784 follow-ups: type band, rates, bulkhead, floor-to-floor

Researched 2026-09-27 for Matt's answers on LA-784 (comment of 2026-09-27). This file feeds
item 26 (Elevators), the new elevator bulkhead item, and the V-1 card in
`docs/precon/criteria/la-784-elevator-type.md`. Everything here is a proposal for Matt to
confirm. Kulka AI states planning assumptions only. It does not read drawings or perform
takeoffs.

Manufacturer guides and code text carry the travel, speed and clearance figures. Published
cost data is thin, so Kulka's own jobs and a few real 2021 to 2023 Northeast quotes carry cost.

## 1. Where hydraulic gives way to traction

### Product limits

| System | Max travel | Max stops | Speed | Source |
| --- | --- | --- | --- | --- |
| In-ground (holed) hydraulic | 60 ft | 7 | 100 to 150 fpm | Otis planning guide, 2010 |
| In-ground hydraulic | 60 ft | not stated | 80 to 200 fpm | TK Elevator endura page, 2026 |
| Telescopic holeless hydraulic | 44 ft 1 in | 5 | 100 to 125 fpm | Otis, 2010 |
| Telescopic holeless hydraulic | about 50 ft | not stated | not stated | Archtoolbox, 2021 |
| Single-stage holeless hydraulic | 20 ft | 3 | 100 to 125 fpm | Otis, 2010 |
| Roped holeless hydraulic | about 60 ft; 70 ft | not stated | up to 150 or 200 fpm | Archtoolbox, 2021; Schumacher Elevator |
| Hydraulic MRL (in hoistway) | 33.5 ft | not stated | 80 to 150 fpm | TK Elevator endura MRL page, 2026 |
| MRL traction, KONE MonoSpace 300 DX | 48 ft | 4 | 150 fpm | KONE Architectural Planning Guide, 2025/2026 |
| MRL traction, Otis Gen3 Core | 59 ft | 8 | 150 to 200 fpm | Otis Gen3 page, 2026 |
| MRL traction, Schindler 3300 | 98 ft 5 in | 12 | 100 or 150 fpm | Schindler 3300 page, 2026 |
| MRL traction, KONE MonoSpace 500 DX | 150 ft | 15 | 150, 200, 350 fpm | KONE, 2025/2026 |

Hydraulic stops at about 60 feet of travel in every source, and holeless versions stop at 44
to 50 feet (telescopic) or 20 feet (single-stage). MRL traction starts at two stops, aimed at
the same low-rise buildings. Below the 60-foot ceiling the choice is cost and preference, not
physics.

### Current practice

Sources disagree in the middle. CED Elevator (undated) puts hydraulic at two to four stops
and MRL at five or more. Kaiser Elevator (2025) caps hydraulic at five to six stories, TK
Elevator (2021) at five, and Archtoolbox (2021) at eight. The Center for Building in North
America (CBNA, 2024) finds MRL traction most common at four to six stops, with hydraulic
keeping share in North America because it is slightly cheaper to install.

### In stories

Travel equals stories minus one, times floor-to-floor, plus any extra ground-floor height.
Section 4 gives the table. At a 10'-6" typical floor, six stories give 52.5 feet of travel and
seven give 63 feet. With a 15-foot retail ground floor, six stories give 57 feet, which sits
right at the ceiling. Telescopic holeless hydraulic, at 44 feet, runs out at five stories.

**Proposed band:**

- Four stories or fewer: hydraulic, high confidence. Travel stays near 30 to 36 feet, inside
  every hydraulic type, including holeless.
- Five and six stories: either type, low confidence. Hydraulic still fits, but at six stories
  only in-ground or roped hydraulic reach, and a tall ground floor pushes travel to the limit.
- Seven stories or more: traction, high confidence. Travel passes 60 feet at any
  floor-to-floor in Section 4.

The band should run on travel when a stop below grade or a tall ground floor is known, since
a garage or cellar stop adds travel without adding a story above grade.

### Reconciling Kulka's jobs

JF, V64 and West Shore all sit in the "either" zone at six stops. These things can push a
six-stop building to traction:

1. **A speed spec.** 250 fpm is past every hydraulic product listed above (top speed 150 to
   200 fpm). If the owner or architect sets 200 fpm or more, the job is traction.
2. **Travel near 60 feet.** A tall ground floor, a garage level, or a stop below grade can push
   a six-stop run past what hydraulic reaches.
3. **Ground conditions.** In-ground hydraulic needs a drilled well hole for the cylinder (Otis,
   2010). High groundwater or contaminated soil makes that harder, and holeless hydraulic
   cannot reach six stops. Long Island's drinking water comes from a sole-source aquifer
   (USGS), which some owners and engineers weigh against burying an oil cylinder. We found no
   Long Island rule that bans in-ground cylinders.
4. **Standby power.** Where a required accessible floor sits four or more stories above the
   level of exit discharge, IBC 1009.2.1 requires an elevator as an accessible means of egress,
   and IBC 1009.4 requires standby power for it. That captures most five and six story
   buildings. Hydraulic pumps draw larger motors with a big starting surge, which grows the
   generator (M&T Ruhl; Bomberger elevator guideline).
5. **Floor area.** Hydraulic needs a machine room at the bottom landing, about 5'-9" x 7'-4"
   for one car and 11'-6" x 8'-6" for two (Otis, 2010). MRL frees that room.
6. **Owner preference** for ride quality, energy use, or a no-oil building.

West Shore's file does not say which applied.

## 2. Cost, hydraulic versus traction

### Kulka's own figures, per stop at 6 stops

| Job | Type | Per elevator | Per stop |
| --- | --- | --- | --- |
| JF, V64 | Hydraulic, 100 fpm, 3,000 lb | $190,000 | $31,667 |
| VA | Code 14.02000 (hydraulic code), per stop | $198,000 equivalent | $33,000 |
| West Shore | Traction, 250 fpm, 3,000 lb | $271,858.84 | $45,310 |
| Current item 26 | Blended | $246,000 at 6 stops | $41,000 |

West Shore sits 43% above JF and V64. Put the other way, hydraulic runs about 30% below
traction on Kulka's own jobs. The estimate dates are not all known: V64's file name carries
6-4-23, and the others do not show a date. Escalation between the jobs could explain part of
the gap.

### Published figures

- **Center for Building in North America, 2024.** Real quotes, parts and installation, not
  hoistway construction: New York City 2023, KONE MonoSpace 300 DX MRL, 150 fpm, 2,500 lb,
  four stops, $157,856 (about $39,500 per stop). A second quote for the same four-story
  Brooklyn building gave $158,000 for 2,500 lb and $168,000 for 3,500 lb. Pennsylvania 2021,
  Schindler 3300 MRL, six stops, $160,000 (about $26,700 per stop). New Jersey 2022, Schindler
  3300 MRL, 3,500 lb, $172,200 (stop count not stated in the text we could read).
- **Elevator World, "New Life for Hydraulic Elevators" (date not found).** As quoted in search
  results: hydraulic costs about 35% less to install than MRL traction, and MRL costs at least
  25 to 30% more for the same job. The article blocked direct reading, so we could not check the
  wording or date.
- **BASE4, 2018.** MRL costs about 20% more than hydraulic upfront (hotels).
- **Kaiser Elevator, 2025.** Hydraulic costs 15 to 40% less than traction. This is a vendor blog.
- **EVstudio, 2014, RSMeans-based.** A two-stop hydraulic cost $65,000 to $75,000 installed, and
  the author added $10,000 to $15,000 per extra stop.
- **Elevator Blueprint, 2026, vendor blog, low weight.** Hydraulic $75,000 to $150,000 (2 to 6
  stops), MRL $100,000 to $250,000.

**Ratio.** The published traction premium over hydraulic runs from about 1.20 to 1.35 times
(BASE4, Elevator World), with vendor blogs spreading it wider. Kulka's 1.43 sits above that
range, which fits West Shore's 250 fpm: faster traction costs more than the 150 fpm MRL units
behind most published comparisons.

**Scaling with stops.** Every source that shows scaling shows a large fixed base plus a smaller
charge per added stop (EVstudio, 2014; CBNA's two Brooklyn quotes). A flat per-stop rate set at
six stops will run low for two to four stop jobs and high for eight or more. With only six-stop
data, Kulka cannot yet fit its own base and slope.

**Ranges for Matt, per stop, calibrated at six stops:**

- Hydraulic: $30,000 to $35,000. JF and V64 give $31,667 and VA gives $33,000.
- Traction (MRL): $38,000 to $45,300. The low end applies the published 1.20 to 1.35 premium to
  JF's hydraulic figure ($38,000 to $42,750). The high end is West Shore at 250 fpm. NYC's 2023
  four-stop MRL quote, at about $39,500 per stop before hoistway work, lands inside this range.

Matt states the rates.

## 3. The elevator bulkhead

### Why the shaft rises above the roof

The car needs clear overhead above the top landing:

- In-ground hydraulic: 12'-0" to 12'-8" to the hoist beam (Otis, 2010).
- Telescopic holeless hydraulic: 12'-8" to 13'-2" (Otis, 2010).
- Roped holeless hydraulic: 12'-6" at 150 fpm, 13'-0" at 200 fpm (Schumacher).
- MRL traction: 11'-8" (KONE 300 DX, with a movable hoist beam), 13'-0" to 13'-8" (KONE 500 DX),
  12'-7" (Schindler 3300 example, CED), 14'-7" at 200 fpm (Otis Gen2, 2010).

A top story of 10 to 10'-6" leaves roughly 2 to 5 feet of shaft above the roof structure, plus
the hoist beam and the bulkhead's own roof. That is why nearly every multifamily elevator gets
a bulkhead. We found no published "typical bulkhead height." Matt's one level of CMU covers the
overrun with room to spare.

**Plan size.** Inside hoistway dimensions for a 2,500 to 3,500 lb passenger car run about 8'-4"
wide by 6'-6" to 7'-10" deep for one car, and about 17'-0" wide for two cars side by side (Otis,
2010; CED). With 8-inch CMU walls, one car's bulkhead runs roughly 9'-8" x 8'-2" to 9'-2"
outside, and two cars about 18'-4" wide.

### Machine room and controller

Neither hydraulic nor MRL traction puts a machine room on the roof:

- Hydraulic: machine room at the bottom landing, adjacent or remote (Otis, 2010; TK Elevator).
- MRL traction: controller in a closet at the top landing (Otis Gen2, within 250 feet; KONE
  remote closet 4'-1" x 1'-11"), in the landing door jamb (TK endura MRL), or no closet at all
  (Schindler 3300). KONE notes that IBC 2018 and ASME A17.1-2019 can change the controller space
  and says to check with the rep.

Only traction with a machine room above the shaft needs a rooftop penthouse (CBNA, 2024). This
corrects the ticket's assumption that "traction needs a penthouse machine room." MRL traction
does not. Whether West Shore's 250 fpm unit had a machine room is unknown.

### What code or practice adds to a bulkhead

| Item | Status | Basis |
| --- | --- | --- |
| CMU walls around the overrun | Near-always | Overhead exceeds top story |
| Fire rating equal to the shaft, 2-hour at four or more stories | Near-always | IBC 713.4; IBC 3005.4 for any machine or control space |
| Hoist beam at top of hoistway | Near-always | Otis and KONE guides, "by others" |
| Bulkhead roof and base flashing up its walls | Near-always | Roof area is unchanged, but the flashing up the new walls is added |
| Metal coping | Depends on job | Matt's stated scope |
| Door and frame with hardware and paint | Depends on job | See below |
| Lighting and receptacle | Depends on job | Required in machine rooms and control spaces (NEC 620.23), not in a plain overrun |
| Machine room penthouse | Depends on job | Only traction with an overhead machine room |
| Hoistway venting | Rarely | Deleted from the IBC in 2015 and from the NYC code in 2022 (in effect November 7, 2022); the 2025 NYS code follows the 2024 IBC |
| Guardrail | Depends on job | IBC 1015 guards only where equipment or hatches sit within 10 feet of a roof edge |
| Lightning protection | Depends on job | NFPA 780 is not required by the IBC |

**The door.** Mechanics reach an MRL or hydraulic overrun from the car top, not the roof. A
door usually means the bulkhead also houses the roof stair (IBC 1011.12, four or more stories)
or a machine room, which IBC 1011.12.1 says a stair must reach. Matt should confirm which,
since a combined stair bulkhead is larger.

Cross-reference: the sprinkler head and heat detector at the top of the hoistway are already
flagged under item 26 for items 27, 31 and 32.

## 4. Floor-to-floor height

| Construction type | Sources | Planning figure (proposed) | Range |
| --- | --- | --- | --- |
| Wood frame, Type V or Type III, including over a podium | WoodWorks 5-story design example, 10'-0" (2017); WoodWorks mid-rise paper assumes 10 ft (2015); RSMeans apartment models, 10 ft story height (2019 data); CTBUH residential, 3.1 m or about 10'-2" | 10'-6" | 10'-0" to 11'-0" |
| Podium level, Type I | WoodWorks example implies about 12 ft (62 ft total less five 10-ft wood floors, 2017) | 12'-0" | 10'-0" to 20'-0" |
| Cold-formed steel bearing walls | No published figure found | 10'-0" | not found |
| Concrete flat plate | AISC Design Guide 14 says staggered truss reaches about 8'-8", "approximately equal" to flat plate | 9'-8" | 8'-8" to 10'-6" |
| Steel | Staggered truss about 8'-8" (AISC DG 14); beam-and-deck framing runs deeper, no figure found | 10'-0" | 8'-8" to 12'-0" |
| Ground floor with retail or amenity | SPUR 2014, 15 to 18 ft for good retail; Portland planning memo 2020, ground floor about 15 ft; NYC Zoning's qualifying ground floor puts the second floor at least 13 ft above curb | 15'-0" | 13'-0" to 18'-0" |

The planning figures are proposals built from these sources. The wood figure of 10'-6" sits
above the 10'-0" examples to allow for 9-foot ceilings, which the sources do not measure. We
found no published Long Island or New York figure for any type. The one New York difference we
found is zoning: NYC rewards a 13-foot ground floor with extra height.

### Travel at 4 to 7 stories

Travel = (stories minus 1) x typical floor-to-floor + (ground floor minus typical).

| Typical floor | Ground floor | 4 stories | 5 stories | 6 stories | 7 stories |
| --- | --- | --- | --- | --- | --- |
| 10'-6" wood | 10'-6" | 31.5 ft | 42.0 ft | 52.5 ft | 63.0 ft |
| 10'-6" wood | 15'-0" | 36.0 ft | 46.5 ft | 57.0 ft | 67.5 ft |
| 10'-0" wood, CFS or steel | 10'-0" | 30.0 ft | 40.0 ft | 50.0 ft | 60.0 ft |
| 10'-0" wood, CFS or steel | 15'-0" | 35.0 ft | 45.0 ft | 55.0 ft | 65.0 ft |
| 9'-8" concrete | 9'-8" | 29.0 ft | 38.7 ft | 48.3 ft | 58.0 ft |
| 9'-8" concrete | 15'-0" | 34.3 ft | 44.0 ft | 53.7 ft | 63.3 ft |

Against the 60-foot hydraulic ceiling, every six-story case fits, and every seven-story case
passes it or sits on it. That is the basis for the band in Section 1.

## Proposed for Matt to confirm

These are proposals, not decisions.

1. Band: four stories or fewer, hydraulic with high confidence. Five and six stories, either
   type, low confidence. Seven or more, traction with high confidence. Run on travel when a
   below-grade stop or tall ground floor is known.
2. Hydraulic rate: $30,000 to $35,000 per stop at six stops. Kulka's jobs give $31,667 and
   $33,000.
3. Traction (MRL) rate: $38,000 to $45,300 per stop at six stops. West Shore gives $45,310.
4. Bulkhead, near-always: CMU walls around the overrun, fire rated to match the shaft (2-hour at
   four or more stories), hoist beam, bulkhead roof and base flashing.
5. Bulkhead, depends on the job: door, frame, hardware and paint, needed only when the bulkhead
   also holds a roof stair enclosure or an overhead traction machine room, not for a bare overrun
   on hydraulic or MRL traction, since mechanics reach the head of the shaft from the car top, not
   through a roof door (Section 5); metal coping; lighting and receptacle; machine room penthouse
   (traction with an overhead machine only); guardrail; lightning protection; hoistway vent
   (rarely, since 2015 IBC and 2022 NYC).
6. Floor-to-floor planning figures: wood 10'-6", podium 12'-0", cold-formed steel 10'-0",
   concrete flat plate 9'-8", steel 10'-0", retail or amenity ground floor 15'-0".

## 5. Does the bulkhead need a door?

**How a mechanic reaches the top of the hoistway.** ASME A17.1 handles the top of the hoistway
from inside the car or from the car top, not from a separate walk-in space. Section 2.7.5.1 sets
rules that apply "if maintenance or inspection of the elevator driving-machine brake or an
emergency brake, or of elevator motion controllers or motor controllers from inside the car or
from the car top could result in unexpected vertical car movement" (ASME A17.1, as quoted in
Washington State Department of Labor and Industries, Technical Clarification 22-03, 2022). The
same bulletin states it plainly for MRL units: "The cartop and hoistway is now the machine room,
machine space, control room, control space" (WA L&I, 2022). This covers both systems in Section
3. The hydraulic overhead sheaves and the MRL traction machine sit above the car, and the
mechanic reaches them by riding the car up on inspection speed and standing on its roof, not by
walking in from the roof.

**When ASME A17.1 calls for a door instead.** The access-door rule in ASME A17.1 applies to
enclosed rooms, not to the bare overrun. Section 2.7.3.1.1 requires "a permanent and
unobstructed means of access" to machinery spaces, machine rooms, control spaces and control
rooms, and Section 2.7.3.4.2 sets the door itself at a minimum 29.5 inches wide and 80 inches
high, labeled "ELEVATOR EQUIPMENT" (ASME A17.1, as reproduced in the NYC Building Code's
Appendix K modifications, via UpCodes, read 2026). That rule follows the room, not the roof. A
hydraulic machine room sits at the bottom landing and its door is at grade (Otis, 2010, Section
3 above). An MRL control space is usually a shallow closet at the top landing, opening off the
hallway or built into the door jamb, so its required door is a hallway door, not a roof door (WA
L&I, 2022, showing the controller closet in plan and elevation off the top landing hallway). IBC
3005.1 backs this with a general rule: "An approved means of access shall be provided to
elevator machine rooms, control rooms, control spaces and machinery spaces," naming no door and
no location (IBC 2018, Section 3005.1, via UpCodes, read 2026).

**So when does the bulkhead get a door.** Only when the room ASME A17.1 is talking about sits
inside the bulkhead itself: a traction penthouse machine room (Section 3 above), or a roof stair
enclosure that IBC 1011.12 and 1011.12.1 must reach. Absent either, the CMU around a bare
overrun encloses no room a person walks into, so no ASME access door applies. An elevator whose
top stop sits below the top of the bulkhead does not change this. The car still rides to its
blocked or inspection position and the mechanic still works from its roof, whether the overrun
above that position is two feet or five.

**What we could not confirm.** No source we found addresses a bulkhead door built only for
convenience, apart from a stair or a machine room. If a Kulka job has one, it is a
project-specific choice, not a code requirement.

## What we could not find

- RSMeans current elevator line items, or any published per-stop rate split by type.
- The date of the Elevator World cost article, and its exact wording.
- A published typical elevator bulkhead height.
- A published floor-to-floor figure for cold-formed steel, or for New York or Long Island
  practice by construction type.
- Why West Shore chose traction, and whether its unit had a machine room.

## Sources

- Otis Elevator Company, *Elevator Planning and Selection Guide* (2010), Sweets 14 20 00/OTI:
  http://sweets.construction.com/swts_content_files/2051/1035_142000-oti_10.pdf
- Otis, Gen3 product page (read 2026): https://www.otis.com/en/us/products-services/products/gen3
- KONE, *Architectural Planning Guide* MonoSpace DX (2025/2026):
  https://www.kone.us/Images/KONE%20APG%20DX%20Brochure_SF2861_0426_tcm25-18782.pdf
- Schindler 3300 product page (read 2026): https://www.schindler.com/en/elevators/passenger/schindler-3300.html
- TK Elevator, endura (read 2026): https://www.tkelevator.com/us-en/products/elevators/all-elevators/endura/
- TK Elevator, endura MRL (read 2026): https://www.tkelevator.com/us-en/products/elevators/all-elevators/endura-mrl/
- TK Elevator, "Hydraulic Conventional vs Hydraulic MRL" (2021):
  https://www.tkelevator.com/us-en/company/insights/hydraulic-conventional-vs-hydraulic-mrl.html
- Schumacher Elevator, holeless roped hydraulic: https://www.schumacherelevator.com/elevators/passenger/hydraulic/holeless-roped/
- Archtoolbox, "Elevator Types" (May 22, 2021): https://www.archtoolbox.com/elevator-types/
- CED Elevator, "MRL Traction vs Underground Hydraulic" (undated):
  https://www.cedelevator.com/mrl-traction-vs-underground-hydraulic-choosing-the-right-package-for-new-construction/
- Kaiser Elevator, "Hydraulic vs. Traction Elevators for New Construction" (Nov 20, 2025):
  https://kaiserelevator.com/hydraulic-vs-traction-elevators-for-new-construction-cost-speed-travel-and-power-requirements/
- Center for Building in North America, *Elevators* report (2024), and executive summary:
  https://admin.centerforbuilding.org/wp-content/uploads/2024/12/Elevators.pdf ,
  https://admin.centerforbuilding.org/wp-content/uploads/2024/12/Elevatorsexecutivesummary.pdf
- Marginal Revolution summary of Stephen Smith, NYT (July 9, 2024):
  https://marginalrevolution.com/marginalrevolution/2024/07/u-s-elevators-are-much-more-expensive.html
- Elevator World, "New Life for Hydraulic Elevators" (date not found, read via search results only):
  https://elevatorworld.com/article/new-life-for-hydraulic-elevators/
- BASE4, "Electric MRL vs Hydraulic Elevators" (Mar 22, 2018): https://www.base-4.com/electric-mrl-vs-hydraulic-2/
- EVstudio, "How Much Does a Hydraulic 2-Stop Elevator Cost?" (Oct 4, 2014):
  https://evstudio.com/how-much-does-a-hydraulic-2-stop-elevator-cost/
- Elevator Blueprint, commercial elevator cost guide (2026): https://elevatorblueprint.com/blog/commercial-elevator-cost/
- RSMeans model pages, Apartment 1-3 and 4-7 Story (2019 data):
  https://www.rsmeans.com/model-pages/apartment-4-7-story
- IBC 1009.2.1 and 1009.4 (2018/2021): https://up.codes/s/elevators-required ;
  https://codes.iccsafe.org/s/IBC2018P6/chapter-10-means-of-egress/IBC2018P6-Ch10-Sec1009.2.1
- IBC 1011.12 and 1011.12.1: https://up.codes/s/stairway-to-roof-and-roof-access ;
  https://up.codes/s/stairway-to-elevator-equipment
- IBC 3005.4 (2018): https://codes.iccsafe.org/s/IBC2018/chapter-30-elevators-and-conveying-systems/IBC2018-Ch30-Sec3005.4
- Pikes Peak Regional Building Dept., 2009 to 2015 IBC significant changes (Section 3004 deleted):
  https://www.pprbd.org/File/Resources/Downloads/Codes/2009%20to%202015%20IBC%20Significant%20Changes%20Summary.pdf
- NYC Building Code 2014, 3004.5 (prior venting rule): https://up.codes/s/control-of-smoke-and-hot-gases
- SOCOTEC, "As the Smoke Rises, the Elevator Shaft Vents Must Go" (Oct 28, 2022):
  https://www.socotec.us/blog/as-smoke-rises-elevator-shaft-vents-must-go
- Building Code of New York State 2025, based on 2024 IBC, effective Dec 31, 2025:
  https://up.codes/viewer/new_york/ibc-2024 ;
  https://www.nysed.gov/facilities-planning/news/2025-nys-uniform-code-and-state-energy-code-will-take-effect-december-31
- M&T Ruhl, generator planning for elevators: https://mtruhl.com/articles/generator-for-elevator-commercial-buildings/
- Bomberger, elevator guidelines for emergency generators: https://www.experts.com/content/articles/abomberger1_emergency_generators.pdf
- USGS, Long Island sole-source aquifer:
  https://www.usgs.gov/centers/new-york-water-science-center/science/groundwater-sustainability-long-island-aquifer-system
- WoodWorks, *Five-Story Wood-Frame Structure over Podium Slab* (Dec 2017):
  https://www.woodworks.org/wp-content/uploads/Five-Story-Wood-Frame-Structure-over-Podium-Slab-WoodWorks-Dec-2017.pdf
- WoodWorks, Podesto, *Maximizing Value with Mid-Rise Construction* (2015):
  https://www.woodworks.org/wp-content/uploads/Maximizing-Value-with-Mid-Rise-Construction.pdf
- CTBUH height calculator assumptions (3.1 m residential): https://www.skyscrapercenter.com/height-calculator
- AISC Design Guide 14, staggered truss (8'-8" floor-to-floor), as summarized:
  https://www.aisc.org/Design-Guide-14-Staggered-Truss-Framing-Systems ;
  https://en.wikipedia.org/wiki/Staggered_truss_system
- SPUR, "Designing at Ground Level" (June 3, 2014): https://www.spur.org/publications/urbanist-article/2014-06-03/designing-ground-level
- City of Portland, height and FAR memo (May 18, 2020):
  https://www.portland.gov/bps/cc2035/documents/correlation-maximum-height-maximum-far-central-city-plan-district/download
- NYC Zoning, qualifying ground floor: https://fontanarchitecture.com/qualifying-ground-floor/ ;
  https://zr.planning.nyc.gov/article-ii/chapter-3
- Washington State Dept. of Labor and Industries, Elevator Safety Program Technical
  Clarification 22-03, "MRL-HMRL Clarifications & Testing" (Mar 14, 2022), quoting ASME
  A17.1 Section 2.7.5.1: https://lni.wa.gov/licensing-permits/_docs/TC-22-03-MRL-HMRL.pdf
- UpCodes, ASME A17.1 Section 2.7, "Machinery Spaces, Machine Rooms, Control Spaces and
  Control Rooms" (read 2026): https://up.codes/s/machinery-spaces-machine-rooms-control-spaces-and-control-rooms
- UpCodes, IBC Section 3005.1, "Access" (read 2026): https://up.codes/s/machine-rooms
