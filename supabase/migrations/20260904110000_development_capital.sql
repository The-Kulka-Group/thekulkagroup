-- LA-168 stores the reviewed construction capital plan and keeps prior runs readable.

alter table underwriting_cases
  add column development_capital_input_version text,
  add column development_capital_input jsonb,
  add column development_capital_changed_at timestamptz,
  add constraint underwriting_cases_development_capital_check check (
    (development_capital_input_version is null and development_capital_input is null and development_capital_changed_at is null)
    or (
      development_capital_input_version = 'development_capital_inputs.v1'
      and jsonb_typeof(development_capital_input) = 'object'
      and development_capital_changed_at is not null
    )
  );

alter table underwriting_calculation_runs
  drop constraint underwriting_calculation_runs_formula_version_check,
  drop constraint underwriting_calculation_runs_result_shape_check,
  add constraint underwriting_calculation_runs_formula_version_check check (
    formula_version in (
      'underwriting.preliminary_annual.v1',
      'underwriting.monthly_cost_schedule.v1',
      'underwriting.apartment_operations.v1',
      'underwriting.development_capital.v1'
    )
  ),
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
    or (
      formula_version = 'underwriting.apartment_operations.v1'
      and (
        (status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months' and result_snapshot ? 'totals')
        or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)
      )
    )
    or (
      formula_version = 'underwriting.development_capital.v1'
      and (
        (status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'apartmentOperations' and result_snapshot ? 'capital')
        or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)
      )
    )
  );
