# Costs are organized by MasterFormat division, with a Kulka 90 series for markups

Every cost is filed under a MasterFormat 2020 division at level one, and under a
Kulka-authored work item below that. MasterFormat 2020 is the current edition and CSI
states it replaces all previous ones.

Divisions were chosen because ProEst and Autodesk already agree with MasterFormat on 22 of
them. All the drift between the two systems lives below division level, so the division is
the one layer that is already free, already standard, and already what a developer and an
architect read.

The work item below it is shaped by how Kulka actually buys work, which is what Autodesk
budget groups approximate. That grain was chosen over ProEst's finer codes for one reason:
actuals and commitments only exist at Autodesk's grain, so a finer spine would create
benchmark slots that the highest-weight data source can never fill. The second benefit is
that a ROM issued in this structure, a contract schedule of values, and a cost report all
speak one language, so every future job produces a budget-to-actual comparison with no
mapping exercise.

Autodesk does not supply that work-item list. Its group numbers mean different things on
different jobs: 0201 is Demolition on Jefferson's Ferry and Site Work on Fieldstone, 0401
is Masonry on one and Gypcrete on the other. Kulka authors the list once and freezes it,
and new Autodesk projects pick from it.

## The 90 series

Contingencies, general conditions, fee, insurance and bonds are filed at 90, which is
outside MasterFormat. MasterFormat runs 00 to 49 and has no home for money that is not
work. ProEst independently invented divisions 95 and 97 for this and Autodesk independently
invented 98 and 99, which is evidence enough that the slot is needed.

| Code | Item |
| --- | --- |
| 90 10 00 | Contingency: design, construction, budget |
| 90 20 00 | General Conditions |
| 90 30 00 | Fee |
| 90 40 00 | Insurance |
| 90 50 00 | Bonds |

The order is the waterfall order. Each item computes on the running total of everything
above it, so fee lands on the cost of work while insurance and bonds are rated on a
contract value that includes the fee, which is how carriers and sureties price them. This
differs from the order in Kulka's own ProEst budgets, which place insurance before fee.
Totals are unaffected, because cascading percentages commute. Line amounts are not: on a
job the size of The Vue the stated fee falls by about $49,000 and insurance rises by the
same amount.

## Consequences

Each 90-series item carries a basis, not just a rate, because the waterfall is a convention
rather than a rule. The Villa at Glen Cove budget computes its CM fee on base cost alone
rather than on the running total, and hardcoding the cascade would have mispriced it by
about $250,000.

Allowances do not belong in the 90 series, although ProEst files them at 95 and 97. An
allowance is scope priced as a placeholder, so it goes to its own division with the line
role set to allowance, per ADR 0003. Filing it at 90 would hide real scope below the trade
subtotal.

Three things Autodesk does break the MasterFormat view and need fixing when the template is
frozen. It has no Division 31 or 33, collapsing earthwork and utilities into 32. It uses
Division 28 for fire alarm alone, when 28 is Electronic Safety and Security. And it files
general conditions at Division 00, which MasterFormat reserves for procurement and
contracting.

## General Conditions against General Requirements

They are two different things and they live in two different places. General Requirements
goes to MasterFormat Division 01, which is what that division is for: temporary facilities,
safety, cleanup, testing and closeout. General Conditions goes to 90 20 00, because
supervision and site overhead are Kulka's cost of running the job rather than work bought
for the building.

So trade cost runs from Division 01 to Division 33 and includes General Requirements, and
every 90-series item computes on top of it.

Both source systems file the two combined at Division 00, which is wrong for both halves.
Division 00 is procurement and contracting requirements.

### The import problem this creates

Six budgets file this three different ways. Four carry a single combined "General Conditions
& General Requirements" line at between 8.4 and 17.1 percent of trade cost. The Villa at
Glen Cove splits them, $3,993,224 against $1,334,605. The Vue at 426 A Main carries General
Conditions alone at 7.2 percent with no General Requirements line at all.

A combined line cannot be divided from the file. It imports whole to 90 20 00, flagged as
containing an unknown amount of General Requirements, and Division 01 records zero. That
makes trade cost on those four budgets understate a comparable figure from a split budget by
something like 2 to 4 percent, which is enough to matter to a benchmark and not enough to
notice.

Villa's 75/25 split is one job and must not become a default ratio. Estimating has to say
how a combined figure typically divides, which is a question for the questionnaire.
