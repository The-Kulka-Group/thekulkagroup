alter function reject_underwriting_run_mutation()
  set search_path = '';

alter function valid_underwriting_fact_metadata(jsonb)
  set search_path = '';

alter function reconcile_underwriting_fact_metadata(
  jsonb,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  numeric,
  jsonb,
  bigint,
  timestamptz
)
  set search_path = '';
