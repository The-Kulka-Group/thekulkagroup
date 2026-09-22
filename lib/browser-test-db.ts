import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import type { Db } from "@/lib/db";

declare global {
  var kulkaBrowserTestDatabase: Promise<PGlite> | undefined;
}

export function getBrowserTestDb(): Db {
  globalThis.kulkaBrowserTestDatabase ??= createBrowserTestDatabase();
  return {
    query: async <Row>(text: string, params: unknown[] = []) => {
      const database = await globalThis.kulkaBrowserTestDatabase!;
      const { rows } = await database.query<Row>(text, params as never[]);
      return { rows };
    },
    // PGlite is one in-process connection with its own internal exclusivity
    // lock, so its own `.transaction()` (real BEGIN/COMMIT/ROLLBACK) is
    // enough -- no client checkout needed the way lib/db.ts's pool-backed
    // implementation does.
    withTransaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
      const database = await globalThis.kulkaBrowserTestDatabase!;
      return database.transaction(async (pgliteTx) => {
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
      });
    },
  };
}

async function createBrowserTestDatabase() {
  const database = new PGlite();
  const migrations = join(process.cwd(), "supabase", "migrations");
  for (const file of readdirSync(migrations).sort()) {
    if (file.endsWith(".sql")) {
      await database.exec(readFileSync(join(migrations, file), "utf8"));
    }
  }
  await seedVisionMapFixtures(database);
  await seedRomFixtures(database);
  return database;
}

/**
 * The project id the ROM screens run against in browser-test mode. Set
 * `ROM_PROJECT_ID` to this to walk the ROM surface locally.
 */
export const BROWSER_TEST_ROM_PROJECT_ID = "30000000-0000-4000-8000-000000000001";

/**
 * Enough of a ROM to render every screen: one project, benchmarks across the
 * source kinds so the blend and the drill-down have something to show, and one
 * approved judgment rule so a line carries an adjustment.
 *
 * Every figure here is synthetic and says so in its own label. None of it is a
 * Kulka cost, and none of it may be read as one. Real benchmarks arrive only
 * through the ingestion gate.
 */
async function seedRomFixtures(database: PGlite) {
  await database.exec(`
    insert into projects (id, name, project_type, construction_kind, gross_square_feet, percent_complete)
    values
      ('${BROWSER_TEST_ROM_PROJECT_ID}', 'Synthetic browser test project', 'multifamily', 'new', 100000, null),
      ('30000000-0000-4000-8000-000000000002', 'Synthetic past project A', 'multifamily', 'new', 90000, 100),
      ('30000000-0000-4000-8000-000000000003', 'Synthetic past project B', 'multifamily', 'new', 120000, 56);

    insert into benchmarks
      (id, cost_code, label, unit, value, project_type, construction_kind, comparable_count,
       provenance_kind, provenance_export_label, provenance_recorded_by, provenance_recorded_at)
    values
      ('40000000-0000-4000-8000-000000000001', '03-300', 'Synthetic concrete line', 'usd_per_gsf', 20,
       'multifamily', 'new', 1, 'actuals', 'Synthetic browser test export', 'Browser test fixture', '2026-09-01'),
      ('40000000-0000-4000-8000-000000000002', '03-300', 'Synthetic concrete line', 'usd_per_gsf', 24,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-02'),
      ('40000000-0000-4000-8000-000000000003', '09-900', 'Synthetic finishes line', 'usd_per_gsf', 12,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-03'),
      ('40000000-0000-4000-8000-000000000004', '31-200', 'Synthetic sitework line', 'usd_per_gsf', 8,
       'multifamily', 'new', 0, 'llm_proposal', 'Synthetic browser test export', 'Browser test fixture', '2026-09-04');

    insert into benchmark_source_projects (benchmark_id, project_id)
    values
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002');

    update benchmarks set scope_side = 'site' where cost_code = '31-200';

    insert into judgment_rules
      (id, cost_code, label, project_type, construction_kind, condition_fact, condition_value,
       adjustment_usd_per_gsf, stated_by, stated_on, reason, status, approved_by, approved_at)
    values
      ('50000000-0000-4000-8000-000000000001', '09-900', 'Synthetic browser test rule',
       'multifamily', 'new', 'amenity_scope', 'yes', 3,
       'Browser test fixture', '2026-09-05',
       'A synthetic fixture so the drill-down has a judgment row to show. Not a Kulka figure.',
       'approved', 'Browser test fixture', now());
  `);
}

/** Give browser tests one source and one area marker for each record type. */
async function seedVisionMapFixtures(database: PGlite) {
  await database.exec(`
    insert into vision_opportunities
      (id, name, town, county, address, latitude, longitude, source_title, source_url, source_date, notes)
    values
      ('10000000-0000-4000-8000-000000000001', 'Tracked exact location', 'Islip', 'Suffolk', '100 Main Street, Islip, NY', 40.7298, -73.2104, 'Browser test source', 'https://example.test/tracked-exact', '2026-09-10', 'Synthetic browser test record.'),
      ('10000000-0000-4000-8000-000000000002', 'Tracked approximate area', 'Smithtown', 'Suffolk', '', null, null, 'Browser test source', 'https://example.test/tracked-approximate', '2026-09-11', 'Synthetic browser test record.');

    insert into vision_discovery_sources (id, record_count)
    values ('nassau-applications', 2);

    insert into vision_discovery_candidates (id, source_id, external_id, snapshot)
    values
      (
        '20000000-0000-4000-8000-000000000001',
        'nassau-applications',
        'browser-test-exact',
        jsonb_build_object(
          'externalId', 'browser-test-exact',
          'name', 'Discovery exact location',
          'town', 'Uniondale',
          'county', 'Nassau',
          'address', '200 Charles Lindbergh Boulevard, Uniondale, NY',
          'latitude', 40.7004,
          'longitude', -73.5929,
          'sourceTitle', 'Browser test source',
          'sourceUrl', 'https://example.test/discovery-exact',
          'sourceDate', '2026-09-10',
          'sourceDateLabel', 'Filed',
          'details', jsonb_build_object('Record type', 'Planning application')
        )
      ),
      (
        '20000000-0000-4000-8000-000000000002',
        'nassau-applications',
        'browser-test-approximate',
        jsonb_build_object(
          'externalId', 'browser-test-approximate',
          'name', 'Discovery approximate area',
          'town', 'Hauppauge',
          'county', 'Suffolk',
          'address', '',
          'latitude', null,
          'longitude', null,
          'sourceTitle', 'Browser test source',
          'sourceUrl', 'https://example.test/discovery-approximate',
          'sourceDate', '2026-09-11',
          'sourceDateLabel', 'Filed',
          'details', jsonb_build_object('Record type', 'Planning application')
        )
      );
  `);
}
