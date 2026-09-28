-- Elevator rates as Matt stated them, 2026-09-27 (LA-1205; item 26 and the
-- new item 26a in docs/precon/canonical-work-items.md). Every figure below is
-- Matt's own statement, per LA-1156's provenance pattern
-- (20260927150000_demolition_stated_rates.sql): the number, who stated it,
-- and when, recorded before any code ever prices from it.
--
-- Scope: multifamily only, new and renovation, the same footing every ROM
-- rate in this file already stands on.

-- Item 26, Elevators: per stop, by V-1's type (docs/precon/criteria/la-784-elevator-type.md,
-- LA-784's comments of 2026-09-27). Replaces the single $41,000-per-stop
-- blended rate for whichever type V-1 holds.
insert into benchmarks
  (cost_code, label, unit, value, elevator_type, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select '26', 'Elevators', 'usd_per_stop', rate.value, rate.elevator_type,
       'multifamily', kind.construction_kind, 1, 'building', 'kulka', 'reviewed_judgment',
       'Matt''s statement, 2026-09-27, after LA-784''s hydraulic-versus-traction cost research (docs/precon/research/la-784-elevator-followups.md, Section 2). Replaces the single $41,000-per-stop blended rate.',
       'Matt Nicosia', date '2026-09-27'
  from (values
         ('hydraulic', 35000),
         ('traction', 45300)
       ) as rate (elevator_type, value)
 cross join (values ('new'), ('renovation')) as kind (construction_kind);

-- Item 26a, the elevator bulkhead: its own canonical item in Division 04,
-- driven by the elevator gate, one per shaft, for both elevator types
-- (neither hydraulic nor machine-room-less traction puts a machine room on
-- the roof, so both need the shaft to rise above the roof for the overrun).
-- Each row is a lump sum the engine reads directly and combines by elevator
-- count (packages/engine/src/elevator.ts, bulkheadCost), not a rate a
-- benchmark unit multiplies by a quantity.
insert into benchmarks
  (cost_code, label, unit, value, elevator_bulkhead_config, project_type, construction_kind,
   comparable_count, scope_side, contract_side, provenance_kind,
   provenance_export_label, provenance_recorded_by, provenance_recorded_at)
select '26a', 'Elevator Bulkhead', 'usd_lump_sum', config.value, config.config,
       'multifamily', kind.construction_kind, 1, 'building', 'kulka', 'reviewed_judgment',
       config.reason, 'Matt Nicosia', date '2026-09-27'
  from (values
         ('single_car', 16600,
          'Matt''s statement, 2026-09-27, accepting the per-trade build-up in docs/precon/research/la-784-elevator-followups.md, Section 6, at the 4 ft base case: masonry (04), 2-hour 8" CMU, $4,108; structural steel (05), hoist beam furnished and set, $3,750; roofing (07), bulkhead roof, base flashing and metal coping (sheet metal folded into roofing), $3,981; trade subtotal $11,839, times 1.4 for small-job mobilization and GC overhead and profit; $16,600 per single-car bulkhead.'),
         ('shared_two_car', 28700,
          'Matt''s statement, 2026-09-27: two cars sharing one bulkhead, about 1.7 times the single-car trade subtotal rather than double, because the walls, roof and coping scale with shared perimeter and area rather than doubling with car count (docs/precon/research/la-784-elevator-followups.md, Section 6); $28,700 for two cars sharing one bulkhead.'),
         ('door_package', 2200,
          'Matt''s statement, 2026-09-27: the door package, added only when the bulkhead also holds the roof stair or a traction machine room, since mechanics reach the overrun from the car top otherwise (docs/precon/research/la-784-elevator-followups.md, Sections 5 and 6). Prices the frame, hardware, installation and paint, range $1,500 to $3,000; $2,200 planning figure.')
       ) as config (config, value, reason)
 cross join (values ('new'), ('renovation')) as kind (construction_kind);
