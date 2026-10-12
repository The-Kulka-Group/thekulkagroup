-- LA-2281: each meeting's Autodesk job (LA-2283). job_id null with a match
-- source of 'manual' means a person said the meeting belongs to no job
-- (an internal meeting). A manual match is never replaced by the matcher.
alter table meetings
  add column job_id uuid references jobs(id) on delete set null,
  add column match_source text check (match_source in ('job_number', 'series', 'job_name', 'manual'));
create index meetings_job_id on meetings (job_id, started_at desc);
