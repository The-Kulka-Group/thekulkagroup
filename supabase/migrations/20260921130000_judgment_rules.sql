-- Judgment rules as data (LA-19). An estimator states a rule, such as what a
-- basement level is worth on earthwork on this kind of job. The rule is
-- entered with the person who stated it and the date they stated it, sits
-- staged for review, and only adjusts a ROM line once someone approves it.
-- Vocabulary is CONTEXT.md: "Provenance", "Benchmark", and "Admin permission"
-- are used exactly as defined there.
--
-- This migration ships the mechanism and no rules. Every judgment rule is a
-- cost figure a person at Kulka has to state; nothing here may seed one, and
-- no example value belongs in this file or in any seed built from it.
--
-- Judgment call: a rule is a signal in the blend, not an override. It carries
-- an adjustment in dollars per gross square foot, and the engine
-- (packages/engine/src/rom.ts) moves the line by the judgment weight's share
-- of that line's total weight. The weight itself is the existing
-- `weight.reviewed_judgment` parameter from 20260921120000_engine_parameters
-- .sql, not a second number invented here, which is what makes actuals
-- outweigh a rule covering the same cost code and outweigh it further as more
-- actuals arrive.
--
-- Judgment call: who may approve a rule is Devin and Rob's open decision, and
-- CONTEXT.md ties it to the admin permission rather than to a named person.
-- That permission does not exist in code yet (LA-722), so approval here works
-- like any other gate approval: any signed-in, allowlisted user, recorded by
-- email and time, the same shape `cost_imports` already uses. The column set
-- does not change when the permission lands.
create table judgment_rules (
  id uuid primary key default gen_random_uuid(),

  -- Same join key the ingestion gate already uses: a canonical work item's
  -- own item number. Not foreign-keyed, for the reason
  -- 20260920140000_rom_spec_decisions_catchup.sql states about
  -- `benchmarks.cost_code`.
  cost_code text not null check (btrim(cost_code) <> ''),
  label text not null check (btrim(label) <> ''),

  project_type text not null check (project_type in ('multifamily', 'self_storage')),
  construction_kind text not null check (construction_kind in ('new', 'renovation')),

  -- The project fact the rule turns on, such as whether the job has a
  -- basement level, and the value that fact has to hold. Both null means the
  -- rule applies to every project of this type and kind.
  condition_fact text check (condition_fact is null or btrim(condition_fact) <> ''),
  condition_value text check (condition_value is null or btrim(condition_value) <> ''),
  check ((condition_fact is null) = (condition_value is null)),

  -- What the rule adds to the line's rate, or takes off it when negative. A
  -- rule worth nothing is not a rule, so zero is refused.
  adjustment_usd_per_gsf numeric not null check (adjustment_usd_per_gsf <> 0),

  -- Provenance, in the two parts CONTEXT.md requires of a reviewed judgment:
  -- whose judgment, and when. `reason` is the third thing ADR 0005 asks for
  -- on any number set by judgment: a bare figure with no stated reason is
  -- refused.
  stated_by text not null check (btrim(stated_by) <> ''),
  stated_on date not null,
  reason text not null check (btrim(reason) <> ''),

  -- 'staged': entered, visible, and affecting nothing.
  -- 'approved': adjusting the lines it applies to.
  -- 'retired': approved once, taken back out of the blend. Kept rather than
  --   deleted, because a past run record cites the rule it used.
  status text not null default 'staged' check (status in ('staged', 'approved', 'retired')),
  approved_by text,
  approved_at timestamptz,
  check ((status = 'staged') = (approved_by is null and approved_at is null)),

  created_at timestamptz not null default now()
);

create index judgment_rules_approved_idx
  on judgment_rules (project_type, construction_kind, cost_code)
  where status = 'approved';

-- Row level security, on with no policies, same rule as every other table in
-- this schema: server code reaches it over a direct Postgres connection as
-- owner, which bypasses row level security, so the app keeps working; this
-- only locks the anon-key door.
alter table judgment_rules enable row level security;
