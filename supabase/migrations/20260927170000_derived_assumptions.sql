-- Derived assumptions (LA-860). A quantity or spec choice Jev proposes from
-- facts a project already gives, shown on the ROM face as a correctable
-- assumption. Its own table, apart from the project's stated facts (the
-- projects columns) and from benchmark cost lines (benchmarks), so nothing
-- downstream mistakes one for another. Nothing here prices: the six trade
-- tickets decide whether and how a criterion moves a cost line.
--
-- One row per criterion per project. A fact change derives it again in place
-- (upsert on project_id and code), so the row keeps its id and its
-- corrections stay attached. The row holds Jev's value only; a correction
-- never overwrites it.
--
-- Judgment call: whether the criterion rests on an assumed fact is not a
-- column. It is read from `inputs` (any input whose basis is 'assumed'), so it
-- cannot be set by hand or drift from what the derivation used.
--
-- Judgment call: like scope_relationships and branch_gate_items, `cost_codes`
-- is not foreign-keyed to canonical_work_items, for the reason
-- 20260920140000_rom_spec_decisions_catchup.sql gives.
create table derived_assumptions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  code text not null check (btrim(code) <> ''),
  label text not null check (btrim(label) <> ''),
  -- {"kind":"quantity","amount":148,"unit":"Tons"} or {"kind":"spec","text":"NFPA 13R, Wet-Pipe"}.
  value jsonb not null check (
    jsonb_typeof(value) = 'object' and value ->> 'kind' in ('quantity', 'spec')
  ),
  method text not null check (btrim(method) <> ''),
  -- [{"name":"Climate Zone","value":"4A","basis":"assumed"}, ...]
  inputs jsonb not null check (jsonb_typeof(inputs) = 'array' and jsonb_array_length(inputs) > 0),
  -- [{"label":"Demand load","result":"235 kVA"}, ...], ending in the result.
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) > 0),
  confidence text not null check (confidence in ('high', 'low')),
  confidence_reason text not null check (btrim(confidence_reason) <> ''),
  cost_codes text[] not null default '{}',
  -- Which model derived it (such as 'jev-latest') and its raw choice
  -- confidence, kept for the record the way a benchmark keeps provenance.
  derived_by text not null check (btrim(derived_by) <> ''),
  jev_confidence numeric check (jev_confidence between 0 and 1),
  derived_at timestamptz not null default now(),

  unique (project_id, code)
);

-- The estimator's corrections, recorded the way a judgment rule's approval is:
-- by email and time, with the reason required. A revert keeps the row and
-- marks who reverted it and when, so the history stays whole and Undo can
-- restore it. At most one correction per criterion is live at a time.
create table derived_assumption_corrections (
  id uuid primary key default gen_random_uuid(),
  derived_assumption_id uuid not null references derived_assumptions (id) on delete cascade,
  value jsonb not null check (
    jsonb_typeof(value) = 'object' and value ->> 'kind' in ('quantity', 'spec')
  ),
  reason text not null check (btrim(reason) <> ''),
  corrected_by text not null check (btrim(corrected_by) <> ''),
  corrected_at timestamptz not null default now(),
  reverted_by text,
  reverted_at timestamptz,

  check ((reverted_by is null) = (reverted_at is null))
);

create unique index derived_assumption_corrections_one_live_idx
  on derived_assumption_corrections (derived_assumption_id)
  where reverted_at is null;

alter table derived_assumptions enable row level security;
alter table derived_assumption_corrections enable row level security;
