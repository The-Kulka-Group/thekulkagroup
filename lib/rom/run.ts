import { createHash } from "node:crypto";

import {
  computeRom,
  type Answers,
  type Benchmark,
  type BlockClassification,
  type DataSnapshot,
  type DetailLevel,
  type EngineParameter,
  type EngineParameters,
  type ParameterName,
  type Rom,
} from "@kulka/engine";

import type { Db } from "@/lib/db";
import { readApprovedJudgmentRules } from "@/lib/rom/judgment";
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

type ProjectRow = {
  id: string;
  project_type: Answers["projectType"];
  construction_kind: Answers["constructionKind"];
  gross_square_feet: number | null;
};

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
};

type ClassificationRow = {
  cost_code: string;
  detail_level: number | string;
  element: string | null;
  breakout_of_cost_code: string | null;
  buyout_package: string | null;
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

/**
 * Run a tier-1 ROM for one project and record it.
 *
 * The run row is written before any work starts, so a run that dies partway
 * still leaves a trace. That is the point of an audit trail.
 */
export async function runRom(
  db: Db,
  projectId: string,
  responses?: Responses,
): Promise<RunResult> {
  const project = await readProject(db, projectId);
  const runId = await openRun(db, projectId);
  let seq = 0;

  try {
    const intake = await step(db, runId, ++seq, "read_answers", async () => {
      // The tier-1 questions come from `config/rom/tier1-flow.json` (LA-20).
      // The definition says which answer feeds which engine input, so nothing
      // here wires a question to a field.
      if (responses) return readFlowAnswers(tier1Flow(), responses);

      // A caller that asked no questions still gets a ROM off the project
      // record, which is how the existing ROM screen runs.
      if (!project.gross_square_feet) {
        throw new Error(
          `Project ${projectId} has no gross square feet, so it cannot be budgeted.`,
        );
      }
      const fromProject = {
        projectType: project.project_type,
        constructionKind: project.construction_kind,
        grossSquareFeet: project.gross_square_feet,
      } satisfies Answers;
      return { answers: fromProject, recorded: fromProject as Record<string, unknown> };
    });
    const answers = intake.answers;
    await db.query(`update runs set answers = $2 where id = $1`, [runId, intake.recorded]);

    // Block classifications are read inside this step rather than in one of
    // their own. A sixth step would change the run's recorded shape, and
    // app/api/rom/route.test.ts, app/api/rom/flow-run.test.ts and
    // app/api/rom/runs/route.test.ts each assert the five step names a run
    // writes. The classification is also a property of the same benchmarks
    // this step reads, keyed off the same cost code, so it belongs here on its
    // own terms rather than only to spare the tests.
    const data = await step(db, runId, ++seq, "read_benchmarks", async () => {
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
                b.provenance_recorded_at, b.scope_side, b.contract_side
           from benchmarks b
          where b.project_type = $1 and b.construction_kind = $2
          order by b.cost_code, b.provenance_kind, b.provenance_recorded_at, b.id`,
        [answers.projectType, answers.constructionKind],
      );

      const { rows: classifications } = await db.query<ClassificationRow>(
        `select cost_code, detail_level, element, breakout_of_cost_code,
                buyout_package, stated_by, stated_on, reason
           from block_classification
          order by cost_code`,
      );

      return {
        benchmarks: rows.map(toBenchmark),
        classifications: classifications.map(toClassification),
      };
    });
    const benchmarks = data.benchmarks;
    const classifications = data.classifications;

    const parameters = await step(db, runId, ++seq, "read_parameters", async () => {
      const { rows } = await db.query<ParameterRow>(
        `select name, value, provenance_kind, provenance_recorded_by,
                provenance_recorded_at, reason
           from engine_parameters
          order by name`,
      );
      return toParameters(rows);
    });

    const judgmentRules = await step(db, runId, ++seq, "read_judgment_rules", async () =>
      readApprovedJudgmentRules(db, {
        projectType: answers.projectType,
        constructionKind: answers.constructionKind,
      }),
    );

    // Judgment rules and classifications join the snapshot only when there are
    // some, so a project with neither still fingerprints the way it did before
    // they existed and two runs over the same data stay comparable.
    const snapshot: DataSnapshot = { benchmarks, parameters };
    if (judgmentRules.length > 0) snapshot.judgmentRules = judgmentRules;
    if (classifications.length > 0) snapshot.classifications = classifications;
    await db.query(`update runs set snapshot_hash = $2 where id = $1`, [
      runId,
      hashSnapshot(snapshot),
    ]);

    const rom = await step(db, runId, ++seq, "compute_rom", async () =>
      computeRom(answers, snapshot),
    );

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

async function readProject(db: Db, projectId: string): Promise<ProjectRow> {
  const { rows } = await db.query<ProjectRow>(
    `select id, project_type, construction_kind, gross_square_feet
       from projects where id = $1`,
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
