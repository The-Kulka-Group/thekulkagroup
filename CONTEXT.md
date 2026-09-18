# Kulka AI

The system Kulka staff use to do their work with AI inside controlled goalposts. Ships
the CRM surfaces and the conceptual budgeting module first.

## Language

### Conceptual budgeting

**ROM**:
Rough order of magnitude. The deliverable: a ranged budget with a confidence flag on
every line and a plain list of what was assumed.
_Avoid_: estimate (that word belongs to hard-bid work), budget proposal

**Conceptual budgeting**:
The activity of producing a ROM from limited information before drawings are complete.
_Avoid_: pre-con (see below), schematic estimating

**Pre-Con**:
Ambiguous in the trade: the estimating department, a paid budgeting service sold to
owners, or everything before ground-break. Never use it unqualified in docs; say which
sense you mean or use a precise term instead.

**Branch gate**:
A question whose answer decides whether a whole section of the intake appears, such as
whether the site has existing structures to demolish. It takes three answers: yes, no, or
don't know. A "no" prices that section at zero. A "don't know" shows TBD on the schedule
of values and is left out of the total.
_Avoid_: conditional question, skip logic, gate question

**Tier**:
The depth of questioning the user chose for a ROM. Deeper tiers ask more questions and
buy tighter ranges.

**Actuals**:
Money Kulka has already spent on a job, exported from Autodesk Cost. On a job still
running this is a partial figure, so it always carries the job's percent complete.
_Avoid_: historicals, real costs

**Commitment**:
The value of a subcontract as executed. A job is fully committed once it is bought out,
which happens long before its actuals are complete.
_Avoid_: contract value, committed cost, buyout number

**Canonical work item**:
One entry on the Kulka-owned list that every source's cost codes map into. ProEst codes
and Autodesk groups each map to exactly one.
_Avoid_: cost code (that word belongs to a source system), line item

**Buyout package**:
A scope of work as it was actually bought, meaning one subcontract with one supplier. A
package can span more than one CSI division.
_Avoid_: trade package, bid package, contract

**Trade cost**:
The sum of every MasterFormat division from 01 to 33, before any 90-series item applies.
It is the number the markup waterfall computes from, and it includes General Requirements.
_Avoid_: base cost, direct cost, hard cost

**General Requirements**:
MasterFormat Division 01. The job costs of running a site: temporary facilities, safety,
cleanup, testing and closeout. It sits inside trade cost, so every 90-series item computes
on top of it. It is not General Conditions.
_Avoid_: GR, general conditions and requirements

**General Conditions**:
Kulka's own cost of running a job: supervision, project management, site office and
vehicles. It is a 90-series markup on trade cost rather than part of it. It is not General
Requirements.
_Avoid_: GC, general conditions and requirements, overhead

**Markup basis**:
What a 90-series item computes on: either the running total of everything above it, the
trade cost alone, or a lump sum. Recorded per item, because Kulka's budgets do not all
use the same one.
_Avoid_: markup rate (that is the percentage, not what it applies to)

**Line role**:
What a line on an imported budget is: real scope, an allowance, a takeoff helper, or a
duplicate. Only scope and allowance lines are allowed to feed a benchmark.
_Avoid_: role flag, line type, line status

**Scope side**:
Whether a line is building work or site work. Every canonical work item carries a
default, so the estimator sets it only when moving a line. It is the split a developer
asks for, and it is the only building-against-site distinction the ROM keeps.
_Avoid_: scope owner, location, building flag

**Contract side**:
Whether a line is in Kulka's contract or bought by the owner direct, such as appliances
or a trash compactor. Every canonical work item carries a default, so the estimator sets
it only when a specific job is unusual. It applies to live ROM lines and to imported
budget lines alike. Owner-direct lines are excluded from Kulka's trade-cost and General
Conditions benchmarks but kept as their own benchmark by canonical item.
_Avoid_: cost bearer, who pays, buyer

**Benchmark**:
A stored cost value the engine reads from the database. Every benchmark carries
provenance.
_Avoid_: constant, default rate

**Provenance**:
The recorded source of a number: which projects, which export, or whose reviewed
judgment produced it, and when.

**Comparable**:
A past Kulka project whose recorded fields make it fair to compare against the project
being budgeted.
_Avoid_: comp, similar job

**GSF per unit**:
The benchmark that converts a unit count into gross square feet when a call gives units
and not area. Stored as gross square feet per unit directly, by product type, never as a
net unit size plus an efficiency factor.
_Avoid_: average unit size, unit size

**Dial**:
The adjustment a user applies to a finished ROM to take it up or down. It sits on top of
the engine's single calibration and never changes the data behind it. Its position is
stated on the face of every ROM.
_Avoid_: setting, mode, scenario, risk level, fudge factor

**Closing comparison**:
A scored record of predicted trade cost from an issued ROM against actual trade cost from
an imported project, run automatically whenever actuals are imported for a project the
ROM is linked to. It does not itself become a benchmark; the import is what feeds the
benchmark database.
_Avoid_: backtest result, close-out, reconciliation

**Award value**:
Kulka's full contract total when it was awarded: trade cost plus every 90-series item.
What a developer takes to a lender for Kulka's scope. Not what the engine backtests
against; that is trade cost, since benchmarks predict cost of work, not the markup
waterfall.
_Avoid_: GMP, contract value, original budget

**Total project cost**:
Total construction cost: Kulka's contract plus whatever construction-trade scope the
owner buys direct. Land, financing, and other soft costs are out of scope and are never
folded into this figure; they may become their own add-on section later.
_Avoid_: project cost, total cost, all-in cost

**Admin permission**:
The one exception to no-roles-in-v1: a flag on an account, not a roles system, that
gates promoting a judgment rule into a reusable benchmark. Tied to the permission, never
to a named person.
_Avoid_: admin role, superuser, Devin and Rob's decision

**Living proposal**:
The HTML-style client-facing document planned to follow the branded PDF. A later, separate
deliverable, not part of v1.
_Avoid_: web proposal, interactive PDF

**Confidence flag**:
The high, medium, or low mark on a ROM line, driven by the count, spread, and kind of
comparables behind it. Low flags hold the line for human review.
_Avoid_: score, rating

**Backtest**:
Running the engine on a completed project with known actuals and measuring the error.
Required before any ROM leaves the building.

### System

**Controlled goalposts**:
The principle that staff use AI inside the system, outputs are consistent across
users, and data enters the database only through an approval gate.

**Engine**:
The deterministic code that turns answers and database values into a ROM. Math lives
here, never in a prompt.

**Skill**:
A raw definition file for one workflow (its questions, steps, and output shape) that
any surface can run: Claude, ChatGPT, or the site.

### CRM and Vision

**Source record**:
An item published by an outside authority, with the evidence and dates needed to
understand it. It may describe a project, application or policy change.

**Opportunity**:
A possible piece of work Kulka has chosen to assess or track. Several source
records can support it without becoming separate opportunities.

**Pursuit**:
An opportunity Kulka has chosen to pursue commercially. It retains the same
identity and history as the opportunity.

**Company**:
An organization connected to Kulka or a project. A client is a company with a
client relationship; a named applicant is not automatically a client or owner.

**Opportunity party**:
A company or person with a stated role in an opportunity, such as applicant,
property owner, developer or architect.

**Responsible staff member**:
The Kulka person accountable for an opportunity or relationship. This role is
distinct from the owner of the property.

**Review status**:
The state of the team's review work. Completing review does not mean Kulka won
the work.

**Sales stage**:
The commercial position of an opportunity, from qualification through outcome.
It is separate from a public authority's application status.
