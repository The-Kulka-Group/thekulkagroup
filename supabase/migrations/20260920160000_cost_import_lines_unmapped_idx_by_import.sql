-- Fixes a code-review finding on 20260920150000_cost_import_staging.sql
-- (already on this same open PR, but this repo's convention is to never
-- edit an already-created migration file once it exists -- a new,
-- later-timestamped migration replaces it instead, same as any other
-- already-applied one).
--
-- `cost_import_lines_unmapped_idx` was built on `(created_at desc) where
-- status = 'unmapped'`, but `listUnmappedLines` in lib/rom/ingest.ts orders
-- by `i.uploaded_at desc, l.row_number` -- the *import's* upload time, not
-- the line's own `created_at`, plus the line's row number as a tiebreaker.
-- The old index could not serve that ORDER BY at all: `created_at` isn't
-- even a column the query sorts by.
--
-- Judgment call: ordering by the import's `uploaded_at` (not the line's own
-- `created_at`) is the right real-world access pattern for a review queue,
-- since lines from the same import were reviewed by the same person at the
-- same time and cluster together -- the query already reflects this, so the
-- index is changed to match the query rather than the other way around.
drop index cost_import_lines_unmapped_idx;

create index cost_import_lines_unmapped_idx on cost_import_lines (cost_import_id, row_number)
  where status = 'unmapped';

-- `cost_import_id` alone isn't enough to serve `i.uploaded_at desc` without
-- also touching `cost_imports`, since `uploaded_at` lives on that table, not
-- on `cost_import_lines`. This index still gets Postgres from "every
-- unmapped line" straight to "grouped by its import" and sorted within each
-- import by `row_number` (the query's own tiebreaker) without a full scan of
-- `cost_import_lines`, then joins that small result against `cost_imports`
-- (indexed by `cost_imports_source_project_idx`... which does not cover
-- `uploaded_at` alone either). A composite index that also orders by
-- `cost_imports.uploaded_at` would need a denormalized copy of that column
-- on `cost_import_lines`, which is more schema than this fix warrants; the
-- review list is not expected to hold enough unmapped rows across enough
-- imports for a final sort on `uploaded_at` to matter in practice.
