import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import pg from "pg";

import { unappliedMigrations } from "../lib/migration-guard.mjs";

const MIGRATIONS_DIR = fileURLToPath(
  new URL("../supabase/migrations", import.meta.url),
);

// Mirrors vercelPostgresConnectionString in lib/db.ts, which a plain node
// script cannot import because it is TypeScript.
function vercelPostgresConnectionString(connectionString) {
  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("The migration check runs only on production builds.");
    return;
  }

  const connectionString = process.env.DATABASE_URL
    ?? (process.env.POSTGRES_URL ? vercelPostgresConnectionString(process.env.POSTGRES_URL) : undefined);
  if (!connectionString) {
    fail("The migration check needs DATABASE_URL or POSTGRES_URL on production builds.");
  }

  const localFiles = readdirSync(MIGRATIONS_DIR);
  const client = new pg.Client({ connectionString });
  let applied;
  try {
    await client.connect();
    const result = await client.query(
      "select version from supabase_migrations.schema_migrations",
    );
    applied = result.rows.map((row) => row.version);
  } finally {
    await client.end().catch(() => {});
  }

  const missing = unappliedMigrations(localFiles, applied);
  if (missing.length > 0) {
    console.error("These migrations are not applied to the production database:");
    for (const file of missing) console.error(`  ${file}`);
    fail(
      "Run `supabase db push`, then redeploy. The previous deployment stays live.",
    );
  }
  console.log(`Checked ${localFiles.filter((file) => /^\d+_.*\.sql$/.test(file)).length} migrations. All are applied.`);
}

main().catch((error) => {
  fail(`The migration check failed: ${error instanceof Error ? error.message : error}`);
});
