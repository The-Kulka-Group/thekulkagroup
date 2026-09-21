-- Engine parameters with provenance (LA-14). Blend weights, flag thresholds,
-- and range widths used to be constants in packages/engine/src/rom.ts, the
-- one place cost judgment sat in source, which LA-9 forbids ("All cost
-- knowledge lives in Kulka's Supabase, never in source constants"). They are
-- rows now, each flagged as judgment with a name and a date until LA-23's
-- backtest measures it, the same mechanism ADR 0005 uses for dial stops.
--
-- Every value below is either carried over from the walking skeleton's own
-- provisional table (LA-12) or a figure Matt or Devin stated. None is new.
-- Judgment calls are marked inline, same convention as the LA-816 migration.

create table engine_parameters (
  id uuid primary key default gen_random_uuid(),
  -- "weight.actuals", "flag.high_min_comparables", "spread.low": the names the
  -- engine reads, spelled exactly as packages/engine/src/rom.ts's ParameterName.
  name text not null unique check (name ~ '^[a-z_]+\.[a-z_]+$'),
  value numeric not null,

  -- 'backtest' is the kind LA-23 writes once a value is measured against real
  -- error rather than set by judgment.
  provenance_kind text not null check (provenance_kind in ('reviewed_judgment', 'backtest')),
  provenance_recorded_by text not null check (btrim(provenance_recorded_by) <> ''),
  provenance_recorded_at date not null,
  -- Why this value, in plain words, citing the decision it came from. A
  -- parameter with no stated reason is a fudge factor wearing a label
  -- (ADR 0005).
  reason text not null check (btrim(reason) <> ''),

  created_at timestamptz not null default now()
);

insert into engine_parameters
  (name, value, provenance_kind, provenance_recorded_by, provenance_recorded_at, reason)
values
  ('weight.actuals', 5, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Devin''s anchor from the 2026-08-26 call: Autodesk Cost actuals outweigh ProEst budgets about five to one (docs/precon/direction.md; LA-9 "the blend must reflect that order, with exact weights calibrated during backtest"). Measured against a ProEst budget at weight one.'),
  ('weight.proest_budget', 1, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'The unit the actuals weight is stated against. Same source as weight.actuals.'),
  ('weight.reviewed_judgment', 2, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Matt, 2026-09-21, answering a worked case (a real job at $22/SF counting 5, a ProEst budget at $26/SF counting 1, an estimator''s rule of thumb at $24/SF, a model''s figure at $30/SF): the estimator''s rule counts 2. Pending LA-23''s backtest.'),
  ('weight.llm_proposal', 0.5, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Same worked case: the model''s figure counts half, the lightest signal in the blend (LA-9: "never solely determines a line"). Pending LA-23''s backtest.'),
  ('flag.high_min_comparables', 5, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Carried over unchanged from the walking skeleton''s provisional table in rom.ts (LA-12), pending LA-23''s backtest. A high flag needs at least this many distinct Kulka projects behind the line.'),
  ('flag.medium_min_comparables', 2, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Carried over unchanged from the walking skeleton''s provisional table in rom.ts (LA-12), pending LA-23''s backtest.'),
  ('spread.high', 0.10, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Carried over unchanged from the walking skeleton''s provisional table in rom.ts (LA-12), pending LA-23''s backtest. Half-width of a high-confidence range as a fraction of the midpoint, and how far apart its comparables may sit.'),
  ('spread.medium', 0.20, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Carried over unchanged from the walking skeleton''s provisional table in rom.ts (LA-12), pending LA-23''s backtest.'),
  ('spread.low', 0.35, 'reviewed_judgment', 'Matt Nicosia', date '2026-09-21',
   'Carried over unchanged from the walking skeleton''s provisional table in rom.ts (LA-12), pending LA-23''s backtest. Also the hard cap: no line is ever wider than this.');

-- A model's figure for a work item with no Kulka data behind it (LA-9: "the
-- LLM proposes a figure and it is flagged low and weighted below every
-- measured value"). Nothing produces one yet; the blend has to know the kind
-- so the first producer does not need a schema change.
alter table benchmarks drop constraint benchmarks_provenance_kind_check;
alter table benchmarks add constraint benchmarks_provenance_kind_check check (
  provenance_kind in ('actuals', 'proest_budget', 'reviewed_judgment', 'llm_proposal')
);

-- The "every number traces to an export or a named reviewed judgment" check
-- from rom_schema.sql, widened: a model's proposal has no export either.
alter table benchmarks drop constraint benchmarks_check;
alter table benchmarks add constraint benchmarks_export_named_check check (
  provenance_kind in ('reviewed_judgment', 'llm_proposal')
  or nullif(btrim(provenance_export_label), '') is not null
);

-- The hash of the snapshot (benchmark rows plus parameters) a run computed
-- from. Same answers plus same hash means the same ROM, byte for byte, which
-- is what makes LA-23's report reproducible. Nullable only because runs that
-- predate this column, or died before reading their snapshot, have none.
alter table runs add column snapshot_hash text;

-- Row level security: on, with no policies, same rule as every other table
-- here. Server code reaches it over a direct connection as owner.
alter table engine_parameters enable row level security;
