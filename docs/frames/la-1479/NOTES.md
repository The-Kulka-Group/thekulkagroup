# Budget drill-down still frames (LA-1479)

These are still frames of the client budget page with a drill-down from division to item
to basis. Matt scores them, and the bar is 90. They are static HTML, not app code. The build
goes under its own issue once Matt passes them.

Rob asked for the drill-down at the BLDG Labs and Kulka sync on 2026-10-02, written for
readers like Dan at Fieldstone. The first screen, the letter and the waterfall stay as PR
134 shipped them. The frames change the ledger, What You Told Us (now Project Basis), What
Is In (now each division's Scope Decisions) and Clarifications. Everything stays inside the
locked "Ledger, Opened" layout.

This is round three.
- **Round one** scored 88 as a second opinion. It was too much text in a narrow column.
- **Round two** opened one level at a time, cut the words by more than three quarters, and
  made the section answer what is open.
- **Round three** applies Matt's answers of 2026-10-02, listed below.

## Matt's answers, 2026-10-02

1. **Two views of the ledger.** By Division is the default, with the MasterFormat titles
   (Existing Conditions, Conveying Equipment). The second view is Matt's "Module view",
   which means Elements as GLOSSARY.md defines them (a driver plus its supporting items). A
   two-way switch in the ledger header reads "By Division" and "By Element".
2. **Three confidence marks**, High, Medium and Low, with the half dot for Medium.
3. **No past jobs on the client page.** Clients see nothing about how many projects support
   a number, or about the supporting projects at all, until marketing adds it. The "Kulka
   Jobs" tags, the item's past-job tab and any explanation of the mark that counts jobs come
   off. The Confidence tab shows the mark and What Would Raise It as owner items only, with
   no counts and no promise of which mark an item moves to. A line may still say "Kulka
   Rate". LA-1483 is taking these off the live page now, and the frames show the page as it
   will be after that ships.
4. **The four utility disconnects live in Site Work.** By Division files them under a 33
   Utilities row, no rate yet and outside the total. By Element keeps them with Demolition
   as its supporting items. The "Brought In by Structure Demolition" row leaves 02.
5. **Clarifications.** Notes 9, 13 and 14 are cut, because each division now shows them.
   Notes 5 and 10 become one line each with no item names.
6. **Inclusions and Exclusions.** AI drafts each item's lists and the estimator approves
   them. Nothing reaches the client unapproved. Frame 03b shows an approved list.
7. **Standard estimate terms.** What You Told Us becomes Project Basis. The item tab
   Assumptions becomes Basis. Included and Excluded becomes Inclusions and Exclusions. What
   Decided It becomes Scope Decisions. Notes and Clarifications becomes Clarifications. What
   Happens Next tells the reader to check the Basis under each division and flag anything
   wrong. The index labels match.
8. **The phone keeps the folded two-line lens** while a division is open, and one tap opens
   the drawing again.

The same round also replaced the LA-1480 placeholder with that spec's real resting state
(docs/precon/client-comments-spec.md on its branch, Decision 4). The header gains one
"Comment" control. Outside comment mode an element shows nothing until it has threads, then
a small dot with a count. MN Test #4 has no threads, so no element shows a dot, and no
control repeats on any row.

## The frames

Each frame is one HTML file in this folder, rendered at 1440 and 390 wide. `png/` holds a
full-height shot of each (`NN-name-1440.png`, `NN-name-390.png`) and a first-screen shot
scrolled to where a reader would be looking (`NN-name-1440-view.png`,
`NN-name-390-view.png`). Score the first-screen shots. `png/contact-sheet.png` shows them
all.

1. **01, The Ledger by Division.** The drill-down is closed. The ledger's rows group into
   22 divisions, with 33 Utilities holding the four disconnects at No Rate Yet. The view is
   mid-scroll as shipped: the lens holds 22 Plumbing and the section has drawn every layer
   down to it. The sourcing line reads "3.3% of the trade cost is priced from rates Kulka has
   stated."
2. **01b, The Ledger by Element.** The model has two elements. Demolition is open with its
   two priced items and its four supporting items, the disconnects. Elevator sits closed
   below it. Every line with no element sits in one row, Not in an Element, so each line
   still shows once and the total is the same. One gap line names `line.element`.
3. **02, A Division, Opened.** 02 Existing Conditions on its Items tab, with Structure
   Demolition and Site Demolition only.
4. **03, An Item, Opened.** Structure Demolition on its Basis tab: three answers marked
   Stated, and Kulka's rate.
5. **03b, Inclusions and Exclusions.** The same item on its second tab, drawn as an
   approved list, three lines each side.
6. **04, Confidence, and What Would Raise It.** 14 Conveying Equipment on its Confidence
   tab: the mark, then four owner items (V-1, V-2 and V-3, still planning assumptions, and
   the open groundwater question). It shows no counts and no target mark.
7. **04b, Scope Decisions.** 08 Openings on its third tab: Overhead Doors and Storefronts,
   not in this job, each with the answer that removed it.
8. **05, A Division With Gaps.** 22 Plumbing has one line and no sub-items. The What the
   Model Needs panel sits under the section, as a frame note.
9. **06, Project Basis, Clarifications, What Happens Next.** Project Basis keeps the 11
   answers about the whole project and lists where the other 16 went. Clarifications shows
   the cut list. What Happens Next asks the reader to check the Basis and flag what is
   wrong.

## What changed in round three

- **The view switch.** A two-way pill sits in the ledger header. By Division is on in every
  frame but 01b.
- **No past jobs anywhere a client reads.** Item rows show their mark, plus "Kulka Rate"
  where the line rests on a stated rate. The item's Source tab is gone, so an item has two
  tabs, Basis and Inclusions and Exclusions. The Confidence tab no longer lists each line's
  mark or explains how the mark is set. The section drawing's ink note ("Full ink is priced
  from Kulka's completed jobs...") is removed. Clarifications and the parameters table drop
  the blend weights and the job thresholds (see Decisions).
- **33 Utilities.** The four disconnects moved out of 02 into their own row at the foot of
  the division view. 02 now has two items.
- **The Comment control.** One "Comment" pill sits at the right of the header's first tier,
  at both widths. The LA-1480 dashed pills are gone.
- **The phone section folds while a group is open.** It becomes one bar ("Building Section",
  the lit item, Show). One tap shows the drawing again. The two-line lens stays.
- **The renames**, in the index, the tabs, the section titles and What Happens Next.

## Words per opened state

These are the words inside the open division, counted from the rendered page at 1440.

| Opened state | Round one | Round two | Round three |
| -- | -- | -- | -- |
| 01b, By Element, Demolition Open | | | 49 |
| 02, Division Open | 230 | 39 | 20 |
| 03, Item Open, Basis | 534 | 104 | 80 |
| 03b, Inclusions and Exclusions | 534 (one state in round one) | 97 | 76 |
| 04, Confidence | 436 | 68 | 57 |
| 04b, Scope Decisions | | 24 | 20 |
| 05, Division With Gaps | 350 | 24 | 20 |

## Where the data comes from

`data/model.json` is `presentBudget()` run on `test/fixtures/published-budget-mn4.json` at
commit 38a8e4a. That fixture is MN Test #4's production run 9b995af5, frozen on 2026-09-29
and served by `/b/fixture`. I did not query Supabase, because the Supabase connection in
this session lists no Kulka project. If MN Test #4 has a newer run, these frames do not
reflect it.

The section drawings in `data/` are the shipped page's own SVG, captured by
`tools/capture.mjs`, with the ink note stripped at build time. `page.css` is
`public/scrollcraft/budget-page.css` copied unchanged. Everything new is in `drill.css`.
To rebuild, render the fixture page, run `node tools/capture.mjs <url>`, then
`node tools/build.mjs` and `node tools/shoot.mjs`. The build refuses to write a frame that
still says "Kulka Jobs" or "completed jobs". It also writes `data/audit.json`.

## Data audit

The model gives every division a figure, a range, its lines and a confidence mark per line.
It gives no line a written scope. No line records which answers it prices on, its quantity,
or the owner items that would firm it up. "Items" counts priced lines plus supporting items
with no rate.

| Division | Figure | Mark | Items | Criteria Tied to It | Answers Moved Here | Scope Decisions Moved Here |
| -- | -- | -- | -- | -- | -- | -- |
| 02 Existing Conditions | $215,859 | Low | 2 | None | Demolition, Structures Coming Down, Area Coming Down, Structure Coming Down | Demolition (In) |
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
| 33 Utilities | No Rate Yet | None | 4 no rate | None | None | None |

By Element, the model holds two elements: Demolition ($215,859, Low, 2 priced and 4
supporting) and Elevator ($378,700, Low, 2 priced and 7 supporting). The other 34 of the 38
priced lines have no element ($17,071,342 including the owner-direct Appliances line). The
schema allows Bathroom, Kitchen and Balcony elements, but no line in this run uses them.

What this means for Rob's structure:

- **Sub-items.** Nine divisions have more than one item. Only 02 and 14 have items that hang
  off a driver. Twelve divisions hold a single line and cannot open further.
- **Basis.** Criteria name the cost codes they price, so they have a real link to lines.
  Answers have none, so the frames tie them through the branch gates and Kulka's item
  definitions, and frame 03 says so in its gap line.
- **Inclusions and Exclusions.** No line carries its scope. At division level the gate rows
  are real, and frame 04b shows them. Frame 03b draws the approved list from Kulka's
  definition of item 1a, marked as not from the model.
- **Confidence.** Every line has a mark, and a group takes its lines' mark by the rule
  elements already use. The owner items in What Would Raise It come from the criteria tied
  to a division and the open questions those criteria read. The model holds no list of
  owner items per line.

## Model fields the build needs

These are the seven rows of the What the Model Needs panel on frame 05.

1. `line.inputs[]`: the fact keys a line prices on, so an answer can sit in its line's
   Basis without a hand-made map.
2. `line.quantity` and `comparable.unit`. The snapshot holds a stated rate's figure but not
   its unit or quantity, so the Basis can only say Rate on File.
3. `line.includes[]` and `line.excludes[]`. Each entry carries its text, its drafter (AI or
   user) and its approver. Only approved entries reach the snapshot a client reads.
4. Sub-items for single-line divisions: breakouts with a figure each
   (`block_classification.breakout_of_cost_code`), or more canonical items priced on their
   own.
5. `confidence.raisedBy[]` on each line: the owner items that would firm the line up, with
   no target mark and no count.
6. `line.element` for lines that have none, if Kulka wants more elements than Demolition and
   Elevator.
7. `line.division` in the snapshot. It must file 28a, 28b and 31f under 33 with 36a, as Matt
   decided. Today `ITEM_DIVISION_MAP` gives them 22, 22 and 26.

## Decisions and why

- **By Element keeps every line once.** GLOSSARY.md says every view shows every line exactly
  once and the same total. The two real elements lead, and the 34 lines with no element sit
  in one row, Not in an Element. I added no element the model does not have.
- **The seven Elevator supporting items stay under 14 in the division view.** Matt's call
  moved only the disconnects. Their own divisions would scatter them across 04, 05, 07, 23,
  26 and 27 (open question 1).
- **Note 4 is shortened and note 7 is cut**, beyond the cuts Matt named. Note 4 named blend
  weights and flag thresholds, which describe how past jobs are weighed and counted. Note 7
  said three lines have "no measured Kulka figure behind them", which tells a client about
  supporting figures. Both fall under answer 3. The parameters table drops the same five
  rows: the three weights and the two job thresholds.
- **Clarifications read 1 to 11 on the page.** Each keeps its model id (`note:<n>`), so a
  comment anchored to a note survives the cuts.
- **The phone section folds while a group is open.** I read "one tap opens the drawing
  again" as the pinned section folding to a bar while a division is open, which gives the
  open panel the screen.
- **What Would Raise It keeps its gap line** naming `confidence.raisedBy[]`. Today the list
  comes from criteria and their inputs, so divisions without a criterion (most of them) show
  nothing.

## Open questions for Matt

1. Should the seven Elevator supporting items also move to their own divisions in the
   division view, or stay under 14?
2. I shortened note 4 and cut note 7 under your rule on past jobs. Is that right?
3. Should the sourcing line under the ledger ("3.3% of the trade cost is priced from rates
   Kulka has stated") stay, or go with the rest in LA-1483?
4. Is the folded phone section what you meant by one tap opening the drawing again?

For the build, not for Matt: the letter's Inside list and its "Read the facts on the next
page" sentence must follow the renames, and LA-1483 also has the stage words and the
General Conditions basis that mention completed jobs.

## Second-opinion scores

These scores are my second opinion. Matt's score is the gate. Each is scored on its first
screen at both widths.

| Frame | Score | What holds it back |
| -- | -- | -- |
| 01, The Ledger by Division | 90 | 22 rows is a long table, and the trade-cost foot wraps at 1440, as shipped. |
| 01b, The Ledger by Element | 90 | Not in an Element holds 97% of the contract, because the model has only two elements. |
| 02, A Division, Opened | 92 | The lit demolition layer is a small dashed box. |
| 03, An Item, Opened | 91 | "Rate on File" stays a weak value until the model holds the unit and quantity. |
| 03b, Inclusions and Exclusions | 91 | The approved list follows Kulka's definition, not the model, and three lines are condensed. |
| 04, Confidence | 92 | Most divisions have no criteria, so their What Would Raise It is empty today. |
| 04b, Scope Decisions | 91 | Two rows is all the model has for 08. |
| 05, A Division With Gaps | 90 | Most of the division is a gap, which is what the frame shows. |
| 06, Project Basis, Clarifications, What Happens Next | 90 | Clarifications is still eleven lines of model text. |

Every frame clears 90 inside the locked layout. What keeps the set below the mid-90s is the
model, not the layout.
