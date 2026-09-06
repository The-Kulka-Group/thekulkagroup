# Saved opportunity workflow

Matt approved the single-screen prototype in LA-229. This spec covers the first
persistent slice, not every phase of the CRM plan.

## Problem Statement

A user should be able to choose what to pursue, connect a person, assign the next
action and record its result from one opportunity, without maintaining separate
company, task and activity screens.

## Solution

Add a saved workflow to existing Vision opportunity records. Preserve their IDs,
source context, notes and legacy review status. Show the commercial decision,
next action, people and activity together. Leave unknown details blank.

## User Stories

1. As a staff member, I can pursue or watch a record without a known contact.
2. As a staff member, I can pass while preserving history and closing open work.
3. As a staff member, I can assign an action to myself or an authorized colleague.
4. As a staff member, I can add or link a person in the opportunity screen.
5. As a staff member, I can record a result and its next action together.
6. As a staff member, I can close work as Won or Lost with a recorded result.
7. As a staff member, I must supply award evidence before recording Won.
8. As a staff member, I can identify policy context and watch it without pursuing
   or recording it as a won construction opportunity.
9. As a staff member, I can reload and retain the workflow and activity.
10. As a staff member, I see an edit conflict instead of overwriting another edit.
11. As a staff member, I can find missing next actions and overdue work in the list.
12. As a temporary visitor, I cannot read private people, actions or activity.

## Implementation Decisions

Use a separate server-owned workflow store linked to the existing opportunity.
Keep new private data out of existing temporary-access serializers. Authenticated
non-temporary users in the existing Kulka allowlist share this workspace. Do not
change the production access policy or add a tenant system in this slice.

Use Needs a decision, Watching, Pursuing, Passed, Won and Lost as stored decisions.
Won/Lost/Passed are closed outcomes. Review status remains legacy data and is not
mapped into commercial status. Classify a record as opportunity or policy context;
policy cannot be pursued or won/lost. Existing records default to opportunity
pending review; classification is not inferred from an unreliable name match.

Keep exactly one open next action. Results atomically record activity, complete
that action, and optionally create its replacement. Closing work closes its open
action. Activity records the authenticated actor and server time. Use revision
checks and transactions or a single atomic SQL statement for writes.

Use authenticated identity for the acting person and validate assignees against
the configured staff allowlist. A person can be linked from existing contacts or
created inline with name, optional company and role. Names do not prove company
ownership or a prior business relationship. Do not overwrite legacy notes.

Due dates are calendar dates in America/New_York. Missing dates remain null.
No actions, contacts or outcomes from the prototype become real records.

## Testing Decisions

Use the existing API-route and PGlite seam to test the full write/read lifecycle,
identity validation, revision conflicts, atomic result replacement, policy rules,
invalid dates, closure, contact linking and private access. Run existing Vision
regressions. Inspect the real app over its existing HTTP preview; this is new
application code, not an alternate route to the blocked standalone HTML file.

## Out of Scope

Production deployment or migration, outbound messages, new collectors, automatic
identity matching, imports, briefs, forecasting and separate company dashboards.

## Further Notes

The throwaway prototype remains on its own branch. The user approved the workflow;
that is not evidence that the blocked prototype had browser or mobile validation.
