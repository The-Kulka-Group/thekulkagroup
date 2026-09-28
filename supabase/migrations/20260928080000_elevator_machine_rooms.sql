-- LA-1269. Matt, 2026-09-28: the number of elevator machine rooms is for
-- design and engineering to work out, not a question for him. V-3, Elevator
-- Machine Rooms (lib/rom/machine-room-criterion.ts), counts the rooms that
-- need their own HVAC (docs/precon/research/la-elevator-machine-rooms.md),
-- and item 26g, Machine Room HVAC, now prices one per room instead of one
-- per elevator.

-- 1. The unit and counting rule a per-room item prices on.
alter table benchmarks
  drop constraint benchmarks_unit_check,
  add constraint benchmarks_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator', 'usd_each_machine_room'
    )
  );

alter table project_rates
  drop constraint project_rates_unit_check,
  add constraint project_rates_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop', 'usd_each_elevator', 'usd_each_machine_room'
    )
  );

alter table scope_relationships
  drop constraint scope_relationships_quantity_rule_check,
  add constraint scope_relationships_quantity_rule_check check (
    quantity_rule in ('one_per_structure', 'one_per_elevator', 'one_per_stop', 'one_per_machine_room')
  );

-- 2. Item 26g follows V-3: one per machine room, brought in only when V-3
--    counts a room to condition (traction, machine-room-less, has none).
update scope_relationships
   set quantity_rule = 'one_per_machine_room',
       condition_fact = 'elevatorMachineRoomHvac',
       condition_equals = 'yes',
       reason = 'Matt, 2026-09-28 (LA-1257, LA-1269): each elevator machine room V-3 counts needs its own cooling and ventilation (IBC 3005.2).'
 where driver_cost_code = '26' and supporting_cost_code = '26g';

update block_classification
   set reason = 'Matt, 2026-09-28 (LA-1257, LA-1269): Machine Room HVAC, one per machine room V-3 counts, division 23.'
 where cost_code = '26g';

-- 3. Any rate already stated for 26g was per elevator; it now reads per room.
update benchmarks set unit = 'usd_each_machine_room' where cost_code = '26g' and unit = 'usd_each_elevator';
update project_rates set unit = 'usd_each_machine_room' where cost_code = '26g' and unit = 'usd_each_elevator';
