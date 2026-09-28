-- Item 26a, the elevator bulkhead, is driven by the same elevator gate as
-- item 26 (LA-1205; 20260924140000_branch_gate_items.sql already gates item
-- 26 off the 'elevator' section on 'no'). A separate row, not an edit to that
-- earlier migration, because it already shipped.

insert into branch_gate_items
  (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
values
  ('elevator', '26a', array['no'], null,
   'mnicosia@thekulkagroup.com', date '2026-09-27',
   'Matt, 2026-09-27: no elevator means nothing on item 26a (Elevator Bulkhead), the same gate as item 26.');
