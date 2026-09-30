-- Published budgets (LA-1417, spec LA-1309 "A run becomes a published
-- budget"). One row per issue of a run to a client: an unguessable token for
-- the link at /b/<token>, a version number per project, and a complete
-- snapshot the page renders from alone. The page never reads `runs` or calls
-- the engine, so a later run, migration or benchmark change cannot move a
-- figure a client already has.
--
-- Rows are frozen. The only changes allowed after insert are write-once:
-- `revoked_at` (the link was withdrawn), `superseded_by` (a newer version
-- was published) and `pdf_path` (the stored PDF, rendered from this row's
-- own page after the row exists). Each goes from null to a value once and
-- never changes again. Nothing deletes a row.
--
-- Judgment call: `pdf_path` is write-once rather than fixed at insert. The
-- spec renders the PDF from the published page itself, which needs the row
-- to exist first.
--
-- Judgment call: `run_id` and `project_id` restrict deletes. A published
-- budget is a record of what a client was handed, so deleting the project or
-- run behind it must fail rather than take the record with it. Projects are
-- archived, not deleted, in normal use.
create table published_budgets (
  id uuid primary key default gen_random_uuid(),
  -- 16 random bytes as unpadded base64url: 22 characters, safe in a URL.
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  run_id uuid not null references runs (id) on delete restrict,
  project_id uuid not null references projects (id) on delete restrict,
  version integer not null check (version > 0),
  -- The four stages the page's stage bar names. Only a conceptual budget can
  -- be published today, because the engine only computes a ROM.
  stage text not null check (stage in ('conceptual', 'design_development', 'pre_construction', 'final')),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  pdf_path text check (pdf_path is null or btrim(pdf_path) <> ''),
  issued_at timestamptz not null default now(),
  issued_by text not null check (btrim(issued_by) <> ''),
  revoked_at timestamptz,
  superseded_by uuid references published_budgets (id),

  unique (project_id, version),
  check (superseded_by is null or superseded_by <> id)
);

create index published_budgets_run_idx on published_budgets (run_id);

create function reject_published_budget_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Published budgets are never deleted.';
  end if;
  if new.id is distinct from old.id
     or new.token is distinct from old.token
     or new.run_id is distinct from old.run_id
     or new.project_id is distinct from old.project_id
     or new.version is distinct from old.version
     or new.stage is distinct from old.stage
     or new.snapshot is distinct from old.snapshot
     or new.issued_at is distinct from old.issued_at
     or new.issued_by is distinct from old.issued_by
     or (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at)
     or (old.superseded_by is not null and new.superseded_by is distinct from old.superseded_by)
     or (old.pdf_path is not null and new.pdf_path is distinct from old.pdf_path) then
    raise exception 'A published budget is frozen. Only revoked_at, superseded_by and pdf_path can be set, once each.';
  end if;
  return new;
end;
$$;

create trigger published_budgets_are_frozen
before update or delete on published_budgets
for each row execute function reject_published_budget_change();

-- Same rule as every other table here: row level security on with no
-- policies. The server reaches it as the owner; the anon key reaches nothing.
alter table published_budgets enable row level security;
