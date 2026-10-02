# Budget drill-down still frames (LA-1479)

These are still frames of the client budget page with a drill-down from division to item
to assumptions. Matt scores them, and the bar is 90. They are static HTML, not app code. The
build goes under its own issue once Matt passes them.

Rob asked for the drill-down at the BLDG Labs and Kulka sync on 2026-10-02, written for
readers like Dan at Fieldstone. The first screen, the letter and the waterfall stay as PR
134 shipped them. The frames change only the ledger, What You Told Us and What Is In, and
all of it stays inside the locked "Ledger, Opened" layout.

This is round two. Round one scored 88 as a second opinion, because frames 02 to 05 were
long walls of small text in the 584px ledger column while the section beside them sat
mostly empty. Matt has already rejected Kulka screens for carrying too much text (round 5 of
the ROM block screen). Round two opens one level at a time, cuts the words in each opened
state by more than three quarters, makes the section answer what is open, and turns the
gap boxes into one quiet line each.

## The frames

Each frame is one HTML file in this folder, rendered at 1440 and 390 wide. `png/` holds a
full-height shot of each (`NN-name-1440.png`, `NN-name-390.png`) and a first-screen shot
scrolled to where a reader would be looking (`NN-name-1440-view.png`). The first-screen
shots are the ones to score. `png/contact-sheet.png` shows all of them.

1. **01, The Ledger by Division.** The drill-down is closed. The ledger's 36 rows group into
   the 21 MasterFormat divisions they already carry, and each shows its figure, $/SF, share
   and confidence mark. The view is mid-scroll as shipped: the lens holds 22 Plumbing and the
   section has drawn every layer down to it.
2. **02, A Division, Opened.** 02 Existing Conditions opens on its Items tab: Structure
   Demolition, Site Demolition, and one closed row for the four items Structure Demolition
   brings in, which have no rate yet. The tab row ends in the empty VE control and the
   LA-1480 slot.
3. **03, An Item, Opened.** Structure Demolition opens on its Assumptions tab: the three
   answers it prices on, each marked Stated, and Kulka's rate. Each row has the LA-1480 slot.
4. **03b, Included and Excluded.** The same item on its second tab, three lines each side.
5. **04, Confidence, and What Would Raise It.** 14 Conveying Equipment opens on its
   Confidence tab: the division's mark, each line's mark, and four rows (V-1, V-2 and V-3,
   still planning assumptions, and the open groundwater question).
6. **04b, What Decided It.** 08 Openings on its third tab: Overhead Doors and Storefronts,
   not in this job, each with the answer that removed it. This is where What Is In goes.
7. **05, A Division With Gaps.** 22 Plumbing, the common case: one line, no sub-items. The
   What the Model Needs panel sits under the section, as a frame note.
8. **06, Where the Sections Go.** What You Told Us keeps the 11 answers about the whole
   project and lists where the other 16 went. What Is In, and What Is Not becomes Notes and
   Clarifications. The frame shows its first three notes and elides the rest, which are
   unchanged.

## What changed in round two

- **One level open at a time.** An open division has three tabs: Items, Confidence and What
  Decided It. An open item has three: Assumptions, Included and Excluded, and Source. Only
  one panel shows. Every opened state shows the figure, the confidence mark and three or four
  rows in its first screen at both widths.
- **The section answers what is open.** At every opened state the section shows the whole
  building in light ink, lights the open division's layer in the blue it already uses for
  the current row, and sets a small tag beside the lit strokes. The tag names the open
  division or item, with its figure and mark. A script places it from the layer's own
  geometry. The detail text stays in the ledger column, as the lock requires.
- **Gaps are one line each.** Each gap is a single grey line starting "Not in the model:",
  with the field named in monospace. The full list sits in one What the Model Needs panel,
  on frame 05 only.
- **The controls are small.** The VE control is a 22px pill reading "VE None Yet". The
  LA-1480 slot is a 20px dashed pill. At 1440 both sit at the end of the division's tab row.
  On a phone they close the open division, so they do not crowd the tabs.
- **The phone lens folds while a division is open.** It drops to two lines (name, figure,
  mark, Close), so the open panel gets the screen. At 1440 the lens stays as shipped. With a
  division open, the row under the lens folds away at both widths, because the lens already
  shows it and holds Close.

## Words per opened state, before and after

These are words inside the open division, counted from the rendered page at 1440.

| Opened state | Round one | Round two | Cut |
| -- | -- | -- | -- |
| 02, Division Open | 230 | 39 | 83% |
| 03, Item Open (Assumptions) | 534 | 104 | 81% |
| 03b, Item Open (Included and Excluded) | 534 (one state in round one) | 97 | 82% |
| 04, Confidence | 436 | 68 | 84% |
| 04b, What Decided It | none (new) | 24 | |
| 05, Division With Gaps | 350 | 24 | 93% |

The phone counts are the same, give or take one word. Frame 05's panel is a frame note
outside the page, so it is not counted.

## Where the data comes from

`data/model.json` is `presentBudget()` run on `test/fixtures/published-budget-mn4.json` at
commit 38a8e4a. That fixture is MN Test #4's production run 9b995af5, frozen on 2026-09-29
and served by `/b/fixture`. I did not query Supabase, because the Supabase connection in
this session lists no Kulka project. The fixture is the run the page tests already treat as
the reference. If MN Test #4 has a newer run, these frames do not reflect it.

The section drawings in `data/` are the shipped page's own SVG, captured from the rendered
fixture page by `tools/capture.mjs`. `page.css` is `public/scrollcraft/budget-page.css`
copied unchanged. Everything new is in `drill.css`. To rebuild, render the fixture page, run
`node tools/capture.mjs <url>`, then `node tools/build.mjs` and `node tools/shoot.mjs`.
`build.mjs` also writes `data/audit.json`, the table below in machine form.

## Data audit

The model gives every division a figure, a range, its lines with their sources and past
jobs, and a confidence mark per line. It gives no division a written scope. No line records
which answers it prices on, its quantity, or what would raise its mark. "Items" counts
priced lines plus supporting items with no rate.

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
  The schema has breakouts (`block_classification.breakout_of_cost_code`), but no line in
  this run has one.
- **Assumptions.** The model holds the answers and the nine criteria, and each criterion
  names the cost codes it prices, so criteria have a real link to lines. Answers have none.
  The frames tie the demolition and elevator answers to their division through the branch
  gates (`branch_gate_items`) and Kulka's item definitions, and frame 03 says so in its gap
  line.
- **Included and Excluded.** No line carries its scope. At division level the model does
  hold what an answer brought in or left out (the gate rows), and frame 04b shows those. At
  item level the only written scope is in `docs/precon/canonical-work-items.md`, and only
  for some items. Item 1a, Structure Demolition, states both lists. Frame 03b shows them in
  three lines each side, condensed from that definition and marked as not from the model.
  Item 28, Plumbing, states neither list.
- **Confidence.** Every line has a high, medium or low mark, and a division takes its lines'
  mark by the rule elements already use. The model holds nothing that says an owner item
  would raise a mark. The mark comes from Kulka's own figures: medium needs 2 Kulka jobs
  inside a 20% spread, and high needs 5 inside 10%. Kulka has 2 jobs imported, so no line
  priced from jobs can reach high today, whatever the owner supplies. Of the 21 divisions,
  17 are low, 4 are medium and none is high.

## Model fields the build needs

These are the six rows of the What the Model Needs panel on frame 05.

1. `line.inputs[]`: the fact keys a line prices on, so an answer can sit under its line as
   an assumption without a hand-made map.
2. `line.quantity` and `comparable.unit`. The snapshot holds a stated rate's figure (13.20
   for Structure Demolition) but not its unit or quantity, so the page can only say Rate on
   File.
3. `canonical_work_items.includes` and `excludes`, written by Kulka per item and frozen into
   each line as `line.includes[]` and `line.excludes[]`.
4. Sub-items for single-line divisions: breakouts with a figure each
   (`block_classification.breakout_of_cost_code`), or more canonical items priced on their
   own. Item 29, Plumbing Fixtures, is defined but not in this run.
5. `confidence.raisedBy[]` on each line: the item, who supplies it, and the mark it would
   move to. A stated rule for how a settled criterion or an answered question moves a mark
   would also work. Without one of these, What Would Raise It can list the open items but
   cannot promise they raise anything.
6. `line.division` in the snapshot, so the page does not need `ITEM_DIVISION_MAP` to group
   rows.

## Decisions and why

- **The top level is the MasterFormat division.** It is the trade vocabulary Dan reads, the
  ledger already orders by it, and it cuts the list from 36 rows to 21. An element (the
  Demolition and Elevator boxes) stays whole under its driver's division, as the shipped
  ledger places it. That keeps the four disconnects under 02 even though their own
  divisions are 22, 26 and 33.
- **Confidence is a column on the closed row and a tab in the open division.** The words
  are the model's three marks (High, Medium, Low). I gave medium a half dot, because today
  medium and low share the same ring and cannot be told apart at a glance.
- **Tabs rather than stacked sections.** Round one stacked every panel, and a division ran
  three screens long. With tabs, each panel fits in one screen and the reader picks what to
  read next.
- **The four disconnects are one closed row.** They share a driver and none has a rate, so
  one row ("Brought In by Structure Demolition, 4 Items, No Rate Yet") says everything until
  the reader opens it. The row adds no name the model does not have.
- **Past jobs move down one level**, to the item's Source tab. Today a row opens straight to
  its past jobs. Now an item opens to its assumptions first.
- **What You Told Us keeps only whole-project answers.** The 16 answers that price one trade
  move under that trade, and the section lists where each went. Tie-in to an Existing
  Building touches no trade, so it stays as a fact.
- **What Is In, and What Is Not becomes Notes and Clarifications.** Every gate row except
  the tie-in moves to a division's What Decided It tab. The notes and the pricing
  parameters stay as shipped. The index label changes from What Is In to Notes.
- **The VE control is present and empty**, so the build keeps its place without inventing
  an option. The LA-1480 control is only a reserved slot, because that spec is being written
  now.
- **Nothing is filled in.** Each gap shows one line naming the field. Frame 03b is the one
  place a frame shows content from outside the model. Its gap line names the source, so Matt
  can see the tab with real scope in it.

## Open questions for Matt

1. Should 02 read Existing Conditions (the MasterFormat title) or Demolition, the word Rob
   used? The same question applies to 14: Conveying Equipment or Elevators.
2. Rob asked for low or high. The model has three marks. Keep three, or fold medium into one
   of the other two?
3. Under today's rule no owner input can raise a job-priced line to high. Does What Would
   Raise It need its own measure, separate from the count of past jobs, or should the rule
   change?
4. Rob listed Utility Disconnects as one sub-item, and the frames now show the four as one
   closed row. Should that row read Utility Disconnects instead of naming its driver?
5. Notes 5, 9, 10, 13 and 14 repeat what now sits under each division. Keep them, or cut
   them from Notes?
6. Who writes the included and excluded lists for each canonical item? Does any of it come
   from Kulka's ProEst or Autodesk scope text?
7. What Happens Next still says to read What You Told Us to confirm the facts. Should it
   point at the assumptions under each division instead?
8. On a phone the lens folds to two lines while a division is open. That is the one change
   to shipped lens behavior. Keep it?

## Second-opinion scores

These scores are my second opinion. Matt's score is the gate. Each is scored on its first
screen at both widths.

| Frame | Score | What holds it back |
| -- | -- | -- |
| 01, The Ledger by Division | 90 | 21 rows is still a long table. The trade-cost foot wraps at 1440, as shipped. |
| 02, A Division, Opened | 92 | The lit demolition layer is a small dashed box, so the section answer is quiet here. |
| 03, An Item, Opened | 90 | "Rate on File" is a weak value for a reader like Dan. It is true until the model holds the unit and quantity. |
| 03b, Included and Excluded | 90 | The lists come from Kulka's item definition, not the model, and three of the six lines are condensed from longer text. |
| 04, Confidence, and What Would Raise It | 92 | The panel lists items the model cannot yet promise will raise the mark. |
| 04b, What Decided It | 91 | Two rows is thin, but it is all the model has for 08. |
| 05, A Division With Gaps | 90 | Most of the division is a gap. The frame is meant to show that. |
| 06, Where the Sections Go | 90 | The frame elides notes 4 to 15, which stay unchanged. |

Every frame now clears 90 inside the locked layout, so I did not add an alternate frame
that breaks the lock. What holds the set short of the mid-90s is the model, not the layout:
the gaps in the table above are where the frames have nothing true to show.
