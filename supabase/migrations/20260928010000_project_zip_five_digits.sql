-- LA-1224: New Budget and Edit Project now take the full five-digit ZIP.
-- LA-1199 asked for only the first three digits because this column's check
-- (20260920140000_rom_spec_decisions_catchup.sql) allowed nothing else. The
-- app now sends five digits. Three digits stays legal here so any project
-- saved under LA-1199 keeps its value; the app no longer accepts three.
alter table projects drop constraint if exists projects_zip_check;
alter table projects
  add constraint projects_zip_check check (zip ~ '^([0-9]{3}|[0-9]{5})$');
