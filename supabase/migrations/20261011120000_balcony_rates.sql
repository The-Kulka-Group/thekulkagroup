-- LA-2219 (spec LA-2209). Matt, 2026-10-11: full balconies price from VA's
-- real rates. The balconies gate stays yes, no or don't know; on yes a
-- follow-up asks Full or Juliet, and full balconies ask three facts: how
-- many balconies, the deck area of one, and the posts and rail along one
-- (config/rom/tier1-flow.json, packages/engine/src/balconies.ts). Three items
-- price on them:
--
--   - 11, the balcony deck, per SF of balcony deck, at VA's $60/SF;
--   - 11a, the posts and rail, per LF of rail, at VA's $300/LF;
--   - 15b, sliding doors, a new canonical item Matt approved on 2026-10-11,
--     one to each balcony, from $1,800 low to $2,537 high each.
--
-- A missing fact leaves the item a named blank, never a $0 line. LA-2220
-- prices the Juliet branch on the same rail unit and door count.
--
-- Scope: multifamily only, new and renovation, the same footing as every
-- stated rate before it (20261011110000_podium_garage_rates.sql).

-- 1. The three units the rates price on. Every older unit stays, including
--    LA-2216's dollars per SF of garage.
alter table benchmarks
  drop constraint benchmarks_unit_check,
  add constraint benchmarks_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator', 'usd_each_machine_room',
      'usd_per_sf_of_garage',
      'usd_per_sf_of_balcony', 'usd_per_lf_of_rail', 'usd_each_balcony_door'
    )
  );

alter table project_rates
  drop constraint project_rates_unit_check,
  add constraint project_rates_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator', 'usd_each_machine_room',
      'usd_per_sf_of_garage',
      'usd_per_sf_of_balcony', 'usd_per_lf_of_rail', 'usd_each_balcony_door'
    )
  );

-- 2. Sliding doors, a new canonical item straight after item 15a. The range
--    on record sits in item 15's container 4 (docs/precon/canonical-work-items.md).
--    sort_order is unique, so later items shift up in two steps, the way
--    20261011110000_podium_garage_rates.sql made room for 27a and 31g.
update canonical_work_items set sort_order = sort_order + 1000
 where sort_order > (select sort_order from canonical_work_items where item_number = '15a');
update canonical_work_items set sort_order = sort_order - 999 where sort_order > 1000;

insert into canonical_work_items
  (item_number, sort_order, name, masterformat_division, quantity_driver, scope_side, contract_side)
select '15b', sort_order + 1, 'Sliding glass doors', '08', 'EA, one door to each balcony', 'building', 'kulka'
  from canonical_work_items where item_number = '15a';

-- 3. The posts and rail price on their own line beside the deck, so the
--    building can show the slab and its rail as separate parts (spec
--    LA-2209). 11a is a sub-item of item 11, the way 26a to 26i sit under
--    item 26: classified here with item 11's division, not a canonical item.
insert into block_classification
  (cost_code, detail_level, element, buyout_package, division, is_element_driver,
   stated_by, stated_on, reason)
values
  ('11a', 3, null, null, '06', false,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209, LA-2219): balcony posts and rail price per LF beside the balcony deck, under item 11''s division 06.');

-- 4. "No" balconies takes all three out, and Juliet balconies take out the
--    full balcony's deck and rail. Item 11 already closes on "no"
--    (20260924140000_branch_gate_items.sql). The Juliet rules name the
--    follow-up's fact, balconyType, as their section; an item with two rules
--    is in only as far as both let it in (packages/engine/src/rom-gates.ts).
insert into branch_gate_items
  (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
values
  ('balconies', '11a', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): no balconies means no balcony posts and rail.'),
  ('balconies', '15b', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): no balconies means no balcony sliding doors.'),
  ('balconyType', '11', array['juliet'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): a Juliet balcony has no deck.'),
  ('balconyType', '11a', array['juliet'], null,
   'mnicosia@thekulkagroup.com', date '2026-10-11',
   'Matt, 2026-10-11 (LA-2209): a Juliet balcony has a Juliet rail, priced on its own item (LA-2220), not the full balcony''s posts and rail.');

-- 5. The rates. The deck and rail name VA as their source; the doors name
--    the three jobs whose lines make the range on record.
insert into benchmarks
  (cost_code, label, unit, value, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select rate.cost_code, rate.label, rate.unit, rate.value,
       'multifamily', kind.construction_kind, 1, 'building', 'kulka', 'reviewed_judgment',
       rate.source, 'Matt Nicosia', date '2026-10-11'
  from (values
         ('11', 'Balcony Deck', 'usd_per_sf_of_balcony', 60,
          'Source job: VA. "Fifth Floor Balcony Deck / Soffit" 2,749.88 SF at $60.00 per SF, $164,993 (r316; docs/precon/canonical-work-items.md item 11). Matt approved 2026-10-11 (LA-2209).'),
         ('11a', 'Balcony Posts and Rail', 'usd_per_lf_of_rail', 300,
          'Source job: VA. "Fifth Floor Balcony Posts & Railing" 503.38 LF at $300.00 per LF, $151,014 (r317; docs/precon/canonical-work-items.md item 11). Matt approved 2026-10-11 (LA-2209).'),
         ('15b', 'Sliding Doors', 'usd_each_balcony_door', 1800,
          'Source jobs: VA, V64, VR. The low end, $1,800 each, of the range on record for VA''s "Sliding Glass Doors" and V64 and VR''s "Exterior Sliding French Door Pair", $1,800 to $2,537 each (docs/precon/canonical-work-items.md item 15, container 4). Matt approved 2026-10-11 (LA-2209).'),
         ('15b', 'Sliding Doors', 'usd_each_balcony_door', 2537,
          'Source jobs: VA, V64, VR. The high end, $2,537 each, of the range on record for VA''s "Sliding Glass Doors" and V64 and VR''s "Exterior Sliding French Door Pair", $1,800 to $2,537 each (docs/precon/canonical-work-items.md item 15, container 4). Matt approved 2026-10-11 (LA-2209).')
       ) as rate (cost_code, label, unit, value, source)
 cross join (values ('new'), ('renovation')) as kind (construction_kind);
