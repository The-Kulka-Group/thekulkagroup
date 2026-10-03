-- Client comments (LA-1485, ticket 2 of LA-1480; spec
-- docs/precon/client-comments-spec.md, Decision 2). Three tables:
-- `budget_readers` holds the people Kulka lets comment on a project,
-- `budget_threads` holds one comment, question or flag on one element of one
-- published version, and `budget_messages` holds the opening post and every
-- reply in a thread. Schema only. Production starts empty.
--
-- Nothing is deleted. Triggers reject every delete and allow only the stated
-- updates, each of them one-way:
--   readers   revoked_at, once.
--   threads   status moves (open to answered, answered to open, either to
--             closed, closed is final), the close fields set together with
--             that move, `proposed` cleared once with `proposed_removed_at`,
--             and `addressed_in`, once.
--   messages  an AI draft released (draft to client with released_at and
--             released_by), hidden_at with hidden_by, and a removal that sets
--             removed_at and removed_by and clears body. Each happens once.
--
-- Departure from the spec's DDL: the spec writes the last thread check as
-- `addressed_in is null or outcome = 'accepted'`. When outcome is null that
-- reads null, and Postgres lets a null check pass, so an open thread could
-- take an addressed_in. The check here wraps the comparison in coalesce.
--
-- Judgment call: `addressed_in` uses a composite foreign key with
-- `project_id`, not the spec's plain key on `published_budgets (id)`, so an
-- accepted flag can only be carried into a version of its own project.
--
-- Judgment call: a trigger on `budget_threads` also requires a reader's close
-- to name the reader who opened the thread (Decision 4: a comment or question
-- closes by the reader who wrote it, or by Kulka), and one on
-- `budget_messages` rejects a reader post from a revoked reader or from a
-- reader of another project, because a message has no project column to give
-- a composite key.
--
-- Trigger functions set search_path to empty, so every table in them is
-- schema-qualified.

-- Composite keys so a thread's version, project and reader can never disagree.
create unique index published_budgets_id_project_idx on published_budgets (id, project_id);

create table budget_readers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects (id) on delete restrict,
  -- 16 random bytes as unpadded base64url, the same form as a budget token.
  reader_key text not null unique check (reader_key ~ '^[A-Za-z0-9_-]{22}$'),
  name text not null check (btrim(name) <> ''),
  email text not null check (email ~ '^[^@\s]+@[^@\s]+$'),
  company text check (company is null or btrim(company) <> ''),
  created_at timestamptz not null default now(),
  created_by text not null check (btrim(created_by) <> ''),
  revoked_at timestamptz,
  unique (id, project_id)
);
create index budget_readers_project_idx on budget_readers (project_id);

create table budget_threads (
  id uuid primary key default gen_random_uuid(),
  published_budget_id uuid not null,
  project_id uuid not null,
  -- A data-el id from that version's page model, or page:general.
  element_id text not null check (element_id ~ '^[a-z][a-z-]*:[A-Za-z0-9_.:-]+$'),
  -- From the page model at post time: {section, label, text, figure}.
  anchor jsonb not null check (jsonb_typeof(anchor) = 'object'),
  kind text not null check (kind in ('comment', 'question', 'flag')),
  -- A flag's correction, in the owner's words: "What It Should Be".
  proposed text check (proposed is null or btrim(proposed) <> ''),
  -- Set when the reader asked Kulka to remove a flag's correction. proposed is cleared.
  proposed_removed_at timestamptz,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'answered', 'closed')),
  outcome text check (outcome in ('accepted', 'declined', 'withdrawn')),
  closed_at timestamptz,
  closed_by_reader uuid references budget_readers (id) on delete restrict,
  closed_by_staff text check (closed_by_staff is null or btrim(closed_by_staff) <> ''),
  -- An accepted flag, once a later version is published.
  addressed_in uuid,

  foreign key (published_budget_id, project_id) references published_budgets (id, project_id) on delete restrict,
  foreign key (opened_by, project_id) references budget_readers (id, project_id) on delete restrict,
  foreign key (addressed_in, project_id) references published_budgets (id, project_id) on delete restrict,
  check ((kind = 'flag') = (proposed is not null or proposed_removed_at is not null)),
  check (proposed is null or proposed_removed_at is null),
  check (outcome is null or kind = 'flag'),
  check ((status = 'closed') = (closed_at is not null)),
  check (status <> 'closed' or (closed_by_reader is null) <> (closed_by_staff is null)),
  check (kind <> 'flag' or status <> 'closed' or outcome is not null),
  check (outcome <> 'withdrawn' or closed_by_reader is not null),
  check (outcome not in ('accepted', 'declined') or closed_by_staff is not null),
  -- outcome = 'accepted' is null when outcome is null, and a check passes on null,
  -- so the test is wrapped to make an open thread fail it.
  check (addressed_in is null or coalesce(outcome = 'accepted', false))
);
create index budget_threads_version_idx on budget_threads (published_budget_id);
create index budget_threads_project_open_idx on budget_threads (project_id) where status <> 'closed';

create table budget_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references budget_threads (id) on delete restrict,
  author_kind text not null check (author_kind in ('reader', 'staff', 'ai')),
  reader_id uuid references budget_readers (id) on delete restrict,
  -- The name the client reads, and the account that wrote it
  -- (open-access@kulka.invalid while sign-in is off).
  staff_name text check (staff_name is null or btrim(staff_name) <> ''),
  staff_account text check (staff_account is null or btrim(staff_account) <> ''),
  -- Null only after the writer asked for removal (removed_at set).
  body text check (body is null or char_length(btrim(body)) between 1 and 4000),
  -- client: shown on the page. internal: Kulka only. draft: an AI reply no one has released.
  visibility text not null check (visibility in ('client', 'internal', 'draft')),
  -- AI replies only: model, prompt version, the element ids and snapshot paths it cites.
  provenance jsonb check (provenance is null or jsonb_typeof(provenance) = 'object'),
  released_at timestamptz,
  released_by text check (released_by is null or btrim(released_by) <> ''),
  hidden_at timestamptz,
  hidden_by text check (hidden_by is null or btrim(hidden_by) <> ''),
  -- Set when the writer asked Kulka to remove their words. The body is cleared.
  removed_at timestamptz,
  removed_by text check (removed_by is null or btrim(removed_by) <> ''),
  -- Reader posts only: the random device cookie.
  device_id text check (device_id is null or device_id ~ '^[A-Za-z0-9_-]{22}$'),
  created_at timestamptz not null default now(),

  check ((author_kind = 'reader') = (reader_id is not null)),
  check ((author_kind = 'reader') = (device_id is not null)),
  check (author_kind <> 'staff' or (staff_name is not null and staff_account is not null)),
  check ((author_kind = 'ai') = (provenance is not null)),
  check (author_kind <> 'reader' or visibility = 'client'),
  check (visibility <> 'draft' or author_kind = 'ai'),
  check ((released_at is null) = (released_by is null)),
  check (released_at is null or author_kind = 'ai'),
  check ((hidden_at is null) = (hidden_by is null)),
  check ((removed_at is null) = (removed_by is null)),
  check ((body is null) = (removed_at is not null))
);
create index budget_messages_thread_idx on budget_messages (thread_id, created_at);

-- Readers: never deleted, and only revoked_at changes, once.
create function reject_budget_reader_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Budget readers are never deleted.';
  end if;
  if new.id is distinct from old.id
     or new.project_id is distinct from old.project_id
     or new.reader_key is distinct from old.reader_key
     or new.name is distinct from old.name
     or new.email is distinct from old.email
     or new.company is distinct from old.company
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'A budget reader is frozen. Only revoked_at can be set, once.';
  end if;
  return new;
end;
$$;

create trigger budget_readers_are_frozen
before update or delete on budget_readers
for each row execute function reject_budget_reader_change();

-- Threads: never deleted. The element, anchor, kind and opener never change.
-- Status moves one way into closed. The correction on a flag clears once.
create function reject_budget_thread_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Budget threads are never deleted.';
  end if;

  if new.id is distinct from old.id
     or new.published_budget_id is distinct from old.published_budget_id
     or new.project_id is distinct from old.project_id
     or new.element_id is distinct from old.element_id
     or new.anchor is distinct from old.anchor
     or new.kind is distinct from old.kind
     or new.opened_by is distinct from old.opened_by
     or new.opened_at is distinct from old.opened_at then
    raise exception 'A budget thread is fixed once opened. Its version, element, anchor, kind and opener never change.';
  end if;

  if new.proposed is distinct from old.proposed
     or new.proposed_removed_at is distinct from old.proposed_removed_at then
    if not (old.proposed is not null
            and old.proposed_removed_at is null
            and new.proposed is null
            and new.proposed_removed_at is not null) then
      raise exception 'A flag correction can only be removed, once, by clearing proposed and setting proposed_removed_at together.';
    end if;
  end if;

  if new.status is distinct from old.status then
    if not ((old.status = 'open' and new.status in ('answered', 'closed'))
            or (old.status = 'answered' and new.status in ('open', 'closed'))) then
      raise exception 'A thread status moves only open to answered, answered to open, or to closed. Closed is final.';
    end if;
  end if;

  if old.status = 'closed' then
    if new.closed_at is distinct from old.closed_at
       or new.closed_by_reader is distinct from old.closed_by_reader
       or new.closed_by_staff is distinct from old.closed_by_staff
       or new.outcome is distinct from old.outcome then
      raise exception 'A closed thread is final. Its outcome and close fields never change.';
    end if;
  elsif new.status <> 'closed' then
    if new.closed_at is distinct from old.closed_at
       or new.closed_by_reader is distinct from old.closed_by_reader
       or new.closed_by_staff is distinct from old.closed_by_staff
       or new.outcome is distinct from old.outcome then
      raise exception 'Only closing a thread sets its outcome and close fields.';
    end if;
  elsif new.closed_by_reader is not null
        and new.closed_by_reader is distinct from old.opened_by then
    raise exception 'Only the reader who opened a thread can close it as a reader.';
  end if;

  if old.addressed_in is not null and new.addressed_in is distinct from old.addressed_in then
    raise exception 'A thread addressed_in is set once and never changes.';
  end if;

  return new;
end;
$$;

create trigger budget_threads_are_fixed
before update or delete on budget_threads
for each row execute function reject_budget_thread_change();

-- Messages: never deleted. A body is never edited. Three one-time updates are
-- allowed: release an AI draft, hide, and remove (which clears the body).
create function reject_budget_message_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Budget messages are never deleted.';
  end if;

  if new.id is distinct from old.id
     or new.thread_id is distinct from old.thread_id
     or new.author_kind is distinct from old.author_kind
     or new.reader_id is distinct from old.reader_id
     or new.staff_name is distinct from old.staff_name
     or new.staff_account is distinct from old.staff_account
     or new.provenance is distinct from old.provenance
     or new.device_id is distinct from old.device_id
     or new.created_at is distinct from old.created_at then
    raise exception 'A budget message is frozen. Only release, hide and remove can change it, once each.';
  end if;

  if new.visibility is distinct from old.visibility
     or new.released_at is distinct from old.released_at
     or new.released_by is distinct from old.released_by then
    if not (old.visibility = 'draft'
            and new.visibility = 'client'
            and old.released_at is null
            and new.released_at is not null) then
      raise exception 'Only an unreleased AI draft can be released, once, from draft to client.';
    end if;
  end if;

  if new.hidden_at is distinct from old.hidden_at
     or new.hidden_by is distinct from old.hidden_by then
    if not (old.hidden_at is null and new.hidden_at is not null) then
      raise exception 'A message can be hidden once, and never shown again.';
    end if;
  end if;

  if new.body is distinct from old.body
     or new.removed_at is distinct from old.removed_at
     or new.removed_by is distinct from old.removed_by then
    if not (old.removed_at is null
            and new.removed_at is not null
            and new.body is null) then
      raise exception 'A message body is never edited. It can only be removed, once, which clears it.';
    end if;
  end if;

  return new;
end;
$$;

create trigger budget_messages_are_frozen
before update or delete on budget_messages
for each row execute function reject_budget_message_change();

-- A reader post must come from an active reader of the thread's own project.
create function check_budget_message_reader()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.reader_id is not null and not exists (
    select 1
    from public.budget_readers r
    join public.budget_threads t on t.project_id = r.project_id
    where r.id = new.reader_id
      and t.id = new.thread_id
      and r.revoked_at is null
  ) then
    raise exception 'A reader can post only on a thread in the reader''s own project, and a revoked reader cannot post.';
  end if;
  return new;
end;
$$;

create trigger budget_messages_check_reader
before insert on budget_messages
for each row execute function check_budget_message_reader();

-- Same rule as every other table here: row level security on with no
-- policies. The server reaches these as the owner; the anon key reaches nothing.
alter table budget_readers enable row level security;
alter table budget_threads enable row level security;
alter table budget_messages enable row level security;
