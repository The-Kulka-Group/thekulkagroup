-- Demolition rates as Matt stated them (LA-1156, ADR 0006; items 1 and 1a in
-- docs/precon/canonical-work-items.md).
--
-- 20260927140000_demolition_benchmark_units.sql added the units these rows
-- need and seeded no dollar figure, on the controlled-goalposts rule that data
-- enters through an approval gate. Matt is that gate here. On 2026-09-27 he
-- directed that these figures be recorded in a migration, and every one of
-- them is his own statement or a line he chose from a past job. Nothing below
-- is a proposal waiting for review.
--
-- Scope of the seed: multifamily only, new and renovation, because Kulka's ROM
-- is multifamily first. Self-storage gets no demolition rate until someone
-- states one for it.

-- Item 1a, Structure Demolition: dollars per square foot of structure coming
-- down, one rate per structure type. Each rate is a midpoint. The engine
-- applies its usual one-source spread, and a structure type of Don't Know
-- prices the full span of these five (packages/engine/src/rom-units.ts).
insert into benchmarks
  (cost_code, label, unit, value, structure_type, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select '1a', 'Structure Demolition', 'usd_per_sf_of_structure', rate.value,
       rate.structure_type, 'multifamily', kind.construction_kind, 1, 'site', 'kulka',
       'reviewed_judgment',
       'Began as Claude''s proposal. Matt reviewed it and stated the low end plus ten percent, 2026-09-26.',
       'Matt Nicosia', date '2026-09-26'
  from (values
         ('wood_frame_type_v', 6.60),
         ('masonry_bearing_wall_type_iii', 9.90),
         ('pre_engineered_metal_or_light_steel', 5.50),
         ('steel_frame_concrete_metal_deck_type_ii', 13.20),
         ('cast_in_place_concrete_frame_type_i', 19.80)
       ) as rate (structure_type, value)
 cross join (values ('new'), ('renovation')) as kind (construction_kind);

-- Item 1, Site Demolition: a lump sum from Jefferson's Ferry's (C00456) "Site
-- Demolition" line only. One job stands behind it, so the engine flags it as
-- thin data. V64's and VA's demolition lumps stay out because they mix in
-- building demolition.
insert into benchmarks
  (cost_code, label, unit, value, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select '1', 'Site Demolition', 'usd_lump_sum', 25000, 'multifamily',
       kind.construction_kind, 1, 'site', 'kulka', 'actuals',
       'Jefferson''s Ferry (C00456) "Site Demolition" line, $25,000. Thin data: one job. Matt chose this line alone, 2026-09-26.',
       'Matt Nicosia', date '2026-09-26'
  from (values ('new'), ('renovation')) as kind (construction_kind);

-- Tie the lump sum to Jefferson's Ferry where that project exists, matched the
-- same way 20260925120000_project_framing_system.sql matches it. A database
-- without the project links nothing, which is correct: nothing is guessed.
insert into benchmark_source_projects (benchmark_id, project_id)
select b.id, p.id
  from benchmarks b
  join projects p
    on p.name like '%C00456%' or p.id = 'f619d711-8257-4fd8-9344-aba3b97dc998'
 where b.cost_code = '1' and b.unit = 'usd_lump_sum'
on conflict do nothing;
