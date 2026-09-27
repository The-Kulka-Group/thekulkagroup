# Canonical work items — approved list

**Status: FROZEN, approved by Matt on 2026-09-19.** This is the canonical work item table
named in ADR 0004, `rom-system-design.md`, and CONTEXT.md's scope-side and contract-side
defaults. Every ProEst code and Autodesk group maps to exactly one of the 50 items below.
Renaming, splitting, or merging an item after this point is a change to the spine itself,
not a review comment, and should reopen a ticket rather than edit this file quietly.

**Amended, 2026-09-19, during LA-720's quantity-driver work:** item 31 split into three.
Low voltage (31a) and the furnish cost of lighting fixtures (31b) came out as their own
items, on Matt's direction, because they are bought and priced separately from the rest
of electrical on a real job even though none of the six source files show that split yet.
Item 31 itself narrowed to service, distribution, branch power, installation labor, and
the generator. A fourth new item, emergency responder radio coverage (32a), split out of
the low-voltage review as licensed, code-triggered work, not a tele/data preference, next
to Fire Alarm rather than next to Low Voltage. Four other candidate splits, video intercom,
access control, CCTV, and cable and satellite backbone, were reviewed and rejected: thin
evidence and low individual dollar risk, the same bar that already kept the emergency
generator out of the gate list. They stay informal sub-scopes of item 31a. See each item's
own note below. Numbering after item 32 is unchanged, letters were used instead of a
renumber so every other item keeps the number already referenced elsewhere.

**Amended, 2026-09-26, LA-1150 (ADR 0006):** item 1 split in two and four supporting items
added, on Matt's direction in the scope-relationship session. Item 1 is now Site
Demolition, a lump sum. Structure Demolition (1a) came out of it and prices per square
foot of structure coming down, by structure type, at rates Matt stated. Structure
Demolition is a driver: it brings in four supporting items, one per structure, each
under the trade that buys it: Plumbing Disconnect and Cap (28a), Gas Meter and Service
Disconnect (28b), Electrical Service Disconnect (31f), and Site Utility Cut and Cap at the
Main (36a). None of the four has a rate yet. Letters again keep every other number in
place. New item names follow Matt's title-case rule for labels; the older headings keep
their form until the label sweep (LA-1148).

Matt resolved every flag raised in review: the shell-framing grouping (item 8), MEP's
dollars-per-GSF basis, the amenity lump-sum basis (items 25 and its V64/VR "Amenity
Allowance" source), the elevator per-stop rate (item 26), the deck-pour/gypcrete split
(items 3 and 3a), West Shore's precast as structure not facade (item 4, "Precast concrete
structure"), VA's $0 cabinet line (item 10, ignored), VR's negative paint line (item 20,
intentional software behavior, not an error), VA's excavation net figure (item 34,
$300,000), and VA's leftover Division 95 lines (item 8's note on shell framing, and the
retail/road/security/pergola lines flagged as decomposition follow-on work for the
importer, not a spine change). The last flag, VA's two balcony deck/railing entries
(item 11), closed by checking the source file directly: different quantities, a 7x gap in
the railing rate, and a distinct "Fifth Floor Balcony" name filed with the job's other
one-off allowances, confirming genuinely separate scope. Everything that was a mechanical
data-handling question (a role-flag or a netting rule already established elsewhere in the
repo) closed on its own in an earlier review pass — see each item's "Closed" note.

LA-720 (quantity driver per canonical item) is unblocked and can start.

Built by reading every row of all six ProEst unit-cost exports in `CostExports/`, using
python3 and openpyxl. File short names used throughout, all citing the `Sheet0` sheet
unless noted:

| Short name | File |
| --- | --- |
| JF | `Estimate_Unit_Costs_2026_09_15_Jeffersons_Ferry_ILNW_Building_1.xlsx` |
| V64 | `Estimate_Unit_Costs_2026_09_15_426_W_Main_Riverhead_-_The_Vue_-_6-4-23_.xlsx` |
| VA | `Estimate_Unit_Costs_2026_09_15_The_Vue_Apartments_-_426_A_Main,_Riverhead_-_Conceptual_budget.xlsx` |
| VR | `Estimate_Unit_Costs_2026_09_15_The_Vue_-_Riverhead_-_Revised_Conceptual_Budget_.xlsx` |
| WS | `Estimate_Unit_Costs_2026_09_15_West_Shore_Rd_Apartments_-_Conceptual_Budget.xlsx` |
| VG | `Estimate_Unit_Costs_2026_09_15_The_Villa_at_Glen_Cove_50%_CD_Budget.xlsx` |

## Summary

**54 canonical work items across 19 MasterFormat divisions** (02, 03, 04, 05, 06, 07, 08,
09, 10, 12, 13, 14, 21, 22, 23, 26, 28, 31, 32), recounted 2026-09-20; this line had
drifted stale across several rounds of item splits since the freeze. Items 22 and 23
carry Division 11 Equipment codes in the source files but sit under the Division 10
heading below, grouped with Specialties rather than broken out under their own division
heading. Division 01 General Requirements has no line-item data in any file — see the
flag under "Markups, not line items" below.

### What a reviewer most needs to sanity-check

1. **The Villa at Glen Cove is priced almost entirely as wall area, not real scope.**
   $50.18M of its $50.69M base cost (99%) is thirteen rows of "Area (Perimeter × Height)"
   at a flat $250 per square foot. That single number stands in for foundations, framing,
   envelope, and finishes combined. It cannot be split among canonical items 2 through 20
   without guessing, so it is left out of every canonical item's source list below and
   called out on its own. This matches Matt's existing ruling in `rom-system-design.md`
   that Villa is a deliberate estimator shortcut, weighted low, and never used for a
   dollars-per-gross-square-foot benchmark.

2. **The "shell framing package" (item 8) is the single biggest mapping judgment call in
   this file.** Wood framing (Division 06), cold-formed metal framing (Division 05),
   sheathing (Division 07), and drywall install (Division 09) are priced as separate
   ProEst codes but, per `jeffersons-ferry-scope-comparison.md`, often buy out as one
   subcontract. This draft keeps them as one canonical item with a cross-division flag
   rather than four separate items.
   **Resolved (Matt, 2026-09-18): typically yes, this buys out as one subcontract. The
   grouping stands as drafted.**

3. **MEP is priced as a flat rate per gross square foot on four of six jobs, and the rate
   varies two to three times over between jobs with no other basis given.** Fire
   sprinkler runs $3.30 to $11.00 per SF, HVAC $18 to $30 per SF, electrical $22 to $28
   per SF, across JF, V64, VA, and VR. `jeffersons-ferry-scope-comparison.md` already
   found these are the worst-performing rates against actual buyout on the one job with a
   closed number.
   **Resolved (Matt, 2026-09-18): dollars per gross square foot stands as the basis for
   now.** The accuracy concern above is not eliminated by this decision, it is accepted
   as a known limitation until more closed jobs sharpen the rate. LA-720 should still
   record this as the chosen driver, not silently assume it.

4. **Two division-drift cases beyond what the existing docs already name.** West Shore
   files new masonry veneer under a code literally named "04.01000 MASONRY RESTORATION,"
   and West Shore files all its sewer, water, and drainage scope at Division 33 while
   every other file with that scope uses Division 31. Both are confirmed in the raw data
   and neither is in the ADR 0004 or `rom-system-design.md` drift list yet.

5. **Elevators are not just a code problem (14.02000 vs 14.21001, already documented).**
   The per-unit rate itself spans an order of magnitude: about $33,000 per stop at VA,
   about $106,000 to $190,000 per elevator at JF and VR, and $271,858 per elevator at West
   Shore. That may be a real spec difference (capacity, speed, hydraulic vs traction), not
   an estimating error, and the canonical item as drafted below cannot tell the two apart.

### Markups, not line items

General Conditions, General Requirements, Design/Budget Contingency, Insurance, and Fee
are not canonical work items under this file's scope — CONTEXT.md and `rom-system-design.md`
place them in the `markups` table, not the canonical work item list. They are noted here
only because the task asked this draft to verify the known GC/GR-combination problem
against the actual files:

- JF, V64, VA, and VR each carry a single **combined** "General Conditions & General
  Requirements" (or, on VA, "General Conditions" alone) line on the `Summary` sheet, at
  7% to 8% of base cost. None of them isolates a Division 01 General Requirements dollar
  figure anywhere in the line items.
- WS: 8% combined, `Summary` r5.
- VG (Villa) is the only file that splits them: General Conditions $3,993,224 and General
  Requirements $1,334,605, `Summary` r5–r6 — confirming the 75/25-ish split
  `rom-system-design.md` already flags as one job's number, not a default ratio.

No canonical work item below carries General Requirements cost, because no file gives it
a separable number. This is the same import problem the design doc already names; this
draft just confirms it against the source files rather than re-deriving it.

## Quantity drivers (LA-720)

Decided 2026-09-20. One driver per item, following the same rule that already held for
parking (LA-682) and unit-to-GSF (LA-678): the single quantity it scales with when a
project's basics change after first pass, checked against the six files rather than
assumed. Full rationale sits with each item below, under its own "Quantity driver" line.
Three items, 7, 9, and 21, carry one dominant driver at the item level with a real second
unit inside a named sub-container, noted there rather than split at the item level, the
same treatment already applied to fire sprinkler's standpipe and fire pump containers.
Two items, 28 and 29, are genuine two-way splits, plumbing's bath-versus-kitchen fork,
decided by Matt on 2026-09-19 before this pass and carried forward unchanged here.

| # | Item | Driver |
| --- | --- | --- |
| 1 | Demolition | Fixed lump sum |
| 2 | Foundations, footings, slab-on-grade | Gross square feet |
| 3 | Elevated slabs and podium deck | Gross square feet |
| 3a | Gypcrete topping | Gross square feet |
| 4 | Precast concrete structure | Gross square feet |
| 5 | CMU / concrete block walls | SF of rated wall area |
| 6 | Brick and masonry veneer | SF of veneer area |
| 7 | Structural and misc. metals | LF of railing/guardrail run |
| 7a | Structural steel framing | Gross square feet |
| 8 | Wood framing | Gross square feet |
| 8a | Wood stairs and railings | EA, stair count per building |
| 9 | Finish carpentry | Unit count (door install) / LF (trim) |
| 10 | Millwork and closet interiors | LF of closet/cabinet run |
| 11 | Decking, exterior stairs, balcony rail | SF of deck/balcony area |
| 12 | Building insulation | Gross square feet |
| 13 | Roofing, gutters, roof pavers | Gross square feet |
| 14 | Siding and exterior wall cladding | Gross square feet |
| 14a | Firestopping | EA per rated-wall/floor penetration |
| 15 | Doors, frames, and hardware | Unit count |
| 15a | Garage and overhead doors | EA, garage-bay count |
| 16 | Arch. Metal & Glass | SF of storefront/curtain wall glazing |
| 16a | Residential windows | EA, window opening count |
| 17 | Metal framing and drywall | Gross square feet |
| 18 | Tile and stone | Bathroom count |
| 19 | Flooring — resilient and carpet | Gross square feet |
| 19a | Wood flooring | Gross square feet |
| 20 | Painting | Gross square feet |
| 21 | Specialties | Bathroom count |
| 22 | Residential appliances | Unit count |
| 23 | Trash compactors and chutes | EA per building |
| 24 | Cabinetry | Unit count |
| 24a | Countertops | SF of countertop area |
| 24b | Window treatments | Unit count |
| 25 | Amenity special construction | Fixed lump sum |
| 26 | Elevators | Per stop |
| 27 | Fire sprinkler system | Gross square feet |
| 28 | Plumbing rough-in and piping | Bathroom count / unit count, split |
| 29 | Plumbing fixtures | Bathroom count / unit count, split |
| 30 | HVAC system | Gross square feet |
| 31 | Electrical system | Gross square feet |
| 31a | Low voltage | Gross square feet |
| 31b | Lighting fixtures, furnish only | Unit count |
| 31c | Site and exterior lighting | EA per pole/fixture |
| 31d | EV charging infrastructure | EA per EV-capable stall |
| 31e | Solar-ready provisions | Gross square feet |
| 32 | Fire alarm and nurse call | Gross square feet |
| 32a | Emergency responder radio coverage | Gross square feet |
| 33 | Erosion and sedimentation control | LF of site perimeter |
| 34 | Site work: excavation, backfill, grading, topsoil | CY of excavated volume (open, see item 34) |
| 34a | Deep foundations, piles, shoring | Fixed lump sum |
| 35 | Site drainage and stormwater | Fixed lump sum |
| 36 | Sanitary sewer, water, site utilities | Fixed lump sum |
| 37 | Landscaping and irrigation | SF of disturbed site area |
| 38 | Paving and base courses | SF of paved area |
| 39 | Site concrete, hardscape, retaining | SF of hardscape/paver area |

Six drivers, demolition (1), amenity special construction (25), site drainage (35),
sanitary/water/site utilities (36), plus 28 and 29's non-GSF halves, are deliberately not
gross square feet even though GSF is the ROM's best-populated intake fact, because the
evidence says the real cost doesn't move with building size: demolition and the two site
utility items are dominated by flat LS/ALLW lines across every file that prices them,
existing-site and utility-run conditions, not the new building, and amenity space is a
program choice, not an area ratio, the same reasoning already settled for it on
2026-09-18. Twenty-three drivers are measured quantities, LF, SF-of-a-named-surface, CY,
EA, per stop, rather than GSF or unit count directly, because that's the real quantity a
trade quotes against; each converts to GSF or unit count only through a further benchmark
ratio (a wall-area-to-GSF ratio, a stalls-to-unit-count ratio) that is a benchmark-quality
question, not a driver-identity one, and stays open rather than assumed here.

---

## Division 02 — Existing Conditions

### 1. Site Demolition

**Renamed 2026-09-26 (LA-1150, ADR 0006).** This was "Demolition, site and structure".
Building demolition moved to item 1a; this item keeps site clearing and site demolition
as a lump sum. It prices from JF's "Site Demolition" $25,000 line alone, flagged as thin
data, because V64's and VA's lumps mix site and building work and would charge the
building twice once 1a is added. Brought in by a "yes" to "Is there anything on the site
to demolish?". The history below is the combined item's, kept as it was written.

Site clearing/demolition and building demolition, combined into one canonical item
because most files price them as a single lump sum and only one file (JF) prices
building demolition separately with a real quantity.

**Sources:**
- JF: "Site Demolition" 1.00 LS $25,000 (r4, code 02.04113); "Building demolition"
  151,186 CF $1.00/CF = $151,186 plus "Building demolition - Misc hand work" 151,186 CF
  $0.32/CF = $48,380 (r7–r8, code 02.04116). Total $224,566.
- V64: "Building Demo, Site Demo, Strip and stockpile Topsoil" 1.00 LS $130,000 (r4, code
  02.04113).
- VA: "Site Demolition" 1.00 LS $130,000 (r4, code **02.00050**); also "Remove and
  Dispose of Existing Asphalt" 1,257.09 SF $2.00/SF = $2,514 filed separately under
  **31.00050 Site Demolition** (r254) and "Clear And Grub - Heavy Per Acre" 2.11 ACRE
  $6,000 = $12,660 (r257, code 31.01000).
- VR: same line as V64 but zeroed, $0 (r9).
- WS, VG: no demolition line.

**Unit/quantity signal:** mostly LS (one number for the whole job); JF is the only file
with a real quantity (CF, building volume). VA's asphalt-removal line scales with SF of
existing pavement. Clearing scales with site ACRE.

**Quantity driver (LA-720, 2026-09-20): fixed lump sum.** Five of six files price this as
one flat number regardless of building size; JF's real CF quantity is specific to the one
existing structure being removed on that site, not a ratio the new building's own GSF
predicts. What has to come down depends on what's already on the site, not on what gets
built there.

**Flags:**
- Code drift confirmed exactly as `rom-system-design.md` names it: demolition lands at
  02.04113 (JF, V64), 02.00050 (VA), and 31.00050 (VA's own asphalt-removal sub-line).
  One file uses two different demolition codes for two different demolition scopes.
- `jeffersons-ferry-scope-comparison.md` already shows JF's $224,566 demolition figure
  came in 154% over the actual bought-out and closed cost of $88,500. The CF-based unit
  rate is the named cause. Any future demolition benchmark should weight JF's rate low
  for the same reason.

### 1a. Structure Demolition

Split from item 1 on 2026-09-26 (LA-1150, ADR 0006). Taking down an existing structure:
mechanical demolition of the structure, its slab-on-grade and its footings, loading,
trucking, and C&D disposal. It excludes hazardous material survey and abatement, the
utility disconnects (28a, 28b, 31f, 36a), site demolition (item 1), backfill, permits and
the demolition bond.

**Brought in by:** a count of one or more for "How many structures come down?", asked
after a "yes" to "Is there anything on the site to demolish?". That count also opens the
two questions this item prices on: the square feet of structure coming down, every floor
counted, and the structure type.

**Quantity driver: square feet of structure coming down, by structure type.** A deliberate
exception to the one $/SF-of-gross-area basis Matt set on 2026-09-24, because the cost
depends on what stands on the site, not on what gets built. The rates are Matt's statement
of 2026-09-26, recorded as midpoints; the engine puts its one-source spread around each.

| Structure type | $/SF |
|--|--|
| Wood Frame (Type V) | $6.60 |
| Masonry Bearing Wall with Wood Floors (Type III) | $9.90 |
| Pre-Engineered Metal or Light Steel | $5.50 |
| Steel Frame with Concrete on Metal Deck (Type II) | $13.20 |
| Cast-in-Place Concrete Frame (Type I) | $19.80 |

The rates began as Claude's proposal of open-shop Long Island ranges; Matt reviewed them
and stated the low end plus ten percent as accurate. A structure type of Don't Know shows
the full span, $5.50 to $19.80, flagged.

**Driver of:** 28a, 28b, 31f and 36a, one of each per structure.

**Element:** Demolition. **Buyout package:** Demolition. **Division:** 02.

**Sources:** JF's building demolition (151,186 CF, closed at $88,500 including a $28,500
steel demolition change order) is the only real quantity in the six files, and it cannot
convert to $/SF without the building's height, which no file records.

---

## Division 03 — Concrete

### 2. Foundations, footings, and slab-on-grade

**Sources:**
- JF: "Cast-In-Place Concrete - Foundations" 74.75 CY $650 (r13); "- SOG" 100.69 CY $650
  (r14); "- Footings" 89.51 CY $650 (r15); "Pump Truck" 1.00 EA $1,800 (r16).
- WS: "Cast-In-Place Concrete" 327.15 CY $650 (r10); "Pump Truck" 4.00 EA $1,800 (r11).
- V64: "Cast-In-Place Concrete - Slab" 511.27 CY $750 (r9); "Continuous Footing" 86.58 CY
  $750 (r10); "Continuous Footing - Wall" 72.51 CY $750 (r11); "Pump Truck" 3.00 EA $1,800
  (r12).
- VA: "Foundation" 1.00 LS $1,956,150 (r9); "Flatwork" 1.00 LS $695,737 (r10).
- VR: "Continuous Footing - Wall" 72.51 CY $650 (r16); rest zeroed.
- VG: no dedicated foundation line (wall-area pricing covers this — see the top-level flag).

**Unit/quantity signal:** CY on four of five priced files (JF, WS, V64, VR), scaling with
foundation/slab volume. VA is the one file that prices this as two lump sums instead —
worth asking whether VA's LS figures were ever broken into a CY-equivalent rate for
comparison.

**Quantity driver (LA-720, 2026-09-20): gross square feet.** CY is the real trade
quantity on four of five files, but CY isn't a fact the ROM's own intake captures, GSF
is; concrete volume converts from GSF through a footprint-and-depth benchmark ratio, the
same shape as container 2's own Slab-on-Grade fact, already gated off Parking Type rather
than asked outright.

**Containers (Matt, 2026-09-20).** Items 2 and 3 together make up one subcontractor's
scope, cast-in-place concrete start to finish, priced through six containers. Gypcrete,
item 3a, stays its own item, not a container here.

1. **Footings and Foundation Walls.** Required. The CY lines above.
2. **Slab-on-Grade.** Conditional. Real CY at JF and V64 (as "Cast-In-Place Concrete -
   Slab"/"- SOG"); zeroed out entirely on VR's revised budget, which is a podium building
   with no true slab at grade, not missing data. Likely derivable from Parking Type
   (structured or underground parking implies a podium, implies no slab-on-grade) rather
   than needing its own question — unconfirmed, worth checking against Kulka's own jobs.
3. **Elevated Slabs and Podium Deck.** Item 3 below. Conditional, the other side of the
   Slab-on-Grade fact.
4. **Foundation Waterproofing.** VA prices "Foundation Waterproofing" $110,000 ALLW and
   "Slab Vapor Barrier Upgrade" 40,894 SF $5.00 = $204,470 (r77, r80), both filed under
   Division 07 rather than Division 03. Real foundation-scope work sitting under a
   different division's code — a breakout, not an add-on, the same shape as the elevator
   wiring and pit sump breakouts elsewhere on this list. Confirmed (Matt, 2026-09-20): the
   vapor barrier is laid by the concrete crew before the pour, not installed afterward by
   an insulation sub, so it belongs here rather than in item 12.
   **Expanded (Matt, 2026-09-20), checked against foundation waterproofing code
   requirements before proposing.** VA's one lump sum flattens a real code fork and
   several real sub-components, none of which any file separates.
   - **Dampproofing, Code Minimum.** Required on every foundation wall regardless of
     site conditions, the baseline the code requires everywhere.
   - **Waterproofing Membrane, Hydrostatic Pressure Condition.** Conditional, gated by
     the existing Site Conditions gate, groundwater. A more robust membrane system that
     replaces dampproofing, not an upgrade layered on top of it, required specifically
     where a high water table creates hydrostatic pressure against the wall.
   - **Perimeter Footing Drain.** Required wherever there's a below-grade foundation,
     paired with either dampproofing or waterproofing above.
   - **Drainage Board or Sheet Drain.** Conditional, same groundwater gate as the
     membrane. Relieves hydrostatic pressure and channels water to the footing drain.
   - **Foundation Drainage Sump Pit and Pump.** Conditional, same groundwater gate.
     Collects and discharges groundwater. Distinct from item 28's sewage ejector sump,
     a genuinely different system handling a different kind of water, worth keeping
     separate rather than conflating the two just because both are called "sump."
   - **Slab Vapor Barrier.** Real evidence above, VA's $204,470 line.
   - **Exterior Stair Areaway Drain, added (Matt, 2026-09-20), cross-checked against
     doors, windows, and elevators before proposing.** Conditional, wherever an exterior
     stair descends below grade to an entry, parking garage pedestrian access or a
     basement-level door. Its own point-source drain, tied to a sealed sump pit or
     positive gravity discharge, a real code-driven detail distinct from every other
     drainage item on this list: not the continuous perimeter footing drain above, not
     item 26's elevator pit sump, and not item 28's sewage ejector sump. A fifth system,
     item 27's fire pump room flood protection, joined this list on the same day. Five
     real systems on this document now share the word "sump" or "drain"; worth keeping
     them named separately rather than letting one stand in for all of them. Zero
     evidence in any file.
5. **Equipment Pads and Misc. Concrete.** Required. Housekeeping pads for mechanical and
   electrical equipment, dumpster pads, stoops. No file has a line for this at all; unlike
   the containers above, this one starts with zero evidence, proposed only because a
   concrete sub always carries some of this scope on a real job.
6. **Concrete Infill for Steel Pan Stairs.** Required wherever the building uses steel pan
   stairs rather than precast or poured stairs. No file separates this out.
   **Researched (Matt, 2026-09-20), checked against steel pan stair trade practice
   before resolving.** The fill is standard practice for the concrete sub or GC's own
   forces, not the steel fabricator's scope; one industry source calls this handoff "the
   single most common scope gap on pan stair packages." That means JF's "Metal Pan
   Stairs" line under item 7 (r39, $6,500 EA), the fabricator's own price, almost
   certainly doesn't include the fill — this reads as a likely undercount, not an even
   double-count risk, and the infill should be priced as its own real line whenever a
   quote comes in for either item. **Abrasive Nosing Strips**, a slip-resistant insert
   embedded at the tread edge when the pan is poured, likely also missing — standard on
   commercial concrete-filled pan stairs and usually its own material and labor line,
   distinct from the fill itself, based on general trade knowledge rather than a source
   this specific search confirmed directly.
   **Cross-checked against remaining trades (Matt, 2026-09-20), two more findings, one
   of them jurisdiction-dependent.** The nosing strip above needs to do double duty and
   should be confirmed as such, not assumed: federal ADA treats a visually contrasting
   nosing stripe as recommended, not mandatory, but California's Title 24 and comparable
   state-level codes make it a hard requirement, 2 to 4 inches wide, a contrasting color
   from the tread itself. Whether Kulka's own jurisdictions require it needs a real
   answer, not an assumption either way, and if they do, the nosing strip spec'd needs
   to satisfy both slip resistance and visual contrast in one product, not treated as two
   separate line items. Separately, and distinct from the nosing itself: a full tread and
   riser covering, commonly rubber, is standard practice on concrete pan stairs
   specifically because they see months of construction foot and equipment traffic
   before the building is finished, protecting the fill and nosing from damage. That's
   real scope belonging to item 19, Flooring, not this item, cross-referenced here rather
   than priced twice.
   **One more cross-check against all other trades (Matt, 2026-09-20).** Where item 7's
   railing posts land on the concrete-filled tread, the anchor method is a genuine
   design and sequencing decision, not a fixed detail: either a sleeve or core-drilled
   pocket embedded in the concrete during the pour, which means the concrete and
   railing subs have to coordinate on placement before the pour happens, or a
   surface-mounted base plate installed after the concrete cures, which lets the
   railing sub work independently. On an exterior stair specifically, this reconnects
   to the same concern already flagged on item 11's balconies: a surface-mounted base
   exists in part to keep the post's steel out of the wet zone, the embedment method
   puts it in direct, harder-to-inspect contact with the concrete. Neither method is
   priced or specified in any file.
7. **Construction Joint Waterstops.** Likely missing, added (Matt, 2026-09-20). Any
   below-grade or podium concrete pour done in stages needs a waterstop, a PVC or rubber
   strip embedded across the joint, to stop water migrating through the cold joint
   itself, distinct from the wall's exterior waterproofing membrane in container 4,
   since that membrane doesn't reach the interior of a joint the wall was poured in two
   pieces around. Zero evidence anywhere.
8. **Foundation Wall Pipe Penetration Seals.** Likely missing. Every sanitary, water, or
   electrical conduit that passes through a foundation wall needs its own seal, typically
   a mechanical wall sleeve and link seal, at the exact point the pipe crosses the
   waterproofing plane. A distinct, small detail from both the wall's general membrane
   and item 36's manhole and pipe joint sealing, which is the site side of the same
   pipe run, not the building wall side. Zero evidence anywhere.

### 3. Elevated slabs and podium deck

**Sources:**
- JF: "Cast-In-Place Concrete - on Deck" 18,000 SF $10.00 (r17, code 03.00000). $180,000.
- VA: "L2 Podium, 12" avg assumed" 1.00 LS $1,395,525 (r11).
- WS, V64, VR, VG: no equivalent line.

**Unit/quantity signal:** SF at JF, scaling with deck area; LS at VA.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on Parking Type =
structured or underground.** JF prices this directly at a $/SF deck rate; VA's LS figure
is a real quantity note, "12" avg assumed," describing slab thickness over a known deck
area, not evidence against GSF as the driver.

**Resolved (Matt, 2026-09-18): the deck pour is concrete's scope, gypcrete is not.**
Gypcrete is bought out as its own separate subcontract, not part of concrete and not part
of framing. It no longer belongs in this canonical item; see item 3a below, split out on
that basis. This also answers Flag M1 for the deck pour half: it stays with concrete.

**Container added (Matt, 2026-09-20), checked against building envelope waterproofing
categories before proposing:**

**Podium Waterproofing Membrane.** Likely missing, and this is a real gap, not just a
proposed line. A podium deck functions as both a floor and a roof, it sits over occupied
or parked space below, and the trade treats it as critical to waterproof, its own
traffic-bearing membrane system, heavier-duty than a standard roof membrane. VA's
"L2 Podium, 12" avg assumed" describes slab thickness, concrete volume, not a
waterproofing system, and nothing else in this file or any other prices one.

**Garage-level waterproofing, checked separately (Matt, 2026-09-20), because a parking
level itself needs a genuinely different product from the pedestrian podium membrane
above it, not the same line at a different height.**

**Vehicular Traffic Coating.** Likely missing, on any exposed or upper parking level.
A durable, skid-resistant polymeric coating rated for vehicle traffic, distinct from
the pedestrian-rated podium membrane above, and distinct from the structural slab
itself. Upper parking levels exposed to weather have zero protection without it. Zero
evidence in any file.

**Expansion and Control Joint Sealant Systems.** Likely missing. Parking structures
need real movement joints given their size and traffic load, and a proper joint here is
a watertight, traffic-durable, joint-face-adhered system, not a simple bead of caulk,
a real and often sizable line item on its own. Control joints for shrinkage cracking
need a lighter sealant by comparison. Neither is priced in any file.

### 3a. Gypcrete topping

Split from item 3 once gypcrete was confirmed as its own subcontract, not part of the
concrete deck pour or the framing package.

**Sources:**
- JF: "Gypcrete 3000psi" 15,200 SF $4.50 (r20, code 03.05300). $68,400.
- V64, VA, VR, WS, VG: no dedicated gypcrete line found under Division 03; may be buried
  in another line on those files and needs a pass to confirm.

**Unit/quantity signal:** SF, scaling with floor area receiving the topping.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on Structure Type
= wood-framed.** JF's rate is a direct $/SF figure; the item's own note below already
ties presence of this scope to Structure Type, not to a separate quantity question.

**Note (Matt, 2026-09-20): kept as its own item, not folded into Concrete's containers.**
Likely derivable from Structure Type rather than needing its own question — gypcrete is
close to universal over wood-framed floors for sound separation between units, and close
to absent over concrete or steel structures. Unconfirmed against Kulka's own jobs.

### 4. Precast concrete structure

**Sources:**
- WS: "Precast Panel" 90,553.45 SF $31.81 = $2,880,505 (r14, code 03.03400). This one line
  is 43% of West Shore's entire base cost.
- No other file has a precast concrete line.

**Unit/quantity signal:** SF, scaling with building floor area, not facade area.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on Structure Type
= precast.** West Shore's own rate is already a direct $/SF-of-floor-area figure, per the
signal above, not a facade-area rate, so no conversion is needed beyond the structure
type gate itself.

**Resolved (Matt, 2026-09-18): this is structural, not facade cladding.** West Shore uses
precast concrete slabs for the structure everywhere except the foundation, which is
poured in place. Renamed from "Precast concrete panels" to "Precast concrete structure"
to reflect this. West Shore is a different structural system from the other five jobs
(which frame in wood and cold-formed metal, item 8), not a comparable line item, so this
stays its own canonical item rather than merging with item 8 or with any facade item.

---

## Division 04 — Masonry

### 5. CMU / concrete block walls

**Sources:**
- JF: "CMU Block (Plan View) - Fire Separation Wall" at 1st, 2nd, 3rd floor, 1,446.14 /
  2,534.65 / 1,268.93 BLOCK at $30.00 (r25–r27, code 04.01000). Total $157,492.
- V64: "2hr rated CMU" 11,015.20 SF $26.00 (r20, code 04.02200).
- VA: "CMU Block (Plan View)" 12,357.22 BLOCK $30.00 (r16); "2hr rated CMU (Plan View)"
  6,257.20 BLOCK $30.00 (r17, code 04.01000); "8" CMU Wall - Breakout for underground
  level" 2,640.00 SF $26.00 = $68,640 (r20) immediately followed by "8" CMU Wall -
  DEDUCT Breakout for underground level" 2,640.00 SF **-$26.00** = **-$68,640** (r21),
  then "8" CMU Wall" 12,753.60 SF $26.00 (r22, code 04.02200).
- WS, VR, VG: no CMU line.

**Unit/quantity signal:** BLOCK or SF depending on file, scaling with wall area.

**Quantity driver (LA-720, 2026-09-20): SF of rated/CMU wall area, not gross square
feet.** Wall area here depends on how many fire-separation and shaft walls a layout
actually has, a function of corridor and unit-demising design, not building footprint
alone, so it doesn't scale cleanly with GSF the way a floor-area item does. This is also
exactly why the CMU-versus-gypsum-shaft-wall gate above matters: once it exists, this
driver splits by construction method rather than staying one blended SF rate.

**Flag:** VA's paired add/deduct lines (r20–r21) net to zero and exist only to isolate a
sub-scope for internal takeoff purposes. They should be role-flagged `takeoff_helper`,
not counted as real scope, or they will double the CMU total if summed naively.
**Closed:** role `takeoff_helper` per CONTEXT.md's existing line-role taxonomy. No new
decision needed, the convention already covers this case.

**Steel Lintels Over Masonry Openings, added (Matt, 2026-09-20), checked against NCMA
trade practice before proposing.** Every door, window, and mechanical louver opening in
a CMU wall needs something to carry the block above it, a steel angle lintel on most
openings, a precast or reinforced CMU bond-beam lintel on wider spans. This is standard
masonry-trade scope, priced and installed by the mason, not the steel fabricator in item
7 or the door and window trades in items 15 and 16a. None of the six files isolate a
lintel line anywhere; on the two jobs with real CMU evidence (JF, VA) it most likely
sits buried inside the blended per-BLOCK or per-SF rate above, unconfirmed either way.

**Stair and Elevator Shaft Wall Construction, added (Matt, 2026-09-20), the real gap
Matt flagged reviewing this item.** JF's and VA's "Fire Separation Wall" and "2hr rated
CMU" lines above are filed as one undifferentiated wall-area quantity, with no way to
tell how much of that area is actually the rated shaft enclosure around a stair or
elevator versus a corridor or unit demising wall priced at the same 2-hour rating. CMU
is one real way to build that shaft; the other, at least as common at this scale of
building, is a lightweight gypsum shaft wall system, shaft liner panel in a steel-stud
track, built by the drywall sub rather than the mason, and neither item 17 nor anywhere
else on this list prices that alternative today. This needs the same kind of
construction-method gate already used elsewhere in `rom-spec.md` (Roof Type, Structure
Type), CMU shaft versus gypsum shaft wall, before either side of it can be benchmarked,
and right now it can't even be told apart from the rest of this item's number.

### 6. Brick and masonry veneer

**Sources:**
- V64: "Full-Brick Veneer (Plan View)" 6,399.25 SF $17.00 (r17, code 04.01000).
- VA: "Full-Brick Veneer" 6,108.99 SF $17.00 (r25, code **04.05710 Brick**, its own
  sub-code separate from CMU).
- WS: "Full-Brick Veneer" 15,927.05 SF $28.00 (r19) — but filed under code
  **"04.01000 MASONRY RESTORATION."**
- JF, VR, VG: no brick veneer line.

**Unit/quantity signal:** SF, scaling with wall/elevation area.

**Quantity driver (LA-720, 2026-09-20): SF of veneer/elevation area.** Which walls carry
brick versus siding is a facade-design choice, not a fact GSF or unit count predicts,
consistent with V64 and VA both pricing this per SF of actual veneer coverage rather than
as a building-wide allowance.

**Flag — new, not previously named in ADR 0004 or `rom-system-design.md`:** West Shore's
brick veneer is new-construction cladding, not restoration work, but it is filed under a
code whose own name says "Masonry Restoration." This is a code/description mismatch
worth adding to the known-drift list alongside the demolition and elevator cases the
docs already track.
**Closed:** finding stands as documentation, added to the drift list. No decision is
pending on it, since the canonical item mapping (item 6) already reads past the code
name to the description.

**Through-Wall Flashing and Weep Holes, added (Matt, 2026-09-20), checked against
brick veneer code requirements before proposing.** Code requires flashing at the base
of every brick veneer wall, above and below every opening, at shelf angles and lintels,
at the tops of walls, and beneath coping, paired with weep holes spaced every 24 inches
directly above each flashing line. The air gap behind the brick, the flashing, and the
weep holes have to all work together, and a documented, subtle, common defect is
installing the weeps one or two courses above the flashing rather than right at it,
which defeats the whole system even though every component is technically present.
None of the three files with real brick veneer evidence mention any of it.

---

## Division 05 — Metals

### 7. Structural and miscellaneous metals — railings, stairs, canopies

**Sources:**
- JF: "1-1/2" Pipe Handrail" 102.14 LF $150 (r32, code 05.03200); "Metal Pan Stairs - 4'
  Wide" 4.00 EA $6,500 (r39, code 05.05100).
- V64: "Juliet Rail - Aluminum Guard Rail" 419.52 LF $225 (r25).
- VA: "Juliet Rail - Aluminum Guard Rail" 824.26 LF $225 (r30); "Misc. Metals Allowance"
  1.00 LS $250,000 (r33, code 05.07620); "Uni-Structure Canopy" 1.00 EA $2,124 (r34).
- VR: same Juliet rail line as V64, zeroed (r30).
- WS, VG: no line.

**Unit/quantity signal:** LF for railings (scales with balcony/deck perimeter), EA for
stairs and canopies, one LS allowance at VA.

**Quantity driver (LA-720, 2026-09-20): LF of railing/guardrail run.** The richest,
most-consistent evidence across three files (V64, VA, VR all price the Juliet rail per
LF), and this item's dominant real scope. Stair count (EA) and VA's misc. metals
allowance (LS) stay real sub-container detail rather than a second item-level driver, the
same treatment already applied to fire sprinkler's standpipe and fire pump containers
under one blended item driver.

**Flag:** see Flag M4 under item 8 — this item's boundary with the framing package below
is not clean, because cold-formed metal panel/decking work is also priced under Division
05 codes at JF. That work now lives in item 17, Drywall and Carpentry, per the 2026-09-20
amendment there, not under this railings-and-stairs bucket or under item 8.

**Flag (Matt, 2026-09-20), resolved by research the same day.** JF's "Metal Pan Stairs"
line above ($6,500 EA) doesn't say whether it includes the concrete infill poured into
each pan tread, which is Concrete's scope, not this trade's — see item 2's Containers,
Concrete Infill for Steel Pan Stairs. Standard practice puts the fill with the concrete
sub or GC, not the steel fabricator, so this $6,500 reads as a likely undercount of the
stair's true installed cost, not an even double-count risk.

**Cross-checked against remaining trades (Matt, 2026-09-20).** Where this item's
railing posts land on a concrete-filled tread from item 2, the anchor method, embedded
sleeve versus surface-mounted base plate, is a real coordination point between this
trade and Concrete, detailed on item 2. Neither method is priced or specified in any
file.

### 7a. Structural steel framing

**Added (Matt, 2026-09-20).** None of the six source jobs is steel-framed, wood framing
over a concrete or precast podium, per items 4 and 8, covers all six, so this item has
zero evidence and zero dollars behind it today. It belongs on the list anyway:
`rom-spec.md`'s own Structure Type gate already offers steel-framed as a real answer,
the same gate that decides continuous insulation and the IBC combustible-height cap
elsewhere in this file, and until this item exists there's nowhere for a steel-framed
answer to actually price. Columns, beams, steel deck, and the connections between them,
distinct from the light-gauge cold-formed metal framing already priced in item 17, which
is non-structural stud and track, not a building's primary frame.

**Unit/quantity signal:** proposed at tonnage (TN) or building gross square feet once a
benchmark exists. No file gives a signal either way.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on Structure Type
= steel-framed.** Tonnage is the real trade-quote unit, but it converts to GSF through a
$/TN-per-GSF ratio once a real benchmark exists, the same relationship item 8's own
framing containers already have to GSF. Picking GSF here keeps this item consistent with
items 4 and 8, its two structure-type alternatives, rather than tracking a different
captured fact for the same structural-system fork.

1. **Structural Steel Erection.** Conditional on Structure Type = steel-framed. Columns,
   beams, girders, steel deck, and connections. Zero evidence in any file.
2. **Fireproofing.** Required whenever container 1 applies. Spray-applied or intumescent
   fireproofing on structural steel to meet its required fire-resistance rating, a
   distinct trade from the steel erection itself and easy to leave out of a first-pass
   steel number. Zero evidence in any file.

---

## Division 06 — Wood, Plastics and Composites

### 8. Wood framing

**Renamed 2026-09-24 (Matt).** Was "Shell framing — wood structure." Kulka keeps two framing items: this one for wood framing, and item 17 for metal framing and drywall together.

**Blended by framing system (Matt, 2026-09-25, LA-1103).** This item and item 17 blend only past jobs framed the same way as the project being estimated. Fieldstone (C00449) is wood and Jefferson's Ferry (C00456) is metal. See item 17 for how the ROM handles no match and a project with no framing system set.

**Amended (Matt, 2026-09-20): narrowed to wood only.** All cold-formed metal framing,
regardless of whether it's an exterior wall system or an interior partition, moves to
item 17, Drywall and Carpentry, on the reasoning that a light-gauge metal framing crew
and a drywall crew buy out as one subcontract in practice. This finally resolves Flag M4
below with a firm rule instead of the earlier "depends" answer. Renamed from "Shell
framing — wood and cold-formed metal structure" to reflect the narrower scope.

**Sources:**
- JF: "Wood Trusses" 9,000 SF $11.00 (r50, code 06.04001). JF's cold-formed metal lines,
  "Cold Formed Exterior Panel & Sheerwall" and "Floor Joists & Decking - Comslab" (r35–r36,
  code 05.04400, formerly cited here), moved to item 17 per the amendment above.
- V64: "2x4 PT/DF/Studs," "2x6 PT/DF/Studs," "2x8 DF," "2x10 DF," sheathing and plywood
  materials (r43–r59, code 06.04001, total $1,472,926); framing labor lines (r62–r65,
  code 06.04002, total $1,472,039). V64's "Wood Stairs & Railings" line (r68, code
  06.04300) moved to item 8a, kept separate rather than folded in here.
- VA: "Framing and Trusses (Davinci)" 1.00 LS $3,685,600 (r60, code 06.04001). Davinci
  reads as an actual framing subcontractor's name, and the number is an all-in wood
  material-and-labor quote, not a materials-only figure with labor missing — the zeroed
  labor lines below it (r63–r66) are correctly zero, not a gap.
- VR: sheathing line only, "4x8x1/2" LP Flame Block Sheathing" 58,342.54 SF $2.44 =
  $142,548 (r56); rest of framing materials and all labor zeroed.
- WS, VG: no framing line (VG's wall-area pricing likely stands in for this — see the
  top-level flag).

**Unit/quantity signal:** SF at V64's labor lines (per-wall/per-floor area); LF at V64's
material takeoff granularity; one LS at VA (Davinci, all-in) and JF (Wood Trusses is SF,
not LS — corrected).

**Quantity driver (LA-720, 2026-09-20): gross square feet.** V64's four labor containers
each price a different surface, exterior wall SF, interior wall SF, floor SF, house wrap
SF, but every one of them is a knowable ratio of GSF for a given Structure Type and unit
mix, not a separately captured intake fact the way bathroom count or unit count are. GSF
is the one real project basic all four containers ultimately convert from, so it stays
the single item-level driver rather than four competing surface-area drivers.

**Containers (Matt, 2026-09-20).** V64 is the most granular file in the whole draft here,
labor split cleanly into four real scopes by square footage.

1. **Framing Materials.** Required. Dimensional lumber by size and grade, sheathing,
   housewrap, sill seal, termite shield, fasteners. V64: $1,472,926 total.
2. **Exterior Wall Framing and Sheathing Labor.** Required. V64: 53,038.67 SF at $9.00/SF,
   double the interior rate — exterior walls carry structural sheathing and a weather
   barrier the interior walls don't.
3. **Interior Wall Framing Labor.** Required. V64: 108,839.76 SF at $4.50/SF.
4. **Floor Framing Labor, Joists and Subfloor.** Required. V64: 104,360.73 SF at $4.50/SF.
5. **House Wrap and Weather Barrier Labor.** Required. V64: 54,290.84 SF at $0.65/SF.
6. **Fire Blocking.** Required, added (Matt, 2026-09-20), found cross-checking fire
   alarm and sprinkler against remaining items. Genuinely distinct from item 14a's
   Firestopping: IBC 718 requires blocking material stuffed into concealed stud
   cavities at intervals not exceeding 10 feet, and at every floor and ceiling level, to
   keep fire from racing unimpeded up a wood-framed wall, a different code section from
   item 14a's through-penetration requirement, and a different trade, this is standard
   framing labor as the wall goes up, not a specialty subcontract. The exact requirement
   for the larger-space version, draftstopping in an attic or floor cavity, is real and
   directly tied to whether the building is sprinklered, per IBC 718.3 and 718.4, worth
   confirming against item 27 rather than assuming the same detail applies regardless of
   sprinkler protection. Zero evidence in any file.

**Flag M4 (carried from `jeffersons-ferry-scope-comparison.md`):** on Jefferson's Ferry,
Autodesk's "Metal Framing" group contains part of a structural-steel subcontract that
ProEst prices partly under Division 05 and partly folded into Division 09 drywall.
**Resolved (Matt, 2026-09-18, superseded 2026-09-20): metal framing lives in item 17,
wood framing lives here, regardless of interior or exterior.** The 2026-09-18 note left
this as a per-job judgment call; the 2026-09-20 amendment above replaces that with a firm
rule.

### 8a. Wood stairs and railings

Split from item 8 (Matt, 2026-09-20): kept as its own item rather than folded into item 8
or item 9. This is the wood counterpart to item 7 (Structural and miscellaneous metals —
railings, stairs, canopies), the same scope split by material rather than by division,
since a wood stair builder and a metal stair fabricator are different vendors entirely.

**Sources:**
- V64: "Wood Stairs & Railings" 1.00 LS $75,000 (r68, code 06.04300).
- No other file has this line.

**Unit/quantity signal:** LS, one data point. Likely EA once more jobs are in, scaling
with stair count per building rather than gross square feet.

**Quantity driver (LA-720, 2026-09-20): EA, stair count per building.** One LS data point
today, but a wood stair run is a discrete, counted assembly the way item 8a's metal
counterpart (item 7) already is, not a quantity that scales continuously with GSF or
unit count.

### 9. Finish carpentry — trim, casing, molding, interior door install

**Sources:**
- JF: "Casement Molding" 5,235.81 LF $12; "Crown Molding" 1,508.40 LF $15; "Base Molding"
  6,212.00 LF $8; "Chair Rail Molding" 5,364.42 LF $18 (r44–r47, code 06.02000). Total
  $231,711.
- V64: "Install & Trim Interior Wood Door [Subcontractor]" 406.00 EA $175 (r30); "5/4"
  Window Stools" 932.50 LF $3.50 plus a 72.00 LF sub-line (r31–r32); "Base Molding"
  14,362.66 LF $5.00 (r33); "Door Casing" 9,744.00 LF $6.00 (r34); "Window Casing"
  238.00 LF $6.00 plus two size-specific sub-lines, 150.00 LF and 1,656.00 LF, all at the
  same $6.00 rate (r35–r37). Total $217,107.
- VA: door install split by type, all under "Install & Trim Interior Wood Door" — BD/Bath
  doors 567.00 EA $175, standard closet doors 158.00 EA $175, walk-in closet doors
  133.00 EA $300 (r39–r41); "5/4" Window Stools" 15,828.00 LF $4.50 (r42); "Base Molding"
  14,092.95 LF $7.00 (r43); door casing matched to the same three door types, $6.00/LF on
  the two standard doors and $8.00/LF on the walk-in closet door (r44–r46); window casing
  27,444.00 LF $7.00 plus 5,112.00 LF $6.00 (r47–r48). Total $689,368. Also picks up VA's
  "Closet Interiors (Hat Shelf & Rod)" 1,596.00 LF $95 (r55, moved from item 10 — see the
  amendment there), $151,620.
- VR: same line set as V64, partly zeroed. Total $145,294.
- WS, VG: no line.

**Unit/quantity signal:** mostly LF (moldings scale with perimeter of rooms/units), EA
for door install/trim (scales with door count or unit count).

**Quantity driver (LA-720, 2026-09-20): split, the same shape as items 28/29's plumbing
fork.** Interior Door Install and Trim (container 1) on unit count, door count itself
tracks unit count closely and V64's own EA evidence is priced per door, not per room.
Window Stools, Base Molding, Door and Window Casing, and Crown Molding/Chair Rail
(containers 2 through 5) on LF of room and unit perimeter, the real quantity every file
prices these against. Both halves carry real, comparable dollar weight on the two files
that separate them (V64, VA), not a token secondary driver.

**Containers (Matt, 2026-09-20).**

1. **Interior Door Install and Trim.** Required. Includes basic closet shelf-and-rod work
   moved from item 10, since it's the same trade and the same visit in real practice. VA's
   rate difference on walk-in closet doors, $300 install and $8/LF casing against $175 and
   $6/LF on the other two door types, tracks real hardware complexity, not error.
2. **Window Stools.** Required.
3. **Base Molding.** Required.
4. **Door and Window Casing.** Required. VA's window casing lines split by nominal window
   size ("3636," "3678") price at the identical rate across sub-lines — a takeoff tool
   quantifying each unique size, not a real cost driver, and already treated as one line
   here rather than three.
5. **Crown Molding and Chair Rail.** Conditional, spec-driven. JF only. Neither Vue job
   has either line, a real finish-level difference, not a gap.

**Resolved (Matt, 2026-09-20): item 17's door install line was likely a double count,
dropped.** V64 carried both this item's "Install & Trim Interior Wood Door" (406 EA,
$175) and item 17's "Install Interior Door, Frame & HW" (425 EA, $225) on the same job. A
finish carpenter hangs the slab, sets the hardware, and trims the casing as one visit, not
two separate subcontracts — see item 17 for the removal.

**Missing, not priced in any file:** shoe molding, the trim piece at the base-to-floor
line on hard-surface flooring, most likely folded silently into the Base Molding rate
rather than genuinely absent, which means that rate isn't comparable between a carpet job
and an LVP job. Cabinet scribe and filler trim, closing the gap between cabinetry and an
out-of-square wall, small dollars but a real line on an actual bid.

**Optional, correctly absent from every file here:** wainscoting or raised-panel wall
systems, a step up from chair rail alone, common in amenity spaces on jobs that spec it.

**Flag:** JF's finish carpentry ($231,711 against a $125,000 Autodesk buyout, +85%) is
one of the three interior packages `jeffersons-ferry-scope-comparison.md` already flags
as consistently high and priced by full quantity takeoff — worth carrying that caution
into any benchmark built from this item.

### 10. Millwork and closet interiors

**Amended (Matt, 2026-09-20): basic closet shelving split out to item 9.** VA's "Closet
Interiors (Hat Shelf & Rod)" line, $95/LF, is field-installed wire or wood shelf-and-rod
work, the same trade and the same visit as base molding and door trim in real practice,
not shop-built millwork. It moved to item 9's Interior Door Install and Trim container
family. "Closet Interiors (Master WIC)" stays here at $350/LF, nearly four times the
rate, because a built-out custom walk-in system genuinely is millwork's scope, a
different vendor and a different product entirely from a shelf and a rod.

**Sources:**
- V64: "Amenity Area Millwork" 1.00 LS $55,000 (r40, code 06.02200).
- VA: "Upper and lower cabinets (Mid-Grade)" 2,181.00 LF and "Vanities" 513.50 LF, both
  priced at $0 (r51–r52, code 06.02300 — looks like a placeholder quantity with no rate
  entered yet); "Closet Interiors (Master WIC)" 960.00 LF $350 (r56). Total $336,000.
- VR: same amenity millwork line as V64, $55,000 (r45).
- JF, WS, VG: no line.

**Unit/quantity signal:** LF, scaling with cabinet run length or built-in closet system
perimeter.

**Quantity driver (LA-720, 2026-09-20): LF of closet/cabinet run, for containers 1
through 3.** VA's own $350/LF closet-system rate is direct evidence. Container 4, Amenity
Space Millwork General Allowance, is its own exception, already decided fixed lump sum
below, the same basis as item 25.

**Containers (Matt, 2026-09-20), reworked after checking against the AWI Architectural
Woodwork Standards.** AWI's own standard splits this trade into named sections, casework,
countertops, paneling, stairwork, and doors. Cross-checking that against what's already
decided elsewhere confirms this item was never supposed to be a catch-all: countertops
already live in item 24, stairwork in item 8a, doors across items 9 and 15. What's left
here is casework and paneling.

1. **Custom Closet Systems.** Required wherever a unit has a built-out walk-in. VA:
   960.00 LF at $350.00.
2. **Architectural Wall and Ceiling Paneling.** Wainscoting, accent walls, reception desk
   paneling, media walls. AWI treats paneling as its own standard section because it
   prices by square foot of surface, not linear foot of cabinet run — a different driver
   from the container above it. Nothing in any file prices this yet.
3. **Amenity and Common-Area Casework.** Reception desk base cabinetry, mailroom parcel
   locker surrounds, coffee bar or media wall boxes. A real boundary worth stating
   plainly: a reception desk's built cabinet is this container's scope, but its stone or
   laminate top is item 24's, the same countertop trade that prices kitchens and vanities
   — two genuinely different vendors on one piece of furniture, not a double price by
   accident.
4. **Amenity Space Millwork, General Allowance.** Conditional, reuses the Amenity Scope
   gate. V64 and VR's undifferentiated $55,000 lump. Kept explicitly as a known-thin
   bucket rather than force-decomposed into containers 2 and 3 above, since one flat
   number can't say how much of it is paneling versus casework. Likely `fixed` rather
   than scaled to GSF or unit count, the same call already made for item 25.

**Flag:** VA's "Upper and lower cabinets" and "Vanities" lines carry a real quantity
(2,181 LF and 513.50 LF) but a $0 unit cost — this looks like an incomplete estimate row,
not zero-cost scope, and should not be treated as "no cabinetry" when this file is
imported. Compare against item 24 (Cabinetry & countertops), which does carry real dollars
for kitchen/vanity cabinets on the same job — VA may be double-tracking cabinetry across
two codes, one filled in and one not.
**Resolved (Matt, 2026-09-18): ignore the $0 line.** It does not double-track item 24's
cabinet line, it is simply not real scope. Role it `incomplete`, excluded from every
total and from any per-LF cabinetry benchmark built from this file.

### 11. Decking, exterior stairs, and balcony railings

**Sources:**
- V64: "Trex Decking + Framing" 2,138.36 SF $70; "42" high wood railing (TimberTech)"
  330.65 LF $28.30 (r71–r72, code 06.06600). Wood stairs: "Wood Stairs & Railings" 1.00 LS
  $75,000 (r68, code 06.04300).
- VA: "Wood Decking (outdoor amenity)" 5,892.85 SF $15; "Trex Decking + Framing" 5,143.61
  SF $70; "42" high wood railing" 1,497.57 LF $40.75; "TimberTech Universal Railing
  (White)" 266.19 LF $40.75 (r69–r72). Also, filed separately under the Division 95
  allowance bucket (see the Division 95/97 flag below): "Fifth Floor Balcony Deck /
  Soffit" 2,749.88 SF $60 = $164,993 and "Fifth Floor Balcony Posts & Railing" 503.38 LF
  $300 = $151,014 (r316–r317).
- VR: same lines as V64, zeroed (r76–r77); "Wood Stairs & Railings" 1.00 LS $75,000 (r73).
- JF, WS, VG: no line.

**Unit/quantity signal:** SF for decking (scales with deck/balcony area), LF for railing
(scales with balcony perimeter).

**Quantity driver (LA-720, 2026-09-20): SF of deck/balcony area.** The dominant dollar
evidence across every file, Trex and wood decking priced per SF. Railing LF is real,
correlated sub-container detail, since railing run tracks deck perimeter once deck area
and unit mix are known, not a competing item-level driver.

**Resolved (checked against the source file, 2026-09-18): genuinely different scope, not
the same balconies priced twice.** Three things confirm it. The quantities don't match
(11,036 SF of decking at r69–r72 against 2,750 SF at r316–r317). The railing rate doesn't
match either ($40.75/LF against $300/LF, a 7x gap too large to be the same railing type
counted twice). And the two groups sit in different parts of the file for a reason: r69–72
is general amenity decking and standard unit railings in the normal framing takeoff; r316–
317 is a named "Fifth Floor Balcony" assembly with posts and a soffit finish, filed in the
allowance bucket next to the job's other late-added, one-off scope (retail build-out,
security, the pergola). Read as a distinct fifth-floor balcony system added after the main
takeoff, not a re-entry of the same balconies. Both stay mapped to this canonical item;
neither should be excluded or netted against the other.

**Container added (Matt, 2026-09-20), checked against building envelope waterproofing
categories before proposing:**

**Balcony Waterproofing Membrane.** Likely missing, and worth taking seriously: a
balcony sitting over conditioned space below needs a real waterproofing membrane
beneath the decking surface, and balcony waterproofing failure is one of the most
common sources of construction defect litigation in multifamily. None of the decking
lines above, Trex, wood decking, railings, mention a membrane component underneath.

**Ledger Flashing, checked against deck ledger failure research and added separately
(Matt, 2026-09-20) because it's more serious than the membrane above, not a duplicate
of it.** Wherever a balcony attaches to the building structure with a ledger board, the
American Wood Council's own construction guide, DCA 6, names the ledger connection as
one of the most common points of deck structural failure in the country, and a properly
bolted ledger still rots without flashing, because the fastener holes themselves become
water entry points into the band joist behind it. This is a distinct scope from both the
walking-surface membrane above and item 8's structural framing connection, its own
flashing detail at the ledger-to-wall joint. Zero evidence in any file.

**Guardrail Post Penetration Waterproofing, added (Matt, 2026-09-20), and named in the
research as the single most common balcony leak point, more often the cause than the
field membrane itself.** Every guardrail post bolted through the deck surface creates a
hole in the waterproofing membrane, one for each post along the railing, and each one is
a potential leak path into the structural framing below unless it's sealed with membrane
and sealant at the base, or better, mounted to a base plate set during construction so
the membrane terminates around the anchor rather than being penetrated by it. A real,
distinct detail from the field membrane and the ledger flashing above, not the same
scope repeated. Zero evidence in any file.

**Fire alarm and sprinkler cross-checked against balconies (Matt, 2026-09-20).**
Sprinkler side, real and recent code: NFPA 13 Section 9.3.20.1, added for the first time
in the 2022 edition, requires sidewall sprinklers under exterior balconies on Type V
construction wherever the balcony extends more than 4 feet from the building, the same
wood-frame construction type these buildings already use per item 16a's structure-type
work. The requirement exists because of a documented fire pattern: fire starting on one
balcony has repeatedly traveled up through unprotected balconies above it and breached
the attic, a real path in a building whose attic typically isn't itself sprinklered.
Cross-referenced into item 27's Sprinkler Piping and Heads container. Fire alarm side:
nothing new. Open exterior balconies aren't enclosed occupiable space requiring dedicated
detection, and where any device is warranted it would follow the same heat-detector, not
smoke-detector, rule already established for exterior and unheated locations, not a new
finding specific to balconies.

---

## Division 07 — Thermal and Moisture Protection

### 12. Building insulation

**Sources:**
- V64: "Roxul Sound Deadening Insulation" 119,723.77 SF $1.50; "R-21 Fiberglass Batt" 
  58,342.54 SF $1.25 (r77–r78, code 07.02000); roof/deck iso board and Densdeck air
  barrier (r81, r84).
- VA: "Roxul Sound Deadening Insulation" 85,914.51 SF $1.50; "R-21 Fiberglass Batt"
  71,180.05 SF $1.50; "R-49 Spray-Foam" 34,308.47 SF $8.50 (r81–r83). Total $527,264.
  ("Slab Vapor Barrier Upgrade," r80, moved to item 2's Foundation Waterproofing
  container, Matt 2026-09-20 — it's the concrete subcontractor's scope, not insulation's,
  since it's laid before the pour, not installed afterward.)
- VR: roof/deck iso board and air-barrier lines only, rest zeroed (r86, r89).
- JF: **no dedicated insulation code at all.** R-19 batt is folded into the interior
  framing unit rate (r101, "Interior Framing 3 5/8 gyp ea side R-19") and 2" rigid
  insulation below grade is folded into the sitework excavation line (r192), both under
  other canonical items.
- WS, VG: no line.

**Unit/quantity signal:** SF, scaling with wall/roof/slab area.

**Quantity driver (LA-720, 2026-09-20): gross square feet.** Both dominant containers,
acoustic and thermal envelope, price against wall/roof/slab area driven by code minimums
(STC 50, the energy code's prescriptive R-value table), and container 1 already states
its quantity is "already known from item 17's wall board containers," itself a GSF-tied
figure, not a separate captured fact.

**Containers (Matt, 2026-09-20), checked against IECC compliance paths and IBC sound
transmission requirements before proposing.** This item turns out to be two different
code regimes sharing one line: acoustic insulation between units, driven by the sound
transmission code, and thermal insulation in the envelope, driven by the energy code.
Slab vapor barrier, once in scope here, moved to item 2 as the concrete subcontractor's
scope, not this trade's.

1. **Acoustic Insulation (Interior Demising and Partition Walls).** Required. "Roxul
   Sound Deadening Insulation" in two files. The IBC sets STC 50 as the minimum between
   dwelling units, and standard multifamily essentially never deviates from it — the
   quantity is already known from item 17's wall board containers, no new fact needed.
2. **Thermal Envelope Insulation, Walls.** Required. R-21 batt evidence in two files.
   Derivable from climate zone under the energy code's prescriptive path, which is the
   most common path for standard production housing, but a job could instead use the
   performance path, a UA trade-off verified by an energy model rather than a fixed
   table — worth flagging as an assumption, not treating as certain.
3. **Continuous Insulation.** Conditional on Structure Type. Steel-framed and mass-wall
   assemblies need it on top of cavity insulation for thermal bridging; properly
   detailed wood framing usually doesn't. No evidence in any file, since all six jobs
   read as wood-framed.
4. **Pitched Roof Insulation (Attic/Rafter Cavity).** Conditional, gated by Roof Type:
   pitched, the same gate already used for Plumbing's Interior Storm Drainage. Installed
   below the deck. VA's R-49 Spray-Foam is this container, not container 2.
5. **Flat Roof Insulation (Tapered Polyiso Above Deck).** Conditional, gated by Roof
   Type: flat, the same gate. V64 and VR's "2.6" Iso Board," matching their TPO roofing
   membrane's square footage exactly, both real evidence of a flat-roof section on a
   building that also has a pitched, shingled section elsewhere. Serves double duty,
   thermal value and slope-to-drain, which pitched insulation never needs to do.
6. **Tub Insulation, Exterior Wall-Set Tubs.** Required wherever a bathtub sits against
   an exterior wall. The tub itself displaces the stud cavity where wall insulation would
   normally go, so it needs its own rigid-foam wrap to avoid a real gap in the envelope.
   No evidence in any file.
7. **Window and Door Perimeter Insulation.** Required wherever item 16a's residential
   windows apply (Matt, 2026-09-20). Low-expansion foam sealing the gap between the
   rough opening and the window frame, done by the same wood framing crew that installs
   the window per item 16a's buyout logic, not a separate trade, but the material and
   labor are this item's scope, not the framer's blended rate. On item 16's aluminum
   systems (concrete or masonry buildings) this is typically backer rod and sealant
   instead of foam, done by the window subcontractor as part of its own turnkey scope —
   worth keeping that distinction in mind once this gets a real quantity driver, since
   it's not the same material or the same installer either way.

**Flag M3 (carried from `jeffersons-ferry-scope-comparison.md`):** JF shows $0 for this
canonical item, which understates the gap against Autodesk's $87,829 insulation group —
the real number is buried inside two other lines and cannot be cleanly separated. Do not
read JF's $0 here as "no insulation was priced."

### 13. Roofing, gutters, and roof pavers

**Sources:**
- JF: "Asphalt Shingles" 5,748.76 SF $7.00; "EPDM Roofing Membrane" 4,368.72 SF $17.00
  (r58–r59, code 07.03000); "5" Gutters & Leaders" 398.36 LF $15 (r62, code 07.06600).
- V64: "**30 Year Asphalt Shingles**" 15,419.10 SF $5.50 (r87); TPO membrane, primer,
  roofing crew (r88–r90); "Walking Pads" 40.00 EA $95 (r91); "Roof Pavers" 3,570.66 SF
  $32.00 (r94, code 07.07600).
- VA: "30 Year Asphalt Shingles" 41,814.42 SF $11.00 (r86, code 07.03000); "Rooftop
  Pedestal Paver System" 6,048.06 SF and "Roof Pavers" 867.60 SF, both $32.00 (r89–r90).
- VR: same line set as V64 (asphalt shingles line zeroed), TPO/primer/crew still priced
  (r92–r95).
- WS, VG: no line.

**Unit/quantity signal:** SF, scaling with roof area.

**Quantity driver (LA-720, 2026-09-20): gross square feet, gated by Roof Type for which
container applies.** Roof area is a footprint-and-stories ratio of GSF, consistent with
how every priced file quotes the shingle and membrane systems. Gutters (container 4) are
real sub-container detail measured in LF of eave, not a competing driver.

**Containers (Matt, 2026-09-20), checked against TPO system components before
proposing.** A TPO or EPDM roof is never just field membrane; every penetration and wall
termination needs its own flashing, and this item's existing sources show membrane,
primer, and crew labor only. Several containers reuse the Roof Type gate already doing
work on Plumbing's Interior Storm Drainage and Building Insulation's roof containers.

1. **Pitched Roof Shingle System.** Required, gated by Roof Type: pitched. One blended
   installed rate in every file, felt underlayment and basic flashing included, the same
   system-pricing convention already confirmed for paint and carpet. Includes ice and
   water shield at eaves and valleys and ridge or soffit ventilation — the same roofing
   crew installs all three in one sequence, not separate scopes.
2. **Flat Roof Membrane System.** Required, gated by Roof Type: flat. TPO or EPDM plus
   primer and crew labor, real evidence in three files.
3. **Roof Flashing, Edge Metal, and Coping.** Likely missing, gated by Roof Type: flat.
   Flashing at every rooftop equipment penetration, HVAC curbs, exhaust fans, plumbing
   vent stacks, electrical conduit, plus termination bar and edge metal at the roof
   perimeter, plus metal coping capping the parapet walls. Zero evidence for any of it in
   any file, despite being unavoidable on a real membrane roof with rooftop equipment.
4. **Gutters and Leaders.** Required, gated by Roof Type: pitched. JF's real evidence,
   $15/LF. This is the pitched-roof answer to where roof water goes, the same question
   Plumbing's Interior Storm Drainage answers for a flat roof.
5. **Roof Pavers.** Conditional, amenity-driven, gated by Roof Type: flat, since pavers
   need a flat deck to sit on. Real evidence in two files.
6. **Roof Accessories.** Partial evidence, not a full gap. Walking pads are already real,
   V64 prices 40 EA at $95. Roof hatches, safety tie-off anchors, and roof ladders have
   zero evidence anywhere, worth naming since a flat roof with rooftop mechanical
   equipment almost always needs a hatch for access.
7. **Kick-Out Flashing.** Likely missing (Matt, 2026-09-20), checked against wall
   water-management trade practice. Diverts roof runoff away from the wall wherever a
   roof edge terminates into a sidewall, most common where a secondary roof plane meets
   a taller wall, but not tied to either Roof Type answer specifically. Flashing
   failures at exactly these transitions are the single most common source of water
   intrusion in a building, and this is one of the most frequently omitted details in
   real construction. Zero evidence anywhere.

**Flag:** confirms the exact importer trap `rom-system-design.md` names — "30 Year
Asphalt Shingles" (V64 r87, VA r86, VR r92) begins with two digits and will misparse as a
division header under a naive rule. Also found the second named example, "18 Ga. SS
Corner Guards," at JF r126 (see item 21, Specialties) — confirming both examples the
design doc cites are real, not hypothetical.

### 14. Siding and exterior wall cladding

**Sources:**
- JF: "Exterior PVC Panels/Trim" 1,260.04 SF $18; "Vinyl Siding" 7,890.27 SF $16; "24"
  Vinyl Soffits" 400.00 LF $18 (r66–r68, code 07.09510). Also "Screen Enclosure System"
  1,007.47 SF $30 (r65) — see the M2 note below.
- V64: "James Hardie" 13,773.87 SF $15; "1/2" x 6"x16' Clear Cedar Bevel Siding" 10,147.81
  SF $20; "Vinyl Siding" 30,369.16 SF $3.75 (r97–r99).
- VA: "Vinyl Siding" 65,839.38 SF $3.75; "Clear Cedar Bevel Siding" 10,562.58 SF $23.50;
  "James Hardie Fiber Cement Siding" 3,453.04 SF $15; "James Hardie Plank Siding" 
  37,776.95 SF $7.05 (r93–r96).
- WS: "Decorative metal panel" 1,377.46 SF $55 (r24, code 07.04213); "Fiber Cement
  Siding" 4,865.27 SF $22 (r27, code 07.09510).
- VR, VG: no line.

**Unit/quantity signal:** SF (and LF for soffit trim), scaling with building envelope/
elevation area.

**Quantity driver (LA-720, 2026-09-20): gross square feet.** Field cladding, the
dominant, richly evidenced container across four files, prices per SF of envelope area, a
footprint-and-stories ratio of GSF.

**Containers (Matt, 2026-09-20), checked against siding installation trade practice
before proposing.** V64 and VA both use two to four different siding materials on the
same building, James Hardie, cedar, vinyl, sometimes all three, and wherever two
materials meet on one elevation there's always a transition detail. Neither file prices
one.

1. **Field Cladding Material.** Required. Rich real evidence across four files.
2. **Trim and Accessories.** Likely missing. Corner boards, J-channel, and starter strip
   are unavoidable parts of any siding install, standard scope on every job, not an
   upgrade. Zero evidence in any file.
3. **Soffit and Fascia.** Partial evidence, not a full gap. JF prices vinyl soffit at
   $18/LF. Fascia trim along the roof edge isn't priced separately anywhere.
4. **Window and Door Opening Flashing.** Likely missing, and expanded (Matt, 2026-09-20)
   after checking against the real installation sequence rather than treating this as
   one line. Code (IRC R703.4) and ASTM E2112 both require a specific three-part
   sequence, sill pan first, then jambs lapped over the sill pan, then head flashing
   lapped over both the jambs and the weather barrier, shingle-fashion so each layer
   sheds water onto the one below it. Skipping the sill pan or installing head flashing
   first, out of sequence, is named directly in the research as one of the most common
   and most litigated window installation defects. A real boundary against item 16a's
   window install either way, not the same scope — the window sub sets the unit, the
   siding sub flashes and laps the cladding around it. Zero evidence of any of the three
   components in any file.
   - **Sill Pan Flashing.** The most critical piece. Catches water that gets past the
     window and directs it back out over the weather barrier rather than into the wall.
   - **Jamb Flashing.** Installed second, lapping over the sill pan.
   - **Head Flashing.** Installed last, lapping over the jambs and the weather barrier,
     directing water around and away from the top of the opening.
5. **Material Transition Trim.** Likely missing, the strongest finding here. Every
   multi-material elevation needs a transition detail where one cladding type ends and
   another begins. Neither V64 nor VA prices it despite both needing it.
6. **Rainscreen Drainage Gap.** Likely missing (Matt, 2026-09-20), checked against wall
   water-management trade practice. Furring strips creating a ventilated air gap behind
   the cladding, letting bulk water that gets past the field material drain down and
   dry out rather than sitting against the weather barrier. This is the siding
   installer's own scope, attached right before the cladding goes up, not item 8's
   house wrap step. Zero evidence in any file.
7. **Weep Screed.** Likely missing. The drainage exit at the base of the wall, required
   at a minimum height above grade so trapped water can escape to the exterior. The
   water-management counterpart to the starter strip already flagged in container 2,
   not the same thing, a starter strip positions the first course, a weep screed
   drains it. Zero evidence in any file.

**Confirmed correct, not a gap: WRB seam taping.** V64's Framing Materials container
(item 8) already prices "Tyvek Tape," 54,290.84 SF at $0.14, real evidence the seams in
the weather barrier are taped as part of the framing crew's install, not missing.

**Flag M2 (carried from `jeffersons-ferry-scope-comparison.md`):** JF's "Screen Enclosure
System" line ($30,224, r65) is filed under the siding code but is not siding — the prior
note reassigned it to face Autodesk's Screened Balconies group instead. Treat it as a
judgment call, not a settled fact, when this draft is approved.

### 14a. Firestopping

New item (Matt, 2026-09-20), split out during the fire alarm and sprinkler cross-check
against remaining trades. CSI MasterFormat already codes this at 07 84 00, its own
section under Division 07, which is precedent enough on its own for treating it as a
distinct trade rather than folding it into whichever item happens to create the
penetration. In real construction it's commonly bought as its own licensed specialty
subcontract, the same reasoning that already split off item 32a, ERRCS, rather than
leaving it a container of one trade's item.

**Sources:** none. No file prices firestopping as its own line anywhere, and given how
commonly it's missed in the field, per the research below, that's a real gap, not a sign
these six jobs didn't need it.

**Unit/quantity signal:** none yet. Likely EA or LF per penetration, or a per-building
allowance, whichever the first real quote actually tracks.

**Quantity driver (LA-720, 2026-09-20): EA per rated-wall/floor penetration.** No
benchmark exists yet, but the code basis itself, IBC 714, a listed system at every
individual penetration, points to a counted quantity, not an area or allowance; the nine
trades named below each contribute a real, countable number of penetrations once a job's
plumbing, electrical, and duct runs are known.

**Researched before writing this item, since it touches almost every other trade on
this list rather than belonging to one.** IBC Section 714 requires a listed firestop
system, tested to restore the assembly's original fire rating, at every through-
penetration in a fire-rated wall or floor, not just the large or obvious ones. The
research names plastic pipe as the single most common source of firestop failure,
since it melts away in a fire and leaves an open hole, and is explicit that even a
drill hole for a single low-voltage cable needs sealing if the hole is larger than the
cable itself, no penetration is too small to matter.

**Every trade whose scope crosses a rated wall or floor has real exposure here, none of
it currently priced:**
- Plumbing (items 28/29), pipe penetrations through corridor and unit demising walls,
  the highest-risk case per the research given how common plastic pipe is in
  residential plumbing.
- Electrical (item 31) and Low Voltage (item 31a), conduit and cable penetrations
  through the same rated walls.
- HVAC (item 30), duct penetrations beyond the damper itself, item 30's own container 8
  covers the damper, this covers sealing the annular gap around it and around any
  smaller duct or pipe that isn't large enough to need one.
- Drywall and Carpentry (item 17), since this is the trade that closes up the wall
  around every one of the penetrations above, and is often the first to notice, or
  miss, a gap.

**Cross-checked against remaining trades (Matt, 2026-09-20), four more real penetration
sources missed on the first pass:**
- Fire Sprinkler (item 27), branch piping running from the riser through every corridor
  and demising wall to reach each unit. Metal, not plastic, so a lower failure risk than
  domestic plumbing, but still a real penetration needing the same sealed system.
- Fire Alarm (item 32), initiating and notification circuit wiring and conduit crossing
  the same rated walls, its own distinct circuit from general electrical and low
  voltage.
- Elevators (item 26), the hoistway itself is a rated shaft, and the equipment feeds,
  and on a hydraulic system the piston piping running from the machine room into the
  hoistway and pit, all penetrate that shaft's rated enclosure.
- Trash Compactors and Chutes (item 23), whose own entry already names the chute
  running through a fire-rated shaft with a rated door at each floor, that entry never
  connected the chute's own floor penetration to this requirement until now.
- Emergency Responder Radio Coverage (item 32a), the coaxial cable run from the
  amplifier to antennas on each floor, the same rated walls and floors as everything
  else on this list.

---

## Division 08 — Openings

### 15. Doors, frames, and hardware — interior, exterior, and entry

**Amended (Matt, 2026-09-20): garage and overhead doors split out to item 15a.**

**Sources:**
- JF: HM frames/doors, wood doors, hardware, specialty doors (r73–r89, codes 08.01100,
  08.01400, 08.01500, 08.03000). Total $238,625.
- V64: same structure (r104–r121). Total $431,825 (frames + wood doors + hardware, before
  aluminum/glass).
- VA: same structure, larger unit counts and a "6x7 closet" door subtype (r101–r125).
  Total $1,352,096.
- VR: same structure, higher per-door rates than V64/VA (r109–r126). Total $1,354,364.
- WS, VG: no line.

**Unit/quantity signal:** EA, scaling with door count (interior) or unit count
(entry doors).

**Quantity driver (LA-720, 2026-09-20): unit count.** Interior and entry door count both
track unit count closely on a residential floor plan, more units means proportionally
more interior doors and exactly one more entry door each, so unit count is the one
captured intake fact both sides of this item's EA evidence convert from cleanly.

**Containers (Matt, 2026-09-20), checked against ANSI/BHMA hardware grades and
multifamily fire-door code requirements before proposing.** The wide swing in entry-door
hardware rates across files, $300 to $1,548 per door, isn't inconsistency between jobs.
Grade 1 commercial hardware at a unit entry door is the correct code requirement, not a
spec upgrade, one source states it plainly: "Grade 3 on a multi-family unit entry is a
liability." Every file already prices entry hardware separately from interior hardware
at a real premium, the industry drawing exactly this line already.

1. **Hollow Metal Frames and Doors.** Required. Rated openings, mechanical and utility
   rooms.

   **Scope boundary, added (Matt, 2026-09-20), the point Matt raised reviewing this
   item.** Where the opening lands in a CMU wall rather than a framed one, the frame is
   still furnished through this item's channel, but a punched-and-dimpled
   masonry-application frame is set and braced by the mason as the block coursing goes
   up around it, anchored into the mortar joints at each course, not installed into a
   finished rough opening by this item's door and hardware installer the way a
   framed-wall opening works. That installation labor is item 5's masonry scope, not
   this item's, wherever the wall type is CMU. No file separates furnish from install
   cleanly enough to isolate this today, so it can't be split out as its own dollar
   figure yet, only flagged as the real trade boundary.
2. **Interior Wood Doors and Frames.** Required. Unrated, standard within-unit doors.
3. **Entry Doors, Unit to Corridor.** Required, code-rated. A 20-minute fire-rated
   assembly by code, already priced as its own subtype in every file that separates door
   types.
4. **Exterior and Sliding Glass or French Doors.** Required, narrowed (Matt, 2026-09-20)
   to doors bought through the door and millwork channel. A sliding or French door from
   the same manufacturer as the building's residential windows is a fenestration
   product, not a door-supplier product, and belongs in item 16a instead, furnished and
   installed the same way the windows are. The three real lines currently sitting here,
   V64 and VR's "Exterior Sliding French Door Pair" and VA's "Sliding Glass Doors,"
   $1,800–2,537 each, don't name a manufacturer, so they stay here unconfirmed rather
   than being moved on a guess. Check manufacturer at import time going forward.
5. **Entry Door Hardware, Grade 1.** Required, code-driven, not a spec choice. The
   container carrying the $300–$1,548 variance across files.
6. **Interior Door Hardware, Grade 2/3.** Required. Standard passage and privacy sets.
7. **Self-Closing Devices and Smoke Gasketing.** Likely missing, and likely the reason
   for container 5's variance. Every unit entry door onto a corridor legally requires a
   self-closing device and positive latching to maintain its fire rating. No file prices
   this as its own line, so the wide swing in entry hardware rates probably reflects some
   files bundling a closer in and others not, rather than four jobs genuinely pricing
   hardware that differently.
8. **Stairwell Doors and Panic Hardware.** Likely missing entirely, the bigger finding
   here. Stairwell doors need a 60 to 90 minute rating and panic exit hardware by code,
   often electrified and tied into the fire alarm system, item 32 (corrected 2026-09-20,
   was miscited as item 32a, which is Emergency Responder Radio Coverage, not fire
   alarm), so stairwell doors unlock automatically on alarm. Zero evidence of any
   stairwell door pricing across all six files, despite every one of these being a
   multi-story building that legally requires one.

   **Fire alarm and sprinkler cross-checked against stairs (Matt, 2026-09-20), two real
   findings, currently priced nowhere.**

   **Stair pressurization.** Required on any building where an occupied floor sits more
   than 75 feet above grade, roughly the same high-rise threshold already relevant to
   items 26 and 32a. Mechanical fans pressurize the stair enclosure to keep smoke out,
   and code is explicit that activation runs through the fire alarm system, smoke
   detectors positioned at each floor's stairwell entrance trigger the fans. That's a
   real system spanning two items neither currently names: the fans and ductwork
   themselves are item 30's scope, HVAC, and the dedicated activation detectors are item
   32's System Interfaces container, alongside elevator recall and sprinkler monitoring.
   None of Kulka's six sample jobs read as true high-rises, so this likely doesn't apply
   to any of them today, but it's a real gap worth having named before the first
   high-rise job comes through.

   **Under-stair sprinkler coverage.** NFPA 13 requires sprinkler coverage beneath any
   stair of combustible construction, not just above it, meaning item 8a's wood stairs
   specifically trigger an additional sprinkler head location that a non-combustible
   stair wouldn't need. Sprinkler heads within the stair run also have to align their
   deflector with the slope of the stair, not sit level the way a normal ceiling head
   does. Added to item 27's Sprinkler Piping and Heads container, cross-referenced to
   item 8a rather than treated as generic coverage.

### 15a. Garage and overhead doors

Split from item 15 (Matt, 2026-09-20). A real, one-off scope difference, not a pricing
inconsistency: West Shore has attached or detached garages, the other five jobs
apparently do not.

**Sources:**
- WS: "Overhead garage door 12'X 12'" 18.00 EA $4,520.30 = $81,365 (r32, code 08.34001
  SPECIAL DOORS).
- No other file has this line.

**Unit/quantity signal:** EA, scaling with garage-bay count.

**Quantity driver (LA-720, 2026-09-20): EA, garage-bay count, conditional on Parking
Type.** West Shore's own rate is a direct per-door figure; whether this item applies at
all is a Parking Type fact, not a scaling question.

**Loading Dock Equipment, added (Matt, 2026-09-20), checked before proposing rather than
assumed.** Conditional, and probably the exception rather than the rule on a typical
multifamily podium building, a leasing office or ground-floor retail component with real
delivery volume is the realistic trigger, not every job. Dock leveler, bumpers, and a
dock seal, distinct from the overhead door above, which this item already prices. Zero
evidence in any file, consistent with none of the six jobs actually needing it.

### 16. Arch. Metal & Glass

**Amended (Matt, 2026-09-20): renamed from "Windows, storefront glazing, and shower
enclosures," residential windows split out to item 16a.** This item now holds the
storefront and glazing fabricator's own scope, adopting the trade's own name for it,
already the ProEst code name in the source files, 08.08200. Entrance doors, storefront
and curtain wall glazing, and shower enclosures are one subcontractor's buyout, and none
of them are residential windows.

**Sources:**
- V64: "Kawneer 190 Series Narrow Stile" 4.00 EA $4,000 and 12.00 EA $400, plus "Standard
  Hardware" 16.00 EA $1,200 (r123–r125, code 08.04000, Aluminum & Glass) — previously
  uncited in this item; "Interior Storefront" 88.92 SF $105 and "Exterior Glass
  Storefront System" 4,068.74 SF $85 (r133–r134, code 08.08200); "Shower Enclosure"
  83.00 EA $2,250 (r137, code 08.08500).
- VA: "Exterior Glass Storefront System" 7,037.73 SF $75 (r134); "Shower Enclosure"
  158.00 EA $2,250 (r137).
- VR: same Aluminum & Glass and Arch. Metal & Glass codes, zeroed (r127–r131, r138–r139);
  "Shower Enclosure" 83.00 EA $2,250 (r142).
- JF, WS, VG: no line.

**Unit/quantity signal:** EA for entrance doors and shower enclosures, SF for storefront
and curtain wall glazing.

**Quantity driver (LA-720, 2026-09-20): SF of storefront/curtain wall glazing.** The
largest dollar container on the two files that price it (V64: $4,068.74 SF; VA: $7,037.73
SF). Entrance doors and shower enclosures stay real EA sub-container detail, shower
enclosures in particular already landing on one confirmed rate across all three files
that price them, not a competing item-level driver.

**Containers (Matt, 2026-09-20), checked against aluminum entrance system trade
practice before proposing.** Narrow stile is specifically an entrance door product,
distinct from both a punched window and a fixed glazing wall, used where a controlled,
code-compliant entry is needed rather than a view — a real third category this item was
missing entirely before this pass.

1. **Aluminum Entrance Doors.** Required wherever the building has a storefront-style
   entry rather than a standard swinging door. V64: 16 EA total, $40,000.
2. **Storefront and Curtain Wall Glazing.** Required. Priced by square foot of glazed
   area, a different driver from the door container above it. Likely missing within it,
   added (Matt, 2026-09-20): the weep and drainage system at the sill and glazing
   pockets, a real, distinct detail from the punched-window flashing sequence in item
   14, since a storefront system manages water inside its own frame rather than relying
   on the wall's weather barrier. Zero evidence in any file.
3. **Shower Enclosures.** Required. All three files that price this land on the
   identical $2,250 per unit rate, the second item after Wood Flooring where every
   source agrees on the same number.

### 16a. Residential windows

Split from item 16 (Matt, 2026-09-20): residential windows are a different product, a
different buyout pattern, and often a different structural class from the glazing
fabricator's scope above, so they don't belong in the same item just because both
involve glass.

**The buyout pattern is structure-type driven, not a spec preference.** On a wood-framed
building, the GC furnishes the windows and the wood framing subcontractor installs them,
the same crew already priced in item 8's Exterior Wall Framing and Sheathing Labor
container — installing a vinyl or wood-clad window is part of that sequence, since it's
built with a nailing fin designed to attach to wood sheathing. On a concrete or masonry
building, one dedicated window subcontractor furnishes and installs as a single turnkey
scope, anchoring the frame into concrete or CMU with clips rather than a nailing fin.

**Why the structure type forces this, not just explains it.** The IBC caps combustible
exterior wall coverings, which includes vinyl window frames, at 40 feet above grade for
Types I through IV construction, roughly three to four stories. Above that line, vinyl
isn't a worse choice, it's not a legal one, and aluminum becomes the code-compliant
answer, engineered for the higher wind pressure and structural spans that come with
height anyway. Untreated aluminum also needs a thermal break to meet energy code
U-factor targets, which vinyl doesn't require. One structure-type fact, three downstream
consequences: this same fact already drives item 8a's Gypcrete container and item 2's
Slab-on-Grade container.

**Also holds exterior sliding and patio doors from the same manufacturer as the
windows** (Matt, 2026-09-20), per the amendment to item 15's door container — a
fenestration-line product, furnished and installed the same way as the windows on that
job.

**Sources:**
- JF: "Vinyl Single Hung Window," "Mulled Twin," "Mulled Triple" (r91–r93, code 08.05000).
  Total $31,500.
- V64: "Windows 10860/3636/3678" (r128–r130).
- VA: same structure, larger counts (r127–r130).
- VR: same structure, higher per-unit rates (r133–r136).
- WS, VG: no line.

**Unit/quantity signal:** EA, scaling with opening count.

**Quantity driver (LA-720, 2026-09-20): EA, window opening count.** Every priced file
quotes per-opening rates by nominal size; opening count itself derives from unit mix and
egress requirements rather than from GSF directly, so EA stays the driver rather than a
GSF conversion.

**Cross-checked against elevators and stairs (Matt, 2026-09-20).** Code permits
exterior windows in an enclosed exit stairway's exterior wall, and where a stairwell has
one, it's still a window and needs the same three-part flashing sequence already
required at item 14, sill pan, jamb, then head, no new scope, just confirming the
existing container's coverage extends here. Nothing comparable applies at elevators;
those openings are interior lobby doors, not exterior windows, so this cross-check found
nothing new on that side.

**Cross-checked against sprinkler (Matt, 2026-09-20).** How close a wall sits to a
property line, and whether the building carries full NFPA 13 or the simpler NFPA 13R,
directly caps how much window area that wall can even have, detailed on item 27. Not a
cost line here, a real design constraint worth knowing before assuming a job's window
count and area are purely an architectural choice.

**Flag:** `jeffersons-ferry-scope-comparison.md` found JF priced 54 window openings at
$583 average against Pella windows actually bought at $1,648 per opening (+183%) — a
specification gap (vinyl assumed, brand bought), not a quantity or code error.

**Note:** egress code requires at least one compliant opening per bedroom, minimum 5.7
square feet of clear opening, sill no higher than 44 inches. None of the files
distinguish an egress-compliant bedroom window from any other window, but the different
nominal sizes already priced in each file, "10860," "3636," "3678," may already
correspond to bedroom versus other-room sizing rather than being a gap. Worth checking
against the actual specs before assuming anything's missing here.

---

## Division 09 — Finishes

### 17. Metal framing and drywall

**Renamed 2026-09-24 (Matt).** Was "Drywall, interior framing install, and ceilings (including acoustical)." It covers light-gauge metal framing, structural or not, together with drywall. Ceilings, including acoustical, stay here. On Jefferson's Ferry (C00456) this item carries load-bearing metal studs; on a wood-framed job like Fieldstone (C00449) it carries only drywall, ceilings, and interior studs. So a wood job priced from metal-framed jobs reads high here and low on item 8, until more jobs of each kind load.

**Blended by framing system (Matt, 2026-09-25, LA-1103).** Each project now records its framing system: wood, metal, or not set. Jefferson's Ferry (C00456) is metal and Fieldstone (C00449) is wood. On this item and item 8 the ROM blends only past jobs framed the same way as the project being estimated, and the drilldown names each job it left out. If no past job matches, the line has no figure and sits outside the total. If the project's framing system is not set, the line blends every job as before and is held for review.

**Amended (Matt, 2026-09-20): now also holds all cold-formed metal framing, moved from
item 8.** JF's "Cold Formed Exterior Panel & Sheerwall" 9,500 SF $18.00 = $171,000 and
"Floor Joists & Decking - Comslab" 18,000 SF $10.00 = $180,000 (r35–r36, code 05.04400)
now live here. Worth flagging plainly: both of those are exterior wall and floor systems,
not interior partition framing, which sits a little oddly next to this item's own title.
The rule from item 8 is metal framing lives here regardless of interior or exterior, so
they're included on that basis, not because they fit the "interior" half of the name.

**Sources:**
- JF: "5/8" GWB Ceilings & Soffits" 22,800 SF $6.00 (r102, corrected from "1/2"" in an
  earlier pass — the thicker, fire-rated board is the reason for the higher rate against
  V64 and VA below, not an error); "Interior Framing 3 5/8 gyp ea side R-19" 2,777.34 LF
  $14.00 (r101); "Wood Blocking (for Corridor Chair Rail)" 831.26 LF $11.76 (r103);
  "Drywall & Carpentry" 1.00 LS $350,000 (r104, code 09.02300). Also "2'x2' ACT
  (Acoustical Ceiling Tile)" 1,580.03 SF $3.30 = $5,214 (r98, code 09.00951). Plus the two
  cold-formed metal lines noted above, moved from item 8.
- V64: "1/2" GWB Walls (Plan View)" 298,524.08 SF $2.00 (r142); "1/2" GWB Ceilings"
  112,967.77 SF $2.00 (r143); "Install Bath Accessories" 105.00 BATH $600 (r144);
  "Install Interior Door, Frame & HW" 425.00 EA $225 (r145).
- VA: "1/2" GWB Walls (Plan View)" 214,634.80 SF $2.00 (r142); "1/2" GWB Ceilings"
  179,365.17 SF $2.00 (r143); "Install Bath Accessories" 158.00 BATH $600 (r144); door
  install split three ways by type, standard 22.00 EA, common-area 20.00 EA, entry-wood
  133.00 EA, all at the same $225 rate (r145–r147) — the split reveals a quantity
  breakdown, not a price difference between door types.
- VR: same structure as V64, GWB wall/ceiling quantities zeroed but bath accessory (105
  BATH) and door install (375 EA) lines priced (r147–r150).
- WS, VG: no line.

**Unit/quantity signal:** SF for GWB walls/ceilings (scales with wall/ceiling area) and
for the cold-formed metal lines above, LF for framing, EA/BATH for accessory and door
install (scales with unit or bathroom count).

**Quantity driver (LA-720, 2026-09-20): gross square feet.** Wall and ceiling board
installation, the item's two dominant containers (V64: 298,524 SF and 112,968 SF), both
price against surface area that converts from GSF at a Structure Type-specific ratio.
Bath Accessory Installation (container 4) is real bathroom-count-driven sub-container
detail, matching plumbing's own fixture-point logic, not a competing item-level driver.

**Containers (Matt, 2026-09-20).**

1. **Interior Metal Framing.** Required. Moved from item 8. JF's framing line plus the
   two cold-formed exterior/floor lines noted above.
2. **Gypsum Wall Board Installation.** Required. V64: 298,524.08 SF at $2.00. VA:
   214,634.80 SF at $2.00. JF has no wall board line at all — see the flag below.
3. **Gypsum Ceiling Installation.** Required. V64: 112,967.77 SF at $2.00. VA:
   179,365.17 SF at $2.00. JF: 22,800 SF at $6.00, three times the rate, explained by the
   5/8" fire-rated board against 1/2" standard on the other two.
4. **Bath Accessory Installation.** Required. Scales with bathroom count, the same
   fixture-point driver already established for plumbing. V64 and VR: 105 BATH at $600.
   VA: 158 BATH at $600.
5. ~~Interior Door, Frame, and Hardware Installation.~~ **Removed (Matt, 2026-09-20),
   likely a double count.** V64's "Install Interior Door, Frame & HW" here (425 EA at
   $225) and item 9's "Install & Trim Interior Wood Door" (406 EA at $175) describe
   overlapping work on the same job. A finish carpenter hangs the slab, sets the hardware,
   and trims the casing as one visit in real practice, not as two separate subcontracts.
   This line most likely exists twice because ProEst's own cost code library carries a
   Division 06 and a Division 09 default for door install, and both got populated. Door
   install and trim now lives only in item 9's Interior Door Install and Trim container.
6. **Wood Blocking and Miscellaneous Carpentry.** Required, small. JF only, $9,776.

**Flag:** shares Flag M4 with item 8 — this is the fourth division (09) that
`jeffersons-ferry-scope-comparison.md` found folded into the same buyout package as wood
and cold-formed framing, now resolved: metal framing lives here, wood framing lives in
item 8. Acoustical ceiling tile is small ($5,214, JF only) and easy to overlook; it is
included here rather than given its own item because no other file prices it separately.

**Flag (Matt, 2026-09-20):** JF has no Gypsum Wall Board Installation line at all, only
ceilings, framing, and blocking are itemized, yet it carries a flat $350,000 "Drywall &
Carpentry" lump sum on top of those. That number most likely stands in for the missing
wall install plus general rough carpentry that V64 and VA itemize separately, not a
duplicate of the lines already listed above it — worth confirming before treating JF's
total as comparable to the other two files' itemized approach.

**Gypsum Shaft Wall System, added (Matt, 2026-09-20), the other half of item 5's new
Stair and Elevator Shaft Wall Construction finding.** A lightweight alternative to CMU
for a stair or elevator shaft enclosure: shaft liner panel set in a steel-stud track,
built by this item's drywall sub rather than the mason. Neither this container nor item
5's carries a real number yet; the two need the same construction-method gate before
either one can be benchmarked, CMU versus gypsum shaft wall, not priced twice as if a
job does both. Zero evidence in any file.

### 18. Tile and stone

**Sources:**
- JF: "Floor Tile (Material Allowance)" 3,043.16 SF $19.70; "Mosaic Tile Backsplash"
  746.43 SF $15; "Wall Tile @ Bathrooms" 1,965.60 SF $11.50 (r107–r109, code 09.03013).
- V64: "Wall Tile (Material Allowance)" 3,000 SF $23.70 (r148).
- VA: "Wall Tile" 11,200 SF $26.09; "Mud Job at Shower" 158.00 EA $500 (r150–r151).
- VR: "Wall Tile (Material Allowance)" 3,000 SF $21.09 (r153).
- WS, VG: no line.

**Unit/quantity signal:** SF, scaling with tiled wall/floor area; EA for mud-job shower
prep, scaling with bathroom count.

**Quantity driver (LA-720, 2026-09-20): bathroom count.** Wall tile, the required,
best-evidenced container, is bathroom-and-kitchen-backsplash scope, the same fixture-point
logic already established for plumbing and item 17's bath accessories, and correlates far
more tightly with bathroom count than with raw GSF. Floor tile stays a real spec fork
against item 19, not a driver question.

**Containers (Matt, 2026-09-20), checked against TCNA's own shower waterproofing
methods before proposing.** VA's "Mud Job at Shower" turns out to be a real, named
industry method, the traditional mortar-bed shower pan, not a generic allowance — one of
two standard approaches, the other being a sheet membrane system like Schluter.

1. **Wall Tile.** Required. Bathroom walls and kitchen backsplash areas. Real evidence in
   every priced file.
2. **Floor Tile.** Conditional, and this is a real spec fork against item 19 rather than
   a documentation gap. JF is the only file that tiles bathroom floors, $19.70/SF. The
   three Vue files price "Bathroom Resilient Flooring" instead, item 19's own premium
   container, $26–37/SF — a genuine material choice between jobs, not missing data.
3. **Backsplash Tile.** Conditional, kitchen-specific. JF only, self-performed.
4. **Shower Waterproofing System.** Likely missing on three of four files. VA's mud-pan
   line is real evidence this scope exists. JF, V64, and VR all price wall tile in
   bathrooms with no corresponding waterproofing or pan line at all — either bundled
   into the wall tile rate, or priced without it.
5. **Saddles and Thresholds.** Required. The stone or marble piece set at a doorway or
   shower curb where tile meets another flooring material, distinct from item 19's
   Transition Strips, which are resilient-to-resilient vinyl or metal strips. Zero
   evidence in any file, and no plausible reading where this is bundled elsewhere.

**Flag:** cement backer board, the wet-area substrate tile is actually set on, isn't
standard drywall, and neither this item nor item 17's Gypsum Wall Board Installation
container prices it separately anywhere. Worth a look when item 17 comes back up.

### 19. Flooring — resilient and carpet

**Amended (Matt, 2026-09-20): Wood Flooring split out to item 19a.** The source files
already carry it under its own ProEst code, 09.06400, distinct from this item's 09.06000,
so the split matches how the data was already organized, not a new distinction.

**Sources:**
- JF: "Sealed Concrete," "Luxury Vinyl Plank," "4" Rubber Cove Base," "Broadloom Carpet,"
  "Walk-Off Mat" (r112–r116, code 09.06000).
- V64: "LVT - Corridor," "Luxury Vinyl Plank," "Johnsonite Rubber Flooring," "Bathroom
  Resilient Flooring" (r151–r154, code 09.06000).
- VA: "VCT," "Luxury Vinyl Plank," "Bathroom Resilient Flooring" (r154–r156, code
  09.06000).
- VR: same structure as V64 (r156–r159, code 09.06000).
- WS, VG: no line.

**Unit/quantity signal:** SF for sheet/plank flooring, LF for cove base, SY for carpet —
all scaling with floor area, one true unit-rate mismatch between SF and SY to watch for
in the importer.

**Quantity driver (LA-720, 2026-09-20): gross square feet.** Unit Interior Resilient
Flooring, the dominant container on every file (V64/VR 75,972 SF, VA 99,750 SF), prices
against floor area, a GSF-derived ratio once unit mix is known.

**Containers (Matt, 2026-09-20), checked against trade practice before proposing.**
JF's Broadloom Carpet at $55/SY is almost certainly an all-in rate, carpet, pad, and
install priced as one system number, the same convention already confirmed for
paint's primer-plus-finish pricing — not a gap.

1. **Unit Interior Resilient Flooring.** Required. The dominant scope: V64/VR at
   75,972 SF, VA at 99,750 SF.
2. **Corridor and Common-Area Resilient Flooring.** Required, a distinct material from
   unit flooring. V64: 11,687.63 SF at $7.00, heavier commercial-grade LVT against the
   residential LVP in units.
3. **Wet-Area Resilient Flooring.** Required. Already priced at a real premium in every
   file, $26–37/SF against $5–7.50/SF general LVP, a genuine waterproof product
   distinction, not an error.
4. **Carpet, Including Pad.** Conditional. JF only, bundled system pricing per the note
   above.
5. **Utility and Back-of-House Flooring.** Required. JF's Sealed Concrete and VA's VCT
   serve the same functional role, mechanical rooms and storage, with different
   materials, worth one container rather than two.
6. **Resilient Base.** Required. JF: 756.16 LF at $3.00.
7. **Walk-Off Mats.** Required, small. JF only.
8. **Subfloor Preparation and Moisture Testing.** Likely missing, not just conditional.
   Industry sources call this the most underestimated line item in flooring, moisture
   testing per ASTM F2170/F1869, flatness correction, self-leveling compound, especially
   on concrete slab construction. Zero evidence in any file.
9. **Transition Strips and Stair Nosing.** Likely missing. Standard accessory scope at
   every material boundary and interior stair edge. Zero evidence anywhere.
10. **Concrete Pan Stair Tread and Riser Covering.** Likely missing, added (Matt,
    2026-09-20), cross-referenced from item 2's concrete infill finding. Wherever item
    2's concrete infill applies, a full tread and riser covering, commonly rubber, is
    standard practice, protecting the fill and nosing from months of construction foot
    and equipment traffic before the building is finished. Distinct from container 9's
    nosing, this is a full surface covering, not just the leading edge.

### 19a. Wood flooring

Split from item 19 (Matt, 2026-09-20). A conditional, spec-driven upgrade over resilient
flooring, not a required base scope.

**Sources:**
- V64: "Wood Flooring (High End)" 5,958.89 SF $20.00 (r157, code 09.06400).
- VA: "Wood Flooring (High End)" 5,417.17 SF $20.00 (r159, code 09.06400).
- VR: "Wood Flooring (High End)" 5,958.89 SF $20.00 (r162, code 09.06400).
- JF, WS, VG: no line.

**Unit/quantity signal:** SF, scaling with floor area receiving the upgrade. All three
priced files land at the identical $20.00 rate, the closest thing to a confirmed rate
found on any conditional item so far.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on finish-level
spec.** Same driver as item 19, since this is a material upgrade over the same floor
area, not a different scope of area.

### 20. Painting

**Sources:**
- JF: "Paint Molding" 19,076.79 LF $1.50; "Paint GWB Walls" 60,493.28 SF $1.25; "Paint
  GWB Ceilings" 22,800 SF $1.50 (r119–r121, code 09.09100).
- V64: wall/base/ceiling paint plus "Paint/Stain New Doors & Casing," "...& Frames,"
  "Paint Window Casing" (r160–r165).
- VA: same structure, larger scale (r162–r170).
- VR: same structure; one negative-quantity line, "Paint GWB Walls" **-3,000 SF** =
  **-$3,750** (r165) — a deduct/correction row, likely offsetting a duplicate elsewhere in
  this revised file.
- WS, VG: no line.

**Unit/quantity signal:** SF for walls/ceilings, LF for molding/casing trim, EA for
door/frame paint — scales with interior surface area.

**Quantity driver (LA-720, 2026-09-20): gross square feet.** Interior Wall and Ceiling
Painting, the dominant scope everywhere, prices per SF of surface, itself a GSF-derived
ratio. Trim and door paint stay real, smaller sub-container detail keyed to items 9 and
15's own EA/LF counts, not a competing item-level driver.

**Containers (Matt, 2026-09-20), checked against trade practice before proposing.**
Multi-family painting splits into new-construction interior coating, exterior coating,
specialty/wet-area coating, and punch-list work. Every file here prices walls and
ceilings as one blended rate per square foot with no separate primer line, which is
correct standard practice, primer plus finish coats bid as one system price, not itemized
by coat, not a gap.

1. **Interior Wall and Ceiling Painting.** Required. The dominant scope everywhere.
2. **Interior Trim and Casing Painting.** Required.
3. **Door and Frame Paint/Stain.** Required. VA's walk-in closet door prices at $300
   against $175 for the other two door types, the same spec driver already established
   for that door in item 9.
4. **Wet-Area Specialty Coating.** Likely missing, not just conditional. Bathrooms and
   kitchens standardly get a moisture-resistant primer and a higher-sheen finish system at
   a premium over the general wall rate. None of the six files price this separately —
   either silently blended into the general wall rate, understating true wet-area cost, or
   genuinely omitted.
5. **Exterior Painting.** Conditional on siding material. Zero evidence across every file.
   Ties to item 14: painting the siding is this trade's scope even though it's applied to
   a different item's substrate, the same logic already used for drywall against framing.
   The likelier explanation for the total absence is pre-finished siding that never needs
   field paint, but that's unconfirmed.
6. **Garage Floor Coating.** Likely missing. VA and West Shore both have structured
   parking, and neither prices a floor sealer or epoxy coating, a real and sometimes
   code-required scope for dusting control on exposed structural concrete. No other item
   would plausibly absorb this cost, so its absence reads as a gap, not a bundle.
7. **Punch List and Touch-Up Painting.** Not its own container. Standard practice folds
   this into the main contract price rather than billing it separately.

**Flag:** `jeffersons-ferry-scope-comparison.md` names painting as one of the three
interior packages priced consistently high by quantity takeoff (+70% against buyout).
VR's negative-quantity line (r165) should be checked before this file is imported — a
negative SF quantity on a paint line either corrects a prior duplicate or signals a
takeoff error, and nothing in the file says which.
**Resolved (Matt, 2026-09-18): intentional, not an error.** This is how the estimating
software handles a wall that has tile or another finish on part of it: it prices the
full wall for paint, then subtracts the area covered by the other finish so that area
isn't double-charged for paint and tile both. Negative paint lines of this kind should be
imported as-is and netted against their matching wall line, not stripped out or
flagged as a data-entry error.

---

## Division 10 — Specialties

### 21. Specialties — protection, accessories, storage, lockers, mailboxes

A grab-bag by nature: this is the one division where ProEst sub-codes are the most
fragmented across files (10.02600, 10.02800, 10.02900, 10.04400, 10.05000, 10.05110,
10.05523), and no two files use the same subset.

**Sources:**
- JF: "18 Ga. SS Corner Guards 2" Wings" 21.00 EA $200.84 (r126, code 10.02600 — the
  second confirmed instance of the digit-leading description parse trap); "Toilet
  Accessories - Per Unit" 15.00 LS $2,500 (r129, code 10.02900); "Storage Gates" 154.07 LF
  $100 (r132, code 10.05000).
- V64: "Bath Accessories (Budget Per Bathroom)" 105.00 EA $1,000; "Trash Receptacle"
  3.00 EA $148.46 (r170–r171, code 10.02800); "ASI One-Tier Traditional Locker" 5.00 EA
  $575 (r174, code 10.05110); "Mailboxes" 1.00 LS $15,000 plus "Salsbury...Mailbox"
  10.00 EA $1,500 (r177–r178, code 10.05523).
- VA: "Bath Accessories" 158.00 EA $1,550 (r175, code 10.02800) — no lockers or mailboxes
  priced.
- VR: bath accessories, mailboxes (r175, r179, r182–r183) — no lockers.
- VG: "Fire Extinguisher Cabinet + FE" 48.00 EA $350 (r29, code 10.04400); "ASI One-Tier
  Traditional Locker" 14.00 EA $575 (r32, code 10.05110); "Salsbury...Mailbox" 11.00 EA
  $1,500 (r35, code 10.05523) — Villa's only real (non-wall-area) line items.
- WS: no line.

**Unit/quantity signal:** EA, scaling with bathroom count, mailbox-bank count, or unit
count depending on sub-item; LF for storage gates and corner guards, scaling with
corridor length.

**Quantity driver (LA-720, 2026-09-20): bathroom count.** Toilet and Bath Accessories
(container 1) is the one container with real evidence in four files, the richest
evidence on this item, and it's a per-bathroom fixture-point quantity, the same logic
already established for plumbing, item 17, and item 18. Postal Specialties and other EA
containers stay unit-count-driven sub-detail rather than competing item-level drivers.

**Containers (Matt, 2026-09-20), checked against CSI Division 10's own category list and
ADA/FHA signage rules before proposing.**

1. **Toilet and Bath Accessories.** Required. Real evidence in four files.
2. **Signage.** Likely missing, the strongest finding here. Tactile unit ID and ADA
   accessible-route signage, legally required on every job regardless of size or product
   type, unlike most other findings in this review this one has no real-world exception.
   Zero evidence across all six files. Code-required life-safety and accessibility
   signage only, narrowed (Matt, 2026-09-20) now that container 10 below covers the
   marketing and wayfinding side of signage as its own, non-code-driven scope.
3. **Fire Protection Specialties.** Required by code — NFPA 10 mandates extinguisher
   cabinets at set corridor intervals. Only Villa prices this, and Villa is already the
   file whose wall-area pricing is weighted low elsewhere in this list. Five of six jobs
   show nothing for a universal life-safety requirement.
4. **Postal Specialties.** Required. USPS centralized mail delivery rules apply to
   essentially every multifamily building. Real evidence in three files.
5. **Corner Guards.** Conditional, corridor-driven. JF only.
6. **Lockers.** Conditional, amenity or storage-driven. V64 and Villa.
7. **Storage Gates and Cages.** Conditional, storage-amenity driven. JF only.
8. **Trash Receptacles.** Conditional, small. V64 only.
9. **Bike Storage, Indoor.** Conditional, increasingly code-required on transit-oriented
   sites. The same storage-assembly category as Lockers and Storage Gates above it, a
   dedicated room with wall-mounted or floor-anchored racks. Zero evidence in any file.
   Outdoor surface bike racks are a different thing, site furnishings at the same level
   as benches and trash receptacles at grade, and belong with the site items, not here.
10. **Wayfinding and Building Identification Signage, added (Matt, 2026-09-20).**
    Distinct from container 2 above: a monument or building-identification sign, interior
    wayfinding and directory signage, leasing office signage. Not code-driven, a real
    line on essentially every developer's budget regardless, and easy to lose once it's
    lumped in with the ADA signage container above rather than kept separate. Zero
    evidence in any file.

### 22. Residential appliances

**Sources:**
- JF: "Appliances - Allowance per Unit" 15.00 EA $4,000 = $60,000 (r137, code 11.03100).
- V64: "Refrigerator" 75.00 EA $2,000; "Dishwasher" 75.00 EA $1,200; "Range" 75.00 EA
  $2,500; "Washer & dryer" 75.00 EA $3,000 (r183–r186).
- VA: same four fixture types, higher rates, 133 EA (r180–r183).
- VR: same four types, higher rates again, 75 EA (r188–r191).
- WS, VG: no line.

**Unit/quantity signal:** EA, scaling with dwelling unit count. JF prices this as one
per-unit allowance; V64/VA/VR break it into four separate appliance types at the same
unit count — a difference in estimating grain, not scope, worth normalizing in the
importer.

**Quantity driver (LA-720, 2026-09-20): unit count.** Every file, whichever estimating
grain it uses, prices this at the same unit count; the cleanest single-driver evidence on
the whole list, all four sources agree.

**Containers (Matt, 2026-09-20), checked against standard multifamily appliance package
composition before proposing.**

1. **Kitchen Appliance Package (Refrigerator, Dishwasher, Range).** Required. Real
   evidence in all four priced files, one per unit.
2. **Range Hood or Microwave-Hood Combo.** Likely missing. Standard appliance packages
   now commonly include this as a fifth appliance, an over-the-range microwave often
   doing double duty as the exhaust hood. Zero evidence in any file.
3. **In-Unit Washer and Dryer.** Conditional on unit design. Real evidence in three
   files, priced per unit.
4. **Common Laundry Equipment.** Likely missing, and a genuinely different scope from
   container 3, not a variant of it. Where a building doesn't do full in-unit laundry,
   industry practice sizes commercial-grade machines at roughly one washer and dryer
   pair per 8 to 12 units, a different driver entirely, plus real infrastructure cost on
   top of the machines, commercial plumbing and mechanical permits, dedicated exhaust,
   sometimes separate metering. Plumbing's own Common Laundry hookup scope, already
   noted elsewhere in this review, has no matching equipment cost anywhere.

### 23. Trash compactors and chutes

**Sources:**
- JF: "Trash Compactor (One Apple Pak Model #100)" 1.00 EA $26,000 (r140, code 11.08200);
  "Trash Chutes (ea per trash room)" 3.00 EA $12,500 = $37,500, filed separately under
  **Division 14** (r153, code 14.09000).
- V64: same compactor model, 1.00 EA $26,000 (r189).
- VA: same compactor model, 2.00 EA $50,000 = $100,000 (r186).
- VR: same line, zeroed (r194).
- WS, VG: no line.

**Unit/quantity signal:** EA, scaling with building count (compactor) or trash-room count
(chutes).

**Quantity driver (LA-720, 2026-09-20): EA per building.** One compactor and a small,
step-wise count of chutes serves a building regardless of size within the ranges these
six jobs show, not a quantity that scales continuously with GSF or unit count. Worth
confirming this holds at a genuinely larger building before treating it as settled.

**Containers (Matt, 2026-09-20), checked against trash chute system code requirements
before proposing.**

1. **Trash Compactor.** Required. Real evidence, one per building.
2. **Trash Chute, Vertical Shaft and Intake Doors.** Required. Real evidence, $12,500
   per chute. Unclear whether that rate already includes the fire-rated intake door on
   every floor, or just the vertical chute run — intake doors are priced per floor in
   the trade, not per chute, worth confirming before this becomes a benchmark.
   Firestopping the chute's own floor penetration at every level, distinct from the
   intake door itself, is item 14a's scope.
3. **Recycling Chute.** Conditional, spec-driven, increasingly required by local
   recycling ordinances as a parallel system to the trash chute. Zero evidence anywhere.

**Two real findings that belong to other items, the same breakout logic already used
for the elevator and pit sump elsewhere on this list, not new containers here.** Code
requires the chute run through a fire-rated shaft with self-closing, fire-rated doors at
each floor — that's framing and drywall construction, items 8 and 17's scope, not the
chute manufacturer's. NFPA 13 also requires a dedicated sprinkler head at the chute's top
service opening and another in the hopper or discharge area — that's item 27's scope,
specific enough that LA-774's sprinkler design pass should know about it directly rather
than infer it.

**Flag M7 (carried from `jeffersons-ferry-scope-comparison.md`):** trash compactors and
chutes have no Autodesk group counterpart at all on the one job checked against buyout
data. This canonical item may be real scope that Autodesk simply never separates from
General Conditions or another catch-all — worth confirming before it is used as a
benchmark input, since a $0 Autodesk-side figure does not necessarily mean the scope was
dropped.

---

## Division 12 — Furnishings

### 24. Cabinetry

**Amended (Matt, 2026-09-20): narrowed to cabinetry only.** Countertops and Window
Treatments split out to items 24a and 24b, renamed from "Cabinetry, countertops, and
window treatments" to reflect the narrower scope.

**Sources:**
- JF: "Unit Kitchen Cabinets and Countertops" 15.00 EA $6,500 (r148, code 12.03800) —
  bundles countertop cost into this cabinet line rather than separating it, so JF's
  figure here includes countertop scope too, not a comparable cabinet-only number
  against the other files.
- V64: "Kitchen & Vanity cabinets & SS Countertops" 75.00 EA $11,000 (r194) — same
  bundling issue as JF.
- VA: "Kitchen & Vanity cabinets" 1.00 LS $1,200,000 (r195, code 12.03800).
- VR: same cabinetry line as V64 (r199).
- WS, VG: no line.

**Unit/quantity signal:** EA scaling with unit count (JF, V64, VR); one LS at VA.

**Quantity driver (LA-720, 2026-09-20): unit count.** Kitchen and vanity cabinetry is a
per-unit fixture package on the three files that separate EA pricing; VA's LS figure is
the exception, not counter-evidence.

**Containers (Matt, 2026-09-20).**

1. **Kitchen Cabinets.** Required.
2. **Vanity Cabinets.** Required. Every file that prices this actually bundles kitchen
   and vanity into one line, "Kitchen & Vanity cabinets," so this split isn't evidenced
   yet — the two containers share one number until a file separates them.
3. **Cabinet Hardware.** Likely missing. Pulls, knobs, soft-close hinges, and
   full-extension slides are a real, separately specified line in the trade, distinct
   from the cabinet box price. Zero evidence in any file.

### 24a. Countertops

Split from item 24 (Matt, 2026-09-20).

**Sources:**
- VA: "Solid Surface Countertops" 1,027.00 SF $100; "Stone Countertops (From
  Elevations)" 5,958.40 SF $120 (r191–r192, code 12.03600).
- JF and V64 bundle countertop cost into item 24's cabinet line rather than pricing it
  separately (see the note there).
- VR, WS, VG: no line.

**Unit/quantity signal:** SF, scaling with countertop area, covering both kitchen and
bath vanity tops as one trade scope per real installation practice (templating,
fabrication, seaming, and cutouts together). Two material tiers already evidenced,
Solid Surface and Stone, a real spec driver worth keeping visible rather than blending
into one rate.

**Quantity driver (LA-720, 2026-09-20): SF of countertop area.** VA's own two material
tiers both price per SF; countertop run length tracks kitchen and vanity layout, not a
clean GSF or unit-count ratio on its own.

### 24b. Window treatments

Split from item 24 (Matt, 2026-09-20).

**Sources:**
- JF: "Window Treatments" 1.00 ALLW $35,000 (r145, code 12.02000).
- V64, VA, VR, WS, VG: no line.

**Unit/quantity signal:** unclear from the one data point available — JF's number is one
lump sum with no unit count given, so it's unclear whether it's a per-unit blinds package
for the whole building or a common-area-only allowance.

**Quantity driver (LA-720, 2026-09-20): unit count, the working assumption pending real
evidence.** A basic blinds package is standard trade practice priced per unit, not per
building; flagged low-confidence since JF's one data point can't itself confirm this.

**Flag:** likely a real gap on the other three priced files rather than a genuine
conditional difference. Basic blinds are close to a universal expectation in US
apartments, not an upgrade feature some jobs skip, so V64, VA, and VR pricing nothing
here is more likely a documentation gap than evidence the scope doesn't exist on those
jobs.

---

## Division 13 — Special Construction

### 25. Amenity special construction — pools, fitness, sauna

**Sources:**
- V64: "Pool Budget (Small)" 1.00 LS $268,000 (r199, code 13.01100); "Fitness Equipment"
  1.00 LS $75,000 (r202, code 13.02400).
- VR: same two lines, "Pool Budget (Small)" $100,000 and "Fitness Equipment" $1 (r204,
  r207 — the $1 fitness-equipment line looks like a placeholder, not real pricing).
- VG: "Sauna Equipment Package" 2.00 EA $3,500 (r40, code 13.03400).
- VA: **no line under Division 13 at all.** Instead, indoor/outdoor amenity scope is
  priced under the Division 95 "Ammenities" allowance bucket: "Indoor Amenities" 3,700 SF
  $400 = $1,480,000 and "Outdoor amenities" 1,328.77 SF $350 = $465,070 (r320, r324).
- V64's "97.00000 Allowances" bucket also carries "Amenity Allowance" 1.00 LS $500,000
  (r298), zeroed at VR's equivalent row (r303). Confirmed (Matt, 2026-09-18) as a lump-sum
  budget for the amenity package generally, mapped here rather than left unmapped.
- JF, WS: no line.

**Unit/quantity signal:** LS for pool/fitness/sauna packages, not scaling cleanly with
any single quantity — these read as fixed per-building or per-project allowances rather
than per-SF or per-unit scope.

**Quantity driver (LA-720, 2026-09-20): fixed lump sum**, already decided below on
2026-09-18: a program choice, not an area or unit ratio.

**Flag:** the same real-world amenity scope is priced as normal Division 13 line items on
V64 and VR but folded into an omnibus Division 95 allowance on VA, at a per-SF rate
($400/SF and $350/SF) rather than a lump sum. That is a large basis difference
($1.9M combined at VA vs. $268,000–$343,000 combined at V64/VR for what appears to be
comparable amenity space).
**Resolved (Matt, 2026-09-18): a lump sum is the appropriate basis for this item.** VA's
per-SF allowance approach is the wrong basis, not evidence of a genuinely larger amenity
package. Treat V64/VR's lump-sum lines as the pattern to follow; VA's figure should not be
read as a higher comparable without re-pricing it as a lump sum first.

**Containers (Matt, 2026-09-20): Site Furnishings added, filling a real gap in the
canonical list.** Benches, grills, bollards, planters, shade structures, and outdoor
trash and recycling receptacles at grade had no home anywhere in this list until now —
distinct from item 21's Trash Receptacles container, which is the indoor equivalent, same
object, different location, different trade. VA's "Pergola Allowance (over 6,000 sf)"
1.00 LS $120,000 (r323), already flagged elsewhere in this document as needing its own
sub-line breakdown rather than a lump figure, is the real evidence anchoring this
container and belongs here rather than staying an orphaned allowance line.

1. **Pool, Fitness, and Sauna.** Required per the Amenity Scope gate. Real evidence as
   documented above.
2. **Site Furnishings.** Required per the Amenity Scope gate. Benches, grills, bollards,
   planters, shade structures (VA's pergola), outdoor trash and recycling receptacles.
   Real evidence only for the pergola; the rest starts with zero evidence, proposed
   because a real amenity courtyard always carries some of this scope.

**Flagged for a future pass, not resolved here (Matt, 2026-09-20): dog-specific
amenities.** Dog parks, pet washing or spa stations, waste stations, synthetic turf.
Common and growing enough in multifamily to deserve its own container set and its own
look at real cost drivers rather than folding it into Site Furnishings as an afterthought.
Likely gated by the same Amenity Scope gate once scoped.

**Flagged for a future pass, not resolved here (Matt, 2026-09-20): roof-deck amenity as
an alternate to grade-level.** A tighter Long Island infill site that can't fit a real
courtyard sometimes moves the pool, fitness, or lounge program to the roof instead. Same
Amenity Scope gate, but a real structural and waterproofing cost this item doesn't carry
today, on top of the roofing containers already priced in item 13: a heavier structural
deck to carry amenity live loads, and a pedestrian traffic-rated roof membrane instead of
a standard low-slope one. Zero evidence in any file, all six jobs use grade-level
amenity space.

---

## Division 14 — Conveying Systems

### 26. Elevators

**Sources:**
- JF: "Hydraulic Elevator 6-Stop 100 FPM 3000Lb Capacity" 2.00 EA $190,000 = $380,000
  (r207, code **14.02000**).
- V64: same description and code, 2.00 EA $190,000 (r207).
- VA: "Elevators (Per Stop) - Breakout for ground level" 2.00 EA $33,000 = $66,000,
  immediately followed by "Elevators (Per Stop) -Deduct- Breakout for ground level"
  2.00 EA **-$33,000** = **-$66,000** (a net-zero takeoff pair, same pattern as the CMU
  deduct lines in item 5), then "Elevators (Per Stop)" 12.00 EA $33,000 = $396,000
  (r200–r202, code 14.02000).
- VR: same description as JF/V64, zeroed, 0.00 EA $105,960 (r212).
- WS: "Elevator, electric, 6 stop, 6 op, 250 fpm, 3000 lb" 2.00 EA $271,858.84 =
  $543,717.68 (r37, code **14.21001 ELEVATORS**).
- VG: no line.

**Unit/quantity signal:** EA (per elevator) at JF/V64/WS; VA instead prices per stop
(12 stops ÷ 2 elevators = 6 stops each, consistent with the other files' "6-stop"
description, but expressed as a different unit of quantity).

**Quantity driver (LA-720, 2026-09-20): per stop**, already decided below on 2026-09-18,
derived from Stories rather than needing its own question.

**Flag:** confirms the code drift `rom-system-design.md` already names (14.02000 vs
14.21001). Beyond the code, the unit rate itself is not close: $190,000/elevator (JF,
V64), $33,000/stop × 6 stops = $198,000/elevator-equivalent (VA, roughly consistent),
versus $271,858.84/elevator at West Shore — 43% above the others.
**Corrected (Matt, 2026-09-20): this is very likely a technology difference, not a rate
inconsistency.** Hydraulic elevators top out around 150 FPM and roughly five to six
stories of travel; above that, traction is the only real option. JF and V64's 100 FPM is
squarely hydraulic. West Shore's 250 FPM is traction speed. West Shore's higher number
most likely reflects a different elevator type entirely, not the same product priced
differently. See LA-784, opened to derive elevator type from building height.

**Containers (Matt, 2026-09-20).**

1. **Elevator Cab and Hoist Mechanism.** Required. The $41,000/stop trade number above.
2. **Cab Interior Finish Package.** Likely missing. In Class A multifamily especially,
   the cab's interior finish, upgraded wall panels, flooring, mirrors, handrails, is
   commonly its own selection distinct from the base mechanical unit. No file shows this
   split out.
3. **Elevator Pit Waterproofing.** Conditional, derivable from Levels Below Grade,
   already a captured field. The pit is below-grade construction; if a job already needs
   Foundation Waterproofing, item 2's container, the pit is one more below-grade area
   needing the same treatment. No new question needed.
4. **Elevator Pit Ladder.** Required wherever an elevator exists. Code requires a fixed
   means of access into every pit for mechanics, the same near-universal, small-dollar
   shape as door saddles or self-closing devices found elsewhere in this review.

**Cross-item flags, not resolved here:** a traction elevator (LA-784) needs a penthouse
machine room instead of a small ground-level one, a real construction cost on items 2,
8, and 13 that none of them currently name as its own line. An elevator pit below the
sewer invert also needs a sewage ejector and sump, item 28's Specialties container,
closed there rather than duplicated as a container of this item. The hoistway is
itself a rated shaft, and firestopping every feed and, on a hydraulic system, piston
piping that penetrates it, is item 14a's scope.

**Fire alarm and sprinkler cross-checked against elevators (Matt, 2026-09-20), a real
three-trade coordination point currently priced nowhere.** NFPA 13 requires sprinklers
in the elevator machine room and at the top of the hoistway, but ASME A17.1 requires
elevator power to shut off before that sprinkler discharges. A dedicated heat detector,
more sensitive than the sprinkler head and distinct from it, sits within 24 inches of
each of those heads specifically to trip that shutoff first, sometimes with a short
delay to let the car return to the designated floor before power actually cuts. Three
separate items, three separate scopes, one physical requirement: item 27's Sprinkler
Piping and Heads container needs the machine room and hoistway heads named, item 32's
System Interfaces container needs the dedicated heat detector named as its own device,
not folded into general Initiating Devices, and item 31's Elevator and Equipment Feeds
container needs the shunt trip breaker itself. One real exception worth keeping:
sprinkler heads in the pit are exempt from this requirement entirely if placed within 2
feet of the pit floor, so this applies to the machine room and hoistway only, not the
pit already covered by container 3 above.
**Resolved (Matt, 2026-09-18): $41,000 per stop is the trade number to use**, from
experience, superseding the file's varying rates. Assumed to be per stop, matching VA's
per-stop granularity, not per whole elevator — flag for correction if per-elevator was
meant instead. This makes "per stop" the quantity driver for this item, not per-elevator
or per-building, which also answers part of LA-720 for this specific item.
**Closed:** VA's paired breakout/deduct lines (r200–r202) net to zero the same way as the
CMU pair in item 5. Role `takeoff_helper`, same convention, no new decision needed.

---

## Division 21 — Fire Suppression

### 27. Fire sprinkler system

**Sources:**
- JF: "Sprinkler Budget" 22,800 SF $11.00 (r158). Total $250,800.
- V64: "Sprinkler Budget" 101,200 SF $6.00 (r212). Total $607,200.
- VA: "Sprinkler Breakout" 40,000 SF $6.00 = $240,000 plus "Sprinkler Budget" 203,658 SF
  $6.00 = $1,221,948 (r210–r211). Total $1,461,948.
- VR: "Sprinkler Budget" 101,200 SF $3.30 (r217). Total $333,960.
- WS, VG: no line.

**Unit/quantity signal:** SF, apparently scaling with gross square feet (or, at VA, with
a ground-floor/upper-floor split — see the flag below).

**Quantity driver (LA-720, 2026-09-20): gross square feet**, per the Summary's own
2026-09-18 resolution: "dollars per gross square foot stands as the basis for now," an
accepted known limitation rather than a silent assumption. Standpipe (stories-derived)
and Fire Pump (hydraulic-demand-conditional) stay real sub-container exceptions inside
this one blended item driver, not competing drivers, until LA-774 gives this item a
better internal quantity than flat square feet.

**Flag:** the per-SF rate spans $3.30 to $11.00 across four files with no stated reason
for the difference. `jeffersons-ferry-scope-comparison.md` already found JF's $11.00/SF
rate was 170% over the actual bought rate of $4.08/SF on that job — the worst single
variance in the whole comparison. VA's split between a "breakout" line and a main budget
line (also seen in HVAC and electrical below) looks like a ground-floor/garage-vs-tower
split unique to that file; confirm before assuming it is additive with the other files'
single-line approach.

**Amended (Matt, 2026-09-19): VA's own numbers name a real gap, not just an unexplained
spread.** Its garage-level line and its tower line price at the identical $6.00/SF, but
NFPA 13 hazard classification says a garage (Ordinary Hazard) should cost more per
square foot than a residential corridor (Light Hazard), not the same. See LA-774 for the
proposal to have Jev reason through hazard classification, standpipe, and fire pump
internally to get a better pricing quantity than flat square feet. Until that lands, this
item stays one blended rate.

**Superseded (Matt, 2026-09-20): shown as an engineered design criterion, not hidden.**
LA-774's research (`docs/precon/research/la-774-sprinkler-pricing-quantity.md`) found
hazard classification is a national NFPA 13 table keyed to space use, not a jurisdiction
lookup, so it does not need Jev; standpipe already derives from stories; fire pump needs
a site water-supply flow test that does not exist at ROM intake, so it stays an
estimator-stated gate for now. The "never as an engineered system shown to anyone" framing
above is reversed: the new design-criteria panel ticket (parent LA-9, filed once Linear
reconnects) shows this derived system type and hazard classification on the ROM face as
a labeled assumption, the same treatment as electrical service size, insulation R-value,
HVAC tonnage, and elevator type. This item's price stays the flat blended rate from the
sources above; no specific rate is set by this amendment.

**Cross-checked against windows (Matt, 2026-09-20), and it surfaces a real fact this
item has never captured: full NFPA 13 versus NFPA 13R.** IBC ties allowable window and
opening area directly to sprinkler protection near a property line — under 3 feet of
fire separation distance, no windows at all regardless of sprinklers; under 5 feet, no
unprotected windows unless the building has automatic sprinklers, capped around 15% of
that wall's area even then. Only full NFPA 13 counts toward this allowance, not NFPA
13R, the simpler system most garden-style wood-frame buildings under four stories
actually use. This item has never distinguished which system type any of these jobs
carries, and it plausibly explains part of the rate spread above, not just JF's known
takeoff error: 13R exempts many spaces closets, small bathrooms, some attics and
garages from coverage entirely, which would genuinely lower its per-square-foot cost
against a full 13 system, not just look like a benchmarking mistake. Worth confirming
system type on future imports rather than assuming every job carries the same one.
Cross-referenced into item 16a, since it's a real constraint on window design near a
property line, not a cost line on this item, and fire alarm side comes up empty here,
this is specifically a sprinkler-and-openings provision.

**Containers (Matt, 2026-09-20), finally written in.** Sketched in chat during the
LA-774 discussion but never actually committed here until now, the same gap just closed
on item 28. No file separates any of this internal structure, every dollar in every file
sits in one blended SF rate, so all five containers below start with zero direct
evidence and lean on real trade practice instead, flagged plainly.

1. **Sprinkler Piping and Heads.** Required. The base wet-pipe coverage through units and
   common areas. Every dollar in every file sits here today, undifferentiated. Also
   picks up item 23's trash chute sprinkler heads at the top service opening and hopper,
   per NFPA 13, already noted directly on LA-774. Also picks up the machine room and
   hoistway heads required by NFPA 13, part of the shunt trip coordination detailed on
   item 26, not the pit head already exempt from it there. Also picks up under-stair
   coverage wherever item 8a's wood stairs apply, detailed on item 15. Also picks up
   sidewall sprinklers required under exterior balconies extending more than 4 feet on
   Type V construction, per NFPA 13 Section 9.3.20.1, detailed on item 11. Firestopping
   the branch piping's own penetrations through rated walls is item 14a's scope, not
   this one.
2. **Water Supply, Backflow, and FDC.** Required. Per building. No file isolates it.
3. **Standpipe System.** Required above a height threshold, derived from stories the
   same way elevator stops already are, rather than needing its own question. Also
   carries a recessed hose valve cabinet at every floor landing, added (Matt,
   2026-09-20): NFPA 14 and NFPA 1 both require it recessed in a finished corridor
   specifically to satisfy ADA's protruding-object rule, a real fire-protection and
   accessibility interaction, not just a mounting preference.
4. **Fire Pump and Pump Room.** Conditional, driven by hydraulic demand, whether the
   city main can supply enough pressure and flow for the building's height and area.
   Less certain this derives cleanly from stories alone the way Standpipe does; it also
   depends on local water main capacity, which Kulka's estimators may know cold for its
   usual submarkets even without a site-specific test.
   **Cross-checked against Sprinkler's own scope (Matt, 2026-09-20).** NFPA 20 explicitly
   requires a floor drain in every fire pump room, code-mandated, not optional. Where the
   room sits below grade, NFPA 20 separately flags this with a caution and calls for
   "additional flood protection measures such as sump pumps," a fifth distinct
   drainage/sump system on this document, alongside item 2's foundation footing drain
   and areaway drain, item 26's elevator pit sump, and item 28's sewage ejector sump —
   worth keeping named separately from all four rather than assuming one covers it.
   Also real and currently unpriced: the test header discharge piping, required by NFPA
   20 with its own valve, and routed to either sanitary or storm depending on local
   plumbing code, a real coordination point since IPC and NFPA 20 don't agree on which.

   **Cross-checked against remaining trades (Matt, 2026-09-20), two more real findings,
   the electrical one significant, not minor.** NEC 695.3 and NFPA 20 require an
   electric fire pump's power supply to come from one of three specific
   configurations: a dedicated service separate from the building's, a tap ahead of the
   building's main disconnect so shutting off building power doesn't kill the fire
   pump, or a dedicated feeder from a standby generator sized for the full fire pump
   load plus its jockey pump plus 8 hours of continuous fuel. This is mandatory
   whenever this container applies, unlike item 31's general Emergency Generator
   container, which correctly defaults to no. A fire pump can trigger its own dedicated
   power infrastructure even on a job with no general building backup power at all,
   currently unaddressed anywhere on item 31. Separately, NFPA 20 requires the fire pump
   room itself be maintained at a minimum temperature, roughly 40°F for an electric
   pump, higher for a diesel engine-driven one due to the battery and block heater, a
   real, room-specific heating requirement belonging to item 30, HVAC, not general
   building heat. A third finding, this time on fire alarm: the pump controller's own
   supervisory signals, pump running, power failure, phase reversal, and transfer to
   alternate power, are a distinct monitoring set from general sprinkler flow and
   tamper monitoring, detailed on item 32's System Interfaces container.

   **Cross-checked against remaining trades (Matt, 2026-09-20), two more findings, one
   a straightforward closed loop, one a real construction gap.** The pump and its
   controller sit on a housekeeping pad, already item 2's Equipment Pads and Misc.
   Concrete container, just never pointed at the fire pump specifically until now, no
   new scope, just closing the reference. Separately, and this one is real
   construction not yet homed anywhere: NFPA 20 requires the room itself enclosed in
   fire-rated construction, 1-hour for a non-high-rise building, 2-hour for a
   high-rise, covering the walls, floor, ceiling, and door, plus a rated passageway if
   the room isn't directly accessible from the exterior. Which item actually carries
   this depends on how the enclosure is built, concrete or CMU walls land on item 2 or
   item 5, a metal-stud and drywall rated assembly lands on item 17, and the door
   itself, rated with a self-closing device, is item 15's scope regardless of wall
   material. Likely also required, though this specific search didn't confirm it
   directly: signage at the door identifying the room, worth checking against item 21
   rather than assumed present.
5. **Dry System and Freeze Protection.** Conditional, for unheated spaces, garages,
   attics, exterior breezeways. Ties to the Parking Type gate already in the intake
   rather than needing a new one, since structured and underground parking already
   flags exactly this condition.

---

## Division 22 — Plumbing

### 28. Plumbing rough-in and piping

**Sources:**
- JF: "Plumbing Allowance" 22,800 SF $26.00 = $592,800 (r163) — the entire plumbing scope
  on this job is one SF allowance line, no fixture breakout.
- V64: "Plumbing - Piping Allowance" 1.00 LS $650,000, plus per-fixture connection lines
  (Bath Lav, Bathtub, Sink, Dishwasher, Refrigerator, waterline) at EA rates (r217–r223).
- VA: "Disconnect Gas Meter," "Residential Toilet Connection," "Bath Lav Connection,"
  "Plumbing Adjustment" 1.00 LS $600,000, plus fixture connections (r216–r224).
- VR: same connection-line structure as V64, piping allowance zeroed (r222–r228).
- WS, VG: no line.

**Unit/quantity signal:** SF at JF only; EA per fixture connection at V64/VA/VR, scaling
with bathroom/unit count; one LS "adjustment" or "allowance" line at V64 and VA layered
on top of the per-fixture detail.

**Quantity driver (LA-720, 2026-09-20): split, bathroom count / unit count**, decided
below on 2026-09-19, item 29's own split and item 9's finish carpentry split both follow
the same shape.

**Flag:** JF is the only file that prices plumbing as a single coarse SF allowance with
no fixture-level detail at all, while the three Vue files price both a piping
allowance/adjustment lump sum and a full fixture-by-fixture breakout. These are not the
same level of estimating grain and should not be blended into one rate without
normalizing first.

**Amended (Matt, 2026-09-19, during LA-720): same driver split as item 29.** Bath
connections (lav, bathtub) price on fixture points; kitchen and appliance connections
(sink, dishwasher, refrigerator) price on unit count. `canonical-work-items.md`'s
plumbing container review folds this item's rough-in into the same per-fixture number
as item 29's furnish-and-set cost, one all-in figure per fixture point, the way a
plumber actually quotes it, rather than pricing rough-in and fixtures separately.

**Containers (Matt, 2026-09-20), finally written in with real evidence.** This full list
was worked out in chat early in the session but never actually committed here until an
elevator pit sump cross-reference surfaced the gap. Items 28 and 29 together make up one
subcontractor's scope, cast the same way Concrete's items 2 and 3 are treated as one
trade with several containers.

1. **Plumbing Service.** Required. Per building: water service entry, meter, backflow,
   sanitary connection at the foundation. No file isolates this from the piping
   allowance lump sums below — V64's "Plumbing - Piping Allowance" $650,000 (r217) and
   VA's "Plumbing Adjustment" $600,000 (r219) almost certainly bundle this scope
   alongside the itemized connections, not a separate number anywhere.
2. **Water Heating.** Required, forks central plant or per unit. Real evidence: V64,
   75 EA at $2,500 = $187,500 (r231, Division 22 code, reclassified from a fixture to
   equipment per the 2026-09-19 amendment below); VR, 75 EA at $1,180 = $88,500 (r236).
   VA has no line at all, the lead toward a central plant already noted under item 29.
3. **Interior Storm Drainage.** Conditional, gated by Roof Type: flat, the same gate
   used on items 12 and 13. Real finding worth naming: V64 and VR both have a flat TPO
   roof section per items 12 and 13's own evidence, yet neither prices anything here.
   That's a real gap connecting three items' data together, not just an absent line.
4. **Gas Piping.** Conditional, gated by the Gas Building gate. Thin but real evidence:
   VA's "Disconnect Gas Meter and Pipework" 1.00 EA $300 (r216) implies a gas-fueled
   building. V64, VR, and JF show nothing.
5. **Fixtures and Rough-In.** Required. The dominant, richly evidenced container,
   fixture points for bath, unit count for kitchen, per the driver amendment above and
   under item 29. All four files' connection and fixture lines live here.
6. **Appliance and Equipment Connections.** Required. Dishwasher and refrigerator
   connections, real evidence in every file (V64: r221–r223; VA: r223–r224).
7. **Common Area and Amenity Plumbing.** Conditional, reuses the Amenity Scope gate.
   Zero evidence in Division 22 on any file, but a real, explainable reason: V64 and VR
   both price a pool package under item 25, and the pool's own plumbing, backwash lines,
   deck drains, equipment room floor drain, most likely bundles into that lump sum
   rather than appearing as its own line here.
8. **Specialties.** Conditional, item by item: ejector and sump if the lowest level
   sits below the sewer invert, booster pump if the building is tall enough to need one,
   grease interceptor if there's a commercial kitchen, expansion tanks, filtration. Zero
   evidence in any file. This is where item 26's elevator pit sump belongs when a pit
   sits below the sewer invert, closing that cross-reference.

### 28a. Plumbing Disconnect and Cap

Added 2026-09-26 (LA-1150, ADR 0006). Disconnecting and capping the water, waste and vent
services inside a structure before it comes down. A supporting item of Structure
Demolition (1a): it exists in a budget only when 1a does, follows 1a into TBD, and adds to
the total in its own right rather than being carved out of item 28's rate.

**Quantity driver: one per structure coming down.** **Rate:** none yet. It shows "No Rate
Yet" and stays out of every total until Matt states one.

**Element:** Demolition. **Buyout package:** Plumbing. **Division:** 22.

**Sources:** none. No file carries a plumbing disconnect line, and the data cannot show
whether the work sits inside a demolition lump, a plumbing allowance, or nowhere.

### 28b. Gas Meter and Service Disconnect

Added 2026-09-26 (LA-1150, ADR 0006). Disconnecting the gas meter and service to a
structure before it comes down. A supporting item of Structure Demolition (1a), on the
same terms as 28a.

**Quantity driver: one per structure coming down.** **Rate:** none yet, "No Rate Yet".

**Element:** Demolition. **Buyout package:** Plumbing. **Division:** 22. Where the gas
utility does this work itself on a Long Island job, the item may belong on the owner side
instead; open until a job shows it.

**Sources:** VA's "Disconnect Gas Meter and Pipework" 1.00 EA $300 (r216, code 22.00000),
filed under plumbing. One line on one job, so it is not used as a rate; item 28's note
already reads it as evidence of a gas-fueled building.

### 29. Plumbing fixtures

**Sources:**
- V64: "Kitchen Sink," "Kitchen Faucet," "Lav Sink," "Lav Faucet," "Standard Bathtub,"
  "Standard Shower Kit" (r226, r227, r229–r232, code 22.04000).
- VA: same fixture list plus "Residential Toilet" (r227–r233).
- VR: same fixture list as V64 (r231, r232, r234–r237).
- JF, WS, VG: no separate fixtures code — folded into item 28 at JF (see the flag above).

**Unit/quantity signal:** EA, splitting cleanly along the Bathroom and Kitchen grouping
already drawn in the plumbing container review — fixture points for toilet, lav, and
tub-or-shower; unit count for kitchen sink and faucet, one kitchen per unit.

**Quantity driver (LA-720, 2026-09-20): split, bathroom count / unit count**, decided
immediately below on 2026-09-19, same split as item 28.

**Amended (Matt, 2026-09-19, during LA-720): the driver for this item is fixture points
for bath fixtures and unit count for kitchen fixtures, not one driver for the whole
item.** Also corrected: V64 (r231) and VR (r236) both list "Hot Water Heater" under this
item's own fixture code, but a water heater is plumbing equipment, not a fixture, and it
is the per-unit fork of Water Heating, the container split out during the same review.
This is in fact the real evidence behind that fork, one heater per unit at one EA each
($187,500 and $88,500), and it should be re-homed to Water Heating on import rather than
counted inside this item's own fixture benchmark.

**A second finding worth carrying into the Water Heating gate: VA has no Hot Water
Heater line anywhere in its Plumbing Fixtures list** (r227–r233, seven other fixtures,
no heater), unlike V64 and VR, which both price one per unit. That is plausible real
evidence VA used a central plant rather than per-unit heaters, on a job roughly twice
V64 and VR's scale by most other line items. Worth checking directly rather than assumed,
but it is the first concrete lead either side of that gate has had.

**See item 28's Containers for the full eight-container plumbing structure**, this item
supplies the real evidence for containers 5 (Fixtures and Rough-In) and 2 (Water
Heating).

---

## Division 23 — HVAC

### 30. HVAC system

**Sources:**
- JF: "HVAC Budget Allowance" 22,800 SF $30.00 (r168). Total $684,000.
- V64: "HVAC" 101,200 SF $22.00 (r237). Total $2,226,400.
- VA: "Louvers 5'x5'" 18.00 EA $2,500; "HVAC Breakout for Ground level" 40,894 SF $18.00 =
  $736,092; "HVAC (Non-union residential Budget Allowance)" 203,658 SF $18.00 =
  $3,665,844 (r238–r240).
- VR: "HVAC" 101,200 SF $0.00 (r242, zeroed).
- WS, VG: no line.

**Unit/quantity signal:** SF, scaling with gross square feet; VA again splits a
ground-floor/breakout quantity from the main building quantity.

**Quantity driver (LA-720, 2026-09-20): gross square feet**, per the Summary's own
2026-09-18 resolution, the same accepted-limitation basis as item 27. HVAC System Type
(PTAC, ducted split, central plant) gates which rate applies, not which driver applies.

**Flag:** rate spans $18.00 to $30.00/SF across three priced files.
`jeffersons-ferry-scope-comparison.md` already found JF's $30.00/SF rate was 61% over the
actual bought rate of $18.64/SF — consistent with VA/V64's lower rates being closer to
what this job type actually bought out for.

**Amended (Matt, 2026-09-19): the spread above is not explained by anything in this
data, because no file says which HVAC system that job used.** PTAC, ducted split, and
central plant price very differently, and Kulka does not choose the system, the
architect and mechanical engineer do. See the HVAC System Type gate in `rom-spec.md`.
Until enough closed jobs are tagged by known system type, all three gate answers price
off this same blended rate, flagged low confidence, rather than three invented numbers
with no evidence behind any of them.

**Containers (Matt, 2026-09-20), finally written in.** Sketched in chat during the
original HVAC review but never actually committed here until now, the same gap just
closed on items 27, 28, 29, 31, and 32. VA's louver line is the only real number in the
whole item; every other container leans on trade practice, not file data.

1. **In-Unit Equipment.** Required. The condensing unit, heat pump, or PTAC itself, per
   unit. No file isolates it; all four price it inside one blended allowance.
2. **Distribution.** Required. Ductwork and refrigerant piping, or hydronic piping if the
   system is central. No file isolates it either.
3. **Ventilation and Louvers.** Required. Outside air intake and exhaust. The only
   container with a real number: VA, 18 units at $2,500 each.
4. **Controls.** Required. Thermostats, and a building management system if the plant
   is central.
5. **Common Area and Amenity HVAC.** Conditional, reuses the Amenity Scope gate.
   Clubhouse, gym, corridors, and lobby need their own systems, separate from unit
   equipment.
6. **Central Plant Equipment.** Conditional, gated by HVAC System Type above. Chillers,
   boilers, cooling towers. Only real if the building uses a central system rather than
   per-unit equipment.
7. **Stair Pressurization Fans and Ductwork.** Conditional on building height, added
   (Matt, 2026-09-20), cross-checked against fire alarm and item 15's stairs. Required
   above roughly 75 feet of occupied floor height, the same high-rise threshold relevant
   elsewhere on this list. Fire-alarm activated, detailed on item 15. None of the six
   sample jobs read as true high-rises, so likely not applicable today, but a real gap
   worth naming before one comes through.
8. **Fire and Smoke Dampers.** Required, added (Matt, 2026-09-20), cross-checked against
   fire alarm and sprinkler across all remaining trades. NFPA 90A requires a fire damper
   everywhere ductwork penetrates a fire-rated wall or floor of two hours or more, and
   any rated shaft regardless of hour rating, which in practice means every duct crossing
   a corridor wall or floor between units, close to universal in multifamily. Smoke
   dampers are additionally required on larger systems, and a duct-mounted smoke
   detector automatically stops the fan and closes the damper on activation, a real,
   direct fire-alarm interface currently missing from item 32's System Interfaces
   container. Zero evidence of any damper line in any file. Sealing the annular gap
   around the duct at that same penetration is item 14a's scope, Firestopping, not this
   container's.
9. **Fire Pump Room Heating.** Required whenever item 27's Fire Pump and Pump Room
   container applies, added (Matt, 2026-09-20). NFPA 20 sets a minimum room
   temperature, roughly 40°F for an electric pump, higher for a diesel engine-driven
   one because of the battery and block heater. A real, room-specific requirement, not
   covered by general building heat. Zero evidence in any file.

---

## Division 26 — Electrical

### 31. Electrical system — service, distribution, branch power, installation, generator

**Amended (Matt, 2026-09-19): narrowed to exclude low voltage and the furnish cost of
lighting fixtures, both split out below as their own items.** This item now covers
service and distribution, branch power and devices, the installation labor for lighting
fixtures (wiring, mounting, connecting fixtures furnished under item 31b), emergency and
egress lighting installation, elevator and equipment feed conductors, and the emergency
generator. None of the six source files actually separate installation labor from a
fixture's own cost, so every dollar figure below is still the old blended number; the
narrower scope description is a statement of intent for future imports, not something
today's numbers already reflect.

**Sources:**
- JF: "Electrical Budget Allowance" 22,800 SF $28.00 (r173). Total $638,400.
- V64: "Electrical (non-union residential budget w/ fire alarm)" 101,200 SF $22.00
  (r242). Total $2,226,400.
- VA: "Electrical - Garage level breakout" 40,894 SF $18.00 = $736,092; "Electrical
  (non-union residential budget allowance)" 203,658 SF $24.00 = $4,887,792 (r245–r246);
  "ALLOWANCE FOR 400 KW, DIESEL POWERED GENERATOR" 1.00 LS $160,000 (r249, code
  26.05630) — no generator line on any other file.
- VR: "Electrical (non-union residential budget w/ fire alarm)" 101,200 SF $23.00
  (r247). Total $2,327,600.
- VG: "EX1 Interior LED Exit Sign + 2-Head EM Combo" 5.00 EA $170 (r45, code 26.05000) —
  Villa's only electrical line, and the closest thing to a real fixture number in any
  file, though it is a blended furnish-and-install price like everything else here, not
  a furnish-only one.
- WS: no line.

**Unit/quantity signal:** SF for the main power/lighting allowance, scaling with gross
square feet; EA for exit signs; one LS for the VA generator.

**Quantity driver (LA-720, 2026-09-20): gross square feet**, per the Summary's own
2026-09-18 resolution. Branch Power and Devices, the dominant container everywhere,
prices per SF in every file that shows it. Emergency Generator (container 6) and Fire
Pump Dedicated Power Supply (container 7) stay conditional, zero-or-real sub-containers,
not a scaling question.

**Flag:** V64's and VR's electrical descriptions both say "w/ fire alarm" in plain text,
meaning fire alarm cost is bundled into this SF rate rather than broken out — see item 32
below for why that matters. VA's generator is a genuine scope difference (this job has
a backup generator; none of the others price one), not a pricing inconsistency, and
should stay flagged rather than be treated as a missing line on the other five files.

**Containers (Matt, 2026-09-20), finally written in.** Sketched in chat during the
original electrical review but never actually committed here until now, the same gap
just closed on items 27, 28, and 29.

1. **Service and Distribution.** Required. Per building. Utility service entry, main
   switchgear, panels, feeders to sub-panels. No file isolates a dollar figure. Always
   inside the main lump above.
2. **Branch Power and Devices.** Required. Per square foot. The bulk of the money
   everywhere: JF $28/SF, V64 $22, VR $23, VA $18 to $24 split by garage and tower.
3. **Lighting Fixtures, Installation Only.** Required. Furnish cost lives in item 31b.
   No file isolates a number for installation labor alone; every dollar sits inside
   Branch Power and Devices until a real quote separates it.
4. **Emergency and Egress Lighting.** Required by code. Villa isolates it, the only real
   number in the whole item: 5 EA at $170 each.
5. **Elevator and Equipment Feeds.** Required whenever the building has elevators. A
   breakout of Branch Power and Devices, not an add-on, the same shape as item 26's
   elevator wiring cross-reference. No file isolates it. Also carries the shunt trip
   breaker required by ASME A17.1 at any elevator with machine room or hoistway
   sprinklers, detailed on item 26, its own dedicated device, not general wiring.
6. **Emergency Generator.** Conditional, defaults to absent per the frequency-bar test
   that already excluded this from being a formal intake gate. Only VA prices one,
   $160,000 lump sum, a real scope difference rather than a pricing gap on the other
   files.

   **Cross-checked against fire alarm and sprinkler (Matt, 2026-09-20), and the honest
   result is thinner than the fire pump's equivalent check.** NFPA 110 requires a
   remote annunciator outside the generator room, but doesn't clearly mandate fire
   detection or suppression inside the room itself, a more permissive area than the
   fire pump's explicit supervisory signal list, so this isn't the same strong finding
   as item 27's. What did surface, real and worth adding regardless: a fire-rated room
   separation, 1-hour under NFPA 37's baseline for any engine room, potentially 2-hour
   under NFPA 110 where the generator serves life-safety loads like this one likely
   does if it's backing up the fire pump or elevators. Same construction-method
   dependency as the fire pump room, concrete or CMU lands on items 2 or 5, drywall and
   metal stud lands on item 17, the door itself is item 15's scope. Also mandatory and
   currently unpriced: fuel spill containment for the day tank, a wall, curb, or dike
   sized to hold the full capacity of the largest tank present, likely item 2's scope
   as a concrete containment structure. Zero evidence of either in any file.
7. **Fire Pump Dedicated Power Supply.** Required whenever item 27's Fire Pump and Pump
   Room container applies, added (Matt, 2026-09-20). Not the same thing as container 6
   above and doesn't share its default: a dedicated service, a tap ahead of the main
   disconnect, or its own dedicated generator sized for the fire pump load, jockey pump,
   and 8 hours of fuel, per NEC 695.3 and NFPA 20. A job can trigger this even with no
   general building backup power at all. Detailed on item 27. Zero evidence in any file.

### 31a. Low voltage

Split from item 31 (Matt, 2026-09-19). Tele and data allowance: structured cabling and
related low-voltage rough-in. Not yet a canonical item before this split; the dollars were
sitting inside item 31's own source list.

**Sources:**
- V64: "Tele/Data/Low Voltage Allowance" 101,200 SF $2.00 (r245). Total $202,400.
- VR: same line, same rate (r250). Total $202,400.
- JF, VA, WS, VG: no line.

**Unit/quantity signal:** SF, scaling with gross square feet. Only two of six files price
it at all.

**Quantity driver (LA-720, 2026-09-20): gross square feet**, matching both files that
price it, V64 and VR, at the identical $2.00/SF rate.

**Flag:** thin evidence for a standalone item, one rate confirmed on two files that share
the same source lineage (both Vue budgets). Treat the $2.00/SF figure as provisional until
a third, independent job confirms it.

**Amended (Matt, 2026-09-19): stays one item, not five.** Structured cabling and data is
the only piece this figure actually supports. Video intercom and entry, access control,
CCTV, and cable and satellite TV backbone are real sub-scopes with no evidence behind any
of them, and giving each its own canonical item was rejected on the same logic that kept
the emergency generator (item 31, container level) out of the branch gate list: thin
evidence and low individual dollar risk do not clear the bar for a structural split. They
stay informal sub-scopes of this item until a real job's buyout gives one of them a real
number. Emergency Responder Radio Coverage did clear the bar and is split out below as
item 32a, next to Fire Alarm rather than here, because it is licensed, code-triggered
life-safety work, not a spec preference.

**Telecom/IT Room Build-Out, added (Matt, 2026-09-20).** The room itself, not the
cabling already priced above: backboards, bonding and grounding per the telecom
industry's own grounding standard, dedicated power, and often dedicated cooling once
network equipment density in the room warrants it. Real construction scope, plywood
backboard and conduit sleeves land on item 17 or item 5 depending on wall type, that
today has no container anywhere on this list to collect it. Zero evidence in any file.

### 31b. Lighting fixtures, furnish only

Split from item 31 (Matt, 2026-09-19), on the reasoning that furnish and install are
routinely bought from two different parties on a real job: an owner or designer often
selects and purchases fixtures directly, and the electrician only installs them. That
split is a real buyout pattern, not something any of Kulka's six files actually show.

**Sources:** none. No file carries a distinct lighting fixture allowance separate from
installation labor. Villa's exit sign line (item 31, $170/EA) is the nearest real number
in the data, and it is a blended furnish-and-install price, not a furnish-only one, so it
overstates what this item should show once real furnish-only pricing exists.

**Unit/quantity signal:** proposed at unit count or fixture count once a benchmark exists.
No signal today.

**Quantity driver (LA-720, 2026-09-20): unit count.** A furnish-only fixture package is a
per-unit selection the same way item 24's cabinetry and item 22's appliances are, even
with no real number to confirm it yet.

**Flag:** this item exists because it matches how the trade actually buys the work, not
because Kulka's data proves it yet. Its first few benchmark numbers should be treated as
unconfirmed until a real job's buyout shows the furnish and install numbers separately.

### 31c. Site and exterior lighting

**Added (Matt, 2026-09-20).** Parking lot pole lights, walkway and bollard lighting,
building-mounted exterior fixtures, and their circuits. Distinct from item 31's Branch
Power, which is building-interior only, and not covered by anything in Division 32's
sitework items either, paving and drainage are priced there, lighting never is. Zero
evidence in any file, a real subcontract on essentially every job with surface parking
or a site beyond the building footprint.

**Unit/quantity signal:** proposed at EA per pole/fixture or LF of site perimeter, once a
benchmark exists. No file gives a signal.

**Quantity driver (LA-720, 2026-09-20): EA per pole/fixture.** A counted quantity tied to
site layout, fixture spacing and site perimeter, not to building GSF or unit count.

### 31d. EV charging infrastructure

**Added (Matt, 2026-09-20), checked against the current New York State mandate before
proposing, not assumed.** New York's EV-ready building code, folded into the 2025
Uniform Fire Prevention and Building Code update effective 2026-12-31, requires new
multifamily construction with off-street parking to deliver a real share of spaces
EV-capable and a smaller share with an actual Level 2 charger installed; NYSERDA's own
EV-ready guidance cites 20 percent installed and 60 percent capable as the working
figures. The exact percentage and how it's measured is a jurisdiction question, the same
kind of fact LA-771 already exists to resolve by project address, not something to
hard-code here. What's certain regardless of the exact number: this is code-driven scope
on new construction with parking, not an owner amenity choice, and it prices nowhere
today. Zero evidence in any file, none of the six jobs price it.

**Quantity driver (LA-720, 2026-09-20): EA per EV-capable/installed stall.** Both
containers below scale with a real, counted stall quantity derived from the parking count
Parking Type already establishes, gated by the jurisdiction's own EV-ready percentage,
not by GSF or unit count directly.

1. **Make-Ready Infrastructure.** Required wherever the jurisdiction's EV-ready
   percentage applies. Conduit, panel capacity, and junction boxes at each EV-capable
   stall, sized for a future charger even where one isn't installed on day one.
2. **Level 2 Charging Equipment.** Required at the smaller, actually-installed share.
   The charger itself and its final connection, on top of the make-ready infrastructure
   above.

### 31e. Solar-ready provisions

**Added (Matt, 2026-09-20), checked against the current New York energy code before
proposing.** The 2025 energy code's solar-ready roof requirement, effective 2026-12-31,
is clearly written for one- and two-family homes and townhouses; multifamily's own scope
under NYStretch's broader solar-ready-zone language is less settled from a general
search, a real jurisdiction question that belongs with LA-771 rather than a guess here.
What's asked for where it applies is a designated roof or site area with structural and
electrical capacity for a future system, not an installed array, a "ready" provision,
not a build. Zero evidence in any file, and worth keeping distinct from an actual
installed photovoltaic system, which is an owner or design choice with its own real
cost, not a code minimum.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on jurisdiction.**
Both containers below reserve area and capacity proportional to roof area and building
electrical service size, both GSF-derived ratios, gated on whether the jurisdiction's
solar-ready rule actually reaches multifamily.

1. **Solar-Ready Roof Area and Structural Allowance.** Conditional on jurisdiction.
   Reserved, unobstructed roof area plus the structural capacity to carry a future
   array, coordinated with item 13's roofing containers rather than duplicating them.
2. **Solar-Ready Electrical Provisions.** Conditional on jurisdiction. Conduit stub-ups
   and reserved panel capacity for a future interconnection, distinct from container 1's
   structural side.

### 31f. Electrical Service Disconnect

Added 2026-09-26 (LA-1150, ADR 0006). Disconnecting and making safe the electrical
service to a structure before it comes down, coordinated with the utility. A supporting
item of Structure Demolition (1a): it exists only when 1a does, follows 1a into TBD, and
adds to the total rather than being carved out of item 31's rate.

**Quantity driver: one per structure coming down.** **Rate:** none yet, "No Rate Yet".

**Element:** Demolition. **Buyout package:** Electrical. **Division:** 26.

**Sources:** none in any of the six files.

---

## Division 28 — Electronic Safety and Security

### 32. Fire alarm and nurse call

**Sources:**
- JF: "Nurse Call Allowance" 1.00 ALLW $125,000 (r178, code 28.00000); "Fire Alarm Budget
  Allowance" 22,800 SF $7.00 = $159,600 (r181, code 28.04600).
- V64, VA, VR: **no Division 28 line at all.** Fire alarm cost is folded into the
  Division 26 electrical allowance description ("...w/ fire alarm," see item 31, not
  items 31a or 31b) with no dollar figure broken out.
- WS, VG: no line.

**Unit/quantity signal:** SF for fire alarm at JF (scales with gross square feet); one
ALLW for nurse call, likely a fixed per-building cost rather than scaling with area.

**Quantity driver (LA-720, 2026-09-20): gross square feet**, matching the Summary's
2026-09-18 MEP resolution and JF's own real $/SF evidence, the only real number on this
item. Nurse Call stays its own conditional fixed-allowance sub-case, not the item driver.

**Flag:** JF is the only file that isolates fire alarm as its own Division 28 line — a
division ADR 0004 already notes Autodesk uses for fire alarm alone, "when 28 is
Electronic Safety and Security" generally. Because the three Vue files bury fire alarm
inside the electrical rate with no separate dollar figure, this canonical item cannot be
benchmarked consistently across files today; only JF and, eventually, an Autodesk import
can supply a real fire-alarm-only number.

**Containers (Matt, 2026-09-20), finally written in.** Sketched in chat during the
original fire alarm review but never actually committed here until now, the same gap
just closed on items 27, 28, 29, and 31. JF's one flat number is the only real evidence
in the whole item; nothing here separates a fire alarm system into its real components,
so every container below leans on trade practice rather than file data.

1. **Panel and Power Supply.** Required. Per building. The fire alarm control panel, its
   power supply and battery backup. No file isolates a number. Firestopping this
   circuit's own wiring and conduit penetrations through rated walls is item 14a's
   scope, distinct from general electrical and low voltage.
2. **Initiating Devices.** Required. Smoke detectors, heat detectors, pull stations.
   Smoke detectors are a per-unit life-safety requirement; heat detectors and pull
   stations are per building or per common area. No file isolates a number.
   **Cross-checked against Sprinkler (Matt, 2026-09-20).** NFPA 72 prohibits smoke
   detectors anywhere ambient temperature can drop below 40°F or exceed 100°F, garages,
   attics, unheated exterior breezeways, requiring heat detectors instead. That's the
   same unheated-space condition already gating item 27's Dry System and Freeze
   Protection container off the Parking Type gate, not a new fact to capture, just a
   second consequence of the one already in the intake. Also real: the fire alarm
   control panel's own location needs a detector matched to its own ambient condition,
   smoke or heat, the same rule applied to itself.
3. **Notification Devices.** Required. Horns and strobes, or speakers if the building
   uses voice evacuation, per the Fire Alarm Notification Type gate already in
   `rom-spec.md`. Per unit and per common area.
4. **Monitoring and Communication.** Required. Per building. The line or cellular link
   to a central station.
5. **System Interfaces.** Required whenever the building has elevators, sprinklers, or
   door hold-opens. Elevator recall, sprinkler flow and tamper monitoring, magnetic door
   holders. A breakout of Notification Devices or Panel and Power Supply, the fire alarm
   sub wires and monitors these, but the device itself belongs to a different trade's
   canonical item, the same shape as item 26's elevator cross-references. Also carries
   the dedicated heat detector required at each machine room and hoistway sprinkler head
   to trip the shunt trip breaker before water discharges, detailed on item 26 — its own
   device, more sensitive than the sprinkler itself, not the same thing as general
   Initiating Devices above. Also carries the stairwell-entrance smoke detectors that
   activate item 30's stair pressurization fans on high-rise buildings, detailed on
   item 15. Also carries the duct-mounted smoke detectors that stop HVAC fans and close
   fire and smoke dampers, detailed on item 30's new container 8.

   **Cross-checked against the fire pump specifically (Matt, 2026-09-20), a distinct
   signal set from the general sprinkler flow and tamper monitoring already named
   above.** NFPA 20 requires the fire pump controller itself to report a real,
   specific set of supervisory signals through the fire alarm system: pump running,
   pump power failure or loss of phase, phase reversal, and transfer to alternate
   power source. That last signal ties directly to item 31's new Fire Pump Dedicated
   Power Supply container, since a pump running on generator or an alternate service
   has to report that transfer, not just that the pump is running. These come off the
   fire pump controller's own supervisory outputs, a different piece of equipment from
   the sprinkler system's flow and tamper switches, even though both terminate at the
   same fire alarm panel. Detailed on item 27. Zero evidence of any pump monitoring
   circuit in any file. Also carries a BDA failure signal from item 32a's Emergency
   Responder Radio Coverage system, required by NFPA 72, detailed there.

   **Cross-checked against all remaining trades (Matt, 2026-09-20), one more real,
   currently uncoordinated interface, distinct from the magnetic door holders already
   named above.** Where item 31a's informal Access Control sub-scope uses an
   electromagnetic lock, IBC and NFPA 101 both require it to release immediately on
   fire alarm activation, a mandatory interface one source describes plainly as "not
   optional and not the access control contractor's call alone — it must be coordinated
   with the fire alarm contractor." This is the opposite device from a magnetic door
   holder: a maglock holds a door locked and must release to unlock on alarm, a door
   holder holds a door open and releases to let it close on alarm. Both need a fire
   alarm interface, but they are not the same device and shouldn't be priced as one
   line. Zero evidence of either coordination in any file. Access control existing at
   all also triggers item 32's new Fire Department Key Box container, a Knox Box, since
   the fire code treats a secured entrance as needing an emergency override regardless
   of which lock mechanism secures it.
6. **Testing, Inspection, and Commissioning.** Required. Per building. Final test, fire
   marshal witness, certification. Often its own line on a real quote even though no
   file here isolates it.
7. **Fire Department Key Box.** Required whenever item 31a's Access Control sub-scope
   restricts entry, added (Matt, 2026-09-20). IFC 506.1 requires a Knox Box wherever
   access to a building is restricted by secured openings, exterior-mounted at the
   main entrance, holding master keys to every entrance including mechanical,
   electrical, and fire riser rooms, along with the fire alarm panel key itself. A
   small, real hardware item, currently priced nowhere, that exists specifically
   because access control exists.

### 32a. Emergency responder radio coverage

New item (Matt, 2026-09-19), split out of the low-voltage review rather than found in a
source file. Licensed radio-coverage work: in-building antennas, amplifiers, and a
monitored panel, driven by a code trigger (building size and a measured signal survey)
rather than a spec choice, sold as its own subcontract with its own permit and test.
Grouped under Division 28 with Fire Alarm rather than under item 31a's low-voltage
grouping, because it is life-safety and code work, not a tele/data preference.

**Sources:** none. No file carries this scope, which is expected: it is a recent and
still-inconsistently-enforced code requirement, and none of the six jobs on hand are
recent enough or in a jurisdiction confirmed to require it.

**Unit/quantity signal:** none yet. Likely gross square feet or building count once real
jobs supply it, whichever the first closed number actually tracks.

**Quantity driver (LA-720, 2026-09-20): gross square feet, conditional on jurisdiction.**
The code trigger itself is building-size-based, consistent with pricing the antenna and
amplifier system against GSF once real evidence exists.

**Flag:** whether this applies to a given job is a jurisdiction question, not something an
estimator should be expected to know from memory or something the tool should ask outright
without help. See the new gate for this item in `rom-spec.md` and the Jev research ticket
that answers it from the project's own code jurisdiction.

**Cross-checked against fire alarm and sprinkler, against low voltage (Matt, 2026-09-20),
a real interface between two items already split apart on this list but never connected
to each other.** Research states plainly that the bidirectional amplifier at the heart
of this system "is classified as a life safety system and monitored by a fire alarm
system," and NFPA 72 requires any BDA failure to alert the fire control panel directly.
That's a required signal into item 32's System Interfaces container, not optional
equipment sitting on its own. Checked the other Low Voltage sub-scopes too, video
intercom, access control (already covered separately), CCTV, cable backbone, and none
of them show a comparable code-mandated fire alarm tie, worth saying plainly rather than
forcing a finding where the research doesn't support one.

**Cross-checked against firestopping's own remaining trades (Matt, 2026-09-20).** The
coaxial cable run from this system's amplifier to antennas on each floor crosses the
same rated walls and floors as everything else on item 14a's list. Added there as the
tenth trade, and it's the one that connects back most directly to fire alarm, since
this item's BDA monitoring signal, above, already ties it to item 32.

---

## Division 31 — Earthwork / Sitework

### 33. Erosion and sedimentation control

**Sources:**
- V64: "Inlet Protection" 20.00 EA $500; "Silt Fence" 1,349.40 LF $10; "Construction
  Entrance" 1.00 EA $2,000 (r250–r252, code 31.01025).
- VA: "Construction Entrance" 1.00 LS $10,000; "Silt Fence" 1,349.40 LF $10 (r260–r261).
- VR: same structure as V64, much lower unit rates ($3.50 vs. $10.00 for silt fence)
  (r255–r257).
- JF, WS, VG: no line.

**Unit/quantity signal:** LF for silt fence (scales with site perimeter), EA for inlet
protection and construction entrance (scales with count of site entrances/inlets).

**Quantity driver (LA-720, 2026-09-20): LF of site perimeter.** Silt fence, the dominant
container with real evidence in three files, prices per LF of perimeter, a site-shape
fact independent of building GSF.

**Containers added (Matt, 2026-09-20), checked against SWPPP/NPDES requirements before
proposing.**

1. **Perimeter Silt Fence and Inlet Protection.** Required. Real evidence in three files.
2. **Construction Entrance.** Required. Real evidence in three files.
3. **Concrete Washout Area.** Likely missing. NPDES/SWPPP requires a designated
   containment area so trucks don't wash out directly onto soil. Zero evidence in any
   file.
4. **Stockpile Erosion Control.** Likely missing. Silt sock or fence around soil
   stockpiles during construction, standard SWPPP scope. Zero evidence in any file.

### 34. Site work — excavation, backfill, grading, and topsoil

**Changed 2026-09-23 (LA-1015, Matt).** Was "Excavation, backfill, foundation prep, and
deep foundations." Budgets often carry one Sitework line covering excavation and grading
with no split, so grading moved in from item 37. Deep foundations moved out to item 34a.
The sources below were gathered under the old name; grading sources sit under item 37.
The quantity driver is open: this item kept CY of excavated volume, and grading's driver
was SF of disturbed site area.

**Sources:**
- JF: "Excavate Foundations," "Prepare Slab Subgrade," "Backfill Foundation," "2" Rigid
  Insulation Below Grade," "Crushed Stone," "Excavate to the bottom of the SubBase"
  (r189–r194, code 31.01050).
- WS: same line set (r42–r46), plus **"Piles Allowance" 1.00 LS $350,000** filed under
  its own code, 31.06010 Pile Caps (r49) — no other file has a deep-foundation line.
- V64: same line set plus a bulk "Excavation" 8,190.40 CY $5.50 line (r255–r262).
- VA: same line set, with the same add/deduct netting pattern seen in items 5 and 26 —
  "Excavation - Subcontractor Proposal" $240,000 immediately deducted at -$240,000, then
  re-priced at $300,000 (r264–r266) — plus a "Shoring Allowance" 1.00 EA $200,000 (r268).
- VR: same line set as V64 (r260–r267).
- VG: no line (folded into the wall-area pricing, per the top-level flag).

**Unit/quantity signal:** SF for most sub-lines (scales with foundation footprint), CY
for bulk excavation and crushed stone, one LS for West Shore's pile allowance.

**Quantity driver (LA-720, 2026-09-20): CY of excavated volume.** V64's real bulk
"Excavation" line prices directly per CY; volume converts from footprint and depth, the
same relationship item 2's foundation CY has to GSF. West Shore's pile allowance stays
its own flagged site-condition exception, not evidence against this driver.

**Flag:** West Shore's pile allowance is a real, one-off scope difference (poor bearing
soil or a structural condition requiring deep foundations), not an error — keep it
flagged rather than folded silently into a generic excavation rate. VA's excavation
add/deduct/re-price sequence (r264–r266) should be reviewed by an estimator before
import; it is unclear from the file alone whether the net effect is $300,000 or some
other figure.
**Resolved (Matt, 2026-09-18): $300,000 is correct.** A propose/deduct/re-price sequence
nets to its final stated line, the same pattern as the CMU and elevator add/deduct pairs
in items 5 and 26 — the first two lines role-flag as superseded, the third stands.

**Containers added (Matt, 2026-09-20).** Rock Excavation, conditional on site condition,
not currently covered by the Site Conditions gate at all — that gate today covers only
groundwater and poor soils, rock is explicitly excluded, worth reconsidering given this
is a real and sometimes expensive condition. Dewatering, conditional, gated by the same
Site Conditions groundwater answer already in the intake, well points and pumping when
excavation hits water table — real gate, zero evidence connecting to it in any file.
Contaminated or Excess Soil Export/Import, likely missing, a real and sometimes large
cost especially relevant on Long Island sites, zero evidence in any file.

### 34a. Deep foundations, piles, and shoring

**Added 2026-09-23 (LA-1015, Matt).** Split out of item 34. Piles and shoring are lumpy
allowances on a few jobs, and inside Site Work they would swing its rate.

**Sources:** WS "Piles Allowance" 1.00 LS $350,000 (r49, code 31.06010 Pile Caps); VA
"Shoring Allowance" 1.00 EA $200,000 (r268). Both were listed under item 34.

**Quantity driver: fixed lump sum**, because both source lines are single allowances.
MasterFormat 31 60 00. Scope side defaults to building.

### 35. Site drainage and stormwater

**Sources:**
- JF: "15" HDPE Pipe" 469.37 LF $65; "Sewer Manholes" 2.00 EA $4,000 (r197–r198, code
  31.01100).
- WS: **"Drainage Allowance" priced as 1.00 LF at $550,004.67** (r74, code 33.11006) — the
  exact defect `rom-system-design.md` names, confirmed present in the raw file. A
  drainage allowance has no business being priced per linear foot at a half-million-
  dollar unit rate; this is almost certainly meant to be an LS or ALLW line and the unit
  was mis-set.
- V64: "Drainage & Stormwater Allowance" 1.00 LS $450,000 (r265).
- VA: "Drainage - Subcontractor" 1.00 LS $682,365 (r278).
- VR: same line as V64, zeroed (r270).
- VG: no line.

**Unit/quantity signal:** LS/ALLW at every file except West Shore's defective LF line;
EA/LF for JF's real pipe-and-manhole detail. Likely scales with site area or a fixed
per-project allowance, not a clean quantity in most files.

**Quantity driver (LA-720, 2026-09-20): fixed lump sum.** Four of five priced files carry
a flat LS/ALLW figure; what a site actually needs for storm drainage depends on
topography, soil, and detention requirements, not on the new building's GSF or unit
count. JF's real pipe-and-manhole detail is the more granular alternative once real site
civil plans exist, not evidence the driver should be something else by default.

**Flag:** confirmed defect, do not import West Shore's r74 as a real per-LF rate — role
it as a data-entry error, not scope, when it reaches `budget_lines`.

**Containers added (Matt, 2026-09-20), checked against site development stormwater
practice before proposing.**

1. **Storm Drain Piping and Structures.** Required. JF's real pipe-and-manhole detail.
2. **Detention or Retention Storage.** Likely missing, and the strongest finding in this
   whole sitework pass. Zero evidence in any of the six files. Detention or retention
   storage commonly consumes 15 to 20 percent of a site's buildable area and runs
   $50,000 to well over $200,000 on a project this size — standard scope on virtually
   every site development project subject to stormwater regulation, not an edge case.
   Its total absence across every file is a real gap, not a sign these jobs didn't need
   it.
3. **Stormwater Quality Structures.** Likely missing. Oil/water separators for parking
   lot runoff, code-required in many jurisdictions. Zero evidence in any file.

### 36. Sanitary sewer, water service, and site utilities

**Sources:**
- JF: "6" PVC Sewer Service Line" 202.73 LF $40; "12' Dia Leaching pool" 2.00 EA $10,000
  (r201–r202, code 31.01150); "Domestic Water" 164.06 LF $60 (r205, code 31.01200).
- WS: "Sanitary Sewer" 1.00 LS $200,000 (r68, code **33.00000 Utilities**); "Support of
  Excavation Allowance" 1.00 ALLW $375,000 (r71, code **33.01000 SITE RESTORATION**);
  "Sanitary sewer, clay, 12" pipe" 0.00 LF $107.42 = $0 (r77, code **33.31004 SANITARY
  SEWERS**). Also, under "00 No division": **"Sanitary Sewer Allowance" 1.00 ALLW $125.00
  (r4) immediately followed by "Sanitary Sewer Allowance" 1.00 ALLW $125,000.00 (r5)** —
  the exact stale duplicate `rom-system-design.md` names, confirmed present.
- V64: "Sewer and Waste Allowance" 1.00 LS $59,600; "Road Demo and Restoration for Sewer
  Connection" 1.00 EA $4,250 (r268–r269, code 31.01150); "Water Service Allowance" 1.00
  LS $94,600 (r272, code 31.01200).
- VA: "Sewer and Waste - Subcontractor" 1.00 LS $59,600; same road-demo line (r281–r282);
  "Water Service - Subcontractor" 1.00 LS $94,600 (r285).
- VR: same structure as V64 (r273–r277).
- VG: no line.

**Unit/quantity signal:** mostly LS/ALLW (fixed per-project allowances); JF has real LF/EA
detail. Likely does not scale cleanly with GSF or unit count — probably scales with linear
feet of utility run or is treated as a flat site-condition allowance.

**Quantity driver (LA-720, 2026-09-20): fixed lump sum.** Same reasoning as item 35 and
item 1: nearly every file prices this flat, and utility run length depends on where the
site's connection points sit relative to the building, a site-condition fact, not
something GSF or unit count predicts.

**Flag — new, not previously named in ADR 0004 or `rom-system-design.md`:** West Shore
files this entire scope at **Division 33 Utilities**, its own MasterFormat division, while
every other file with sanitary/water scope (JF, V64, VA, VR) files it at **Division 31**
under codes 31.01150/31.01200. This is a division-level drift beyond the three cases
(demolition, elevators, allowances) the existing docs already name — worth adding to that
list. Also confirms the exact stale-duplicate defect already documented: West Shore's two
"Sanitary Sewer Allowance" lines (r4–r5, $125 and $125,000 for the identical description
and quantity) should be role-flagged, with the $125 line almost certainly the stale one
nobody deleted.
**Closed:** Division 33 drift added to the known-drift list alongside demolition,
elevators, and item 6's masonry-restoration mismatch. The duplicate lines role-flag as
`duplicate`, with the $125 line excluded from every total — same convention already
applied to the CMU and elevator takeoff-helper pairs, just a different role value.

**Container added (Matt, 2026-09-20), checked against sanitary sewer infiltration
prevention standards before proposing.**

**Manhole and Pipe Joint Sealing.** Likely missing. ASTM C478 requires gasketed,
watertight joints at every precast manhole section and a flexible boot connection where
a pipe enters a manhole, specifically to prevent groundwater infiltration into the
sanitary system, a real code-driven requirement, not an upgrade. Most likely bundled
into the LS/ALLW lump sums above rather than genuinely absent, but no file separates it
out, so it can't be confirmed either way.

**Two more containers added (Matt, 2026-09-20).** Dry Utility Trenching, likely missing
and a genuinely distinct scope from everything else on this item: conduit for electric,
gas, and telecom is the GC's trenching scope, with the utility company only pulling
cable through after, confirmed as standard practice, not a Kulka-specific choice. Zero
evidence in any file — every source line on this item covers sanitary or domestic water
only. Fire Line or Hydrant, likely missing, a water service specifically for fire
protection, distinct from the domestic water service already priced, tying to item 27's
Water Supply, Backflow, and FDC container.

**Underground Fire Main Thrust Blocking and PIV Footing, added (Matt, 2026-09-20),
found cross-checking fire alarm and sprinkler against foundations, though it turned out
to be site utility scope, not the building's own foundation.** NFPA 24 requires a
specific concrete mix, poured against undisturbed soil, at every bend, tee, and
dead-end on the underground fire main to resist the hydraulic thrust of pressurized
water, and it has to be cured and visible before the line can even be hydrostatically
tested, a real sequencing dependency, not just a material spec. The post-indicator
valve controlling that main into the building needs its own concrete footing with
restraining rods. Both belong here, on the Fire Line container above, not on item 2's
foundation work, since this concrete sits along the underground main's route, not at
the building itself.

**Electric Utility Service, added (Matt, 2026-09-20), the site-electrical gap Matt
flagged.** Distinct from this item's own Dry Utility Trenching above, which is the GC's
conduit trench only, and from item 31's Service and Distribution, which starts at the
building's own switchgear. This is what sits between the two: the utility's transformer
pad or vault, the primary duct bank from the utility's point of connection to that
transformer, and the utility company's own connection charges, a real, often
six-figure cost on a job with underground primary service, and currently priced on none
of the six files.

**Gas Utility Service, added (Matt, 2026-09-20), same gap, second utility.** A gas main
extension and meter bank from the utility's connection point to the building, distinct
from any interior gas piping and distribution, which has no container anywhere on this
list either and depends on whether the building's domestic hot water or any other system
is gas-fired at all, itself an unanswered question in every file. Zero evidence of
either in any file.

### 36a. Site Utility Cut and Cap at the Main

Added 2026-09-26 (LA-1150, ADR 0006). Cutting and capping a demolished structure's water,
sewer and storm connections at the main, outside the building. A supporting item of
Structure Demolition (1a): it exists only when 1a does, follows 1a into TBD, and adds to
the total rather than being carved out of item 36's rate. Not the same work as the "Road
Demo and Restoration for Sewer Connection" lines on V64, VA and VR (1 EA $4,250 each),
which open the street for the new building's tap.

**Quantity driver: one per structure coming down.** **Rate:** none yet, "No Rate Yet".

**Element:** Demolition. **Buyout package:** Site Work. **Division:** 33.

**Sources:** none in any of the six files.

### 37. Landscaping and irrigation

**Changed 2026-09-23 (LA-1015, Matt).** Was "Site grading, topsoil, and
landscaping/irrigation." Grading and topsoil moved to item 34 (Site work). Division moved
from 31 to 32, where planting and irrigation sit in MasterFormat. Grading sources below
now count toward item 34.

**Sources:**
- JF: "2'-3' Tree" 3.00 EA $200; "6'-7' Tree" 12.00 EA $400; "Seeding" 2,365.98 SF $1.50
  (r222–r224, code 32.09300 — filed under Division 32, not 31, at this file).
- WS: "6'-7' Tree" and "Seeding" not present; no landscaping line at all under Division 31
  or 32.
- V64: "Provide topsoil and seeding area" 18,782.08 SF $3.80 (r275, code 31.02200 Grading).
- VA: "Modular Metal Planters" 15.00 EA $1,950; "Planting - Allowance" 1.00 LS $200,000;
  "Irrigation - Allowance" 1.00 LS $120,000; "Seeding - Allowance" 25,848.65 SF $1.85;
  "Grass pavers" 17,583.21 SF $12.00 (r307–r311, code 32.09300).
- VR: no line (V64's grading line is zeroed at VR's equivalent row, r280).
- VG: no line.

**Unit/quantity signal:** SF for seeding/grading (scales with disturbed site area), EA
for trees/planters, LS for planting/irrigation allowances.

**Quantity driver (LA-720, 2026-09-20): SF of disturbed site area.** The dominant,
best-evidenced quantity (JF, V64, VA all price seeding/grading per SF); disturbed area is
a site-layout fact, not a building GSF ratio.

**Flag:** JF files landscaping at Division 32 (32.09300) while V64 files its
functionally similar topsoil/seeding line at Division 31 (31.02200 Grading) — a third
division-drift instance, smaller in dollars than the sewer/utility one above but the same
pattern: where the site-scope/building-scope line falls between Division 31 and 32 is not
consistent across files, consistent with `rom-system-design.md`'s general note that
"codes split" across the building/site boundary.
**Closed:** added to the drift list as a fourth confirmed instance. No decision pending;
the canonical item mapping already reads past the division code to the description.

**Containers added (Matt, 2026-09-20).** Erosion Control Blankets on Slopes, likely
missing, distinct from item 33's perimeter silt fence, a slope-stabilization matting
product. Tree Protection Fencing, conditional on existing trees required to remain, a
common code requirement during construction. Zero evidence for either in any file.

---

## Division 32 — Exterior Improvements

### 38. Paving and base courses

**Sources:**
- WS: "6" NYS 45-RCA Base Course" 798.06 CY $23 (r54, code 32.01100); "2" NYS 6f Wearing
  Coarse" 1,023.15 TN $140 (r57, code 32.01150).
- V64: same base-course and wearing-coarse codes, plus "Striping" 1.00 LS $15,000
  (r280–r286).
- VA: "2" NYS 6f Wearing Coarse" 256.42 TN $140 (r290); "Asphalt Paving - Subcontractor"
  1.00 LS $178,757; three striping lines including a deduct for parking-garage striping
  (r293–r296).
- VR: no paving line priced.
- JF, VG: no line.

**Unit/quantity signal:** CY for base course, TN for wearing course (both scale with
paved area and thickness), LS for striping/paving subcontracts.

**Quantity driver (LA-720, 2026-09-20): SF of paved area.** Base course and wearing
course quantities both derive from paved area and thickness; paved area itself scales
with Parking Type and stall count, not building GSF, the same relationship item 34's
excavation CY has to footprint.

**Containers added (Matt, 2026-09-20).** ADA Accessible Route Striping and Signage,
likely missing, code-required and distinct from the general striping already priced.
Wheel Stops, likely missing, standard in surface parking areas. Zero evidence for either
in any file.

**Fire Apparatus Access Road, added (Matt, 2026-09-20), found cross-checking fire alarm
and sprinkler against remaining trades.** IFC requires a fire lane wide enough and
strong enough for a loaded fire truck, not just wide enough for a passenger car: 20 feet
minimum width, 26 feet where the building's height requires aerial apparatus access,
roughly the same height threshold already relevant to elevator type and stair
pressurization elsewhere on this list, plus 13'6" of vertical clearance and a turnaround
on any dead-end run over 150 feet. The real cost driver here isn't the width alone, it's
that the pavement section under a fire lane has to carry a fire truck's load, heavier
than the base course and wearing course thickness already priced for standard parking
paving above. None of the base course or wearing course quantities in this item
distinguish a fire lane's structural section from general parking paving.

### 39. Site concrete, hardscape, and retaining structures

**Sources:**
- WS: "Concrete Curb" 1,640.26 LF $23 (r60, code 32.01600); **"Retaining Wall
  Allowance" 9,126.08 SF $50.00 = $456,304** (r63, code 32.03200) — the only file with a
  retaining wall line, and a large one relative to the job's $6.76M base cost.
- V64: "Plaza Pavers" 5,400 SF $15; "Concrete Curb" 2,351.07 LF $23; "Sidewalks" 3,810.78
  SF $9.50 (r289–r293).
- VA: "Pavers" 2,414.64 SF $15; "Permeable pavers" 3,311.89 SF $15 (r299–r300); "Concrete
  Curb" 1,643.78 LF $23; "Sidewalks" 5,319.94 SF $9.50 (r303–r304).
- VR: "Plaza Pavers" 5,400 SF $15 (r294, only priced line in this code group).
- VG: "Pavers" 30,719.18 SF $15 (r50, code 32.01400) — one of only two real (non-wall-area)
  scope lines at Villa besides the Division 10 specialties in item 21.
- JF: no line.

**Unit/quantity signal:** SF for pavers/sidewalks (scales with hardscape area), LF for
curb (scales with curb run length), SF for retaining wall (scales with wall face area).

**Quantity driver (LA-720, 2026-09-20): SF of hardscape/paver area.** The
best-and-most-consistently-evidenced quantity, priced across five of six files at
identical or near-identical $15/SF paver rates. Curb LF and West Shore's retaining wall
SF stay real, flagged site-specific exceptions, not competing item-level drivers.

**Flag:** West Shore's retaining wall is a genuine site-condition-driven scope item
(likely a grade change or property-line constraint specific to that site), not
comparable to any line on the other five jobs. Keep it inside this item but flagged, the
same way the pile allowance in item 34 is flagged, so a benchmark built from this item
does not accidentally price a flat site into a sloped one.

**Retaining Wall Waterproofing, added (Matt, 2026-09-20).** Likely missing. A retaining
wall holds back soil on one face and needs a dampproof or waterproof coating on that
backfill side, the same logic as item 2's foundation waterproofing, to keep water from
migrating through the wall. West Shore's $456,304 retaining wall line doesn't mention
one, and nothing else in this file prices it separately.

**Retaining Wall Drainage, added (Matt, 2026-09-20), part of the same sitework pass.**
Likely missing, and distinct from the waterproof coating above. Every retaining wall
needs a drainage system, a French drain or weep holes behind the wall, to relieve
hydrostatic pressure building up behind it — the same principle as item 2's footing
drain at a foundation wall. Missing even on West Shore's real retaining wall line.
**Retaining Wall Guardrail.** Conditional, code-required wherever a retaining wall
creates a fall-hazard height differential. Zero evidence anywhere.

**Permeable Pavement Recharge Bed, checked separately (Matt, 2026-09-20), since surface
parking has no real membrane analog to a structured garage.** There's no waterproofing
membrane question here, asphalt and pavers don't get one, the real question is whether
the water-management function is actually priced at all. VA's "Permeable pavers,"
3,311.89 SF at $15.00, most likely prices the paver units themselves. A permeable
pavement system only actually manages stormwater because of what's underneath, an
open-graded stone reservoir layer and often an underdrain, and without that layer the
pavers are just a surface, not a working system. Nothing in this file prices the
recharge bed separately, so it's either bundled into the $15/SF rate or genuinely
missing, and $15/SF reads low for a paver rate that also includes several feet of stone
base beneath it.

---

## Lines that do not fit any canonical item

Per the task's instruction to note rather than force these into a bucket:

- **Villa at Glen Cove's wall-area pricing.** Thirteen rows titled "Area (Perimeter ×
  Height) Building [A–F]" at a flat $250/SF, totaling $50,181,447.50 — 99% of the file's
  base cost (`Sheet0` r4–r16, code 00.00000, filed under "00 General Tools & Takeoff
  Items"). Already documented in `rom-system-design.md` as a deliberate estimator
  shortcut, weighted low, never usable for a dollars-per-gross-square-foot benchmark
  because the denominator is wall area, not GSF. Not mapped to any canonical item above.
- **Villa's parking area/garage measurement rows**, four lines each priced at $0.00 with
  real SF quantities (`Sheet0` r21–r24, "Parking Area/Garage - Elev. 54/64-6/45-6/85").
  These are takeoff-helper rows recording elevation-based parking areas, not priced
  scope. Role should be `takeoff_helper`, excluded from every total.
- **West Shore's duplicate Sanitary Sewer Allowance** — already covered under item 36,
  restated here because it is a role=`duplicate` case, not a mapping question. One of the
  two identical lines (`Sheet0` r4 or r5) should be excluded from every total once
  imported.
- **West Shore's mispriced Drainage Allowance** — already covered under item 35, restated
  here as a likely data-entry error (LF unit on what should be an LS/ALLW line), not a
  mapping question.
- **VA's zero-rate cabinetry/vanity lines** (`Sheet0` r51–r52) — already covered under
  item 10, restated here because a $0 unit cost on a line with a real quantity is a gap
  in the source file, not evidence the scope was priced at zero.
- **VR's negative-quantity paint line** (`Sheet0` r165, "Paint GWB Walls" -3,000 SF =
  -$3,750) — already covered under item 20. **Resolved (Matt, 2026-09-18): intentional**,
  the estimating software's normal way of netting tile or another finish out of a wall's
  paintable area, not a correction or an error.
- **VA's "97/95 Ammenities" allowance bucket beyond what is already mapped above**: "Retail
  Core and shell - Retail A/B" (2,600 SF + 2,100 SF at $62/SF = $291,400, `Sheet0`
  r318–r319) and "Road Work - Lane Expansion" (1.00 LS $250,000, r321), "Security
  allowance (200k SF +)" (1.00 LS $400,000, r322), and "Pergola Allowance (over 6,000 sf)"
  (1.00 LS $120,000, r323) do not cleanly fit any canonical item above. **Update (Matt,
  2026-09-20): the pergola now has a home, item 25's Site Furnishings container**, so only
  retail, road work, and security remain genuinely orphaned here.
  **Resolved (Matt, 2026-09-18): no, these do not stay as lump allowance lines.** Kulka
  needs the ROM to show these by their real sub-line items, not as one flagged allowance
  each. Retail core-and-shell needs to be broken into its structure, envelope, and finish
  components and folded into the matching canonical items; road work needs to be tracked
  under paving (item 38) rather than as a standalone allowance; security and the pergola
  need their own sub-line breakdown once that detail exists, rather than one lump figure
  apiece. This is follow-on decomposition work for the importer, not a blocker on
  freezing the canonical item list itself.
- **V64/VR's "97.00000 Allowances" bucket**: "Amenity Allowance" 1.00 LS $500,000 (V64
  `Sheet0` r298) and the same line zeroed at VR (r303). Confirms the code drift
  `rom-system-design.md` names (allowances at 97 on one job, 95 "Ammenities" on another).
  **Resolved (Matt, 2026-09-18): it was a budget for all amenities.** Maps to item 25
  (Amenity special construction — pools, fitness, sauna) as a lump-sum figure, the same
  basis already settled for that item, rather than staying unmapped.
