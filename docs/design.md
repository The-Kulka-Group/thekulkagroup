# Real estate underwriting design brief

This brief applies the existing Kulka AI Daylight system to the real estate
development underwriting tool Rob started. It is a handoff for the next build
step, not a new visual direction.

`DESIGN.md` remains the record of approved visual decisions. `daylight.css` is
the token authority. A new screen must use those tokens and component rules.

## Product purpose

The tool helps a Kulka user turn a development deal into a reviewable
underwriting case. It must show the assumptions, the calculation results, and
what still needs a decision. It must not present a generated answer as a
decision or hide the source of a number.

The first version is an internal Kulka tool. It does not make an offer,
publish a budget, or send material to a lender or investor.

## Design principles

- Show the deal as a working record, not a dashboard of decorative metrics.
- Put the current decision, missing input, and material risk ahead of charts.
- Keep every financial result tied to an input, source, and last-updated date.
- Use tables for inputs and results where users need to compare numbers.
- Make uncertainty visible with a plain assumption or review state. Do not use
  a vague confidence score as a substitute for the reason.
- Keep the calculation deterministic. AI may help collect, summarize, or
  explain inputs, but it does not set financial assumptions on its own.

## App structure

The underwriting area fits inside the existing app frame. Add a real
`Underwriting` rail item only when the route exists. Do not add a section
header unless there are at least two modules to separate.

Suggested records and screens:

| Screen | Purpose | Primary content |
| --- | --- | --- |
| Underwriting list | Find and compare live cases | Deal name, stage, owner, updated date, key review state |
| Deal overview | Establish the case and its current decision | Property facts, owner, status, next review, open items |
| Assumptions | Review the inputs behind the case | Acquisition, program, schedule, revenue, cost, debt, and exit assumptions |
| Sources | Show where each important value came from | Source type, file or link reference, contributor, date, review state |
| Results | Read the base case before changing it | Uses and sources, return measures, cash flow, sensitivity summary, warnings |
| Sensitivities | Compare bounded scenarios | Base, downside, and upside cases with the changed inputs shown beside results |
| Review log | Keep a human record of changes and decisions | Change, author, time, reason, and approval state |

The final information architecture belongs to the product brief and data model.
This list is a design guide, not an approved schema.

## Layout

Each screen uses a Daylight sheet. The standard two-tier sheet header carries a
dark badge, a 26px Kulka title, and text actions. The lower row holds deal
context and a counter pill only when something needs review.

Use a wide record measure for deal pages. Place the current decision and the
most material open item near the top. Group financial inputs by their business
meaning, not by database table. Keep labels on the left, values aligned in a
consistent column, and amounts, percentages, and dates right-aligned in
tables.

The result page may use a short summary band, then a table or a small chart when
the chart exposes a trend better than a table. A chart never becomes the only
way to read a financial result. Show its underlying values in an adjacent table
or an accessible detail view.

## States and feedback

Use the Daylight status language everywhere:

| State | Use in underwriting |
| --- | --- |
| Done | A reviewed input or completed review item |
| Working on it | A case or analysis in progress |
| Stuck | A blocked case or a material missing item |
| Not started | A section that has not been prepared |

An amber waiting state marks a decision that needs a person. A red state marks
a missed deadline or blocked work, not an unfavorable return. Use an attention
row for an item that needs action. Do not use a toast or modal as the only
record of a material warning.

## Input and result rules

- Each editable financial input shows its unit and period where relevant, such
  as dollars, percent, per square foot, per unit, month, or year.
- Preserve entered precision. Format for reading, but do not silently round
  stored values into a different assumption.
- A calculated value identifies the calculation version and the inputs it uses.
- An imported or supplied value identifies its source, contributor, and date.
- A missing source or unreviewed value appears as a review item. It does not
  look equivalent to an approved assumption.
- Scenarios state what changed from the base case. Users must be able to return
  to the base case without rebuilding it.
- Treat generated narrative as a draft. A person approves any conclusion that
  leaves the tool.

## Daylight visual rules

Use the existing palette, type scale, spacing scale, radii, elevation, and
motion from `daylight.css`. In particular:

- Canvas is light. Sheets are white with low, soft elevation.
- Titles use the Kulka 800 weight. Section headings use 700.
- Blue is for actions and links. Status color has one meaning at a time.
- Buttons use words and an 8px radius. Inputs are 36px high with a 10px radius.
- Icons appear only in the rail and as state marks. Every icon sits beside its
  word.
- Keep the interface free of construction imagery, gradients as decoration,
  glow, 3D card effects, and invented dollar figures.
- At narrow widths, the rail becomes a scrolling top bar. Tables retain their
  columns and scroll within their sheet. Record grids become one column.

## Build boundary

The implementation must keep the client UI, Supabase data model, calculation
engine, and deployment configuration separate. GitHub holds the code and change
history. Supabase holds application data, with migrations as the only schema
change path. Vercel deploys the app after the repository is connected and the
needed environment values are set outside source control.

The existing ROM engine shows the right boundary: inputs and a data snapshot go
in, deterministic results come out, and the calculation does not read a prompt,
network, or clock while it runs. The underwriting model may need a different
engine, but it should keep the same separation.

## What the handoff must settle

Before implementation, the handoff needs to name the first underwriting type,
the required inputs, the output measures, user roles, review and approval
rules, source files, and the sample deals that may be used for testing. It must
also state which numbers are examples and which are real but restricted.

Do not assume that the existing conceptual-budgeting data or model is suitable
for development underwriting. Reuse the interface system and the deterministic
calculation boundary. Decide the new data model from the underwriting workflow.
