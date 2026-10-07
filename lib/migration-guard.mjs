const MIGRATION_FILE = /^(\d+)_.*\.sql$/;

/**
 * Supabase skips files that do not match `<digits>_<name>.sql`, so this does
 * too. Otherwise a stray file would fail every production build.
 *
 * @param {string[]} localFiles file names from supabase/migrations
 * @param {string[]} appliedVersions versions from supabase_migrations.schema_migrations
 * @returns {string[]} local migration file names not yet applied, sorted ascending
 */
export function unappliedMigrations(localFiles, appliedVersions) {
  const applied = new Set(appliedVersions);
  return localFiles
    .filter((file) => {
      const match = MIGRATION_FILE.exec(file);
      return match !== null && !applied.has(match[1]);
    })
    .sort();
}
