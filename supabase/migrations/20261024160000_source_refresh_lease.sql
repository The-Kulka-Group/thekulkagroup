-- LA-3049: one refresh schedule for every source. An hourly cron reads
-- data_sources and runs each enabled source whose refresh_interval has passed
-- since its last scheduled run, so the interval stays in the row and never in
-- code. These two columns hold the lease that keeps two runs of one source
-- from overlapping: lib/sources/schedule.ts claims the row with a conditional
-- update, which Postgres serializes across serverless instances, and clears
-- it when the run ends. A run that dies leaves a lease that lapses by itself.
-- Additive only.
alter table data_sources
  add column lease_token uuid,
  add column lease_until timestamptz,
  add check ((lease_token is null) = (lease_until is null));
