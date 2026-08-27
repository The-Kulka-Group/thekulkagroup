import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

import type { Db } from "@/lib/db";

export { FIXTURE_PROJECT_ID } from "@/lib/rom/fixture";

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

  return {
    query: <Row>(text: string, params: unknown[] = []) =>
      pg.query<Row>(text, params as never[]).then(({ rows }) => ({ rows })),
    close: () => pg.close(),
  };
}
