import type { ProvenanceKind, Rom } from "@kulka/engine";

import type { Db } from "@/lib/db";

// The drill-down (LA-18). A finished run already holds every figure that went
// into every line, so this file adds nothing to the numbers. It reads the run
// record back, resolves the project ids the engine carried into project names,
// and works out each signal's share of the blend.
//
// A line's comparables are not the whole story once an approved estimator rule
// moves it (LA-19), so the rules that moved a line come back beside its
// signals. Without them the figures on screen would not account for the line.
//
// Nothing here invents a comparable. A line with no Kulka project behind it
// comes back with an empty project list and says so on screen.

/** One figure that went into a line, as a reader needs to see it. */
export type ProvenanceSignal = {
  kind: ProvenanceKind;
  rate: number;
  weight: number;
  /** This signal's weight as a share of every weight on the line, from 0 to 1. */
  weightShare: number;
  exportLabel: string | null;
  recordedBy: string;
  recordedAt: string;
  projects: ProvenanceProject[];
};

/**
 * A past Kulka project behind a signal. `name` is null when the project row is
 * gone, which is a missing record rather than a project without a name.
 */
export type ProvenanceProject = { id: string; name: string | null };

/** An approved estimator rule that moved the line, so the money on screen adds up. */
export type ProvenanceJudgment = {
  ruleId: string;
  /** What the rule states the condition is worth. */
  adjustmentUsdPerGsf: number;
  /** What it actually moved the rate, after the line's other signals had their weight. */
  appliedUsdPerGsf: number;
  weight: number;
  recordedBy: string;
  recordedAt: string;
};

export type LineProvenance = {
  costCode: string;
  label: string;
  /** Distinct Kulka projects standing behind the line. */
  comparableCount: number;
  signals: ProvenanceSignal[];
  /** Approved rules that moved this line, empty when none did (LA-19). */
  judgments: ProvenanceJudgment[];
};

export type RunProvenance = {
  runId: string;
  lines: LineProvenance[];
};

/** There is no such run, or it never finished, so there is nothing to drill into. */
export class RunProvenanceNotFound extends Error {
  constructor(readonly runId: string) {
    super(`No finished run ${runId}.`);
    this.name = "RunProvenanceNotFound";
  }
}

type RunRow = { id: string; rom: Rom | null };

export async function readRunProvenance(db: Db, runId: string): Promise<RunProvenance> {
  const { rows } = await db.query<RunRow>(`select id, rom from runs where id = $1`, [runId]);
  const run = rows[0];
  if (!run || !run.rom) throw new RunProvenanceNotFound(runId);

  return { runId: run.id, lines: await describeLines(db, run.rom) };
}

async function describeLines(db: Db, rom: Rom): Promise<LineProvenance[]> {
  const names = await projectNames(db, rom.lines.flatMap((l) => l.comparables.flatMap((c) => c.sourceProjectIds)));

  return rom.lines.map((line) => {
    const total = line.comparables.reduce((sum, c) => sum + c.weight, 0);
    return {
      costCode: line.costCode,
      label: line.label,
      comparableCount: line.comparableCount,
      judgments: line.judgmentAdjustments.map((a) => ({
        ruleId: a.ruleId,
        adjustmentUsdPerGsf: a.adjustmentUsdPerGsf,
        appliedUsdPerGsf: a.appliedUsdPerGsf,
        weight: a.weight,
        recordedBy: a.recordedBy,
        recordedAt: a.recordedAt,
      })),
      signals: line.comparables.map((c) => ({
        kind: c.kind,
        rate: c.rate,
        weight: c.weight,
        weightShare: total > 0 ? c.weight / total : 0,
        exportLabel: c.exportLabel,
        recordedBy: c.recordedBy,
        recordedAt: c.recordedAt,
        projects: c.sourceProjectIds.map((id) => ({ id, name: names.get(id) ?? null })),
      })),
    };
  });
}

async function projectNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(ids)];
  if (wanted.length === 0) return new Map();

  const { rows } = await db.query<{ id: string; name: string }>(
    `select id, name from projects where id = any($1::uuid[])`,
    [wanted],
  );
  return new Map(rows.map((row) => [row.id, row.name]));
}
