-- Catches the ROM schema up to the sixteen spec decisions closed under LA-675
-- since the walking skeleton (LA-12, 2026-08-27). Vocabulary is CONTEXT.md.
-- This is LA-816: a schema and seed-data migration, not a UI change. Every
-- section below cites the Linear ticket and doc passage it implements.
--
-- Judgment calls this migration makes that are not spelled out verbatim by a
-- cited decision are marked inline with "Judgment call:" so they are not
-- buried. They are also summarized in the LA-816 PR description.

-- =====================================================================
-- 1. Building count and the three-state phasing gate (LA-677)
-- =====================================================================
-- LA-677's resolution: "A project holds a building count, not a list of
-- buildings... Phasing is the variable that matters. The intake asks it as a
-- three-state branch gate: built at once, in phases, or don't know."
--
-- Judgment call: building_count is NOT NULL DEFAULT 1 rather than nullable.
-- Every real project has at least one building, unlike the other gates below
-- where "unanswered" is a real, distinct state from any of the answers. A
-- default of 1 does not invent an answer the way defaulting a yes/no/don't-know
-- gate would.
alter table projects
  add column building_count integer not null default 1 check (building_count > 0);

-- Judgment call: phasing stays nullable (no default), same reasoning as the
-- five permanent branch gates below and consistent with this schema's existing
-- precedent of leaving gross_square_feet nullable even though the engine
-- requires it before a ROM can run (lib/rom/run.ts already throws its own
-- explicit "no gross square feet" error at compute time rather than the
-- database inventing a value). NULL means "not yet asked"; 'dont_know' means
-- "asked, and the answer is unknown" -- CONTEXT.md's Branch gate entry treats
-- those as different facts.
alter table projects
  add column phasing text check (phasing in ('built_at_once', 'phased', 'dont_know'));

-- =====================================================================
-- 2. Scope side and contract side, defaulted from the canonical work item
--    (LA-677, LA-679)
-- =====================================================================
-- CONTEXT.md: "Scope side: Whether a line is building work or site work...
-- Contract side: Whether a line is in Kulka's contract or bought by the owner
-- direct, such as appliances or a trash compactor." Both "carry a default, so
-- the estimator sets it only when moving a line" / "only when a specific job
-- is unusual" -- the canonical work item is where that default lives (section
-- 8 below). `benchmarks` is this schema's one table of priced lines today, so
-- it gets the same two columns, overridable per row, same as a canonical
-- item's default is overridable per line once budget_lines exists (LA-15).
alter table benchmarks
  add column scope_side text not null default 'building'
    check (scope_side in ('building', 'site')),
  add column contract_side text not null default 'kulka'
    check (contract_side in ('kulka', 'owner'));

-- =====================================================================
-- 3. Parking type, the required branch gate, and its two benchmarks
--    (LA-682)
-- =====================================================================
-- LA-682's resolution: "Intake gains a required minimum branch gate: none,
-- surface, structured, underground, or don't know... Pricing is two
-- benchmarks, both on gross square feet: a base paving rate that always
-- applies (site scope). A structured-or-underground increment on top of it
-- (building scope), zero for surface and none... No stall count is asked or
-- stored anywhere."
--
-- Judgment call: "required" is enforced at the point a ROM is computed, the
-- same way gross_square_feet already is (see lib/rom/run.ts), not by a
-- database NOT NULL. A NOT NULL here would break every project record that
-- predates this migration and conflict with the "don't know" answer being a
-- first-class, representable state rather than something the schema forces a
-- guess about.
--
-- The two parking benchmarks (base paving, structured/underground increment)
-- need no new table: they are `usd_per_gsf` benchmark rows like any other,
-- priced with the scope_side just added above (site for paving, building for
-- the increment). No stall count column exists anywhere in this migration,
-- matching the decision exactly.
alter table projects
  add column parking_type text
    check (parking_type in ('none', 'surface', 'structured', 'underground', 'dont_know'));

-- =====================================================================
-- 4. Gross square feet per unit, stored directly, by product type (LA-678)
-- =====================================================================
-- LA-678's resolution: "the tool proposes gross square feet from a stored
-- GSF-per-unit benchmark, by product type... It stores gross square feet per
-- unit directly... rather than a net unit size plus a separate gross-to-net
-- efficiency factor."
--
-- Judgment call: "product type" is not a term this codebase defines anywhere
-- else. The decision names this as "same pattern as the duration proposal"
-- (LA-677, also keyed off the project), and the only product-type-shaped axis
-- that already exists is `project_type` (multifamily / self_storage) on
-- `projects` and `benchmarks`. This table reuses it rather than inventing a
-- second vocabulary for the same idea.
--
-- Not seeded: the only real data point today (Jefferson's Ferry, n=1, per
-- LA-678's own comment) is a single job's derived ratio, not a reviewed
-- benchmark, and this repo's own recent history (see "Replace estimating's
-- fabricated pipeline with an honest empty state") is to leave a table honestly
-- empty rather than seed it with a number nobody has reviewed as a benchmark.
create table gsf_per_unit_benchmarks (
  id uuid primary key default gen_random_uuid(),
  project_type text not null check (project_type in ('multifamily', 'self_storage')),
  gross_square_feet_per_unit numeric not null check (gross_square_feet_per_unit > 0),
  comparable_count integer not null default 0 check (comparable_count >= 0),

  provenance_kind text not null check (
    provenance_kind in ('actuals', 'proest_budget', 'reviewed_judgment')
  ),
  provenance_export_label text,
  provenance_recorded_by text not null check (btrim(provenance_recorded_by) <> ''),
  provenance_recorded_at date not null,

  check (
    provenance_kind = 'reviewed_judgment'
    or nullif(btrim(provenance_export_label), '') is not null
  ),

  created_at timestamptz not null default now()
);

-- One GSF-per-unit figure per product type, same "no two conflicting numbers
-- for the same thing" shape as the rest of this schema.
create unique index gsf_per_unit_benchmarks_product_type_idx
  on gsf_per_unit_benchmarks (project_type);

create table gsf_per_unit_benchmark_source_projects (
  gsf_per_unit_benchmark_id uuid not null
    references gsf_per_unit_benchmarks (id) on delete cascade,
  project_id uuid not null references projects (id) on delete restrict,
  primary key (gsf_per_unit_benchmark_id, project_id)
);

create index gsf_per_unit_benchmark_source_projects_project_idx
  on gsf_per_unit_benchmark_source_projects (project_id, gsf_per_unit_benchmark_id);

-- The fact a GSF-per-unit benchmark converts: how many units the project has.
-- Nullable, because a call that already gives gross square feet directly never
-- needs this (rom-spec.md: "Where the call gives unit count and not area...").
alter table projects
  add column unit_count integer check (unit_count > 0);

-- =====================================================================
-- 5. The five permanent branch gates, three-state (LA-676, LA-694)
-- =====================================================================
-- LA-694's resolution names exactly five: Demolition (abatement folded in as
-- a sub-question), Levels below grade, Existing building tie-in, Site
-- conditions, Amenity scope. LA-676's resolution: "Three-state branch gates.
-- Yes, no, or don't know. A 'no' closes the branch and prices it at zero with
-- high confidence... A 'don't know' shows TBD on the schedule of values,
-- contributes nothing to the total... Silence is never read as zero."
--
-- Judgment call: same nullable-until-answered reasoning as phasing and
-- parking_type above applies to all five. None of the sub-detail LA-694 lists
-- under each gate (structure count, era, utility relocation, and so on) is
-- itemized as its own required column by LA-816; that finer intake detail
-- stays out of this migration's scope rather than being invented here.
alter table projects
  add column demolition_gate text
    check (demolition_gate in ('yes', 'no', 'dont_know')),
  -- Sub-question, only meaningful once demolition_gate is 'yes' (LA-694: not
  -- its own gate). The table-level check below ties the two together.
  add column demolition_abatement_needed text
    check (demolition_abatement_needed in ('yes', 'no', 'dont_know')),
  add column levels_below_grade_gate text
    check (levels_below_grade_gate in ('yes', 'no', 'dont_know')),
  add column existing_building_tie_in_gate text
    check (existing_building_tie_in_gate in ('yes', 'no', 'dont_know')),
  add column site_conditions_gate text
    check (site_conditions_gate in ('yes', 'no', 'dont_know')),
  add column amenity_scope_gate text
    check (amenity_scope_gate in ('yes', 'no', 'dont_know'));

-- Fixed in code review (2026-09-20): `demolition_gate = 'yes'` evaluates to
-- NULL, not false, when demolition_gate is itself unanswered, and a CHECK
-- only rejects a row on false -- Postgres treats NULL as passing. That let
-- demolition_abatement_needed be set while demolition_gate was still
-- unasked, exactly the state this constraint exists to block. Guarding with
-- `demolition_gate is not null and ...` forces the right-hand side to a real
-- false in that case instead of an unknown.
alter table projects
  add constraint projects_abatement_needs_demolition check (
    demolition_abatement_needed is null
    or (demolition_gate is not null and demolition_gate = 'yes')
  );

-- =====================================================================
-- 6. Nullable link from an issued ROM to the project it becomes, plus
--    closing comparisons (LA-680)
-- =====================================================================
-- LA-680's resolution: "an issued ROM carries a nullable link to the project
-- record it becomes, set whenever the link exists, not required at issue time
-- (same reasoning that already made the pursuit link nullable...)." The
-- nullable, non-cascading FK shape below matches this repo's existing nullable
-- link pattern at
-- supabase/migrations/20260906030000_vision_discovery.sql:17
-- (`opportunity_id uuid unique references vision_opportunities(id)...`).
--
-- Judgment call: unlike that pattern, linked_project_id is NOT unique here. A
-- project can reasonably accumulate more than one issued ROM over time (a
-- revised ROM re-issued against the same eventual project), and nothing in
-- LA-680 says a project may only ever be the destination of one ROM.
--
-- "runs" is this schema's frozen-version substrate already: a succeeded run's
-- `rom` column is never mutated again, and LA-680 cites "Decision 21 makes an
-- issued ROM a frozen version" as the reason a comparison has something stable
-- to run against. Issuing is layered onto that existing row rather than a new
-- table, per LA-816's instruction to extend the seam, not replace it.
alter table runs
  add column linked_project_id uuid references projects (id) on delete set null,
  -- Item 10 (LA-681): timestamp for when the issued ROM was printed/exported.
  add column issued_at timestamptz;

create index runs_linked_project_idx
  on runs (linked_project_id)
  where linked_project_id is not null;

-- "It's a separate scored record, not a new benchmark row" (LA-680). Predicted
-- trade cost comes from the run's own frozen `rom.total`; actual trade cost
-- comes from whatever import triggered the comparison. ADR 0005 already sets
-- the 10 percent bar this reuses ("A ROM is successful when its undialed
-- output lands within ten percent of award value..."; rom-spec.md pins the
-- *closing* comparison specifically to trade cost, not award value).
--
-- Judgment call: no foreign key or trigger here actually fires this
-- automatically off an import. LA-680's "triggered automatically whenever
-- budget or actuals data is imported" describes an importer (LA-15) that does
-- not exist yet in this repo -- the original rom_schema.sql migration's own
-- comment already says cost-code ingestion "waits on Devin's export and Rob's
-- verdict." This migration adds the table the automatic trigger will write to,
-- plus (packages/engine/src/rom-intake.ts) the pure scoring function and
-- (lib/rom/issue.ts) the write path LA-15's importer calls once it exists. It
-- does not fabricate the importer itself, which is out of scope for LA-816.
create table closing_comparisons (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references runs (id) on delete cascade,
  project_id uuid not null references projects (id) on delete cascade,
  predicted_trade_cost_low numeric not null check (predicted_trade_cost_low >= 0),
  predicted_trade_cost_high numeric not null
    check (predicted_trade_cost_high >= predicted_trade_cost_low),
  actual_trade_cost numeric not null check (actual_trade_cost >= 0),
  -- Signed percent error of the ROM midpoint against actual trade cost.
  percent_error numeric not null,
  within_ten_percent boolean not null,
  -- A partially complete job's actuals are partial too (CONTEXT.md: Actuals
  -- "always carries the job's percent complete"), same column shape as
  -- projects.percent_complete already uses.
  percent_complete numeric check (percent_complete >= 0 and percent_complete <= 100),
  created_at timestamptz not null default now()
);

create index closing_comparisons_run_idx on closing_comparisons (run_id, created_at desc);
create index closing_comparisons_project_idx
  on closing_comparisons (project_id, created_at desc);

-- =====================================================================
-- 7. Location factor, ZIP, and market (LA-689)
-- =====================================================================
-- LA-689's resolution: "A stated location factor of 1.00 on the face of the
-- ROM, not user-editable in v1... Capture the market on every project record.
-- Three-digit ZIP plus a market label."
--
-- Judgment call: location_factor is pinned to 1.00 by a CHECK constraint, not
-- only by convention, since the decision is explicit that it is "not
-- user-editable in v1." Enforcing the read-only promise in the schema means a
-- future bug cannot silently write a different value.
alter table projects
  add column zip text check (zip ~ '^[0-9]{3}$'),
  add column market text,
  add column location_factor numeric not null default 1.00
    check (location_factor = 1.00);

-- =====================================================================
-- 8. The frozen 54-item canonical work list, as real seed data (LA-720,
--    LA-721)
-- =====================================================================
-- docs/precon/canonical-work-items.md: "Status: FROZEN, approved by Matt on
-- 2026-09-19... 54 canonical work items across 19 MasterFormat divisions."
-- Every row below transcribes that file's own "Quantity drivers (LA-720)"
-- table (its single source of truth for driver text) plus each item's own
-- section heading for its name and division. Renaming an item here is a spine
-- change per that file's own header, so names are copied verbatim, including
-- its own punctuation.
--
-- Judgment call: quantity_driver stores the decided driver text verbatim
-- rather than a normalized enum. Several items (9, 21, 28, 29) carry a real,
-- decided split ("Bathroom count / unit count, split") that does not reduce to
-- one taxonomy value without inventing categories the source file itself does
-- not define. Storing the frozen text as a real column, queryable by SQL,
-- satisfies LA-816's "as data, not left as markdown-only" without that
-- invention.
--
-- Judgment call: scope_side and contract_side defaults are derived, not
-- separately decided anywhere in the six closed tickets (grepped for "scope
-- side" and "contract side" across docs/ and CONTEXT.md: neither term appears
-- next to a per-item table). They are derived directly from decisions that do
-- exist: rom-spec.md's own parking example prices the base paving rate (item
-- 38, Division 32) as site scope and everything else as building scope, so
-- scope_side = 'site' for every item under Division 31 (Earthwork/Sitework)
-- and Division 32 (Exterior Improvements, ADR 0004's own division scheme),
-- and 'building' for every other division. contract_side = 'owner' only for
-- item 22 (Residential appliances) and item 23 (Trash compactors and chutes)
-- -- CONTEXT.md's own Contract side entry names both by example ("appliances
-- or a trash compactor") -- and 'kulka' for everything else, matching
-- rom-spec.md's "everything else defaults to Kulka."
--
-- Judgment call: cost_code on `benchmarks` is deliberately NOT foreign-keyed
-- to item_number here. The original rom_schema.sql migration already states
-- cost-code linkage "waits on Devin's export and Rob's verdict" (LA-15); this
-- migration keeps that sequencing rather than silently closing it.
create table canonical_work_items (
  id uuid primary key default gen_random_uuid(),
  -- '1', '3a', '31e'... preserves the frozen list's own numbering, letters
  -- and all, exactly as canonical-work-items.md names them.
  item_number text not null unique,
  sort_order integer not null,
  name text not null,
  masterformat_division text not null check (
    masterformat_division in (
      '02', '03', '04', '05', '06', '07', '08', '09', '10',
      '12', '13', '14', '21', '22', '23', '26', '28', '31', '32'
    )
  ),
  quantity_driver text not null,
  scope_side text not null default 'building' check (scope_side in ('building', 'site')),
  contract_side text not null default 'kulka' check (contract_side in ('kulka', 'owner')),
  created_at timestamptz not null default now()
);

create unique index canonical_work_items_sort_order_idx on canonical_work_items (sort_order);
create index canonical_work_items_division_idx on canonical_work_items (masterformat_division);

insert into canonical_work_items
  (item_number, sort_order, name, masterformat_division, quantity_driver, scope_side, contract_side)
values
  ('1', 1, 'Demolition — site and structure', '02', 'Fixed lump sum', 'building', 'kulka'),
  ('2', 2, 'Foundations, footings, and slab-on-grade', '03', 'Gross square feet', 'building', 'kulka'),
  ('3', 3, 'Elevated slabs and podium deck', '03', 'Gross square feet', 'building', 'kulka'),
  ('3a', 4, 'Gypcrete topping', '03', 'Gross square feet', 'building', 'kulka'),
  ('4', 5, 'Precast concrete structure', '03', 'Gross square feet', 'building', 'kulka'),
  ('5', 6, 'CMU / concrete block walls', '04', 'SF of rated wall area', 'building', 'kulka'),
  ('6', 7, 'Brick and masonry veneer', '04', 'SF of veneer area', 'building', 'kulka'),
  ('7', 8, 'Structural and miscellaneous metals — railings, stairs, canopies', '05', 'LF of railing/guardrail run', 'building', 'kulka'),
  ('7a', 9, 'Structural steel framing', '05', 'Gross square feet', 'building', 'kulka'),
  ('8', 10, 'Shell framing — wood structure', '06', 'Gross square feet', 'building', 'kulka'),
  ('8a', 11, 'Wood stairs and railings', '06', 'EA, stair count per building', 'building', 'kulka'),
  ('9', 12, 'Finish carpentry — trim, casing, molding, interior door install', '06', 'Unit count (door install) / LF (trim), split', 'building', 'kulka'),
  ('10', 13, 'Millwork and closet interiors', '06', 'LF of closet/cabinet run', 'building', 'kulka'),
  ('11', 14, 'Decking, exterior stairs, and balcony railings', '06', 'SF of deck/balcony area', 'building', 'kulka'),
  ('12', 15, 'Building insulation', '07', 'Gross square feet', 'building', 'kulka'),
  ('13', 16, 'Roofing, gutters, and roof pavers', '07', 'Gross square feet', 'building', 'kulka'),
  ('14', 17, 'Siding and exterior wall cladding', '07', 'Gross square feet', 'building', 'kulka'),
  ('14a', 18, 'Firestopping', '07', 'EA per rated-wall/floor penetration', 'building', 'kulka'),
  ('15', 19, 'Doors, frames, and hardware — interior, exterior, and entry', '08', 'Unit count', 'building', 'kulka'),
  ('15a', 20, 'Garage and overhead doors', '08', 'EA, garage-bay count', 'building', 'kulka'),
  ('16', 21, 'Arch. Metal & Glass', '08', 'SF of storefront/curtain wall glazing', 'building', 'kulka'),
  ('16a', 22, 'Residential windows', '08', 'EA, window opening count', 'building', 'kulka'),
  ('17', 23, 'Drywall, interior framing install, and ceilings (including acoustical)', '09', 'Gross square feet', 'building', 'kulka'),
  ('18', 24, 'Tile and stone', '09', 'Bathroom count', 'building', 'kulka'),
  ('19', 25, 'Flooring — resilient and carpet', '09', 'Gross square feet', 'building', 'kulka'),
  ('19a', 26, 'Wood flooring', '09', 'Gross square feet', 'building', 'kulka'),
  ('20', 27, 'Painting', '09', 'Gross square feet', 'building', 'kulka'),
  ('21', 28, 'Specialties — protection, accessories, storage, lockers, mailboxes', '10', 'Bathroom count', 'building', 'kulka'),
  ('22', 29, 'Residential appliances', '10', 'Unit count', 'building', 'owner'),
  ('23', 30, 'Trash compactors and chutes', '10', 'EA per building', 'building', 'owner'),
  ('24', 31, 'Cabinetry', '12', 'Unit count', 'building', 'kulka'),
  ('24a', 32, 'Countertops', '12', 'SF of countertop area', 'building', 'kulka'),
  ('24b', 33, 'Window treatments', '12', 'Unit count', 'building', 'kulka'),
  ('25', 34, 'Amenity special construction — pools, fitness, sauna', '13', 'Fixed lump sum', 'building', 'kulka'),
  ('26', 35, 'Elevators', '14', 'Per stop', 'building', 'kulka'),
  ('27', 36, 'Fire sprinkler system', '21', 'Gross square feet', 'building', 'kulka'),
  ('28', 37, 'Plumbing rough-in and piping', '22', 'Bathroom count / unit count, split', 'building', 'kulka'),
  ('29', 38, 'Plumbing fixtures', '22', 'Bathroom count / unit count, split', 'building', 'kulka'),
  ('30', 39, 'HVAC system', '23', 'Gross square feet', 'building', 'kulka'),
  ('31', 40, 'Electrical system — service, distribution, branch power, installation, generator', '26', 'Gross square feet', 'building', 'kulka'),
  ('31a', 41, 'Low voltage', '26', 'Gross square feet', 'building', 'kulka'),
  ('31b', 42, 'Lighting fixtures, furnish only', '26', 'Unit count', 'building', 'kulka'),
  ('31c', 43, 'Site and exterior lighting', '26', 'EA per pole/fixture', 'building', 'kulka'),
  ('31d', 44, 'EV charging infrastructure', '26', 'EA per EV-capable stall', 'building', 'kulka'),
  ('31e', 45, 'Solar-ready provisions', '26', 'Gross square feet', 'building', 'kulka'),
  ('32', 46, 'Fire alarm and nurse call', '28', 'Gross square feet', 'building', 'kulka'),
  ('32a', 47, 'Emergency responder radio coverage', '28', 'Gross square feet', 'building', 'kulka'),
  ('33', 48, 'Erosion and sedimentation control', '31', 'LF of site perimeter', 'site', 'kulka'),
  ('34', 49, 'Excavation, backfill, foundation prep, and deep foundations', '31', 'CY of excavated volume', 'site', 'kulka'),
  ('35', 50, 'Site drainage and stormwater', '31', 'Fixed lump sum', 'site', 'kulka'),
  ('36', 51, 'Sanitary sewer, water service, and site utilities', '31', 'Fixed lump sum', 'site', 'kulka'),
  ('37', 52, 'Site grading, topsoil, and landscaping/irrigation', '31', 'SF of disturbed site area', 'site', 'kulka'),
  ('38', 53, 'Paving and base courses', '32', 'SF of paved area', 'site', 'kulka'),
  ('39', 54, 'Site concrete, hardscape, and retaining structures', '32', 'SF of hardscape/paver area', 'site', 'kulka');

-- =====================================================================
-- 9. Kulka's own General Conditions rate card, as real seed data (LA-688)
-- =====================================================================
-- docs/precon/kulka-gc-rate-card.md, sourced from Kulka's own estimate for
-- 117 N. Long Beach Rd (C-00379 rev 1). "One real caveat before this becomes
-- a benchmark: this is a single job, and it is not multifamily," carried
-- forward here as provenance on every row rather than left off.
--
-- Judgment call: LA-816 cites "22 staff roles." The source file lists 19
-- distinct titles at 23 rate rows (several roles are kept at more than one
-- weekly rate on purpose -- see the file's own note -- rather than collapsed
-- to one). "Asst. Superintendent (Bldg./Site/Offsite/MEP)" is the one title
-- written as four variants sharing a single rate; expanding it into four rows
-- (19 - 1 + 4) is what reconciles the file's 19 titles with the ticket's own
-- count of 22, so that expansion is made explicit here rather than left as an
-- unexplained gap between the ticket text and the seed data.
create table gc_staffing_rates (
  id uuid primary key default gen_random_uuid(),
  role text not null,
  days_per_week integer not null check (days_per_week between 1 and 7),
  -- Every role prices as one figure except Sr. Project Manager, whose source
  -- row carries a real range ($2,600-$2,615.20). low = high wherever the
  -- source gives one number, so no precision is invented either way.
  weekly_rate_low numeric not null check (weekly_rate_low > 0),
  weekly_rate_high numeric not null check (weekly_rate_high >= weekly_rate_low),
  source_estimate text not null default 'C-00379',
  created_at timestamptz not null default now(),
  unique (role, days_per_week)
);

insert into gc_staffing_rates (role, days_per_week, weekly_rate_low, weekly_rate_high)
values
  ('Principal-in-Charge', 5, 10000, 10000),
  ('VP of Construction', 5, 4050, 4050),
  ('VP of Estimating', 3, 3033, 3033),
  ('VP of Estimating', 5, 5055, 5055),
  ('General Superintendent', 5, 5879, 5879),
  ('Senior Superintendent', 5, 5888, 5888),
  ('Sr. Project Manager', 2, 2600, 2615.20),
  ('Project Manager', 2, 2080, 2080),
  ('Project Manager', 3, 3120, 3120),
  ('Project Manager', 5, 5200, 5200),
  ('Superintendent', 5, 2884, 2884),
  ('Estimator', 5, 1829, 1829),
  ('LEED Coordinator', 5, 1829, 1829),
  ('Asst. Project Manager', 3, 1690.80, 1690.80),
  ('Asst. Project Manager', 5, 2818, 2818),
  ('Asst. Superintendent (Bldg.)', 5, 1750, 1750),
  ('Asst. Superintendent (Site)', 5, 1750, 1750),
  ('Asst. Superintendent (Offsite)', 5, 1750, 1750),
  ('Asst. Superintendent (MEP)', 5, 1750, 1750),
  ('Assistant Estimator', 5, 1350, 1350),
  ('Take-off Estimator', 5, 1350, 1350),
  ('Jr. Estimator', 3, 1097.40, 1097.40),
  ('Admin Asst./Secretary', 5, 1250, 1250),
  ('Project Accountant', 5, 1057, 1057),
  ('Accts. Payable Accountant', 5, 1057, 1057),
  ('Plan Clerk', 5, 775, 775);

-- Field-office and general expense figures. rate is the one-time or monthly
-- figure named first in the source; recurring_rate is the ongoing monthly fee
-- that follows an upfront connect charge, null everywhere else.
create table gc_field_office_rates (
  id uuid primary key default gen_random_uuid(),
  category text not null check (
    category in ('trailer_rental', 'trailer_relocation', 'office_setup', 'general_field')
  ),
  item text not null,
  rate_basis text not null check (
    rate_basis in ('monthly', 'lump_sum', 'each', 'lump_sum_then_monthly')
  ),
  rate numeric not null check (rate >= 0),
  recurring_rate numeric check (recurring_rate >= 0),
  source_estimate text not null default 'C-00379',
  created_at timestamptz not null default now(),
  check (
    (rate_basis = 'lump_sum_then_monthly') = (recurring_rate is not null)
  )
);

insert into gc_field_office_rates (category, item, rate_basis, rate, recurring_rate)
values
  ('trailer_rental', 'Single wide (12'' x 60'') trailer rental', 'monthly', 800, null),
  ('trailer_rental', 'Double wide (12'' x 60'') trailer rental', 'monthly', 3200, null),
  ('trailer_rental', 'Triple wide (12'' x 60'') trailer rental', 'monthly', 3317, null),
  ('trailer_rental', 'Teamster office/shanty rental', 'monthly', 530, null),

  ('trailer_relocation', 'Relocate single wide', 'lump_sum', 5525, null),
  ('trailer_relocation', 'Relocate double wide', 'lump_sum', 15140, null),
  ('trailer_relocation', 'Relocate triple wide', 'lump_sum', 24120, null),

  ('office_setup', 'Office fit-out/furniture allowance', 'lump_sum', 2750, null),
  ('office_setup', 'Field equipment (desks, file cabinets)', 'lump_sum', 2000, null),
  ('office_setup', 'Computers', 'lump_sum', 2500, null),
  ('office_setup', 'Electric connect', 'lump_sum_then_monthly', 500, 175),
  ('office_setup', 'Phone/data connect', 'lump_sum_then_monthly', 2000, 150),
  ('office_setup', 'Plumbing connect', 'lump_sum_then_monthly', 500, 100),
  ('office_setup', 'Trailer alarm, central station monitoring', 'monthly', 100, null),

  ('general_field', 'Field equipment', 'monthly', 250, null),
  ('general_field', 'Coffee/supplies/food', 'monthly', 250, null),
  ('general_field', 'Storage containers', 'monthly', 150, null),
  ('general_field', 'Drinking water', 'monthly', 120, null),
  ('general_field', 'Progress photographs', 'monthly', 600, null),
  ('general_field', 'Fed Ex/UPS', 'monthly', 100, null),
  ('general_field', 'Messenger service', 'monthly', 100, null),
  ('general_field', 'Travel, meals, and misc.', 'monthly', 100, null),
  ('general_field', 'ID cards', 'lump_sum', 1500, null),
  ('general_field', 'Medical kit, per field office', 'each', 500, null),
  ('general_field', 'Gators (on-site vehicles)', 'each', 10000, null),
  ('general_field', 'Blueprinting', 'lump_sum', 3000, null),
  ('general_field', 'Kulka signage', 'lump_sum', 2000, null),
  ('general_field', 'Project ID sign', 'lump_sum', 2500, null),
  ('general_field', 'Safety signs', 'lump_sum', 2000, null);

-- =====================================================================
-- 10. Timestamp on an issued ROM for when it was printed/exported (LA-681)
-- =====================================================================
-- LA-681's resolution: "The issued ROM records a timestamp when it is printed
-- or exported." Implemented above in section 6 as `runs.issued_at`, since
-- that is where the rest of LA-680's issued-ROM fields live; no separate
-- column is needed here.

-- =====================================================================
-- Row level security: on, with no policies, for every table this migration
-- creates. Matches supabase/migrations/20260827120000_rom_schema.sql's own
-- rule: server code reaches these over a direct Postgres connection as owner,
-- which bypasses row level security, so the app keeps working; this only
-- locks the anon-key door.
-- =====================================================================
alter table gsf_per_unit_benchmarks enable row level security;
alter table gsf_per_unit_benchmark_source_projects enable row level security;
alter table closing_comparisons enable row level security;
alter table canonical_work_items enable row level security;
alter table gc_staffing_rates enable row level security;
alter table gc_field_office_rates enable row level security;
