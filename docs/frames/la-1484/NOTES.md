# Client comment layer still frames (LA-1484)

These are still frames of the comment layer on the Kulka client budget page, ticket 1 of
the LA-1480 build. Matt scores them, and the bar is 90. They are static HTML, not app
code. LA-1489 builds the layer from them once Matt passes them.

The frames sit on top of the approved LA-1479 drill-down frames (scored 92, merged at
`docs/frames/la-1479/`). `page.css`, `drill.css`, `data/` and the drill-down markup in
`tools/build.mjs` are copied unchanged. Every rule for the comment layer is in
`comments.css`, and the seven frames are the last part of `tools/build.mjs`. The ledger,
its terms, the locked "Ledger, Opened" layout, the dot-plus-ink status style and the
hidden By Element view all stay as approved.

**The threads are sample content.** Dan Reyes at Fieldstone (the reader), Sam Ortiz at
The Kulka Group (the replier), every message and every date in a thread are sample data,
and each frame says so in a dashed Frame Note. Every figure and every budget answer comes
from `data/model.json` (MN Test #4, run 9b995af5, as LA-1479 used it).

## The frames

Each frame is one HTML file in this folder, rendered at 1440 and 390 wide. `png/` holds a
full-height shot (`NN-name-1440.png`, `NN-name-390.png`) and a first-screen shot
(`NN-name-1440-view.png`, `NN-name-390-view.png`). Score the first-screen shots.
`png/contact-sheet.png` shows them all.

1. **01, At Rest.** The page as a reader sees it after opening their own link. The header
   holds the one Comment control, with a blue 1 for the reply that arrived since this
   browser last opened the page. Three divisions carry a dot and a count at their right
   edge: 14 has an open thread (orange), 26 an answered one (blue), and 31 a closed one
   (green). Nothing else on the page changes.
2. **02, Comment Mode.** The control reads Done, and one blue line under the header says
   "Tap any line, answer or figure to comment on it." Every element a reader can comment
   on has a thin dashed outline. At 1440 the one under the pointer, Structure Demolition,
   has a solid outline and a blue plus at its right edge. Rows do not open in this mode,
   so their Open pills dim.
3. **03, The Composer.** A tap on Structure Demolition opens the composer beside the
   ledger, joined to the line by a short lead. On a phone it is a bottom sheet. A line's
   figure allows two kinds, Comment and Ask a Question. The foot reads "Commenting As Dan
   Reyes, Fieldstone" with Not You?, and one Post button.
4. **04, The Flag Composer.** Structure Demolition open on its Basis tab, and the
   composer on Structure Coming Down. A Basis row allows all three kinds, and Flag This
   Assumption is chosen. Budget Says (the anchor) sits beside What It Should Be (required),
   and Why (optional) sits under them. The question from frame 03 now shows as an open
   thread on the line.
5. **05, A Thread.** The reader tapped the blue dot on Structure Demolition. The thread
   shows the question, Kulka's reply under the replier's name and The Kulka Group on a
   light panel, a reply box, Close Question and Reply.
6. **05b, A Flag Thread.** I added this one. The spec puts "Budget Says next to Owner
   Says" in the thread, not the composer, so a posted flag needs its own frame. Kulka has
   replied, and the flag stays open, because only Accept or Decline closes a flag. The
   reader can reply or withdraw it.
7. **06, The Closed States.** Six threads on Structure Coming Down, each folded to its
   state and its first line with a green dot: Carried Into Version 2, Accepted for Next
   Version, Declined (with Kulka's reply), Withdrawn, Closed, and a comment that reads
   "Removed at the Writer's Request" in grey italic.
8. **07, From Earlier Versions.** The end of What Happens Next on Version 2. Two threads
   whose elements Version 2 no longer has, each quoting what the reader was looking at:
   a question on Clarification 6 (the model's own words) and a comment on Gas Meter and
   Service Disconnect, No Rate Yet. Each shows its state and a Show pill.

## Words in each card

These count the words inside the composer, thread or list at 1440.

| Frame | Words |
| -- | -- |
| 03, The Composer | 27 |
| 04, The Flag Composer | 64 |
| 05, A Thread | 61 |
| 05b, A Flag Thread | 85 |
| 06, The Closed States | 92 |
| 07, From Earlier Versions | 69 |

## Decisions and why

- **The marker is a dot and a count with no box.** That is the page's own dot-plus-ink
  style. At 1440 the dot sits on the ledger's right border and the count just past it,
  so every marker lines up in one rail and none covers a figure. A phone has no gutter,
  so the marker sits inside the row on its second line, under the figure.
- **Three colours for three states.** Orange (the working colour the page already uses)
  means open, waiting on Kulka. Blue means Kulka answered and the reader has something to
  read. Daylight's Done green means closed, as the spec names. Labels stay in ink. No new
  colour enters the page.
- **The header badge counts new replies.** Decision 3 has the control show replies since
  the browser last opened the page. I drew it as a small blue count inside the pill.
- **Comment mode shows outlines on every addressable element at once**, dashed and light,
  with the hovered one solid. The spec says outlines show "on hover or tap". A phone has no
  hover, so without standing outlines a phone reader could not see what is tappable. This
  is open question 2.
- **Comment mode has a Done control and one line of instruction.** The pressed pill alone
  did not say how to leave the mode or what to do in it.
- **Rows do not open in comment mode.** A tap opens the composer instead, so the mode never
  fights the ledger's tap-to-open rows. The Open and Close pills dim to say so.
- **At 1440 the card sits beside the ledger over the drawing**, joined to its element by
  a blue lead in the same language as the section's tag. The drawing's tag hides while a
  card is open, because the card names the element. The ledger and the section stay as
  approved underneath.
- **On a phone the card is a bottom sheet** over a light scrim, and the page scrolls so
  the element sits just above the sheet with its outline showing.
- **Post is a black pill**, like the page's other pressed pills. Blue stays the accent.
- **Kulka's messages sit on a light panel** so the reader can tell the two voices apart at a
  glance without a new colour.
- **Frames 06 and 07 are drawn as Version 2's page**, because Carried Into Version 2 and
  From Earlier Versions only show there. Version 2 does not exist, so the figures and the
  Basis behind them are Version 1's, standing in. Both frames say so in their notes. In a
  real Version 2, Structure Coming Down would already read what the carried flag asked
  for.
- **The six closed threads in frame 06 share one row** only so one frame can show every
  state. Under the carry rule, the five that are not Carried were posted on Version 2.
- **Removed at the Writer's Request is drawn as a closed comment** whose first line is
  the removal notice. It is a message state, not a thread state, so it keeps its thread's
  state beside it.
- **The orphans in frame 07 are plausible, not invented.** A rewritten clarification
  changes its `note:` key, and a supporting item that gains a rate moves from `unpriced:`
  to `line:`. Both orphan under rule 4.
- **The client page names no AI, shows no past jobs and uses Title Case labels.** The
  build refuses to write a frame whose visible text names AI, carries past-job wording or
  contains a dash.

## Open questions for Matt

1. **Should a closed division show the threads inside it?** The spec puts a dot only on an
   element that has threads. A thread on Structure Demolition is invisible while 02 is
   closed, so a reader could miss Kulka's reply. I recommend a closed division row carry
   the count of every thread on it and inside it, with the colour of the one that most
   needs the reader. Frame 01 does not draw this yet.
2. **Standing outlines in comment mode, or outlines only under the pointer?** I drew light
   outlines on everything, because a phone has no hover. The cost is a busier screen
   while the mode is on.
3. **Is Done the right word for leaving comment mode?** The alternative is keeping the
   label Comment and showing only the pressed state.
4. **Should a superseded Version 1 page also read Carried Into Version 2 on an accepted
   flag?** The spec says the new version shows it. It does not say what Version 1's own
   page shows once Version 2 is out.
5. **A comment on the budget as a whole** (`page:general`) has no place drawn yet. It
   could open from the header control outside comment mode. I left it out of these frames.

## Second-opinion scores

These scores are my second opinion. Matt's score is the gate. Each is scored on its first
screen at both widths.

| Frame | Score | What holds it back |
| -- | -- | -- |
| 01, At Rest | 92 | Threads inside a closed division do not show (question 1). |
| 02, Comment Mode | 90 | Every row outlined at once is busier than the rest of the page. |
| 03, The Composer | 92 | The card covers part of the drawing at 1440. |
| 04, The Flag Composer | 91 | The card fills the lower half of the screen at both widths. |
| 05, A Thread | 92 | The reply box and two actions add a third of the card's height. |
| 05b, A Flag Thread | 90 | At 85 words it is the heaviest card, and Budget Says repeats the row beside it. |
| 06, The Closed States | 90 | Six threads on one row is staged, and Version 1's Basis stands in for Version 2's. |
| 07, From Earlier Versions | 91 | Version 2 is a stand-in, and the first quote runs to two lines. |

## Where things are

- `tools/build.mjs` builds every frame. `node tools/build.mjs`, then `node tools/shoot.mjs`.
- `tools/shoot.mjs` is LA-1479's, with one change: a phone frame may name its own focus
  (`data-focus-phone`), the element its bottom sheet is on.
- The phone full-height shots show the bottom sheet where the first screen was, not at
  the foot of the page, because the sheet is fixed to the screen. Score the phone
  first-screen shots.
- The fixture is read from the main checkout, read only. Nothing was written in a git
  worktree.
