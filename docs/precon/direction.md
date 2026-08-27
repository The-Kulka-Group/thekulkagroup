# Kulka conceptual budgeting: direction and decisions

Recorded 2026-08-26 from a working call with Rob, Devin, and Matthew.
Transcript: https://notes.granola.ai/t/0b7664cc-c539-403c-8567-fbc793faed28

## What changed

Kulka's pipeline is full, so business development is off the list for now. The first
build is conceptual budgeting for the estimating department. It frees estimator time that is
currently spent on work that rarely converts.

This moves ahead of the CRM work recorded in earlier notes. See
`docs/precon/rom-spec.md` for the build spec.

## The three constraints Devin named

1. Estimating efficiency.
2. Hiring. There are not enough people for the current project volume.
3. Underwriting development deals.

Conceptual budgeting is the agreed starting point because it attacks the first one
directly and needs no new headcount.

## Why the earlier attempt failed

Devin spent about two hours trying to do this in Claude with raw file uploads. The
data needs a real database behind it. Uploading cost reports into a chat does not
give the model anything it can reason across.

## System shape

Rob wants a modular system with a homepage dashboard, one world per department.
Conceptual budgeting is the first estimating module. Project
management follows later.

Matthew drew the distinction between a dashboard, which pulls data in so you can
look at it, and an operating center, where the data lives. That choice does not have
to be made now. It only matters if the goal is to run every job inside the system
from day one. The agreed approach is to build from real work rather than to build
toward a dashboard view.

### Controlled goalposts

Staff use AI inside the system, not in a freeform chat window. Two reasons:

- Project managers otherwise produce inconsistent output from the same inputs.
- Data ingestion needs an approval gate. Employees should not feed the model directly.

## Platform

Devin uses ChatGPT daily and Claude for the harder work, meaning underwriting and
property research. Rob uses ChatGPT only and values the memory it carries across his
personal and project history. Matthew's read is that Claude was clearly ahead a month
ago and ChatGPT has largely caught up.

No strong preference either way. Claude Projects gives org-wide shared context and
ChatGPT Enterprise has something similar. Matthew is confirming which one shares
project context across an org better before anyone commits.

The plan is to develop and test natively in Claude or ChatGPT, then put a real
interface on top once the workflow holds up.

## Data strategy

Multifamily first. It is the highest volume and it matches the pipeline. The meeting
named the Manor project as needing a budget, but Matt later pulled it from the plan:
the tool will not exist in time for it. Self-storage has less data behind it but
repeats well, so it comes second.

Two sources to combine:

| Source | Holds | Owner |
| --- | --- | --- |
| Autodesk Cost | actual job costs after buyout | accountant exports |
| ProEst | conceptual budgets | estimating team |

Actual job costs carry far more weight than ProEst conceptual budgets. Devin put the gap at
five to one. The LLM is a supporting signal only and is weighted low against Kulka's
own numbers.

### Known data problems

- Projects vary a lot: existing building tie-ins, modular, below-grade parking, SOE,
  site work.
- Cost codes are not consistent from budget through buyout, so ProEst and Autodesk
  will not map cleanly to each other.
- Some projects are incomplete. Fieldstone sits at roughly 56 percent. Those are
  still usable if they carry a flag.

Rob's framework for handling this: define the minimum required fields per project
type first, then work backward to the questions the tool has to ask. The first
dividing line to set is new construction against renovation.

## Website and lead funnel

Matthew suggested putting the ROM tool on the Kulka website as a funnel for
developer leads. Devin raised three objections: liability if the output is wrong on a
job over $100M, competitors using it for free, and clients questioning conceptual-budgeting fees
once they see AI doing the work. Rob's call is to build the tool first and decide on
outside use later. Devin's preferred framing is to market AI as part of the process
without exposing the tool itself.

## Meeting intelligence

Devin's stated pain is not knowing what happened in meetings he was not on, then
getting blindsided. The recommendation is one Zoom account per staff member with the
Fireflies note-taker invited to every meeting. Transcripts then flow on their own and
nobody has to create an email address per project. Rob asked whether this scales to
100 project managers rather than 4, and per-person accounts answer that. Minutes get
written by the bot, so no staff time goes to them.

## From Matthew's OS demo

Shown as reference for what the finished shape looks like:

- Procore API pulls all project data into the OS.
- Signing a subcontract creates the purchase order. A client requisition creates the
  receivable.
- Fireflies transcripts get assigned to projects automatically and action items go to
  the attendees who own them. A Slack alert fires when negative sentiment on a call
  passes 30 percent.
- Daily reports update the schedule live, so nobody updates a schedule by hand.
- An HR module holds DiSC profiles, team playbooks for conflict, and communication
  profiles for clients and architects.
- A support chatbot is in progress. A cross-project vector database is a later phase.

## Next steps

| What | Who |
| --- | --- |
| Export multifamily actual costs from Autodesk Cost. Accountant sends the cost reports straight to Matthew. | Devin |
| Confirm ProEst data quality with Jesse and Liam, and say which multifamily jobs are usable. | Rob |
| Confirm which platform shares project context org-wide, Claude or ChatGPT. | Matthew |
| Working session with Jesse and Liam on estimating data. Rob, Devin, and Matthew join. Target Monday 1 September at 3:00 PM. | all |

The date needs checking. 1 September 2026 is a Tuesday, so either the day or the
date in the notes is wrong.
