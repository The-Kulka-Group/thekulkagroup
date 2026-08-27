import { computeRom, type Answers, type Benchmark, type Rom } from "@kulka/engine";

import type { Db } from "@/lib/db";

// The run: load a snapshot, hand it to the engine, write down what happened.
// The engine stays pure and this file owns every side effect, which is what
// keeps the two testing seams of LA-9 apart.

/** The steps a ROM run records, in the order they happen. */
type StepName = "read_answers" | "read_benchmarks" | "compute_rom";

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
  comparable_count: number;
  provenance_kind: Benchmark["provenance"]["kind"];
  provenance_source_project_ids: string[];
  provenance_export_label: string | null;
  provenance_recorded_by: string;
  provenance_recorded_at: Date | string;
};

/**
 * Run a tier-1 ROM for one project and record it.
 *
 * The run row is written before any work starts, so a run that dies partway
 * still leaves a trace. That is the point of an audit trail.
 */
export async function runRom(db: Db, projectId: string): Promise<RunResult> {
  const project = await readProject(db, projectId);
  const runId = await openRun(db, projectId);
  let seq = 0;

  try {
    const answers = await step(db, runId, ++seq, "read_answers", async () => {
      // Tier-1 questions are blocked on the working session, so the project
      // record answers them for now. LA-17 brings the real question flow.
      if (!project.gross_square_feet) {
        throw new Error(
          `Project ${projectId} has no gross square feet, so it cannot be budgeted.`,
        );
      }
      return {
        projectType: project.project_type,
        constructionKind: project.construction_kind,
        grossSquareFeet: project.gross_square_feet,
      } satisfies Answers;
    });
    await db.query(`update runs set answers = $2 where id = $1`, [runId, answers]);

    const benchmarks = await step(db, runId, ++seq, "read_benchmarks", async () => {
      const { rows } = await db.query<BenchmarkRow>(
        `select cost_code, label, unit, value, project_type, construction_kind,
                comparable_count, provenance_kind, provenance_source_project_ids,
                provenance_export_label, provenance_recorded_by, provenance_recorded_at
           from benchmarks
          where project_type = $1 and construction_kind = $2
          order by cost_code`,
        [answers.projectType, answers.constructionKind],
      );
      return rows.map(toBenchmark);
    });

    const rom = await step(db, runId, ++seq, "compute_rom", async () =>
      computeRom(answers, { benchmarks }),
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

function toBenchmark(row: BenchmarkRow): Benchmark {
  const recordedAt = row.provenance_recorded_at;
  return {
    costCode: row.cost_code,
    label: row.label,
    unit: row.unit,
    // Postgres numeric arrives as a string so no precision is lost in transit.
    value: Number(row.value),
    projectType: row.project_type,
    constructionKind: row.construction_kind,
    comparableCount: row.comparable_count,
    provenance: {
      kind: row.provenance_kind,
      sourceProjectIds: row.provenance_source_project_ids,
      exportLabel: row.provenance_export_label,
      recordedBy: row.provenance_recorded_by,
      recordedAt:
        recordedAt instanceof Date
          ? recordedAt.toISOString().slice(0, 10)
          : String(recordedAt).slice(0, 10),
    },
  };
}
