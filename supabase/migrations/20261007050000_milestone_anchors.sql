-- LA-1839: a case holds named milestones, and cost lines and project dates can anchor to one.
-- A line's start and end month columns keep the month the anchor resolved to on the last save,
-- so every reader of those columns still works. The anchor columns say where the month came from,
-- and the engine resolves them again on every run. Existing lines have no anchor and keep their
-- typed months.

create table underwriting_case_milestones (
  id text not null check (btrim(id) <> '' and char_length(id) <= 100),
  case_id uuid not null references underwriting_cases (id) on delete cascade,
  line_order integer not null check (line_order >= 0),
  name text not null check (btrim(name) <> '' and char_length(name) <= 80),
  month date not null check (
    month = date_trunc('month', month)::date
    and extract(year from month) between 1900 and 2200
  ),
  value_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, id)
);

create index underwriting_case_milestones_case_idx
  on underwriting_case_milestones (case_id, line_order);

alter table underwriting_case_milestones enable row level security;

alter table underwriting_case_cost_lines
  add column start_anchor_milestone_id text,
  add column start_anchor_offset_months integer,
  add column end_anchor_milestone_id text,
  add column end_anchor_offset_months integer,
  add column end_duration_months integer;

alter table underwriting_case_cost_lines
  add constraint underwriting_case_cost_lines_start_anchor_check check (
    (start_anchor_milestone_id is null and start_anchor_offset_months is null)
    or (
      btrim(start_anchor_milestone_id) <> ''
      and start_anchor_offset_months between -240 and 240
    )
  ),
  add constraint underwriting_case_cost_lines_end_anchor_check check (
    (end_anchor_milestone_id is null and end_anchor_offset_months is null and end_duration_months is null)
    or (
      btrim(end_anchor_milestone_id) <> ''
      and end_anchor_offset_months between -240 and 240
      and end_duration_months is null
    )
    or (
      end_anchor_milestone_id is null
      and end_anchor_offset_months is null
      and end_duration_months between 1 and 240
    )
  );

-- Front-loaded and back-loaded join straight line and S-curve.
alter table underwriting_case_cost_lines
  drop constraint underwriting_case_cost_lines_distribution_method_check,
  drop constraint underwriting_case_cost_lines_check1,
  add constraint underwriting_case_cost_lines_distribution_method_check check (
    distribution_method in ('straight_line', 's_curve', 'front_loaded', 'back_loaded')
  ),
  add constraint underwriting_case_cost_lines_distribution_version_check check (
    (distribution_method = 'straight_line' and distribution_version = 'straight_line.v1')
    or (distribution_method = 's_curve' and distribution_version = 's_curve.smoothstep.v1')
    or (distribution_method = 'front_loaded' and distribution_version = 'front_loaded.quadratic.v1')
    or (distribution_method = 'back_loaded' and distribution_version = 'back_loaded.quadratic.v1')
  );

-- The sale month column keeps the resolved month, the same way.
alter table underwriting_cases
  add column sale_anchor_milestone_id text,
  add column sale_anchor_offset_months integer,
  add constraint underwriting_cases_sale_anchor_check check (
    (sale_anchor_milestone_id is null and sale_anchor_offset_months is null)
    or (
      btrim(sale_anchor_milestone_id) <> ''
      and sale_anchor_offset_months between -240 and 240
    )
  );
