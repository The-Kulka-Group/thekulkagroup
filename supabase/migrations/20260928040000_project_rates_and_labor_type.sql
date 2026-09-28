-- LA-1245. Matt, 2026-09-28: a rate the model suggests takes the project's
-- location and labor type into account, so it prices that project only.
--
-- Labor Type: Union, Open Shop or Prevailing Wage, the three Matt named.
-- Nullable, since every project before this has none.
alter table projects
  add column labor_type text check (labor_type in ('union', 'open_shop', 'prevailing_wage'));

-- A rate for one project. Every benchmark is shared by every project of its
-- type and construction kind; this is the first rate that is not. A run on
-- the project prices the cost code from this row in place of any shared
-- benchmark for it. Nothing here is ever the model's number alone: LA-9's
-- "a model's figure never solely determines a line" means the estimator
-- accepts or changes the suggestion, so the row is a reviewed judgment, and
-- `model_proposal` keeps what the model said (its figure, range, reasoning
-- and model id) beside what was saved.
create table project_rates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id),
  cost_code text not null check (btrim(cost_code) <> ''),
  label text not null check (btrim(label) <> ''),
  unit text not null check (
    unit in ('usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure', 'usd_each_structure', 'usd_per_stop')
  ),
  value numeric not null check (value > 0),
  scope_side text not null default 'building' check (scope_side in ('building', 'site')),
  contract_side text not null default 'kulka' check (contract_side in ('kulka', 'owner')),
  provenance_kind text not null check (provenance_kind = 'reviewed_judgment'),
  provenance_note text not null check (btrim(provenance_note) <> ''),
  recorded_by text not null check (btrim(recorded_by) <> ''),
  recorded_at date not null,
  model_proposal jsonb,
  created_at timestamptz not null default now(),
  unique (project_id, cost_code)
);

alter table project_rates enable row level security;
