import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = join(process.cwd(), "supabase", "migrations");

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * The snapshot file is named for a hash of every migration, so a migration
 * added or edited since the last run gets a fresh snapshot and a stale one is
 * never read.
 */
export function snapshotPath(): string {
  const hash = createHash("sha256");
  for (const file of migrationFiles()) {
    hash.update(file).update(readFileSync(join(MIGRATIONS, file)));
  }
  return join(tmpdir(), `kulka-pglite-${hash.digest("hex").slice(0, 16)}.tar`);
}

/** Replays every migration into a fresh in-process Postgres. */
export async function replayMigrations(): Promise<PGlite> {
  const pg = new PGlite();
  for (const file of migrationFiles()) {
    await pg.exec(readFileSync(join(MIGRATIONS, file), "utf8"));
  }
  return pg;
}

/**
 * A fresh Postgres with the migrations applied. It loads the snapshot that
 * the vitest global setup wrote (a few hundred ms) and falls back to replaying
 * the migrations (seconds, longer on a busy host) when no snapshot exists.
 */
export async function migratedDatabase(): Promise<PGlite> {
  const path = snapshotPath();
  if (!existsSync(path)) return replayMigrations();
  const loadDataDir = new Blob([readFileSync(path)]);
  return new PGlite({ loadDataDir });
}

/** Vitest globalSetup: build the snapshot once per migration set. */
export default async function writeSnapshot(): Promise<void> {
  const path = snapshotPath();
  if (existsSync(path)) return;
  const pg = await replayMigrations();
  const dump = await pg.dumpDataDir("none");
  await pg.close();
  const partial = `${path}.${process.pid}.tmp`;
  writeFileSync(partial, Buffer.from(await dump.arrayBuffer()));
  renameSync(partial, path);
}
