# Canonical work items — approved list

**Status: FROZEN, approved by Matt on 2026-09-19.** This is the canonical work item table
named in ADR 0004, `rom-system-design.md`, and CONTEXT.md's scope-side and contract-side
defaults. Every ProEst code and Autodesk group maps to exactly one of the 43 items below.
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

**43 canonical work items across 20 MasterFormat divisions** (02, 03, 04, 05, 06, 07, 08,
09, 10, 11, 12, 13, 14, 21, 22, 23, 26, 28, 31, 32). Division 01 General Requirements has
no line-item data in any file — see the flag under "Markups, not line items" below.

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

---

## Division 02 — Existing Conditions

### 1. Demolition — site and structure

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

**Flags:**
- Code drift confirmed exactly as `rom-system-design.md` names it: demolition lands at
  02.04113 (JF, V64), 02.00050 (VA), and 31.00050 (VA's own asphalt-removal sub-line).
  One file uses two different demolition codes for two different demolition scopes.
- `jeffersons-ferry-scope-comparison.md` already shows JF's $224,566 demolition figure
  came in 154% over the actual bought-out and closed cost of $88,500. The CF-based unit
  rate is the named cause. Any future demolition benchmark should weight JF's rate low
  for the same reason.

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
4. **Foundation Waterproofing.** Conditional. VA prices "Foundation Waterproofing" $110,000
   ALLW and "Slab Vapor Barrier Upgrade" 40,894 SF $5.00 = $204,470 (r77, r80), both filed
   under Division 07 rather than Division 03. Real foundation-scope work sitting under a
   different division's code — a breakout, not an add-on, the same shape as the elevator
   wiring and pit sump breakouts elsewhere on this list.
5. **Equipment Pads and Misc. Concrete.** Required. Housekeeping pads for mechanical and
   electrical equipment, dumpster pads, stoops. No file has a line for this at all; unlike
   the containers above, this one starts with zero evidence, proposed only because a
   concrete sub always carries some of this scope on a real job.
6. **Concrete Infill for Steel Pan Stairs.** Required wherever the building uses steel pan
   stairs rather than precast or poured stairs. No file separates this out. JF's "Metal Pan
   Stairs" line under item 7 (r39, $6,500 EA) doesn't say whether infill is included — a
   real double-count or undercount risk sitting in the data right now, worth checking the
   first time a real quote comes in for either line.

### 3. Elevated slabs and podium deck

**Sources:**
- JF: "Cast-In-Place Concrete - on Deck" 18,000 SF $10.00 (r17, code 03.00000). $180,000.
- VA: "L2 Podium, 12" avg assumed" 1.00 LS $1,395,525 (r11).
- WS, V64, VR, VG: no equivalent line.

**Unit/quantity signal:** SF at JF, scaling with deck area; LS at VA.

**Resolved (Matt, 2026-09-18): the deck pour is concrete's scope, gypcrete is not.**
Gypcrete is bought out as its own separate subcontract, not part of concrete and not part
of framing. It no longer belongs in this canonical item; see item 3a below, split out on
that basis. This also answers Flag M1 for the deck pour half: it stays with concrete.

### 3a. Gypcrete topping

Split from item 3 once gypcrete was confirmed as its own subcontract, not part of the
concrete deck pour or the framing package.

**Sources:**
- JF: "Gypcrete 3000psi" 15,200 SF $4.50 (r20, code 03.05300). $68,400.
- V64, VA, VR, WS, VG: no dedicated gypcrete line found under Division 03; may be buried
  in another line on those files and needs a pass to confirm.

**Unit/quantity signal:** SF, scaling with floor area receiving the topping.

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

**Flag:** VA's paired add/deduct lines (r20–r21) net to zero and exist only to isolate a
sub-scope for internal takeoff purposes. They should be role-flagged `takeoff_helper`,
not counted as real scope, or they will double the CMU total if summed naively.
**Closed:** role `takeoff_helper` per CONTEXT.md's existing line-role taxonomy. No new
decision needed, the convention already covers this case.

### 6. Brick and masonry veneer

**Sources:**
- V64: "Full-Brick Veneer (Plan View)" 6,399.25 SF $17.00 (r17, code 04.01000).
- VA: "Full-Brick Veneer" 6,108.99 SF $17.00 (r25, code **04.05710 Brick**, its own
  sub-code separate from CMU).
- WS: "Full-Brick Veneer" 15,927.05 SF $28.00 (r19) — but filed under code
  **"04.01000 MASONRY RESTORATION."**
- JF, VR, VG: no brick veneer line.

**Unit/quantity signal:** SF, scaling with wall/elevation area.

**Flag — new, not previously named in ADR 0004 or `rom-system-design.md`:** West Shore's
brick veneer is new-construction cladding, not restoration work, but it is filed under a
code whose own name says "Masonry Restoration." This is a code/description mismatch
worth adding to the known-drift list alongside the demolition and elevator cases the
docs already track.
**Closed:** finding stands as documentation, added to the drift list. No decision is
pending on it, since the canonical item mapping (item 6) already reads past the code
name to the description.

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

**Flag:** see Flag M4 under item 8 — this item's boundary with the framing package below
is not clean, because cold-formed metal panel/decking work is also priced under Division
05 codes at JF (see item 8), not under this railings-and-stairs bucket.

**Flag (Matt, 2026-09-20):** JF's "Metal Pan Stairs" line above ($6,500 EA) doesn't say
whether it includes the concrete infill poured into each pan tread, which is Concrete's
scope, not this trade's — see item 2's Containers, Concrete Infill for Steel Pan Stairs.
A real double-count or undercount risk between the two items until a real quote confirms
which side of the boundary that $6,500 actually falls on.

---

## Division 06 — Wood, Plastics and Composites

### 8. Shell framing — wood and cold-formed metal structure

The largest and most cross-division item in this draft. Combines wood framing materials
and labor, cold-formed metal panel/truss systems, and structural sheathing, because
`jeffersons-ferry-scope-comparison.md`'s Flag M4 found these buy out together as one
subcontract even though ProEst spreads them across Divisions 05, 06, and 07.

**Sources:**
- JF: "Cold Formed Exterior Panel & Sheerwall" 9,500 SF $18.00 (r35, **code 05.04400**);
  "Floor Joists & Decking - Comslab" 18,000 SF $10.00 (r36, same code); "Wood Trusses"
  9,000 SF $11.00 (r50, code 06.04001).
- V64: "2x4 PT/DF/Studs," "2x6 PT/DF/Studs," "2x8 DF," "2x10 DF," sheathing and plywood
  materials (r43–r59, code 06.04001, total $1,472,926); framing labor lines (r62–r65,
  code 06.04002, total $1,472,039).
- VA: "Framing and Trusses (Davinci)" 1.00 LS $3,685,600 (r60, code 06.04001); labor lines
  zeroed (r63–r66).
- VR: sheathing line only, "4x8x1/2" LP Flame Block Sheathing" 58,342.54 SF $2.44 =
  $142,548 (r56); rest of framing materials and all labor zeroed.
- WS, VG: no framing line (VG's wall-area pricing likely stands in for this — see the
  top-level flag).

**Unit/quantity signal:** SF at JF (per-panel/per-floor area); LF at V64's material
takeoff granularity; one LS at VA. Likely scales with gross square feet or wall/floor
area depending on sub-line.

**Flag M4 (carried from `jeffersons-ferry-scope-comparison.md`, restated here because it
is this draft's biggest single judgment call):** on Jefferson's Ferry, Autodesk's "Metal
Framing" group contains part of a structural-steel subcontract that ProEst prices
partly under Division 05 and partly folded into Division 09 drywall. Whether this
canonical item should include drywall install (item 17 below) as well, or whether the
package boundary is better drawn at the buyout-package level instead of the canonical
work item level, is unresolved and flagged for the working session per the "three axes"
section of `rom-system-design.md`.
**Resolved (Matt, 2026-09-18): depends, it varies job to job.** Framing and drywall are
not always bought as one package, so this canonical item keeps its cross-division flag as
drafted but does not fold drywall (item 17) in permanently. The buyout package boundary
belongs on the per-job import record, not baked into the canonical item definition —
whichever subcontract a given job actually used should be recorded there, not assumed
from a fixed rule.

### 9. Finish carpentry — trim, casing, molding, interior door install

**Sources:**
- JF: "Casement Molding" 5,235.81 LF $12; "Crown Molding" 1,508.40 LF $15; "Base Molding"
  6,212.00 LF $8; "Chair Rail Molding" 5,364.42 LF $18 (r44–r47, code 06.02000). Total
  $231,711.
- V64: "Install & Trim Interior Wood Door" 406.00 EA $175; window stools, base molding,
  door/window casing (r30–r37). Total $217,107.
- VA: similar door-install-and-trim lines plus window stools/base/casing (r39–r48). Total
  $689,368.
- VR: same line set as V64, partly zeroed. Total $145,294.
- WS, VG: no line.

**Unit/quantity signal:** mostly LF (moldings scale with perimeter of rooms/units), EA
for door install/trim (scales with door count or unit count).

**Flag:** JF's finish carpentry ($231,711 against a $125,000 Autodesk buyout, +85%) is
one of the three interior packages `jeffersons-ferry-scope-comparison.md` already flags
as consistently high and priced by full quantity takeoff — worth carrying that caution
into any benchmark built from this item.

### 10. Millwork and closet interiors

**Sources:**
- V64: "Amenity Area Millwork" 1.00 LS $55,000 (r40, code 06.02200).
- VA: "Upper and lower cabinets (Mid-Grade)" 2,181.00 LF and "Vanities" 513.50 LF, both
  priced at $0 (r51–r52, code 06.02300 — looks like a placeholder quantity with no rate
  entered yet); "Closet Interiors (Hat Shelf & Rod)" 1,596.00 LF $95; "Closet Interiors
  (Master WIC)" 960.00 LF $350 (r55–r56). Total $487,620.
- VR: same amenity millwork line as V64, $55,000 (r45).
- JF, WS, VG: no line.

**Unit/quantity signal:** LF, scaling with cabinet run length or closet perimeter.

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

---

## Division 07 — Thermal and Moisture Protection

### 12. Building insulation

**Sources:**
- V64: "Roxul Sound Deadening Insulation" 119,723.77 SF $1.50; "R-21 Fiberglass Batt" 
  58,342.54 SF $1.25 (r77–r78, code 07.02000); roof/deck iso board and Densdeck air
  barrier (r81, r84).
- VA: "Slab Vapor Barrier Upgrade" 40,894 SF $5.00; "Roxul Sound Deadening Insulation"
  85,914.51 SF $1.50; "R-21 Fiberglass Batt" 71,180.05 SF $1.50; "R-49 Spray-Foam"
  34,308.47 SF $8.50 (r80–r83). Total $731,734.
- VR: roof/deck iso board and air-barrier lines only, rest zeroed (r86, r89).
- JF: **no dedicated insulation code at all.** R-19 batt is folded into the interior
  framing unit rate (r101, "Interior Framing 3 5/8 gyp ea side R-19") and 2" rigid
  insulation below grade is folded into the sitework excavation line (r192), both under
  other canonical items.
- WS, VG: no line.

**Unit/quantity signal:** SF, scaling with wall/roof/slab area.

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

**Flag M2 (carried from `jeffersons-ferry-scope-comparison.md`):** JF's "Screen Enclosure
System" line ($30,224, r65) is filed under the siding code but is not siding — the prior
note reassigned it to face Autodesk's Screened Balconies group instead. Treat it as a
judgment call, not a settled fact, when this draft is approved.

---

## Division 08 — Openings

### 15. Doors, frames, and hardware — interior, exterior, and garage

**Sources:**
- JF: HM frames/doors, wood doors, hardware, specialty doors (r73–r89, codes 08.01100,
  08.01400, 08.01500, 08.03000). Total $238,625.
- V64: same structure (r104–r121). Total $431,825 (frames + wood doors + hardware, before
  aluminum/glass).
- VA: same structure, larger unit counts and a "6x7 closet" door subtype (r101–r125).
  Total $1,352,096.
- VR: same structure, higher per-door rates than V64/VA (r109–r126). Total $1,354,364.
- WS: **"Overhead garage door 12'X 12'"** 18.00 EA $4,520.30 = $81,365 (r32, code
  **08.34001 SPECIAL DOORS**) — a distinct scope, garage doors for a building with
  attached/detached garages, not present on any other file.
- VG: no line.

**Unit/quantity signal:** EA, scaling with door count (interior) or unit count
(entry doors); garage doors scale with garage-bay count.

**Flag:** West Shore's garage doors are a real, one-off scope difference (this job has
garages; the others apparently do not), not a pricing inconsistency. Keep it inside this
item rather than force a separate canonical item, but flag it so a reviewer does not read
it as an estimating outlier.

### 16. Windows, storefront glazing, and shower enclosures

**Sources:**
- JF: "Vinyl Single Hung Window," "Mulled Twin," "Mulled Triple" (r91–r93, code 08.05000).
  Total $31,500.
- V64: "Windows 10860/3636/3678" (r128–r130); "Interior Storefront" and "Exterior Glass
  Storefront System" (r133–r134, code 08.08200); "Shower Enclosure" 83.00 EA $2,250
  (r137, code 08.08500).
- VA: same window/storefront/shower structure, larger counts (r127–r137).
- VR: same structure, higher per-unit window rates (r133–r142).
- WS, VG: no line.

**Unit/quantity signal:** EA for windows and shower enclosures (scales with unit count/
opening count); SF for storefront glazing (scales with facade glazed area).

**Flag:** `jeffersons-ferry-scope-comparison.md` found JF priced 54 window openings at
$583 average against Pella windows actually bought at $1,648 per opening (+183%) — a
specification gap (vinyl assumed, brand bought), not a quantity or code error. Worth
keeping windows separate from storefront/shower in any downstream benchmark even though
they are grouped here as one canonical item, since their unit economics differ sharply.

---

## Division 09 — Finishes

### 17. Drywall, interior framing install, and ceilings (including acoustical)

**Sources:**
- JF: "1/2" GWB Ceilings & Soffits" 22,800 SF $6; "Interior Framing 3 5/8 gyp ea side
  R-19" 2,777.34 LF $14; "Wood Blocking" 831.26 LF $11.76; "Drywall & Carpentry" 1.00 LS
  $350,000 (r101–r104, code 09.02300). Also "2'x2' ACT (Acoustical Ceiling Tile)"
  1,580.03 SF $3.30 = $5,214 (r98, code 09.00951).
- V64: "1/2" GWB Walls," "1/2" GWB Ceilings," "Install Bath Accessories," "Install
  Interior Door, Frame & HW" (r142–r145).
- VA: same structure at larger scale, plus a common-area door-install line (r142–r147).
- VR: same structure, GWB wall/ceiling quantities zeroed but bath accessory and door
  install lines priced (r147–r150).
- WS, VG: no line.

**Unit/quantity signal:** SF for GWB walls/ceilings (scales with wall/ceiling area), LF
for framing, EA/BATH for accessory and door install (scales with unit or bathroom count).

**Flag:** shares Flag M4 with item 8 — this is the fourth division (09) that
`jeffersons-ferry-scope-comparison.md` found folded into the same buyout package as wood
and cold-formed framing. Acoustical ceiling tile is small ($5,214, JF only) and easy to
overlook; it is included here rather than given its own item because no other file prices
it separately.

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

### 19. Flooring — resilient, wood, and carpet

**Sources:**
- JF: "Sealed Concrete," "Luxury Vinyl Plank," "4" Rubber Cove Base," "Broadloom Carpet,"
  "Walk-Off Mat" (r112–r116, code 09.06000).
- V64: "LVT - Corridor," "Luxury Vinyl Plank," "Johnsonite Rubber Flooring," "Bathroom
  Resilient Flooring" (r151–r154); "Wood Flooring (High End)" 5,958.89 SF $20 (r157, code
  09.06400).
- VA: "VCT," "Luxury Vinyl Plank," "Bathroom Resilient Flooring" (r154–r156); wood
  flooring (r159).
- VR: same structure as V64 (r156–r159, r162).
- WS, VG: no line.

**Unit/quantity signal:** SF for sheet/plank flooring, LF for cove base, SY for carpet —
all scaling with floor area, one true unit-rate mismatch between SF and SY to watch for
in the importer.

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

**Flag M7 (carried from `jeffersons-ferry-scope-comparison.md`):** trash compactors and
chutes have no Autodesk group counterpart at all on the one job checked against buyout
data. This canonical item may be real scope that Autodesk simply never separates from
General Conditions or another catch-all — worth confirming before it is used as a
benchmark input, since a $0 Autodesk-side figure does not necessarily mean the scope was
dropped.

---

## Division 12 — Furnishings

### 24. Cabinetry, countertops, and window treatments

**Sources:**
- JF: "Unit Kitchen Cabinets and Countertops" 15.00 EA $6,500 (r148, code 12.03800);
  "Window Treatments" 1.00 ALLW $35,000 (r145, code 12.02000).
- V64: "Kitchen & Vanity cabinets & SS Countertops" 75.00 EA $11,000 (r194).
- VA: "Solid Surface Countertops" 1,027.00 SF $100; "Stone Countertops (From Elevations)"
  5,958.40 SF $120 (r191–r192, code 12.03600); "Kitchen & Vanity cabinets" 1.00 LS
  $1,200,000 (r195, code 12.03800).
- VR: same cabinetry line as V64 (r199).
- WS, VG: no line.

**Unit/quantity signal:** EA scaling with unit count (JF, V64, VR); SF scaling with
countertop area (VA's countertops); one LS at VA for cabinets specifically.

**Flag:** VA is the only file that separates countertops (priced by SF, real material
takeoff) from cabinets (priced as one LS). The other files bundle cabinets and
countertops into one per-unit EA rate. These are not directly comparable rates without
knowing what is and is not inside VA's cabinet LS number.

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

**Flag:** the same real-world amenity scope is priced as normal Division 13 line items on
V64 and VR but folded into an omnibus Division 95 allowance on VA, at a per-SF rate
($400/SF and $350/SF) rather than a lump sum. That is a large basis difference
($1.9M combined at VA vs. $268,000–$343,000 combined at V64/VR for what appears to be
comparable amenity space).
**Resolved (Matt, 2026-09-18): a lump sum is the appropriate basis for this item.** VA's
per-SF allowance approach is the wrong basis, not evidence of a genuinely larger amenity
package. Treat V64/VR's lump-sum lines as the pattern to follow; VA's figure should not be
read as a higher comparable without re-pricing it as a lump sum first.

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

**Flag:** confirms the code drift `rom-system-design.md` already names (14.02000 vs
14.21001). Beyond the code, the unit rate itself is not close: $190,000/elevator (JF,
V64), $33,000/stop × 6 stops = $198,000/elevator-equivalent (VA, roughly consistent),
versus $271,858.84/elevator at West Shore — 43% above the others even before accounting
for West Shore's higher rated speed (250 fpm vs. 100 fpm on the JF/V64 description).
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
internally to get a better pricing quantity than flat square feet, never as an engineered
system shown to anyone. Until that lands, this item stays one blended rate.

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

**Flag:** V64's and VR's electrical descriptions both say "w/ fire alarm" in plain text,
meaning fire alarm cost is bundled into this SF rate rather than broken out — see item 32
below for why that matters. VA's generator is a genuine scope difference (this job has
a backup generator; none of the others price one), not a pricing inconsistency, and
should stay flagged rather than be treated as a missing line on the other five files.

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

**Flag:** this item exists because it matches how the trade actually buys the work, not
because Kulka's data proves it yet. Its first few benchmark numbers should be treated as
unconfirmed until a real job's buyout shows the furnish and install numbers separately.

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

**Flag:** JF is the only file that isolates fire alarm as its own Division 28 line — a
division ADR 0004 already notes Autodesk uses for fire alarm alone, "when 28 is
Electronic Safety and Security" generally. Because the three Vue files bury fire alarm
inside the electrical rate with no separate dollar figure, this canonical item cannot be
benchmarked consistently across files today; only JF and, eventually, an Autodesk import
can supply a real fire-alarm-only number.

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

**Flag:** whether this applies to a given job is a jurisdiction question, not something an
estimator should be expected to know from memory or something the tool should ask outright
without help. See the new gate for this item in `rom-spec.md` and the Jev research ticket
that answers it from the project's own code jurisdiction.

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

### 34. Excavation, backfill, foundation prep, and deep foundations

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

**Flag:** West Shore's pile allowance is a real, one-off scope difference (poor bearing
soil or a structural condition requiring deep foundations), not an error — keep it
flagged rather than folded silently into a generic excavation rate. VA's excavation
add/deduct/re-price sequence (r264–r266) should be reviewed by an estimator before
import; it is unclear from the file alone whether the net effect is $300,000 or some
other figure.
**Resolved (Matt, 2026-09-18): $300,000 is correct.** A propose/deduct/re-price sequence
nets to its final stated line, the same pattern as the CMU and elevator add/deduct pairs
in items 5 and 26 — the first two lines role-flag as superseded, the third stands.

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

**Flag:** confirmed defect, do not import West Shore's r74 as a real per-LF rate — role
it as a data-entry error, not scope, when it reaches `budget_lines`.

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

### 37. Site grading, topsoil, and landscaping/irrigation

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

**Flag:** JF files landscaping at Division 32 (32.09300) while V64 files its
functionally similar topsoil/seeding line at Division 31 (31.02200 Grading) — a third
division-drift instance, smaller in dollars than the sewer/utility one above but the same
pattern: where the site-scope/building-scope line falls between Division 31 and 32 is not
consistent across files, consistent with `rom-system-design.md`'s general note that
"codes split" across the building/site boundary.
**Closed:** added to the drift list as a fourth confirmed instance. No decision pending;
the canonical item mapping already reads past the division code to the description.

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

**Flag:** West Shore's retaining wall is a genuine site-condition-driven scope item
(likely a grade change or property-line constraint specific to that site), not
comparable to any line on the other five jobs. Keep it inside this item but flagged, the
same way the pile allowance in item 34 is flagged, so a benchmark built from this item
does not accidentally price a flat site into a sloped one.

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
  (1.00 LS $120,000, r323) do not cleanly fit any canonical item above.
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
