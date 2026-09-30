-- LA-1399 (spec LA-1394). Matt, 2026-09-29, answering LA-1394 question 1:
-- the proposed schedule comes from Kulka's completed jobs, with AI comparing a
-- new project to them and estimating each phase's weeks.
--
-- One row is one job Kulka finished: its size, stories and building type, and
-- the actual precon, construction and close-out durations. Each phase is
-- recorded as a start and end date or as weeks, never both, and whichever is
-- recorded must say where it came from (a schedule, a daily log, an owner's
-- certificate). A phase not known is left null and the job simply cannot
-- inform that phase.
--
-- This table ships EMPTY. No migration seeds a job, real or made up. Tests
-- insert synthetic jobs numbered TEST- inside their own process only.
--
-- building_type uses the same words as projects.project_type (multifamily,
-- self_storage), so the comparison can match them; it is left open so a job of
-- another type, such as a warehouse, can still be recorded.
create table completed_jobs (
  id uuid primary key default gen_random_uuid(),
  job_number text not null unique check (btrim(job_number) <> ''),
  name text not null check (btrim(name) <> ''),
  building_type text not null check (building_type ~ '^[a-z][a-z_]*$'),
  construction_kind text not null check (construction_kind in ('new', 'renovation')),
  gross_square_feet numeric not null check (gross_square_feet > 0),
  stories_above_grade integer check (stories_above_grade > 0),
  precon_start date,
  precon_end date,
  precon_weeks numeric check (precon_weeks >= 0),
  precon_source text,
  construction_start date,
  construction_end date,
  construction_weeks numeric check (construction_weeks >= 0),
  construction_source text,
  closeout_start date,
  closeout_end date,
  closeout_weeks numeric check (closeout_weeks >= 0),
  closeout_source text,
  notes text,
  recorded_by text not null,
  recorded_at timestamptz not null default now(),
  check ((precon_start is null) = (precon_end is null)),
  check (precon_end is null or precon_end >= precon_start),
  check (precon_start is null or precon_weeks is null),
  check ((precon_start is null and precon_weeks is null) = (precon_source is null)),
  check (precon_source is null or btrim(precon_source) <> ''),
  check ((construction_start is null) = (construction_end is null)),
  check (construction_end is null or construction_end >= construction_start),
  check (construction_start is null or construction_weeks is null),
  check ((construction_start is null and construction_weeks is null) = (construction_source is null)),
  check (construction_source is null or btrim(construction_source) <> ''),
  check ((closeout_start is null) = (closeout_end is null)),
  check (closeout_end is null or closeout_end >= closeout_start),
  check (closeout_start is null or closeout_weeks is null),
  check ((closeout_start is null and closeout_weeks is null) = (closeout_source is null)),
  check (closeout_source is null or btrim(closeout_source) <> '')
);

alter table completed_jobs enable row level security;

-- The project's latest schedule proposal (engine ScheduleProposal): the weeks
-- per phase, the jobs compared and why, and the fingerprint of the facts it
-- was made from. Reset-to-proposal reads it. Null until one is made. A run
-- never reads this column: it records the weeks its plan carried.
alter table projects add column schedule_proposal jsonb;
