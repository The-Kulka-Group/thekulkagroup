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
export async function seededDatabase(
  options: { statedRates?: boolean; elevatorRates?: boolean; pileRates?: boolean; garageRates?: boolean } = {},
): Promise<Db & { close: () => Promise<void> }> {
  const pg = new PGlite();

  for (const file of readdirSync(MIGRATIONS).sort()) {
    if (!file.endsWith(".sql")) continue;
    await pg.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }

  // 20260927150000_demolition_stated_rates.sql records Matt's demolition
  // rates for multifamily, the same type as the test project. Most tests
  // expect the synthetic TEST benchmark below to be the only one, so they
  // drop those rows. A test that reads the rates passes `statedRates: true`.
  if (!options.statedRates) {
    await pg.query(`delete from benchmarks where cost_code in ('1', '1a')`);
  }

  // 20260927210000_elevator_stated_rates.sql records Matt's item 26 and 26a
  // rates the same way (LA-1205). Same reasoning: dropped by default so the
  // synthetic TEST benchmark stays the only row most tests see, and a test
  // that reads the elevator rates passes `elevatorRates: true`.
  if (!options.elevatorRates) {
    await pg.query(`delete from benchmarks where cost_code in ('26', '26a')`);
  }

  // 20261011100000_piles_allowance_stated_rate.sql records the WS piles
  // allowance on item 34a (LA-2214). Dropped by default for the same reason;
  // a test that reads it passes `pileRates: true`.
  if (!options.pileRates) {
    await pg.query(`delete from benchmarks where cost_code = '34a'`);
  }

  // 20261011110000_podium_garage_rates.sql records VA's podium deck, garage
  // electrical and garage sprinkler rates (LA-2216). Same reasoning: dropped
  // by default, and a test that reads them passes `garageRates: true`.
  if (!options.garageRates) {
    await pg.query(`delete from benchmarks where unit = 'usd_per_sf_of_garage'`);
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
    // Same PGlite-native transaction lib/browser-test-db.ts uses -- see its
    // comment for why a client checkout (lib/db.ts's pool-backed path) isn't
    // needed here.
    withTransaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> =>
      pg.transaction(async (pgliteTx) => {
        const tx: Db = {
          query: async <Row>(text: string, params: unknown[] = []) => {
            const { rows } = await pgliteTx.query<Row>(text, params as never[]);
            return { rows };
          },
          withTransaction: () => {
            throw new Error("Nested transactions are not supported.");
          },
        };
        return fn(tx);
      }),
    close: () => pg.close(),
  };
}
