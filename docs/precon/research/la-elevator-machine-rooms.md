# Elevator machine rooms: how many, and which need HVAC

Researched 2026-09-28 for item 26g, Machine Room HVAC (`docs/precon/canonical-work-items.md`,
Elevator element). Today 26g counts one per elevator, on hydraulic jobs only. Matt wants the app
to derive the number of machine rooms or controller spaces, and whether each needs its own
HVAC, from facts it already has. This file answers that for 3 to 7 story multifamily in New
York and proposes a rule. Everything here is a proposal for Matt to confirm. Kulka AI states
planning assumptions only. It does not read drawings or perform takeoffs.

Manufacturer planning guides and installation checklists carry room locations, room sizes and
temperature ranges. Code text carries the rule that the room must be held inside the maker's
range by its own system. The only regulator guidance we found that says what each elevator
type gets in practice is a 2023 bulletin from Wisconsin's elevator program. New York has
published nothing like it that we could find.

## Short answer

A hydraulic elevator has a machine room at the lowest landing, beside the hoistway or remote
from it. Cars in one group share one room, and every maker sizes rooms by the number of cars
in the group. Each room needs its own cooling or ventilation by code. In New York's summers,
cooling is the safe planning default, because the hydraulic makers' ceiling of 90°F sits at or
just above the outdoor design temperature, so outdoor air alone cannot hold it.

Machine-room-less (MRL) traction has no room. Its controller sits on the hoistway wall, in a
landing door jamb, or in a shallow closet, and the makers rate it for 32 to 104°F. The one
regulator that addresses it says these elevators usually get no ventilation, heating or
cooling, because the building's own conditioned air is enough.

So the proposed count is one room per elevator bank on hydraulic jobs, which is one per
building when each building's cars stand together, and zero on traction jobs. The main risk
is V-1 itself: at 5 and 6 stories V-1 is already low confidence, and a flip from hydraulic to
traction takes the count to zero.

## 1. Hydraulic: where the room goes and who shares it

### Location

- Otis says a hydraulic elevator needs a separate machine room at the bottom landing, which can
  sit next to the hoistway or remote from it (Otis planning guide, 2010, Step 4).
- TK Elevator says the best spot is on the lowest floor served, next to the hoistway, and that a
  remote room costs extra (endura brochure, 2023, machine room page).
- Schindler asks for clear space above the ceiling for the oil line and wiring when the room is
  remote, and says those runs go overhead (330A installation checklist, items C11 and C13;
  330A brochure, general requirement 18).
- ASME A17.1 section 2.7.8 covers remote machine rooms and control rooms. NYC's Appendix K
  rewrites 2.7.8.4 to require a permanent means of communication between the car, the remote
  room and the lobby fire command station where one exists (NYC Building Code 2022, Appendix K,
  via UpCodes).

No maker we read states a maximum distance for a remote hydraulic room, and we found no New
York rule that sets one.

### Sharing

| Cars in the group | Otis machine room (W x D) | TK endura, submersible unit | TK endura, dry unit |
| --- | --- | --- | --- |
| 1 | 5'-9" x 7'-4" | 7'-2" x 7'-1½" | 9'-10" x 5'-6" |
| 2 | 11'-6" x 8'-6" | 10'-5½" x 10'-5½" | 14'-7" x 7'-0¾" |
| 3 | 17'-0" x 8'-6" | not shown | not shown |
| 4 | 22'-0" x 8'-6" | not shown | not shown |

Sources: Otis planning guide (2010), holed, holeless and telescopic pages, machine room row
"number of elevators in group"; TK endura brochure (2023), single-car and dual-car machine room
tables, room height at least 7'-6" and door height at least 7'-0".

- Schindler says a larger room is needed when two or more power units share a common machine
  room (330A brochure, note vi). Its minimum clear room height is 7'-9".
- Otis HydroFit says room sizes for two-car groups vary with the hoistway (HydroFit brochure,
  2016, note 8).

**The typical arrangement is one room per group, holding each car's pump unit and controller.**
Every guide shows the room growing with the number of cars. None shows a room per car within a
group, and none states a cap on cars per room.

### Hydraulic without a machine room

Two makers sell a hydraulic unit with no machine room. Both are holeless only.

| Product | Max travel | Max stops | Where the gear goes | Source |
| --- | --- | --- | --- | --- |
| Otis HydroFit | 26'-6" (5-ft pit, two-stage) | 4 | All in the hoistway; a machine room is optional | HydroFit brochure (2016) |
| TK endura MRL | 33'-6½" | not stated | Pump unit in the pit; controller in the entrance jamb at the landing above the lowest | endura brochure (2023) |

- TK markets the MRL version as removing the framing, electrical, HVAC, fire-rated door, lock
  and signage a machine room needs (endura brochure, contractors page).
- Otis frames the conventional hydraulic as needing a machine room with lighting, HVAC and fire
  protection, and HydroFit as needing none (HydroFit brochure).
- **NYC does not allow it.** Appendix K rewrites A17.1 section 3.7.1 so that hydraulic machines
  and controllers are not permitted in the hoistway or pit (NYC Building Code 2022, Appendix K,
  via UpCodes). A hydraulic elevator in NYC always has a room.

In stories, using the floor-to-floor figures Matt set on LA-784 (10'-0" typical, 15'-0" retail
or amenity ground floor): three stories give 20 to 25 feet of travel, which both products reach.
Four stories give 30 feet, which only TK reaches, and 35 feet with a tall ground floor, which
neither reaches. A served cellar adds a stop. Past four stories there is no hydraulic MRL in the
sources.

## 2. Machine-room-less traction: the controller space

| Product | Where the controller goes | Stated ambient range | Source |
| --- | --- | --- | --- |
| Otis Gen2 (2010) | Separate control closet or room, up to 250 ft from the top of the hoistway | not stated | Otis planning guide (2010) |
| Otis Gen3 (2021) | Control closet (hoistway depth x 3'-10") or room (x 5'-9") is optional; a duplex room is hoistway depth x 7'-6"; a closet is required for 4,000 lb passenger and service cars at 350 fpm | not stated | Gen3 hoistway dimensional data and hoistway design brochure (2021) |
| KONE MonoSpace 300 DX (2 to 4 landings) | Integrated control closet at the landing (standard), remote closet 4'-1" x 1'-11", or adjacent or remote room 5'-0" wide | not stated | KONE Architectural Planning Guide (2025/2026) |
| KONE MonoSpace 500 DX (5 to 36 landings) | Remote controller space 4'-1" x 1'-8", or adjacent or remote room 5'-0" wide | not stated | KONE APG (2025/2026) |
| Schindler 3300 | Motor controller on the front wall of the hoistway; the checklist sets a separate range for the top landing | Hoistway 32 to 110°F; top landing 32 to 104°F | 3300 installation checklist (rev. WF2P1 0726) |
| TK evolution | Controller closet | 32 to 104°F, 10 to 95% RH non-condensing | TK Elevator, "How to improve ventilation in your machine room" (2022) |

- KONE says jurisdictions on IBC 2018 or ASME A17.1-2019 should check controller space
  arrangements with its rep (APG, notes 9 and 12). It does not say what changes.
- Schindler gives the MRL machine's heat output as 3,880 to 5,540 BTU/hr, and the air needed as
  198 to 283 CFM at 70°F (3300 checklist, ventilation table).

**Does the controller space need its own cooling?** The makers' ranges run to 104°F or 110°F,
well above the 90°F hydraulic ceiling. Wisconsin's elevator program says MRL traction units
usually get no ventilation, exhaust, heating or cooling of their own. The car's piston effect
and the hoistway doors opening let conditioned building air hold the range. It adds that a
system may be needed where the building is unheated or not air-conditioned, or where use is
heavy, and that some suspension means need a minimum hoistway temperature (Wisconsin DSPS,
"Ventilation Requirements for Elevator Hoistways and Machine Rooms," 2023).

**The code text reaches further than that practice.** New York's building codes require an
independent ventilation or air-conditioning system for machine rooms, for machinery spaces
that contain the driving machine, and for control rooms or spaces that contain the controller
(Section 4.2 below). Read strictly, that covers an MRL hoistway and a jamb controller. We found
no New York ruling on the point. Wisconsin's bulletin is written under the same A17.1 rule and
still treats building air as enough.

**NYC adds a path-of-travel rule.** Appendix K adds A17.1 section 2.7.3.1.1(d): a control space
in an unrestricted path of travel needs a clear path past it equal to the working clearance plus
48 inches, and a permanent barricade used whenever its doors are open (NYC Building Code 2022,
Appendix K, via UpCodes). A jamb controller in a narrow corridor may therefore move to a closet
or room on NYC jobs.

## 3. Traction with a machine room

At this building size, the makers' standard traction products are machine-room-less.

- KONE's overhead machine room product, MiniSpace DX, is aimed at mid to high rise, with 6 to 63
  landings and 200 to 700 fpm. Its MRL MonoSpace 300 DX and 500 DX cover 2 to 36 landings at
  150 to 500 fpm (KONE APG, 2025/2026).
- Otis offered a machine room version of Gen2 at speeds up to 500 fpm (2010) and says overhead
  machine rooms are available on Gen3 Peak (Gen3 hoistway design brochure, 2021).
- The Center for Building in North America found MRL traction most common at four to six stops
  (CBNA, 2024, as summarized in `la-784-elevator-followups.md` Section 1).
- A 250 fpm speed spec, like West Shore's, does not by itself force a machine room. Otis Gen3
  Edge runs to 350 fpm, and Gen3 Peak and KONE MonoSpace 500 DX run to 500 fpm, all without a
  room (Otis Gen3 dimensional data, 2021; KONE APG).

A machine room traction elevator at 3 to 7 stories would come from an owner or consultant spec,
a heavy service car, or a match to existing equipment. We found no source that sizes how often.

For cooling, Wisconsin says a traction machine room can use natural ventilation, fans, exhaust,
heating or air conditioning, and that its air may go to occupied spaces because there is no oil
odor (Wisconsin DSPS, 2023).

**Sharing.** We found no maker statement for overhead traction rooms at this size. Otis's duplex
control room for Gen3 and the hydraulic group rooms above point the same way: one room per
group. That is our reading for overhead traction, not a sourced fact.

## 4. Temperature, humidity and what code requires

### 4.1 Maker limits

| Equipment | Temperature | Humidity | Source |
| --- | --- | --- | --- |
| Schindler 330A hydraulic machine room | 55 to 90°F | 95% RH or less, non-condensing | 330A brochure, general requirement 15; checklist item C12 gives the same 55 to 90°F |
| Schindler 330A hydraulic machine room (other page) | 55 to 104°F | under 85%, non-condensing | 330A checklist, ventilation requirements, item 1 |
| Machine rooms, TK Elevator general guidance | typically 55 to 90°F | not stated | TK Elevator, "Keep your elevator machine room cool" |
| TK evolution controller closet | 32 to 104°F | 10 to 95%, non-condensing | TK Elevator (2022) |
| Schindler 3300 MRL, hoistway | 32 to 110°F | not stated | 3300 checklist |
| Schindler 3300 MRL, top landing | 32 to 104°F | not stated | 3300 checklist |

Schindler's own 330A documents disagree on the upper limit (90°F in two places, 104°F in one).
Budgets should use 90°F until the chosen elevator sub states its figure.

Schindler lists heating, cooling and ventilation of the machine room among the things the
building provides (330A brochure, general requirement 15). TK says machine room air conditioners are usually installed
by third parties during construction (TK Elevator, "Keep your elevator machine room cool").

### 4.2 What code requires

- **ASME A17.1 section 2.7.9.2.** Machine rooms, machinery spaces, control rooms and control
  spaces must have natural or mechanical means to keep temperature and humidity inside the
  maker's range, and the range must be posted in the room (A17.1 as restated in Ohio's elevator
  pre-inspection checklist, which pairs it with building code 3005.2). Section 3.7.1 applies this to
  hydraulic elevators; NYC's rewrite of 3.7.1 names 2.7.9 directly (NYC Appendix K), and
  Wisconsin cites the same link (DSPS, 2023).
- **Building code 3005.2.** Machine rooms, machinery spaces that contain the driving machine, and
  control rooms or spaces that contain the controller need an independent ventilation or
  air-conditioning system that can hold the maker's range. The wording is the same in the 2020
  Building Code of New York State (titled Venting), the 2025 Building Code of New York State
  (titled Temperature Control), and the 2022 NYC Building Code (titled Temperature Control)
  (all via UpCodes). Both state editions and the NYC code adopt A17.1 by reference (BCNYS
  3001.3 and Table 3001.3; NYC BC 3001.2, as modified by Appendix K).
- **What "independent" means.** North Carolina's fire marshal ruled in 2018 that a branch of the
  building's HVAC, a VAV box, or building make-up air does not meet 3005.2. The reason given is
  that a building HVAC failure should not take the elevator down (NC OSFM interpretation,
  3005.2, September 13, 2018). This is another state's ruling, but it reads the same model code
  text New York adopts.
- **Standby power.** Where elevators are on standby power, the machine room ventilation or air
  conditioning must be on it too (BCNYS 2020 and 2025, and NYC BC 2022, section 3003.1.4).
  `la-784-elevator-followups.md` notes that IBC 1009 requires standby power for elevators that
  serve as accessible means of egress, which captures most five and six story buildings.

Two other jurisdictions write a fixed range into law, for contrast only: Massachusetts sets 50
to 90°F (524 CMR 35, amended 2.7.9.2) and Seattle sets 55 to 90°F where no maker figure exists
(Seattle Building Code 2021, 3020.7). Neither applies in New York.

### 4.3 Does a hydraulic room need cooling, ventilation, or heat?

**Sourced facts.**

- Schindler's minimum ventilation for a hydraulic machine room, air at 70°F:

  | Pump motor | Heat | Air |
  | --- | --- | --- |
  | 15 HP | 3,740 BTU/hr | 190 CFM |
  | 20 HP | 4,740 BTU/hr | 240 CFM |
  | 25 HP | 5,740 BTU/hr | 290 CFM |
  | 30 HP | 6,740 BTU/hr | 350 CFM |
  | 40 HP | 8,740 BTU/hr | 450 CFM |
  | 50 HP | 10,740 BTU/hr | 550 CFM |

  Schindler also says to avoid a vented door, to duct the air outdoors where possible, and to keep
  intake and exhaust apart (330A checklist, ventilation requirements).
- Wisconsin accepts two methods for a hydraulic machine room: an exhaust fan to the outdoors,
  or to a space of like contamination such as a garage exhausted outdoors, with a second opening
  for transfer air; or a split air-conditioning system with a well-sealed door. The limit on
  where the air can go is oil odor, under the mechanical code rule the bulletin cites (IMC
  502.1.3) (Wisconsin DSPS, 2023).
- TK says air conditioners are usual in warm climates, and an independent ventilation system can
  serve in cooler climates where air conditioning is not needed (TK Elevator, "Keep your elevator
  machine room cool").
- A 2007 engineering trade article says hydraulic machine rooms need air conditioning to keep
  the oil at operating temperature, and that a 3,000 lb car usually needs a 1.5 to 2 ton unit
  (Consulting-Specifying Engineer, 2007). This is a secondary source and runs well above
  Schindler's heat table.
- For heavy use, an oil cooler (HydroCool, 17,500 BTU/hr) rejects heat outdoors when feasible or
  into the machine room, which may then need cooling. For cold, an oil tank heater held at 110°F
  helps, particularly where the room is not well heated (Schindler hydraulic modernization
  brochure).
- New York design temperatures, ASHRAE 2021, as listed by the NYS Clean Heat program:

  | Station | 1% cooling dry bulb | 99% heating dry bulb |
  | --- | --- | --- |
  | NYC Central Park | 87.9°F | 17.3°F |
  | NYC JFK | 86.7°F | 17.5°F |
  | NYC LaGuardia | 89.8°F | 17.9°F |
  | Islip | 85.9°F | 15.7°F |
  | Westhampton | 84.2°F | 11.9°F |
  | White Plains (nearest to Rockland) | 86.4°F | 12.9°F |
  | Poughkeepsie (Hudson Valley) | 88.4°F | 8.0°F |

**Our reading (not sourced).** Ventilation with outdoor air can only hold a room above the
outdoor temperature. Using the standard sensible heat formula (air in CFM = heat in BTU/hr ÷
(1.08 x temperature rise in °F)), a 25 HP unit needs about 2,650 CFM to hold 90°F on an 88°F day,
against Schindler's 290 CFM at 70°F air. That is not a practical fan for a small room. If the
chosen maker's ceiling is 104°F, the same unit needs about 330 CFM on an 88°F day, which is
practical. So:

- **Cooling is the planning default** for a hydraulic room in New York. A small ductless split
  fits the heat in Schindler's table (0.3 to 0.9 tons per pump unit, about double for two cars).
  It also avoids ducting exhaust to the outdoors from a room that usually sits at the lowest
  level with no outside wall.
- **Ventilation only** is a real, cheaper outcome when the elevator sub states a 104°F ceiling and
  the room can exhaust outdoors or into a ventilated garage. The app cannot know this in advance.
- **Heat** is not its own line. A room at the lowest landing sits inside a heated building. The
  oil tank heater is an elevator sub option. A room that opens onto an open or unheated garage
  may need a small heater to stay above 55°F, since New York's 99% heating design runs 8 to 18°F.

## 5. Multiple buildings and separate banks

**Sourced.** Rooms are sized by the number of cars in a group (Otis, TK), two or more power units
can share a common room (Schindler), and Otis offers a duplex control room for Gen3 MRL.

**Not sourced, our reading.**

- Each building with elevators has its own group and its own room. No source shows a room serving
  cars in two buildings, and the oil line and wiring would have to cross between them.
- Two groups inside one building, such as cars at two ends of a long corridor building, would
  each get a room at their own lowest landing. A remote room could in theory serve both, since
  A17.1 allows remote rooms, but no maker shows it and TK prices remote rooms as an extra.
- Two buildings on one shared podium are still two groups, with two rooms, usually both on the
  garage level.
- For MRL traction, each car's controller sits with its own hoistway or in its own closet. Banks do
  not change the HVAC count, which stays at zero.

The app cannot tell one bank from two in a single building. It can tell buildings apart, because
the intake asks for the building count.

## 6. Proposed decision rule

### Inputs

| Input | Where it comes from | Used for |
| --- | --- | --- |
| Elevator type (V-1) and its confidence | Already derived | Hydraulic or traction branch; confidence carries over |
| Elevator count | Intake, `elevator_count` | Buildings with elevators; cars per room for sizing |
| Building count | Intake, `building_count` | One bank per building |
| Stories above grade and travel | Intake and V-1's travel arithmetic | Whether hydraulic MRL can reach |
| Hydraulic jack type (V-2), when present | Already proposed in `la-hydraulic-jack-type.md` | In-ground or roped rules out hydraulic MRL |
| In NYC (yes/no) | Derived from the project ZIP, which the intake already stores | NYC bars hydraulic MRL; NYC control space and sprinkler rules |

No new question is needed. The NYC flag needs a ZIP list, not a prefix test, because some 110
ZIPs are in Nassau and some are in Queens.

Assumptions the rule makes (ours, not sourced):

- All elevators in one building stand together in one bank.
- When elevator count is at least building count, every building has at least one elevator.
- Hydraulic jobs get a conventional machine room even where a holeless MRL unit could reach. It
  is the conventional arrangement in the makers' own framing, and it is the costlier case.
- Traction jobs are MRL unless the estimator corrects the card.

### Rule

1. If the elevator gate is no, or elevator count is 0, the rule does not run.
2. Buildings with elevators = the smaller of elevator count and building count.
3. **V-1 is Hydraulic.**
   - Machine Rooms Needing HVAC = buildings with elevators.
   - HVAC Kind: **Cooling and Ventilation** (a dedicated cooling unit per room, with exhaust where
     the engineer adds it).
   - Cars per room = elevator count ÷ buildings with elevators, rounded up, shown for sizing only.
4. **V-1 is Traction.**
   - Machine Rooms Needing HVAC = 0. Controller spaces = elevator count, one per car, none with its
     own HVAC.
   - HVAC Kind: **None**.
5. **Confidence, hydraulic.**
   - Start at medium.
   - Rise to high only when all three hold: the job is in NYC or V-2 is in-ground or roped (so no
     hydraulic MRL is possible), each building has one elevator, and V-1 is high confidence.
   - Drop one level when any building has two or more elevators, since two cores would double the
     count.
6. **Confidence, traction.**
   - Medium. It is never high, because a strict reading of 3005.2 or a remote control room would
     add a system. Banks do not matter, since the count is zero either way.
   - Low in NYC, where the path-of-travel rule may move the controller into a closet or room.
7. **Either type.** Confidence is low whenever V-1 is low (travel over 35 ft up to 55 ft),
   because a flip between hydraulic and traction swings the count between one per building and
   zero. It is also low when building count is missing.
8. **Estimator correction.** The card takes a corrected room count and kind, the same
   propose-and-correct shape as V-1. Setting Traction With Machine Room gives one room per
   building with Cooling and Ventilation. Setting Ventilation Only keeps the count and changes the
   kind.

Reason lines for the card: "Each building with elevators gets one machine room. Cars in the same
building share it." (hydraulic); "The job is machine-room-less traction, so controllers sit in
building air and no room needs cooling." (traction).

### Worked examples (sample projects, not Kulka jobs)

| Project | V-1 | Rooms | Kind | Confidence | Why |
| --- | --- | --- | --- | --- | --- |
| Long Island, 1 building, 4 stories, 2 elevators | Hydraulic, high | 1 | Cooling and Ventilation | Low | Starts medium; two cars in one building drops a level; 30 ft travel is inside TK's hydraulic MRL reach |
| NYC, 1 building, 4 stories, 1 elevator | Hydraulic, high | 1 | Cooling and Ventilation | High | No hydraulic MRL in NYC; one car |
| Rockland, 3 buildings, 4 stories, 3 elevators | Hydraulic, high | 3 | Cooling and Ventilation | Medium | One car per building |
| Long Island, 1 building, 6 stories, 2 elevators | Hydraulic, low | 1 | Cooling and Ventilation | Low | V-1 is in the either zone |
| Hudson Valley, 2 buildings, 7 stories, 4 elevators | Traction, high | 0 | None | Medium | MRL traction; a room would appear only if the estimator marks the job as having a machine room |
| 2 buildings, 3 stories, 1 elevator | Hydraulic, high | 1 | Cooling and Ventilation | Medium | Only one building has an elevator |

### What the output drives

- **26g, Machine Room HVAC.** Change the quantity rule from one per elevator on hydraulic jobs to
  one per machine room, using this count. Rooms with two or more cars need a larger unit, so Matt
  may want a per-room rate with an add per extra car. Matt states the rate. This file sets none.
- **Knock-ons that scale with rooms, not cars** (flagged, not resolved): the rated enclosure and
  labeled door of each room (building code 3005.4); the room's light and GFCI receptacle on their
  own branch circuit (NEC 620.23, as restated in Ohio's checklist); the machine room HVAC on
  standby power where the elevators are (3003.1.4), which adds generator load under item 31; the
  recall smoke detector; and outside NYC, where the room is sprinklered, the machine room
  sprinkler head and its shunt-trip heat detector (items 27 and 32, BCNYS 3005.5 and NFPA 72
  section 21.4).
- **NYC jobs drop the machine room sprinkler.** NYC BC 3005.5 does not permit sprinklers in
  elevator machine rooms, machine spaces, control rooms or control spaces. Hoistway sprinklers,
  where provided, still need the shunt trip (NYC Building Code 2022, via UpCodes).

### When confidence should be low

A low V-1 or a missing building count makes the result low outright. The other items each
lower it by a level or add a caveat to the card.

- V-1 is low confidence (five and six stories, or travel over 35 ft up to 55 ft).
- Building count is missing.
- On a hydraulic job, a building has two or more elevators, so the one-bank assumption may be
  wrong.
- On a hydraulic job of three or four stories outside NYC, a holeless MRL unit could remove the
  room entirely.
- On a traction job in NYC, the path-of-travel rule may push the controller into a closet or room
  that the building department then expects to have its own system.
- The hydraulic room may open onto an open or unheated garage, which can add a heater to the
  cooling. The intake does not say whether a garage is enclosed.

## What we could not find

- The base text of ASME A17.1 section 2.7.9.2. ASME sells the code. The wording above comes from
  Ohio's checklist and Massachusetts's amended text, which restate it, and Wisconsin's bulletin,
  which cites it.
- A current Otis or KONE US figure for machine room or controller temperature and humidity. The
  Otis 2010 guide and the KONE APG give sizes but no ranges.
- Any maker or New York rule that caps how far a hydraulic machine room can sit from the hoistway.
- Any New York (DOB, NYS Department of State) ruling on whether an MRL hoistway or jamb
  controller needs its own system under 3005.2. Wisconsin's bulletin is the nearest regulator
  guidance, and it is not New York's.
- The current verbatim NFPA 13 text on omitting sprinklers from machine rooms. Secondary sources
  say NFPA 13 lets traction machine rooms omit them under conditions and keeps them in hydraulic
  machine rooms. We could not confirm the hydraulic condition in the standard itself.
- How often Long Island, Rockland or Hudson Valley multifamily jobs use holeless hydraulic MRL
  instead of a machine room.
- How often a 3 to 7 story multifamily building with two elevators splits them into two cores.
- Which method New York mechanical engineers usually pick for a hydraulic room (split air
  conditioning or exhaust), and any published cost for either. The 2007 trade article's 1.5 to 2
  tons per car and Schindler's 0.3 to 0.9 tons per pump unit disagree, and neither is a cost.
- What changes KONE expects under IBC 2018 or A17.1-2019 for controller spaces.

## Sources

- Otis, Elevator Planning and Selection Guide (2010, on Sweets), Step 4 and hydraulic machine
  room tables: http://sweets.construction.com/swts_content_files/2051/1035_142000-oti_10.pdf
- Otis, Gen3 hoistway dimensional data (2021):
  https://www.otis.com/documents/d/otis-2/gen3-elevator-hoistway-dimensional-data
- Otis, Gen3 hoistway design brochure (2021), control closet and overhead machine room notes:
  https://www.otis.com/documents/256045/365329516/Otis-Gen3-Hoistway-Design-Brochure.pdf/0bbd6681-a0a8-cbc5-b473-7ede3e280945?t=1650262715027
- Otis, HydroFit brochure (publication HYD-1201, 2016):
  https://www.otis.com/documents/256045/6552829/Hydrofit%20Brochure%202013.pdf/fbc1db8d-3cc4-b2c0-9851-8aaed88f678c?t=1612350205849
- TK Elevator, endura brochure (2023, 29903-2), MRL controller and machine room pages:
  https://www.tkelevator.com/media/usa_canada/products_4/product_brochures/endura_product_brochure.pdf
- TK Elevator, "Keep your elevator machine room cool" (undated):
  https://www.tkelevator.com/us-en/company/insights/keep-your-elevator-machine-room-cool.html
- TK Elevator, "An overview of elevator machine room cooling requirements" (Canada, undated):
  https://www.tkelevator.com/ca-en/blog/elevator-machine-room-cooling-requirements-4.html
- TK Elevator, "How to improve ventilation in your machine room" (2022), evolution closet range:
  https://www.tkelevator.com/us-en/company/insights/how-to-improve-ventilation-in-your-machine-room.html
- KONE, Architectural Planning Guide, MonoSpace DX and MiniSpace DX (2025/2026):
  https://www.kone.us/Images/KONE%20APG%20DX%20Brochure_SF2861_0426_tcm25-18782.pdf
- Schindler 330A hydraulic elevator installation checklist (CMN-1004c):
  https://www.schindler.com/content/dam/website/us/docs/elevators/schindler-330a/330a-installation-checklist.pdf/_jcr_content/renditions/original./330a-installation-checklist.pdf
- Schindler 330A brochure with layout data and general requirements:
  https://www.schindler.com/content/dam/website/us/docs/elevators/schindler-330a/schindler-330a-hydraulic-elevator-brochure.pdf/_jcr_content/renditions/original./schindler-330a-hydraulic-elevator-brochure.pdf
- Schindler 3300 traction elevator installation checklist (WF2P1 0726):
  https://www.schindler.com/content/dam/website/us/docs/elevators/schindler-3300/schindler-3300-installation-checklist.pdf/_jcr_content/renditions/original./schindler-3300-installation-checklist.pdf
- Schindler, hydraulic elevator upgrades brochure (tank heater, HydroCool oil cooler):
  https://www.schindler.com/content/dam/website/us/docs/modernization/hydraulic-elevator-upgrade-brochure.pdf/_jcr_content/renditions/original./hydraulic-elevator-upgrade-brochure.pdf
- NYC Building Code 2022, Chapter 30 (3003.1.4, 3005.1 to 3005.7), via UpCodes:
  https://up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/30/elevators-and-conveying-systems
- NYC Building Code 2022, Appendix K, modifications to ASME A17.1-2013 (2.7.3.1.1(d), 2.7.8.4,
  3.7.1), via UpCodes:
  https://up.codes/viewer/new_york_city/nyc-building-code-2022/chapter/K/modified-industry-standards-for-elevators-and-conveying-systems
- Building Code of New York State 2020, Chapter 30 (3003.1.4, 3005.2 Venting), via UpCodes:
  https://up.codes/viewer/new_york/ibc-2018/chapter/30/elevators-and-conveying-systems
- Building Code of New York State 2025, Chapter 30 (3003.1.4, 3005.2 Temperature Control), via
  UpCodes: https://up.codes/viewer/new_york/ibc-2024/chapter/30/elevators-and-conveying-systems
- Wisconsin DSPS Elevator Program, "Ventilation Requirements for Elevator Hoistways and Machine
  Rooms" (September 8, 2023), archived copy:
  https://web.archive.org/web/20231215135717id_/https://dsps.wi.gov/Documents/Programs/Elevators/VentilationRequirements.pdf
- Ohio Department of Commerce, elevator pre-inspection checklist (A17.1 2.7.9.2, NEC 620.23):
  https://dam.assets.ohio.gov/image/upload/com.ohio.gov/documents/DIC_Elevator%20pre-inspection%20checklist.pdf
- NC Office of State Fire Marshal, interpretation of 3005.2 (September 13, 2018):
  https://www.ncosfm.gov/building/30052-venting-elevator-machine-rooms/open
- Massachusetts 524 CMR 35, section 2.7 (amended 2.7.9.2, 50 to 90°F):
  https://www.law.cornell.edu/regulations/massachusetts/524-CMR-2-7
- Seattle Building Code 2021, 3020.7 (55 to 90°F default), via UpCodes:
  https://up.codes/s/temperature-control-in-elevator-machine-rooms-control-rooms-and-machinery-spaces
- NYS Clean Heat program, Statewide Savings Calculator v3.4 user guide (September 3, 2024),
  ASHRAE 2021 design temperatures:
  https://cleanheat.ny.gov/assets/pdf/StateWide%20Clean%20Heat%20Calculator_v3.4-User%20Guide_Final.pdf
- Consulting-Specifying Engineer, "HVAC and fire safety for elevator systems" (August 1, 2007),
  secondary: https://www.csemag.com/articles/hvac-and-fire-safety-for-elevator-systems/
- Precision Fire Protection, "Elevator and machine room fire safety" (undated), secondary, NFPA 13
  summary: https://pfpinc.com/elevator-and-machine-room-fire-safety/
- UpCodes, NFPA 13 (2022) 9.3.6 summary page:
  https://up.codes/s/elevator-machine-rooms-machinery-spaces-control-rooms-control-spaces-and-hoistwa
- UpCodes, NFPA 70 (2023) 620.37 summary page:
  https://up.codes/s/wiring-in-hoistways-machine-rooms-control-rooms-machinery-spaces-and-control-spa
- Kulka AI, `docs/precon/research/la-784-elevator-followups.md` (V-1 band, CBNA summary, standby
  power), `docs/precon/criteria/la-784-elevator-type.md` (V-1 decisions and floor-to-floor
  figures), `docs/precon/research/la-hydraulic-jack-type.md` (V-2).
