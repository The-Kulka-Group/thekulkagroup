-- Block classification (LA-884). A block is one ROM line. This table records
-- three stated facts about the line: which level of information detail its
-- quantity arrives at, which element it belongs to when it belongs to one, and
-- which level 1 lump it is carved out of when it is a breakout.
--
-- Levels are tiers of information detail, never storeys of a building.
--   1  Area. Square feet.
--   2  Counts. Whole objects at building or unit scale.
--   3  Points inside a room, or a spec choice.
--   4  Material and labor. Below the threshold, never asked for.
--
-- This migration ships the mechanism and seeds no rows. Which level a real
-- cost code sits at, and which element it belongs to, is Kulka's own
-- classification to state. No agent may infer one. A line with no row here
-- comes back from the engine unclassified and says so on screen, rather than
-- being filed under a guess.
--
-- Judgment call: the key is `cost_code`, not a foreign key onto
-- `canonical_work_items.item_number`.
-- 20260920140000_rom_spec_decisions_catchup.sql states that
-- `benchmarks.cost_code` is deliberately not foreign-keyed to the canonical
-- list, because closing that link waits on Devin's Autodesk export. This table
-- keys off the same bare cost code so it joins to a benchmark today. Once that
-- link lands, the classification can move onto the canonical item and be read
-- through it instead.
create table block_classification (
  id uuid primary key default gen_random_uuid(),

  -- One classification per cost code. A second row for the same code would
  -- mean two people stated two different levels with nothing saying which won.
  cost_code text not null unique check (btrim(cost_code) <> ''),

  detail_level smallint not null check (detail_level between 1 and 4),

  -- One physical thing that arrives as a single fact and costs across several
  -- trades. The four are settled by the Level Board, and an element earns its
  -- place only when requesters commonly hand over its count, so the list is a
  -- check rather than free text. Null means the line belongs to no element.
  element text check (element in ('Elevator', 'Bathroom', 'Kitchen', 'Balcony')),

  -- The level 1 lump this block is carved out of. Kulka's electrical is one
  -- rate per square foot that already contains the elevator wiring, so a
  -- wiring block added on top would count it twice. A block naming a parent
  -- here keeps its own cost on screen and adds nothing to either total.
  breakout_of_cost_code text check (
    breakout_of_cost_code is null or btrim(breakout_of_cost_code) <> ''
  ),
  check (breakout_of_cost_code is null or breakout_of_cost_code <> cost_code),

  -- The scope as it was actually bought: one subcontract with one supplier
  -- (CONTEXT.md: Buyout package). A package can span more than one division,
  -- which is why it is its own axis beside division and element
  -- (docs/adr/0002-a-rom-rolls-up-three-ways.md). Null until somebody says
  -- which package the code was bought under.
  buyout_package text check (buyout_package is null or btrim(buyout_package) <> ''),

  -- Provenance, the same three parts ADR 0005 asks of any number or decision
  -- set by judgment: whose judgment, when, and the reason. A classification
  -- with no stated reason is refused.
  stated_by text not null check (btrim(stated_by) <> ''),
  stated_on date not null,
  reason text not null check (btrim(reason) <> ''),

  created_at timestamptz not null default now()
);

create index block_classification_level_idx on block_classification (detail_level, cost_code);
create index block_classification_element_idx on block_classification (element)
  where element is not null;
create index block_classification_breakout_idx on block_classification (breakout_of_cost_code)
  where breakout_of_cost_code is not null;

-- Row level security on with no policies, which denies everyone. Server-side
-- code reaches this over a direct Postgres connection as the owner and keeps
-- working; an anon key holder gets nothing, the same as every other cost table.
alter table block_classification enable row level security;
