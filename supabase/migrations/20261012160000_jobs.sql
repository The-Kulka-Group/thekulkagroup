-- LA-2283: Kulka's Autodesk Construction Cloud project list, so each Fireflies
-- meeting can be matched to its job (LA-2281). One row per ACC project, keyed
-- by its Autodesk id; a sync updates rows in place and never deletes one. A
-- project archived in ACC stays here with that status. This migration adds no
-- records.
create table jobs (
  id uuid primary key default gen_random_uuid(),
  autodesk_id text not null unique check (length(trim(autodesk_id)) between 1 and 100),
  name text not null check (length(name) <= 500),
  -- Kulka's own number, such as C00456.
  job_number text,
  -- active, pending, archived or suspended, as ACC reports it.
  status text,
  project_type text,
  platform text,
  city text,
  state_or_province text,
  start_date date,
  end_date date,
  autodesk_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index jobs_job_number on jobs (job_number);
alter table jobs enable row level security;
-- Browser roles receive no policy. The authorized server owns access.
