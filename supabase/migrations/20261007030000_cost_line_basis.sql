-- LA-1820: a cost line can be priced per gross square foot, per unit or as a percent of another
-- line (LA-1819). A derived line stores its rate or percent and no amount, so the entered rate
-- and the amount the engine derives never mix. Existing lines stay fixed.

alter table underwriting_case_cost_lines
  alter column amount drop not null,
  add column basis_type text not null default 'fixed' check (basis_type in (
    'fixed', 'per_gross_square_foot', 'per_unit', 'percent_of_line'
  )),
  add column basis_rate numeric,
  add column basis_base_line_id text,
  add column basis_percent numeric;

alter table underwriting_case_cost_lines
  add constraint underwriting_case_cost_lines_basis_check check (
    (basis_type = 'fixed'
      and amount is not null
      and basis_rate is null and basis_base_line_id is null and basis_percent is null)
    or (basis_type in ('per_gross_square_foot', 'per_unit')
      and amount is null
      and basis_rate is not null and basis_rate > 0
      and basis_base_line_id is null and basis_percent is null)
    or (basis_type = 'percent_of_line'
      and amount is null
      and basis_percent is not null and basis_percent > 0 and basis_percent <= 1000
      and basis_base_line_id is not null and basis_base_line_id <> id
      and basis_rate is null)
  );
