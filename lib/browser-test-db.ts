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
 * source kinds so the blend and the drill-down have something to show, one
 * approved judgment rule so a line carries an adjustment, and enough stated
 * classification for the block board to show all four levels, an element
 * reaching four divisions, and a block carved out of a level 1 lump.
 *
 * Every figure here is synthetic and says so in its own label. None of it is a
 * Kulka cost, and none of it may be read as one. Real benchmarks arrive only
 * through the ingestion gate, and a real classification is Kulka's to state.
 */
async function seedRomFixtures(database: PGlite) {
  await database.exec(`
    -- LA-1145: the lines below carry plain trade names so the screen reads
    -- like the real thing. Every figure is still fake, so the project names
    -- keep "Synthetic" as the marker on screen.
    insert into projects (id, name, project_type, construction_kind, gross_square_feet, percent_complete)
    values
      ('${BROWSER_TEST_ROM_PROJECT_ID}', 'Synthetic browser test project', 'multifamily', 'new', 100000, null),
      ('30000000-0000-4000-8000-000000000002', 'Synthetic past project A', 'multifamily', 'new', 90000, 100),
      ('30000000-0000-4000-8000-000000000003', 'Synthetic past project B', 'multifamily', 'new', 120000, 56);

    insert into benchmarks
      (id, cost_code, label, unit, value, project_type, construction_kind, comparable_count,
       provenance_kind, provenance_export_label, provenance_recorded_by, provenance_recorded_at)
    values
      ('40000000-0000-4000-8000-000000000001', '03-300', 'Concrete', 'usd_per_gsf', 20,
       'multifamily', 'new', 1, 'actuals', 'Synthetic browser test export', 'Browser test fixture', '2026-09-01'),
      ('40000000-0000-4000-8000-000000000002', '03-300', 'Concrete', 'usd_per_gsf', 24,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-02'),
      ('40000000-0000-4000-8000-000000000003', '09-900', 'Finishes', 'usd_per_gsf', 12,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-03'),
      ('40000000-0000-4000-8000-000000000004', '31-200', 'Sitework', 'usd_per_gsf', 8,
       'multifamily', 'new', 0, 'llm_proposal', 'Synthetic browser test export', 'Browser test fixture', '2026-09-04'),
      ('40000000-0000-4000-8000-000000000005', '26-100', 'Electrical', 'usd_per_gsf', 25,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-06'),
      ('40000000-0000-4000-8000-000000000006', '22-100', 'Plumbing rough-in', 'usd_per_gsf', 14,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-06'),
      ('40000000-0000-4000-8000-000000000007', '14-200', 'Elevator', 'usd_per_gsf', 2.6,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-000000000008', '26-200', 'Elevator wiring', 'usd_per_gsf', 0.72,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-000000000009', '22-300', 'Elevator pit sump', 'usd_per_gsf', 0.26,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-00000000000a', '28-300', 'Elevator fire alarm interface', 'usd_per_gsf', 0.17,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-07'),
      ('40000000-0000-4000-8000-00000000000b', '22-400', 'Bathroom fixtures', 'usd_per_gsf', 4.4,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-08'),
      ('40000000-0000-4000-8000-00000000000c', '22-500', 'Toilets, labor and material', 'usd_per_gsf', 0.35,
       'multifamily', 'new', 1, 'proest_budget', 'Synthetic browser test export', 'Browser test fixture', '2026-09-08');

    insert into benchmark_source_projects (benchmark_id, project_id)
    values
      ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000006', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000003'),
      ('40000000-0000-4000-8000-00000000000b', '30000000-0000-4000-8000-000000000002'),
      ('40000000-0000-4000-8000-00000000000c', '30000000-0000-4000-8000-000000000002');

    update benchmarks set scope_side = 'site' where cost_code = '31-200';

    -- Stated classification for the block board. Every row here is a fixture
    -- statement, not Kulka's. '31-200' is deliberately left out so the board
    -- has an unclassified block to show. The three elevator breakouts sit
    -- inside level 1 lumps whose rates already cover them, so they are priced
    -- on the board and excluded from both totals.
    insert into block_classification
      (cost_code, detail_level, element, breakout_of_cost_code, buyout_package,
       stated_by, stated_on, reason)
    values
      ('03-300', 1, null, null, 'Concrete',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a level 1 area block. Not a Kulka classification.'),
      ('09-900', 1, null, null, 'Drywall and Finishes',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a second level 1 area block. Not a Kulka classification.'),
      ('26-100', 1, null, null, 'Electrical',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture standing in for the one electrical rate per square foot that a breakout is carved out of. Not a Kulka classification.'),
      ('22-100', 1, null, null, 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture standing in for the plumbing rough-in lump that a breakout is carved out of. Not a Kulka classification.'),
      ('14-200', 2, 'Elevator', null, 'Elevator',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the Elevator element has a block that adds to the total. Not a Kulka classification.'),
      ('26-200', 2, 'Elevator', '26-100', 'Electrical',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a block carved out of the electrical lump. Not a Kulka classification.'),
      ('22-300', 2, 'Elevator', '22-100', 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the Elevator element reaches plumbing as a carve-out. Not a Kulka classification.'),
      ('28-300', 2, 'Elevator', '26-100', 'Electrical',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the Elevator element reaches a fourth division. Not a Kulka classification.'),
      ('22-400', 3, 'Bathroom', null, 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a level 3 block counted in fixture points. Not a Kulka classification.'),
      ('22-500', 4, null, null, 'Plumbing',
       'Browser test fixture', '2026-09-09',
       'A synthetic fixture so the board has a level 4 block split between material and labor. Not a Kulka classification.');

    insert into judgment_rules
      (id, cost_code, label, project_type, construction_kind, condition_fact, condition_value,
       adjustment_usd_per_gsf, stated_by, stated_on, reason, status, approved_by, approved_at)
    values
      ('50000000-0000-4000-8000-000000000001', '09-900', 'Synthetic browser test rule',
       'multifamily', 'new', 'amenity_scope', 'yes', 3,
       'Browser test fixture', '2026-09-05',
       'A synthetic fixture so the drill-down has a judgment row to show. Not a Kulka figure.',
       'approved', 'Browser test fixture', now());

    -- LA-1145: scope-gate rules for the synthetic lines above, so a scope
    -- answer takes a block out locally the way the shipped rules do on real
    -- item numbers (supabase/migrations/20260924140000_branch_gate_items.sql).
    -- Each mirrors a shipped rule's shape: the elevator gate closes the
    -- elevator line and its breakouts like item 26, site conditions closes
    -- sitework, and concrete closes only on two answers, the way item 34a
    -- reads levels below grade and site conditions together.
    insert into branch_gate_items
      (section, cost_code, closes_on, requires_all_sections, stated_by, stated_on, reason)
    values
      ('elevator', '14-200', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes the elevator block out. Not a Kulka rule.'),
      ('elevator', '26-200', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes its electrical breakout out. Not a Kulka rule.'),
      ('elevator', '22-300', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes its plumbing breakout out. Not a Kulka rule.'),
      ('elevator', '28-300', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the elevator question takes its fire alarm breakout out. Not a Kulka rule.'),
      ('site_conditions', '31-200', array['no'], null, 'Browser test fixture', '2026-09-26',
       'A synthetic fixture so the site conditions question takes the sitework block out. Not a Kulka rule.'),
      ('levels_below_grade', '03-300', array['no'], array['site_conditions'], 'Browser test fixture', '2026-09-26',
       'A synthetic fixture shaped like item 34a: concrete is off only when both questions are no. Not a Kulka rule.');
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
