-- Framing item names (Matt, 2026-09-24). The first backtest (LA-23) showed the
-- two loaded jobs file their structure differently: Jefferson's Ferry is
-- framed in load-bearing light-gauge metal studs, carried with its drywall on
-- item 17, and Fieldstone is wood frame, carried on item 8. Matt's call is to
-- keep exactly two framing items, one for wood framing and one for metal
-- framing and drywall together, rather than splitting metal structure out on
-- its own.
--
-- Names only. No benchmark, import line, or classification moves, because
-- every loaded line already sits on the item the new names describe.
-- Ceilings, including acoustical, stay inside item 17 as before; Fieldstone's
-- "Drywall & ACT" line is filed there.

update canonical_work_items set name = 'Wood framing' where item_number = '8';
update canonical_work_items set name = 'Metal framing and drywall' where item_number = '17';
