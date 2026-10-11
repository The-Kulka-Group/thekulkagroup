-- LA-2220 (spec LA-2209). Matt, 2026-10-11: Juliet balconies price from the
-- Juliet rail rate on record. The Full or Juliet follow-up LA-2219 added now
-- opens two questions on Juliet: how many Juliet balconies, and the rail
-- across one (config/rom/tier1-flow.json, packages/engine/src/balconies.ts).
--
--   - 7b, the Juliet rail, a new canonical item Matt approved on 2026-10-11,
--     per LF of rail at $225/LF;
--   - 15b, the sliding doors LA-2219 seeded, one to each Juliet.
--
-- A missing fact leaves the item a named blank, never a $0 line.
--
-- Scope: multifamily only, new and renovation, the same footing as every
-- stated rate before it (20261011120000_balcony_rates.sql). The rail reuses
-- LA-2219's per-LF unit (usd_per_lf_of_rail), so neither unit check changes.

-- 1. The Juliet rail, a canonical item straight after item 7a. Item 7's
--    evidence is docs/precon/canonical-work-items.md; the Juliet rail line is
--    priced per LF at V64 and VA. sort_order is unique, so later items shift
--    up in two steps, the way 20261011120000_balcony_rates.sql made room for 15b.
update canonical_work_items set sort_order = sort_order + 1000
 where sort_order > (select sort_order from canonical_work_items where item_number = '7a');
update canonical_work_items set sort_order = sort_order - 999 where sort_order > 1000;

insert into canonical_work_items
  (item_number, sort_order, name, masterformat_division, quantity_driver, scope_side, contract_side)
select '7b', sort_order + 1, 'Juliet rail', '05', 'LF of Juliet rail', 'building', 'kulka'
  from canonical_work_items where item_number = '7a';

-- 2. No balconies takes the Juliet rail out, and so do full balconies: it
--    closes on the Full answer of the follow-up, the mirror of the rules that
--    close the full balcony's deck and posts and rail on Juliet. An item with
--    two rules is in only as far as both let it in (packages/engine/src/rom-gates.ts).
insert into branch_gate_items
  (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
values
  ('balconies', '7b', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): no balconies means no Juliet rail.'),
  ('balconyType', '7b', array['full'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): a full balcony has the posts and rail priced on item 11a, not a Juliet rail.');

-- 3. The rate, naming both jobs that price the Juliet rail at $225/LF.
insert into benchmarks
  (cost_code, label, unit, value, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select '7b', 'Juliet Rail', 'usd_per_lf_of_rail', 225,
       'multifamily', kind.construction_kind, 1, 'building', 'kulka', 'reviewed_judgment',
       'Source jobs: V64, VA. "Juliet Rail - Aluminum Guard Rail" at $225.00 per LF in both: V64 419.52 LF (r25), VA 824.26 LF (r30); VR carries the same line zeroed (docs/precon/canonical-work-items.md item 7). Matt approved 2026-10-11 (LA-2209).',
       'Matt Nicosia', date '2026-10-11'
  from (values ('new'), ('renovation')) as kind (construction_kind);
