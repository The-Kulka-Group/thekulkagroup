-- LA-170 stores scenario deltas and their source review records.

create table underwriting_case_scenarios (
  case_id uuid not null references underwriting_cases(id) on delete cascade,
  id text not null,
  role text not null check (role in ('downside', 'upside')),
  name text not null check (char_length(name) between 1 and 80),
  input_version text not null check (input_version = 'apartment_scenario_delta.v1'),
  delta jsonb not null check (jsonb_typeof(delta) = 'object' and delta <> '{}'::jsonb),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  value_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (case_id, id),
  unique (case_id, role)
);

alter table underwriting_case_scenarios enable row level security;

alter table underwriting_calculation_runs
  drop constraint underwriting_calculation_runs_formula_version_check,
  drop constraint underwriting_calculation_runs_result_shape_check,
  add constraint underwriting_calculation_runs_formula_version_check check (
    formula_version in (
      'underwriting.preliminary_annual.v1',
      'underwriting.monthly_cost_schedule.v1',
      'underwriting.apartment_operations.v1',
      'underwriting.development_capital.v1',
      'underwriting.property_returns.v1',
      'underwriting.apartment_scenarios.v1'
    )
  ),
  add constraint underwriting_calculation_runs_result_shape_check check (
    (formula_version = 'underwriting.preliminary_annual.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'array' and jsonb_array_length(result_snapshot) > 0) or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '[]'::jsonb)))
    or (formula_version = 'underwriting.monthly_cost_schedule.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.apartment_operations.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months' and result_snapshot ? 'totals') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.development_capital.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'apartmentOperations' and result_snapshot ? 'capital') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.property_returns.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'developmentCapital' and result_snapshot ? 'forwardOperations' and result_snapshot ? 'propertyReturns') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.apartment_scenarios.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'base' and result_snapshot ? 'scenarios') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
  );
