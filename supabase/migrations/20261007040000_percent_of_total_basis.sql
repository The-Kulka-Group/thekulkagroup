-- LA-1822: a cost line can be a percent of total cost, total cost less land, or hard and soft cost.
-- The engine solves the amount, so the line stores its percent and base and no amount.

alter table underwriting_case_cost_lines
  drop constraint underwriting_case_cost_lines_basis_type_check,
  add constraint underwriting_case_cost_lines_basis_type_check check (basis_type in (
    'fixed', 'per_gross_square_foot', 'per_unit', 'percent_of_line', 'percent_of_total'
  )),
  add column basis_total_base text check (basis_total_base in (
    'total_cost', 'total_less_land', 'hard_and_soft'
  ));

alter table underwriting_case_cost_lines
  drop constraint underwriting_case_cost_lines_basis_check,
  add constraint underwriting_case_cost_lines_basis_check check (
    (basis_type = 'fixed'
      and amount is not null
      and basis_rate is null and basis_base_line_id is null and basis_percent is null
      and basis_total_base is null)
    or (basis_type in ('per_gross_square_foot', 'per_unit')
      and amount is null
      and basis_rate is not null and basis_rate > 0
      and basis_base_line_id is null and basis_percent is null and basis_total_base is null)
    or (basis_type = 'percent_of_line'
      and amount is null
      and basis_percent is not null and basis_percent > 0 and basis_percent <= 1000
      and basis_base_line_id is not null and basis_base_line_id <> id
      and basis_rate is null and basis_total_base is null)
    or (basis_type = 'percent_of_total'
      and amount is null
      and basis_percent is not null and basis_percent > 0 and basis_percent < 100
      and basis_total_base is not null
      and basis_rate is null and basis_base_line_id is null)
  );
