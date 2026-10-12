-- LA-2279: Kulka's Fireflies meetings (meetings@thekulkagroup.com), synced in
-- by the Fireflies webhook and a backfill so nobody needs to log in to
-- Fireflies. One row per Fireflies transcript, keyed by its Fireflies id so a
-- repeated webhook or backfill updates the same row. This migration adds no
-- records.
create table meetings (
  id uuid primary key default gen_random_uuid(),
  fireflies_id text not null unique check (length(trim(fireflies_id)) between 1 and 200),
  title text not null check (length(title) <= 500),
  started_at timestamptz not null,
  duration_minutes numeric check (duration_minutes >= 0),
  organizer_email text,
  -- [{ name, email }] as Fireflies lists the invitees.
  attendees jsonb not null default '[]'::jsonb,
  -- Fireflies' own summary: overview, action items, keywords, bullets.
  summary jsonb not null default '{}'::jsonb,
  transcript_url text check (transcript_url is null or transcript_url ~ '^https://'),
  -- [{ index, speaker, text, start, end }], the full transcript.
  sentences jsonb not null default '[]'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index meetings_started_at on meetings (started_at desc);
alter table meetings enable row level security;
-- Browser roles receive no policy. The authorized server owns access.
