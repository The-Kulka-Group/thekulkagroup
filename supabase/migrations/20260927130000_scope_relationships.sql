-- Scope relationships (LA-1154, ADR 0006). An answer brings in a driver; a
-- relationship then makes the driver bring in its supporting items. Taking a
-- building down means disconnecting its electric, water, gas and site
-- utilities, and that is true whichever question brought Structure
-- Demolition in, so it is one row per pairing rather than one per question.
--
-- Relationships are data, on the same footing as branch_gate_items: each row
-- says who stated it, when, and why. They never live in
-- config/rom/tier1-flow.json, so a question cannot add scope quietly. Matt
-- states every row; nothing infers one.
--
-- The engine (packages/engine/src/rom-relationships.ts) brings a supporting
-- item in only while its driver is in the ROM, at the driver's own status:
-- priced when it is priced, TBD when it is TBD, absent when it is not in the
-- job or not answered. A supporting item adds to the total in its own right
-- and is never a breakout.
--
-- Judgment call: like branch_gate_items.cost_code, neither cost code is
-- foreign-keyed to canonical_work_items.item_number. Only item 1 exists there
-- today, and adding 1a, 28a, 28b, 31f and 36a is an open question for Matt,
-- not this migration's to settle.
--
-- Judgment call: `supporting_label` carries the supporting item's name on the
-- row, because none of the four disconnects has a benchmark or a canonical
-- row to read a name from, and an unpriced block still has to say what it is.
-- The names are the ones ADR 0006 gives.
create table scope_relationships (
  id uuid primary key default gen_random_uuid(),
  driver_cost_code text not null check (btrim(driver_cost_code) <> ''),
  supporting_cost_code text not null check (btrim(supporting_cost_code) <> ''),
  supporting_label text not null check (btrim(supporting_label) <> ''),
  -- How many of the supporting item one driver brings in. The pilot has one
  -- rule, read from the demolition structure count (LA-1155). Nothing prices
  -- on it yet; LA-1156's "$ each" unit is what will.
  quantity_rule text not null check (quantity_rule in ('one_per_structure')),
  stated_by text not null check (btrim(stated_by) <> ''),
  stated_on date not null,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default now(),

  check (driver_cost_code <> supporting_cost_code),
  unique (driver_cost_code, supporting_cost_code)
);

create index scope_relationships_supporting_cost_code_idx
  on scope_relationships (supporting_cost_code);

insert into scope_relationships
  (driver_cost_code, supporting_cost_code, supporting_label, quantity_rule,
   stated_by, stated_on, reason)
values
  ('1a', '28a', 'Plumbing Disconnect and Cap', 'one_per_structure',
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26: Structure Demolition brings in a Plumbing Disconnect and Cap, one per structure coming down (ADR 0006).'),
  ('1a', '28b', 'Gas Meter and Service Disconnect', 'one_per_structure',
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26: Structure Demolition brings in a Gas Meter and Service Disconnect, one per structure coming down (ADR 0006).'),
  ('1a', '31f', 'Electrical Service Disconnect', 'one_per_structure',
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26: Structure Demolition brings in an Electrical Service Disconnect, one per structure coming down (ADR 0006).'),
  ('1a', '36a', 'Site Utility Cut and Cap at the Main', 'one_per_structure',
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26: Structure Demolition brings in a Site Utility Cut and Cap at the Main, one per structure coming down (ADR 0006).');

alter table scope_relationships enable row level security;
