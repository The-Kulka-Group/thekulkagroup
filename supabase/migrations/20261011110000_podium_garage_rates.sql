-- LA-2216 (spec LA-2209). Matt, 2026-10-11: the parking answer prices the
-- podium garage from VA's real rates. A podium garage's area is the podium
-- footprint, gross area over stories above grade, for one garage level
-- (packages/engine/src/garage.ts). Three items price on it, and the
-- whole-building electrical (31) and sprinklers (27) drop it, so the garage
-- is never priced twice. A surface lot or no parking takes all three out.
--
-- Scope: multifamily only, new and renovation, the same footing as every
-- stated rate before it (20260927210000_elevator_stated_rates.sql).

-- 1. The unit the three rates price on: dollars per SF of garage.
alter table benchmarks
  drop constraint benchmarks_unit_check,
  add constraint benchmarks_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator', 'usd_each_machine_room',
      'usd_per_sf_of_garage'
    )
  );

alter table project_rates
  drop constraint project_rates_unit_check,
  add constraint project_rates_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator', 'usd_each_machine_room',
      'usd_per_sf_of_garage'
    )
  );

-- 2. Two new canonical items, approved by Matt on 2026-10-11: garage-level
--    sprinklers (27a) straight after item 27, and garage-level electrical
--    (31g) straight after item 31e. sort_order is unique, so later items
--    shift up in two steps each, the way 20260924130000_site_work_merge.sql
--    made room for 34a.
update canonical_work_items set sort_order = sort_order + 1000 where sort_order > 36;
update canonical_work_items set sort_order = sort_order - 999 where sort_order > 1000;

insert into canonical_work_items
  (item_number, sort_order, name, masterformat_division, quantity_driver, scope_side, contract_side)
values
  ('27a', 37, 'Garage-level fire sprinklers', '21', 'SF of garage area', 'building', 'kulka');

update canonical_work_items set sort_order = sort_order + 1000 where sort_order > 46;
update canonical_work_items set sort_order = sort_order - 999 where sort_order > 1000;

insert into canonical_work_items
  (item_number, sort_order, name, masterformat_division, quantity_driver, scope_side, contract_side)
values
  ('31g', 47, 'Garage-level electrical', '26', 'SF of garage area', 'building', 'kulka');

-- 3. Parking none or surface means no garage, so neither garage item is in
--    the job, the same rule item 3 already follows.
insert into branch_gate_items
  (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
values
  ('parking_type', '27a', array['none', 'surface'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): parking none or surface means no garage level, so no garage-level sprinklers.'),
  ('parking_type', '31g', array['none', 'surface'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): parking none or surface means no garage level, so no garage-level electrical.');

-- 4. The three rates, each naming VA as its source
--    (docs/precon/canonical-work-items.md items 3, 27 and 31).
insert into benchmarks
  (cost_code, label, unit, value, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select rate.cost_code, rate.label, 'usd_per_sf_of_garage', rate.value,
       'multifamily', kind.construction_kind, 1, 'building', 'kulka', 'reviewed_judgment',
       rate.source, 'Matt Nicosia', date '2026-10-11'
  from (values
         ('3', 'Podium Deck', 34.13,
          'Source job: VA. "L2 Podium, 12" avg assumed" $1,395,525 lump sum (r11) over its 40,894 SF garage level, $34.13 per SF of podium deck (docs/precon/canonical-work-items.md item 3; docs/precon/research/la-pricing-structure-foundation.md, 13a). Matt approved 2026-10-11 (LA-2209).'),
         ('31g', 'Garage Electrical', 18,
          'Source job: VA. "Electrical - Garage level breakout" 40,894 SF at $18.00 per SF (r245; docs/precon/canonical-work-items.md item 31). Matt approved 2026-10-11 (LA-2209).'),
         ('27a', 'Garage Sprinklers', 6,
          'Source job: VA. "Sprinkler Breakout" 40,000 SF at $6.00 per SF, the garage level (r210; docs/precon/canonical-work-items.md item 27). Matt approved 2026-10-11 (LA-2209).')
       ) as rate (cost_code, label, value, source)
 cross join (values ('new'), ('renovation')) as kind (construction_kind);
