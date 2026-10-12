-- LA-2274: the balcony answers (config/rom/tier1-flow.json's balcony_type,
-- balcony_count, balcony_deck_square_feet, balcony_rail_linear_feet,
-- juliet_count and juliet_rail_linear_feet) only lived in the `responses` of
-- the run New Budget recorded. A later run from Run Settings or Edit Project
-- read the project record, found none of them, and dropped the balconies.
-- Saved here, the way LA-1239 saved demolition's answers, so every later run
-- keeps them and Edit Project can change them. Numeric, since the flow takes
-- a decimal deck area or rail length. Nullable: null is "not answered yet".
alter table projects
  add column balcony_type text check (balcony_type in ('full', 'juliet')),
  add column balcony_count numeric check (balcony_count > 0),
  add column balcony_deck_square_feet numeric check (balcony_deck_square_feet > 0),
  add column balcony_rail_linear_feet numeric check (balcony_rail_linear_feet > 0),
  add column juliet_count numeric check (juliet_count > 0),
  add column juliet_rail_linear_feet numeric check (juliet_rail_linear_feet > 0);
