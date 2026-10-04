# Working-session packet: fields, schema, and two decisions

Written 2026-08-27 for LA-17. Background is `docs/precon/rom-spec.md` and
`docs/precon/direction.md`. Vocabulary is law in the repo root `GLOSSARY.md`.

For the working session with Jesse and Liam. Rob, Devin, and Matthew join. The meeting
notes say Monday 1 September 2026, but that date is a Tuesday, so the day or the date
needs fixing before anyone books it.

Scope of this packet is multifamily new construction. Self-storage comes second, and
renovation is a separate track that never blends with new construction.

Throughout, a ROM means the thing the tool produces: a ranged budget with a confidence
flag on every line and a plain list of what was assumed. It is not an estimate. That word
belongs to hard-bid work.

## What this is

Four things to react to:

1. The fields a multifamily job has to carry before the tool can build a ROM for it, and
   the questions each field turns into.
2. The database as it stands today, in plain words.
3. Two decisions the engineers cannot make: how a ROM gets presented, and who approves an
   estimator's judgment rule.
4. A set of rules of thumb inherited from an older ROM engine, for correction or
   rejection.

There is no demo and no dollar figures. Nothing here is a budget. The one number the
system can produce today comes from an invented placeholder that labels itself as
invented, so showing it would waste the room's time.

Rob's first agenda item, which multifamily jobs in ProEst are accurate enough to use,
sits outside this packet. It is Rob's to bring.

## 1. Required fields, and the questions they generate

Rob's framework: name the minimum fields per project type first, then work backward to
what the tool has to ask.

A field earns its place only if it does one of two jobs. It either changes the number, or
it decides whether a past Kulka job is a fair comparable for the one being budgeted.
Fields that do neither are worth recording somewhere else, not here.

That split matters because the tool reads the same field list twice. When estimating
lands a completed job in the database, the fields describe what was built. When a project
manager starts a new ROM, the same fields become questions. A field the team cannot
answer about a past job is a field the tool cannot use, however good the question sounds.

### The fields

| Field | Why it changes the number | Question it becomes |
| --- | --- | --- |
| Location, address or ZIP | Labor market, permitting, and how far material travels | Where is it? |
| Gross square feet | The denominator under every rate the engine reads | How many gross square feet? |
| Unit count and unit mix | Kitchens and bathrooms drive plumbing, electrical, and finishes far more than floor area does | How many units, and what is the mix by bedroom count? |
| Stories above grade | Structure, elevators, fire suppression, and vertical runs | How many stories above grade? |
| Levels below grade | Excavation, support of excavation, waterproofing, foundations | How many levels below grade, and what does the site hand you? |
| Site conditions | Existing building tie-ins, rock, poor soils, and support of excavation are the surprises that break a conceptual budget | How many levels below grade, and what does the site hand you? |
| Structure type | Wood, podium, and concrete are different buildings at the same square footage | What is the structure? Wood frame, podium over concrete, all concrete, light gauge, or modular? |
| Parking type and stall count | Surface, structured, and underground parking are three different costs per stall | What is the parking? |
| Finish level | Affordable, market rate, and luxury separate the finish and fixture divisions | What is the finish level? |
| Labor basis | Open shop, prevailing wage, and union are the largest single swing in the list | Is it open shop, prevailing wage, or union? |
| Buyout date | Escalation between a past job's buyout and this one's | When does it buy out? |

That is eleven fields. Two of them, the levels below grade and what the site hands you,
get asked as one question, because the person answering either is looking at the same
sketch for both. So eleven fields come to ten questions. The spec caps tier 1 near ten, so
this fits, but only just. Anything added here comes out of something else.

### Fields recorded on a past job but never asked

These describe the record rather than the building. They exist so the engine can weight
one job against another and so any number can be traced back.

| Field | Why |
| --- | --- |
| Percent complete | Fieldstone sits near 56 percent and is still usable. It has to say so. |
| Source | Autodesk Cost actuals outrank ProEst budgets. Devin put the gap at five to one. |
| Export and date | Which file the number came from, and when |
| Recorded by | A name, so a wrong number has someone to ask |

### What the team has to settle

- Is unit mix answerable at concept stage, or does the tool have to accept an average unit
  size and back into the mix?
- Does structure type belong in tier 1, or is it still unknown when a developer asks for a
  ROM?
- Is anything on this list unanswerable about past jobs in ProEst? A field nobody can fill
  in for the back catalogue is a field the tool cannot calibrate.
- What is missing? The list is deliberately short, and the estimators are the ones who
  know what it is missing.

## 2. The database as it stands

Five tables exist today. They were built to prove one ROM can run from question to answer,
not to hold Kulka's data.

**Projects.** One row per job. Today it holds a name, whether it is multifamily or
self-storage, whether it is new construction or renovation, gross square feet, and how far
along it is. Nothing else. Every field in section 1 above is missing from this table and
has to be added once the room agrees on the list.

**Benchmarks.** One row per stored cost value. Each row says which cost code it belongs
to, what the value is, which kind of project it applies to, and how many past jobs stand
behind it. That count drives the confidence flag, so a value backed by one job is marked
differently from one backed by six.

Every benchmark row also has to say where its number came from. It records whether the
number is an actual cost, a ProEst budget, or an estimator's reviewed judgment; who
recorded it; and on what date. An actual or ProEst value must also name its export. This
is deliberate. The reason the earlier attempt in a chat window failed is that no number
could be traced.

**Benchmark sources.** One row links one benchmark to one past project. The database
checks that both records exist. A benchmark built from three completed jobs has three
source rows, so none of its provenance can point at a made-up project identifier.

**Runs.** One row every time somebody asks for a ROM. It records the answers given, the
ROM produced, and whether the run finished or failed. A ROM from three months ago can be
pulled up and questioned.

**Steps.** The runs table's detail, one row per step, so the screen can show progress
while a ROM is being built and so a failure says which step failed.

### Proposed home for the fields after the session

This is the draft target, not a migration ready to run. The room decides the field list
first. Engineering then writes the named columns and tables.

| Information | Proposed home | Shape |
| --- | --- | --- |
| Location | Projects | Address and ZIP fields |
| Unit count and mix | Projects | Unit count plus a bedroom-count breakdown |
| Stories and levels below grade | Projects | Two whole-number fields |
| Site conditions | Projects | A short controlled list plus a note |
| Structure type | Projects | A controlled list agreed in the session |
| Parking | Projects | Type and stall count |
| Finish level and labor basis | Projects | Two controlled lists |
| Buyout date | Projects | Date |
| Tier-1 answers | Project answers, new table | Project, question-set version, answers, and who answered |
| Judgment approval | Rule approvals, new table | Rule, proposer, approver, decision, and date |
| Benchmark source jobs | Benchmark sources | Foreign keys to the benchmark and each past project |

### What is deliberately not there yet

- **Cost codes are loose text.** There is no table of cost codes and no mapping between
  ProEst codes and Autodesk Cost codes. The notes already flag that these two do not line
  up cleanly. Building the mapping before seeing Devin's export would be guessing.
- **The questions and answers have no home.** The engine reads the project record directly
  right now. Once section 1 is agreed, tier-1 answers get their proposed table.
- **There is no data in it.** Production starts empty. No values came across from the older
  engine, and no invented cost value ships in a migration. Real data starts with Kulka's
  own numbers or it does not start.
- **Nothing enters except through an approval gate.** Nobody types a cost into a chat and
  has it land in the database. That gate is not built yet.

## 3. Decision one: how a ROM is presented

The engine can total a job three ways. The choice is not cosmetic, because the format the
engine stores at is the format everything else has to convert from.

**By CSI trade division.** Concrete, masonry, plumbing, electrical, and so on.

- It matches how ProEst is organized, how buyout runs, and how subcontractors bid.
- An estimator can check it line by line against a job they remember.
- A developer at concept stage does not think in divisions.
- Division splits move around early in design, so the same building can land differently
  in two divisions depending on who scoped it.

**By element.** Substructure, shell, interiors, services, sitework, and so on.

- It matches how a developer thinks and how a design decision maps to money.
- It holds still when the design changes, which is most of what happens at concept stage.
- It compares fairly across jobs with different structures.
- It does not map to buyout, so measuring the tool against actual costs needs a
  translation layer.

**Both.** Store at the finer level and roll up two ways. Estimators see divisions, owners
see elements.

- It costs a mapping table from cost code to element, and somebody has to maintain it.
- It only works cleanly if each cost code belongs to exactly one element.

The question for the room is narrower than it looks. Store at the cost-code level and
either view is a rollup, so the real question is whether a single cost code ever splits
across two elements. If it does, "both" stops being a lookup and becomes judgment applied
per job, which is expensive to build and expensive to keep right.

Bring an example if you have one. One cost code that genuinely lands in two elements
settles this faster than an hour of discussion.

## 4. Decision two: who approves a judgment rule

An estimator's rule of thumb can live in the database as data. It gets flagged as judgment
rather than measured cost, it never carries the weight of an actual, and it gets replaced
as real numbers arrive. That much is settled. Who signs off on one is not, and the spec
puts the call with Devin and Rob.

Three shapes:

**One approver.** Devin or Rob approves every judgment rule.

- It is fast, and the standard stays consistent because one person sets it.
- It stops dead when that person is busy, and nobody is positioned to catch their
  mistakes.

**Proposer plus a named reviewer.** An estimator proposes, a second estimator approves,
and Devin or Rob settles disagreements.

- It spreads the work and catches errors, and the people closest to the numbers own them.
- It is slower, and two estimators can agree on something wrong.

**A standing review.** Proposed rules queue up and get reviewed on a set cadence.

- It stays consistent, and it creates a record of the reasoning.
- It adds delay, and it needs a recurring meeting somebody has to run.

Whichever shape wins, four things still need answers:

1. Does a judgment rule expire on its own, or does it sit there until somebody removes it?
2. What happens when actual costs contradict a rule? Does the rule go quietly, or does the
   person who approved it get told?
3. Can a rule be scoped, so it applies only to garden-style jobs or only to prevailing
   wage work?
4. Who can see that a number in a ROM rests on judgment rather than measured cost? The
   current thinking is everyone, on the face of the ROM.

## 5. Inherited rules of thumb, for correction or rejection

The rules below come from an older ROM engine that Matthew built for a different company.
They are here for one reason: they encode guesses about how multifamily costs move, and it
is faster to correct a wrong guess than to start from a blank page.

Read them with suspicion. Nobody at Kulka wrote them or reviewed them. They were never
measured against a Kulka job. The default answer to each one is reject, and a rule only
survives if an estimator in the room recognizes it as roughly right.

The older engine also carried tables of dollars per square foot by division. Those do not
come across at all and are not in this packet. Kulka's database fills with Kulka's own
costs.

### Floor count

Each rule claims a cost goes up by a percentage for every floor above a threshold.

| What it moves | Claimed effect | Threshold |
| --- | --- | --- |
| Concrete | Up 4 percent per floor | Above 3 floors |
| Structural steel | Up 5 percent per floor | Above 3 floors |
| Elevators | Up 15 percent per floor | Above 1 floor |
| Fire suppression | Up 8 percent per floor | Above 2 floors |
| Plumbing | Up 3 percent per floor | Above 2 floors |
| HVAC | Up 4 percent per floor | Above 2 floors |
| Electrical | Up 3 percent per floor | Above 2 floors |

### Levels below grade

Each rule claims a cost goes up by a percentage for every level below grade.

| What it moves | Claimed effect |
| --- | --- |
| Demolition and excavation | Up 15 percent per level |
| Concrete | Up 10 percent per level |
| Waterproofing | Up 8 percent per level |
| Earthwork | Up 20 percent per level |

### Site conditions

The older engine asked only about slope. These are its claimed effects. It had no rules
for rock, poor soils, groundwater, existing-building tie-ins, or support of excavation.
That gap is part of the question for the room.

| Answer | Existing conditions | Concrete | Earthwork |
| --- | --- | --- | --- |
| Flat | No change | No change | No change |
| Moderate slope | Up 8 percent | Up 6 percent | Up 10 percent |
| Steep or complex | Up 18 percent | Up 12 percent | Up 25 percent |

### Unit and room counts

| Trigger | What it moves | Claimed effect |
| --- | --- | --- |
| Each unit above 4 | Finishes | Up 1 percent |
| Each unit above 4 | Plumbing | Up 1 percent |
| Each bathroom above 4 | Plumbing | Up 2 percent |
| Each kitchen | Equipment | Up 10 percent |
| Each kitchen | Plumbing | Up 5 percent |
| Each elevator past the first | Elevators | Up 25 percent |

The kitchen and bathroom rules were written for commercial buildings, where those are
rooms somebody counts. The old engine never asked a multifamily job for either number, so
in practice those two rules never fired on a multifamily job. If Kulka wants them, the
tool has to start asking. Note also that on multifamily they overlap the unit-count rule,
because every unit carries a kitchen and at least one bathroom, so somebody has to decide
which rule owns that cost.

### Labor basis

Applied to the whole job.

| Basis | Claimed effect |
| --- | --- |
| Open shop | No change |
| Prevailing wage | Up 35 percent |
| Union | Up 45 percent |

### Location

Applied to the whole job, relative to a national average.

| Market | Claimed effect |
| --- | --- |
| Manhattan | Up 45 percent |
| Brooklyn and Queens | Up 30 percent |
| Catskills and rural upstate New York | Up 28 percent |
| Bronx | Up 25 percent |
| Westchester | Up 20 percent |
| Staten Island | Up 20 percent |
| Northern New Jersey | Up 20 percent |
| Nassau | Up 15 percent |
| Connecticut | Up 15 percent |
| Suffolk, west | Up 10 percent |
| Rockland | Up 10 percent |
| Central New Jersey | Up 10 percent |
| Suffolk, east | Up 5 percent |
| Hudson Valley | Up 5 percent |
| South Florida | Down 5 percent |

The Catskills number is the one to look at first. It puts rural upstate above Westchester
and above northern New Jersey, which is either a real thing about thin labor pools and
long hauls or a mistake nobody caught.

### Multifamily product type

The first column applies to the whole job. The rest apply on top of it, to those
divisions only.

| Product | Whole job | Concrete | Structural steel | Elevators | Fire suppression |
| --- | --- | --- | --- | --- | --- |
| Garden style, 1 to 3 stories | Down 15 percent | | | | |
| Mid-rise, 4 to 6 stories | No change | Up 8 percent | Up 6 percent | Up 15 percent | |
| High-rise, 7 or more stories | Up 30 percent | Up 20 percent | Up 15 percent | Up 35 percent | Up 12 percent |

Mid-rise is the default the old engine used when nobody chose, and it is not the neutral
setting it looks like. It quietly adds to concrete, steel, and elevators.

### Finish level

| Level | Carpentry | Openings | Finishes | Mechanical and plumbing fixtures |
| --- | --- | --- | --- | --- |
| Builder grade | Down 20 percent | Down 20 percent | Down 25 percent | Down 30 percent |
| Market rate | No change | No change | No change | No change |
| Luxury | Up 15 percent | Up 25 percent | Up 35 percent | Up 40 percent |

### Parking

| Type | Claimed effect |
| --- | --- |
| Surface lot | No change |
| Structured or podium | Concrete up 12 percent, steel up 8 percent |
| Underground | Concrete up 25 percent, earthwork up 20 percent, steel up 12 percent, waterproofing up 10 percent |

### The question nobody asked the first time

Every one of these multiplies against the others. A twelve-story union job in Manhattan
with two levels of underground parking stacks the location rule, the labor rule, the
product type rule, the parking rule, and twelve floors of the floor-count rules, all at
once.

The old engine put a ceiling on some of that and not the rest. It capped the floor,
below-grade, and unit-count rules at somewhere between half and two and a half times the
base. The labor rule, the location rule, the product type rule, and the finish rule all
multiply on afterwards, outside the ceiling. So the part of the stack that runs away
fastest is the part nothing holds down, and the cap that exists is an admission that
somebody already saw the problem and only fixed half of it.

Nobody checked what a real job comes out at once the stack is applied. So there are two
questions per table, not one:

1. Is the direction right, and is the size roughly right?
2. Is the threshold right? Why 3 floors and not 4, and why does plumbing start moving at 2
   floors while concrete waits until 3?

And one question across all of them: pick a job you know well, apply the stack, and say
how far off the answer lands.

## 6. What the session has to produce

| What | Who |
| --- | --- |
| The final field list per project type, and which fields the back catalogue can fill in | Jesse, Liam, estimating |
| Which multifamily jobs in ProEst are accurate enough to use | Rob |
| Presentation format, and whether any cost code splits across two elements | the room |
| Who approves a judgment rule, and whether one expires | Devin and Rob |
| A verdict on each inherited rule of thumb: keep, correct, or reject | Jesse, Liam |
| Multifamily actual costs out of Autodesk Cost | Devin |

Two or three completed multifamily jobs with known actual costs come after that. The tool
runs against them, the error gets measured, and only then does a ROM from this tool go
near a live job.
