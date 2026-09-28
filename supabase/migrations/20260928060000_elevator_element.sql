-- LA-1257. Matt, 2026-09-28: the Elevator element. Item 26, Elevators, is
-- its driver, the same way Structure Demolition (1a) drives the Demolition
-- element (20260927160000_demolition_pilot_classification.sql). Matt approved
-- the list below on 2026-09-28, built from item 26's containers of
-- 2026-09-20 (docs/precon/canonical-work-items.md) and the "work by others"
-- a standard elevator specification carries (ASME A17.1, NEC 620, NFPA 72,
-- IBC). No rate is stated for any new item, so each arrives as No Rate Yet
-- until Matt enters or accepts one.
--
-- Held back, each waiting on a fact the intake does not collect yet:
--   - Hydraulic Well Hole and Casing: in-ground hydraulic only, and nothing
--     says in-ground or holeless.
--   - Elevator Pit Sump, Elevator and Equipment Feeds, and Elevator Recall
--     and Shunt-Trip Heat Detectors: Matt chose breakouts (carved out of
--     plumbing, electrical and fire alarm, adding nothing). A breakout shows
--     its share of the parent's figure, and none of the three has a figure
--     to carve out yet.

-- 1. Two counting rules and the unit that prices one of them. One per stop
--    prices on the existing usd_per_stop, so only one per elevator needs a
--    new unit.
alter table benchmarks
  drop constraint benchmarks_unit_check,
  add constraint benchmarks_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator'
    )
  );

alter table project_rates
  drop constraint project_rates_unit_check,
  add constraint project_rates_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator'
    )
  );

alter table scope_relationships
  drop constraint scope_relationships_quantity_rule_check,
  add constraint scope_relationships_quantity_rule_check check (
    quantity_rule in ('one_per_structure', 'one_per_elevator', 'one_per_stop')
  );

-- 2. A condition: a fact that must hold before the driver brings the item
--    in, the same { fact, equals } shape a judgment rule's condition takes.
--    Both columns or neither.
alter table scope_relationships
  add column condition_fact text check (condition_fact is null or btrim(condition_fact) <> ''),
  add column condition_equals text check (condition_equals is null or btrim(condition_equals) <> ''),
  add constraint scope_relationships_condition_whole check (
    (condition_fact is null) = (condition_equals is null)
  );

-- 3. Classification: item 26 drives the Elevator element, and each item
--    below sits in it with its own MasterFormat division, so By Division
--    reads each under its trade. 26a carries Division 04, as its canonical
--    entry states (LA-1205), which also takes it out of "No Division".
insert into block_classification
  (cost_code, detail_level, element, buyout_package, division, is_element_driver,
   stated_by, stated_on, reason)
values
  ('26', 2, 'Elevator', null, '14', true,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Elevators is the Elevator element''s driver, MasterFormat division 14.'),
  ('26a', 2, 'Elevator', null, '04', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Elevator Bulkhead sits in the Elevator element, MasterFormat division 04 (LA-1205).'),
  ('26b', 2, 'Elevator', null, '14', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Cab Interior Finish Package, item 26 container 2 (2026-09-20), division 14.'),
  ('26c', 2, 'Elevator', null, '05', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Elevator Pit Ladder, item 26 container 4 (2026-09-20), division 05.'),
  ('26d', 2, 'Elevator', null, '07', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Elevator Pit Waterproofing, item 26 container 3 (2026-09-20), division 07.'),
  ('26e', 2, 'Elevator', null, '26', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Pit Light and GFCI Receptacle (NEC 620.24), division 26.'),
  ('26f', 2, 'Elevator', null, '27', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Emergency Two-Way Communication Line (ASME A17.1), division 27.'),
  ('26g', 2, 'Elevator', null, '23', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Machine Room HVAC, hydraulic machine rooms (manufacturer temperature limits), division 23.'),
  ('26h', 2, 'Elevator', null, '04', false,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): Hoistway Door Frame Grouting, one per stop, division 04.');

-- 4. Relationships: item 26 brings each one in while it is in the budget.
--    Pit waterproofing waits on the building going below grade (the
--    levels_below_grade gate, item 26 container 3). Machine room HVAC waits
--    on a hydraulic elevator: LA-784's research found machine-room-less
--    traction puts no machine room on the roof or at a landing.
insert into scope_relationships
  (driver_cost_code, supporting_cost_code, supporting_label, quantity_rule,
   condition_fact, condition_equals, stated_by, stated_on, reason)
values
  ('26', '26b', 'Cab Interior Finish Package', 'one_per_elevator', null, null,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): each elevator brings in its cab interior finish package.'),
  ('26', '26c', 'Elevator Pit Ladder', 'one_per_elevator', null, null,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): code requires a fixed pit ladder in every elevator pit.'),
  ('26', '26d', 'Elevator Pit Waterproofing', 'one_per_elevator', 'levels_below_grade', 'yes',
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): each pit needs waterproofing when the building goes below grade.'),
  ('26', '26e', 'Pit Light and GFCI Receptacle', 'one_per_elevator', null, null,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): NEC 620.24 requires a light and a GFCI receptacle in every pit.'),
  ('26', '26f', 'Emergency Two-Way Communication Line', 'one_per_elevator', null, null,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): ASME A17.1 requires two-way emergency communication in every car.'),
  ('26', '26g', 'Machine Room HVAC', 'one_per_elevator', 'elevatorType', 'hydraulic',
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): a hydraulic machine room needs cooling and ventilation to the manufacturer''s limits.'),
  ('26', '26h', 'Hoistway Door Frame Grouting', 'one_per_stop', null, null,
   'mnicosia@thekulkagroup.com', date '2026-09-28',
   'Matt, 2026-09-28 (LA-1257): each hoistway entrance frame is grouted into the shaft wall, one per stop.');
