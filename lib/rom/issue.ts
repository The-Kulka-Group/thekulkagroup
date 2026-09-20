import { scoreClosingComparison, type Rom } from "@kulka/engine";

import type { Db } from "@/lib/db";

// Issuing a ROM, linking it to the project it becomes, and recording a
// closing comparison against that project's actuals (LA-680, LA-681). This
// extends LA-12's run seam the same way lib/rom/run.ts does: the engine stays
// pure (packages/engine/src/rom-intake.ts's scoreClosingComparison), and this
// file owns every side effect.
//
// There is no importer yet (LA-15), so nothing here fires automatically off
// an import the way LA-680 ultimately intends. `recordClosingComparison` is
// the write path that importer calls once it exists; today it is a function
// a caller invokes directly, same as `issueRom` and `linkRomToProject`.

export class RunNotFound extends Error {
  constructor(readonly runId: string) {
    super(`No run ${runId}.`);
    this.name = "RunNotFound";
  }
}

/** Only a succeeded run has a frozen `rom` to issue (LA-680: "Decision 21 makes an issued ROM a frozen version"). */
export class RunNotSucceeded extends Error {
  constructor(
    readonly runId: string,
    readonly status: string,
  ) {
    super(`Run ${runId} has status "${status}", not "succeeded", so it cannot be issued.`);
    this.name = "RunNotSucceeded";
  }
}

/** A closing comparison needs the link LA-680 requires before it can run. */
export class RunNotLinked extends Error {
  constructor(readonly runId: string) {
    super(`Run ${runId} has no linked project, so no closing comparison can run.`);
    this.name = "RunNotLinked";
  }
}

type RunRow = {
  id: string;
  status: string;
  rom: Rom | null;
  linked_project_id: string | null;
  issued_at: Date | string | null;
};

async function readRun(db: Db, runId: string): Promise<RunRow> {
  const { rows } = await db.query<RunRow>(
    `select id, status, rom, linked_project_id, issued_at from runs where id = $1`,
    [runId],
  );
  const found = rows[0];
  if (!found) throw new RunNotFound(runId);
  return found;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

/**
 * Records when an issued ROM was printed or exported (LA-681). Idempotent by
 * design: issuing is "a deliberate action" (rom-spec.md), not a repeatable
 * export log, so a second call keeps the first timestamp rather than
 * overwriting it.
 *
 * Judgment call: LA-681 does not say whether re-exporting later moves the
 * timestamp. Keeping the first issuance date is the reading consistent with
 * "Decision 21 makes an issued ROM a frozen version" (LA-680) -- the moment
 * that matters is when the ROM stopped being a draft, not every later print.
 */
export async function issueRom(db: Db, runId: string): Promise<{ issuedAt: string }> {
  const run = await readRun(db, runId);
  if (run.status !== "succeeded") throw new RunNotSucceeded(runId, run.status);

  const { rows } = await db.query<{ issued_at: Date | string }>(
    `update runs set issued_at = coalesce(issued_at, now()) where id = $1 returning issued_at`,
    [runId],
  );
  // Fixed in code review (2026-09-20): readRun above and this update are two
  // separate queries with no transaction between them. runs.project_id is
  // `on delete cascade`, so a project deleted in that gap would cascade this
  // run away too, leaving rows empty. Throwing the same typed error readRun
  // already uses beats an unhandled TypeError on rows[0].
  const updated = rows[0];
  if (!updated) throw new RunNotFound(runId);
  return { issuedAt: toIso(updated.issued_at) };
}

/**
 * Links an issued ROM to the project record it becomes (LA-680: "set
 * whenever the link exists, not required at issue time"). The foreign key on
 * `runs.linked_project_id` already rejects a project id that does not exist,
 * same pattern this schema already uses for `benchmark_source_projects`.
 */
export async function linkRomToProject(db: Db, runId: string, projectId: string): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `update runs set linked_project_id = $2 where id = $1 returning id`,
    [runId, projectId],
  );
  if (rows.length === 0) throw new RunNotFound(runId);
}

export type ClosingComparisonRecord = {
  id: string;
  runId: string;
  projectId: string;
  predictedTradeCost: { low: number; high: number };
  actualTradeCost: number;
  percentError: number;
  withinTenPercent: boolean;
  percentComplete: number | null;
};

type ClosingComparisonRow = {
  id: string;
  run_id: string;
  project_id: string;
  predicted_trade_cost_low: string;
  predicted_trade_cost_high: string;
  actual_trade_cost: string;
  percent_error: string;
  within_ten_percent: boolean;
  percent_complete: string | null;
};

/**
 * Runs a closing comparison for a linked, issued run (LA-680): predicted
 * trade cost from the frozen ROM against actual trade cost from an import,
 * scored at ADR 0005's 10 percent bar via the engine's pure
 * `scoreClosingComparison`.
 *
 * Judgment call: "predicted trade cost" is read as the ROM's existing `total`
 * field. rom-spec.md's backtest section defines trade cost as the budget
 * "less General Conditions and less insurance and fee" (the 90-series), but
 * the walking skeleton's engine has no 90-series markup layer yet (that is
 * ADR 0004's own future work) -- `total` already sums only benchmark lines
 * with nothing markup-like added on top, so it already is trade cost at this
 * stage. This will need revisiting once the engine grows a 90-series.
 */
export async function recordClosingComparison(
  db: Db,
  runId: string,
  actualTradeCost: number,
  percentComplete?: number,
): Promise<ClosingComparisonRecord> {
  const run = await readRun(db, runId);
  if (run.status !== "succeeded" || !run.rom) throw new RunNotSucceeded(runId, run.status);
  if (!run.linked_project_id) throw new RunNotLinked(runId);

  const predicted = { low: run.rom.total.low, high: run.rom.total.high };
  const score = scoreClosingComparison(predicted, actualTradeCost);

  const { rows } = await db.query<ClosingComparisonRow>(
    `insert into closing_comparisons
       (run_id, project_id, predicted_trade_cost_low, predicted_trade_cost_high,
        actual_trade_cost, percent_error, within_ten_percent, percent_complete)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [
      runId,
      run.linked_project_id,
      predicted.low,
      predicted.high,
      actualTradeCost,
      score.percentError,
      score.withinTenPercent,
      percentComplete ?? null,
    ],
  );

  const row = rows[0];
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    predictedTradeCost: {
      low: Number(row.predicted_trade_cost_low),
      high: Number(row.predicted_trade_cost_high),
    },
    actualTradeCost: Number(row.actual_trade_cost),
    percentError: Number(row.percent_error),
    withinTenPercent: row.within_ten_percent,
    percentComplete: row.percent_complete === null ? null : Number(row.percent_complete),
  };
}
