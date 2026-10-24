-- LA-3048: one list of every place Kulka pulls data from, and one log of each
-- refresh run. Until now each source kept its own synced_at and nothing showed
-- when it ran, what it changed, or why it failed. lib/sources/runs.ts writes
-- the runs; lib/sources/health.ts reads them. Additive only: two new tables
-- and five reference rows naming the sources that exist today.
create table data_sources (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  name text not null check (length(trim(name)) between 1 and 120),
  kind text not null check (kind in ('scheduled', 'webhook', 'manual')),
  -- Who answers for the source. Left blank until Matt names each one.
  owner text check (length(owner) <= 200),
  -- How often a good run is expected. Null for a source run by hand, which is
  -- never late.
  refresh_interval interval check (refresh_interval > interval '0'),
  -- The cron expression, in UTC, for a scheduled source.
  schedule text check (length(schedule) <= 100),
  -- False when the schedule is turned off.
  enabled boolean not null default true,
  -- Only for a source that reads through a saved sign-in; null otherwise.
  connection_status text check (connection_status in ('connected', 'missing', 'expired')),
  created_at timestamptz not null default now()
);
alter table data_sources enable row level security;

create table source_runs (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references data_sources (key),
  trigger text not null check (trigger in ('schedule', 'button', 'webhook')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  -- Null while the run is still going.
  outcome text check (outcome in ('ok', 'failed', 'partial')),
  rows_added integer check (rows_added >= 0),
  rows_changed integer check (rows_changed >= 0),
  error text check (length(error) <= 4000),
  check ((outcome is null) = (finished_at is null))
);
create index source_runs_source_started on source_runs (source_key, started_at desc);
alter table source_runs enable row level security;
-- Browser roles receive no policy on either table. The authorized server owns access.

insert into data_sources (key, name, kind, owner, refresh_interval, schedule, enabled, connection_status) values
  ('autodesk_projects', 'Autodesk Projects', 'scheduled', null, interval '1 day', '0 10 * * *', true, null),
  ('autodesk_connection', 'Autodesk Connection', 'scheduled', null, interval '1 day', '0 10 * * *', true,
    case when exists (select 1 from autodesk_connections) then 'connected' else 'missing' end),
  ('fireflies_meetings', 'Fireflies Meetings', 'webhook', null, interval '1 day', '0 10 * * *', true, null),
  ('proest_imports', 'ProEst Imports', 'manual', null, null, null, true, null),
  ('vision_discovery', 'Vision Discovery', 'scheduled', null, interval '1 day', null, false, null);
