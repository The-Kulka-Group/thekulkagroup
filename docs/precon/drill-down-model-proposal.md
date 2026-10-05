# Drill-Down Model Proposal (LA-1502)

LA-1502 adds the seven model fields the LA-1479 frames need. Two of its outputs are
proposals, and neither counts until Matt approves it:

1. An element for every line that has none. Only Demolition and Elevator exist today.
2. The rule for which owner items firm up a line (`line.raisedBy`).

The code already reads both from data. A line's element comes from its
`block_classification` row, and no line gets a new element until a migration Matt
approves writes one. The owner-item rule is in `lib/rom/line-details.ts`
(`raisedByFor`), so a change Matt makes here is a change to one function and its tests.

## 1. Which owner items firm up a line

### The rule

An owner item is something the owner can give Kulka. A line lists an owner item when the
line prices on it and the owner has not settled it. Two kinds count:

1. **An open question.** The line prices on the question (it is in `line.inputs`), and the
   owner has not answered it or answered Don't Know. Groundwater or Poor Soil on Support of
   Excavation is one.
2. **A planning assumption.** A Design and Engineering criterion names the line's cost code
   and is not yet High. V-1, Elevator Type, on Elevators is one. The owner firms it up by
   confirming what the criterion assumed.

Each item appears once on a line, questions first by key, then
criteria by code. An item carries only what it is: `{ kind: "question", key }` or
`{ kind: "criterion", code }`. The page turns the key or code into words.

### What never counts

- Kulka's own data. More past jobs, a stated rate, a range width or an engine parameter
  can each move a line, but none is the owner's to give, and none may be named to a client
  (LA-1483).
- A fact a criterion sets, such as Elevator Type. Its criterion is the owner item, so the
  fact is not listed again as a question.
- Any count, any job name, and any mark the item would move the line to. The item list says
  what would firm the line up. It never promises how far.

### Two edges

- A line already at High lists nothing, because there is no higher mark to raise it to.
- A line a branch gate took out of the job lists nothing, because it is not in the budget.

### What it gives on MN Test #4

These come from the frozen fixture's criteria (`lib/rom/line-details.test.ts`).

| Line | Owner Items |
| -- | -- |
| Elevators | V-1, V-2 |
| Support of Excavation | Groundwater or Poor Soil (open question), S-1 |
| Mechanical | M-0 (M-1 is already High) |
| Electrical | E-1 |
| Concrete and Site Concrete | S-1 (A-1 is already High) |
| Wood Framing | A-2 (A-1 is already High) |
| Elevator Bulkhead | None, because it is at High |

### Questions for Matt

1. Frame 04 listed the open groundwater question under 14 Conveying Equipment, because V-2
   assumes it. Under this rule a question lists only on lines that price on it, so on
   MN Test #4 it sits under Support of Excavation and not under Elevators. Should an open
   question a planning assumption reads also list on that assumption's lines?
2. Should a High line list nothing, as proposed?

## 2. An element for every line

### Why this set

GLOSSARY.md defines an element as a named group of canonical items that together make one
physical thing, across whatever trades build it. Matt kept By Element hidden until every
line has one (2026-10-02). The Level Board's four count elements (Elevator, Bathroom,
Kitchen, Balcony) cover only a few lines, so they cannot fill the view alone.

The proposal keeps the two elements Kulka has, uses a Level Board count element where one
plainly fits, and files every other line under its UniFormat II major group (ASTM E1557).
UniFormat is the estimating standard for elemental cost, and its major groups are physical
parts of a building: what holds it up, what encloses it, what is inside it, what services
it, and what surrounds it. Every line then sits in exactly one element and the total is the
same in every view.

| Element | Basis | Status |
| -- | -- | -- |
| Demolition | Kulka's, 2026-09-26 | Exists |
| Elevator | Kulka's, 2026-09-28 | Exists |
| Kitchen | Level Board count element. Kitchens are the unit count, which every requester gives. | Proposed |
| Balcony | Level Board count element. Balconies are a count requesters give. | Proposed |
| Amenities | UniFormat F10, Special Construction. Brought in by the Amenity Scope answer. | Proposed |
| Substructure | UniFormat A: foundations, slab on grade, excavation support. | Proposed |
| Shell | UniFormat B: superstructure, exterior enclosure, roofing. | Proposed |
| Interiors | UniFormat C: partitions, interior doors, stairs, finishes, fittings. | Proposed |
| Services | UniFormat D: plumbing, HVAC, fire protection, electrical, low voltage. | Proposed |
| Sitework | UniFormat G: site preparation, improvements, site utilities, site lighting. | Proposed |

Bathroom is left unused. No line today is only bathroom work: tile, plumbing fixtures and
bath accessories each sit inside a larger line, so a Bathroom element waits on breakouts
carved out of those lines.

### The lines in MN Test #4

Level is the tier of detail each new `block_classification` row must state, read from how
the line prices today: per square foot is 1 (Area), per dwelling unit is 2 (Counts). Matt
approves the level with the element, since a row cannot be written without one.

| Item | Line | Proposed Element | Level | Note |
| -- | -- | -- | -- | -- |
| 2 | Concrete and Site Concrete | Substructure | 1 | Item 2 is foundations, footings and slab on grade (A10). |
| 3 | Building Concrete | Shell | 1 | Elevated slabs and podium deck (B10). Not in this job. |
| 3a | Gypcrete | Shell | 1 | Topping on the floor assembly (B1010). |
| 6 | Masonry | Shell | 1 | Brick and masonry veneer (B20). |
| 7 | Misc Steel Stairs Mesh Screens and Canopy | Interiors | 1 | Mostly stairs and railings (C20). The canopy is Shell, so Matt may prefer Shell. |
| 8 | Wood Framing | Shell | 1 | Superstructure (B10). |
| 8a | Wood Stairs | Interiors | 1 | Stairs (C20). |
| 9 | Finish Carpentry | Interiors | 2 | |
| 10 | Millwork | Interiors | 2 | Closet interiors and built-ins. |
| 11 | Screened Balconies | Balcony | 1 | Decking, balcony railings. |
| 12 | Damproofing and Waterproofing and Insulation | Shell | 1 | Exterior enclosure (B20). |
| 13 | Roofing and Rooftop Pavers | Shell | 1 | Roofing (B30). |
| 14 | Siding Exterior Trim Decks Rails and Stucco | Shell | 1 | Exterior walls (B20). |
| 15 | Doors Frames Hardware | Interiors | 2 | Mostly unit and corridor doors (C1020). Entry doors are Shell. |
| 15a | Overhead Doors | Shell | 1 | Exterior doors (B2030). Not in this job. |
| 16 | Storefronts | Shell | 1 | Exterior windows (B2020). Not in this job. |
| 16a | Windows, Furnish Only | Shell | 1 | Exterior windows (B2020). |
| 17 | Drywall and ACT and Metal Framing | Interiors | 1 | Partitions and ceilings (C10, C30). |
| 18 | Ceramic Tile | Interiors | 2 | Bathroom once tile has a breakout. |
| 19 | Flooring | Interiors | 2 | |
| 20 | Painting | Interiors | 1 | |
| 21 | Specialties and Signage | Interiors | 2 | Fittings (C1030). |
| 22 | Appliances | Kitchen | 2 | Owner-direct. The element does not change the contract side. |
| 24 | Cabinets | Kitchen | 2 | |
| 24a | Countertops | Kitchen | 2 | |
| 24b | Window Treatments | Interiors | 2 | |
| 25 | Furnishings and Fireplace | Amenities | 1 | Item 25 is amenity special construction. |
| 27 | Fire Protection | Services | 1 | D40. |
| 28 | Plumbing | Services | 2 | D20. |
| 30 | Mechanical | Services | 1 | D30. |
| 31 | Electrical | Services | 1 | D50. |
| 31a | Low Voltage | Services | 1 | D50. |
| 32 | Fire Alarm | Services | 1 | D50. |
| 32a | BDA System | Services | 1 | D50. Not in this job. |
| 34 | Site Work | Sitework | 1 | Excavation, backfill and grading (G10). |
| 34a | Support of Excavation and Underpinning | Substructure | 1 | Excavation support (A20). Waiting on the groundwater answer. |
| 37 | Landscaping Irrigation Pavers | Sitework | 1 | G20. |
| 38 | Asphalt Traffic Signage Striping | Sitework | 1 | G20. |
| 39 | Site Concrete and Site Improvements | Sitework | 1 | G20. |

### Canonical items not in this run

These have no line on MN Test #4, but By Element needs them placed before a job that has
them can show the view.

| Item | Item Name | Proposed Element |
| -- | -- | -- |
| 4 | Precast Concrete Structure | Shell |
| 5 | CMU and Concrete Block Walls | Shell |
| 7a | Structural Steel Framing | Shell |
| 14a | Firestopping | Interiors |
| 19a | Wood Flooring | Interiors |
| 23 | Trash Compactors and Chutes | Services (D10, other conveying) |
| 29 | Plumbing Fixtures | Services |
| 31b | Lighting Fixtures, Furnish Only | Services |
| 31c | Site and Exterior Lighting | Sitework |
| 31d | EV Charging Infrastructure | Services |
| 31e | Solar-Ready Provisions | Services |
| 33 | Erosion and Sedimentation Control | Sitework |
| 35 | Site Drainage and Stormwater | Sitework |
| 36 | Sanitary Sewer, Water Service and Site Utilities | Sitework |

### What approval writes

One migration, once Matt approves the table or his edits to it:

- widens `block_classification`'s element check to the approved names;
- inserts a row for each line above, with its element, its level, Matt as `stated_by`,
  the approval date and a reason naming this document.

No new element has a driver. A driver is the item whose presence brings in supporting
items, and none of these lines does that today, so each new element is a plain group.

## 3. The other model fields

These need no approval of their own, and the PR ships them.

| Field | Where it comes from |
| -- | -- |
| `line.inputs[]` | The engine: what the line's quantity reads, the gates that switch it, the facts its approved judgment rules and its relationship turn on, the unit count for a per-unit trade, and the framing system on items 8 and 17. |
| `line.quantity`, `comparable.unit` | The engine: the quantity the lead rate multiplied by, in that rate's unit, and each figure's own unit. The elevator bulkhead has no quantity, because its figure pairs shafts rather than multiplying one rate. |
| `line.includes[]`, `line.excludes[]` | `line_scope_entries`, a new table. The run carries every entry with its drafter and approver. A published snapshot carries approved entries only, read when publishing. LA-1503 builds the drafting and approval. |
| Breakouts | `block_classification.breakout_of_cost_code`, as before. A breakout's division follows its parent's when it states none, and `subItemsOf` lists a line's breakouts. No breakout row exists yet. |
| `line.raisedBy[]` | The rule in section 1. |
| `line.element` | `block_classification.element`, as before. Unpriced items now carry it too. |
| `line.division` | `block_classification.ledger_division`, a new column, then the stated division, then the canonical item's. The migration files 28a, 28b and 31f under 33 and every Elevator item under 14 (Matt, 2026-10-02). |

A snapshot published before LA-1502 has none of these fields, and the page reads each as
absent.

### Found while building

Site Demolition (item 1) blends a $25,000 lump sum with two ProEst rates of about $3.80
per square foot, and prices the blend as one lump sum. That is how MN Test #4 reaches its
Site Demolition figure. `comparable.unit` now shows the mismatch on the line. Fixing the
blend is a pricing change and is not part of LA-1502.
