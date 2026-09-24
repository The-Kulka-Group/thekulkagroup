-- Site Work merge (LA-1015). Matt, 2026-09-23, while remapping the first real
-- import: budgets often carry one "Sitework" line covering excavation and
-- grading together, and the canonical list forced a choice between item 34
-- (excavation) and item 37 (grading). Excavation and grading now live in one
-- Site Work item. His two follow-on calls, same day:
--
--   Deep foundations (piles, shoring) leave item 34 for their own item, 34a.
--   They are lumpy allowances on a few jobs (West Shore's $350,000 pile
--   allowance, Villa's $200,000 shoring allowance), and inside Site Work they
--   would swing its rate.
--
--   Landscaping and irrigation stay on item 37 as its own item. Grading moves
--   out of 37 into 34.
--
-- No benchmark, cost import line, or block classification needs to move. The
-- only live rows on either item are Jefferson's Ferry's Sitework line on 34
-- and its Landscaping line on 37, and both already sit where the new names
-- say they belong.
--
-- Judgment call: item 34 keeps its quantity driver, CY of excavated volume.
-- Grading's driver was SF of disturbed site area, and which one fits the
-- merged item is open. It is recorded as open in canonical-work-items.md
-- rather than picked here.

update canonical_work_items
   set name = 'Site work — excavation, backfill, grading, and topsoil'
 where item_number = '34';

-- Landscaping and irrigation are MasterFormat 32 90 00 (Planting) and 32 80 00
-- (Irrigation), not Division 31 (Earthwork), which is where grading sat.
update canonical_work_items
   set name = 'Landscaping and irrigation',
       masterformat_division = '32'
 where item_number = '37';

-- 34a sorts straight after 34. sort_order is unique, so every later item
-- shifts up one, in two steps to avoid colliding with itself mid-update.
update canonical_work_items set sort_order = sort_order + 1000 where sort_order > 49;
update canonical_work_items set sort_order = sort_order - 999 where sort_order > 1000;

-- Deep foundations are MasterFormat 31 60 00 (Special Foundations and
-- Load-Bearing Elements). Building side by default: piles and shoring carry
-- the building, even though the work happens in the ground. Fixed lump sum,
-- because both source lines are single allowances.
insert into canonical_work_items
  (item_number, sort_order, name, masterformat_division, quantity_driver, scope_side, contract_side)
values
  ('34a', 50, 'Deep foundations, piles, and shoring', '31', 'Fixed lump sum', 'building', 'kulka');
