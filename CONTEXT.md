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

**Tier**:
The depth of questioning the user chose for a ROM. Deeper tiers ask more questions and
buy tighter ranges.

**Actuals**:
Real job costs after buyout, exported from Autodesk Cost. The highest-weight data
source.
_Avoid_: historicals, real costs

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
