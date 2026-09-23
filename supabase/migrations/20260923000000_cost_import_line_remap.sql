-- LA-978: a reviewer can fix a cost import line's match before the import is
-- approved. LA-15's own migration (20260920150000_cost_import_staging.sql)
-- staged every line against its best automatic match, but built no way for
-- a person to change that match or say a line should not be promoted at
-- all. This migration adds no new table and no new status -- `staged` and
-- `excluded` already exist on `cost_import_lines.status` -- it only adds a
-- record of who changed a line's mapping and when, so that fact is not
-- lost the way it would be if the update only touched `candidate_canonical_
-- item_id` and `status`.
--
-- Judgment call: both columns are nullable. A line nobody has ever touched
-- by hand (the common case: the automatic match was good enough) has never
-- been "mapped" by a person, so `mapped_by`/`mapped_at` being null on it is
-- the true statement, not a placeholder. They are set together, by the one
-- new code path (lib/rom/ingest.ts's remapCostImportLine) that changes a
-- line's match or excludes it after staging -- there is no third state
-- where one is set and the other is not, so no check constraint is added
-- for that; nothing else writes these columns.
alter table cost_import_lines
  add column mapped_by text,
  add column mapped_at timestamptz;

-- Row level security is already on for this table (20260920150000) with no
-- policies, same rule as every other table in this schema: server code
-- reaches Postgres directly as owner, which bypasses row level security.
-- These two columns change nothing about who can reach the table, so no
-- policy is added here.
