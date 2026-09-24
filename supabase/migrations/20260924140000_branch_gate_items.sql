-- Branch gate items (LA-1028). The ROM was pricing every work item any
-- loaded job had, whatever the intake's yes/no scope questions answered.
-- This migration adds the map that lets an answer actually switch a
-- canonical item on or off: branch_gate_items, plus the four new gates and
-- the columns that hold their answers on `projects`.
--
-- CONTEXT.md's Branch gate entry already promised this: "a 'no' prices that
-- section at zero" and "a 'don't know' shows TBD." rom.ts's own comment on
-- assumptionsFor said the map did not exist yet; this migration is that map.
--
-- Judgment calls are marked inline with "Judgment call:", same convention as
-- the earlier ROM migrations.

-- =====================================================================
-- 1. branch_gate_items: one row per canonical item a gate switches
-- =====================================================================
-- `section` names the branch gate (or intake field, for parking) this row
-- reads, in whatever spelling the engine's answers bag uses for it: a branch
-- gate's own section name (e.g. "demolition"), or an intake field name
-- (parking_type's answer lands under the intake field name "parkingType",
-- because that is what config/rom/tier1-flow.json already calls it -- see
-- lib/rom/question-flow.ts's EngineInputName / intake_field mapping).
--
-- `requires_all_sections` is null for every ordinary one-question item.
-- Item 34a is the one exception LA-1028 asks for: its row's `section` is
-- "levels_below_grade" and `requires_all_sections` is `{site_conditions}`,
-- so the engine reads both before deciding. `closes_on` applies to both
-- sections in that row, because Matt's rule for 34a is symmetric ("off only
-- when both are no"), and a second, independent closes_on per extra section
-- is not needed for any of the nine rows this migration seeds. A future rule
-- that needed asymmetric closing sets would need a schema change here; this
-- one does not.
--
-- `closes_on` is the set of answers, read from every section above, that
-- turns the item off. A "don't know" always means TBD and an unanswered
-- section always means assumed present; neither is spelled out in
-- `closes_on`, because both are the engine's fixed behavior
-- (packages/engine/src/rom-gates.ts), not a per-row choice.
--
-- Judgment call: `cost_code`, like `block_classification.cost_code` before
-- it, is not foreign-keyed to `canonical_work_items.item_number`. The
-- original rom_schema.sql migration already states that link "waits on
-- Devin's export and Rob's verdict" (LA-15); this migration keeps that
-- sequencing rather than closing it here. In practice the ingestion pipeline
-- (lib/rom/ingest.ts) already writes a benchmark's cost_code as the matched
-- canonical item's item_number, so the two agree today without a foreign key
-- forcing it.
create table branch_gate_items (
  id uuid primary key default gen_random_uuid(),
  section text not null check (btrim(section) <> ''),
  cost_code text not null check (btrim(cost_code) <> ''),
  closes_on text[] not null check (array_length(closes_on, 1) > 0),
  requires_all_sections text[],
  stated_by text not null check (btrim(stated_by) <> ''),
  stated_on date not null,
  reason text not null check (btrim(reason) <> ''),
  created_at timestamptz not null default now(),

  -- One rule per section-plus-item pair. Parking gates two items (3 and
  -- 15a) from the same section, so the uniqueness is on the pair, not on
  -- cost_code alone.
  unique (section, cost_code)
);

create index branch_gate_items_cost_code_idx on branch_gate_items (cost_code);

insert into branch_gate_items
  (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
values
  ('demolition', '1', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: demolition answered no means nothing on item 1 (Demolition — site and structure).'),

  ('parking_type', '3', array['none', 'surface'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: parking none or surface means no elevated slab or podium deck scope from parking.'),
  ('parking_type', '15a', array['none', 'surface'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: parking none or surface means no garage or overhead doors.'),

  ('levels_below_grade', '34a', array['no'], array['site_conditions'],
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: item 34a (deep foundations, piles, and shoring) is off only when both levels below grade and site conditions are answered no. Either yes prices it; one no beside a don''t know is TBD.'),

  ('amenity_scope', '25', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: amenity scope answered no means nothing on item 25 (Amenity special construction).'),

  ('elevator', '26', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: no elevator means nothing on item 26 (Elevators). New gate, narrower than the six section-level gates.'),
  ('retail_storefronts', '16', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: no ground-floor retail with storefronts means nothing on item 16 (Arch. Metal & Glass). New gate.'),
  ('balconies', '11', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: no balconies means nothing on item 11 (Decking, exterior stairs, and balcony railings). New gate.'),
  ('radio_amplifier', '32a', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-24',
   'Matt, 2026-09-24: no emergency responder radio amplifier (BDA) means nothing on item 32a (Emergency responder radio coverage). New gate; existing_building_tie_in stays a note only, with no item behind it.');

alter table branch_gate_items enable row level security;

-- =====================================================================
-- 2. Four new gates on `projects`, same three-state shape as the rest
-- =====================================================================
-- Same pattern as demolition_gate and friends in
-- 20260920140000_rom_spec_decisions_catchup.sql: nullable, three answers,
-- null meaning nobody has asked yet.
alter table projects
  add column elevator_gate text
    check (elevator_gate in ('yes', 'no', 'dont_know')),
  add column retail_storefronts_gate text
    check (retail_storefronts_gate in ('yes', 'no', 'dont_know')),
  add column balconies_gate text
    check (balconies_gate in ('yes', 'no', 'dont_know')),
  add column radio_amplifier_gate text
    check (radio_amplifier_gate in ('yes', 'no', 'dont_know'));
