-- LA-1239: demolition's three building answers (config/rom/tier1-flow.json's
-- demolition_structure_count, _square_feet and _type) only ever lived in the
-- `responses` of the run New Budget recorded, never on the project. A later
-- run (Run settings, Edit project) had none of them. Matt, 2026-09-27: hide
-- Site Demolition until the building questions are answered, which a run
-- can only do if the answers are on the project. Nullable: null is "not
-- answered yet", and zero structures is a real answer (site work only).
alter table projects
  add column demolition_structure_count integer check (demolition_structure_count >= 0),
  add column demolition_structure_square_feet integer check (demolition_structure_square_feet > 0),
  add column demolition_structure_type text check (demolition_structure_type in (
    'wood_frame_type_v',
    'masonry_bearing_wall_type_iii',
    'pre_engineered_metal_or_light_steel',
    'steel_frame_concrete_metal_deck_type_ii',
    'cast_in_place_concrete_frame_type_i',
    'dont_know'
  ));
