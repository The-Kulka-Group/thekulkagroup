-- LA-1199: New Budget's Facts step and Edit Project both need Stories Above
-- Grade, and the schema has no column for it. `unit_count`, `building_count`,
-- `zip` and `market` already exist on `projects`
-- (20260920140000_rom_spec_decisions_catchup.sql); this migration adds the
-- one field still missing. Nothing else in the schema changes.
--
-- Nullable, same reasoning as `unit_count` right above it in that earlier
-- migration: a call that never gives a stories count should not have one
-- invented for it, and Matt's requirement that it be answered for a
-- multifamily project is enforced where every other "required for this
-- project type" rule in this repo is enforced -- the tier-1 question flow
-- (config/rom/tier1-flow.json, lib/rom/question-flow.ts) -- not by a NOT NULL
-- that would also break every project row already on file.
alter table projects
  add column stories_above_grade integer check (stories_above_grade > 0);
