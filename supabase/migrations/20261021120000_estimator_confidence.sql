-- Estimator confidence on past jobs (LA-2967).
--
-- Jesse Snizek scored Kulka's ProEst estimates from 1 to 10 for how well each
-- shows the job's full cost, and sent the scores on 2026-10-15 in
-- JRS_Estimates_by_Type (1).xlsx (email "Re: Proest Export for Confidence
-- Levels"). The engine now counts a ProEst budget figure at its job's score
-- over 10 of the proest_budget weight, and leaves out a job scored at or below
-- the cutoff below (packages/engine/src/rom-confidence.ts). Autodesk actuals
-- are what a job cost, so the score never touches them.

-- =====================================================================
-- 1. The score, who gave it, and when
-- =====================================================================
-- Null means nobody has scored the job, and such a job keeps its full weight.
-- A score never stands without its person and date, the same rule every
-- benchmark's provenance follows.
alter table projects
  add column estimator_confidence smallint check (estimator_confidence between 1 and 10),
  add column estimator_confidence_by text,
  add column estimator_confidence_on date,
  add constraint projects_estimator_confidence_provenance_check check (
    (estimator_confidence is null and estimator_confidence_by is null and estimator_confidence_on is null)
    or (
      estimator_confidence is not null
      and nullif(btrim(estimator_confidence_by), '') is not null
      and estimator_confidence_on is not null
    )
  );

-- =====================================================================
-- 2. The cutoff
-- =====================================================================
-- The name fits engine_parameters' name check, so the check needs no change.
-- The engine's ParameterName type gains it in packages/engine/src/rom.ts, and
-- the Engine Parameters screen can change it from here on.
insert into engine_parameters
  (name, value, provenance_kind, provenance_recorded_by, provenance_recorded_at, reason)
values
  ('confidence.exclude_at_or_below', 1, 'reviewed_judgment', 'Matt Nicosia', date '2026-10-21',
   'Jesse Snizek, 2026-10-15, email "Re: Proest Export for Confidence Levels": "Anything scored a 1 was a quick takeoff that does not represent the overall project cost. These should really be a zero or deleted from the algorithm." A ProEst budget from a job scored at or below this stays out of the blend (LA-2967).');

-- =====================================================================
-- 3. The two jobs already in the ROM
-- =====================================================================
-- Jesse's scores for the two jobs every ROM prices from today. The table has
-- no job-number column, so the job number sits in the project name, the same
-- match 20260925120000_project_framing_system.sql uses. A database where
-- neither name matches updates no rows, which is correct: nothing is guessed.
update projects
   set estimator_confidence = 10,
       estimator_confidence_by = 'Jesse Snizek',
       estimator_confidence_on = date '2026-10-15'
 where name like '%C00449%';

update projects
   set estimator_confidence = 9,
       estimator_confidence_by = 'Jesse Snizek',
       estimator_confidence_on = date '2026-10-15'
 where name like '%C00456%' or id = 'f619d711-8257-4fd8-9344-aba3b97dc998';
