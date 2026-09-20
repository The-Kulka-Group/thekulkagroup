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
  return database;
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
