# Issue tracker

Issues for this repo live in Linear, not GitHub Issues and not local markdown.

## Where

- Workspace: [BLDG Labs](https://linear.app/bldg-labs)
- Team: BLDG LABS (key `LA`, id `f26ab8ca-5fcd-4c98-89e7-9e2bdd2ba0bd`)
- Project: Kulka (id `a1130f4f-a8aa-4511-a0d5-7de6f38c6019`)
- Board: [BLDG LABS All issues](https://linear.app/bldg-labs/team/LA/all)

Never create a second Linear team. Products are projects on BLDG LABS.

## Workflow

Use the Linear MCP (`https://mcp.linear.app/mcp`). Do not use `gh issue`. Do not write tickets under `.scratch/`.

Create with team `BLDG LABS` or `LA`, project `Kulka`.

- `parentId`: the spec or wayfinder-map issue when this ticket is a child
- `blockedBy`: Linear identifiers of tickets that must finish first
- **Queue:** Captured work. Nothing starts from here.
- **Ready:** Approved work with no unresolved blocker.
- **Working:** A named agent or human is doing the work now.
- **Review:** The pull request or other proof is ready for Matt.
- **Blocked:** Work cannot continue. A comment must name the blocker and the next action.
- **Done:** The pull request merged or Matt closed the work.

The Agent field is the trigger. A Ready issue does not start until Matt delegates it to
Codex, Claude, or another named agent. Matt stays assigned and owns the outcome. The
`ready-for-agent` label is retired and does not trigger work.

When an agent starts, it moves the issue to Working. It moves the issue to Review when
proof is ready. It does not move an issue to Done before the pull request merges.

## Labels

Type (pick one): `Bug`, `Feature`, `Improvement`

Triage: `ready-for-human`, `needs-triage`, `needs-info`, `wontfix`

Wayfinder (decision tickets only, never a product slice): `wayfinder:map`, `wayfinder:grilling`, `wayfinder:prototype`, `wayfinder:research`, `wayfinder:task`

`/to-tickets` creates child issues in Queue. Matt moves an approved, unblocked child to
Ready and delegates it through the Agent field.

## Build chain

1. `/grill-me` or `/grill-with-docs` (one session) or `/wayfinder` (many sessions)
2. `/to-spec`
3. `/to-tickets` (publishes children here)
4. Matt moves one approved child to Ready and sets its Agent field.
5. `/implement` (implement-spec if the user asks for parallel worktrees). Default for Kulka: one ticket, one window, `/clear` between.

Do not implement from a wayfinder map. Map tickets are questions. Spec plus `/to-tickets` is the build plan.

## Rules

- One issue is one job.
- Work only on a Ready issue delegated to you. Do not implement a parent spec, an issue
  with `needs-info` or `ready-for-human`, or an issue with an unresolved blocker.
- Read `AGENTS.md` before changing code and preserve unrelated working-tree changes.
- Run the checks suited to the change and attach proof to the Linear issue.
- Put `Fixes LA-123` in the pull request body, using the issue identifier.
- Never claim or imply AI reads construction drawings or performs takeoffs.
- Nothing sends, posts, spends, or deletes unless Matt says so.
