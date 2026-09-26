-- Archive for ROM projects (LA-1110, Matt's call, 2026-09-26).
--
-- Delete on a ROM project means archive, never a row delete: `projects` also
-- holds past jobs the ROM prices benchmarks from (Jefferson's Ferry C00456,
-- Fieldstone C00449), and a hard delete would strip their data out of every
-- other project's blend. Archiving only hides a project from the pickers on
-- /rom and /rom/intake (lib/rom/projects.ts's listRomProjects). Nothing that
-- reads benchmarks, runs, cost imports or classifications filters on this
-- column, so an archived project keeps feeding blends for other projects.
--
-- Null means active, the same way every other project column reads unset as
-- null. No seeded data: nothing starts archived.

alter table projects
  add column archived_at timestamptz null;
