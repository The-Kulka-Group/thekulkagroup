import { Pool } from "pg";

// One narrow interface over Postgres. Supabase is Postgres, so the app talks to
// it in SQL rather than through a REST client, and the API tests run the same
// statements against an in-process Postgres that wants neither Docker nor a
// network.
//
// `pg.Pool` and PGlite both satisfy this shape, which is the whole point of it.
export type Db = {
  query<Row>(text: string, params?: unknown[]): Promise<{ rows: Row[] }>;

  /**
   * Runs `fn` against one connection wrapped in BEGIN/COMMIT, rolling back if
   * `fn` throws. Added in code review (2026-09-20) for lib/rom/ingest.ts's
   * approveCostImport, which needs more than one write to succeed or fail
   * together and needs a read-then-write that is atomic against a second,
   * concurrent caller doing the same thing -- a bare sequence of awaited
   * `db.query` calls (this file's original shape) gives neither.
   *
   * `pg.Pool.query` can hand each call to a different pooled connection, so
   * a real transaction needs one connection checked out for its whole
   * duration (see the pool-backed implementation below). PGlite is already a
   * single in-process connection with its own internal exclusivity lock, so
   * lib/browser-test-db.ts and test/database.ts wrap its own `.transaction`
   * instead of reimplementing BEGIN/COMMIT/ROLLBACK by hand.
   *
   * Not reentrant: `fn` receives a `tx` scoped to this transaction, and
   * calling `tx.withTransaction` again throws rather than silently nesting.
   * Nothing in this codebase needs nested transactions yet.
   */
  withTransaction<T>(fn: (tx: Db) => Promise<T>): Promise<T>;
};

function nestedTransactionsNotSupported(): never {
  throw new Error("Nested transactions are not supported.");
}

let pool: Pool | undefined;
let poolDb: Db | undefined;
let browserTestDb: Db | undefined;

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

// `pg`'s own `query<Row extends QueryResultRow>` is more constrained than
// `Db['query']<Row>` (no constraint at all, so any row shape a caller names
// works). Going through `unknown` here is the cast that reconciles the two
// without weakening `Db` itself to match `pg`'s constraint.
function wrapPool(target: Pool): Db {
  return {
    query: <Row>(text: string, params: unknown[] = []) =>
      target.query(text, params).then((result) => ({ rows: result.rows as unknown as Row[] })),
    withTransaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
      const client = await target.connect();
      const tx: Db = {
        query: <Row>(text: string, params: unknown[] = []) =>
          client.query(text, params).then((result) => ({ rows: result.rows as unknown as Row[] })),
        withTransaction: nestedTransactionsNotSupported,
      };
      try {
        await client.query("begin");
        const result = await fn(tx);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => {
          // The connection may already be unusable (e.g. it errored mid-
          // transaction, which aborts the transaction server-side); the
          // original `error` is what the caller needs to see either way.
        });
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** The app's database. Vercel's Supabase integration provides POSTGRES_URL. */
export function getDb(): Db {
  if (process.env.KULKA_BROWSER_TEST === "1") {
    browserTestDb ??= {
      query: async <Row>(text: string, params: unknown[] = []) => {
        const { getBrowserTestDb } = await import("@/lib/browser-test-db");
        return getBrowserTestDb().query<Row>(text, params);
      },
      withTransaction: async <T>(fn: (tx: Db) => Promise<T>): Promise<T> => {
        const { getBrowserTestDb } = await import("@/lib/browser-test-db");
        return getBrowserTestDb().withTransaction<T>(fn);
      },
    };
    return browserTestDb;
  }
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
  poolDb ??= wrapPool(pool);
  return poolDb;
}
