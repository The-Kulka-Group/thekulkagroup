-- Ingestion gate: stage, approve, queryable (LA-15). A signed-in user imports
-- a cost file; every line lands in `cost_import_lines`, staged and visible
-- for review, before anything reaches `benchmarks` (which is what the
-- engine's `lib/rom/run.ts` reads). Only approving the whole import promotes
-- its confidently-mapped, eligible lines into real benchmark rows with full
-- provenance. Vocabulary is CONTEXT.md: "Benchmark", "Provenance",
-- "Canonical work item", and "Line role" are used exactly as defined there.
--
-- Every judgment call this migration makes that is not spelled out verbatim
-- by LA-15's own brief is marked inline with "Judgment call:", the same
-- convention 20260920140000_rom_spec_decisions_catchup.sql uses. They are
-- summarized again in the LA-15 PR description.

-- =====================================================================
-- 1. The import batch: one row per uploaded file
-- =====================================================================
-- LA-15: "The user approves the import, and only then do rows become
-- queryable benchmarks... carrying full provenance (source project, export,
-- date)." `source_project_id` and `export_label` are that provenance's two
-- named parts; `uploaded_at`'s own date is the third. They are not
-- duplicated onto every line -- each line inherits them from its import at
-- approval time, the same way `benchmark_source_projects` already keeps one
-- provenance fact (which projects) off the benchmark row itself and in a
-- join table instead.
--
-- Judgment call: provenance_kind is restricted to 'actuals' or
-- 'proest_budget' here, not the full three-value set `benchmarks
-- .provenance_kind` allows. 'reviewed_judgment' names a number with no
-- export behind it (rom_schema.sql's own comment: "every number traces to
-- an export or a named reviewed judgment"); an imported *file* is
-- definitionally an export, so offering the no-export option on an import
-- would let it claim a provenance kind that contradicts its own nature.
--
-- Judgment call: approval is a single action over the whole import, not
-- per line. LA-15 says "The user approves the import" (singular), and every
-- staged line that mapped with confidence and carries an eligible line role
-- promotes together, in one call. A line that stayed unmapped is untouched
-- by this and needs a human to resolve it by hand; LA-15's acceptance
-- criteria ask only that such a line "appear in a review list," not for a
-- remap-and-approve flow for one line at a time, so this migration and
-- lib/rom/ingest.ts do not build one. See the PR description.
create table cost_imports (
  id uuid primary key default gen_random_uuid(),
  source_project_id uuid not null references projects (id) on delete restrict,
  export_label text not null check (btrim(export_label) <> ''),
  provenance_kind text not null check (provenance_kind in ('actuals', 'proest_budget')),
  uploaded_by text not null check (btrim(uploaded_by) <> ''),
  uploaded_at timestamptz not null default now(),

  status text not null default 'staged' check (status in ('staged', 'approved')),
  approved_by text,
  approved_at timestamptz,
  check ((status = 'approved') = (approved_by is not null and approved_at is not null))
);

create index cost_imports_source_project_idx on cost_imports (source_project_id, uploaded_at desc);

-- =====================================================================
-- 2. The staged lines: one row per line in the file, visible for review
--    before approval (LA-15 AC1)
-- =====================================================================
-- Judgment call: `value_usd_per_gsf` reads the file's raw number directly as
-- an already-computed usd_per_gsf rate -- the only unit `benchmarks.unit`
-- accepts today. Deriving usd_per_gsf from a raw dollar total and a
-- canonical item's own quantity driver (bathroom count, EA, LF...) is real
-- normalization work for a future ticket; LA-15's brief says "don't
-- over-engineer the parser," and the schema itself has no second unit for
-- this migration to target yet.
--
-- Judgment call: `line_role` exists here because of ADR 0003 ("Every
-- imported budget line carries a role... Only scope, lump and allowance
-- lines may feed a benchmark, and a takeoff helper never can"), a closed
-- decision this migration must not contradict, not something LA-15 names by
-- itself. Every parsed row defaults to 'scope': v1's parser does no content
-- classification (same "don't over-engineer" reasoning as the value column
-- above), so nothing here can yet tell a real scope line from a duplicate or
-- a takeoff helper. The column, its check constraint, and the exclusion
-- rule in lib/rom/ingest.ts's approveCostImport exist so the gate stays
-- ADR-0003-correct the day a reviewer (or a smarter pass) can set a line's
-- role to something other than 'scope'; no API in this ticket exposes
-- changing it yet. See the PR description.
--
-- Note for a future reader: CONTEXT.md's own "Line role" glossary entry
-- lists four roles (real scope, allowance, takeoff helper, duplicate) and
-- says "only scope and allowance... are allowed to feed a benchmark,"
-- omitting ADR 0003's fifth role, "lump," and its place in the eligible
-- set. This migration follows the ADR, the more specific and later-dated
-- decision record, rather than silently picking one; the mismatch is
-- flagged, not resolved, in the LA-15 PR description.
--
-- `candidate_canonical_item_id` and `candidate_score` are always populated
-- (the best-scoring canonical item found for this line, whatever the
-- score), not only when confident, so a reviewer looking at an unmapped
-- line can see what the closest guess was and how far short it fell,
-- instead of nothing. `status = 'unmapped'` is what actually enforces AC4
-- ("instead of being forced into the nearest code"): an unmapped line's
-- candidate is informational only and is never written onto a benchmark.
create table cost_import_lines (
  id uuid primary key default gen_random_uuid(),
  cost_import_id uuid not null references cost_imports (id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_description text not null check (btrim(raw_description) <> ''),
  raw_division text,
  -- Fixed in code review (2026-09-20): was `> 0`. Real cost exports
  -- routinely carry a legitimate $0 line -- an absorbed allowance, a VE
  -- credit, a credited change order -- and rejecting the whole file over
  -- one such row (the old behavior: lib/rom/cost-file-parse.ts threw
  -- synchronously on the first `value <= 0` row) throws away every other
  -- valid row in it too. `>= 0` lets a $0 row stage and stay visible for
  -- review. It can never carry `benchmarks.value`'s own `check (value > 0)`
  -- (20260827120000_rom_schema.sql, already applied, not this migration's
  -- to change) forward, since a $0 rate is not a unit-cost signal a future
  -- ROM can use -- `approveCostImport` excludes a $0 line from promotion
  -- the same way it excludes a role-ineligible one, so this constraint
  -- loosening only ever widens what can be staged and reviewed, never what
  -- can become a benchmark.
  value_usd_per_gsf numeric not null check (value_usd_per_gsf >= 0),

  line_role text not null default 'scope'
    check (line_role in ('scope', 'lump', 'allowance', 'takeoff_helper', 'duplicate')),

  candidate_canonical_item_id uuid not null references canonical_work_items (id),
  candidate_score numeric not null check (candidate_score >= 0 and candidate_score <= 1),

  -- 'staged': mapped with confidence, waiting on the import's own approval.
  -- 'unmapped': its candidate's score fell below the match threshold -- AC4's
  --   bucket. Left alone by import approval until a human resolves it (out
  --   of scope for LA-15; see the PR description).
  -- 'approved': promoted into `benchmarks` (see benchmark_id below).
  -- 'excluded': mapped confidently, but its line role is one ADR 0003 never
  --   lets feed a benchmark ('takeoff_helper' or 'duplicate'), so approval
  --   skipped it on purpose rather than silently promoting it.
  status text not null default 'staged'
    check (status in ('staged', 'unmapped', 'approved', 'excluded')),

  benchmark_id uuid references benchmarks (id) on delete set null,
  created_at timestamptz not null default now(),

  unique (cost_import_id, row_number),
  check ((status = 'approved') = (benchmark_id is not null))
);

create index cost_import_lines_import_idx on cost_import_lines (cost_import_id, row_number);

-- Backs the cross-import review list AC4/AC5 name ("appear in a review
-- list"): every unapproved, unmapped line, newest import first.
create index cost_import_lines_unmapped_idx on cost_import_lines (created_at desc)
  where status = 'unmapped';

-- Row level security, on with no policies, same rule as every other table in
-- this schema: server code reaches these over a direct Postgres connection as
-- owner, which bypasses row level security, so the app keeps working; this
-- only locks the anon-key door.
alter table cost_imports enable row level security;
alter table cost_import_lines enable row level security;
