import { createHash } from "node:crypto";

import {
  PASS_BAR_PERCENT,
  runBacktest,
  type Answers,
  type BacktestActualLine,
  type BacktestProjectInput,
  type BacktestReport,
  type ContractSide,
  type JudgmentRule,
} from "@kulka/engine";

import type { Db } from "@/lib/db";
import { readApprovedJudgmentRules } from "@/lib/rom/judgment";
import {
  PROJECT_COLUMNS,
  answersFromProject,
  assembleSnapshot,
  hashSnapshot,
  readBenchmarkData,
  readParameterData,
  type BenchmarkData,
  type ProjectRow,
} from "@/lib/rom/run";

// The leave-one-out backtest (LA-23). For every project with an approved cost
// import, run the engine off that project's own record, with a snapshot that
// leaves out every benchmark the project stands behind, and compare the ROM's
// trade cost to the project's own approved budget lines.
//
// Read only. Nothing here opens a run or writes a row: the backtest is a
// measurement, and the report is rebuilt from the same rows every time.

export type BacktestResult = BacktestReport & {
  passBarPercent: number;
  /** Names for every project the report mentions, including the ones that priced another. */
  projectNames: Record<string, string>;
  /** sha256 over every project's inputs. The same rows give the same hash and the same report. */
  snapshotHash: string;
};

type ActualRow = {
  cost_code: string;
  label: string;
  value: string;
  contract_side: ContractSide;
};

export async function runLeaveOneOutBacktest(db: Db): Promise<BacktestResult> {
  const { rows: projects } = await db.query<ProjectRow>(
    `select ${PROJECT_COLUMNS}
       from projects p
      where exists (
        select 1
          from cost_imports ci
          join cost_import_lines l on l.cost_import_id = ci.id
         where ci.source_project_id = p.id and l.status = 'approved'
      )
      order by name, id`,
  );

  const rated = await readParameterData(db);
  const byKind = new Map<string, { data: BenchmarkData; judgmentRules: JudgmentRule[] }>();

  const inputs: BacktestProjectInput[] = [];
  const hashed: unknown[] = [];

  for (const project of projects) {
    const kindKey = `${project.project_type}/${project.construction_kind}`;
    let shared = byKind.get(kindKey);
    if (!shared) {
      shared = {
        data: await readBenchmarkData(db, project.project_type, project.construction_kind),
        judgmentRules: await readApprovedJudgmentRules(db, {
          projectType: project.project_type,
          constructionKind: project.construction_kind,
        }),
      };
      byKind.set(kindKey, shared);
    }

    // Leave this project out: every benchmark it stands behind, alone or with
    // other jobs, and its own GRs/GCs figures. The backtest measures trade
    // cost, so no markups are priced and markup history never joins the
    // snapshot anyway; it is dropped too so nothing of this job's is in reach.
    const withoutSelf: BenchmarkData = {
      ...shared.data,
      benchmarks: shared.data.benchmarks.filter(
        (b) => !b.provenance.sourceProjectIds.includes(project.id),
      ),
      markupHistory: shared.data.markupHistory.filter((h) => h.projectId !== project.id),
    };
    const snapshot = assembleSnapshot(withoutSelf, rated, shared.judgmentRules, false);

    // A project with no area cannot be budgeted. It stays in the report with
    // the engine's own reason rather than being dropped.
    const answers: Answers = project.gross_square_feet
      ? answersFromProject(project)
      : {
          projectType: project.project_type,
          constructionKind: project.construction_kind,
          grossSquareFeet: 0,
        };

    const actual = await readActual(db, project.id);
    inputs.push({ projectId: project.id, projectName: project.name, answers, snapshot, actual });
    hashed.push({ projectId: project.id, answers, snapshot: hashSnapshot(snapshot), actual });
  }

  const report = runBacktest(inputs);

  const mentioned = new Set<string>(projects.map((p) => p.id));
  for (const p of report.projects) for (const id of p.pricedFrom) mentioned.add(id);
  const { rows: named } = await db.query<{ id: string; name: string }>(
    `select id, name from projects where id = any($1::uuid[]) order by id`,
    [[...mentioned]],
  );

  return {
    ...report,
    passBarPercent: PASS_BAR_PERCENT,
    projectNames: Object.fromEntries(named.map((row) => [row.id, row.name])),
    snapshotHash: createHash("sha256").update(JSON.stringify(hashed)).digest("hex"),
  };
}

/**
 * The project's own budget: every benchmark an approved line of one of its
 * imports promoted. Lines routed to GRs/GCs are 'markup', not 'approved', so
 * they never reach here, and neither do insurance or fee, which the import
 * never promotes to a benchmark.
 */
async function readActual(db: Db, projectId: string): Promise<BacktestActualLine[]> {
  const { rows } = await db.query<ActualRow>(
    `select b.cost_code, b.label, b.value, b.contract_side
       from benchmarks b
      where b.id in (
        select l.benchmark_id
          from cost_import_lines l
          join cost_imports ci on ci.id = l.cost_import_id
         where ci.source_project_id = $1 and l.status = 'approved'
      )
      order by b.cost_code, b.id`,
    [projectId],
  );
  return rows.map((row) => ({
    costCode: row.cost_code,
    label: row.label,
    // Postgres numeric arrives as a string so no precision is lost in transit.
    usdPerGsf: Number(row.value),
    contractSide: row.contract_side,
  }));
}
