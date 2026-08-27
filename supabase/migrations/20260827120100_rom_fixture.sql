-- The walking skeleton's fixture: one project and one benchmark, so a bare page
-- can trigger a ROM and get a line back before any Kulka data exists (LA-12).
--
-- The dollar figure below is invented. DESIGN.md bans fabricated figures passing
-- as real, so the benchmark carries provenance_kind 'fixture' and every ROM
-- built on it states that in its assumptions. Delete this migration's rows once
-- the ingestion gate (LA-15) has loaded real actuals.

insert into projects (id, name, project_type, construction_kind, gross_square_feet)
values (
  '00000000-0000-4000-8000-000000000001',
  'Fixture Multifamily (example)',
  'multifamily',
  'new',
  120000
);

insert into benchmarks (
  id, cost_code, label, unit, value,
  project_type, construction_kind, comparable_count,
  provenance_kind, provenance_source_project_ids, provenance_export_label,
  provenance_recorded_by, provenance_recorded_at
)
values (
  '00000000-0000-4000-8000-000000000002',
  '03-CONC',
  'Concrete (example)',
  'usd_per_gsf',
  40,
  'multifamily',
  'new',
  1,
  'fixture',
  '{}',
  null,
  'walking skeleton fixture',
  date '2026-08-27'
);
