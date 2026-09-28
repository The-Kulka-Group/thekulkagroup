-- Matt, 2026-09-28: Kulka's work is nearly always open shop, so nobody
-- should have to pick it on every budget. Labor Type defaults to Open Shop,
-- every project without one becomes Open Shop, and Edit Project changes it
-- for a union or prevailing-wage job.
update projects set labor_type = 'open_shop' where labor_type is null;

alter table projects
  alter column labor_type set default 'open_shop',
  alter column labor_type set not null;
