-- Demolition benchmark units (LA-1156, ADR 0006 "Structure Demolition prices
-- per square foot of what comes down"). Every benchmark has priced on one
-- basis so far: dollars per gross square foot of the whole project,
-- `usd_per_gsf`. Demolition needs three more, because what it costs does not
-- move with the building being built:
--
--   * `usd_lump_sum`: priced once per job, whatever the project's size.
--     Site Demolition (item 1) prices this way.
--   * `usd_per_sf_of_structure`: dollars per square foot of the structure
--     coming down, read from the demolition intake answers rather than the
--     project's own gross area. Structure Demolition (item 1a) prices this
--     way, by structure type.
--   * `usd_each_structure`: dollars for each structure coming down. For the
--     four disconnects Structure Demolition drives in (28a, 28b, 31f, 36a),
--     once a rate for one of them exists to use it.
--
-- packages/engine/src/rom-units.ts is where a benchmark's unit turns into the
-- quantity its rate multiplies by; this migration only widens the column
-- that names the unit, and adds the column Structure Demolition's five rates
-- need to say which structure type they price.
--
-- This migration seeds no benchmark. Matt's five stated rates for item 1a
-- and Jefferson's Ferry's $25,000 Site Demolition line go in through
-- 20260927150000_demolition_stated_rates.sql, which Matt directed on
-- 2026-09-27.

alter table benchmarks
  drop constraint benchmarks_unit_check,
  add constraint benchmarks_unit_check check (
    unit in ('usd_per_gsf', 'usd_lump_sum', 'usd_per_sf_of_structure', 'usd_each_structure')
  );

-- Which of item 1a's five structure types a `usd_per_sf_of_structure` row on
-- item 1a prices for. Null on every other benchmark, including every row
-- that predates this migration. Not foreign-keyed to a lookup table, the
-- same judgment call `rom_schema.sql` already makes about `cost_code`
-- itself: LA-1155's six choice values live in
-- `config/rom/tier1-flow.json` and `packages/engine/src/rom-intake.ts`
-- (`DemolitionStructureType`), and this column trusts whoever records a
-- benchmark to use the same six spellings, the same trust every other
-- cost-code-shaped column in this schema already extends.
alter table benchmarks
  add column structure_type text
    check (
      structure_type is null
      or structure_type in (
        'wood_frame_type_v',
        'masonry_bearing_wall_type_iii',
        'pre_engineered_metal_or_light_steel',
        'steel_frame_concrete_metal_deck_type_ii',
        'cast_in_place_concrete_frame_type_i',
        'dont_know'
      )
    ),
  add constraint benchmarks_structure_type_needs_its_own_unit check (
    structure_type is null or unit = 'usd_per_sf_of_structure'
  );
