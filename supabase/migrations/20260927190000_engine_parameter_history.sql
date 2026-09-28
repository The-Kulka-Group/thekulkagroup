-- Engine parameters keep their history (LA-866).
--
-- 20260921120000_engine_parameters.sql made `name` unique, so the only way to
-- change a weight or a threshold was a migration that overwrote the old value.
-- The Engine Parameters screen writes a new row instead, with its own person,
-- date and reason, and the old row stays readable. A past ROM already carries
-- the parameters it used (runs.rom -> parameters), so no saved run changes
-- meaning.
--
-- Every existing row stays exactly as it is and becomes the first entry in its
-- name's history. No value changes here.

-- The inline `unique` on name was named by Postgres after table and column.
alter table engine_parameters drop constraint engine_parameters_name_key;

-- The current value of a name is its newest row: latest created_at, then the
-- highest id as a tie-break so the answer is the same on every read. The index
-- serves that order and the per-name history the screen lists.
create index engine_parameters_name_newest_idx
  on engine_parameters (name, created_at desc, id desc);

-- The one place "current" is defined. Every reader (lib/rom/run.ts for a run,
-- the live budget's snapshot route and the backtest through it, and
-- lib/rom/markup.ts for the Markups defaults) selects from this view rather
-- than restating the rule.
--
-- security_invoker so the view checks the caller's rights on the table rather
-- than the view owner's; the table's row level security still applies.
create view engine_parameters_current
  with (security_invoker = true) as
select distinct on (name)
       id, name, value, provenance_kind, provenance_recorded_by,
       provenance_recorded_at, reason, created_at
  from engine_parameters
 order by name, created_at desc, id desc;
