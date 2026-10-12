import { createHash } from "node:crypto";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type BlockClassification,
  type BranchGateAnswer,
  type BranchGateItemRule,
  type DataSnapshot,
  type DetailLevel,
  type EngineParameter,
  type EngineParameters,
  type FieldOfficeRate,
  type FramingSystem,
  type JudgmentRule,
  type MarkupChoices,
  type MarkupHistoryRow,
  type ParameterName,
  type ParkingType,
  type Rom,
  type ScopeRelationship,
  type StaffingRate,
} from "@kulka/engine";

import type { Db } from "@/lib/db";
import { holdUnansweredDemolition } from "@/lib/rom/demolition-hold";
import { applyBuildingFormCriterion } from "@/lib/rom/building-form-criterion";
import { applyConstructionTypeCriterion } from "@/lib/rom/construction-type-criterion";
import { applyElectricalCriterion } from "@/lib/rom/electrical-criterion";
import { applyElevatorCriterion } from "@/lib/rom/elevator-criterion";
import { applyFoundationCriterion } from "@/lib/rom/foundation-criterion";
import { applyHvacCriteria } from "@/lib/rom/hvac-criterion";
import { applyJackCriterion } from "@/lib/rom/jack-criterion";
import { applyMachineRoomCriterion } from "@/lib/rom/machine-room-criterion";
import { listDerivedAssumptions } from "@/lib/rom/derived-assumptions";
import { describeRom, readScopeEntries } from "@/lib/rom/line-details";
import { readApprovedJudgmentRules } from "@/lib/rom/judgment";
import { readFieldOfficeRates, readMarkupHistory, readStaffingRates } from "@/lib/rom/markup";
import { readProjectRates, withProjectRates } from "@/lib/rom/project-rates";
import type { PriceLevel } from "@/lib/rom/part-prices";
import { readFlowAnswers, tier1Flow, type Responses } from "@/lib/rom/question-flow";

// The run: load a snapshot, hand it to the engine, write down what happened.
// The engine stays pure and this file owns every side effect, which is what
// keeps the two testing seams of LA-9 apart.

/** The steps a ROM run records, in the order they happen. */
type StepName =
  | "read_answers"
  | "read_benchmarks"
  | "read_parameters"
  | "read_judgment_rules"
  | "compute_rom";

export const ROM_SKILL = "rom_tier1";

export type RunResult = { runId: string; rom: Rom };

/** The run started and then failed. A run record holds the detail. */
export class RunFailed extends Error {
  constructor(
    message: string,
    readonly runId: string,
  ) {
    super(message);
    this.name = "RunFailed";
  }
}

/**
 * There is no such project, so no run ever started.
 *
 * `runs.project_id` references `projects`, and that stays. A run record is the
 * account of a ROM that was attempted for a real project; a request naming a
 * project that does not exist is a bad request, and inventing a run for it
 * would put a dangling row in the audit trail.
 */
export class ProjectNotFound extends Error {
  constructor(readonly projectId: string) {
    super(`No project ${projectId}.`);
    this.name = "ProjectNotFound";
  }
}

export type ProjectRow = {
  id: string;
  name: string;
  project_type: Answers["projectType"];
  construction_kind: Answers["constructionKind"];
  gross_square_feet: number | null;
  // The six section-level gates plus the four narrower ones LA-1028 adds, and
  // parking type: every answer a caller with no responses can build a ROM's
  // facts and branch gates from (see the read_answers step below).
  demolition_gate: BranchGateAnswer | null;
  levels_below_grade_gate: BranchGateAnswer | null;
  existing_building_tie_in_gate: BranchGateAnswer | null;
  site_conditions_gate: BranchGateAnswer | null;
  amenity_scope_gate: BranchGateAnswer | null;
  elevator_gate: BranchGateAnswer | null;
  retail_storefronts_gate: BranchGateAnswer | null;
  balconies_gate: BranchGateAnswer | null;
  radio_amplifier_gate: BranchGateAnswer | null;
  parking_type: ParkingType | null;
  /** How the job is framed (LA-1103). Null means nobody has recorded it. */
  framing_system: FramingSystem | null;
  /**
   * LA-1199: Stories Above Grade, Unit Count, Building Count and ZIP, read
   * off the project record for a run that gets no `responses` (the ROM
   * screen, and the backtest). Carried into `facts` under the same names the
   * tier-1 flow's intake fields use, so a judgment rule reads the same fact
   * whichever path produced it. `building_count` is not null on the column
   * (it defaults to 1), so a run always has one.
   */
  stories_above_grade: number | null;
  unit_count: number | null;
  building_count: number;
  zip: string | null;
  /**
   * LA-1212: item 26's per-stop count (Elevators) and item 26a's per-shaft
   * count (the bulkhead) both read Elevator Count off the project record for
   * a run that gets no `responses`, the same way stories_above_grade does
   * just above. Zero is a legal, distinct answer from unset (no elevator, vs.
   * not asked yet), so this reads differently from the other counts below --
   * see `answersFromProject`.
   */
  elevator_count: number | null;
  /** LA-1239: demolition's building answers, carried into `facts` like the counts above. */
  demolition_structure_count: number | null;
  demolition_structure_square_feet: number | null;
  demolition_structure_type: string | null;
  /** LA-1245: Union, Open Shop or Prevailing Wage. */
  labor_type: string | null;
  /**
   * LA-2274: the balcony answers, carried into `facts` so a run off the
   * project record prices the balconies New Budget asked about. Numeric
   * columns, so Postgres returns the numbers as text.
   */
  balcony_type?: "full" | "juliet" | null;
  balcony_count?: string | number | null;
  balcony_deck_square_feet?: string | number | null;
  balcony_rail_linear_feet?: string | number | null;
  juliet_count?: string | number | null;
  juliet_rail_linear_feet?: string | number | null;
};

/**
 * Every branch gate section this run can read off a project record, paired
 * with the column that holds its answer. Parking has no "_gate" suffix, and
 * its section name is "parkingType" rather than snake_case, because
 * config/rom/tier1-flow.json already maps its question onto the intake field
 * "parkingType", and a project run through the flow and one run off the
 * project record have to land the same answer under the same key or the
 * engine's gate map (packages/engine/src/rom-gates.ts) would read one and
 * miss the other.
 */
const PROJECT_GATE_COLUMNS: readonly {
  column: keyof Pick<
    ProjectRow,
    | "demolition_gate"
    | "levels_below_grade_gate"
    | "existing_building_tie_in_gate"
    | "site_conditions_gate"
    | "amenity_scope_gate"
    | "elevator_gate"
    | "retail_storefronts_gate"
    | "balconies_gate"
    | "radio_amplifier_gate"
  >;
  section: string;
}[] = [
  { column: "demolition_gate", section: "demolition" },
  { column: "levels_below_grade_gate", section: "levels_below_grade" },
  { column: "existing_building_tie_in_gate", section: "existing_building_tie_in" },
  { column: "site_conditions_gate", section: "site_conditions" },
  { column: "amenity_scope_gate", section: "amenity_scope" },
  { column: "elevator_gate", section: "elevator" },
  { column: "retail_storefronts_gate", section: "retail_storefronts" },
  { column: "balconies_gate", section: "balconies" },
  { column: "radio_amplifier_gate", section: "radio_amplifier" },
];

type BenchmarkRow = {
  cost_code: string;
  label: string;
  unit: Benchmark["unit"];
  value: string;
  project_type: Benchmark["projectType"];
  construction_kind: Benchmark["constructionKind"];
  provenance_kind: Benchmark["provenance"]["kind"];
  provenance_source_project_ids: string[];
  provenance_export_label: string | null;
  provenance_recorded_by: string;
  provenance_recorded_at: Date | string;
  scope_side: Benchmark["scopeSide"];
  contract_side: Benchmark["contractSide"];
  /** Which of item 1a's five structure types this rate is for (LA-1156). Null on every other benchmark. */
  structure_type: Benchmark["structureType"] | null;
  /** Item 26's rate for this elevator type (LA-1205). Null on every other benchmark. */
  elevator_type: Benchmark["elevatorType"] | null;
  /** Item 26a's rate for this shaft configuration or the door package (LA-1205). Null on every other benchmark. */
  elevator_bulkhead_config: Benchmark["elevatorBulkheadConfig"] | null;
  /** LA-1323: the source jobs' GSF per unit, null unless every source job recorded area and units. */
  source_gsf_per_unit: string | null;
};

type ClassificationRow = {
  cost_code: string;
  detail_level: number | string;
  element: string | null;
  breakout_of_cost_code: string | null;
  buyout_package: string | null;
  /** LA-1157/LA-1158: the one item that brings the rest of its element in. */
  is_element_driver: boolean;
  /** LA-1157: the stated MasterFormat division, null until somebody states one. */
  division: string | null;
  /** LA-1502: Matt's By Division placement, null when the item sits under its own division. */
  ledger_division: string | null;
  stated_by: string;
  stated_on: Date | string;
  reason: string;
};

type ParameterRow = {
  name: string;
  value: string;
  provenance_kind: EngineParameter["provenance"]["kind"];
  provenance_recorded_by: string;
  provenance_recorded_at: Date | string;
  reason: string;
};

type GateItemRow = {
  section: string;
  cost_code: string;
  closes_on: string[];
  requires_all_sections: string[] | null;
  stated_by: string;
  stated_on: Date | string;
  reason: string;
};

type RelationshipRow = {
  driver_cost_code: string;
  supporting_cost_code: string;
  supporting_label: string;
  quantity_rule: ScopeRelationship["quantityRule"];
  condition_fact: string | null;
  condition_equals: string | null;
  stated_by: string;
  stated_on: Date | string;
  reason: string;
};

/**
 * Run a tier-1 ROM for one project and record it.
 *
 * The run row is written before any work starts, so a run that dies partway
 * still leaves a trace. That is the point of an audit trail.
 *
 * `markups` is the GRs/GCs, fee and insurance choice (LA-1016). The caller
 * passes it already checked; lib/rom/markup.ts's parseMarkupChoices fills in
 * the default when a request names none. It is recorded with the answers, so
 * a run can be reproduced from its record.
 *
 * `gates` is the Scope module's answers (LA-1028), checked by
 * lib/rom/gates.ts's parseGateAnswers. It only matters on the no-`responses`
 * path: when given, it replaces the project record's own gate columns for
 * this run entirely, rather than merging with them, because the Scope module
 * always sends the full state of every row it shows, blanks included as
 * absent keys. Absent entirely, the run reads the project's own columns, the
 * same as before the Scope module existed.
 *
 * `framing` is the Run settings choice of framing system (LA-1103). Undefined
 * reads the project record's own column; null means the estimator cleared it
 * for this run. It applies on every path, with or without `responses`, because
 * the tier-1 flow asks no framing question.
 *
 * `level` is the price level New Budget asked the `responses` at (LA-2209
 * review S2). A question above it was never asked, so it does not block.
 */
export async function runRom(
  db: Db,
  projectId: string,
  responses?: Responses,
  markups?: MarkupChoices,
  gates?: Partial<Record<string, BranchGateAnswer>>,
  framing?: FramingSystem | null,
  level: PriceLevel = 3,
): Promise<RunResult> {
  const project = await readProject(db, projectId);
  const runId = await openRun(db, projectId);
  let seq = 0;

  try {
    const intake = await step(db, runId, ++seq, "read_answers", async () => {
      // The tier-1 questions come from `config/rom/tier1-flow.json` (LA-20).
      // The definition says which answer feeds which engine input, so nothing
      // here wires a question to a field.
      if (responses) return readFlowAnswers(tier1Flow(), responses, level);
      const fromProject = answersFromProject(project, gates);
      return { answers: fromProject, recorded: fromProject as Record<string, unknown> };
    });
    const framingSystem = framing === undefined ? project.framing_system : framing;
    const withFraming: Answers = framingSystem
      ? { ...intake.answers, framingSystem }
      : intake.answers;
    // LA-1205: V-1, Elevator Type, derived and saved here (never a sixth
    // step -- see the comment on the block-classification read below), so
    // its effective value feeds facts.elevatorType before computeRom prices
    // item 26 by type. A no-op project (elevator gate not yes, or no Stories
    // Above Grade yet) gets `withFraming` back unchanged.
    const withV1 = await applyElevatorCriterion(db, projectId, withFraming, framingSystem);
    // LA-1265: V-2 reads V-1's type and sets the jack the well hole checks.
    const withV2 = await applyJackCriterion(db, projectId, withV1, framingSystem);
    // LA-1269: V-3 counts the machine rooms item 26g prices per room.
    const withV3 = await applyMachineRoomCriterion(db, projectId, withV2);
    // LA-1281, LA-1282: E-1 sizes the service, M-0 and M-1 the cooling. They
    // set no fact yet (items 30 and 31 still price per square foot), so the
    // answers come back as they went in.
    // LA-1298: A-1 works out the construction type; it sets no fact yet.
    const withA1 = await applyConstructionTypeCriterion(db, projectId, withV3, framingSystem);
    // LA-1325: A-2 works out the building's plan shape; it sets no fact.
    const withA2 = await applyBuildingFormCriterion(db, projectId, withA1);
    // LA-1300: S-1 works out the foundation system; it sets no fact yet.
    const withS1 = await applyFoundationCriterion(db, projectId, withA2, framingSystem);
    const withE1 = await applyElectricalCriterion(db, projectId, withS1);
    const withCriteria = await applyHvacCriteria(db, projectId, withE1);
    const answers: Answers = markups ? { ...withCriteria, markups } : withCriteria;
    const recordedBase = framingSystem ? { ...intake.recorded, framingSystem } : intake.recorded;
    // LA-1205: record the same elevatorType fact V-1 fed into `answers`, so a
    // run's stored record reproduces the price it actually computed.
    const recordedWithElevator = answers.facts ? { ...recordedBase, facts: answers.facts } : recordedBase;
    const recorded = markups ? { ...recordedWithElevator, markups } : recordedWithElevator;
    await db.query(`update runs set answers = $2 where id = $1`, [runId, recorded]);

    // Block classifications are read inside this step rather than in one of
    // their own. A sixth step would change the run's recorded shape, and
    // app/api/rom/route.test.ts, app/api/rom/flow-run.test.ts and
    // app/api/rom/runs/route.test.ts each assert the five step names a run
    // writes. The classification is also a property of the same benchmarks
    // this step reads, keyed off the same cost code, so it belongs here on its
    // own terms rather than only to spare the tests.
    //
    // markup_history (LA-1016) is read here for the same reason. Each row is a
    // measured GRs/GCs figure out of an imported budget, the same kind of
    // thing a benchmark is, read so the markup waterfall can price from it.
    const data = await step(db, runId, ++seq, "read_benchmarks", () =>
      readBenchmarkData(db, answers.projectType, answers.constructionKind),
    );

    // The GC staffing and field-office rate tables (LA-1016) are read inside
    // this step rather than a sixth one, for the reason given above. They are
    // stated rates with a named source estimate, the same footing as the fee
    // and insurance rates this step already reads from engine_parameters.
    const rated = await step(db, runId, ++seq, "read_parameters", () => readParameterData(db));

    const judgmentRules = await step(db, runId, ++seq, "read_judgment_rules", async () =>
      readApprovedJudgmentRules(db, {
        projectType: answers.projectType,
        constructionKind: answers.constructionKind,
      }),
    );

    // LA-1245: this project's own rates stand in for the shared benchmarks
    // on their cost codes, and count toward the snapshot's hash like any
    // other input the run read.
    const snapshot = withProjectRates(
      assembleSnapshot(data, rated, judgmentRules, Boolean(markups)),
      await readProjectRates(db, projectId),
      answers.projectType,
      answers.constructionKind,
    );
    await db.query(`update runs set snapshot_hash = $2 where id = $1`, [
      runId,
      hashSnapshot(snapshot),
    ]);

    const rom = await step(db, runId, ++seq, "compute_rom", async () => {
      // LA-1239: the snapshot's hash above is of everything read; the
      // Demolition element sits out of the pricing until its building
      // questions are answered.
      const computed = computeRom(answers, holdUnansweredDemolition(answers, snapshot));
      // LA-1502: each line's division, Inclusions and Exclusions and owner
      // items, which price nothing, set after the engine from what the
      // project holds now. Read inside this step for the reason the
      // classification read above gives.
      return describeRom(computed, {
        classifications: data.classifications,
        canonicalDivisions: new Map((await readCanonicalDivisions(db)).map((d) => [d.itemNumber, d.division])),
        answers,
        criteria: await listDerivedAssumptions(db, projectId),
        scopeEntries: await readScopeEntries(db, projectId),
      });
    });

    await db.query(
      `update runs set status = 'succeeded', rom = $2, finished_at = now() where id = $1`,
      [runId, rom],
    );
    return { runId, rom };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await db.query(
      `update runs set status = 'failed', error = $2, finished_at = now() where id = $1`,
      [runId, message],
    );
    throw new RunFailed(message, runId);
  }
}

/**
 * The snapshot's fingerprint (LA-14). `toBenchmark` and `toParameters` build
 * every object in a fixed key order and the queries above fix row order, so
 * the serialization, and the hash, is the same for the same data.
 */
export function hashSnapshot(snapshot: DataSnapshot): string {
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}

/**
 * A ROM's answers off the project record alone, for a caller that asked no
 * questions: the existing ROM screen, and the backtest (LA-23).
 *
 * LA-1028: that ROM still has to read the project's own gate columns, or every
 * gated item would silently price as if nobody had ever answered its
 * question, which is exactly the "assumed present" state, not the state the
 * project record actually says. A gate column left null still reads that way
 * on purpose: nobody answered it. `gates`, when given, replaces the columns
 * entirely (see runRom).
 */
export function answersFromProject(
  project: ProjectRow,
  gates?: Partial<Record<string, BranchGateAnswer>>,
): Answers {
  if (!project.gross_square_feet) {
    throw new Error(`Project ${project.id} has no gross square feet, so it cannot be budgeted.`);
  }
  const branchGates: Record<string, BranchGateAnswer> = {};
  if (gates) {
    Object.assign(branchGates, gates);
  } else {
    for (const { column, section } of PROJECT_GATE_COLUMNS) {
      const answer = project[column];
      if (answer) branchGates[section] = answer;
    }
  }
  const facts: Record<string, string | number | boolean> = { ...branchGates };
  if (project.parking_type) facts.parkingType = project.parking_type;
  // LA-1199: the same intake-field names the tier-1 flow gives these facts
  // (config/rom/tier1-flow.json), so a judgment rule or a derived assumption
  // reads the same key regardless of which path produced the run.
  if (project.stories_above_grade) facts.storiesAboveGrade = project.stories_above_grade;
  if (project.unit_count) facts.unitCount = project.unit_count;
  facts.buildingCount = project.building_count;
  if (project.zip) facts.zip = project.zip;
  // LA-1212: `!= null` rather than the truthy check the other counts above
  // use, because zero is itself a legal, meaningful Elevator Count (no
  // elevator, read by packages/engine/src/elevator.ts as "no line" rather
  // than "not asked yet") and a truthy check would drop it back to unset.
  if (project.elevator_count !== null) facts.elevatorCount = project.elevator_count;
  // LA-1239: the intake-field names the engine reads (readDemolitionFacts).
  // `!= null` for the count, since zero structures is a real answer.
  if (project.demolition_structure_count !== null) facts.demolitionStructureCount = project.demolition_structure_count;
  if (project.demolition_structure_square_feet) {
    facts.demolitionStructureSquareFeet = project.demolition_structure_square_feet;
  }
  if (project.demolition_structure_type) facts.demolitionStructureType = project.demolition_structure_type;
  facts.laborType = project.labor_type ?? "open_shop";
  // LA-2274: the intake-field names the engine reads (packages/engine/src/balconies.ts).
  if (project.balcony_type) facts.balconyType = project.balcony_type;
  const balconyNumbers = {
    balconyCount: project.balcony_count,
    balconyDeckSquareFeet: project.balcony_deck_square_feet,
    balconyRailLinearFeet: project.balcony_rail_linear_feet,
    julietCount: project.juliet_count,
    julietRailLinearFeet: project.juliet_rail_linear_feet,
  };
  for (const [name, value] of Object.entries(balconyNumbers)) {
    if (value !== null && value !== undefined) facts[name] = Number(value);
  }

  return {
    projectType: project.project_type,
    constructionKind: project.construction_kind,
    grossSquareFeet: project.gross_square_feet,
    ...(Object.keys(facts).length > 0 ? { facts } : {}),
    ...(Object.keys(branchGates).length > 0 ? { branchGates } : {}),
    ...(project.framing_system ? { framingSystem: project.framing_system } : {}),
  };
}

/** What the read_benchmarks step reads. */
export type BenchmarkData = {
  benchmarks: Benchmark[];
  classifications: BlockClassification[];
  markupHistory: MarkupHistoryRow[];
  branchGateItems: BranchGateItemRule[];
  /** Stated driver-to-supporting-item relationships (LA-1154). */
  scopeRelationships: ScopeRelationship[];
  /** Past jobs' recorded framing systems, by project id (LA-1103). Absent reads as none recorded. */
  sourceProjectFraming?: Record<string, FramingSystem>;
};

/** What the read_parameters step reads. */
export type ParameterData = {
  parameters: EngineParameters;
  staffingRates: StaffingRate[];
  fieldOfficeRates: FieldOfficeRate[];
};

/**
 * The stated block classifications (LA-884, LA-1157, LA-1158), read on their
 * own so the /rom screen can group an element into a parent box (ADR 0006)
 * without waiting on a benchmark read for a project type it may not have yet,
 * such as the New budget preview before a project type is answered.
 */
export async function readClassifications(db: Db): Promise<BlockClassification[]> {
  const { rows } = await db.query<ClassificationRow>(
    `select cost_code, detail_level, element, breakout_of_cost_code,
            buyout_package, is_element_driver, division, ledger_division,
            stated_by, stated_on, reason
       from block_classification
      order by cost_code`,
  );
  return rows.map(toClassification);
}

/** One canonical item's own MasterFormat division, read from `canonical_work_items` (LA-1214). */
export type CanonicalItemDivision = { itemNumber: string; division: string };

/**
 * Every canonical item's stated MasterFormat division (LA-1214), read so the
 * /rom screen's MasterFormat order can resolve a bare item-number cost code
 * ("10", "31f") to its real division when `block_classification.division`
 * states none. `docs/precon/masterformat-divisions.md` is the reference for
 * where each value comes from; this just reads what `canonical_work_items`
 * stores today.
 */
export async function readCanonicalDivisions(db: Db): Promise<CanonicalItemDivision[]> {
  const { rows } = await db.query<{ item_number: string; masterformat_division: string }>(
    `select item_number, masterformat_division from canonical_work_items order by item_number`,
  );
  return rows.map((row) => ({ itemNumber: row.item_number, division: row.masterformat_division }));
}

export async function readBenchmarkData(
  db: Db,
  projectType: Answers["projectType"],
  constructionKind: Answers["constructionKind"],
): Promise<BenchmarkData> {
  // The order is total so the same rows always hash the same.
  const { rows } = await db.query<BenchmarkRow>(
    `select b.cost_code, b.label, b.unit, b.value, b.project_type,
            b.construction_kind, b.provenance_kind,
            coalesce(
              (select array_agg(bsp.project_id order by bsp.project_id)
                 from benchmark_source_projects bsp
                where bsp.benchmark_id = b.id),
              '{}'::uuid[]
            ) as provenance_source_project_ids,
            b.provenance_export_label, b.provenance_recorded_by,
            b.provenance_recorded_at, b.scope_side, b.contract_side, b.structure_type,
            b.elevator_type, b.elevator_bulkhead_config,
            (select case when count(*) > 0 and bool_and(p.gross_square_feet > 0 and p.unit_count > 0)
                         then sum(p.gross_square_feet)::numeric / sum(p.unit_count) end
               from benchmark_source_projects bsp
               join projects p on p.id = bsp.project_id
              where bsp.benchmark_id = b.id) as source_gsf_per_unit
       from benchmarks b
      where b.project_type = $1 and b.construction_kind = $2
      order by b.cost_code, b.provenance_kind, b.provenance_recorded_at, b.id`,
    [projectType, constructionKind],
  );

  const classifications = await readClassifications(db);

  // branch_gate_items (LA-1028) is read here for the same reason as
  // block_classification above: it is a declared cost-code mapping, not
  // a benchmark, but it lives on the same footing and joins the snapshot
  // the same only-when-there-are-some way in assembleSnapshot.
  const { rows: gateItems } = await db.query<GateItemRow>(
    `select section, cost_code, closes_on, requires_all_sections,
            stated_by, stated_on, reason
       from branch_gate_items
      order by section, cost_code`,
  );

  // scope_relationships (LA-1154, ADR 0006) is read here for the same reason
  // as branch_gate_items: a stated cost-code mapping that joins the snapshot
  // only when there are some.
  const { rows: relationships } = await db.query<RelationshipRow>(
    `select driver_cost_code, supporting_cost_code, supporting_label,
            quantity_rule, condition_fact, condition_equals, stated_by, stated_on, reason
       from scope_relationships
      order by driver_cost_code, supporting_cost_code`,
  );

  // Each past job's framing system (LA-1103), read for items 8 and 17. Only
  // jobs with one recorded come back, so an unset job reads as unset.
  const { rows: framingRows } = await db.query<{ id: string; framing_system: FramingSystem }>(
    `select id, framing_system from projects
      where framing_system is not null
      order by id`,
  );
  const sourceProjectFraming: Record<string, FramingSystem> = {};
  for (const row of framingRows) sourceProjectFraming[row.id] = row.framing_system;

  return {
    benchmarks: rows.map(toBenchmark),
    classifications,
    markupHistory: await readMarkupHistory(db),
    branchGateItems: gateItems.map(toGateItemRule),
    scopeRelationships: relationships.map(toRelationship),
    sourceProjectFraming,
  };
}

/**
 * The current value of every engine parameter, which is the newest row per
 * name (LA-866). engine_parameters keeps every value ever set; the
 * engine_parameters_current view is the one place that picks the newest, so
 * a run, the live budget's snapshot route and the backtest all read the same.
 */
export async function readParameterData(db: Db): Promise<ParameterData> {
  const { rows } = await db.query<ParameterRow>(
    `select name, value, provenance_kind, provenance_recorded_by,
            provenance_recorded_at, reason
       from engine_parameters_current
      order by name`,
  );
  return {
    parameters: toParameters(rows),
    staffingRates: await readStaffingRates(db),
    fieldOfficeRates: await readFieldOfficeRates(db),
  };
}

/**
 * Judgment rules and classifications join the snapshot only when there are
 * some, so a project with neither still fingerprints the way it did before
 * they existed and two runs over the same data stay comparable. The markup
 * data only matters when the ROM prices markups, and joins on the same rule.
 */
export function assembleSnapshot(
  data: BenchmarkData,
  rated: ParameterData,
  judgmentRules: JudgmentRule[],
  withMarkups: boolean,
): DataSnapshot {
  const snapshot: DataSnapshot = { benchmarks: data.benchmarks, parameters: rated.parameters };
  if (judgmentRules.length > 0) snapshot.judgmentRules = judgmentRules;
  if (data.classifications.length > 0) snapshot.classifications = data.classifications;
  if (data.branchGateItems.length > 0) snapshot.branchGateItems = data.branchGateItems;
  if (data.scopeRelationships.length > 0) snapshot.scopeRelationships = data.scopeRelationships;
  if (data.sourceProjectFraming && Object.keys(data.sourceProjectFraming).length > 0) {
    snapshot.sourceProjectFraming = data.sourceProjectFraming;
  }
  if (withMarkups) {
    if (data.markupHistory.length > 0) snapshot.markupHistory = data.markupHistory;
    if (rated.staffingRates.length > 0) snapshot.staffingRates = rated.staffingRates;
    if (rated.fieldOfficeRates.length > 0) snapshot.fieldOfficeRates = rated.fieldOfficeRates;
  }
  return snapshot;
}

/** Every projects column a ProjectRow holds, for any query that reads one. */
export const PROJECT_COLUMNS = `id, name, project_type, construction_kind, gross_square_feet,
            demolition_gate, levels_below_grade_gate, existing_building_tie_in_gate,
            site_conditions_gate, amenity_scope_gate, elevator_gate,
            retail_storefronts_gate, balconies_gate, radio_amplifier_gate,
            parking_type, framing_system,
            stories_above_grade, unit_count, building_count, zip, elevator_count,
            demolition_structure_count, demolition_structure_square_feet, demolition_structure_type, labor_type,
            balcony_type, balcony_count, balcony_deck_square_feet, balcony_rail_linear_feet,
            juliet_count, juliet_rail_linear_feet`;

export async function readProject(db: Db, projectId: string): Promise<ProjectRow> {
  const { rows } = await db.query<ProjectRow>(
    `select ${PROJECT_COLUMNS} from projects where id = $1`,
    [projectId],
  );
  const found = rows[0];
  if (!found) throw new ProjectNotFound(projectId);
  return found;
}

async function openRun(db: Db, projectId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into runs (project_id, skill, status)
     values ($1, $2, 'running')
     returning id`,
    [projectId, ROM_SKILL],
  );
  return rows[0].id;
}

/** Record one step around the work it names, whether it succeeds or not. */
async function step<T>(
  db: Db,
  runId: string,
  seq: number,
  name: StepName,
  work: () => Promise<T>,
): Promise<T> {
  const { rows } = await db.query<{ id: string }>(
    `insert into run_steps (run_id, seq, name, status)
     values ($1, $2, $3, 'running') returning id`,
    [runId, seq, name],
  );
  const stepId = rows[0].id;

  try {
    const result = await work();
    await db.query(
      `update run_steps set status = 'succeeded', finished_at = now() where id = $1`,
      [stepId],
    );
    return result;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    await db.query(
      `update run_steps set status = 'failed', detail = $2, finished_at = now() where id = $1`,
      [stepId, { error: message }],
    );
    throw cause;
  }
}

function isoDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function toBenchmark(row: BenchmarkRow): Benchmark {
  return {
    costCode: row.cost_code,
    label: row.label,
    unit: row.unit,
    // Postgres numeric arrives as a string so no precision is lost in transit.
    value: Number(row.value),
    projectType: row.project_type,
    constructionKind: row.construction_kind,
    provenance: {
      kind: row.provenance_kind,
      sourceProjectIds: row.provenance_source_project_ids,
      exportLabel: row.provenance_export_label,
      recordedBy: row.provenance_recorded_by,
      recordedAt: isoDate(row.provenance_recorded_at),
    },
    scopeSide: row.scope_side,
    contractSide: row.contract_side,
    // LA-1156: absent on every benchmark but item 1a's five per-structure-type
    // rates, so this only ever adds the key when the column holds a value.
    ...(row.structure_type ? { structureType: row.structure_type } : {}),
    // LA-1205: absent on every benchmark but item 26's two per-type rates and
    // item 26a's three configuration rows.
    ...(row.elevator_type ? { elevatorType: row.elevator_type } : {}),
    ...(row.elevator_bulkhead_config ? { elevatorBulkheadConfig: row.elevator_bulkhead_config } : {}),
    // LA-1323: only when every source job recorded area and units.
    ...(row.source_gsf_per_unit !== null && row.source_gsf_per_unit !== undefined
      ? { sourceGsfPerUnit: Number(row.source_gsf_per_unit) }
      : {}),
  };
}

function toClassification(row: ClassificationRow): BlockClassification {
  return {
    costCode: row.cost_code,
    // The column is a smallint with a check between one and four, so the cast
    // states what the schema already guarantees.
    detailLevel: Number(row.detail_level) as DetailLevel,
    element: row.element,
    breakoutOfCostCode: row.breakout_of_cost_code,
    buyoutPackage: row.buyout_package,
    isElementDriver: row.is_element_driver,
    division: row.division,
    // LA-1502: only when Matt placed it, so a classification without one
    // fingerprints the way it did before the column existed.
    ...(row.ledger_division ? { ledgerDivision: row.ledger_division } : {}),
    statedBy: row.stated_by,
    statedOn: isoDate(row.stated_on),
    reason: row.reason,
  };
}

// branch_gate_items names a section after the projects column that holds its
// answer ("parking_type"), while the intake flow and the project-record path
// both put parking into `facts` as "parkingType". Without this translation the
// parking rule never finds its answer and garage items always read as assumed
// present.
const FACT_KEY_FOR_SECTION: Record<string, string> = { parking_type: "parkingType" };

function factKey(section: string): string {
  return FACT_KEY_FOR_SECTION[section] ?? section;
}

function toGateItemRule(row: GateItemRow): BranchGateItemRule {
  return {
    costCode: row.cost_code,
    section: factKey(row.section),
    requiresAllSections: (row.requires_all_sections ?? []).map(factKey),
    closesOn: row.closes_on,
    statedBy: row.stated_by,
    statedOn: isoDate(row.stated_on),
    reason: row.reason,
  };
}

function toRelationship(row: RelationshipRow): ScopeRelationship {
  return {
    driverCostCode: row.driver_cost_code,
    supportingCostCode: row.supporting_cost_code,
    supportingLabel: row.supporting_label,
    quantityRule: row.quantity_rule,
    // LA-1257: a fact the driver needs before it brings the item in.
    condition:
      row.condition_fact && row.condition_equals ? { fact: row.condition_fact, equals: row.condition_equals } : null,
    statedBy: row.stated_by,
    statedOn: isoDate(row.stated_on),
    reason: row.reason,
  };
}

function toParameters(rows: ParameterRow[]): EngineParameters {
  const parameters: EngineParameters = {};
  for (const row of rows) {
    parameters[row.name as ParameterName] = {
      value: Number(row.value),
      provenance: {
        kind: row.provenance_kind,
        recordedBy: row.provenance_recorded_by,
        recordedAt: isoDate(row.provenance_recorded_at),
        reason: row.reason,
      },
    };
  }
  return parameters;
}
