-- Markup (GRs/GCs, fee, insurance) choices saved back to the project
-- (LA-1109). Run settings for framing (LA-1103) and scope gates (LA-1028)
-- already have their own project columns; markup choices had none. This adds
-- one jsonb column holding the same shape a ROM request sends as `markups`
-- (packages/engine/src/rom-markups.ts, MarkupChoices), so the next visit can
-- prefill Run settings from what was last run. No seeded data: every project
-- starts null, meaning "use the recorded defaults," the same as before this
-- column existed.

alter table projects
  add column markup_choices jsonb;
