# Design Criteria: Trade Reasoning Designs

These six documents are the design passes for the trade tickets that sit on the LA-860
mechanism (`packages/engine/src/derived-assumptions.ts`, `lib/rom/jev.ts`). Each one says
which facts a criterion reads, the one question Jev answers, the arithmetic the code does,
when confidence is high or low, and what Matt still has to decide. None of them changes
pricing. A build ticket follows each once Matt answers its open questions.

| Ticket | Document | Criteria |
| -- | -- | -- |
| LA-774 | `la-774-sprinkler-system.md` | SP-1 Hazard Classification Split, SP-2 Standpipe System Requirement, SP-4 Trash Chute Head Count. Fire pump (SP-3) stays a stated gate. |
| LA-775 | `la-775-plumbing-fixture-units.md` | P-1 Fixture-Unit Sizing |
| LA-776 | `la-776-electrical-service-size.md` | E-1 Electrical Service Size. Needs another pass; see its review note. |
| LA-777 | `la-777-hvac-tonnage.md` | M-0 Window Area and Orientation, M-1 HVAC Tonnage |
| LA-781 | `la-781-insulation.md` | I-1 Thermal Envelope Insulation, I-2 Acoustic Insulation |
| LA-784 | `la-784-elevator-type.md` | V-1 Elevator Type |

## The intake gap all six share

Every ticket assumed the project record already holds facts it does not. The live New
Budget flow (`config/rom/tier1-flow.json`) stores project type, construction kind, gross
square feet, parking type and nine scope questions. It does not store:

| Missing fact | Tickets that need it | What the designs do today |
| -- | -- | -- |
| Stories Above Grade | LA-784, LA-774, LA-775 | Assume a default. LA-774 uses the Elevator answer as a stand-in for height, which is weak: a building can need a standpipe without having an elevator. |
| Unit count and unit mix by bedroom | LA-775, LA-776, LA-777 | Work them out from gross square feet through assumed ratios. LA-776 avoids the multifamily method because of it. |
| Location, and so Climate Zone | LA-777, LA-781 | Assume zone 4A for Long Island. |
| Roof Type | LA-781 | Assume flat. `rom-spec.md` lists it as a gate, but the live flow never asks it. |
| Structure type beyond wood or metal framing | LA-781 | Flag it. Steel frame and mass wall cannot be recorded. |
| Building count | LA-774, LA-775 | Assume one building. |

The tickets forbid new intake questions, so every design marks these facts as assumed
and recalculates when a real value arrives. The result is that most cards would show
low confidence and rest on an assumed fact.

**The decision for Matt.** Stories above grade, unit count and project address are
already planned as project fields in `rom-system-design.md`. Shipping those three as
their own ticket, before any trade build, would turn most of these criteria from
assumed into stated. The alternative is to build the criteria now on assumed defaults
and accept low confidence until the fields arrive.
