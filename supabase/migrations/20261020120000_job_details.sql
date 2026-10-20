-- LA-2881: four more facts from the same ACC Admin projects call, picked after
-- a read of every field across Kulka's 36 projects on 2026-10-20. Street and
-- zip, the map position, team size, sheet count, and the Autodesk tools turned
-- on for the project. Every column is nullable; the next sync fills them. This
-- migration adds no records.
alter table jobs
  add column address_line1 text,
  add column postal_code text,
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column member_count integer check (member_count >= 0),
  add column company_count integer check (company_count >= 0),
  add column sheet_count integer check (sheet_count >= 0),
  -- ACC product keys whose status is active, such as build, cost and docs.
  add column autodesk_tools text[];
