-- The minimal ROM schema for the walking skeleton (LA-12): the projects a ROM
-- is built for, the benchmarks it reads, and the run record every execution
-- writes. Vocabulary is CONTEXT.md.
--
-- Cost-code detail and the mapping from Autodesk Cost and ProEst wait on
-- Devin's export and Rob's verdict, so cost_code is a bare text column here
-- rather than a table. LA-15 brings the ingestion gate that fills it.

create table projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Multifamily first, self-storage second. New construction and renovation are
  -- the first dividing line and are never blended (LA-9).
  project_type text not null check (project_type in ('multifamily', 'self_storage')),
  construction_kind text not null check (construction_kind in ('new', 'renovation')),
  gross_square_feet integer check (gross_square_feet > 0),
  -- A job still in progress contributes if it says so. Fieldstone sits near 56
  -- percent and is usable flagged.
  percent_complete numeric check (percent_complete >= 0 and percent_complete <= 100),
  created_at timestamptz not null default now()
);

create table benchmarks (
  id uuid primary key default gen_random_uuid(),
  cost_code text not null,
  label text not null,
  unit text not null check (unit in ('usd_per_gsf')),
  value numeric not null check (value > 0),
  project_type text not null check (project_type in ('multifamily', 'self_storage')),
  construction_kind text not null check (construction_kind in ('new', 'renovation')),
  -- How many comparables stand behind the value. Drives the confidence flag.
  comparable_count integer not null default 0 check (comparable_count >= 0),

  -- Provenance. LA-9 makes this a schema-level hard requirement: every number
  -- traces to an export or a named reviewed judgment, with a date. Source
  -- projects live in the foreign-keyed join table below.
  provenance_kind text not null check (
    provenance_kind in ('actuals', 'proest_budget', 'reviewed_judgment')
  ),
  provenance_export_label text,
  provenance_recorded_by text not null check (btrim(provenance_recorded_by) <> ''),
  provenance_recorded_at date not null,

  check (
    provenance_kind = 'reviewed_judgment'
    or nullif(btrim(provenance_export_label), '') is not null
  ),

  created_at timestamptz not null default now()
);

-- A benchmark can blend more than one past project. Keeping the links as rows,
-- rather than an unchecked UUID array, prevents provenance from naming a
-- project that does not exist.
create table benchmark_source_projects (
  benchmark_id uuid not null references benchmarks (id) on delete cascade,
  project_id uuid not null references projects (id) on delete restrict,
  primary key (benchmark_id, project_id)
);

create index benchmark_source_projects_project_idx
  on benchmark_source_projects (project_id, benchmark_id);

create index benchmarks_selection_idx
  on benchmarks (project_type, construction_kind, cost_code);

-- Every execution writes one of these. It is both the live progress view and
-- the audit trail, so a past ROM can be reconstructed and questioned.
create table runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete cascade,
  -- Which workflow ran. One skill exists today; the column keeps runs honest
  -- when a second arrives.
  skill text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  -- Null until the run has worked out what it is budgeting. A run that dies
  -- before then says so rather than claiming it had no answers.
  answers jsonb,
  rom jsonb,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create index runs_project_idx on runs (project_id, started_at desc);

-- Steps are rows rather than a JSON blob on the run, so the live run view (LA-16)
-- can append and read one step at a time instead of rewriting a document.
create table run_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  seq integer not null,
  name text not null,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  detail jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (run_id, seq)
);

create index run_steps_run_idx on run_steps (run_id, seq);

-- Row level security, on with no policies, which denies everyone.
--
-- Supabase exposes the public schema through the anon key, so a table without
-- this is readable by anyone holding a key that ships to the browser. Kulka's
-- cost data must never be one of those tables. Auth is LA-13's job; locking the
-- door is this migration's, because the door is schema.
--
-- Server-side code reaches these tables over a direct Postgres connection as
-- the owner, which bypasses row level security, so the app keeps working.
alter table projects   enable row level security;
alter table benchmarks enable row level security;
alter table benchmark_source_projects enable row level security;
alter table runs       enable row level security;
alter table run_steps  enable row level security;
