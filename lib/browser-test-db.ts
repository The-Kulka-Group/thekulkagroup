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
  return database;
}
