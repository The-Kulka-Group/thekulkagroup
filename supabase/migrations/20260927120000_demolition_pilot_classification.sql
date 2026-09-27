-- Demolition pilot classification (LA-1157, ADR 0006). Matt's statement of
-- 2026-09-26 assigns element, buyout package, and division to the six
-- demolition-pilot canonical items, so By Scope, By Package, and the Element
-- parent box (docs/adr/0006-scope-arrives-from-answers-and-relationships.md)
-- have something real to group.
--
-- Two schema additions on block_classification:
--
-- 1. `division`. The column does not exist today. Division already lives in
--    two other places, and neither covers these six rows without becoming a
--    second, wrong source of truth:
--      - `canonical_work_items.masterformat_division` has a row for item '1'
--        only; '1a', '28a', '28b', '31f' and '36a' are not rows there yet.
--        Adding them is out of this ticket's file lane (LA-1157 owns
--        block_classification, not the canonical item table), and that
--        table's own check does not allow '33', the division ADR 0006
--        states for 36a -- inserting these rows would need a constraint
--        change of its own, a separate decision.
--      - lib/rom/board.ts's `divisionOf()` reads a block's division off the
--        first two digits of its own cost_code, which works for a benchmark
--        cost code such as '26-200' but not for these six rows, keyed by
--        item number the same way `branch_gate_items` already keys scope
--        items with no benchmark behind them yet (its rows for items '1',
--        '25', '26', '32a', ...). An item number does not encode its real
--        division -- item 26, Elevators, is division 14, not 26 -- so
--        reading division off an item-number cost code would be wrong here.
--    `division` is added directly to block_classification instead, nullable
--    like every other stated fact on this table (null until somebody says).
--    `divisionOf()` is unchanged and keeps serving benchmark-keyed blocks.
--
-- 2. `is_element_driver`. Structure Demolition (1a) is the Demolition
--    element's driver: the parent box puts the driver in its full-width
--    tile. A boolean plus a partial unique index allows exactly one driver
--    per element without a second table.
--
-- `element`'s existing check only named the four Level Board elements
-- (Elevator, Bathroom, Kitchen, Balcony); 'Demolition' is added as a fifth.

alter table block_classification
  add column division text check (division is null or division ~ '^[0-9]{2}$'),
  add column is_element_driver boolean not null default false,
  add constraint block_classification_driver_needs_element
    check (not is_element_driver or element is not null);

-- Exactly one driver per element (ADR 0006). A partial unique index rather
-- than a driver column on an element table, because block_classification has
-- no element table today -- 'element' is a checked text value here, not a
-- foreign key (see the migration this one amends).
create unique index block_classification_one_driver_per_element
  on block_classification (element)
  where is_element_driver;

alter table block_classification
  drop constraint block_classification_element_check,
  add constraint block_classification_element_check
    check (element in ('Elevator', 'Bathroom', 'Kitchen', 'Balcony', 'Demolition'));

-- Matt, 2026-09-26 (LA-1157, ADR 0006). Cost codes match
-- canonical_work_items.item_number exactly, the key branch_gate_items
-- already uses for a scope item with no priced benchmark behind it.
--
-- detail_level follows the model's own tiers (see this table's own header
-- comment): item 1's lump sum and 1a's square-footage of structure both
-- arrive as one whole-scope fact with nothing further asked (level 1, Area);
-- the four disconnects are asked and counted one per structure (level 2,
-- Counts).
insert into block_classification
  (cost_code, detail_level, element, buyout_package, division, is_element_driver,
   stated_by, stated_on, reason)
values
  ('1', 1, 'Demolition', 'Demolition', '02', false,
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26 (LA-1150/ADR 0006): Site Demolition sits in the Demolition element and buyout package, MasterFormat division 02.'),

  ('1a', 1, 'Demolition', 'Demolition', '02', true,
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26 (LA-1150/ADR 0006): Structure Demolition sits in the Demolition element and buyout package, MasterFormat division 02, and is the element''s driver -- it brings in the four disconnects below.'),

  ('28a', 2, 'Demolition', 'Plumbing', '22', false,
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26 (LA-1150/ADR 0006): Plumbing Disconnect and Cap is a supporting item of Structure Demolition, bought under Plumbing, MasterFormat division 22.'),

  ('28b', 2, 'Demolition', 'Plumbing', '22', false,
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26 (LA-1150/ADR 0006): Gas Meter and Service Disconnect is a supporting item of Structure Demolition, bought under Plumbing, MasterFormat division 22. Whether it moves to the owner side stays open; this migration does not decide it.'),

  ('31f', 2, 'Demolition', 'Electrical', '26', false,
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26 (LA-1150/ADR 0006): Electrical Service Disconnect is a supporting item of Structure Demolition, bought under Electrical, MasterFormat division 26.'),

  ('36a', 2, 'Demolition', 'Site Work', '33', false,
   'mnicosia@thekulkagroup.com', date '2026-09-26',
   'Matt, 2026-09-26 (LA-1150/ADR 0006): Site Utility Cut and Cap at the Main is a supporting item of Structure Demolition, bought under Site Work, MasterFormat division 33, a division canonical_work_items does not allow yet.');
