-- LA-1265. Matt, 2026-09-28: item 26i, Hydraulic Well Hole and Casing, the
-- last item of the approved Elevator element list (LA-1257). It was held back
-- until something said whether the jack is in-ground; V-2, Hydraulic Jack
-- Type (lib/rom/jack-criterion.ts), now does, from the research in
-- docs/precon/research/la-hydraulic-jack-type.md. One hole per elevator, in
-- division 31 (drilling), brought in only when V-2's effective answer is
-- in-ground. The corrosion casing and safety bulkhead come with the
-- cylinder, so they need no line of their own. No rate is stated: no
-- published figure exists, so it arrives as No Rate Yet.

insert into block_classification
  (cost_code, detail_level, element, buyout_package, division, is_element_driver,
   stated_by, stated_on, reason)
values
  ('26i', 2, 'Elevator', null, '31', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257, LA-1265): Hydraulic Well Hole and Casing, in-ground hydraulic only, division 31.');

insert into scope_relationships
  (driver_cost_code, supporting_cost_code, supporting_label, quantity_rule,
   condition_fact, condition_equals, stated_by, stated_on, reason)
values
  ('26', '26i', 'Hydraulic Well Hole and Casing', 'one_per_elevator', 'hydraulicJackType', 'in_ground',
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1265): an in-ground hydraulic jack needs a drilled well hole with a casing, one per elevator; V-2 decides in-ground.');
