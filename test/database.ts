import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import type { Db } from "@/lib/db";

export const TEST_PROJECT_ID = "00000000-0000-4000-8000-000000000001";
const TEST_BENCHMARK_ID = "00000000-0000-4000-8000-000000000002";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

/**
 * A throwaway Postgres with this repo's migrations applied, in process.
 *
 * The same SQL that `supabase db push` sends to Kulka's database builds it, so
 * a test passing here is testing the schema that ships. It wants no Docker, no
 * network, and no state shared between test files.
 */
export async function seededDatabase(): Promise<Db & { close: () => Promise<void> }> {
  const pg = new PGlite();

  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith(".sql")) continue;
    await pg.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }

  // Production migrations contain schema only. Synthetic inputs stay inside
  // the test process and can never reach Kulka's Supabase through db push.
  await pg.query(
    `insert into projects
       (id, name, project_type, construction_kind, gross_square_feet)
     values ($1, 'Synthetic test project', 'multifamily', 'new', 1000)`,
    [TEST_PROJECT_ID],
  );
  await pg.query(
    `insert into benchmarks
       (id, cost_code, label, unit, value, project_type, construction_kind,
        comparable_count, provenance_kind, provenance_export_label,
        provenance_recorded_by, provenance_recorded_at)
     values
       ($1, 'TEST', 'Synthetic test line', 'usd_per_gsf', 1,
        'multifamily', 'new', 1, 'reviewed_judgment', null,
        'automated test', date '2026-08-27')`,
    [TEST_BENCHMARK_ID],
  );
  await pg.query(
    `insert into benchmark_source_projects (benchmark_id, project_id)
     values ($1, $2)`,
    [TEST_BENCHMARK_ID, TEST_PROJECT_ID],
  );

  return {
    query: <Row>(text: string, params: unknown[] = []) =>
      pg.query<Row>(text, params as never[]).then(({ rows }) => ({ rows })),
    close: () => pg.close(),
  };
}
