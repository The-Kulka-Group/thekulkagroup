-- GRs/GCs, fee, and insurance below the ROM's trade subtotal (LA-1016).
--
-- ADR 0004 files General Conditions at 90 20 00, fee at 90 30 00 and insurance
-- at 90 40 00, each computing on the running total of everything above it.
-- This migration adds the data those three lines read: real GRs/GCs figures
-- routed out of imported budgets, and the two default rates Matt stated on
-- 2026-09-23. The staffing and field-office rate tables the third pricing
-- method reads already exist (20260920140000_rom_spec_decisions_catchup.sql).
--
-- Judgment calls are marked inline with "Judgment call:", same convention as
-- the earlier ROM migrations.

-- =====================================================================
-- 1. markup_history: one real GRs/GCs figure per source project and setup
-- =====================================================================
-- A budget files General Requirements and General Conditions one of three
-- ways (ADR 0004): one combined line ('both'), General Conditions alone
-- ('gc_only'), or General Requirements alone ('gr_only'). A reviewer routes
-- the line to this table from the import review page instead of mapping it to
-- a canonical work item, because it is a markup and not work.
--
-- usd_per_gsf is the line's own value from cost_import_lines.
-- pct_of_subtotal is a fraction, not a percent: 0.1573 means 15.73 percent. It
-- is the line's value divided by the sum of that import's other trade lines,
-- both in dollars per gross square foot, computed once when the row is
-- recorded (lib/rom/markup.ts).
--
-- Judgment call: unique (project_id, setup). One figure per project and setup
-- keeps a corrected re-upload of the same budget from counting that job twice
-- in the mean, the same reasoning approveCostImport uses for a re-stated
-- benchmark. A budget that splits one setup across several lines has to be
-- recorded as one figure; the route refuses a second one with a 409.
create table markup_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete restrict,
  setup text not null check (setup in ('both', 'gc_only', 'gr_only')),
  usd_per_gsf numeric not null check (usd_per_gsf > 0),
  pct_of_subtotal numeric not null check (pct_of_subtotal > 0),
  cost_import_line_id uuid not null unique references cost_import_lines (id) on delete restrict,

  recorded_by text not null check (btrim(recorded_by) <> ''),
  recorded_at timestamptz not null default now(),
  export_label text not null check (btrim(export_label) <> ''),

  unique (project_id, setup)
);

-- =====================================================================
-- 2. A cost import line can be routed to the 90 series
-- =====================================================================
-- 'markup': the line was a GRs/GCs figure, so it went to markup_history
-- instead of becoming a benchmark. Like 'excluded', it never reaches
-- `benchmarks`, so the approved-means-benchmark check below still holds.
-- The constraint was declared inline in 20260920150000_cost_import_staging.sql,
-- so Postgres named it cost_import_lines_status_check.
alter table cost_import_lines drop constraint cost_import_lines_status_check;
alter table cost_import_lines add constraint cost_import_lines_status_check check (
  status in ('staged', 'unmapped', 'approved', 'excluded', 'markup')
);

-- =====================================================================
-- 3. Default fee and insurance rates
-- =====================================================================
-- Both names already fit engine_parameters' name check
-- ('^[a-z_]+\.[a-z_]+$'), so the check needs no change. The engine's
-- ParameterName type gains them in packages/engine/src/rom.ts.
-- A user can override either rate on one ROM; the run records which was used.
insert into engine_parameters
  (name, value, provenance_kind, provenance_recorded_by, provenance_recorded_at, reason)
values
  ('fee.rate', 0.0325, 'reviewed_judgment', 'mnicosia@thekulkagroup.com', date '2026-09-23',
   'Matt, 2026-09-23: Jefferson''s Ferry''s actual fee was $274,263.95 on $8,437,400.67 of cost, which is 3.25 percent. Fee computes on the subtotal plus GRs/GCs, per ADR 0004.'),
  ('insurance.rate', 0.054, 'reviewed_judgment', 'mnicosia@thekulkagroup.com', date '2026-09-23',
   'Matt, 2026-09-23: Jefferson''s Ferry carried $470,404.12 of insurance. On the ADR 0004 running-total basis that is 470,404.12 / (8,437,400.67 + 274,263.95) = 5.40 percent, rated on cost plus fee.');

-- Row level security: on, with no policies, same rule as every other table
-- here. Server code reaches it over a direct connection as owner.
alter table markup_history enable row level security;
