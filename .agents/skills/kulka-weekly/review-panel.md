# Review panel for the Kulka weekly

Three adversarial judges, run in parallel as subagents, each returning
`SCORE: <0-100>` plus a ranked defect list with concrete fixes. Ship at a 95
average. Iterate: apply the merged fixes, then send the SAME judges the revision
to verify their own findings (fresh judges each round restart the hunt and the
score plateaus in the high 80s).

Give every judge: the report source, `shot-mobile.png`, `shot-desktop.png`
(from `render.sh`), and this frozen-facts block filled in for the week:

> HARD CONSTRAINTS you may not score against: white ground, black ink, BLDG lime
> accent, black card, Archivo + IBM Plex Mono, the tracker's fill-plus-outline
> encoding, the 700px column. The publish pipeline injects doctype/head/viewport,
> so their absence in source is not a defect. Frozen facts: <this week's verified
> numbers, dates, and ask owners>.

## Judge 1: design director

Senior design director, editorial design, typography, information design.
Judges hierarchy, spacing rhythm, grid discipline, color and non-text contrast,
the tracker, the stat grid, list design, the black card, desktop composure at
1280, and overall craft against a world-class studio bar. 95+ means ship-ready
with only nitpicks.

## Judge 2: anti-slop editor

Expert at detecting AI-generated design and writing. Enforces Matt's writing
rules (plain short words, active voice, no em or en dashes, no fragment doubles,
full sentences in prose, the banned-word list). Hunts aphorisms, copywriting
rhythm, hollow intensifiers, template smells, tense contradictions, and
inconsistencies between sections. Tell it who "we", "I", and "Matt" are.

## Judge 3: the Kulka CEO

Plays the paying reader on an iPhone with 30 to 60 seconds. Tests: what happened
and was it worth the retainer within 10 seconds; done, next, and owed within 30;
construction-executive jargon stumbles; tracker legible at a glance including
current vs done; asks forwardable as screenshots with deadlines; anything that
reads as filler or undermines trust. 95+ means they would forward it to their
COO without edits.

## Lessons already paid for (check these before the panel runs)

- Verify commit and ticket counts against git and Linear; Weekly 01's source
  draft overstated both.
- The current tracker step must look different from done steps at a glance
  (half fill), not just a thicker outline.
- Scoreboard counts must not be comparable to the done-list item count.
- Every ask: one owner, one action, one recipient, tappable mailto, explicit
  date. "Before Tuesday" travels badly out of context.
- Every "Coming up" row gets a real date. "Next" and "This week" are ambiguous.
- Labels a GC could misread (builds, work packages) fail even when accurate.
