alter table vision_discovery_sources
  add column last_outcome text
  check (last_outcome in ('completed', 'completed_empty', 'skipped', 'blocked', 'failed'));

create table vision_discovery_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references vision_discovery_sources(id),
  started_at timestamptz not null,
  completed_at timestamptz not null default clock_timestamp(),
  duration_ms integer not null check (duration_ms >= 0),
  outcome text not null check (outcome in ('completed', 'completed_empty', 'skipped', 'blocked', 'failed')),
  coverage jsonb,
  coverage_start_date date,
  coverage_end_date date,
  fetched_count integer not null default 0 check (fetched_count >= 0),
  inserted_count integer not null default 0 check (inserted_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  unchanged_count integer not null default 0 check (unchanged_count >= 0),
  rejected_count integer not null default 0 check (rejected_count >= 0),
  error_summary text check (error_summary is null or length(error_summary) <= 500),
  check (coverage_start_date is null or coverage_end_date is null or coverage_start_date <= coverage_end_date),
  check ((outcome = 'failed') = (error_summary is not null))
);

create index vision_discovery_runs_source_started_idx
  on vision_discovery_runs (source_id, started_at desc);

alter table vision_discovery_runs enable row level security;

create function reject_vision_discovery_run_changes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Vision discovery runs are immutable';
end;
$$;

create trigger vision_discovery_runs_immutable
before update or delete on vision_discovery_runs
for each row execute function reject_vision_discovery_run_changes();
