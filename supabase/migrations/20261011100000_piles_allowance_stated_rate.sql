-- The piles allowance from West Shore Road (WS), recorded as a stated rate on
-- item 34a, Deep foundations, piles, and shoring (LA-2214, spec LA-2209).
--
-- It is the only pile figure Kulka has: WS's "Piles Allowance" line, $350,000
-- lump sum, over a 16,357 SF foundation footprint (docs/precon/research/
-- la-pricing-structure-foundation.md). It is an allowance from one conceptual
-- budget, not a benchmark, and the file does not say the pile type, count or
-- length. The export label names the source job first ("Source job: WS") so
-- the part price map can show it beside the figure.
--
-- Matt stated it, so the row carries no comparable count: the engine reads a
-- figure with no job count behind it as a stated rate and flags it as thin.
--
-- Scope: multifamily only, new and renovation, the same footing every ROM
-- rate in these files stands on. Item 34a's gate (20260924140000_branch_gate_items.sql)
-- decides when the line is in the run: it is off only when both Levels Below
-- Grade and Site Conditions are answered no.
insert into benchmarks
  (cost_code, label, unit, value, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select '34a', 'Deep Foundations, Piles, and Shoring', 'usd_lump_sum', 350000,
       'multifamily', kind.construction_kind, 0, 'building', 'kulka', 'reviewed_judgment',
       'Source job: WS. West Shore Road Apartments conceptual budget, "Piles Allowance," $350,000 lump sum over a 16,357 SF foundation footprint. An allowance from one job, not a benchmark; the file gives no pile type, count or length.',
       'Matt Nicosia', date '2026-10-11'
  from (values ('new'), ('renovation')) as kind (construction_kind);
