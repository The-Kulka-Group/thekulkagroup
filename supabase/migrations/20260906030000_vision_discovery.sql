create table vision_discovery_sources (
  id text primary key,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  record_count integer not null default 0,
  lease_token uuid,
  lease_until timestamptz
);
create table vision_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references vision_discovery_sources(id),
  external_id text not null,
  snapshot jsonb not null,
  revision integer not null default 1 check (revision > 0),
  review_state text not null default 'new' check (review_state in ('new','dismissed','accepted')),
  opportunity_id uuid unique references vision_opportunities(id) deferrable initially deferred,
  first_seen_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  changed_at timestamptz not null default clock_timestamp(),
  unique(source_id,external_id),
  check ((review_state = 'accepted') = (opportunity_id is not null))
);
create table vision_discovery_history (
  candidate_id uuid not null references vision_discovery_candidates(id),
  revision integer not null,
  snapshot jsonb not null,
  captured_at timestamptz not null default clock_timestamp(),
  primary key(candidate_id,revision)
);
alter table vision_discovery_sources enable row level security;
alter table vision_discovery_candidates enable row level security;
alter table vision_discovery_history enable row level security;
