-- Elevator benchmark units (LA-1205, building LA-784's design). Item 26,
-- Elevators, moves off one blended $41,000-per-stop rate onto two
-- type-specific rates Matt stated 2026-09-27, chosen per project by V-1
-- (packages/engine/src/elevator.ts). Item 26a, the elevator bulkhead, is new:
-- its own canonical item in Division 04, priced per shaft, for both types.
--
-- Two schema additions, same shape as 20260927140000_demolition_benchmark_units.sql:
--
--   * `usd_per_stop`: dollars per elevator stop. Item 26 prices this way, by
--     `elevator_type`.
--   * `elevator_type`: which of item 26's two rates a `usd_per_stop` row
--     prices for. Not foreign-keyed to anything, the same judgment call
--     `structure_type` already makes; V-1's own value
--     (packages/engine/src/elevator.ts, `ElevatorType`) is trusted to use the
--     same two spellings.
--   * `elevator_bulkhead_config`: which of the bulkhead's three stated
--     figures (a single-car shaft, two cars sharing one bulkhead, or the door
--     package) a row on item 26a prices. Item 26a's rows are lump sums the
--     engine reads directly and combines by elevator count
--     (`bulkheadCost`), not a rate the engine multiplies by a benchmark unit,
--     so `usd_lump_sum` is the unit every 26a row carries.
--
-- This migration seeds no benchmark. Matt's rates go in through
-- 20260927210000_elevator_stated_rates.sql.

alter table benchmarks
  drop constraint benchmarks_unit_check,
  add constraint benchmarks_unit_check check (
    unit in (
      'usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure',
      'usd_each_structure', 'usd_per_stop'
    )
  );

alter table benchmarks
  add column elevator_type text
    check (elevator_type is null or elevator_type in ('hydraulic', 'traction')),
  add constraint benchmarks_elevator_type_needs_its_own_unit check (
    elevator_type is null or unit = 'usd_per_stop'
  );

alter table benchmarks
  add column elevator_bulkhead_config text
    check (
      elevator_bulkhead_config is null
      or elevator_bulkhead_config in ('single_car', 'shared_two_car', 'door_package')
    ),
  add constraint benchmarks_elevator_bulkhead_config_needs_its_own_unit check (
    elevator_bulkhead_config is null or unit = 'usd_lump_sum'
  );
