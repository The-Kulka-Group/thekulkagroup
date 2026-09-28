# MasterFormat divisions for the canonical work items

Written for LA-1210. Every canonical item in `canonical_work_items`
(`supabase/migrations/20260920140000_rom_spec_decisions_catchup.sql` and later item
splits) and in `docs/precon/canonical-work-items.md`, with a proposed two-digit
MasterFormat division and one line of reasoning. **Every row below is "Proposed, Matt
to confirm" unless it says "Confirmed"** — this file states nothing new, changes no
data, and is not a migration. It exists so the app's own MasterFormat ordering has a
real answer to read once Matt confirms it (see "What this fixes" below), and so any
future data change starts from one list instead of re-deriving it.

## Where the proposed division comes from

`canonical-work-items.md` already files every item under a `## Division NN — Name`
heading, one item's worth of research and sourcing at a time. That heading is this
file's proposed division for every item that has no division stated anywhere else: it
is the judgment call the estimator who built that file already made, reading each
item's real ProEst and Autodesk source codes against MasterFormat, not a fresh guess.
Six items already carry a **confirmed** division, stated by Matt on 2026-09-26 in
`supabase/migrations/20260927160000_demolition_pilot_classification.sql`
(LA-1150, ADR 0006) as real rows on `block_classification`. Those six are marked
Confirmed below and use that stated value, not the heading, since the heading and the
stated fact agree for five of the six and the sixth (36a) is exactly the case a
heading can't settle: see its own row.

## What this fixes

Today, a cost code that is a bare canonical item number ("10", "31f") carries no
division unless `block_classification.division` states one, and almost none do yet.
Reading the item number's own leading digits as a division (the way a benchmark cost
code's digits genuinely are one, as in "09-900") is wrong and was the bug: item 10
(Millwork, Division 06 below) would read as division "10" (Specialties), and item 31f
(Electrical Service Disconnect, Division 26) would read as division "31"
(Earthwork/Sitework). The app no longer does that (LA-1210,
`app/(app)/rom/field-order.ts`'s `divisionFor`); an item-number cost code with nothing
stated now sorts as having no division at all, last, in canonical item order, rather
than in a wrong division. This file is the reference for the data change that replaces
"no division" with the real one, once Matt confirms each row.

## Item 36a: a division the schema does not allow yet

Item 36a, Site Utility Cut and Cap at the Main, is the one item already confirmed to a
division outside `canonical_work_items.masterformat_division`'s own check constraint
(`'02'` through `'32'`, no `'33'`). Division 33, Utilities, is the correct MasterFormat
division for site utility work under the modern (2004+) numbering; the constraint was
written against the frozen 54-item list, which never reached a Division 33 item, and
simply hasn't been widened yet. Widening it is a schema change of its own, a separate
decision from this file.

## The list

54 items were frozen in `canonical-work-items.md` on 2026-09-19; six more (1a, 7a, 8a,
14a, 15a, 16a, 19a, 24a, 24b, 31a-31f, 32a, 34a, 36a) arrived through later splits, each
noted in that file's own amendment log. The table below is every item heading that file
has today, 60 in total.

| Item | Label | Proposed division | Reason |
| --- | --- | --- | --- |
| 1 | Site Demolition | 02 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Site Demolition sits in the Demolition buyout package, MasterFormat division 02. |
| 1a | Structure Demolition | 02 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Structure Demolition sits in the Demolition buyout package, MasterFormat division 02. |
| 2 | Foundations, footings, and slab-on-grade | 03 | Filed under Division 03 (Concrete) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 3 | Elevated slabs and podium deck | 03 | Filed under Division 03 (Concrete) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 3a | Gypcrete topping | 03 | Filed under Division 03 (Concrete) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 4 | Precast concrete structure | 03 | Filed under Division 03 (Concrete) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 5 | CMU / concrete block walls | 04 | Filed under Division 04 (Masonry) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 6 | Brick and masonry veneer | 04 | Filed under Division 04 (Masonry) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 7 | Structural and miscellaneous metals — railings, stairs, canopies | 05 | Filed under Division 05 (Metals) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 7a | Structural steel framing | 05 | Filed under Division 05 (Metals) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 8 | Wood framing | 06 | Filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 8a | Wood stairs and railings | 06 | Filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 9 | Finish carpentry — trim, casing, molding, interior door install | 06 | Filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 10 | Millwork and closet interiors | 06 | Filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 11 | Decking, exterior stairs, and balcony railings | 06 | Filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 12 | Building insulation | 07 | Filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 13 | Roofing, gutters, and roof pavers | 07 | Filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 14 | Siding and exterior wall cladding | 07 | Filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 14a | Firestopping | 07 | Filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 15 | Doors, frames, and hardware — interior, exterior, and entry | 08 | Filed under Division 08 (Openings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 15a | Garage and overhead doors | 08 | Filed under Division 08 (Openings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 16 | Arch. Metal & Glass | 08 | Filed under Division 08 (Openings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 16a | Residential windows | 08 | Filed under Division 08 (Openings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 17 | Metal framing and drywall | 09 | Filed under Division 09 (Finishes) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 18 | Tile and stone | 09 | Filed under Division 09 (Finishes) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 19 | Flooring — resilient and carpet | 09 | Filed under Division 09 (Finishes) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 19a | Wood flooring | 09 | Filed under Division 09 (Finishes) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 20 | Painting | 09 | Filed under Division 09 (Finishes) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 21 | Specialties — protection, accessories, storage, lockers, mailboxes | 10 | Filed under Division 10 (Specialties) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 22 | Residential appliances | 10 | Filed under Division 10 (Specialties) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 23 | Trash compactors and chutes | 10 | Filed under Division 10 (Specialties) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 24 | Cabinetry | 12 | Filed under Division 12 (Furnishings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 24a | Countertops | 12 | Filed under Division 12 (Furnishings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 24b | Window treatments | 12 | Filed under Division 12 (Furnishings) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 25 | Amenity special construction — pools, fitness, sauna | 13 | Filed under Division 13 (Special Construction) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 26 | Elevators | 14 | Filed under Division 14 (Conveying Systems) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 27 | Fire sprinkler system | 21 | Filed under Division 21 (Fire Suppression) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 28 | Plumbing rough-in and piping | 22 | Filed under Division 22 (Plumbing) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 28a | Plumbing Disconnect and Cap | 22 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Plumbing Disconnect and Cap is bought under Plumbing, MasterFormat division 22. |
| 28b | Gas Meter and Service Disconnect | 22 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Gas Meter and Service Disconnect is bought under Plumbing, MasterFormat division 22. |
| 29 | Plumbing fixtures | 22 | Filed under Division 22 (Plumbing) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 30 | HVAC system | 23 | Filed under Division 23 (HVAC) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31 | Electrical system — service, distribution, branch power, installation, generator | 26 | Filed under Division 26 (Electrical) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31a | Low voltage | 26 | Filed under Division 26 (Electrical) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31b | Lighting fixtures, furnish only | 26 | Filed under Division 26 (Electrical) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31c | Site and exterior lighting | 26 | Filed under Division 26 (Electrical) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31d | EV charging infrastructure | 26 | Filed under Division 26 (Electrical) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31e | Solar-ready provisions | 26 | Filed under Division 26 (Electrical) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 31f | Electrical Service Disconnect | 26 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Electrical Service Disconnect is bought under Electrical, MasterFormat division 26. |
| 32 | Fire alarm and nurse call | 28 | Filed under Division 28 (Electronic Safety and Security) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 32a | Emergency responder radio coverage | 28 | Filed under Division 28 (Electronic Safety and Security) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 33 | Erosion and sedimentation control | 31 | Filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 34 | Site work — excavation, backfill, grading, and topsoil | 31 | Filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 34a | Deep foundations, piles, and shoring | 31 | Filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 35 | Site drainage and stormwater | 31 | Filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 36 | Sanitary sewer, water service, and site utilities | 31 | Filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. Proposed, Matt to confirm. Real-world MasterFormat (2004 and later) usually files sanitary, water, and site utility work under Division 33, Utilities, the same fork item 36a already hit; worth checking against item 36a's note before confirming this one. |
| 36a | Site Utility Cut and Cap at the Main | 33 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Site Utility Cut and Cap at the Main is bought under Site Work, MasterFormat division 33 — a division `canonical_work_items.masterformat_division` does not allow yet (its check constraint stops at 32). Storing this one in that table needs a constraint change of its own, a separate decision from this doc. |
| 37 | Landscaping and irrigation | 31 | Filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 38 | Paving and base courses | 32 | Filed under Division 32 (Exterior Improvements) in `canonical-work-items.md`. Proposed, Matt to confirm. |
| 39 | Site concrete, hardscape, and retaining structures | 32 | Filed under Division 32 (Exterior Improvements) in `canonical-work-items.md`. Proposed, Matt to confirm. |

## Out of scope

Turning any "Proposed" row above into a stated fact on `canonical_work_items` or
`block_classification`. No migration and no data change ships with this file; it is
the reference the next ticket reads from once Matt has confirmed or corrected each row.
