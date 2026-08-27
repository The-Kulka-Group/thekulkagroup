# Issue tracker

Issues for this repo live in Linear, not GitHub Issues and not local markdown.

## Where

- Workspace: [BLDG Labs](https://linear.app/bldg-labs)
- Team: BLDG LABS (key `LA`, id `f26ab8ca-5fcd-4c98-89e7-9e2bdd2ba0bd`)
- Project: Kulka (id `a1130f4f-a8aa-4511-a0d5-7de6f38c6019`)
- Board: [BLDG LABS Active](https://linear.app/bldg-labs/team/LA/active)

Never create a second Linear team. Products are projects on BLDG LABS.

## How to create and update issues

Use the Linear MCP (`https://mcp.linear.app/mcp`). Do not use `gh issue`. Do not write tickets under `.scratch/`.

Create with team `BLDG LABS` or `LA`, project `Kulka`.

- `parentId`: the spec or wayfinder-map issue when this ticket is a child
- `blockedBy`: Linear identifiers of tickets that must finish first
- New build tickets: state Todo, label `ready-for-agent`
- Agent claims it: In Progress
- PR is up: In Review
- Merged: Done (or rely on `Fixes LA-123` in the PR body)

## Labels

Type (pick one): `Bug`, `Feature`, `Improvement`

Triage: `ready-for-agent`, `ready-for-human`, `needs-triage`, `needs-info`, `wontfix`

Wayfinder (decision tickets only, never a product slice): `wayfinder:map`, `wayfinder:grilling`, `wayfinder:prototype`, `wayfinder:research`, `wayfinder:task`

`/to-tickets` applies `ready-for-agent` unless told otherwise.

## Build chain

1. `/grill-me` or `/grill-with-docs` (one session) or `/wayfinder` (many sessions)
2. `/to-spec`
3. `/to-tickets` (publishes children here)
4. `/implement` (implement-spec if the user asks for parallel worktrees). Default for Kulka: one ticket, one window, `/clear` between.

Do not implement from a wayfinder map. Map tickets are questions. Spec plus `/to-tickets` is the build plan.

## Rules

- One issue is one job.
- Never claim or imply AI reads construction drawings or performs takeoffs.
- Nothing sends, posts, spends, or deletes unless Matt says so.
