import {
  DEFAULT_MARKUP_CHOICES,
  planFromStaffingChoices,
  type EngineParameter,
  type FieldOfficeRate,
  type MarkupChoices,
  type MarkupHistoryRow,
  type MarkupHistorySetup,
  type MarkupMethod,
  type MarkupSetup,
  type StaffingRate,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { toDateOnly, toIso } from "./date";
import { readGrRates, type GrRate } from "./gr-rates";
import {
  CostImportAlreadyApproved,
  CostImportLineNotFound,
  CostImportNotFound,
  readStagedLine,
  type LineStatus,
  type StagedLine,
} from "./ingest";
import { parseResourcePlan } from "./resource-plan";

// GRs/GCs, fee, and insurance below the ROM subtotal (LA-1016). This file owns
// the database side: routing an imported line to markup_history, reading the
// history and rate tables a run needs, and checking the markup choices a ROM
// request carries. The math is in packages/engine/src/rom-markups.ts.

/** The setups a ROM can run with. */
export const MARKUP_SETUPS: readonly MarkupSetup[] = ["both", "gc_only", "gr_only", "separate"];
/**
 * The setups an imported line can be recorded under. A budget that splits the
 * two lines records one of each, so "separate" is not among them (LA-1383).
 */
export const MARKUP_HISTORY_SETUPS: readonly MarkupHistorySetup[] = ["both", "gc_only", "gr_only"];
/**
 * The methods a new ROM request or a project save may name. Staffing and
 * Duration is retired (LA-1397): a run recorded under it still prices as
 * recorded, and a project that saved it opens as the equivalent plan, but
 * nothing new is priced by it.
 */
export const MARKUP_METHODS: readonly MarkupMethod[] = [
  "pct_of_subtotal",
  "usd_per_gsf",
  "allocated_resources",
];

/** The other half of a split budget, for the two setups that can be one (LA-1389). */
const SPLIT_PARTNER: Record<MarkupHistorySetup, MarkupHistorySetup | null> = {
  both: null,
  gc_only: "gr_only",
  gr_only: "gc_only",
};

/** The line is already approved, excluded, or routed, or has no value, so it cannot become a GRs/GCs figure. */
export class LineNotRoutable extends Error {
  constructor(
    readonly lineId: string,
    reason: string,
  ) {
    super(`Line ${lineId} ${reason}, so it cannot be sent to GRs/GCs.`);
    this.name = "LineNotRoutable";
  }
}

/** The import has no other trade lines to divide by, so no percent can be computed. */
export class MarkupSubtotalMissing extends Error {
  constructor(readonly costImportId: string) {
    super(
      `Cost import ${costImportId} has no other trade lines in its subtotal, so a percent of subtotal cannot be computed.`,
    );
    this.name = "MarkupSubtotalMissing";
  }
}

/** This project already has a GRs/GCs figure for this setup. */
export class MarkupHistoryExists extends Error {
  constructor(
    readonly projectId: string,
    readonly setup: MarkupHistorySetup,
  ) {
    super(`Project ${projectId} already has a GRs/GCs figure recorded for setup "${setup}".`);
    this.name = "MarkupHistoryExists";
  }
}

/**
 * The project's other General Requirements or General Conditions line was
 * routed from a different import. A split budget's General Conditions is
 * measured over that import's trade cost plus its own General Requirements
 * (LA-1389), so the two lines have to come from the same file.
 */
export class MarkupSplitAcrossImports extends Error {
  constructor(
    readonly projectId: string,
    readonly setup: MarkupHistorySetup,
  ) {
    super(
      `Project ${projectId} already has ${setup === "gc_only" ? "General Requirements" : "General Conditions"} recorded from a different import. Route both lines of a split budget from the same import.`,
    );
    this.name = "MarkupSplitAcrossImports";
  }
}

export type MarkupHistoryRecord = {
  id: string;
  projectId: string;
  setup: MarkupHistorySetup;
  usdPerGsf: number;
  pctOfSubtotal: number;
  costImportLineId: string;
  recordedBy: string;
  recordedAt: string;
  exportLabel: string;
};

type HistoryRow = {
  id: string;
  project_id: string;
  setup: MarkupHistorySetup;
  usd_per_gsf: string;
  pct_of_subtotal: string;
  cost_import_line_id: string;
  recorded_by: string;
  recorded_at: Date | string;
  export_label: string;
};

function toRecord(row: HistoryRow): MarkupHistoryRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    setup: row.setup,
    usdPerGsf: Number(row.usd_per_gsf),
    pctOfSubtotal: Number(row.pct_of_subtotal),
    costImportLineId: row.cost_import_line_id,
    recordedBy: row.recorded_by,
    recordedAt: toIso(row.recorded_at),
    exportLabel: row.export_label,
  };
}

/**
 * Sends one imported line to markup_history as a GRs/GCs figure, and marks
 * the line 'markup' so it never becomes a benchmark.
 *
 * Allowed for an 'unmapped' line whatever the import's status: an unmapped
 * line never became a benchmark, so routing it after approval disagrees with
 * nothing on record. Allowed for a 'staged' line only while its import is
 * still staged. Refused for a line already approved, excluded or routed.
 *
 * pct_of_subtotal is the line's value over the sum of the import's other
 * trade lines: 'approved' lines once the import is approved, 'staged' lines
 * before. Owner-direct lines stay out of that sum, because CONTEXT.md keeps
 * owner-direct scope out of Kulka's General Conditions benchmarks.
 *
 * A split budget records one gr_only and one gc_only line for the same
 * project (LA-1389). ADR 0004 charges General Conditions on trade cost
 * including General Requirements, so General Conditions is measured on that
 * same base: its value over the trade subtotal plus the General Requirements
 * line. General Requirements stays its value over the trade subtotal. Both
 * leave the other line out of the trade subtotal. Whichever line is routed
 * second completes the pair, and the first line's rate is measured again at
 * that point, so the order the lines are routed in does not change either
 * rate. `partner` is that re-measured first line, or null.
 */
export async function routeLineToMarkup(
  db: Db,
  costImportId: string,
  lineId: string,
  setup: MarkupHistorySetup,
  recordedBy: string,
): Promise<{ line: StagedLine; history: MarkupHistoryRecord; partner: MarkupHistoryRecord | null }> {
  return db.withTransaction(async (tx) => {
    const { rows: importRows } = await tx.query<{
      id: string;
      source_project_id: string;
      export_label: string;
      status: "staged" | "approved";
    }>(
      `select id, source_project_id, export_label, status from cost_imports where id = $1`,
      [costImportId],
    );
    const costImport = importRows[0];
    if (!costImport) throw new CostImportNotFound(costImportId);

    const { rows: lineRows } = await tx.query<{ status: LineStatus; value_usd_per_gsf: string }>(
      `select status, value_usd_per_gsf from cost_import_lines
        where id = $1 and cost_import_id = $2`,
      [lineId, costImportId],
    );
    const line = lineRows[0];
    if (!line) throw new CostImportLineNotFound(costImportId, lineId);

    if (line.status === "staged") {
      if (costImport.status !== "staged") throw new CostImportAlreadyApproved(costImportId);
    } else if (line.status !== "unmapped") {
      throw new LineNotRoutable(lineId, `is ${line.status}`);
    }

    const { rows: existing } = await tx.query<{ id: string }>(
      `select id from markup_history where project_id = $1 and setup = $2`,
      [costImport.source_project_id, setup],
    );
    if (existing[0]) throw new MarkupHistoryExists(costImport.source_project_id, setup);

    // The other half of a split budget, when this line is one half of one.
    const partnerSetup = SPLIT_PARTNER[setup];
    const partner = partnerSetup
      ? (
          await tx.query<{ id: string; cost_import_line_id: string; usd_per_gsf: string; cost_import_id: string }>(
            `select h.id, h.cost_import_line_id, h.usd_per_gsf, l.cost_import_id
               from markup_history h
               join cost_import_lines l on l.id = h.cost_import_line_id
              where h.project_id = $1 and h.setup = $2`,
            [costImport.source_project_id, partnerSetup],
          )
        ).rows[0]
      : undefined;
    if (partner && partner.cost_import_id !== costImportId) {
      throw new MarkupSplitAcrossImports(costImport.source_project_id, setup);
    }

    // Trade cost without this line or its partner. The partner is normally
    // routed already, but it is left out by id as well, so neither line
    // counts in the other's base whatever state it was in when it was routed.
    const subtotalStatus = costImport.status === "approved" ? "approved" : "staged";
    const { rows: sumRows } = await tx.query<{ subtotal: string | null }>(
      `select sum(l.value_usd_per_gsf)::text as subtotal
         from cost_import_lines l
         join canonical_work_items c on c.id = l.candidate_canonical_item_id
        where l.cost_import_id = $1 and l.status = $2 and l.id <> $3 and l.id <> $4
          and c.contract_side = 'kulka'`,
      [costImportId, subtotalStatus, lineId, partner?.cost_import_line_id ?? lineId],
    );
    const subtotal = Number(sumRows[0]?.subtotal ?? 0);
    if (!(subtotal > 0)) throw new MarkupSubtotalMissing(costImportId);

    const value = Number(line.value_usd_per_gsf);
    if (!(value > 0)) throw new LineNotRoutable(lineId, "is $0");

    // ADR 0004: General Conditions is charged on trade cost including General
    // Requirements, so a split budget's General Conditions is measured there.
    const partnerValue = partner ? Number(partner.usd_per_gsf) : 0;
    const pctOfSubtotal = setup === "gc_only" ? value / (subtotal + partnerValue) : value / subtotal;
    const partnerPct = partner
      ? partnerSetup === "gc_only"
        ? partnerValue / (subtotal + value)
        : partnerValue / subtotal
      : null;

    // Guarded on the status read above, so a remap or approval that lands in
    // between cannot be overwritten.
    const { rows: updated } = await tx.query<{ id: string }>(
      `update cost_import_lines
          set status = 'markup', mapped_by = $3, mapped_at = now()
        where id = $1 and cost_import_id = $2 and status = $4
        returning id`,
      [lineId, costImportId, recordedBy, line.status],
    );
    if (!updated[0]) throw new CostImportAlreadyApproved(costImportId);

    const { rows: inserted } = await tx.query<HistoryRow>(
      `insert into markup_history
         (project_id, setup, usd_per_gsf, pct_of_subtotal, cost_import_line_id,
          recorded_by, export_label)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, project_id, setup, usd_per_gsf, pct_of_subtotal, cost_import_line_id,
                 recorded_by, recorded_at, export_label`,
      [
        costImport.source_project_id,
        setup,
        value,
        pctOfSubtotal,
        lineId,
        recordedBy,
        costImport.export_label,
      ],
    );

    let partnerRecord: MarkupHistoryRecord | null = null;
    if (partner && partnerPct !== null) {
      const { rows: remeasured } = await tx.query<HistoryRow>(
        `update markup_history set pct_of_subtotal = $2 where id = $1
         returning id, project_id, setup, usd_per_gsf, pct_of_subtotal, cost_import_line_id,
                   recorded_by, recorded_at, export_label`,
        [partner.id, partnerPct],
      );
      partnerRecord = toRecord(remeasured[0]);
    }

    return { line: await readStagedLine(tx, lineId), history: toRecord(inserted[0]), partner: partnerRecord };
  });
}

/** Every GRs/GCs figure on record, for the engine. Ordered so the same rows always hash the same. */
export async function readMarkupHistory(db: Db): Promise<MarkupHistoryRow[]> {
  const { rows } = await db.query<HistoryRow & { project_name: string }>(
    `select h.id, h.project_id, p.name as project_name, h.setup, h.usd_per_gsf,
            h.pct_of_subtotal, h.cost_import_line_id, h.recorded_by, h.recorded_at,
            h.export_label
       from markup_history h
       join projects p on p.id = h.project_id
      order by h.setup, h.project_id, h.id`,
  );
  return rows.map((row) => ({
    projectId: row.project_id,
    projectName: row.project_name,
    setup: row.setup,
    usdPerGsf: Number(row.usd_per_gsf),
    pctOfSubtotal: Number(row.pct_of_subtotal),
    exportLabel: row.export_label,
    recordedBy: row.recorded_by,
    recordedAt: toDateOnly(row.recorded_at),
  }));
}

export async function readStaffingRates(db: Db): Promise<StaffingRate[]> {
  const { rows } = await db.query<{
    id: string;
    role: string;
    days_per_week: number;
    weekly_rate_low: string;
    weekly_rate_high: string;
    source_estimate: string;
  }>(
    `select id, role, days_per_week, weekly_rate_low, weekly_rate_high, source_estimate
       from gc_staffing_rates
      order by role, days_per_week, id`,
  );
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    daysPerWeek: Number(row.days_per_week),
    weeklyRateLow: Number(row.weekly_rate_low),
    weeklyRateHigh: Number(row.weekly_rate_high),
    sourceEstimate: row.source_estimate,
  }));
}

export async function readFieldOfficeRates(db: Db): Promise<FieldOfficeRate[]> {
  const { rows } = await db.query<{
    id: string;
    category: string;
    item: string;
    rate_basis: FieldOfficeRate["rateBasis"];
    rate: string;
    recurring_rate: string | null;
    source_estimate: string;
  }>(
    `select id, category, item, rate_basis, rate, recurring_rate, source_estimate
       from gc_field_office_rates
      order by category, item, id`,
  );
  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    item: row.item,
    rateBasis: row.rate_basis,
    rate: Number(row.rate),
    recurringRate: row.recurring_rate === null ? null : Number(row.recurring_rate),
    sourceEstimate: row.source_estimate,
  }));
}

export type MarkupOptions = {
  staffingRates: StaffingRate[];
  fieldOfficeRates: FieldOfficeRate[];
  /** The General Requirements rate card from one warehouse job (LA-1396). Display only. */
  grRates?: GrRate[];
  feeRate: EngineParameter | null;
  insuranceRate: EngineParameter | null;
  /**
   * How many jobs stand behind each recorded setup, so the page can say when a
   * line will be TBD. "separate" reads gr_only for General Requirements and
   * gc_only for General Conditions.
   */
  historyCounts: Record<MarkupHistorySetup, number>;
};

/** What the /rom page needs to offer the GRs/GCs choices. */
export async function readMarkupOptions(db: Db): Promise<MarkupOptions> {
  const [staffingRates, fieldOfficeRates, grRates, history, parameterRows] = await Promise.all([
    readStaffingRates(db),
    readFieldOfficeRates(db),
    readGrRates(db),
    readMarkupHistory(db),
    db
      .query<{
        name: string;
        value: string;
        provenance_kind: EngineParameter["provenance"]["kind"];
        provenance_recorded_by: string;
        provenance_recorded_at: Date | string;
        reason: string;
      }>(
        `select name, value, provenance_kind, provenance_recorded_by, provenance_recorded_at, reason
           from engine_parameters_current where name in ('fee.rate', 'insurance.rate')`,
      )
      .then((r) => r.rows),
  ]);

  const parameter = (name: string): EngineParameter | null => {
    const row = parameterRows.find((r) => r.name === name);
    if (!row) return null;
    return {
      value: Number(row.value),
      provenance: {
        kind: row.provenance_kind,
        recordedBy: row.provenance_recorded_by,
        recordedAt: toDateOnly(row.provenance_recorded_at),
        reason: row.reason,
      },
    };
  };

  const historyCounts: Record<MarkupHistorySetup, number> = { both: 0, gc_only: 0, gr_only: 0 };
  for (const row of history) historyCounts[row.setup] += 1;

  return {
    staffingRates,
    fieldOfficeRates,
    grRates,
    feeRate: parameter("fee.rate"),
    insuranceRate: parameter("insurance.rate"),
    historyCounts,
  };
}

/**
 * The project's own recorded markup choices (LA-1109), read back to prefill
 * Run settings. Null means nobody has run this project with a saved choice
 * yet, so the panel falls back to the recorded rate-table defaults the same
 * way it always has.
 */
export async function readProjectMarkupChoices(db: Db, projectId: string): Promise<MarkupChoices | null> {
  const { rows } = await db.query<{ markup_choices: MarkupChoices | null }>(
    `select markup_choices from projects where id = $1`,
    [projectId],
  );
  const saved = rows[0]?.markup_choices ?? null;
  if (saved?.method !== "staffing_duration") return saved;
  const [staffingRates, fieldOfficeRates] = await Promise.all([readStaffingRates(db), readFieldOfficeRates(db)]);
  return openSavedChoices(saved, staffingRates, fieldOfficeRates);
}

/**
 * A project's saved markup choice as Run Settings opens it (LA-1397). A choice
 * saved under the retired Staffing and Duration method opens as the
 * equivalent Allocated Resources plan: its weeks become the construction
 * phase and its roles construction-phase lines. The stored row is left as it
 * is until the estimator saves again; every other choice opens unchanged.
 */
export function openSavedChoices(
  saved: MarkupChoices,
  staffingRates: StaffingRate[],
  fieldOfficeRates: FieldOfficeRate[],
): MarkupChoices {
  if (saved.method !== "staffing_duration") return saved;
  const { durationWeeks, staff, fieldOffice, ...rest } = saved;
  // The staffing method never read an override rate.
  delete rest.overrideRate;
  return {
    ...rest,
    method: "allocated_resources",
    resourcePlan: planFromStaffingChoices({ durationWeeks, staff, fieldOffice }, staffingRates, fieldOfficeRates),
  };
}

/** Writes the Run settings markup choice back onto the project (LA-1109). */
export async function saveProjectMarkupChoices(db: Db, projectId: string, choices: MarkupChoices): Promise<void> {
  await db.query(`update projects set markup_choices = $2 where id = $1`, [projectId, JSON.stringify(choices)]);
}

export type ParsedMarkupChoices = { ok: true; choices: MarkupChoices } | { ok: false; error: string };

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Checks the markup choices a ROM request carries. Absent means the default:
 * setup 'both', method 'pct_of_subtotal', no overrides. Only the fields the
 * chosen method reads are kept, so the choices recorded with a run say
 * exactly what priced it.
 */
export function parseMarkupChoices(value: unknown): ParsedMarkupChoices {
  if (value === undefined || value === null) return { ok: true, choices: { ...DEFAULT_MARKUP_CHOICES } };
  if (!isObject(value)) return { ok: false, error: "Send markups as an object." };

  const setup = value.setup ?? DEFAULT_MARKUP_CHOICES.setup;
  const method = value.method ?? DEFAULT_MARKUP_CHOICES.method;
  if (!MARKUP_SETUPS.includes(setup as MarkupSetup)) {
    return { ok: false, error: 'Send markups.setup as "both", "gc_only", "gr_only", or "separate".' };
  }
  if (!MARKUP_METHODS.includes(method as MarkupMethod)) {
    return {
      ok: false,
      error: 'Send markups.method as "pct_of_subtotal", "usd_per_gsf", or "allocated_resources".',
    };
  }
  const choices: MarkupChoices = { setup: setup as MarkupSetup, method: method as MarkupMethod };

  for (const name of ["feeRate", "insuranceRate"] as const) {
    const rate = value[name];
    if (rate === undefined || rate === null) continue;
    if (!isNumber(rate) || rate < 0 || rate >= 1) {
      return { ok: false, error: `Send markups.${name} as a fraction from zero up to one.` };
    }
    choices[name] = rate;
  }

  if (choices.method === "allocated_resources") {
    const plan = parseResourcePlan(value.resourcePlan);
    if (!plan.ok) return plan;
    choices.resourcePlan = plan.plan;
    const grOverride = readGrOverride(value, choices);
    if (!grOverride.ok) return grOverride;
    return { ok: true, choices };
  }

  const override = value.overrideRate;
  if (override !== undefined && override !== null) {
    if (!isNumber(override) || override <= 0) {
      return { ok: false, error: "Send markups.overrideRate as a number above zero." };
    }
    if (choices.method === "pct_of_subtotal" && override >= 1) {
      return { ok: false, error: "Send a percent override as a fraction below one." };
    }
    choices.overrideRate = override;
  }
  const grOverride = readGrOverride(value, choices);
  if (!grOverride.ok) return grOverride;
  return { ok: true, choices };
}

/**
 * The General Requirements rate a "separate" setup can carry (LA-1383). It is
 * kept only for that setup, in dollars per GSF under usd_per_gsf and as a
 * fraction of the subtotal otherwise.
 */
function readGrOverride(value: Record<string, unknown>, choices: MarkupChoices): { ok: true } | { ok: false; error: string } {
  const rate = value.grOverrideRate;
  if (rate === undefined || rate === null || choices.setup !== "separate") return { ok: true };
  if (!isNumber(rate) || rate <= 0) {
    return { ok: false, error: "Send markups.grOverrideRate as a number above zero." };
  }
  if (choices.method !== "usd_per_gsf" && rate >= 1) {
    return { ok: false, error: "Send a General Requirements percent as a fraction below one." };
  }
  choices.grOverrideRate = rate;
  return { ok: true };
}
