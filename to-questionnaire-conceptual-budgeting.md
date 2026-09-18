# Kulka conceptual budgeting: what only estimating knows

**Purpose:** Kulka is building a tool that produces a conceptual budget from about ten
questions, using Kulka's own past numbers. The budgets we pulled out of ProEst and
Autodesk cannot be used until estimating answers the questions below. Several of them
decide whether a given past project enters the database at all.

**From:** Matt Nicosia

**To:** Jesse and Liam, Kulka estimating

**How your answers will be used:** they go into the database behind the tool, and into
the working session agenda. Every number the tool produces traces back to the job and
the person it came from, so your answers get recorded with your names on them.

## Context

A developer calls and says they want 100 units at a location, four storeys, some parking,
a rough mix of two and three bedrooms. Today somebody spends a day or more turning that
into a budget they can defend, and most of those calls never convert. The tool is meant to
give you a first pass in minutes: a budget by division, with a range on every line, a mark
saying how confident it is, and a plain list of what it assumed. You then correct it.

It does not read drawings and it does not do takeoff. Nobody is building that. It does not
replace an estimator, and no number leaves the building without one signing off.

It learns from what Kulka has already priced. We have six budgets out of ProEst and two
cost reports out of Autodesk. The arithmetic in all of them is sound, and every line adds
up to its total. Two things stop us using them. None of the files records how big the
building was, so there is nothing to divide a cost by. And several files have quirks that
only somebody who was there can explain.

## How to answer

Type under each question, after the `>`. Aim for an hour. If a question is framed on a
wrong assumption, say so rather than answering it as asked.

Partial answers are worth sending. Write "don't know" instead of skipping, because a blank
reads the same as an oversight and a guess recorded as fact is worse than either.

There is a spreadsheet with this, `Kulka-ROM-Data-Sheet.xlsx`. It holds the two things
that are grids rather than questions: eleven facts about each of five past jobs, and 67
inherited cost rules to mark Keep, Correct or Reject. The project data tab is the one that
unblocks everything else.

Please send both back before the working session on [DATE].

## The files we have

These come first because each one either unlocks or discards a specific project.

### Jefferson's Ferry was priced twice and the two budgets disagree. Which one better represents what a Kulka project actually costs?

_Why this matters: we have confirmed the ProEst budget and the Autodesk budget describe the
same building. ProEst carried $6,243,631 of trade cost. Autodesk holds five different
figures for that same scope: $5,814,859 at award, $5,248,578 once it was bought out,
$6,647,562 after owner changes, and $6,996,390 as the current forecast of final cost. So the
ProEst budget is 19 percent high against one of those and 11 percent low against another,
and the two are only 30 points apart._

_We are asking about the money, not the format. The tool has to aim at one of these numbers,
and a developer asking for a budget is asking what they will spend. Say which figure you
think a conceptual budget should be trying to hit, and why._

>


### Which of the three Vue budgets in Riverhead is the current one?

_Why this matters: they total $52.2M, $25.4M and $11.6M. The tool would otherwise count
one project as three, and weight it three times._

>

### What changed between those three Vue budgets?

>

### Are all three Vue budgets the same project?

_Why this matters: two of them say 426 W Main and one says 426 A Main._

>

### What scope does the Villa at Glen Cove's $250 per square foot cover?

_Why this matters: thirteen lines price perimeter times height, which is wall area rather
than floor area, at a flat $250. That is $50.2M of the $50.7M base. The rest of the file is
about $510,000 of lockers, mailboxes, sauna equipment and pavers. We have been told the
rate is deliberate. We need to know what it stands in for before the tool can reuse it, and
on what kind of building it holds._

>

### Is the West Shore Road export the whole budget for that job?

_Why this matters: it has 24 lines and no framing, no mechanical, no electrical and no
finishes. If the scope really is partial, the tool must never compare it against a whole
building._

>

### Are these two West Shore Road lines errors?

_Why this matters: "Sanitary Sewer Allowance, 1.00 ALLW" appears twice, once at $125 and
once at $125,000. Separately, "Drainage Allowance" is priced as 1.00 LF at $550,004.67. We
would rather you confirm than have us delete a real number._

>

## Cost codes and how work gets grouped

### Is there a house standard for cost codes in ProEst?

_Why this matters: across six files, demolition appears at 02.04113, at 02.00050 and at
31.00050. Elevators appear at 14.02000 on three jobs and 14.21001 on a fourth. Allowances
sit at 97.00000 on one job and 95.00000 on another. A standard that exists but is not
followed is a different problem from no standard._

>

### Where should light gauge metal framing sit, Division 06 or Division 09?

_Why this matters: Autodesk puts $1.1M of it in Division 09 Finishes. ProEst splits the
same work between Division 06 and code 09.02300. The tool has to translate between the two
systems and needs to know which way round is correct for Kulka._

>

### Does a single cost code ever hold both building work and site work?

_Why this matters: on these jobs 03.00000 Concrete, 31.01050 Excavation And Fill and
32.01600 Site Concrete each appear to carry both. A developer wants a budget split by
building against site. If one code spans both, that split becomes a judgment call on every
job instead of a lookup, which is expensive to build and expensive to keep right. One real
example settles this faster than an hour of discussion._

>

### When you sanity-check a budget number, do you think in divisions or in buyout packages?

_Why this matters: the Autodesk contract reports show Kulka buys out by package, and
packages cut across divisions. Evian's "Siding and Masonry" on Jefferson's Ferry lands in
Division 04 and Division 07. All Island's "Site Work" on Fieldstone spans earthwork,
utilities and paving. If what you remember is what a sub signed rather than what a division
totalled, the tool should show packages, and nobody has designed it that way yet._

>

## What the tool should ask

We think the tool needs eleven things: location, gross square feet, unit count and mix,
storeys above grade, levels below grade, site conditions, structure type, parking type and
stalls, finish level, labour basis, and buyout date.

### Which of those eleven can you not answer about a past job?

_Why this matters: a field the back catalogue cannot fill in is a field the tool cannot
calibrate against, however good the question sounds. Be blunt._

>

### Is unit mix knowable when a developer first calls?

_Why this matters: if not, the tool has to accept an average unit size and work back to a
mix._

>

### Is structure type known when a developer first calls?

_Why this matters: wood frame, podium over concrete, all concrete, light gauge and modular
are different buildings at the same square footage. If the answer is usually unknown, the
question has to move to a later tier._

>

### What is missing from those eleven?

_Why this matters: the list is deliberately short and you are the ones who know what it is
missing. Anything added costs something else its place, because the cap is around ten
questions._

>

## Markups, presentation, and trust

### What moves the markup percentages on a conceptual budget?

_Why this matters: across the six budgets, design contingency runs 3 to 5 percent, general
conditions and requirements 7 to 8 percent or a lump sum, insurance 2.5 to 3.5 percent, and
fee 3 to 4 percent. The tool can carry these, but only if it knows what moves them. Client,
delivery method, job size, how early the budget is, or something else._

>

### How do developers want a conceptual budget broken down?

_Why this matters: by CSI division matches how you work and how subs bid, but a developer
does not think in divisions. By element, meaning substructure, shell, interiors, services
and sitework, matches how a developer thinks and holds still when the design changes.
Storing both costs a mapping somebody has to maintain._

>

### What do developers push back on, and what do they ask you to prove?

>

### What would make you not trust a number this tool produced?

_Why this matters: name the thing that would make you close it and go back to doing it by
hand. That answer shapes the build more than any other question here._

>

## Anything else?

What did we not ask that we should have?

>
