-- Vision records contain user-entered source context. This migration adds no records.
create table vision_opportunities (
  id uuid primary key default gen_random_uuid(),
  opportunity_number bigint generated always as identity unique,
  name text not null check (length(trim(name)) between 1 and 200),
  town text not null check (length(trim(town)) between 1 and 120),
  county text not null check (length(trim(county)) between 1 and 120),
  address text not null default '' check (length(address) <= 400),
  latitude double precision,
  longitude double precision,
  source_title text not null check (length(trim(source_title)) between 1 and 300),
  source_url text not null check (length(source_url) <= 2048 and source_url ~ '^https?://'),
  source_date date,
  notes text not null default '' check (length(notes) <= 10000),
  status text not null default 'open' check (status in ('open', 'working', 'stuck', 'done')),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((latitude is null and longitude is null) or
    (latitude is not null and longitude is not null and latitude between -90 and 90 and longitude between -180 and 180))
);
create index vision_opportunities_updated on vision_opportunities (updated_at desc, opportunity_number desc);
alter table vision_opportunities enable row level security;
-- Browser roles receive no policy. The existing authorized server owns access.
