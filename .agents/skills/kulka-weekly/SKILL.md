---
name: kulka-weekly
description: Build the weekly Kulka report from the locked template. Use when Matt asks for the Kulka weekly, the client report, or the Friday report. Gathers the week's facts from git and Linear, fills template.html, verifies every number, renders at phone and desktop width, and publishes a new artifact.
---

# Kulka weekly report

One page the Kulka CEO and COO read on their phones in under a minute. The design
is locked (panel-scored 95 on 2026-08-28). Your job each week is facts and copy,
not design. Reference: Weekly 01 at
https://Codex.ai/code/artifact/47cd3063-84f0-4533-b86b-645d69779513

## Process

1. **Find the window.** The report covers the seven days ending today. Get last
   week's number from the newest `kulka-weekly-NN` file or artifact; this week is
   NN+1.

2. **Gather facts. Never trust a draft or memory; count.**
   - `git log --since=<window start> --pretty=format:"%h %ad %s" --date=short`
     for code changes (count all commits) and merged pull requests.
   - Linear project Kulka: issues completed in the window (tickets closed),
     open chase issues (the asks), and dated upcoming work.
   - Meetings held with Kulka in the window, and the next scheduled session.
   - Read last week's report so the tracker advances instead of resetting and
     so promises made last week get answered this week.

3. **Fill `template.html`** (this directory). Follow every comment in it. Keep
   the file name pattern `kulka-weekly-NN.html`.

4. **Verify the numbers.** Every stat tile and every count in the copy must match
   step 2's output. If a number cannot be verified, it does not go in.

5. **Render check** with `./render.sh <file>`: look at both screenshots. No
   horizontal overflow, no label wrapped mid-word, tracker readable at a glance.

6. **Panel review** (see `review-panel.md`): run the three judges before sending.
   Ship at a 95 average. For a mid-week correction to an already-reviewed report,
   skip the panel.

7. **Publish as a NEW artifact** (new file name, no `url` reuse) titled
   `Kulka AI Weekly NN`, favicon 🟩, so old weeks stay at their links.

8. **Deliver to Matt** with the link and a short list of every claim you wrote
   that did not come from a verified source (dates you set, definitions you
   added). Matt confirms those before sending. Never send to Kulka directly.

## Design contract (settled by adversarial review, do not relitigate)

- Pure white ground, black ink, BLDG lime `#8FE800` on black or as an outlined
  fill, deep green `#2F7200` for green text on white. Archivo + IBM Plex Mono.
- One 700px column. Every section: 2px black rule, then uppercase 14px header.
- Tracker encodes state by fill plus outline (full lime = done, half = current,
  hollow = not started) so it survives grayscale and print. Exactly one green
  callout: the current step's due tag. Keep the sr-only sentence in sync.
- Scoreboard holds counts only, output first, meetings last, no dates, no
  engineer vocabulary. Numbers must not compete with the done list's item count;
  "tickets closed" is the settled label for completed Linear issues.
- The black card is the page's one bold moment. Each ask: one owner chip, one
  action, one recipient with tappable mailto, one explicit deadline, one gray
  why-line. It must work forwarded as a screenshot.
- Footer is fixed copy. The one first-person "I" in the document lives there.

## Vocabulary (readers run a construction company)

| Never | Write instead |
|---|---|
| commits | code changes |
| builds merged, PRs merged | tickets closed |
| repo | account you own / your GitHub account |
| stood up, spun up | set up |
| end to end | start to finish, all the way through |
| work packages | (banned: means trade scopes to a GC) |
| spec (bare, first use) | the spec for the first conceptual budget |

Vendor names (Vercel, Supabase) get a plain-English gloss before or with first
use. Matt's global writing rules apply to every sentence: no em or en dashes,
no fragment doubles, full sentences in prose, no banned words.

## Facts that never change

Takeoff stays human. Kulka owns the code. Drafts go to Matt, never to Kulka.
Never claim or imply AI reads construction drawings or performs takeoffs.
