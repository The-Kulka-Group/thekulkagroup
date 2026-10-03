-- LA-1502. Two things the budget drill-down (LA-1479 frames, scored 92 by Matt
-- on 2026-10-02) needs from the database. The other model fields LA-1502 adds
-- (a line's inputs, its quantity, a comparable's unit, its owner items) are
-- worked out from data the run already reads, so they need no schema.
--
-- 1. block_classification.ledger_division: the division the budget's By
--    Division view files an item under, where Matt placed it apart from its
--    own trade division. `division` keeps the trade division, which the
--    internal By Division view and the buyout package still read.
--
-- 2. line_scope_entries: each line's Inclusions and Exclusions. AI or a
--    person drafts an entry and the estimator approves it (Matt, 2026-10-02,
--    LA-1479 answer 6). Nothing reaches the client unapproved: the published
--    snapshot copies approved entries only (lib/rom/published-snapshot.ts).
--    Drafting, editing and approving them is LA-1503. This migration seeds no
--    entries.
--
-- Judgment call: the ledger divisions below are data, not schema. They are
-- Matt's own placements of 2026-10-02, stated in LA-1479 and LA-1502, the
-- same footing as the classification rows 20260927160000 and 20260928060000
-- seeded from his statements. Nothing here invents a placement.
--
-- Judgment call: Elevator Bulkhead (26a) moves under 14 with the elevator's
-- supporting items. It is in the Elevator element but is not a supporting
-- item, and the frames Matt passed file it under 14 Conveying Equipment
-- ("2 priced, 7 no rate"). PR review is where he can say otherwise.

alter table block_classification
  add column ledger_division text check (ledger_division is null or ledger_division ~ '^[0-9]{2}$');

-- Matt, 2026-10-02 (LA-1479 answer 4): the utility disconnects live in Site
-- Work, so By Division files them under 33 Utilities with 36a, which is
-- already 33. Their trade division and buyout package do not change.
update block_classification
   set ledger_division = '33',
       reason = reason || ' Matt, 2026-10-02 (LA-1479, LA-1502): By Division files it under 33 Utilities with the other utility disconnects.'
 where cost_code in ('28a', '28b', '31f');

-- Matt, 2026-10-02 (LA-1502): the elevator's supporting items stay under 14
-- in By Division rather than scattering across their own trades. 26b is
-- already 14, so it needs no placement.
update block_classification
   set ledger_division = '14',
       reason = reason || ' Matt, 2026-10-02 (LA-1502): By Division files it under 14 Conveying Equipment with the elevator.'
 where cost_code in ('26a', '26c', '26d', '26e', '26f', '26g', '26h', '26i');

create table line_scope_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  -- The line the entry belongs to, by the same bare cost code a run line
  -- carries. Not foreign-keyed, for the reason block_classification gives.
  cost_code text not null check (btrim(cost_code) <> ''),
  side text not null check (side in ('include', 'exclude')),
  -- The order the estimator wants the entries read in, within one side.
  position integer not null default 0 check (position >= 0),
  body text not null check (btrim(body) <> ''),
  -- Who drafted it: AI, at a person's request, or the person by hand. The
  -- client page never says which (render.test.ts's copy guard).
  drafter text not null check (drafter in ('ai', 'user')),
  drafted_by text not null check (btrim(drafted_by) <> ''),
  drafted_at timestamptz not null default now(),
  -- Null until the estimator approves it. Both or neither.
  approved_by text check (approved_by is null or btrim(approved_by) <> ''),
  approved_at timestamptz,
  check ((approved_by is null) = (approved_at is null)),
  created_at timestamptz not null default now()
);

create index line_scope_entries_project_idx on line_scope_entries (project_id, cost_code, side, position);

-- Row level security on with no policies, the same as every other table.
alter table line_scope_entries enable row level security;
