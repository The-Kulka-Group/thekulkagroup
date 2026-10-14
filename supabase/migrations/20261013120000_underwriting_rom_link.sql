-- LA-2417: an underwriting case can link one ROM budget. rom_run_id is the
-- saved run whose figures filled the case's hard cost, so a later run on the
-- same budget shows as a newer budget to accept, never as a silent change.
-- One budget belongs to at most one case, because the two share a name.
alter table underwriting_cases
  add column rom_project_id uuid references projects (id) on delete set null,
  add column rom_run_id uuid references runs (id) on delete set null,
  add column rom_applied_at timestamptz;
create unique index underwriting_cases_rom_project_id_key
  on underwriting_cases (rom_project_id)
  where rom_project_id is not null;
