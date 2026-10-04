# Scope arrives from answers and relationships

Until now a ROM started from everything. Every benchmarked line for the project type was
priced, and a scope question could only take lines away. The screen showed the whole
budget before a single scope question was answered.

On 2026-09-26 Matt reversed that for the way a budget is built. The budget starts empty.
Each answer brings in the scope it implies, first as a block with no figure and then
priced once there is enough to price it. Some scope exists only because other scope does:
taking a building down means disconnecting its electric, water, gas and site utilities.
That is the relationship idea he has pressed on the block screen since round 1, and this
ADR makes it part of how scope is modelled rather than something drawn on top.

Demolition is the pilot. The other eight scope questions and parking follow the same
pattern, one working session each.

## Answers bring in drivers; relationships bring in supporting items

There are two layers. An answer brings in a **driver**. A **relationship** then makes the
driver bring in its **supporting items**. "Structure Demolition brings in Electrical
Service Disconnect" is one relationship, true whichever question brought Structure
Demolition in, so the same rule covers every path to a driver.

Relationships are rows in a table, each with who stated it, when, and why, on the same
footing as the scope-gate rules in `branch_gate_items`. They never live in the question
file: `config/rom/tier1-flow.json` refuses anything about cost on purpose, and a question
must not be able to add scope quietly either. Matt states every relationship. Nothing
infers one.

A supporting item follows its driver. It is TBD when the driver is TBD, absent when the
driver is absent, and it leaves when the driver leaves.

## Supporting items add to the total

A supporting item is extra work caused by its driver, not part of another trade's rate,
so it adds to the total. That separates it from a breakout, which is carved out of a level
1 lump whose rate already holds it and adds nothing.

The data cannot yet say whether past jobs buried disconnect work inside their demolition
lumps or plumbing allowances. Across the six source files the only disconnect line is
VA's "Disconnect Gas Meter and Pipework", 1 EA at $300, filed under plumbing. That is why
every disconnect starts unpriced rather than priced from one line on one job.

## A block can arrive unpriced

A block whose item has no rate shows "No Rate Yet". It stays out of every total, and the
header and its parent box say how many items are not priced yet. A placeholder figure
would be invented precision.

## The run is unchanged

The live budget in New Budget leaves an unanswered scope question's items off the screen
and out of its total. A run still prices silence as assumed present, as GLOSSARY.md's
Branch gate says. The two never disagree in practice, because New Budget asks every
question before Review, so no run it starts carries silence.

## Structure Demolition prices per square foot of what comes down

On 2026-09-24 Matt set one $/SF basis for every line: the project's total gross area.
Structure Demolition is a deliberate exception. What it costs depends on what stands on
the site, not on what gets built there, so it prices on the square feet of structure
coming down, every floor counted, at a rate set by the structure's type.

The rates are Matt's statement of 2026-09-26. They started as Claude's proposal of
open-shop Long Island ranges for five structure types; Matt reviewed them and stated the
low end plus ten percent as accurate. Each is recorded as a midpoint, and the engine puts
its usual one-source spread around it.

| Structure type | $/SF |
|--|--|
| Wood Frame (Type V) | $6.60 |
| Masonry Bearing Wall with Wood Floors (Type III) | $9.90 |
| Pre-Engineered Metal or Light Steel | $5.50 |
| Steel Frame with Concrete on Metal Deck (Type II) | $13.20 |
| Cast-in-Place Concrete Frame (Type I) | $19.80 |

A structure type of Don't Know shows the full span, from the lowest rate to the highest,
flagged. The rates exclude hazardous material abatement, the disconnects, site
demolition, backfill, permits and the demolition bond.

Site Demolition keeps a lump sum. Only Jefferson's Ferry prices site demolition on its own
line ($25,000); V64's and VA's demolition lumps mix site and building, so using them would
charge the building twice once Structure Demolition is added. Site Demolition prices from
the one line, flagged as thin data.

## Three views of the same lines

ADR 0002 already rolls a ROM up three ways. The screen now shows them: By Scope groups
lines by element, By Package by buyout package, and By Division by MasterFormat division.
New Budget opens on By Scope, because answers bring in drivers and that is the story being
told. A saved ROM opens on By Package, because that is where a number gets defended.

Every view shows every line exactly once and the same total, and a test holds that. The
total stays still while the blocks regroup under it, which is the visible proof that
nothing was counted twice. A supporting item sits inside its element on By Scope and
inside its own package on By Package, where a small mark names its driver on hover. An
item with no package shows in an Unassigned Package block rather than disappearing.

## Considered and rejected

- **Answers bring in every item directly.** "Demolition yes" would list all four
  disconnects itself. Rejected because the same relationship would be restated for every
  path to a driver.
- **Supporting items as breakouts.** Rejected because a breakout adds nothing, and a
  disconnect is cost the job would not otherwise carry.
- **A supporting item shown in both its element and its package, counted in both.**
  Rejected: the total would be wrong.
- **One grouping only.** Grouping by element alone breaks the package as the unit of
  defence (ADR 0002); grouping by package alone hides the relationship at the moment an
  answer creates it.

## Consequences

- The engine needs a second quantity basis: square feet of structure coming down, and a
  per-structure count for the disconnects.
- New canonical items: 1a Structure Demolition, 28a Plumbing Disconnect and Cap, 28b Gas
  Meter and Service Disconnect, 31f Electrical Service Disconnect, and 36a Site Utility
  Cut and Cap at the Main. Item 1 becomes Site Demolition.
- Every item needs a buyout package for By Package to be whole. Until it has one, it
  shows as unassigned.
- The four disconnects price only once Matt states their rates.
