-- LA-3045: people, roles, and who can open which tool. Tool and department
-- keys come from lib/tools/catalog.ts (LA-3044); lib/access/level.ts reads
-- these rows to answer one question, a person's level for a tool, and
-- lib/access/store.ts writes them. Sign-in is still off (KULKA_AUTH_OPEN=1),
-- so nothing here locks anyone out yet. Additive only: five new tables and the
-- five built-in roles.
create table roles (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{0,59}$'),
  name text not null unique check (length(trim(name)) between 1 and 80),
  built_in boolean not null default false,
  created_at timestamptz not null default now()
);
alter table roles enable row level security;

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  email text not null check (email = lower(trim(email)) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
  title text check (length(title) <= 160),
  role_key text not null references roles (key),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index people_email on people (email);
alter table people enable row level security;

-- A role's level for a whole department or for one tool. No row means the
-- role has no setting there. The Owner role never has rows: it opens every
-- tool at Edit, and lib/access/store.ts refuses to write one.
create table role_access (
  role_key text not null references roles (key),
  target_kind text not null check (target_kind in ('department', 'tool')),
  target_key text not null check (target_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  level text not null check (level in ('hidden', 'view', 'edit')),
  updated_at timestamptz not null default now(),
  primary key (role_key, target_kind, target_key)
);
alter table role_access enable row level security;

-- One person's override of their role for a department or a tool. It needs a
-- reason, and it stops applying after ends_on when one is set.
create table access_exceptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people (id) on delete cascade,
  target_kind text not null check (target_kind in ('department', 'tool')),
  target_key text not null check (target_key ~ '^[a-z][a-z0-9-]{0,59}$'),
  level text not null check (level in ('hidden', 'view', 'edit')),
  reason text not null check (length(trim(reason)) between 1 and 500),
  ends_on date,
  set_by text not null check (length(trim(set_by)) between 1 and 200),
  created_at timestamptz not null default now(),
  unique (person_id, target_kind, target_key)
);
alter table access_exceptions enable row level security;

-- Every change to role_access or access_exceptions, written in the same
-- transaction as the change. A null level means no setting: a row added has
-- a null from_level and a row removed has a null to_level.
create table access_changes (
  id uuid primary key default gen_random_uuid(),
  changed_by text not null check (length(trim(changed_by)) between 1 and 200),
  subject_kind text not null check (subject_kind in ('role', 'person')),
  -- A role key, or a person id as text.
  subject_key text not null,
  target_kind text not null check (target_kind in ('department', 'tool')),
  target_key text not null,
  from_level text check (from_level in ('hidden', 'view', 'edit')),
  to_level text check (to_level in ('hidden', 'view', 'edit')),
  reason text check (length(reason) <= 500),
  changed_at timestamptz not null default now(),
  check (from_level is distinct from to_level)
);
create index access_changes_changed_at on access_changes (changed_at desc);
alter table access_changes enable row level security;
-- Browser roles receive no policy on any of these tables. The authorized server owns access.

insert into roles (key, name, built_in) values
  ('owner', 'Owner', true),
  ('admin', 'Admin', true),
  ('project_manager', 'Project Manager', true),
  ('estimator', 'Estimator', true),
  ('finance', 'Finance', true);
