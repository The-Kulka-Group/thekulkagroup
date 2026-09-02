-- LA-166 adds a dated cost schedule without changing prior annual run records.

alter table underwriting_cases
  add column analysis_start_month date,
  add column sale_month date,
  add constraint underwriting_cases_schedule_months_check check (
    (analysis_start_month is null and sale_month is null)
    or (
      analysis_start_month is not null
      and sale_month is not null
      and analysis_start_month = date_trunc('month', analysis_start_month)::date
      and sale_month = date_trunc('month', sale_month)::date
      and sale_month >= analysis_start_month
    )
  );

create table underwriting_case_cost_lines (
  id text not null check (btrim(id) <> '' and char_length(id) <= 100),
  case_id uuid not null references underwriting_cases (id) on delete cascade,
  line_order integer not null check (line_order >= 0),
  name text not null check (btrim(name) <> '' and char_length(name) <= 200),
  category text not null check (category in (
    'land', 'hard_cost', 'soft_cost', 'development_fee', 'financing_fee'
  )),
  amount numeric not null check (amount > 0),
  unit text not null check (unit = 'usd'),
  start_month date not null check (start_month = date_trunc('month', start_month)::date),
  end_month date not null check (
    end_month = date_trunc('month', end_month)::date and end_month >= start_month
  ),
  distribution_method text not null check (distribution_method in ('straight_line', 's_curve')),
  distribution_version text not null,
  source_label text,
  source_date date,
  review_state text not null check (review_state in ('working', 'done')),
  value_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, id),
  check (source_label is null or btrim(source_label) <> ''),
  check (
    (distribution_method = 'straight_line' and distribution_version = 'straight_line.v1')
    or (distribution_method = 's_curve' and distribution_version = 's_curve.smoothstep.v1')
  )
);

create index underwriting_case_cost_lines_case_idx
  on underwriting_case_cost_lines (case_id, line_order);

alter table underwriting_case_cost_lines enable row level security;

alter table underwriting_calculation_runs
  drop constraint underwriting_calculation_runs_formula_version_check,
  drop constraint underwriting_calculation_runs_result_snapshot_check,
  add constraint underwriting_calculation_runs_formula_version_check check (
    formula_version in (
      'underwriting.preliminary_annual.v1',
      'underwriting.monthly_cost_schedule.v1'
    )
  ),
  add column reconciliation_checks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reconciliation_checks) = 'array'),
  drop constraint underwriting_calculation_runs_check,
  add constraint underwriting_calculation_runs_result_shape_check check (
    (
      formula_version = 'underwriting.preliminary_annual.v1'
      and (
        (status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'array' and jsonb_array_length(result_snapshot) > 0)
        or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '[]'::jsonb)
      )
    )
    or (
      formula_version = 'underwriting.monthly_cost_schedule.v1'
      and (
        (status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months')
        or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)
      )
    )
  );
