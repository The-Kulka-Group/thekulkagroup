# Daylight shell

Reference implementation of [DESIGN.md](DESIGN.md) (Daylight, issued 2026-08-25):
enterprise light, Apple and Monday palettes, Open Sans, rounded sheets on a soft
shadow, vibrant status color. Framework-neutral on purpose: one stylesheet and
static sheets, so the language can be checked by eye before anyone commits to a
component library. The component picks for the real app live in
[sourcing.html](sourcing.html).

Current state (2026-08-25): the Daylight direction as approved. Status renders
as bright tints with vivid dots and ink labels (Working `#FF9500`, Stuck
`#E2445C`), the sheet header is two tiers with a 24/800 title and actions, the
counter pill says what it counts, and the rail is flat. The Blackline doctrine
this shell was first built under is retired; its document is archived at
DESIGN-blackline-archive.md, and the gauntlet record at the end of this file
stays as history.

## Files

The product ships the CRM first. The live demo is the four CRM sheets; the two
future-module pages stay on disk as tempo references but are off the nav.

| File | What it is |
|---|---|
| `daylight.css` | The whole system. Tokens in `:root`, then primitives. |
| `shell-home.html` | H-100. Attention items with one action each, and an honest empty state. |
| `shell.html` | P-101 Pursuits. Board tempo: pipeline stages as groups, source column, load strip. |
| `shell-client.html` | C-042 Client. Record tempo: header titled by the client, profile, contacts, open pursuits, activity. |
| `shell-brief.html` | B-217 Meeting Brief. Document tempo: margin numbering, TBD text, AI draft held until accepted, revision block. |
| `shell-scope.html` | Future module reference (scope document tempo). Off nav; its own nav is stale. |
| `shell-contract.html` | Future module reference (contract record tempo). Off nav; its own nav is stale. |

## Running it

Check whether something is already serving the folder before starting anything:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8123/shell-home.html
```

A `200` means it is already up, so just open
`http://localhost:8123/shell-home.html`. Anything else means nothing is running,
and you can start one from this directory:

```bash
python3 -m http.server 8123
```

If that reports `Address already in use`, port 8123 is taken by something else.
Either use another port and adjust the URL to match:

```bash
python3 -m http.server 8200
```

Or find what is holding it and decide whether to stop that process yourself:

```bash
lsof -nP -iTCP:8123 -sTCP:LISTEN
```

The pages need a server rather than `file://` because they share one stylesheet,
which a `file://` page will not load. Open Sans comes from Google Fonts and falls
back to Helvetica Neue and Arial.

## Porting into the app

Map the `:root` block to whatever theme layer the app ends up with and keep the
primitives as component classes. The three tempos are the same skeleton, so a
component written against `.sheet` works in all of them:

```
.sheet  ->  .band (two tiers: badge + 24/800 title + actions, then a
                   hairline meta row with context and the counter pill)
        ->  .sheet-body (scrolls; --board runs edge to edge)
        ->  .strip (boards only)
```

Two structural rules a port must not lose:

- The margin column is 56px on every sheet. It holds the row checkbox and
  number on boards, and clause numbers plus rev deltas on documents.
- Color on a board means status and nothing else. The dark sheet badge and the
  wordmark are the only places Kulka black fills.

Some class and token names (`--redline`, `.redline-row`, `.band-redlines`) are
legacy Blackline identifiers; give them modern names in the port rather than
churning these mockups.

## What was measured, not assumed (Revision A history)

Checked in the browser at 1440x900, against the Revision A skin:

- Band 44px, `#101010`, on all four sheets. Sheet fill pure white.
- Apparatus margin exactly 48px everywhere, including a synthetic three-digit
  row number, which is why the board's margin runs 4px padding instead of 8.
- Document measure exactly 720px at 15/24, with every margin element landing on
  one edge.
- Redline covers 0.4% of the board sheet against the 5% budget, with three
  at-risk rows showing. The band is 5.06% of the sheet.
- Zero resting shadows. Button radius 2px, nothing larger.
- No off-palette color renders. The only stray value found was the browser's
  default border color on zero-width table borders, which never paints.
- No horizontal page scroll at 1440, 1180, or 900.

## Two places the spec needed a decision

Both are flagged rather than quietly resolved, because they change DESIGN.md.

1. **The rail does not collapse on a breakpoint.** DESIGN.md 5.1 allows a 56px
   rail, but 7.5 requires every nav item to carry its word, and words do not fit
   in 56px. Collapsing on width produced an unlabeled icon rail the language
   forbids, so the rail holds 216px at every width and the sheet takes the
   compression. `--rail-w-collapsed` is defined but deliberately unused. If the
   rail is to collapse, it should collapse because a user asked, and that
   control has to solve the labeling problem first.

2. **Narrow widths degrade, they do not reflow.** Below 1180px the record drops
   to one field column; below 960px its rows stack and sheet padding drops to
   16px. The board scrolls horizontally inside its own sheet rather than
   reflowing, which is correct for a dense table. Nothing pretends to be a phone
   layout.

## Not built yet

Login (DESIGN.md 5.4) has its `.login` primitives but no page. The phase view
(7.3), popovers, and dialogs have their CSS but no working example. Motion
tokens are defined and the reduced-motion block is in place, but no transition
beyond hover and press is wired up.

## Gauntlet record (2026-08-24)

Method from the gauntlet-loop pattern: blind builder-critic rounds against a
concrete bar, Monday.com's own homepage board render, until ours wins the
comparison. Critics and judges were separate fresh agents that read both
screenshots as images and were never told which product was ours.

| Round | Panel | Verdict | What changed after |
|---|---|---|---|
| 1 | 3 critics (finish, color, typography) | Monday | Done and Working pills detuned to tints, fixed 112px pill width, group rail experiment, blue group ticks, severity-tiered Home dots, 22px title, uppercase column heads, 44px rows, grey rail, short dates, card hugs footer |
| 2 | fresh blind judge | Monday, "one revision short" | Clipped search placeholder fixed, one tinted treatment for all four pill states, group color ramp removed (color now means status only) |
| 3 | fresh blind judge | **Kulka** | Group headers moved into a faint canvas band (the judge's one real remaining note; its other note misread the already-fixed pill widths) |

The round-3 ruling: the board shows "the restraint enterprise buyers associate
with finished software... designed for hours of reading rather than a
screenshot." The laws extracted from the run are recorded in
DESIGN-blackline-archive.md under "Gauntlet laws (B.2)"; the ones the owner
kept now live in DESIGN.md. Artifacts (all screenshots and the bar image) are
in the session scratchpad under gauntlet/.
