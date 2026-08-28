import { Pool } from "pg";

// One narrow interface over Postgres. Supabase is Postgres, so the app talks to
// it in SQL rather than through a REST client, and the API tests run the same
// statements against an in-process Postgres that wants neither Docker nor a
// network.
//
// `pg.Pool` and PGlite both satisfy this shape, which is the whole point of it.
export type Db = {
  query<Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;
};

let pool: Pool | undefined;

/**
 * Match PostgreSQL's sslmode=require rules for the URL Vercel gets from
 * Supabase. The connection stays encrypted, while node-postgres accepts the
 * certificate chain used by Supabase's shared pooler.
 */
export function vercelPostgresConnectionString(connectionString?: string) {
  if (!connectionString) return undefined;

  const url = new URL(connectionString);
  url.searchParams.set("sslmode", "require");
  url.searchParams.set("uselibpqcompat", "true");
  return url.toString();
}

/** The app's database. Vercel's Supabase integration provides POSTGRES_URL. */
export function getDb(): Db {
  if (!pool) {
    const connectionString =
      process.env.DATABASE_URL ??
      vercelPostgresConnectionString(process.env.POSTGRES_URL);
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL or POSTGRES_URL must point at Kulka's Supabase database.",
      );
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}
