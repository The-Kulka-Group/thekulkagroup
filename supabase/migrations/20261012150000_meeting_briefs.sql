-- LA-2282: the Kulka Brief Claude writes from each meeting's transcript, with
-- what it cost and when, for the time-to-brief and cost-per-meeting metrics
-- (LA-2278 plan, metrics 2 and 10). Null until a brief is written.
alter table meetings
  add column brief jsonb,
  add column brief_model text,
  add column brief_written_at timestamptz,
  add column brief_input_tokens integer check (brief_input_tokens >= 0),
  add column brief_output_tokens integer check (brief_output_tokens >= 0),
  add column brief_error text;
