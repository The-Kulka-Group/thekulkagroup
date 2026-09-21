# Conceptual budget (ROM) spec

Confirmed 2026-08-27 after a grilling session with Matt. This replaces the 2026-08-26
draft. Background is in `docs/precon/direction.md`; vocabulary is law in the repo root
`CONTEXT.md`. The canonical build spec lives in Linear; this file is the repo's record
of the decisions.

## The product

Kulka's conceptual budgeting tool, owned by Kulka, first module of the system Rob
described. It produces a ROM: a ranged budget with a confidence flag on every line
and a plain list of assumptions. Multifamily first, self-storage second, new
construction split from renovation before anything else. No deadline job drives the
build; the Manor project was pulled from the plan. NOVATERRA gets nothing now and
takes what it wants later by copy or fork. The tool stays off the public website.

## Architecture

- One repo: Kulka-AI, engine as its own package beside the app.
- Three layers:
  1. Skill files: raw workflow definitions (questions, steps, output shape) any
     surface can run.
  2. Engine: deterministic code behind one API. Math never lives in a prompt. This
     is what makes outputs consistent across users (controlled goalposts).
  3. Surfaces that call the API.
- v1 surfaces: the site, plus the Claude wrapper that falls out of development
  nearly free. ChatGPT waits until the engine stops moving. The one-API design stays
  platform neutral throughout.
- Runs: every execution writes a run record with steps and statuses to Supabase. The
  site renders runs live. The run record is both the progress view and the audit
  trail.
- No generic skills platform until a second skill exists.
- Auth: Supabase, five named accounts, with no roles or self-serve signup in v1
  later. One exception: an admin permission, a flag on an account rather than a roles
  system, gates promoting a judgment rule into a reusable benchmark. Approval authority
  is tied to the permission, never to a named person, so it survives who currently holds
  it (LA-722).
- Database: Kulka's own Supabase account. Matt's access is set up. Schema managed by
  migrations from this repo.

## Chat surface (MCP)

- In v1, generated from the engine's one API rather than a hand-maintained second
  layer, so the tool surface cannot drift from what the API actually does. ChatGPT
  stays deferred per the architecture note above; this covers Claude only.
- Internal only: an estimator's faster interface onto their own job, not a
  client-facing surface. A developer does not chat with the budget directly.
- Draft and propose only. It can never issue a ROM; issuing stays a deliberate action
  in the web surface, same as every other send/post/spend action in this project.
- Five tools: `read_rom` (full state, one call, not several granular reads),
  `web_search` (real research, scoped in practice to what the task needs but not
  allowlisted, since an allowlist recreates the licensing problem this project has
  already avoided elsewhere), `propose_line` (one general action covering both an
  override to an existing canonical item and scope that is not in the canonical list
  yet, carrying quantity, unit, cost, basis, and its sources), `answer_gate`,
  `adjust_dial`. Proposals (GSF-per-unit, duration) are not tools; they are automatic
  engine behavior already visible in `read_rom`'s output.
- `propose_line`'s sources are a required field, not optional metadata, but "sources"
  means the same thing provenance always means in this project: a project, an export,
  a citation, or reviewed judgment. A researched material cost needs a real citation; a
  trade-judgment call with no web lookup still qualifies, stated as judgment, same as
  any other judgment rule.
- Using researched or judgment-based data on a single draft ROM needs no sign-off
  beyond the estimator's own action, the same as any other override. Promoting it into
  a reusable benchmark for future ROMs requires admin permission (LA-722).
- This ticket produced a design, not a build. The engine's one API does not exist yet
  (LA-12); the tool surface above is what gets generated from it once it does.

## Data rules

- Weighting order: Kulka actuals from Autodesk Cost, then vetted ProEst budgets,
  then the LLM. Where a work item has no Kulka data at all, the LLM proposes a figure
  and it is flagged low and weighted below every measured value. With four or five
  projects this will be most of an early ROM.
- The database starts empty. No NOVATERRA benchmarks migrate.
- Provenance is a hard requirement: every number traces to the projects, export, or
  reviewed judgment that produced it, with names and dates.
- Estimator judgment rules are allowed as data, flagged as judgment, replaced by
  actuals as they arrive. Promoting a judgment rule into a reusable benchmark requires
  admin permission (see Architecture). Using researched or judgment-based data on a
  single draft ROM does not; the estimator's own action is the approval, same as any
  other override.
- Incomplete projects contribute if flagged (Fieldstone at ~56 percent is usable).
- Ingestion goes through an approval gate. Nobody feeds the database from a chat.

## Build sequence

- The engine is rebuilt from scratch. The old NOVATERRA ROM code
  (`~/dev/NOVATERRA/app/src/utils/romEngine.js` and friends) is a read-only
  reference; its 128 test cases come along as a spec checklist. Its design ideas
  survive (confidence-weighted blending, calibration from actuals, question-to-
  multiplier schema, range tightening); its hardcoded tables, browser caching, and
  UI do not.
- One branching question set, with no tier for the user to choose. The project decides
  which questions appear: a site with existing structures asks four more about
  demolition, a clean site asks none. Tiers stay in `CONTEXT.md` as a later idea and
  return only if backtesting shows a short path and a long path differ enough in
  accuracy to be worth choosing between (LA-676).
- Every branch gate takes three answers: yes, no, or don't know. A "no" closes the
  branch and prices it at zero with high confidence, because somebody said so. A
  "don't know" shows TBD on the schedule of values, contributes nothing to the total,
  and the ROM states how many TBD items sit outside it. Silence is never read as zero.
- The intake's permanent branch gates, and what each opens:
  - **Demolition**: how many structures, square footage, construction type and era,
    whether basements exist, and whether abatement is needed. Abatement is a demolition
    sub-question, not its own gate; it only arises when a structure is already coming
    down. Jefferson's Ferry priced demolition 154 percent high, the only division on
    that job that has closed.
  - **Levels below grade**: excavation, support of excavation, waterproofing,
    foundations. West Shore Road alone carried $375,000 in SOE allowance and $350,000
    in piles.
  - **Existing building tie-in**: utility relocation, whether the existing structure
    stays occupied during construction (a phasing and General Conditions driver, not a
    new cost item), and whether a shared wall or structural connection is involved.
  - **Site conditions**: groundwater and poor soils. Rock is excluded; it is rare on
    Long Island's glacial soils and not a Kulka-relevant condition.
  - **Amenity scope**: pools, activity rooms, saunas, and similar. Present on two of
    the five projects in the data.
  - **Parking type**: already required minimum, not assumed (LA-682); listed here for
    completeness.
  Four more, narrower than the six above: each gates one canonical item or container
  rather than a whole section, surfaced during LA-720's trade-by-trade review and
  confirmed by Matt on 2026-09-19, same three-answer mechanism.
  - **Gas building**: yes, no, don't know. Gates Plumbing's Gas Piping item and the
    Gas Range Connection under Appliance and Equipment Connections. No data either way
    in any of the six files; added on Matt's word from the trade.
  - **Roof type**: flat, pitched, don't know. Gates Plumbing's Interior Storm Drainage.
    A pitched roof routes to Division 07 gutters and leaders and site storm instead
    (item 36).
  - **Water heating system**: central plant, per unit, don't know. Both answers are
    required scope; the gate picks which form Water Heating prices under, not whether
    it exists at all.
  - **Fire alarm notification**: voice evacuation, horn and strobe, don't know. Both
    answers are required scope; the gate picks which form Notification Devices and
    Panel and Power Supply price under, under item 32. Usually a building-height code
    trigger, so this may be derivable from stories rather than asked outright, the same
    way elevator stops derive from stories rather than getting their own question; worth
    checking before it becomes a real question in the built intake.
  - **Emergency responder radio coverage**: yes, no, don't know. Gates item 32a, split
    out during the same review as its own canonical item rather than left a low-voltage
    sub-scope, because it is licensed, code-triggered work. No data on any of the six
    files.
  - **HVAC system type**: PTAC, ducted split, central plant, don't know. All required
    scope; the gate picks which form item 30 prices under, not whether HVAC exists.
    Kulka does not choose the system, the architect and mechanical engineer do, so this
    is a fact to state, not a fact to derive. No file names which system any of the five
    priced jobs actually used, so all four answers, including don't know, price off the
    same blended rate today, flagged low confidence, until enough closed jobs are tagged
    by known system type to separate them. Every future imported HVAC line should carry
    its system type once the job's drawings say what it was, even while the price stays
    blended, so the benchmark can split on its own later without a redesign. Matt's own
    read from the trade, PTAC less common than the other two, belongs on the estimator
    questionnaire (LA-687) as a real question, not assumed here.
  A gate can be answered three ways, and which way applies is worth stating per gate
  rather than assuming. The estimator states it outright, the way gas building or roof
  type work today. The tool derives it from another captured fact, the way elevator
  stops derive from stories. Or the tool looks it up from the project's own code
  jurisdiction, which neither of the first two can do for a gate like emergency
  responder radio coverage or fire alarm notification: both trigger off a building code
  amendment specific to the project's municipality and AHJ, not off anything Kulka
  captures today or could reasonably ask an estimator to know from memory. That lookup
  is two steps, not one: something resolves the project's address to a jurisdiction and
  retrieves the current code text, then Jev judges the narrow question against that
  retrieved text. Jev has no built-in web search, database, or jurisdiction lookup of
  its own (confirmed against TypeSafe's own docs, 2026-09-20; see
  `docs/precon/research/la-771-jurisdiction-code-gates.md`), so the retrieval step is
  still unbuilt, its own ticket. Until both steps exist, these two gates fall back to
  asked outright, same as any other gate.
  A gate earns a permanent place if it appears in at least a third of Kulka's own past
  jobs, or Matt says from the trade that it comes up on most calls regardless of what
  the thin dataset shows. Anything below that bar stays in the assumed bucket, asked
  only when the estimator specifically knows to ask it (LA-694). The **emergency
  generator** is the tested case: one of five priced files has one, below the bar on
  data alone, so it stays in the assumed bucket rather than becoming a gate. It defaults
  to absent and prices at zero silently; an estimator who knows a job has one overrides
  it with a reason, the same as any other benchmark override.
- A project holds a building count, not a list of buildings. Multiple buildings are a
  slight cost factor in themselves, so no benchmark is keyed to a building and no building
  record exists. What multiple buildings really move is duration and phasing, and duration
  already drives General Conditions. Parking levels are levels of the building above them;
  a freestanding garage counts as one building.
- The tool proposes a duration from size and building count and the estimator corrects it.
  A developer calling early does not know the schedule, so asking them for one pushes the
  work to the person least able to answer. The proposal shows its arithmetic and carries a
  low confidence flag until the back catalogue is bigger.
- Every line carries a scope side, either building or site. The value defaults from the
  canonical work item, so the estimator sets it only when moving a line. The Villa at Glen
  Cove is the pattern: $50,181,447 of its $50,691,435 base is building work priced building
  by building, and the remaining $509,988 of pavers, lockers, mailboxes and sauna equipment
  belongs to the complex.
- Where the call gives unit count and not area, the tool proposes gross square feet from a
  stored GSF-per-unit benchmark, by product type, same pattern as the duration proposal.
  It stores gross square feet per unit directly rather than a net unit size plus an
  efficiency factor, so the whole system stays on one denominator. Unit mix by bedroom
  count stays in the assumed bucket; it sharpens plumbing, electrical, and finish lines
  downstream but is not needed for the GSF conversion and is not required minimum. The
  conversion is stated on the face of the ROM as an assumption, arithmetic shown, flagged
  low confidence (LA-678).
- Parking is a required minimum branch gate: none, surface, structured, underground, or
  don't know. It is not assumed. No stall count is ever asked or stored; there is no
  Kulka data behind one. Parking prices as two benchmarks, both on `gross_square_feet`
  rather than a new denominator: a base paving rate that always applies (site scope), and
  a structured-or-underground increment on top of it (building scope) that is zero for
  surface and none, and LLM-proposed at low confidence for the other two until a job with
  that scope closes (LA-682).
- Every line carries a contract side, either Kulka or owner, alongside its scope side.
  The value defaults from the canonical work item (appliances and similar owner-direct
  categories default to owner; everything else defaults to Kulka) and the estimator sets
  it only when a specific job is unusual. It applies to live ROM lines and to imported
  budget lines alike, so benchmarks stay comparable. The ROM shows two totals on screen at
  all times: Kulka's contract and total project cost, meaning total construction cost,
  Kulka's contract plus owner-direct construction scope. Land, financing, and other soft
  costs are out of scope entirely; they may become their own add-on section later, not a
  third total on the ROM. Owner-direct lines are excluded from Kulka's trade-cost and
  General Conditions benchmarks, but kept as their own benchmark by canonical item, for
  when a developer asks what the owner-direct scope would run (LA-679).
- Backtest before any live job: measure against trade cost, meaning the Autodesk original
  budget less General Conditions and less insurance and fee. A ROM passes at 10 percent.
  No Kulka job has closed, so final actuals are not available and are not the target. A
  ROM carrying TBD lines cannot be scored, because the award included that scope. This
  replaces an earlier draft of this rule that called the same figure "award value"; award
  value is Kulka's full contract total and is not what the backtest measures (LA-679).
- An issued ROM carries a nullable link to the project record it becomes, set whenever the
  link exists, not required at issue time. Every time budget or actuals data is imported
  for a linked project, a closing comparison runs automatically: predicted trade cost from
  the ROM against actual trade cost from the import, at the same 10-percent bar. It updates
  as more actuals arrive on a partially complete job, same as any other flagged-partial
  project. This is a separate scored record, not a new benchmark row; the import itself is
  what feeds the benchmark database, through the existing role-flag pipeline (ADR 0003).
  Whoever already handles the import sets the link, no new role. This makes the backtest a
  byproduct of work Kulka already has to do, not a project of its own (LA-680).
- The client-facing document ships in v1, not gated behind the backtest passing. It is a
  fully branded, design-forward PDF, not a print of the ROM screen; an HTML-style living
  proposal follows it as a later, separate deliverable. This replaces the earlier "screen
  only until the first live job" gate, which the walkthrough found breaks the frozen-issued-
  version promise on the first real job. The schedule of values on it reads at MasterFormat
  division expanding to subdivision and carries the dial position on its face. The issued
  ROM records a timestamp when it is printed or exported. Kulka's brand assets (logo,
  palette, type) do not exist yet in this repo and block the actual design work; getting
  them is on Matt, same footing as the General Conditions rates and the questionnaire
  (LA-681).

## Working session agenda (Jesse and Liam, target early September 2026)

1. Which multifamily jobs in ProEst are accurate enough to use.
2. Minimum required fields per project type, worked backward into tier-1 questions
   (Rob's framework).
3. Presentation format: CSI trade divisions, elemental, or both.
4. Judgment-rule approval authority (Devin and Rob decide).
5. Review inherited rules of thumb (floor, basement, site multipliers) and correct
   or reject them.

Deliverable into the session: the fields framework plus a draft database schema. No
demo. The packet itself is `docs/precon/working-session-packet.md` (LA-17).

## Blocked on facts

Schema detail, cost-code mapping, and tier-1 question content wait on Devin's
Autodesk export and the ProEst verdict from Rob.
