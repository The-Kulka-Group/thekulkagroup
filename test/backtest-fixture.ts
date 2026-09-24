import type { Db } from "@/lib/db";

// Two synthetic jobs loaded the way a real one is: an approved cost import
// whose approved lines each point at a benchmark, and that benchmark's source
// project in benchmark_source_projects. Shared by the backtest's library and
// route tests (LA-23).

export const JOB_A = "00000000-0000-4000-8000-0000000000a1";
export const JOB_B = "00000000-0000-4000-8000-0000000000b1";

type BudgetLine = { costCode: string; usdPerGsf: number };

async function loadJob(
  db: Db,
  job: { id: string; name: string; grossSquareFeet: number; lines: BudgetLine[] },
): Promise<void> {
  await db.query(
    `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
     values ($1, $2, 'multifamily', 'new', $3)`,
    [job.id, job.name, job.grossSquareFeet],
  );
  const { rows: imports } = await db.query<{ id: string }>(
    `insert into cost_imports
       (source_project_id, export_label, provenance_kind, uploaded_by, status, approved_by, approved_at)
     values ($1, 'synthetic export', 'proest_budget', 'automated test', 'approved', 'automated test', now())
     returning id`,
    [job.id],
  );
  const { rows: items } = await db.query<{ id: string }>(
    `select id from canonical_work_items where item_number = '2'`,
  );

  for (const [i, line] of job.lines.entries()) {
    const { rows: benchmarks } = await db.query<{ id: string }>(
      `insert into benchmarks
         (cost_code, label, unit, value, project_type, construction_kind, comparable_count,
          provenance_kind, provenance_export_label, provenance_recorded_by, provenance_recorded_at)
       values ($1, $2, 'usd_per_gsf', $3, 'multifamily', 'new', 1,
               'proest_budget', 'synthetic export', 'automated test', date '2026-09-24')
       returning id`,
      [line.costCode, `${job.name} ${line.costCode}`, line.usdPerGsf],
    );
    await db.query(`insert into benchmark_source_projects (benchmark_id, project_id) values ($1, $2)`, [
      benchmarks[0].id,
      job.id,
    ]);
    await db.query(
      `insert into cost_import_lines
         (cost_import_id, row_number, raw_description, value_usd_per_gsf,
          candidate_canonical_item_id, candidate_score, status, benchmark_id)
       values ($1, $2, $3, $4, $5, 1, 'approved', $6)`,
      [imports[0].id, i + 1, `${job.name} ${line.costCode}`, line.usdPerGsf, items[0].id, benchmarks[0].id],
    );
  }

  // A line routed to GRs/GCs is 'markup' and never trade cost. It is staged
  // here so a test can see the backtest leave it out.
  await db.query(
    `insert into cost_import_lines
       (cost_import_id, row_number, raw_description, value_usd_per_gsf,
        candidate_canonical_item_id, candidate_score, status)
     values ($1, $2, 'General conditions', 40, $3, 1, 'markup')`,
    [imports[0].id, job.lines.length + 1, items[0].id],
  );
}

/**
 * Job A: 2,000 SF, X1 at $50/SF. Job B: 1,000 SF, X1 at $70/SF and X2 at
 * $10/SF. Only B has X2, so A's ROM predicts it and B's budget carries it
 * with nothing to predict it from.
 */
export async function loadTwoJobs(db: Db): Promise<void> {
  await loadJob(db, { id: JOB_A, name: "Job A (synthetic)", grossSquareFeet: 2000, lines: [{ costCode: "X1", usdPerGsf: 50 }] });
  await loadJob(db, {
    id: JOB_B,
    name: "Job B (synthetic)",
    grossSquareFeet: 1000,
    lines: [
      { costCode: "X1", usdPerGsf: 70 },
      { costCode: "X2", usdPerGsf: 10 },
    ],
  });
}

/** Row counts for every table in the schema, to show a read wrote nothing. */
export async function tableCounts(db: Db): Promise<Record<string, number>> {
  const { rows: tables } = await db.query<{ table_name: string }>(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name`,
  );
  const counts: Record<string, number> = {};
  for (const { table_name } of tables) {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from "${table_name}"`);
    counts[table_name] = rows[0].n;
  }
  return counts;
}
