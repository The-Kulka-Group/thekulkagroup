-- LA-167 stores reviewed operating inputs and keeps prior formula runs readable.

alter table underwriting_cases
  add column apartment_operations_input_version text,
  add column apartment_operations_input jsonb,
  add column apartment_operations_changed_at timestamptz,
  add constraint underwriting_cases_apartment_operations_check check (
    (apartment_operations_input_version is null and apartment_operations_input is null and apartment_operations_changed_at is null)
    or (
      apartment_operations_input_version = 'apartment_operations_inputs.v1'
      and jsonb_typeof(apartment_operations_input) = 'object'
      and apartment_operations_changed_at is not null
    )
  );

alter table underwriting_calculation_runs
  drop constraint underwriting_calculation_runs_formula_version_check,
  drop constraint underwriting_calculation_runs_result_shape_check,
  add constraint underwriting_calculation_runs_formula_version_check check (
    formula_version in (
      'underwriting.preliminary_annual.v1',
      'underwriting.monthly_cost_schedule.v1',
      'underwriting.apartment_operations.v1'
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
  );
