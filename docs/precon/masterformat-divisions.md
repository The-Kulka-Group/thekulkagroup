# MasterFormat divisions for the canonical work items

Written for LA-1210, confirmed by Matt on 2026-09-27 and stored on
`canonical_work_items.masterformat_division` by LA-1214
(`supabase/migrations/20260927240000_canonical_item_divisions.sql`). Every canonical
item in `canonical_work_items` and in `docs/precon/canonical-work-items.md` gets one
MasterFormat division and one line of reasoning below. This file is the reference for
that data, not a second source of truth: read the migration or the table for what
actually shipped.

## Where the division comes from

`canonical-work-items.md` files every item under a `## Division NN — Name` heading, one
item's worth of research and sourcing at a time. That heading is the division for every
item with no other stated source: it is the judgment call the estimator who built that
file already made, reading each item's real ProEst and Autodesk source codes against
MasterFormat, not a fresh guess. Six items already carried a division stated by Matt on
2026-09-26 in `supabase/migrations/20260927160000_demolition_pilot_classification.sql`
(LA-1150, ADR 0006) as rows on `block_classification`; those use that stated value.
Six more items carry a division Matt corrected against the heading on 2026-09-27
(LA-1214): see their own rows below for the reason each one differs.

## What this fixes

A cost code that is a bare canonical item number ("10", "31f") used to carry no
division unless `block_classification.division` stated one, and almost none did.
Reading the item number's own leading digits as a division, the way a benchmark cost
code's digits genuinely are one, as in "09-900", was wrong and was the bug: item 10
(Millwork, Division 06) would read as division "10" (Specialties), and item 31f
(Electrical Service Disconnect, Division 26) would read as division "31"
(Earthwork/Sitework). `app/(app)/rom/field-order.ts`'s `divisionFor` stopped doing that
in LA-1210: an item-number cost code with nothing stated sorted as having no division
at all, last, in canonical item order, rather than in a wrong division. LA-1214 closes
the remaining gap: the ROM screen now reads a real division for a bare item-number cost
code from `canonical_work_items`, so a line only falls back to "no division" when the
item itself has no row there.

## The list

54 items were frozen in `canonical-work-items.md` on 2026-09-19; more arrived through
later splits (1a, 7a, 8a, 14a, 15a, 16a, 19a, 24a, 24b, 31a through 31f, 32a, 34a, 36a),
each noted in that file's own amendment log. The table below is every item heading that
file has today, 60 in total. Five of them (1a, 28a, 28b, 31f, 36a) are not rows in
`canonical_work_items` yet; their division still lives on `block_classification` only,
and LA-1214's migration leaves them out rather than inventing a `sort_order` and
`quantity_driver` for them.

| Item | Label | Division | Reason |
| --- | --- | --- | --- |
| 1 | Site Demolition | 02 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Site Demolition sits in the Demolition buyout package, MasterFormat division 02. |
| 1a | Structure Demolition | 02 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Structure Demolition sits in the Demolition buyout package, MasterFormat division 02. |
| 2 | Foundations, footings, and slab-on-grade | 03 | Confirmed (Matt, 2026-09-27): filed under Division 03 (Concrete) in `canonical-work-items.md`. |
| 3 | Elevated slabs and podium deck | 03 | Confirmed (Matt, 2026-09-27): filed under Division 03 (Concrete) in `canonical-work-items.md`. |
| 3a | Gypcrete topping | 03 | Confirmed (Matt, 2026-09-27): filed under Division 03 (Concrete) in `canonical-work-items.md`. |
| 4 | Precast concrete structure | 03 | Confirmed (Matt, 2026-09-27): filed under Division 03 (Concrete) in `canonical-work-items.md`. |
| 5 | CMU / concrete block walls | 04 | Confirmed (Matt, 2026-09-27): filed under Division 04 (Masonry) in `canonical-work-items.md`. |
| 6 | Brick and masonry veneer | 04 | Confirmed (Matt, 2026-09-27): filed under Division 04 (Masonry) in `canonical-work-items.md`. |
| 7 | Structural and miscellaneous metals — railings, stairs, canopies | 05 | Confirmed (Matt, 2026-09-27): filed under Division 05 (Metals) in `canonical-work-items.md`. |
| 7a | Structural steel framing | 05 | Confirmed (Matt, 2026-09-27): filed under Division 05 (Metals) in `canonical-work-items.md`. |
| 8 | Wood framing | 06 | Confirmed (Matt, 2026-09-27): filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. |
| 8a | Wood stairs and railings | 06 | Confirmed (Matt, 2026-09-27): filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. |
| 9 | Finish carpentry — trim, casing, molding, interior door install | 06 | Confirmed (Matt, 2026-09-27): filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. |
| 10 | Millwork and closet interiors | 06 | Confirmed (Matt, 2026-09-27): filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. |
| 11 | Decking, exterior stairs, and balcony railings | 06 | Confirmed (Matt, 2026-09-27): filed under Division 06 (Wood, Plastics and Composites) in `canonical-work-items.md`. |
| 12 | Building insulation | 07 | Confirmed (Matt, 2026-09-27): filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. |
| 13 | Roofing, gutters, and roof pavers | 07 | Confirmed (Matt, 2026-09-27): filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. |
| 14 | Siding and exterior wall cladding | 07 | Confirmed (Matt, 2026-09-27): filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. |
| 14a | Firestopping | 07 | Confirmed (Matt, 2026-09-27): filed under Division 07 (Thermal and Moisture Protection) in `canonical-work-items.md`. |
| 15 | Doors, frames, and hardware — interior, exterior, and entry | 08 | Confirmed (Matt, 2026-09-27): filed under Division 08 (Openings) in `canonical-work-items.md`. |
| 15a | Garage and overhead doors | 08 | Confirmed (Matt, 2026-09-27): filed under Division 08 (Openings) in `canonical-work-items.md`. |
| 16 | Arch. Metal & Glass | 08 | Confirmed (Matt, 2026-09-27): filed under Division 08 (Openings) in `canonical-work-items.md`. |
| 16a | Residential windows | 08 | Confirmed (Matt, 2026-09-27): filed under Division 08 (Openings) in `canonical-work-items.md`. |
| 17 | Metal framing and drywall | 09 | Confirmed (Matt, 2026-09-27): filed under Division 09 (Finishes) in `canonical-work-items.md`. |
| 18 | Tile and stone | 09 | Confirmed (Matt, 2026-09-27): filed under Division 09 (Finishes) in `canonical-work-items.md`. |
| 19 | Flooring — resilient and carpet | 09 | Confirmed (Matt, 2026-09-27): filed under Division 09 (Finishes) in `canonical-work-items.md`. |
| 19a | Wood flooring | 09 | Confirmed (Matt, 2026-09-27): filed under Division 09 (Finishes) in `canonical-work-items.md`. |
| 20 | Painting | 09 | Confirmed (Matt, 2026-09-27): filed under Division 09 (Finishes) in `canonical-work-items.md`. |
| 21 | Specialties — protection, accessories, storage, lockers, mailboxes | 10 | Confirmed (Matt, 2026-09-27): filed under Division 10 (Specialties) in `canonical-work-items.md`. |
| 22 | Residential appliances | 11 | Confirmed (Matt, 2026-09-27): Division 11, Equipment, not Division 10 (Specialties) as filed in `canonical-work-items.md`. Residential appliances are equipment, not a specialty item. |
| 23 | Trash compactors and chutes | 14 | Confirmed (Matt, 2026-09-27): Division 14, Conveying Systems, not Division 10 (Specialties) as filed in `canonical-work-items.md`. A chute is a conveying system, and a compactor sits at its base. |
| 24 | Cabinetry | 12 | Confirmed (Matt, 2026-09-27): filed under Division 12 (Furnishings) in `canonical-work-items.md`. |
| 24a | Countertops | 12 | Confirmed (Matt, 2026-09-27): filed under Division 12 (Furnishings) in `canonical-work-items.md`. |
| 24b | Window treatments | 12 | Confirmed (Matt, 2026-09-27): filed under Division 12 (Furnishings) in `canonical-work-items.md`. |
| 25 | Amenity special construction — pools, fitness, sauna | 13 | Confirmed (Matt, 2026-09-27): filed under Division 13 (Special Construction) in `canonical-work-items.md`. |
| 26 | Elevators | 14 | Confirmed (Matt, 2026-09-27): filed under Division 14 (Conveying Systems) in `canonical-work-items.md`. |
| 27 | Fire sprinkler system | 21 | Confirmed (Matt, 2026-09-27): filed under Division 21 (Fire Suppression) in `canonical-work-items.md`. |
| 28 | Plumbing rough-in and piping | 22 | Confirmed (Matt, 2026-09-27): filed under Division 22 (Plumbing) in `canonical-work-items.md`. |
| 28a | Plumbing Disconnect and Cap | 22 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Plumbing Disconnect and Cap is bought under Plumbing, MasterFormat division 22. |
| 28b | Gas Meter and Service Disconnect | 22 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Gas Meter and Service Disconnect is bought under Plumbing, MasterFormat division 22. |
| 29 | Plumbing fixtures | 22 | Confirmed (Matt, 2026-09-27): filed under Division 22 (Plumbing) in `canonical-work-items.md`. |
| 30 | HVAC system | 23 | Confirmed (Matt, 2026-09-27): filed under Division 23 (HVAC) in `canonical-work-items.md`. |
| 31 | Electrical system — service, distribution, branch power, installation, generator | 26 | Confirmed (Matt, 2026-09-27): filed under Division 26 (Electrical) in `canonical-work-items.md`. |
| 31a | Low voltage | 27 | Confirmed (Matt, 2026-09-27): Division 27, Communications, not Division 26 (Electrical) as filed in `canonical-work-items.md`. Low voltage systems are communications work, not power distribution. |
| 31b | Lighting fixtures, furnish only | 26 | Confirmed (Matt, 2026-09-27): filed under Division 26 (Electrical) in `canonical-work-items.md`. |
| 31c | Site and exterior lighting | 26 | Confirmed (Matt, 2026-09-27): filed under Division 26 (Electrical) in `canonical-work-items.md`. |
| 31d | EV charging infrastructure | 26 | Confirmed (Matt, 2026-09-27): filed under Division 26 (Electrical) in `canonical-work-items.md`. |
| 31e | Solar-ready provisions | 26 | Confirmed (Matt, 2026-09-27): filed under Division 26 (Electrical) in `canonical-work-items.md`. |
| 31f | Electrical Service Disconnect | 26 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Electrical Service Disconnect is bought under Electrical, MasterFormat division 26. |
| 32 | Fire alarm and nurse call | 28 | Confirmed (Matt, 2026-09-27): filed under Division 28 (Electronic Safety and Security) in `canonical-work-items.md`. |
| 32a | Emergency responder radio coverage | 28 | Confirmed (Matt, 2026-09-27): filed under Division 28 (Electronic Safety and Security) in `canonical-work-items.md`. |
| 33 | Erosion and sedimentation control | 31 | Confirmed (Matt, 2026-09-27): filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. |
| 34 | Site work — excavation, backfill, grading, and topsoil | 31 | Confirmed (Matt, 2026-09-27): filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. |
| 34a | Deep foundations, piles, and shoring | 31 | Confirmed (Matt, 2026-09-27): filed under Division 31 (Earthwork / Sitework) in `canonical-work-items.md`. |
| 35 | Site drainage and stormwater | 33 | Confirmed (Matt, 2026-09-27): Division 33, Utilities, not Division 31 (Earthwork / Sitework) as filed in `canonical-work-items.md`. Stormwater conveyance is utility work under modern (2004 and later) MasterFormat. |
| 36 | Sanitary sewer, water service, and site utilities | 33 | Confirmed (Matt, 2026-09-27): Division 33, Utilities, not Division 31 (Earthwork / Sitework) as filed in `canonical-work-items.md`. Sanitary, water and site utility work file under Division 33 in modern (2004 and later) MasterFormat, the same fork item 36a already settled. |
| 36a | Site Utility Cut and Cap at the Main | 33 | Confirmed (Matt, 2026-09-26, LA-1150/ADR 0006, `block_classification`): Site Utility Cut and Cap at the Main is bought under Site Work, MasterFormat division 33. |
| 37 | Landscaping and irrigation | 32 | Confirmed (Matt, 2026-09-27): Division 32, Exterior Improvements. Already stored on `canonical_work_items` since 2026-09-24 (LA-1015); the item's section in `canonical-work-items.md` moved to sit under the Division 32 heading in the same LA-1214 change that confirmed this table. |
| 38 | Paving and base courses | 32 | Confirmed (Matt, 2026-09-27): filed under Division 32 (Exterior Improvements) in `canonical-work-items.md`. |
| 39 | Site concrete, hardscape, and retaining structures | 32 | Confirmed (Matt, 2026-09-27): filed under Division 32 (Exterior Improvements) in `canonical-work-items.md`. |

## Out of scope

Adding the five items with no row in `canonical_work_items` (1a, 28a, 28b, 31f, 36a) as
real rows there. Their division stays on `block_classification` only, keyed by cost
code, until that is a decision of its own.
