-- LA-1704 adds the lease-up expense ramp, lease-up concessions, seasonal absorption and the
-- stabilization rule. Operations runs move to underwriting.apartment_operations.v3, whose months and
-- totals also store leaseUpConcessionLoss. The stored result keeps the v2 top-level shape. Earlier
-- versions stay valid and readable.

alter table underwriting_calculation_runs
  drop constraint underwriting_calculation_runs_formula_version_check,
  drop constraint underwriting_calculation_runs_result_shape_check,
  add constraint underwriting_calculation_runs_formula_version_check check (
    formula_version in (
      'underwriting.preliminary_annual.v1',
      'underwriting.monthly_cost_schedule.v1',
      'underwriting.apartment_operations.v1',
      'underwriting.apartment_operations.v2',
      'underwriting.apartment_operations.v3',
      'underwriting.development_capital.v1',
      'underwriting.development_capital.v2',
      'underwriting.property_returns.v1',
      'underwriting.property_returns.v2',
      'underwriting.property_returns.v3',
      'underwriting.apartment_scenarios.v1'
    )
  ),
  add constraint underwriting_calculation_runs_result_shape_check check (
    (formula_version = 'underwriting.preliminary_annual.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'array' and jsonb_array_length(result_snapshot) > 0) or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '[]'::jsonb)))
    or (formula_version = 'underwriting.monthly_cost_schedule.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.apartment_operations.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months' and result_snapshot ? 'totals') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.apartment_operations.v2' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months' and result_snapshot ? 'totals' and result_snapshot ? 'propertyTax') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.apartment_operations.v3' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'months' and result_snapshot ? 'totals' and result_snapshot ? 'propertyTax') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.development_capital.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'apartmentOperations' and result_snapshot ? 'capital') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.development_capital.v2' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'apartmentOperations' and result_snapshot ? 'capital' and result_snapshot->'capital' ? 'rateSchedule') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.property_returns.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'developmentCapital' and result_snapshot ? 'forwardOperations' and result_snapshot ? 'propertyReturns') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.property_returns.v2' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'developmentCapital' and result_snapshot ? 'forwardOperations' and result_snapshot ? 'propertyReturns' and result_snapshot ? 'lenderTests') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.property_returns.v3' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'developmentCapital' and result_snapshot ? 'forwardOperations' and result_snapshot ? 'propertyReturns' and result_snapshot ? 'lenderTests' and result_snapshot ? 'saleTax') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
    or (formula_version = 'underwriting.apartment_scenarios.v1' and ((status = 'complete' and jsonb_array_length(issues) = 0 and jsonb_typeof(result_snapshot) = 'object' and result_snapshot ? 'base' and result_snapshot ? 'scenarios') or (status = 'failed' and jsonb_array_length(issues) > 0 and result_snapshot = '{}'::jsonb)))
  );
