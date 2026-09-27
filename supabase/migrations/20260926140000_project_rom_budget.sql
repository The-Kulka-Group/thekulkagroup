-- Clean new budget (LA-1140, Matt's call, 2026-09-26).
--
-- "A new budget should start clean and have no saved runs on the bottom."
-- POST /api/rom/projects used to insert the project and immediately run its
-- first ROM, so a run row existed before anyone asked for one. Removing that
-- run call means listRomProjects (lib/rom/projects.ts), which only listed
-- projects with at least one run, would drop a clean budget from the /rom and
-- /rom/intake pickers until someone ran it.
--
-- rom_budget marks a project as one made through New budget, independent of
-- whether it has any runs yet. The picker then lists a project when it is
-- flagged rom_budget OR it has a run, so past jobs that only feed benchmarks
-- (Jefferson's Ferry, Fieldstone) and were never made through New budget stay
-- out, exactly as before.
--
-- Backfill: every project that already has a run is flagged true, so today's
-- picker contents are unchanged by this migration alone.

alter table projects
  add column rom_budget boolean not null default false;

update projects
   set rom_budget = true
 where id in (select distinct project_id from runs);
