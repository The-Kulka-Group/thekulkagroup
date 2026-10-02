# Budget drill-down still frames (LA-1479)

These are six still frames of the client budget page with a drill-down from division to
item to assumptions. Matt scores them; the bar is 90. They are static HTML, not app code,
and the build goes under its own issue once Matt passes them.

Rob asked for the drill-down at the BLDG Labs and Kulka sync on 2026-10-02, written for
readers like Dan at Fieldstone. The first screen, the letter and the waterfall stay as PR
134 shipped them. The frames change only the ledger, What You Told Us and What Is In.

## The frames

Each frame is one HTML file in this folder, rendered at 1440 and 390 wide. `png/` holds a
full-height shot of each (`NN-name-1440.png`, `NN-name-390.png`) and, for frames 02 to 06,
one screen as a reader scrolled there would see it (`NN-name-1440-view.png`). The contact
sheet is `png/contact-sheet.png`.

1. **01, The Ledger by Division.** The drill-down is closed. The ledger's 36 rows group into
   the 21 MasterFormat divisions they already carry. Each division shows its figure, $/SF,
   share of the contract and a confidence mark. The lens and the section drawing behave
   as shipped.
2. **02, A Division, Opened.** 02 Existing Conditions opens to its items: Structure
   Demolition, Site Demolition, and the four utility disconnects that Structure Demolition
   brings in, which have no rate yet. A bar at the top keeps room for the LA-1480 flag or
   comment control and holds the LA-1481 Value Engineering control in its empty state.
   Below the items sit the confidence panel and What Decided It, which is the What Is In
   row for this division.
3. **03, An Item, Opened.** Structure Demolition opens to Assumptions, Included and
   Excluded, and Where the Figure Came From. Every assumption shows with who set it and has
   room for the LA-1480 control.
4. **04, Confidence, and What Would Raise It.** 14 Conveying Equipment opens with the
   confidence panel filled: the two lines' own marks, and the four open items the model ties
   to this division (V-1, V-2 and V-3, still planning assumptions, and the open groundwater
   question).
5. **05, A Division With Gaps.** 22 Plumbing shows the common case: one line, no sub-items,
   no written scope, and no owner item that would raise the mark.
6. **06, Where the Sections Go.** What You Told Us keeps the 11 answers about the whole
   project and lists where the other 16 went. What Is In, and What Is Not becomes Notes and
   Clarifications, holding the numbered notes and the pricing parameters.

Two markers appear on the frames and never in the build. A hatched box titled **Not in the
Model Yet** is a gap: it names the field the build needs and says what the model holds
today. A dashed pill marked **LA-1480** or **LA-1481** is room kept for another issue's
control.

## Where the data comes from

`data/model.json` is `presentBudget()` run on `test/fixtures/published-budget-mn4.json` at
commit 38a8e4a. That fixture is MN Test #4's production run 9b995af5, frozen on 2026-09-29
and served by `/b/fixture`. I did not query Supabase: the Supabase connection in this
session lists no Kulka project, and the fixture is the run the page tests already treat as
the reference. If MN Test #4 has a newer run, these frames do not reflect it.

The section drawings in `data/` are the shipped page's own SVG, captured from the rendered
fixture page by `tools/capture.mjs` at four ledger positions. `page.css` is
`public/scrollcraft/budget-page.css` copied unchanged. Everything new is in `drill.css`.

To rebuild: render the fixture page, run `node tools/capture.mjs <url>`, then
`node tools/build.mjs` and `node tools/shoot.mjs`. `build.mjs` also writes
`data/audit.json`, the table below in machine form.

## Data audit

The model gives every division a figure, a range, its lines with their sources and
comparables, and a confidence mark per line. It gives no division a written scope, and no
line records which answers it prices on, its quantity, or what would raise its mark. Below,
"items" counts priced lines plus supporting items with no rate.

| Division | Figure | Mark | Items | Criteria Tied to It | Answers Moved Here | Scope Decisions Moved Here |
| -- | -- | -- | -- | -- | -- | -- |
| 02 Existing Conditions | $215,859 | Low | 2 priced, 4 no rate | None | Demolition, Structures Coming Down, Area Coming Down, Structure Coming Down | Demolition (In) |
| 03 Concrete | $1,229,799 | Low | 2 | S-1 (Planning) | None | Building Concrete (Not in This Job) |
| 04 Masonry | $135,472 | Medium | 1 | None | None | None |
| 05 Metals | $232,442 | Medium | 1 | None | None | None |
| 06 Wood, Plastics and Composites | $1,481,087 | Low | 5 | A-1 (Settled), A-2 (Planning) | Balconies | Balconies (In) |
| 07 Thermal and Moisture Protection | $1,401,802 | Low | 3 | None | None | None |
| 08 Openings | $500,590 | Low | 2 | None | Retail Storefronts | Overhead Doors, Storefronts (Not in This Job) |
| 09 Finishes | $4,225,021 | Low | 4 | A-1 (Settled) | None | None |
| 10 Specialties | $300,571 | Low | 1 | None | None | None |
| 11 Equipment (Owner) | $235,430 | Low | 1 | None | None | None |
| 12 Furnishings | $804,992 | Low | 3 | None | None | None |
| 13 Special Construction | $17,741 | Low | 1 | None | Amenity Scope | Amenity Scope (In) |
| 14 Conveying Equipment | $378,700 | Low | 2 priced, 7 no rate | V-1, V-2, V-3 (Planning) | Elevator, Elevators, Elevator Type, Hydraulic Jack, Machine Rooms, Machine Room HVAC | Elevator (In) |
| 21 Fire Suppression | $285,517 | Medium | 1 | A-1 (Settled) | None | None |
| 22 Plumbing | $1,812,022 | Medium | 1 | None | None | None |
| 23 HVAC | $957,894 | Low | 1 | M-0 (Planning), M-1 (Settled) | None | None |
| 26 Electrical | $1,237,763 | Low | 1 | E-1 (Planning) | None | None |
| 27 Communications | $394,368 | Low | 1 | None | None | None |
| 28 Electronic Safety and Security | $153,274 | Low | 1 | None | Emergency Radio Amplifier | BDA System (Not in This Job) |
| 31 Earthwork | $1,009,645 | Low | 1 | S-1 (Planning) | Below Grade, Groundwater or Poor Soil | Below Grade (Not in This Job), Support of Excavation (Waiting on an Answer) |
| 32 Exterior Improvements | $655,917 | Low | 3 | None | None | None |

What this means for each part of Rob's structure:

- **Sub-items.** Nine divisions have more than one item, because the ledger already groups
  several canonical items under one division (06 has five). Only 02 and 14 have items that
  hang off a driver, through the two elements the model knows. Twelve divisions hold a
  single line and cannot open further: 04, 05, 10, 11, 13, 21, 22, 23, 26, 27, 28 and 31.
  Breakouts exist in the schema (`block_classification.breakout_of_cost_code`) but no line
  in this run has one.
- **Assumptions.** The model holds the answers and the nine criteria, and each criterion
  names the cost codes it prices. That is a real link for criteria. Answers have no link to
  lines: the frames tie the demolition and elevator answers to their division by the branch
  gates (`branch_gate_items`) and by Kulka's item definitions, and say so where they do.
- **Included and Excluded.** No line carries its scope. At division level the model does
  hold what an answer brought in or left out (the gate rows), and those are real. At item
  level the only written scope is in `docs/precon/canonical-work-items.md`, and only for
  some items. Item 1a, Structure Demolition, states both lists, which frame 03 shows inside
  a gap box. Item 28, Plumbing, states neither.
- **Confidence.** Every line has a high, medium or low mark, and the division takes its
  lines' mark by the rule elements already use. The model holds nothing that says an owner
  item would raise a mark. The mark comes from Kulka's own figures: medium needs 2 Kulka jobs
  inside a 20% spread and high needs 5 inside 10%. Kulka has 2 jobs imported, so no line
  priced from jobs can reach high today, whatever the owner supplies. Of the 21 divisions,
  17 are low, 4 are medium and none is high.

## Model fields the build needs

1. `line.inputs[]`: the fact keys a line prices on, so an answer can sit under its line as
   an assumption without a hand-made map.
2. `line.quantity` and `comparable.unit`: the snapshot holds a stated rate's figure (13.20
   for Structure Demolition) but not its unit or quantity, so the page can only say Rate on
   File.
3. `canonical_work_items.includes` and `excludes`, written by Kulka per item and frozen into
   each line as `line.includes[]` and `line.excludes[]`.
4. Sub-items for single-line divisions: breakouts with a figure each
   (`block_classification.breakout_of_cost_code`), or more canonical items priced on their
   own (item 29, Plumbing Fixtures, is defined but not in this run).
5. `confidence.raisedBy[]` on each line: the item, who supplies it, and the mark it would
   move to. Or a stated rule for how a settled criterion or an answered question moves a
   mark. Without one of these, What Would Raise It can list the open items but cannot
   promise they raise anything.
6. A division title rule (see the open questions), and the division on each line in the
   snapshot itself, so the page does not need `ITEM_DIVISION_MAP` to group rows.

## Decisions and why

- **The top level is the MasterFormat division.** It is the trade vocabulary Dan reads, the
  ledger already orders by it, and it cuts the list from 36 rows to 21. An element (the
  Demolition and Elevator boxes) stays whole under its driver's division, as the shipped
  ledger places it, so the four disconnects stay under 02 even though their own divisions
  are 22, 26 and 33.
- **Confidence is a column on the closed row** and a panel in the open division. The words
  are the model's three (High, Medium, Low). I gave medium a half dot, because today medium
  and low share the same ring and cannot be told apart at a glance.
- **The drill-down stays inside the ledger column**, opening in place the way a row opens
  today, with the section beside it. That keeps the locked "Ledger, Opened" layout. The cost
  is a narrow column for the deepest content at 1440.
- **The comparables move down one level.** Today a row opens to its past jobs. Now an item
  opens to its assumptions first and its past jobs last, under Where the Figure Came From,
  in the same markup.
- **What You Told Us keeps only whole-project answers.** The 16 answers that price one trade
  move under that trade, and the section lists where each went. Tie-in to an Existing
  Building touches no trade, so it stays as a fact.
- **What Is In, and What Is Not becomes Notes and Clarifications.** Every gate row but
  the tie-in has a division to go to. The numbered notes and the pricing parameters stay as shipped. The
  index label changes from What Is In to Notes.
- **The VE control is drawn present and empty** ("Value Engineering, None Offered Yet"), so
  the build reserves its place without inventing an option. The LA-1480 control is only a
  reserved slot, because that spec is being written now.
- **Nothing is filled in.** Where the model has no data, the frame shows the gap and names
  the field. The one place a frame shows content from outside the model is Structure
  Demolition's included and excluded lists, quoted from Kulka's item definition inside a
  gap box, so Matt can see what the section looks like with real scope in it.

## Open questions for Matt

1. Should 02 read Existing Conditions (the MasterFormat title) or Demolition, which is what
   Rob said? The same question applies to 14, Conveying Equipment or Elevators.
2. Rob asked for low or high. The model has three marks. Keep three, or fold medium into one
   of the other two?
3. Under today's rule no owner input can raise a job-priced line to high. Does What Would
   Raise It need its own measure, separate from the comparables count, or should the rule
   change?
4. Rob listed Utility Disconnects as one sub-item. The model has four. Show four, or group
   them under one heading?
5. Notes 5, 9, 10, 13 and 14 now repeat what sits under each division. Keep them, or cut
   them from Notes once the divisions carry them?
6. Who writes the included and excluded lists for each canonical item, and does any of it
   come from Kulka's ProEst or Autodesk scope text?
7. What Happens Next still says to read What You Told Us to confirm the facts. Should it
   point at the assumptions under each division instead?

## Second-opinion score

My score is 88, and it is a second opinion only; Matt's score is the gate. The frames are
faithful to the shipped page, every figure traces to the model, and the gaps are plain. Two
things keep them under 90. At 1440 the deepest content runs long in a 584px column while
the section beside it shows little, most of all at 02, where only the existing structure is
drawn. And the gap boxes, which are correct, make the frames read heavier than the built
page will. A layout that moved an open item's depth into the wide right column would likely
score higher, but it changes the locked layout, so I left it for Matt to call.
