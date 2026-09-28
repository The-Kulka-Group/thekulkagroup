-- LA-1214. Matt confirmed docs/precon/masterformat-divisions.md on 2026-09-27:
-- every row in that file is the real MasterFormat division for that canonical
-- item, not a proposal. This migration stores that on `canonical_work_items`
-- so the app can read a real division for a bare item-number cost code
-- ("10", "31f") instead of falling back to "no division" (LA-1210,
-- `app/(app)/rom/field-order.ts`'s `divisionFor`).
--
-- Six items are Matt's stated corrections against that file's proposed
-- values, given directly for this ticket rather than as edits to the doc's
-- table:
--   - 22, Residential appliances: 11 (Equipment), not 10 (Specialties).
--   - 23, Trash compactors and chutes: 14 (Conveying Systems), not 10.
--   - 31a, Low voltage: 27 (Communications), not 26 (Electrical).
--   - 35, Site drainage and stormwater: 33 (Utilities), not 31 (Earthwork).
--   - 36, Sanitary sewer, water service, and site utilities: 33, not 31 --
--     the same fork the doc's own item 36a note already flagged.
--   - 37, Landscaping and irrigation: 32 (Exterior Improvements). The doc's
--     table still shows 31, but 20260924130000_site_work_merge.sql already
--     moved this item's stored division to 32 on 2026-09-24 (LA-1015); this
--     migration keeps that value rather than reverting it to the doc's own
--     stale entry.
--
-- '11', '27' and '33' are not in the column's check constraint yet -- the
-- constraint was written against the frozen 54-item list, which never
-- reached those divisions (see 20260920140000_rom_spec_decisions_catchup.sql
-- and the masterformat-divisions.md doc's own "Item 36a" section). Widening
-- it is this migration's first step.
--
-- Every other item below already carries the value this migration sets --
-- the original catchup migration and 20260924130000_site_work_merge.sql
-- already stored the doc's proposed values for them -- so most of these
-- updates are a no-op confirmation, not a change; only the six named above
-- actually move.
--
-- Judgment call: this migration only updates rows that exist in
-- `canonical_work_items` today. The doc lists 60 item headings from
-- `canonical-work-items.md`, but five of them (1a, 28a, 28b, 31f, 36a) are
-- not rows in this table -- 20260927160000_demolition_pilot_classification.sql
-- states this directly ("'1a', '28a', '28b', '31f' and '36a' are not rows
-- there yet") and classifies them on `block_classification` instead, keyed
-- by cost code rather than by a row here. Adding those five rows is a
-- decision of its own, not something this ticket's file lane covers, so
-- they are left out rather than inserted with an invented sort_order and
-- quantity_driver.

alter table canonical_work_items
  drop constraint canonical_work_items_masterformat_division_check;

alter table canonical_work_items
  add constraint canonical_work_items_masterformat_division_check check (
    masterformat_division in (
      '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
      '12', '13', '14', '21', '22', '23', '26', '27', '28', '31', '32', '33'
    )
  );

update canonical_work_items as c
   set masterformat_division = v.division
  from (
    values
      ('1', '02'), ('2', '03'), ('3', '03'), ('3a', '03'), ('4', '03'),
      ('5', '04'), ('6', '04'),
      ('7', '05'), ('7a', '05'),
      ('8', '06'), ('8a', '06'), ('9', '06'), ('10', '06'), ('11', '06'),
      ('12', '07'), ('13', '07'), ('14', '07'), ('14a', '07'),
      ('15', '08'), ('15a', '08'), ('16', '08'), ('16a', '08'),
      ('17', '09'), ('18', '09'), ('19', '09'), ('19a', '09'), ('20', '09'),
      ('21', '10'),
      ('22', '11'), -- Matt, 2026-09-27: Equipment, not the doc's proposed 10.
      ('23', '14'), -- Matt, 2026-09-27: Conveying Systems, not the doc's proposed 10.
      ('24', '12'), ('24a', '12'), ('24b', '12'),
      ('25', '13'),
      ('26', '14'),
      ('27', '21'),
      ('28', '22'), ('29', '22'),
      ('30', '23'),
      ('31', '26'),
      ('31a', '27'), -- Matt, 2026-09-27: Communications, not the doc's proposed 26.
      ('31b', '26'), ('31c', '26'), ('31d', '26'), ('31e', '26'),
      ('32', '28'), ('32a', '28'),
      ('33', '31'), ('34', '31'), ('34a', '31'),
      ('35', '33'), -- Matt, 2026-09-27: Utilities, not the doc's proposed 31.
      ('36', '33'), -- Matt, 2026-09-27: Utilities, not the doc's proposed 31.
      ('37', '32'), -- Already stored (LA-1015); the doc's table is stale here.
      ('38', '32'), ('39', '32')
  ) as v (item_number, division)
 where c.item_number = v.item_number;
