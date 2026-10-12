-- LA-2279, revised after the Fireflies capability research (2026-10-12).
-- Matt: Fireflies' numbers are analytics, read per project at a glance
-- (LA-2287), with sentiment clearly shown. These are the fields Fireflies
-- already returns for each transcript at no extra cost. Recording links are
-- never stored: Fireflies expires them every 24 hours.
alter table meetings
  -- OAC, coordination, owner meeting: Fireflies' own label.
  add column meeting_type text,
  add column topics jsonb not null default '[]'::jsonb,
  -- [{ title, start }] for jumping to a part of the meeting.
  add column chapters jsonb not null default '[]'::jsonb,
  -- [{ name, joinedAt, leftAt }]: who actually attended, and when.
  add column attendance jsonb not null default '[]'::jsonb,
  -- Sentiment split, categories (questions, tasks, metrics, dates) and
  -- per-speaker talk time, as Fireflies computes them.
  add column analytics jsonb not null default '{}'::jsonb,
  add column positive_pct numeric check (positive_pct between 0 and 100),
  add column neutral_pct numeric check (neutral_pct between 0 and 100),
  add column negative_pct numeric check (negative_pct between 0 and 100),
  -- Outlook ids, so a recurring series groups together.
  add column calendar_id text,
  add column calendar_event_id text,
  add column privacy text,
  -- Fireflies' summary state; the brief waits until it is done.
  add column summary_status text;
create index meetings_calendar_id on meetings (calendar_id);
