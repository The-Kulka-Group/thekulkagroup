-- Framing system on projects (LA-1103, Matt's call, 2026-09-25).
--
-- Items 8 (Wood framing) and 17 (Metal framing and drywall) hold different
-- scope depending on how a past job was framed. Jefferson's Ferry (C00456) is
-- load-bearing light-gauge metal, so its structure and drywall sit on item 17.
-- Fieldstone North Broadway (C00449) is wood frame, so its structure sits on
-- item 8 and item 17 holds only drywall, ceilings and interior studs. The
-- engine now blends those two items only across jobs framed the same way as
-- the project being estimated (packages/engine/src/rom-framing.ts).
--
-- `projects` holds both the past jobs a benchmark comes from and the project
-- a ROM is built for, so one column serves both. Null means nobody has
-- recorded it, the same way every branch gate column reads null. There is no
-- 'dont_know' value: unknown is null, and the engine holds items 8 and 17 for
-- review when the target's column is null.

alter table projects
  add column framing_system text check (framing_system in ('wood', 'metal'));

-- The two recorded facts (docs/precon/canonical-work-items.md, items 8 and
-- 17). The table has no job-number column, so the job number sits in the
-- project name, for example "Fieldstone North Broadway (C00449)". No other
-- job gets a value here. A database where neither name matches updates no
-- rows, which is correct: nothing is guessed.
-- Jefferson's Ferry is also matched by its project id, recorded 2026-09-24,
-- in case its name does not carry the job number.
update projects set framing_system = 'metal'
 where name like '%C00456%' or id = 'f619d711-8257-4fd8-9344-aba3b97dc998';
update projects set framing_system = 'wood' where name like '%C00449%';
