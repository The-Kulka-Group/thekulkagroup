-- Immutable preliminary underwriting runs for LA-161. A run keeps the case,
-- evidence, input, issue, and result snapshots used at that moment.

alter table underwriting_cases
  add column case_revision bigint not null default 1 check (case_revision > 0);

alter table underwriting_case_assumptions
  add column value_changed_at timestamptz not null default now();

alter table underwriting_case_assumptions
  drop constraint underwriting_case_assumptions_assumption_key_check;

alter table underwriting_case_assumptions
  add constraint underwriting_case_assumptions_assumption_key_check
  check (assumption_key in (
    'purchase_price',
    'monthly_rent',
    'hard_cost_per_gross_square_foot',
    'soft_cost_percent',
    'contingency_percent',
    'vacancy_percent',
    'operating_expense_percent',
    'construction_months',
    'debt_percent',
    'interest_rate_percent',
    'exit_cap_rate_percent',
    'hold_years'
  ));

alter table underwriting_case_assumptions
  drop constraint underwriting_case_assumptions_check;

alter table underwriting_case_assumptions
  add constraint underwriting_case_assumptions_assumption_unit_check
  check (
    (assumption_key = 'purchase_price' and unit = 'usd')
    or (assumption_key = 'monthly_rent' and unit = 'usd_per_month')
    or (
      assumption_key = 'hard_cost_per_gross_square_foot'
      and unit = 'usd_per_gross_square_foot'
    )
    or (assumption_key = 'construction_months' and unit = 'months')
    or (
      assumption_key in (
        'soft_cost_percent',
        'contingency_percent',
        'vacancy_percent',
        'operating_expense_percent',
        'debt_percent',
        'interest_rate_percent',
        'exit_cap_rate_percent'
      )
      and unit = 'percent'
      and value <= 100
    )
    or (assumption_key = 'hold_years' and unit = 'years')
  );

create table underwriting_calculation_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references underwriting_cases (id) on delete restrict,
  case_revision bigint not null check (case_revision > 0),
  formula_version text not null
    check (formula_version = 'underwriting.preliminary_annual.v1'),
  status text not null check (status in ('complete', 'failed')),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  evidence_snapshot jsonb not null check (jsonb_typeof(evidence_snapshot) = 'object'),
  result_snapshot jsonb not null default '[]'::jsonb
    check (jsonb_typeof(result_snapshot) = 'array'),
  issues jsonb not null default '[]'::jsonb check (jsonb_typeof(issues) = 'array'),
  created_at timestamptz not null default now(),
  check (
    (
      status = 'complete'
      and jsonb_array_length(issues) = 0
      and jsonb_array_length(result_snapshot) > 0
    )
    or (
      status = 'failed'
      and jsonb_array_length(issues) > 0
      and jsonb_array_length(result_snapshot) = 0
    )
  )
);

create index underwriting_calculation_runs_case_idx
  on underwriting_calculation_runs (case_id, created_at desc);

create function reject_underwriting_run_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Underwriting calculation runs are immutable.';
end;
$$;

create trigger underwriting_runs_are_immutable
before update or delete on underwriting_calculation_runs
for each row execute function reject_underwriting_run_mutation();

alter table underwriting_calculation_runs enable row level security;
