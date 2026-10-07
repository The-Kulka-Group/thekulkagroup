import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { unappliedMigrations } from "./migration-guard.mjs";

const SCRIPT = fileURLToPath(
  new URL("../scripts/check-migrations-applied.mjs", import.meta.url),
);

function runScript(env: Record<string, string>) {
  const base = { ...process.env };
  delete base.VERCEL_ENV;
  delete base.POSTGRES_URL;
  delete base.DATABASE_URL;
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...base, ...env },
    encoding: "utf8",
  });
}

describe("unappliedMigrations", () => {
  const files = [
    "20261006030000_construction_rate_path.sql",
    "20261006040000_lease_up_realism.sql",
    "20261007010000_scenario_lender_metrics.sql",
  ];

  it("returns nothing when every migration is applied", () => {
    const applied = ["20261006030000", "20261006040000", "20261007010000"];
    expect(unappliedMigrations(files, applied)).toEqual([]);
  });

  it("returns the one file that is missing", () => {
    const applied = ["20261006030000", "20261006040000"];
    expect(unappliedMigrations(files, applied)).toEqual([
      "20261007010000_scenario_lender_metrics.sql",
    ]);
  });

  it("ignores files that are not sql migrations", () => {
    expect(unappliedMigrations(["README.md", ".DS_Store", ...files], [])).toEqual(files);
  });

  it("sorts the result ascending", () => {
    expect(unappliedMigrations([...files].reverse(), [])).toEqual(files);
  });
});

describe("check-migrations-applied script", () => {
  it("skips and exits 0 when VERCEL_ENV is not production", () => {
    const result = runScript({});
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("runs only on production builds");
  });

  it("fails closed on a production build with no connection string", () => {
    const result = runScript({ VERCEL_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("POSTGRES_URL");
  });
});
