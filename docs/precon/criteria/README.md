# Design Criteria: Trade Reasoning Designs

These six documents are the design passes for the trade tickets that sit on the LA-860
mechanism (`packages/engine/src/derived-assumptions.ts`). Each one says which facts a
criterion reads, the arithmetic the code does, when confidence is high or low, and what
Matt still has to decide.

On 2026-09-28 Matt ruled that the app answers design and engineering questions itself,
through a researched rule, and only pricing questions go to him. Each document was re-cut
under that rule: its engineering questions now have sourced rules, and section 8 lists
only the pricing questions left. Most criteria no longer need Jev at all; code decides
every step, as V-2 does (`lib/rom/jack-criterion.ts`).

| Ticket | Document | Criteria |
| -- | -- | -- |
| LA-774 | `la-774-sprinkler-system.md` | SP-1 Hazard Classification Split, SP-2 Standpipe System Requirement, SP-4 Trash Chute Head Count. Fire pump (SP-3) stays a stated gate. |
| LA-775 | `la-775-plumbing-fixture-units.md` | P-1 Fixture-Unit Sizing |
| LA-776 | `la-776-electrical-service-size.md` | E-1 Electrical Service Size. Built in LA-1281 (`lib/rom/electrical-criterion.ts`): NEC 220.84 per building, shown in amps. Item 31 still prices per square foot until Matt answers the pricing question. |
| LA-777 | `la-777-hvac-tonnage.md` | M-0 Window Area and Orientation, M-1 HVAC Tonnage. Built in LA-1282 (`lib/rom/hvac-criterion.ts`, Climate Zone in `lib/rom/climate-zone.ts`): DOE prototype GSF per ton by zone and band. Item 30 still prices per square foot until Matt answers the pricing question. |
| LA-781 | `la-781-insulation.md` | I-1 Thermal Envelope Insulation, I-2 Acoustic Insulation |
| LA-784 | `la-784-elevator-type.md` | V-1 Elevator Type |
| LA-1265 | `../research/la-hydraulic-jack-type.md` | V-2 Hydraulic Jack Type. Built: in-ground, holeless or roped from travel, wet ground and ZIP, deciding whether item 26i (the well hole) comes in. |
| LA-1269 | `../research/la-elevator-machine-rooms.md` | V-3 Elevator Machine Rooms. Built: one room per building for hydraulic, none for machine-room-less traction; item 26g prices per room. |
| LA-1325 | `la-1325-building-form.md` | A-2 Building Form. Built: bar, L, U or courtyard from the floor plate's corridor length, with stepped wings and 28 ft bays. The Building View draws it; it prices nothing yet. |
| LA-1402 | `la-1402-line-rules.md` | Line Rules: which Allocated Resources lines switch on from the answers and the schedule. |
| LA-1401 | `la-1401-line-quantities.md` | Line Quantities: General Requirements quantities from the project's facts, following C-00379's own heat and power method. A line that lacks a fact stays blank and names it. |

## The intake gap, now mostly closed

When the six designs were first written, the New Budget flow stored no stories, unit
count, building count or location, so every design ran on assumed defaults. The flow now
stores all four (`config/rom/tier1-flow.json`), and Climate Zone comes from the ZIP. What
is still missing:

| Missing fact | Tickets that need it | What the designs do |
| -- | -- | -- |
| Unit mix by bedroom | LA-775, LA-777 | Census 2025 new Northeast multifamily mix, marked assumed. |
| Roof type | LA-781 | Assume a low-slope roof, marked assumed and correctable. |
| Structure type beyond wood or metal framing | LA-781 | The energy code keys on the wall assembly, which the framing field covers. |
| Window area | LA-777 | M-0 picks a glazing band from balconies and storefronts, at low confidence unless they agree. |
