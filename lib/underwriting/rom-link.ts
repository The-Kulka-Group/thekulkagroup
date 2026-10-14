import { STRAIGHT_LINE_DISTRIBUTION_VERSION, type Rom } from "@kulka/engine";

import type { Db } from "@/lib/db";
import { savedRom } from "@/lib/rom/run-records";
import { INTAKE_LINE_IDS } from "@/lib/underwriting/intake-seed";

// LA-2417. An underwriting case links one ROM budget and takes its hard cost
// from the budget's newest saved run. The run that filled the case is kept,
// so a later run on the same budget reads as a newer budget to accept and
// never changes the case on its own.

/** The line a ROM fill writes when the case has no intake hard cost line to take over. */
export const ROM_HARD_COST_LINE_ID = "rom-hard-cost";

export const ROM_SOURCE_PREFIX = "ROM: ";

/** The ROM's headline figure: total project cost with markups, or trade cost on a run without them. The ROM screen leads with the same midpoint. */
export function romHardCost(rom: Rom): number {
  const range = rom.markups ? rom.markups.totalProjectCost : rom.total;
  return (range.low + range.high) / 2;
}

export type RomRunFigures = {
  runId: string;
  startedAt: string;
  total: number;
  low: number;
  high: number;
  /** The area the run priced. Null on a run that recorded none. */
  grossSquareFeet: number | null;
  perGrossSquareFoot: number | null;
};

export type RomLink = {
  projectId: string;
  projectName: string;
  archived: boolean;
  appliedRunId: string | null;
  appliedAt: string | null;
  /** The figures that filled the case. Null until a run fills it, or when that run was removed. */
  applied: RomRunFigures | null;
  /** The budget's newest saved run. Null while the budget is still being built. */
  latest: RomRunFigures | null;
};

export type RomBudgetOption = { id: string; name: string; latestRunAt: string };

export class RomLinkError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

type RunRow = { id: string; started_at: Date | string; rom: Rom; answers: { grossSquareFeet?: number } | null };

function figures(row: RunRow | undefined): RomRunFigures | null {
  if (!row?.rom) return null;
  const rom = savedRom(row.rom);
  const range = rom.markups ? rom.markups.totalProjectCost : rom.total;
  const total = romHardCost(rom);
  const grossSquareFeet = Number(row.answers?.grossSquareFeet) > 0 ? Number(row.answers?.grossSquareFeet) : null;
  return {
    runId: row.id,
    startedAt: new Date(row.started_at).toISOString(),
    total,
    low: range.low,
    high: range.high,
    grossSquareFeet,
    // To the cent, so the rate reads cleanly in the cost line. The rounding moves the total by under a cent per SF.
    perGrossSquareFoot: grossSquareFeet ? Math.round((total / grossSquareFeet) * 100) / 100 : null,
  };
}

async function latestRun(db: Db, projectId: string): Promise<RunRow | undefined> {
  const { rows } = await db.query<RunRow>(
    `select id, started_at, rom, answers from runs
      where project_id = $1 and status = 'succeeded' and rom is not null
      order by started_at desc limit 1`,
    [projectId],
  );
  return rows[0];
}

export async function readRomLink(db: Db, caseId: string): Promise<RomLink | null> {
  const { rows } = await db.query<{
    project_id: string;
    project_name: string;
    archived_at: Date | string | null;
    rom_run_id: string | null;
    rom_applied_at: Date | string | null;
  }>(
    `select p.id as project_id, p.name as project_name, p.archived_at, c.rom_run_id, c.rom_applied_at
       from underwriting_cases c join projects p on p.id = c.rom_project_id
      where c.id = $1`,
    [caseId],
  );
  const link = rows[0];
  if (!link) return null;
  const [latest, applied] = await Promise.all([
    latestRun(db, link.project_id),
    link.rom_run_id
      ? db.query<RunRow>(`select id, started_at, rom, answers from runs where id = $1`, [link.rom_run_id]).then((result) => result.rows[0])
      : Promise.resolve(undefined),
  ]);
  return {
    projectId: link.project_id,
    projectName: link.project_name,
    archived: link.archived_at !== null,
    appliedRunId: link.rom_run_id,
    appliedAt: link.rom_applied_at ? new Date(link.rom_applied_at).toISOString() : null,
    applied: figures(applied),
    latest: figures(latest),
  };
}

/** The case a ROM budget is linked to, for the ROM screen's return band. */
export async function readCaseForRomProject(db: Db, projectId: string): Promise<{ id: string; name: string } | null> {
  const { rows } = await db.query<{ id: string; name: string }>(
    `select id, name from underwriting_cases where rom_project_id = $1`,
    [projectId],
  );
  return rows[0] ?? null;
}

/** Budgets with a saved run that no other case has linked, newest run first. */
export async function listRomBudgetOptions(db: Db, caseId: string): Promise<RomBudgetOption[]> {
  const { rows } = await db.query<{ id: string; name: string; latest_run_at: Date | string }>(
    `select p.id, p.name, max(r.started_at) as latest_run_at
       from projects p
       join runs r on r.project_id = p.id and r.status = 'succeeded' and r.rom is not null
      where p.archived_at is null
        and p.rom_budget
        and not exists (
          select 1 from underwriting_cases c where c.rom_project_id = p.id and c.id <> $1
        )
      group by p.id, p.name
      order by max(r.started_at) desc`,
    [caseId],
  );
  return rows.map((row) => ({ id: row.id, name: row.name, latestRunAt: new Date(row.latest_run_at).toISOString() }));
}

/**
 * Links a budget to a case. The two share one name from here on, and the case's name wins, so a
 * budget picked from the list takes the case's name.
 */
export async function linkRomProject(db: Db, caseId: string, projectId: string): Promise<void> {
  await db.withTransaction((tx) => linkRomProjectWithin(tx, caseId, projectId));
}

/** linkRomProject inside a caller's transaction, so a new budget and its link land together. */
export async function linkRomProjectWithin(tx: Db, caseId: string, projectId: string): Promise<void> {
  const { rows: taken } = await tx.query<{ id: string }>(
    `select id from underwriting_cases where rom_project_id = $1 and id <> $2`,
    [projectId, caseId],
  );
  if (taken[0]) throw new RomLinkError("That budget already belongs to another underwriting project.", 409);
  const { rows } = await tx.query<{ id: string; name: string; rom_project_id: string | null }>(
    `select id, name, rom_project_id from underwriting_cases where id = $1 for update`,
    [caseId],
  );
  const found = rows[0];
  if (!found) throw new RomLinkError("Underwriting project not found.", 404);
  const { rows: project } = await tx.query<{ id: string }>(`select id from projects where id = $1`, [projectId]);
  if (!project[0]) throw new RomLinkError("ROM budget not found.", 404);
  if (found.rom_project_id === projectId) return;
  await tx.query(
    `update underwriting_cases
        set rom_project_id = $2, rom_run_id = null, rom_applied_at = null,
            case_revision = case_revision + 1, updated_at = now()
      where id = $1`,
    [caseId, projectId],
  );
  await tx.query(`update projects set name = $2 where id = $1 and name is distinct from $2`, [projectId, found.name]);
}

const SOURCE_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
// The same New York day as the label, as YYYY-MM-DD.
const SOURCE_DAY = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "America/New_York" });

export function romSourceLabel(projectName: string, startedAt: string) {
  return `${ROM_SOURCE_PREFIX}${projectName}, ${SOURCE_DATE.format(new Date(startedAt))}`;
}

/**
 * Fills the case's hard cost from the linked budget's newest saved run. Before the cost schedule is
 * first saved the case's hard cost per gross SF feeds the schedule's seeded Hard Cost line, so the
 * fill sets that value. After, it rewrites the hard cost line the intake seeded, or adds one. The
 * line is priced per gross SF on the ROM's area, or as a fixed amount when the run recorded none.
 * Returns false when the budget has no saved run yet.
 */
export async function applyLatestRomRun(db: Db, caseId: string): Promise<boolean> {
  return db.withTransaction(async (tx) => {
    const { rows } = await tx.query<{
      rom_project_id: string | null;
      project_name: string | null;
      analysis_start_month: Date | string | null;
    }>(
      `select c.rom_project_id, p.name as project_name, c.analysis_start_month
         from underwriting_cases c left join projects p on p.id = c.rom_project_id
        where c.id = $1 for update of c`,
      [caseId],
    );
    const found = rows[0];
    if (!found) throw new RomLinkError("Underwriting project not found.", 404);
    if (!found.rom_project_id || !found.project_name) throw new RomLinkError("This project has no linked ROM budget.", 409);
    const run = figures(await latestRun(tx, found.rom_project_id));
    if (!run) return false;

    const sourceLabel = romSourceLabel(found.project_name, run.startedAt);
    const sourceDate = SOURCE_DAY.format(new Date(run.startedAt));
    if (found.analysis_start_month === null) {
      if (run.perGrossSquareFoot !== null) {
        await tx.query(
          `insert into underwriting_case_assumptions
             (case_id, assumption_key, value, unit, source_label, source_date, review_state)
           values ($1, 'hard_cost_per_gross_square_foot', $2, 'usd_per_gross_square_foot', $3, $4, 'working')
           on conflict (case_id, assumption_key) do update
           set value = excluded.value, unit = excluded.unit,
               source_label = excluded.source_label, source_date = excluded.source_date,
               review_state = 'working', value_changed_at = now(), updated_at = now()`,
          [caseId, run.perGrossSquareFoot, sourceLabel, sourceDate],
        );
      }
    } else {
      await writeHardCostLine(tx, caseId, run, sourceLabel, sourceDate);
    }
    await tx.query(
      `update underwriting_cases
          set rom_run_id = $2, rom_applied_at = now(), case_revision = case_revision + 1, updated_at = now()
        where id = $1`,
      [caseId, run.runId],
    );
    return true;
  });
}

async function writeHardCostLine(tx: Db, caseId: string, run: RomRunFigures, sourceLabel: string, sourceDate: string) {
  const basis = run.perGrossSquareFoot !== null
    ? { type: "per_gross_square_foot", rate: run.perGrossSquareFoot, amount: null }
    : { type: "fixed", rate: null, amount: run.total };
  const { rows: existing } = await tx.query<{ id: string }>(
    `select id from underwriting_case_cost_lines
      where case_id = $1 and id = any($2::text[])
      order by case id when $3 then 0 else 1 end limit 1`,
    [caseId, [ROM_HARD_COST_LINE_ID, INTAKE_LINE_IDS.hardCost], ROM_HARD_COST_LINE_ID],
  );
  if (existing[0]) {
    await tx.query(
      `update underwriting_case_cost_lines
          set category = 'hard_cost', basis_type = $3, basis_rate = $4, amount = $5,
              basis_base_line_id = null, basis_percent = null, basis_total_base = null,
              source_label = $6, source_date = $7, review_state = 'working',
              value_changed_at = now(), updated_at = now()
        where case_id = $1 and id = $2`,
      [caseId, existing[0].id, basis.type, basis.rate, basis.amount, sourceLabel, sourceDate],
    );
    return;
  }
  // No hard cost line to take over. The new line borrows the timing of the case's first hard cost
  // line, or sits in the analysis start month, and starts as working so the timing gets a look.
  await tx.query(
    `insert into underwriting_case_cost_lines
       (case_id, id, line_order, name, category, amount, unit, basis_type, basis_rate,
        start_month, end_month, distribution_method, distribution_version,
        source_label, source_date, review_state)
     select c.id, $2, coalesce((select max(line_order) + 1 from underwriting_case_cost_lines where case_id = c.id), 0),
            'Hard Cost', 'hard_cost', $5, 'usd', $3, $4,
            coalesce(timing.start_month, c.analysis_start_month), coalesce(timing.end_month, c.analysis_start_month),
            coalesce(timing.distribution_method, 'straight_line'), coalesce(timing.distribution_version, $8),
            $6, $7, 'working'
       from underwriting_cases c
       left join lateral (
         select start_month, end_month, distribution_method, distribution_version
           from underwriting_case_cost_lines
          where case_id = c.id and category = 'hard_cost'
          order by line_order limit 1
       ) timing on true
      where c.id = $1`,
    [caseId, ROM_HARD_COST_LINE_ID, basis.type, basis.rate, basis.amount, sourceLabel, sourceDate, STRAIGHT_LINE_DISTRIBUTION_VERSION],
  );
}
