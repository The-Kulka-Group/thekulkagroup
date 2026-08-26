# Blackline

The Kulka AI design language. Revision C (Daylight), issued 2026-08-25.

This file is the law for every screen Kulka AI ships. It is written for the builder, not
for a pitch deck. Where it gives a number, use the number. Where it gives a rule, follow
the rule or change this file first. All example data in this file is labeled example and
must never ship as real content.

---

## Revision C (Daylight, 2026-08-25)

Owner reviewed a four-direction pitch (Daylight, Porcelain, Slate, Linen) and chose
Daylight: Revision B completed, with vibrant color and the rebuilt header. What changes:

- **Status runs at Monday's full strength.** The AA-darkened status text values are
  retired as muddy. A status is now a bright tint, a vivid dot, and an ink label, one
  treatment everywhere: Done `#00C875`, Working on it `#FF9500` (owner pick 2026-08-25,
  Apple orange over Monday amber), Stuck `#E2445C`, each on its own tint. The label
  never darkens to pass contrast because the label is ink.
- **The red family is vivid.** Dots and marks use `#E2445C`. Text-only red (TBD items,
  errors, live stuck counts, the redline pill) uses `#CE3350`, the darkest red allowed.
  Red never appears as a border or bar on a card.
- **The sheet header is two tiers.** Top row: the dark sheet badge, the title at 24/800
  (the Kulka voice), and the sheet's actions on the right. Below, a hairline meta row
  carries the context and the redline pill. The pill says what it counts ("3 need
  review") and is absent at zero. On record sheets the header title is the record's
  subject (the client's name), not the sheet type.
- **The load strip colors live trouble.** A stuck count of zero stays grey; a live
  count takes the redline text color.
- **The rail is flat.** Pursuits is CRM work, so the Work/CRM split is retired. With
  one module shipped, the rail is four unlabeled items: Home, Pursuits, Clients,
  Briefs. Section headers return when a second module ships and there are genuinely
  two things to separate.

`blackline.css` is the token authority. Where a clause below conflicts with this
section, this section governs.

---

## Revision B

Owner review of 2026-08-24 rejected the Revision A skin as too austere against the
references. The corrected direction: rounded corners, colors aligned with Apple's palette
and Monday.com's, Open Sans used strategically, enterprise finish, no slop. The quality
bar, per the gauntlet method: put a screen beside the Monday.com board and Apple's own
surfaces, compare blind, and keep working until it holds up.

`blackline.css` is the token authority for Revision B. Where a clause below conflicts
with this section, this section governs.

**What survives from Revision A, unchanged:** the information architecture. Sheets, the
three tempos on one skeleton, spoken sheet numbers (W-101, S-204 Rev B), the apparatus
margin, revision letters with delta marks, redlines as the attention object, the load
strip, AI drafts held unaccepted until a person approves them, honest empty states, and
the motion doctrine (respond on down, interruptible, reduced motion first-class).

**What Revision B replaces:**

- **Color.** The one-accent law is retired. The palette is now Monday's workspace values
  on white: canvas `#F6F7FB`, ink `#323338` and `#676879`, primary action blue `#0073EA`
  (Apple's systemBlue is its close cousin), and a real status set in Monday vocabulary:
  Working on it `#FDAB3D`, Stuck `#C63950`, Done `#008552`, Not started neutral. Fills
  are darkened from Monday's only where white text must pass AA. Status renders as solid
  blocks on boards and tinted chips elsewhere. Redlines keep their name and turn
  Monday-red. Groups carry a color identity (a small bar by the title, echoed as a dot
  in the load strip), never a painted row.
- **Shape.** Radius scale 4 / 8 / 12 with pills for chips and avatars. Sheets are
  rounded white cards on the canvas with a soft resting shadow
  (`0 1px 2px rgba(29,29,31,.04), 0 8px 16px rgba(29,29,31,.03)`), so the line-weight
  elevation law is retired.
- **Type.** Open Sans, the client's own brand family, at four working weights: 400
  reads, 600 acts (buttons, labels, chips), 700 heads sections, 800 is the Kulka voice
  and appears only on the wordmark and sheet titles. UI base is 14px. Tabular numerals
  stay mandatory.
- **The title block.** The black band becomes a white toolbar. The Kulka black survives
  as the sheet badge: the number lives in a small dark chip, and the redline count is a
  red tinted pill that is absent at zero.
- **Micro-interactions.** Checkbox checkmarks draw themselves in (a 200ms
  stroke-dashoffset transition). Hover states fill or raise softly. Nothing splashes,
  shines, pulses, or rotates in 3D; those patterns are named slop and stay banned, along
  with purple, decorative gradients, glass, and skeleton shimmer.

The pasted reference components were triaged, not copied: the checkmark draw, the soft
card recipe, and the sidebar hover-fill pattern were kept; the splash particles, the 3D
folder, and the candy gradients were refused.

### Scope note (B.3, 2026-08-24)

Owner decision: the product ships the CRM first. Scopes, contracts, and estimating are
future modules; the language already covers them and nothing here changes when they
arrive. The CRM maps onto the three tempos with no new patterns:

- **Pursuits (P-series)** are the board tempo: rows are pursuits, groups are pipeline
  stages (Qualifying, Proposal out, Award pending), and the load strip reads the
  pipeline the way it read phases.
- **Clients (C-series)** are the record tempo: profile, key contacts, open pursuits,
  activity, and an honest empty section.
- **Briefs (B-series)** are the document tempo: the pre-meeting brief keeps the margin
  numbering, the revision block, the TBD redline, and the AI-drafts-in-pencil flow.
- **Home (H-100)** keeps the redline strip; CRM redlines are things like a follow-up
  past due, a client past the no-contact threshold, or a drafted brief awaiting review.

Series letters, updated: H home, P pursuits, C clients, B briefs. When contracts return
as a module they take the A-series (agreements), because C now belongs to clients.

### Gauntlet laws (B.2, 2026-08-24)

A three-round blind gauntlet was run against Monday.com's own board render (three
independent critics, then two fresh verdict judges; nobody knew which product was ours).
Round one lost, round two lost by "one revision short," round three won: the judge ruled
the board shows "the restraint enterprise buyers associate with finished software." The
laws that came out of it:

- **One pill treatment.** Every status renders as a tinted fill with colored text at a
  fixed 112px width: Stuck red, Working on it amber, Done green, Not started neutral.
  No solid status fills, no outlines, no white-on-color. Hue alone carries state.
- **Color on a board means status, nothing else.** Group markers and load-strip dots
  are product blue; amber, green, and red never mark a group, a phase, or a legend.
- **Red is tiered by severity.** On Home, a red dot means a deadline is blown; an amber
  dot means a decision is waiting. Red is never the default marker for attention items,
  and the redline counter pill stays red.
- **Late dates read bold ink, not red.** The status pill on the same row already
  carries the color; doubling it was the over-signal the owner flagged.
- **Board dates are short** ("Sep 04"). ISO dates stay in formal document metadata:
  issue dates, revision blocks, records.
- **The sheet hugs its content.** A summary strip separated from its rows by dead
  white space reads unfinished; long sheets cap at the viewport and scroll inside.
- **Group headers sit in a faint canvas band** with a product-blue tick, separating
  groups by surface and air rather than by a second color system.
- The Monday status vocabulary (Working on it, Stuck, Done) is kept deliberately: the
  users live in Monday and the familiarity is the point, not an accident.

---

## 1. The name

In construction documents, the blackline set is the clean issued drawing: black ink on
white paper, stamped, ready to build from. The redline set is the markup a reviewer sends
back when something needs a decision. Kulka AI's surface is the blackline set. Anything
that needs a person is a redline. Estimators and PMs say both words every week, so the
language is named in their vocabulary. A PM can say "the app is blackline, my problems
are redlines" and be right about how every screen works.

Two words carry the whole system:

- **Blackline** is the resting state. Black type, white paper, grey lines. It means the
  work is in order.
- **Redline** is the exception. One warm color, drawn small, only where a person must
  act. It means pick up the pen.

---

## 2. Thesis

Open Kulka AI and the room gets quieter. The canvas is white. The chrome is a set of
hairlines. The type is black and does all the talking. The only large dark shape on any
screen is a single black band at the top of the sheet, and it tells you where you are the
way a title block tells you which drawing you are holding. When the work is healthy the
screen holds no color at all, and that absence is information: a colorless screen is a
screen where nothing needs you. When something goes wrong, one red-orange mark appears on
a white field, and because it is the only color in the building, you cannot miss it.

The model is an issued set of drawings, not a website. Line weight does the work of
shadows. The grid does the work of boxes. Type weight does the work of decoration. Status
is a drafted mark the size of a pencil tip, never a painted tile. Density is a feature:
an estimator reads forty rows without scrolling, the way she reads a bid tab.

The language refuses dark themes, decorative color, tinted chips, cards, drop shadows at
rest, mascots, confetti, and any element whose only job is to make the product feel like
software. It refuses emptiness too. A Blackline screen is never bare white space with a
lonely button. Every sheet carries its apparatus: a title block, a numbered margin,
column heads, a load strip. The craft is in the furniture, not the paint.

Interaction is ink. Color is signal. That sentence resolves every ambiguous call in this
file: if you are about to color something a person merely clicks, use ink; if you are
about to color something the work is saying, use the status scale.

---

## 3. Theft ledger

The four systems were studied from their real artifacts: the 1977 NPS Unigrid design
specification sheet, Apple's Human Interface Guidelines, the Ableton Live 12 manual's
Session View chapter, and the Monday.com product and Vibe system. What follows is what
Blackline takes from each and what it turns away.

### Apple Human Interface Guidelines

Stolen:

1. Color scarcity as a law, in Apple's own words: "the power of color to call attention
   to important information is heightened when used sparingly," and "a red triangle that
   warns of a critical problem becomes less effective when red is used elsewhere in an
   app for noncritical reasons." Blackline's one accent exists because of this rule.
2. Content over chrome. Materials recede, the work advances. Blackline's chrome is
   hairlines and one band; everything else on screen is the user's work.
3. The motion doctrine: respond on pointer down, stay interruptible, animate only with
   purpose, honor reduced motion. Section 8 is built on it.

Refused:

1. Translucency and frosted materials. Blackline is paper, and paper is opaque.
2. The system tint. Apple paints interactive elements a theme color; Blackline paints
   them ink, so that the accent keeps its whole voice for state.
3. Platform softness: large bouncing titles, pill shapes, glass toolbars. A drawing set
   has none of these.

### Monday.com Work OS

Stolen:

1. The board is the work, not a report about the work. A row is a job. You edit it where
   it lies, you never leave the board to change a status.
2. Status as a first-class object. A status has an owner, a timestamp, and a history,
   and it is the spine of the row, not a decoration on it.
3. All-day density. Monday earns eight hours of a PM's attention with compact rows,
   inline everything, and no ceremony between the user and the cell.

Refused:

1. The pastel rainbow. Status will never be a colored tile, and no scale in this product
   has more than one hue.
2. Color as personality: tinted groups, colored avatars, decorated columns. In Blackline
   a group is a heavy rule and a label.
3. Play: illustrations, confetti on done, exclamation marks. This is a contract surface.

### NPS Unigrid (Vignelli, 1977)

Stolen:

1. The black band. Unigrid puts a black masthead on every folder; the park name reverses
   out in white and the band makes 400 different brochures one family. Blackline's title
   block is that band, doing wayfinding instead of tourism.
2. Grid as law. Unigrid reckons every dimension from a fixed module with fixed gutters
   ("the vertical spaces between modules are always 1 pica") so layouts stop being
   opinions. Blackline fixes its unit, gutters, and widths the same way.
3. One house typeface in a strict size hierarchy, plus the doctrine written on the spec
   sheet itself: type prints black on white, horizontal bars organize and contain the
   layout, and the enemy is "hodgepodge effects... the death of thought."

Refused:

1. Park costume: arrowheads, scenery photography, ranger brown. Nothing in Kulka AI
   references parks.
2. The cream stock. Unigrid prints on warm beige panels; Blackline stays white, because
   the client's brand is white.
3. The 24-color wardrobe. Unigrid carries two dozen band colors across the park system.
   Kulka AI is one firm and gets one color.

### Ableton Live Session View

Stolen:

1. Columns are tracks of real work and every cell is a live job. Session View's grid is
   neither kanban nor dashboard: a clip either plays, waits, or sits empty, and a
   professional reads the whole set at a glance. Blackline's board has a phase view built
   on this shape.
2. Color on a cell is state, never decoration, and it has a budget. A Session clip's
   color tells you what it is doing right now.
3. The mixer tells you what is loud. Under the clip grid, per-track status shows where
   the sound is. Blackline's load strip does this for work: per-column counts of what is
   active and what is at risk.

Refused:

1. The dark grey skin. Blackline takes the structure and leaves the theater lighting.
2. Music metaphors in copy or iconography. No launch, no play, no tracks in user-facing
   words.
3. Free clip coloring. Ableton lets users paint any clip any color; Blackline users
   cannot paint anything.

### The blend

Print Monday's board on Unigrid's sheet, run it under Apple's color and motion law, and
let Session View teach the board to say what is loud. What comes out is none of the four:
a numbered white sheet whose only voices are ink, line weight, and one red working color.
That fifth thing is Blackline.

---

## 4. Tokens

### 4.1 Color

| Token | Hex | Role |
|---|---|---|
| `--paper` | `#FFFFFF` | Sheets. Every surface that holds work. |
| `--canvas` | `#FAF9F7` | The field behind and around sheets. Also row hover. |
| `--band` | `#101010` | The title block fill. The only large black area allowed. |
| `--ink` | `#1A1917` | Text, solid marks, primary buttons, heavy rules. |
| `--ink-2` | `#5B5955` | Secondary text: metadata, timestamps, column heads. |
| `--ink-3` | `#8F8B85` | Placeholders and disabled text. Never body copy. |
| `--rule` | `#D8D5D1` | Emphasized rules: table frame, input borders. |
| `--hairline` | `#E9E7E4` | Default rules: row separators, rail edge. |
| `--selected` | `#F3F1EE` | Selected row fill, paired with a 2px ink bar. |
| `--redline` | `#C2401A` | The one accent. State only. 5.2:1 on white. |
| `--redline-deep` | `#A33413` | Redline text at small sizes, hover on redline controls. |

Laws:

- Black fills exist in two places: the title block and the primary button. Nothing else
  may fill with black or near-black.
- Grey is a line, not a paint. The two exceptions are `--canvas` (the field and hover)
  and `--selected` (selected rows). No other element takes a grey fill: not table
  headers, not inputs, not tags, not wells.
- Redline is an ink, never a paint. It draws marks, words, bars, and borders. It never
  fills an area larger than a 10px status mark.
- No other hue may enter the product. There is no success green, no info blue, no
  warning yellow. Done is ink. Information is text. Warning is redline.
- Never signal with color alone. Every redline pairs the color with a mark shape and a
  word, so the meaning survives printing in greyscale.

Contrast, checked: `--ink` on `--paper` is 16.7:1. `--ink-2` on paper is 7.4:1.
`--redline` on paper is 5.2:1, which passes AA for the 12px and up sizes it is used at.
White on `--band` is 19.5:1. `--ink-3` is reserved for non-essential text and is not
counted on for reading.

### 4.2 Type

One family: **Public Sans**, weights 400, 500, 600, with `"Helvetica Neue", Arial,
sans-serif` as the fallback stack. The reasons it wins:

- It descends from Franklin Gothic through Libre Franklin, the American gothic of
  newsprint and engineering, so it carries a dry civic tone rather than a startup one.
  It is not Inter and does not read as the SaaS default.
- It was built by the U.S. Web Design System for dense, unglamorous information work,
  which is this product's job description.
- It ships true tabular figures, a full variable weight range, and an open license, so
  the same face appears on screen and on the scope PDFs that go out to subcontractors
  with no license friction.

Unigrid ran one typeface at every scale from 6 point captions to 60 point mastheads, and
Blackline does the same. No second family, no display face, no mono numerals as
decoration. The client's Open Sans ExtraBold survives in one place only: inside the Kulka
logo lockup, as brand artwork, never as UI type.

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `label` | 11 / 16 | 500 | Column heads, field labels, nav sections. Uppercase, letter-spacing 0.06em, `--ink-2`. |
| `meta` | 12 / 16 | 400 | Timestamps, counts, captions, helper text. |
| `ui` | 13 / 20 | 400 | The default: table cells, controls, nav items, band text. |
| `value` | 14 / 20 | 400 | Record field values, form input text. |
| `body` | 15 / 24 | 400 | Document text: scopes, contracts, long reading. |
| `title-3` | 16 / 22 | 600 | Section heads inside sheets. |
| `title-2` | 20 / 26 | 600 | Document titles on the sheet itself. |
| `title-1` | 26 / 32 | 600 | Home greeting and login. Nowhere else. |

Laws:

- Weights are 400, 500, and 600. Nothing bolder appears in the UI.
- Every numeral in a table, band, count, or margin sets `font-variant-numeric:
  tabular-nums`. Columns of numbers align to the digit or the table is broken.
- Emphasis inside running text is weight 500, never italic, never color.
- Type is `--ink` on `--paper` unless a rule in this file says otherwise. White type
  exists only on the band. Redline type exists only on redlines.

### 4.3 Space

The unit is 4px. The scale is 4, 8, 12, 16, 24, 32, 48, 64. No value off the scale.

| Measure | Value |
|---|---|
| Sheet padding | 32px |
| Apparatus margin (inside every sheet, left) | 48px |
| Grid gutter | 24px |
| Table row height | 36px (compact: 30px) |
| Control height | 32px (primary form actions: 36px) |
| Cell horizontal padding | 12px |
| Band height | 44px |
| Load strip height | 32px |

### 4.4 Radius

One radius token: `--radius: 2px`, applied to buttons, inputs, popovers, and dialogs. A
sawn edge, not a pebble. Sheets, bands, table cells, marks, and bars are square. Nothing
in the product exceeds 2px except the two shapes that are circles by convention: radio
dots and user presence dots.

### 4.5 Elevation

Depth is line weight, the way a drawing separates a wall from a dimension string:

| Level | Treatment |
|---|---|
| Hairline | 1px `--hairline`. Row separators, rail edge, quiet structure. |
| Rule | 1px `--rule`. Table frames, input borders, sheet edges. |
| Heavy | 2px `--ink`. Group separators, section bars, active nav mark, focus. |
| Band | 44px `--band` fill. The title block only. |

Nothing at rest casts a shadow. Two floating layers get one shadow each, and both must
also carry a 1px `--rule` border:

- Popover: `0 2px 8px rgba(16, 16, 16, 0.08)`
- Dialog: `0 8px 24px rgba(16, 16, 16, 0.12)` over a scrim of `rgba(16, 16, 16, 0.32)`

### 4.6 Z-scale

| Layer | z |
|---|---|
| Sheet and field | 0 |
| Sticky title block and load strip | 10 |
| Popovers and menus | 20 |
| Dialogs and scrim | 30 |
| Confirmations | 40 |

---

## 5. Layout law

### 5.1 The frame

The app is a rail and a field. The rail is 216px, sits on `--canvas`, and is separated
from the field by one hairline. It holds the logo lockup, search, the nav, and the user,
top to bottom, and it can collapse to 56px with the same anatomy. The field is `--canvas`
and holds sheets.

There is no global header. The band belongs to the work, not the app, so each sheet
brings its own title block and the app chrome stays out of the way.

### 5.2 The sheet

Every working surface is a sheet: `--paper`, edged by a 1px `--rule`, resting on the
canvas. Boards, documents, and records are all sheets, and all three share one skeleton:

```
+-- title block (44px, black) --------------------------------+
| N-000  Sheet name                     context  ·  redlines  |
+--------------------------------------------------------------+
| 48px |                                                       |
| marg |   the field: board rows, document text, or record     |
| in   |   fields, reckoned on a 12-column grid, 24px gutters  |
|      |                                                       |
+-- load strip (boards only, 32px) ----------------------------+
```

- **Apparatus margin.** The first 48px of every sheet is a margin column that holds the
  machinery of reading: status marks, row numbers, clause numbers, revision deltas,
  redline flags. The field to its right holds only the work itself. Nothing in the
  margin is decorative and nothing in the field is machinery.
- **Widths.** Boards run fluid to the field's width. Document text sets a 720px measure.
  Records set a 960px field. The grid under all three is 12 columns with 24px gutters,
  and components snap to it.
- **One skeleton, three tempos.** A board is the skeleton at row height 36. A document
  is the skeleton at 15/24 reading text. A record is the skeleton as a field grid. A
  user who learns one sheet has learned them all, which is the consistency the client
  is buying.

### 5.3 Sheet numbers

Every sheet carries a number in its title block, assigned by the system and stable for
life: W-series for work boards, S-series for scopes, C-series for contracts, H-100 for
home. The number is set in tabular figures, is searchable, and is meant to be spoken in
meetings the way drawing numbers are: "open S-204" is a complete instruction. Documents
add a revision letter and issue date after the number, because a scope without a rev
letter is a liability this industry already knows how to avoid.

### 5.4 Login

Login is the cover, not a sheet, so it is the one screen without a band: a white page, a
centered 320px column, the wordmark, two fields, one ink button. No photograph, no
tagline, no testimonial, no illustration. The door to the building is a door.

---

## 6. The signature move: the title block

Every drawing ever issued has a title block, and every sheet in Kulka AI has one: a 44px
black band across the top of the sheet, the only large black shape in the product.

```
+---------------------------------------------------------------+
|  S-204  Scope of Work      Riverside Fit-Out (example)        |
|                            Rev B · Issued 2026-08-24 · ▪ 3    |
+---------------------------------------------------------------+
```

Anatomy, left to right, all in white 13/500 on `--band`:

- Sheet number, tabular, then the sheet name.
- On the right, the context cell: parent project or client, then revision letter and
  issue date on documents, then the redline count. The count renders as a 10px redline
  square beside a white numeral, and it is the only place the accent touches the band.
  When the count is zero, the square and numeral are absent, so a quiet band means a
  quiet sheet.

Behavior:

- The band sticks. Scroll a 300-row board or a 40-page scope and the title block stays,
  so the user is never holding an unlabeled drawing.
- Clicking the redline count opens the sheet's redlines.
- On document sheets the band is also the record of issue: rev letter and date live
  there and nowhere else.

This is the one move. It spends the design's whole allowance of visual force in a single
40-some-pixel stripe, and it is why every other element in the product is entitled to be
quiet. Nothing else may reverse type out of a dark fill, nothing else may run edge to
edge in black, and no second signature may be added without deleting this one.

---

## 7. Component principles

### 7.1 Buttons

- **Primary**: `--ink` fill, white 13/500 text, 2px radius, 32px tall. It reads as a
  stamp. One primary per view region.
- **Secondary**: white fill, 1px `--rule` border, ink text. Hover darkens the border to
  `--ink`.
- **Quiet**: ink text, no border, underline on hover. For third-rank actions inside
  rows.
- **Redline rule**: the accent appears on a control only when the control is the risky
  thing or resolves one. Destructive confirms and "Resolve" actions set their text in
  `--redline-deep`. The accent never appears on an ordinary button to make it prettier.
- Pressed state responds on pointer down (see Section 8). Disabled is `--ink-3` text on
  a hairline border, no fill change, no opacity fog over whole regions.

### 7.2 Inputs

White fill, 1px `--rule` border, 2px radius, 32px tall, 14px text, 12px side padding.
Labels are `label` type above the field. Focus replaces the border with 2px `--ink` and
adds no glow. Errors are redlines: the border turns `--redline`, and one 12px
`--redline-deep` sentence appears under the field saying what to fix. Placeholders are
`--ink-3` and never carry required information.

### 7.3 The board

The work list is a drafted table, not a card farm and not a Monday clone:

- Rows are 36px, text is 13/20, numerals tabular. Rows separate with hairlines; the
  table frames with `--rule`. Column heads are `label` type on paper, no fill.
- The apparatus margin carries each row's status mark and row number. The field carries
  the row's data. First column sticks under horizontal scroll.
- Groups are a 2px ink rule and an uppercase label, never a colored bar.
- Editing happens in place. Click a cell, change it, leave. Status changes from the
  mark itself.
- Hover is `--canvas`. Selection is `--selected` plus a 2px ink bar in the margin.
- Owners render as initials in a hollow 20px square, ink on white. No avatar colors,
  no photos at table density.
- **The load strip.** A 32px strip sticks to the sheet's bottom edge and reads the
  board the way a mixer reads a set: per-group or per-phase counts, such as
  `ESTIMATING · 14 active · ▪ 2 at risk` (example). The at-risk figure takes a redline
  square; everything else is ink. Empty groups say 0. The strip is how a PM hears which
  column is loud without reading every row.
- **Phase view.** One toggle pivots the board so columns are phases or trades and each
  cell is a job's presence in that phase, marked with the same status marks. It is the
  Session View steal: a grid you scan, not a kanban you drag cards around. Same sheet,
  same band, same strip.

### 7.4 Status: pencil to ink

Work in this product moves from pencil to ink, and the status scale draws it that way.
One ordered scale, four states, one hue:

| State | Mark (10px square, 1.5px stroke) | Color |
|---|---|---|
| Open | Hollow | `--rule` stroke |
| In progress | Half-filled | `--ink` |
| At risk | Solid | `--redline` |
| Done | Solid | `--ink` |

The mark sits in the margin, 10px, beside the status word at `ui` size. A healthy board
is grey and black. A board in trouble grows red squares, and if every job is at risk the
whole margin turns red, which is the truth and should look like it.

Status is an object, not a paint: it carries who set it, when, and its history, shown on
hover and in the record. There is no fifth state and no custom status colors, ever. If a
team needs a finer distinction, it goes in a text column where words can hold it.

### 7.5 Navigation

Rail items are 13/400 ink, one per line, with counts right-aligned in tabular figures.
The active item is weight 600 with a 2px ink bar in the rail's left margin. No fills, no
pills, no icons doing the work of words: every item is labeled even when an icon sits
beside it. Sections head with `label` type. The rail never scrolls the product's IA out
of sight; if the nav needs scrolling, the nav is too big and the IA is wrong.

### 7.6 Documents

The scope is the actual job, so the document sheet is the flagship:

- 720px measure, `body` 15/24 text, generous 24px paragraph spacing, section heads in
  `title-3`. The document's own title sets in `title-2` under the band.
- The margin carries the apparatus: CSI division numbers, clause numbers in tabular
  figures, and redline flags on clauses that need a decision. The text column carries
  only scope language.
- **Revisions the industry's way.** Issuing freezes the document and advances the rev
  letter in the band. Clauses changed since the last rev take a small hollow triangle
  in the margin bearing the rev letter, the delta mark every superintendent already
  reads, and a revision block at the document's end lists what changed and when.
- **AI drafts in pencil.** When the assistant writes or rewrites a section, the new
  text enters at full ink for readability, but its margin marks are hollow and the
  section is labeled Draft. A person accepts it and the marks fill solid: the machine
  writes in pencil, a human inks it. Unaccepted drafts cannot be issued.
- TBD items are redlines: the placeholder text sets in `--redline-deep` and registers
  in the sheet's redline count, so an unfinished scope announces itself in the band.

### 7.7 Records

A contract record is a C-series sheet: a field grid at 960px, labels in `label` type,
values at 14/20 ink, rows separated by hairlines. Sections (parties, terms, documents,
activity) divide with 2px ink rules. Attached documents list as rows with name, type,
and date, never as thumbnail tiles. Money and dates align right in tabular figures. The
record answers "what is true about this contract" in one still page, with no tabs
hiding half the truth.

### 7.8 Attention: redlines

A redline is one sentence about one thing that needs one person, plus the action that
clears it.

- Anatomy of a redline row: a 10px redline square, the sentence in ink (the key datum
  may set in `--redline-deep`), the source sheet number, and one action. Example:
  `▪  Division 9 has 3 TBD items in S-204 Rev B.   Resolve` (example).
- **The strip.** Home leads with the redline strip: every redline addressed to you,
  newest first, each row one line. Individual sheets surface their own redlines through
  the band count.
- When there are none, the strip collapses to a single hairline and one sentence:
  "Nothing needs you." That sentence is the product working, not the product empty.
- Redlines are never modal, never toasted, never animated in. They wait in the strip
  like markups in a folder, because urgent and hysterical are different things.

### 7.9 Empty states

An empty sheet keeps its furniture: band, margin, column heads, load strip at zero. Then
one plain sentence and one action, such as "No scopes yet. Start one from a contract or
write one new." (example). No illustrations, no mascots, no grey fake rows pretending to
be data, no exclamation marks. Zero is a number this industry respects; show it.

### 7.10 Confirmations and progress

Quiet confirmations appear bottom-left: one sentence, ink on white, hairline border,
gone in four seconds, no icon parade. Progress is words plus a rule: a 2px ink bar and
a sentence naming the real step, such as "Writing Division 9 of 14" (example). If the
duration is unknown, say what is happening. There are no skeleton screens and no
shimmer anywhere in the product: a skeleton screen is fake data, and this product does
not fake data.

---

## 8. Motion

Motion is behavior, never decoration. The rules are Apple's, kept whole:

1. **Respond on down.** Controls change state on pointer down, within one frame. The
   click is the feedback; nothing waits for an animation to say it happened.
2. **Interruptible, always.** Any transition yields instantly to the next input. No
   animation ever locks the user out, and nothing plays to completion for its own sake.
3. **Purpose or nothing.** Motion may show where a thing came from, where it went, or
   what changed. If a transition cannot name its purpose in one sentence, it is cut and
   the change is immediate.
4. **Tables do not perform.** Rows never animate in, reorder with easing, or bounce.
   Reading surfaces hold still while people read.
5. **Reduced motion is first-class.** With `prefers-reduced-motion`, everything becomes
   an opacity change or an instant swap, with no loss of information.

Tokens: `--motion-fast: 120ms` for hover and press, `--motion-base: 160ms` for menus and
popovers, `--motion-slow: 200ms` for dialogs and sheet transitions. Nothing exceeds
240ms. One easing curve for everything: `cubic-bezier(0.2, 0, 0, 1)`. Properties animate
opacity and transform only. There are no keyframe loops except the progress rule while
real work runs, and it stops the moment the work does.

---

## 9. The kill list

Anything on this list found in a build is a defect, not a preference.

**Patterns:**

- Pastel Monday: tinted status chips, colored groups, candy columns, avatar rainbows.
- The BLDG dark cockpit: charcoal fields, a swappable neon accent, mono number-hero
  cards, layered glow. Kulka AI is that system's photographic negative and must never
  drift toward it.
- Generic Inter SaaS and the Linear-Stripe-Figma cousins: gradient buttons, 12px-radius
  pill everything, glassy toolbars, purple.
- Bold color blocks, gradient heroes, brand murals inside the app.
- Glassmorphism, blur, translucency of any kind.
- Skeleton screens and shimmer placeholders. They are fake data.
- Illustration empty states, mascots, emoji in UI copy, celebration animations.
- Rainbow status, custom status colors, or any second hue beside `--redline`.
- Cards for tabular work. If it has columns, it is a table on a sheet.
- Drop shadows at rest, rounded corners past 2px, dark mode (light only, by contract
  with the brand).
- Em dashes and en dashes in any user-facing copy. Hyphens or rewrites.
- Fabricated metrics, dollar figures, or client names in any demo, fixture, or empty
  state.

**What dies in the current repo (read from Kulka Vision as of this issue):**

- The dark theme in `src/index.css`: the `#202020` background, `#00d4ff` primary, dark
  card and popover tokens, and the dark scrollbar styling. All of it.
- The TT Octosquares and TT Commons Pro font faces and their files. They are BLDG brand
  property and have no place here.
- The `--kv-*` token set: the bone-grey `#EEF0EF` canvas, the greenish greys, the 12px
  radius. Blackline's tokens in Section 4 replace them completely.
- Open Sans as a UI face. 'Kulka Open Sans' ExtraBold survives only inside the logo
  lockup asset.
- All nine `design-mockups` directions (Atelier through Obsidian) and the background
  studies. They were the search; this file is the result.
- Every shadcn default that carries rounded-xl corners, resting shadows, or tinted
  variants. Components rebuild on Blackline tokens or do not ship.

---

## 10. Pressure test

Scored as pass strength: 5 means the risk is dead, 0 means the failure is certain. The
issue rule is that nothing below 4 ships, and every score carries its evidence.

| Question | Score | Evidence |
|---|---|---|
| Would Rob say "finally"? | 5 | The product is white paper, black type, and one band, which is the brand deck he already shows, finished to drawing-set standards. |
| Would Rob say "this is just empty"? | 4 | Even a zero-data sheet carries a title block, a numbered margin, column heads, and a load strip, so the thinnest screen still reads drafted rather than vacant. |
| Would he say "this is Monday with the pastels gone"? | 4 | The shared idea, rows you edit in place, is the part he asked to keep; sheet numbers, the apparatus margin, pencil-to-ink status, the load strip, and the title block have no Monday equivalent. |
| Would a designer with taste call it ambitious without calling it loud? | 4 | The ambition sits in apparatus and measure (the band, line-weight elevation, a real margin, one type family at every scale) where craft is visible at reading distance and no element raises its voice. |
| Would an estimator live in it eight hours without hunting for the work? | 5 | Rows are 36px at 13px tabular type, matching the density she already keeps in Monday and Excel, the band and load strip say where the trouble is, and nothing moves or glows while she reads. |
| Is it unmistakably not BLDG? | 5 | White field against charcoal, one fixed red-orange against a swappable neon, Public Sans against the TT pair, hairlines against layered glow: every axis is opposed. |

The two scores of 4 were bought by revision during drafting: the apparatus margin and
load strip were added after an earlier pass read too bare, and the phase view plus sheet
numbering were added after an earlier board read too close to a stripped Monday. They
stand at 4 because only shipped screens can prove a 5.

---

Revision B. Later changes to this language revise this file and advance the letter.
Revision A stands below as the record of where the language started; the Revision B
section at the top governs wherever the two disagree.
