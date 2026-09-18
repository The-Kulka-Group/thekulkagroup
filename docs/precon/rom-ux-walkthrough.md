# Walking the ROM end to end, before it is built

Written 2026-09-16 after the twenty-four spec decisions, to find the walls before they are
built rather than after. Decisions are in `docs/adr/`, vocabulary in `CONTEXT.md`.

The test case: Devin takes a call on a Tuesday. A developer wants 120 units at 500 Sunrise
Highway in Patchogue, one and two bedrooms, four stories over a podium with structured
parking underneath, and a budget by Friday.

## Grounding: what exists today

- `lib/data.ts` holds the CRM as hardcoded fixtures with invented client names. **There is
  no pursuits table.** Nothing is persisted.
- `supabase/migrations/20260827120000_rom_schema.sql` has five tables. `projects` carries
  five fields. `benchmarks` constrains `unit` to `usd_per_gsf` and nothing else.
- Row level security is on with no policies, and the server reaches Postgres as owner. So
  "no roles" is already how it works.
- `app/(app)/rom/page.tsx`, `app/api/rom/route.ts` and `packages/engine` exist as a walking
  skeleton.

## Part 1. Walls that force a rebuild if missed

### 1.1 A project is not one building

Villa at Glen Cove has Buildings A, A2, A3, A4, A5, B, C, D, E and F. Jefferson's Ferry is
"Building 1" of a larger campus. The schema has no building level, and neither does the
intake.

This is not cosmetic. 120 units in one four-story building and 120 units across three
garden buildings are different jobs at the same unit count, with different envelope area,
different circulation, and different site work. A benchmark drawn from one and applied to
the other is wrong in a way no confidence flag will catch.

**Needs:** a buildings level under projects, and an intake question about how many
buildings. Retrofitting this after benchmarks exist means recomputing every one of them.

### 1.2 The developer gives unit count, the engine needs square feet

Answer 22 makes dollars per gross square foot the default denominator. Answer 23 makes
"area or unit count" the required minimum. So on the most common call the estimator supplies
units and the engine has to invent the area.

That conversion is an average unit size, and it varies by product type, finish level and
market. Nobody has named it, nothing stores it, and it silently scales every square-foot
benchmark in the ROM. It is a benchmark in its own right and needs the same provenance as
any other.

**Needs:** average unit size as a first-class benchmark, by product type, with provenance,
and the conversion stated on the face of the ROM as an assumption.

### 1.3 The benchmark table cannot hold what answer 22 requires

`benchmarks.unit` is checked against a single value, `usd_per_gsf`. The per-unit exception
list needs at least `usd_per_unit`, and parking probably needs `usd_per_stall`.

**Needs:** the unit check widened, and a per-subdivision declaration of which denominator
applies, so the engine never guesses.

### 1.4 Nothing captures what actually happened

The promise is that the system improves every job. The only mechanism specified is
importing past budgets through the admin UI. When a ROM is issued and the job later gets
bid, bought out or built, nothing records how the ROM did.

Without this the database only learns from files somebody remembers to upload, which is the
same manual process Kulka has now.

**Needs:** a link from an issued ROM to the project record it becomes, and a closing step
that records the actual against it. This is what makes the backtest a byproduct rather than
a project.

### 1.5 There is no contract against total-project view

Answer 13 gives free-form line editing. An estimator who knows the owner is buying the
appliances deletes that line, and the developer's total silently loses work the owner is
still paying for. That is precisely what made Jefferson's Ferry hard to read: appliances
were refiled rather than removed, and the trash compactor genuinely left.

Free-form editing is how a ROM gets authored. It is not a substitute for knowing who buys
what.

**Needs:** a per-line flag for who carries the cost, and two totals on the ROM. What is in
Kulka's contract, and what the project costs the developer.

### 1.6 Pursuits do not exist

Answer 9 attaches a ROM to a pursuit and pre-fills from it. The CRM is fixture data.

**Needs:** either pursuits become real before the ROM depends on them, or the link is
nullable and the pre-fill is deferred. The second is smaller and does not block the tracer
bullet.

## Part 2. Walls that will frustrate the user

### 2.1 Assumptions are declared but not editable

Answer 23 assumes anything not answered and declares it. The obvious next move for any
estimator is to disagree with one assumption and see what it does. If that means walking
back through the intake, nobody will do it twice.

**Needs:** an assumptions panel where each assumed value is editable in place and the ROM
recalculates. This is the primary interaction of the whole screen, not a detail.

### 2.2 A screen of mostly guesses

With five projects, most subdivisions will have no Kulka data and will carry an LLM
proposal flagged low. An accordion of 22 divisions hiding 30 subdivisions, most of them
guesses, is not something anyone will work through.

**Needs:** a triage view sorted by confidence and by dollar impact, so the estimator fixes
the six lines that matter and ignores the rest. The ROM screen and the review screen are
different jobs.

### 2.3 Approving hundreds of mappings by hand

Jefferson's Ferry alone is 91 lines. The Vue is 177. Every line needs a subdivision, model
proposed and human approved.

Worse, Autodesk group numbers mean different things per job, so nothing can be learned from
the code. Only the description is reusable.

**Needs:** bulk approve by confidence, a learned mapping keyed on description text so the
same line is never asked twice, and a diff view that shows only what is new in a file.

### 2.4 No document means the chain breaks immediately

Answer 4 puts the PDF behind a gate. The developer asked for a budget by Friday. The
estimator will screenshot the screen or retype it into Excel.

At that point the frozen version from answer 21 is not what the developer received, and the
defensibility the whole project exists for is gone on the first real job.

**Needs:** either the PDF moves into v1, or the ROM screen is print-clean and the issued
version records that it was printed. Deciding this after the first live job is deciding it
too late.

### 2.5 No way to compare two versions

"What if we go to five stories?" produces version two. Nothing lets the estimator put it
beside version one, which is the entire reason a developer asks the question.

**Needs:** version comparison on the same screen, at least at division level.

## Part 3. Smaller gaps that are cheap now and expensive later

- **An override with no reason.** Answer 12 lets an override become a judgment rule. A
  judgment benchmark with no stated reason breaks provenance. The reason field is required,
  not optional.
- **Labour basis assumed silently.** It is the largest single multiplier in the inherited
  rules, open shop against union being a claimed 45 percent. Answer 23 leaves it assumable.
  Either promote it to the required minimum or make that one assumption impossible to miss.
- **Parking stalls are a code question.** The original brief named code requirements by
  usage and location. Stall ratio is set by municipal zoning and nothing in the design
  touches it. Assuming a ratio silently prices a garage nobody asked for.
- **What does the dial move?** Trade cost only, or general conditions and fee as well. If it
  moves the fee, Kulka's margin is on a slider that anybody can drag.
- **Duration and escalation are coupled.** An estimator overriding the predicted duration
  changes general conditions. It should probably also move the escalation midpoint, since a
  longer job buys out later. Nothing says whether it does.
- **Two people on one draft.** Answer 21 makes drafts mutable and answer 7 removes roles.
  Nothing decides what happens when two estimators open the same one.
- **The same file uploaded twice.** Needs a content hash and a refusal.
- **A project with no square footage.** It will get entered anyway. It must be excluded from
  benchmarks rather than contributing a divide by nothing.
- **Self-storage is still in the schema.** The `project_type` check allows it while answer 8
  scopes v1 to multifamily. Harmless, but it will read as supported.

## Part 4. The thing nobody has said out loud

The intake was capped near ten questions. Counting what the twenty-four decisions now
require: eleven project fields, a new against renovation fork adding four or five more, how
many buildings, the general conditions selection, a duration to confirm or override, and a
dial position. That is closer to twenty interactions than ten.

That may be fine. An estimator producing a defensible budget will answer twenty questions
happily if the alternative is a day of work. But the ten-question promise is in
`rom-spec.md` and it is no longer true, and the gap between a quick tool and a thorough one
is exactly the kind of thing that gets discovered during the build and resolved badly.

**The decision to make now:** is this a ten-question tool that assumes aggressively and
shows its assumptions, or a twenty-question tool that asks properly? The answers so far
point at the second while the spec still says the first.
