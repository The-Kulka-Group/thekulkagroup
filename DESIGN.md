# Daylight

The Kulka AI design language. Issued 2026-08-25.

Daylight supersedes Blackline (Revisions A through C). The Blackline document is archived
at [DESIGN-blackline-archive.md](DESIGN-blackline-archive.md) and no longer governs
anything. The drawing-set doctrine, the theft ledger, the kill list, and the pressure
tests retire with it. This document keeps only what the owner has approved, and it is
deliberately short: `daylight.css` is the token authority, and where this file is silent,
use judgment and match the shipped screens.

## Owner decisions on record

- 2026-08-24: rounded corners, colors aligned with Apple and Monday.com, Open Sans used
  strategically, enterprise finish, no slop.
- 2026-08-25: Daylight chosen from a four-direction pitch, over Porcelain, Slate, and
  Linen. Vibrant status color; a chip is a bright tint with a vivid dot and an ink label.
- 2026-08-25: Working on it is Apple orange `#FF9500`; Stuck stays Monday red `#E2445C`.
- 2026-08-25: the rail is flat while the CRM is the only module.
- 2026-08-25: components come from libraries per [sourcing.html](sourcing.html); library
  defaults are acceptable and get tuned to Daylight where it is cheap. There is no
  mandatory reskin gate.
- 2026-08-25: the Blackline doctrine is retired; this document replaces it.
- 2026-08-25: final element picks from the chooser. Buttons stay rounded 8 (a
  same-day pill trial was reverted). Board rows are 40px. Inputs are 36px tall with
  a 10px radius and a light border. The active rail item fills Kulka black with
  white text. Attention rows are tinted washes of their severity color instead of
  cards. Status treatment and the two-tier header stay as shipped.
- 2026-08-25: avatars are solid vivid circles, one bright color per person, stable
  for life, assigned by hashing the user id. Hues rotated in the craft pass so the
  people spectrum never overlaps the status or action hues, and no red-family hue
  may identify a person: `#2E5BFF` royal, `#7C4DFF` violet (purple allowed here by
  owner note, 2026-08-25), `#FFCB00` gold (ink initials), `#00C7BE` teal,
  `#00A8E8` sky, `#1F3A8F` navy.
- 2026-08-25 (craft pass, toward the 93 review bar): sheet titles at 26/800 with
  -0.02em tracking; record sections take real 15/700 headings and caps labels go
  back to labeling; date and number columns set right; board columns take fixed
  widths with the pursuit name at 600 and Source demoted to meta gray; the load
  strip aligns to the table grid; the wordmark is a lockup (Kulka in ink, AI in a
  blue chip); Home gains This week and Pipeline blocks; the login cover exists
  (`shell-login.html`); interaction states are documented on E-100.
- 2026-08-25 (gauntlet, three blind judges vs Monday and Attio): typography and
  finish 82 against Monday 86 and Attio 90, verdict HOLDS. Color and hierarchy 80,
  beating Monday's 74 and trailing Attio's 88. Overall buyer verdict 82 on a scale
  where Monday sits near 85 and Attio near 88: "real shipped software from a small,
  serious company." Fixes taken from the rounds: urgency encoded once (bold late
  dates retired), severity carries mass on Home (red tinted, amber on white), no
  red-family hue identifies a person (magenta out, violet in), the load strip uses
  one chip treatment for every count, Discard reads destructive, and the login
  reset link uses the standard wording. Deliberate rules the judges flagged but the
  owner keeps: example data labeled in fixtures, the 800-weight Kulka voice on
  titles, words-first navigation without icons, and Home's "need you" phrasing.
- 2026-08-26 (gauntlet round two, three blind judges): typography and finish 72,
  color and hierarchy 84 (beating Monday's 62, trailing Attio's 90), overall buyer
  verdict 82 with "yes, a design-literate buyer would believe this is shipped
  software from a serious company." The judges measured computed styles rather than
  eyeballing, so this round's faults were all real and all fixed:
  - Type: one seven-step scale replaced thirteen ad-hoc sizes including half-pixel
    steps; tracking and line-height are now bound to each step; the sheet title got
    its own step so a page title can never match the headline inside it.
  - Contrast: the alarm chip (3.99:1), the urgent row's action (4.15:1), and the
    teal and sky avatars (2.12:1) all failed AA and now clear it. Tertiary ink was
    darkened from `#9699A6` (2.84:1) to `#6F7382`, so every ink in the ramp passes.
  - Grid: one sheet inset for band, body, table, and strip, so right edges align
    exactly; record sections share one leading column width; the board uses fixed
    layout so long names truncate instead of overflowing the card; `border-collapse`
    changed to `separate` because the group header's white border was merging into
    the row above and shifting its checkbox.
  - Hierarchy: a stuck row escalates at row level the way Home's urgent rows do, so
    the board's problems outrank its toolbar; a flagged record field now gives the
    header's "needs review" count a visible destination.
  - Reading: document prose caps at 62ch; the login heading joined the scale.
- 2026-08-26 (narrow widths): the frame assumed a desktop and clipped at every
  level, so at 375px the rail took 232px, the sheet was left 109px, its title
  collapsed to zero width, and the brief's prose ran one word per line. Below
  860px the rail now lies down as a scrolling top bar, the page scrolls
  vertically, the record and clause grids collapse to one column with clause
  numbers moving above their clause, attention rows put the sentence on its own
  full-width line, and the board keeps its column widths and scrolls sideways
  inside the sheet body. Desktop is unchanged. Checked on all five routes.

- 2026-08-25 (critic round one): record values left-align after their labels; the
  sheet header carries a soft standing shadow so rows read as passing under it;
  documents use one attention language, so a TBD is an amber callout row with a
  Resolve action instead of red running text, and the draft pill sits on its
  section heading instead of floating above it.

## Palette

| Token | Hex | Role |
|---|---|---|
| canvas | `#F6F7FB` | The field behind sheets; row hover |
| canvas-deep | `#ECEEF4` | Hover on canvas surfaces |
| surface | `#FFFFFF` | Sheets and cards |
| border | `#D0D4E4` | Input and table frames |
| border-light | `#E6E9EF` | Row separators, card edges |
| ink | `#323338` | Text |
| ink-2 | `#676879` | Secondary text |
| ink-3 | `#9699A6` | Placeholders, row numbers |
| brand | `#1D1D1F` | Wordmark, sheet badges, sheet titles |
| primary | `#0073EA` | Actions, links, active nav (hover `#0060B9`, tint `#EAF3FE`) |

Status, one treatment everywhere:

| State | Dot | Tint | Text-safe |
|---|---|---|---|
| Done | `#00C875` | `#D5F6E5` | `#00854D` |
| Working on it | `#FF9500` | `#FFE8CC` | |
| Stuck | `#E2445C` | `#FFDEE3` | `#CE3350` |
| Not started | ink-3 | `#EDEEF2` | |

A status renders as a 112px pill: bright tint, a 14px state glyph, label in ink.
Labels are never darkened to pass contrast; the text-safe column is for the glyph
and for text-only uses
(errors, TBD text, live stuck counts, the counter pill). Urgency is encoded once, in
the status pill: late dates set like every other date (gauntlet round two,
2026-08-25, retiring the bold-late-date rule as a second emphasis system). Red means
a deadline is blown; amber means a decision is waiting, and only red items take a
tinted band on Home while amber items sit on white with a hairline, so fill itself
carries severity.

## Type

Open Sans at four weights: 400 reads, 600 acts, 700 heads sections, 800 is the Kulka
voice and appears on the wordmark and sheet titles. UI base is 14px; sheet titles are
24/800. Numerals in tables, counts, and badges set tabular.

## Shape and elevation

Radius scale 4 / 8 / 12, pills for chips and badges, buttons at 8, inputs at 10.
Sheets are white cards on the canvas with the soft resting shadow in
`daylight.css`. Motion stays quick and interruptible (150/200/250ms tokens) and
respects reduced motion.

## The sheet and its header

Every working surface is a sheet: a white card holding a board, a document, or a
record. The header is two tiers. The top row carries the dark sheet badge, the title
at 24/800, and the sheet's actions on the right. Below it, a hairline meta row carries
the context and the counter pill. The pill says what it counts ("3 need review") and
is absent at zero. On record sheets the title is the record's subject, such as the
client's name, not the sheet type.

## Sheet numbers

Sheets keep short spoken addresses: H-100 Home, P-101 Pursuits, C-042 a client, B-217
a brief. "Open P-101" is a complete instruction, and search treats these as
first-class. This is user vocabulary, and it is the only place trade convention shows:
the visuals never dress up as drawings, blueprints, or job sites.

## Navigation

The rail is flat: Home, Pursuits, Clients, Briefs. Section headers return when a
second module ships and there are genuinely two things to separate.

Icons (owner picks 2026-08-25): Phosphor regular. They live in two places, the rail
and state marks, and nowhere else. An icon always sits beside its word, never
instead of it; header actions, table rows, and body content stay words.

- Rail, 16px: house, target, users, file-text (squares-four on the E-100 sheet).
- State marks, replacing the colored dot everywhere it carried state or severity:
  circle-half for Working on it, warning-diamond for Stuck, check for Done,
  circle-dashed for Not started, clock for a decision that is waiting,
  pencil-simple for an unaccepted draft. Chips run 14px, attention rows 17px,
  counter and flag pills 13px.

Because the glyph differs per state, status now survives greyscale printing and
color blindness: the shape says which state before the color does.

## Attention

Home leads with what needs the user: plain sentences, newest first, one action each,
with a red warning diamond for a blown deadline and an amber clock for a waiting
decision. Each row
sits on a faint wash of its severity color rather than in a card. When nothing needs
them, the screen says so plainly. Attention items are never modal and never toasted.

## Banned

Only what the owner has actually ruled out:

- Slop: splash and particle effects, shine sweeps, glow, 3D card tricks, and
  gradients as decoration. Purple is not banned as a color; what is banned is the
  default AI-startup purple reached for without a reason. Used deliberately (owner
  note 2026-08-25: "if used well I actually like purple") it is welcome, and the
  avatar palette uses it.
- Muddy status colors: any darkened label doing contrast work a dot and ink text
  should do.
- Red borders or bars as card decoration.
- Construction costume in the visuals; the vocabulary lives in the words only.
- Fabricated dollar figures or real client names in demos and fixtures; example data
  is labeled (example).

## Code note

The shells and `daylight.css` still carry legacy identifiers from the Blackline era
(`--redline`, `.redline-row`, `.band-redlines`). They are internal names only, nothing
user-facing, and they get modern names when the real app is scaffolded rather than
churning the throwaway mockups now.
