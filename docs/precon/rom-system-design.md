# ROM system design: how the conceptual budgeting tool stores and defends a number

Written 2026-09-15 after reading six ProEst unit-cost exports and four Autodesk Cost
reports. Background is `docs/precon/rom-spec.md` and `docs/precon/direction.md`.
Vocabulary is law in the repo root `GLOSSARY.md`.

This answers the question Matt asked: retrieval-augmented generation, a vector database,
or something else. The answer is something else, and the data is the reason.

## 1. What the data actually is

### ProEst unit-cost exports

Six files, four projects. Three are The Vue in Riverhead at three stages, totalling
$52.2M, $25.4M, and $11.6M, with no field in the file saying which supersedes which.
Line detail reconciles to the Summary base cost exactly in all six, so the arithmetic is
sound. What varies is whether the lines describe a building.

| File | Lines | Base cost | State |
| --- | --- | --- | --- |
| Jefferson's Ferry ILNW Bldg 1 | 91 | $6.24M | Clean. Real quantities and unit rates. |
| The Vue, 426 A Main, conceptual | 177 | $44.4M | Usable. $12.6M sits on lump-sum lines with no quantity. |
| The Vue, 426 W Main, 6-4-23 | 147 | $21.1M | Usable. Real CY and SF quantities. |
| The Vue, revised conceptual | 148 | $9.65M | Several divisions zeroed. |
| West Shore Rd | 24 | $6.76M | Partial scope. No framing, no MEP, no finishes. |
| Villa at Glen Cove, 50% CD | 23 | $50.7M | $50.2M priced as wall area at a flat $250/SF. |

Villa prices perimeter times height, which is wall area, at $250 per square foot across
thirteen rows. Matt's ruling: that is a deliberate estimator shortcut, not scratch, and it
gets weighted low. It never produces a dollars-per-gross-square-foot benchmark, because its
denominator is wall area.

Other defects the importer has to survive:

- The quantity column is one string, "511.27 CY". Value and unit need splitting.
- Units run LS, ALLW, EA, CY, SF, CF, LF, TN, SY, ACRE, BATH, and BLOCK.
- West Shore carries "Sanitary Sewer Allowance, 1.00 ALLW" twice, once at $125 and once
  at $125,000. A stale line nobody deleted.
- West Shore prices "Drainage Allowance" as 1.00 LF at $550,004.67.
- Line descriptions beginning with two digits parse as division headers under a naive
  rule. "30 Year Asphalt Shingles" and "18 Ga. SS Corner Guards" both do this.
- Division names arrive as "03 Concrete" and as "03 CONCRETE".
- Demolition lands at 02.04113, at 02.00050, and at 31.00050 on different jobs.
  Elevators are 14.02000 on three files and 14.21001 on a fourth. Allowances sit at
  97.00000 on one job and at 95.00000 "Ammenities" on another.

### Autodesk Cost reports

Two projects, two report types each, exported 31 August 2026 by Marchella Verdi.

| | Fieldstone NB | Jefferson's Ferry NWIL |
| --- | --- | --- |
| Original budget | $32,266,585 | $7,376,377 |
| Revised budget | $32,481,683 | $8,442,771 |
| Original commitment | $31,601,532 | $7,043,787 |
| Projected cost | $34,141,531 | $8,907,247 |
| Actual cost | $10,449,383 | $2,542,680 |
| Complete | 30.61% | 28.55% |

Neither job is finished, so the Actual Cost column calibrates nothing yet. The
`direction.md` figure putting Fieldstone near 56 percent is stale.

The column that is finished is `Orig. Commitment`, the executed subcontract value. Both
jobs are fully bought out. Budget against buyout is the error the tool can measure today.
Budget against final actual waits for the jobs to close.

Autodesk also carries what ProEst cannot: approved owner changes, change orders, reserves,
and per-package variance. Fieldstone forecasts a $1.66M overrun and its Division 99
contingency line grew from $1.0M to $4.52M.

### The pair

Jefferson's Ferry appears in both systems, and on 15 September 2026 we confirmed the two
files describe the same building and measured the error. The work is in
`docs/precon/jeffersons-ferry-scope-comparison.md`.

Against trade cost, meaning the Autodesk original budget less Division 00 general
conditions and Division 98 insurance and fee, the ProEst conceptual budget came in 7.4
percent high. Against what was actually bought out it came in 19.0 percent high.

An earlier draft of this document claimed the two agreed within about 1 percent. That was
wrong. It compared a ProEst figure that excludes insurance, fee and contingency against an
Autodesk figure that includes insurance and fee, and the two errors happened to cancel.

### What no file contains

Not one of the ten files carries gross square feet, unit count, unit mix, stories above
grade, levels below grade, parking type or stall count, finish level, or labor basis.
Location survives only in a filename.

This is why two hours in a chat window produced nothing. Every rate the engine needs is a
quotient, and the denominator is not in the data.

## 2. Why not RAG, and why not a vector database

The question an estimator needs answered is this: what did we carry per square foot for
wood framing, on a four-story wood-frame market-rate building, in Suffolk, that bought out
in 2024, and how many jobs stand behind that number.

That is a filtered aggregate over structured fields, with a denominator, a date, and a
count. Similarity search retrieves passages that read like the question. It cannot divide
by gross square feet, cannot weight Autodesk actuals above ProEst budgets, cannot produce
a range, cannot count the jobs behind a number, and cannot cite provenance as a join.
Every one of those is a requirement in `rom-spec.md`.

Build a normalized cost database with a deterministic engine over it. That is already the
shape `rom-spec.md` chose. This document fills in the tables and says where the model
belongs.

### The three places a model earns its keep

1. **Mapping.** A free-text line description plus a source code becomes a canonical Kulka
   code. The model proposes, a human approves, and the decision is stored so the same
   line never gets asked twice. This is the cost-code problem `rom-spec.md` listed as
   blocked, and it is the one job here that is genuinely fuzzy text matching.
2. **Intake.** A developer's phone call becomes the ten tier-one fields. The model asks
   the follow-ups, and it records what the caller never said as an explicit assumption.
3. **Narrative.** The basis-of-estimate prose under each division. The engine hands over
   the numbers and the citations, and the model writes the paragraph from those alone.
   This is the "defend and substantiate" requirement. It never invents a figure.

Semantic search gets exactly one job: proposing the mapping in step one and finding
similar past scope lines. That is a pgvector column on the lines table in Supabase, not a
separate system.

## 3. Three axes, not two

`working-session-packet.md` framed presentation as CSI division against element, and asked
whether a cost code ever splits across two elements. The exports answer that: 03.00000
Concrete, 31.01050 Excavation And Fill, and 32.01600 Site Concrete each carry both
building and site work on the same job. So yes, codes split.

The Autodesk contract reports add an axis the packet did not anticipate. Kulka buys out by
package, and a package cuts across divisions. Jefferson's "Siding and Masonry" is one
subcontract with Evian appearing under Division 04 and Division 07. Fieldstone's "Site
Work" package with All Island Excavating spans earthwork, utilities, and paving.

That matters because of how an estimator checks a number. Asked whether a framing figure
is right, Jesse recalls what a sub signed, not what a division totalled. The package is
the unit of memory and the unit of defence.

So the system stores at a canonical work item and rolls up three ways:

| Axis | Who reads it | Where it comes from |
| --- | --- | --- |
| CSI division | estimators, subcontractors | ProEst, and Autodesk divisions |
| Element | developers | a Kulka-owned mapping |
| Buyout package | estimators defending a number | Autodesk contract reports |

### The canonical spine

None of the three sources can serve as the spine. ProEst codes are finest but drift
between jobs. Autodesk groups are coarser and do not subdivide cleanly into ProEst codes.
Packages cut across both.

So Kulka owns a list of canonical work items. Each ProEst code maps to exactly one. Each
Autodesk group maps to exactly one. Each contract package maps to one or more, carrying a
stated allocation when it maps to several. Divisions and elements both roll up from the
canonical item. The frozen list of 40 items lives in `canonical-work-items.md`, built from
the ProEst exports in `CostExports/` and approved by Matt on 2026-09-19.

## 4. Schema

Extending the five tables that exist.

**projects.** Gains the eleven fields from the packet: address and ZIP, gross square feet,
unit count, unit mix by bedroom count, stories above grade, levels below grade, site
conditions, structure type, parking type, finish level, labor basis, and buyout date.
Nothing in the exports fills these. A person does. Parking type is the field; stall count
is not collected, since no Kulka job has one recorded (LA-682).

**budget_documents.** New. One row per file: source system, project, stage (conceptual,
50% CD, buyout, final), export date, exported by, file hash, and a usability verdict with a
reason. This is what stops three Vue snapshots counting as three comparables, and what
records that Villa is weighted low.

**budget_lines.** New. Every line as imported, unedited: division text, code text,
description, parsed quantity, parsed unit, unit cost, total. Then the mapped canonical
item, the mapped element, the mapping confidence, and who approved it. Then a role flag.

The role flag has five values and it is the reason Villa cannot poison a benchmark:

| Role | Meaning |
| --- | --- |
| scope | Real work with a real quantity. Feeds unit-rate benchmarks. |
| lump | Real work priced as a lump sum. Feeds per-square-foot and per-unit benchmarks only. |
| allowance | A placeholder the estimator knew was a placeholder. |
| takeoff_helper | A conversion or measurement row, not work. Never feeds a benchmark. |
| duplicate | A stale line. Excluded from every total. |

**commitments.** New. One row per subcontract package from the Autodesk contract reports:
package name, supplier, status, original allocated budget, original commitment, approved
change orders, projected cost, actual cost to date, percent complete. This is the buyout
truth and the defensibility asset. A number backed by a named sub who signed a real
contract on a real job is the strongest thing the tool can say.

**markups.** New. Design contingency, budget contingency, general conditions, general
requirements, insurance, and fee, per document, as both percent and dollars. The ProEst
Summary sheet already carries these structured, so harvesting them costs nothing. Across
the six files, design contingency runs 3 to 5 percent, general conditions and requirements
7 to 8 percent or a lump sum, insurance 2.5 to 3.5 percent, and fee 3 to 4 percent. That
range is itself a benchmark, and today nobody can quote it.

Kulka's own bottom-up General Conditions staffing and field-office rates, per LA-688,
live at `docs/precon/kulka-gc-rate-card.md`: a weekly rate per staff role and a monthly or
lump-sum rate per field-office cost, sourced from one real job (117 N. Long Beach Rd,
estimate C-00379), a warehouse, not multifamily. This is the input Decision 14's
duration-driven General Conditions proposal actually needs, staffed weeks times a weekly
rate, not the top-down percent range above. The two don't blend into one number; the
percent range is a sanity check on the total, the rate card is what computes it.

**benchmarks.** As specified, with the denominator named on every row: dollars per gross
square foot, per unit, or a true unit rate where the line carried a quantity. Parking prices
on gross square feet like everything else rather than a per-stall figure; no Kulka job has
a stall count recorded (LA-682).

**benchmark_sources, runs, steps.** Unchanged.

## 5. Build sequence

1. **The project record and its intake form.** Nothing downstream works without
   denominators, and no export contains them. Jesse or Liam fills in eleven fields per past
   job, roughly fifteen minutes each. The same field list becomes the tier-one questions
   later, so the form gets built once.
2. **The importer.** Three shapes: ProEst unit-cost export, Autodesk budget report,
   Autodesk contract report. It writes to staging with the role flag defaulted and nothing
   approved. It survives every defect listed in section 1.
3. **The mapping layer.** Canonical list, model proposes, human approves, decisions stored
   and reused.
4. **The engine.** Only after one, two, and three. Its first job is to reproduce
   Jefferson's Ferry from its own fields and land near $8.07M.

## 6. What the working session still has to settle

Carried from the packet, plus what these files added.

- Confirm who poured the concrete deck and who placed the gypcrete on Jefferson's Ferry.
  That one answer swings the concrete verdict from 40 percent high to 43 percent low.
- Say what drawing set the Jefferson's Ferry ProEst budget was priced from. Without it,
  nobody can separate estimating error from design development in the 7.4 percent.
- Approve the canonical work-item list drafted from these ten files.
- Confirm the package axis belongs in the output, beside division and element.
- Rule on each inherited rule of thumb in the packet.
- Decide who approves a judgment rule, and whether one expires.
- Say which further ProEst jobs are accurate enough to use. Fieldstone has Autodesk data
  and no ProEst budget uploaded, which LA-606 already asks for.
