# Conceptual budget (ROM) spec

Confirmed 2026-08-27 after a grilling session with Matt. This replaces the 2026-08-26
draft. Background is in `docs/precon/direction.md`; vocabulary is law in the repo root
`CONTEXT.md`. The canonical build spec lives in Linear; this file is the repo's record
of the decisions.

## The product

Kulka's conceptual budgeting tool, owned by Kulka, first module of the system Rob
described. It produces a ROM: a ranged budget with a confidence flag on every line
and a plain list of assumptions. Multifamily first, self-storage second, new
construction split from renovation before anything else. No deadline job drives the
build; the Manor project was pulled from the plan. NOVATERRA gets nothing now and
takes what it wants later by copy or fork. The tool stays off the public website.

## Architecture

- One repo: Kulka-AI, engine as its own package beside the app.
- Three layers:
  1. Skill files: raw workflow definitions (questions, steps, output shape) any
     surface can run.
  2. Engine: deterministic code behind one API. Math never lives in a prompt. This
     is what makes outputs consistent across users (controlled goalposts).
  3. Surfaces that call the API.
- v1 surfaces: the site, plus the Claude wrapper that falls out of development
  nearly free. ChatGPT waits until the engine stops moving. The one-API design stays
  platform neutral throughout.
- Runs: every execution writes a run record with steps and statuses to Supabase. The
  site renders runs live. The run record is both the progress view and the audit
  trail.
- No generic skills platform until a second skill exists.
- Auth: Supabase, three accounts (Matt, Rob, Devin), roles and approval workflows
  later.
- Database: Kulka's own Supabase account. Matt's access is set up. Schema managed by
  migrations from this repo.

## Data rules

- Weighting order: Kulka actuals from Autodesk Cost, then vetted ProEst budgets,
  then the LLM as a low-weight signal never used alone for a line.
- The database starts empty. No NOVATERRA benchmarks migrate.
- Provenance is a hard requirement: every number traces to the projects, export, or
  reviewed judgment that produced it, with names and dates.
- Estimator judgment rules are allowed as data, flagged as judgment, replaced by
  actuals as they arrive. Who approves a judgment rule is Devin and Rob's decision.
- Incomplete projects contribute if flagged (Fieldstone at ~56 percent is usable).
- Ingestion goes through an approval gate. Nobody feeds the database from a chat.

## Build sequence

- The engine is rebuilt from scratch. The old NOVATERRA ROM code
  (`~/dev/NOVATERRA/app/src/utils/romEngine.js` and friends) is a read-only
  reference; its 128 test cases come along as a spec checklist. Its design ideas
  survive (confidence-weighted blending, calibration from actuals, question-to-
  multiplier schema, range tightening); its hardcoded tables, browser caching, and
  UI do not.
- Tier 1 only (about 10 questions). Its measured backtest error dictates what tier 2
  asks. Tiers 2 and 3 are not built until tier 1 has run on completed jobs.
- Backtest before any live job: two or three completed multifamily projects with
  known actuals, measure the error, then pick the first live job.
- Output is on-screen only until the first live job. No PDF or workbook in v1.

## Working session agenda (Jesse and Liam, target early September 2026)

1. Which multifamily jobs in ProEst are accurate enough to use.
2. Minimum required fields per project type, worked backward into tier-1 questions
   (Rob's framework).
3. Presentation format: CSI trade divisions, elemental, or both.
4. Judgment-rule approval authority (Devin and Rob decide).
5. Review inherited rules of thumb (floor, basement, site multipliers) and correct
   or reject them.

Deliverable into the session: the fields framework plus a draft database schema. No
demo.

## Blocked on facts

Schema detail, cost-code mapping, and tier-1 question content wait on Devin's
Autodesk export and the ProEst verdict from Rob.
