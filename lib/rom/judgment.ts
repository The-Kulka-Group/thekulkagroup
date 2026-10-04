import type { ConstructionKind, JudgmentRule, ProjectType } from "@kulka/engine";

import type { Db } from "@/lib/db";

import { toDateOnly, toIso } from "./date";

// Judgment rules as data (LA-19). An estimator states a rule, such as what a
// basement level is worth on earthwork on this kind of job. It is entered with
// the stating person's name and a date, sits staged and affecting nothing, and
// only adjusts a ROM line once someone approves it. Same shape as the cost
// import gate next door in lib/rom/ingest.ts: validation is pure, every
// database side effect lives here, and the engine stays pure.
//
// Who may approve is Devin and Rob's open decision (GLOSSARY.md ties it to the
// admin permission, which is not built). Until it lands, approval works like
// any other gate approval: any signed-in, allowlisted user, recorded by email
// and time.

export class JudgmentRuleNotFound extends Error {
  constructor(readonly judgmentRuleId: string) {
    super(`No judgment rule ${judgmentRuleId}.`);
    this.name = "JudgmentRuleNotFound";
  }
}

export class JudgmentRuleNotStaged extends Error {
  constructor(readonly judgmentRuleId: string) {
    super(`Judgment rule ${judgmentRuleId} is not staged, so it cannot be approved.`);
    this.name = "JudgmentRuleNotStaged";
  }
}

export class InvalidJudgmentRule extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidJudgmentRule";
  }
}

export type JudgmentRuleStatus = "staged" | "approved" | "retired";

export type JudgmentRuleEntry = {
  costCode: string;
  label: string;
  projectType: ProjectType;
  constructionKind: ConstructionKind;
  condition: { fact: string; equals: string } | null;
  adjustmentUsdPerGsf: number;
  statedBy: string;
  statedOn: string;
  reason: string;
};

export type JudgmentRuleRecord = JudgmentRuleEntry & {
  id: string;
  status: JudgmentRuleStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
};

const PROJECT_TYPES: readonly ProjectType[] = ["multifamily", "self_storage"];
const CONSTRUCTION_KINDS: readonly ConstructionKind[] = ["new", "renovation"];
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Checks an entry before it reaches the database, so a caller gets a sentence
 * rather than a constraint violation. The rules match the migration's own
 * checks (20260921130000_judgment_rules.sql).
 *
 * The cost code is not checked against `canonical_work_items`, for the reason
 * 20260920140000_rom_spec_decisions_catchup.sql gives about
 * `benchmarks.cost_code`: the two vocabularies are kept joinable, not
 * foreign-keyed.
 */
export function validateJudgmentRuleEntry(entry: JudgmentRuleEntry): void {
  const blank = (value: string) => typeof value !== "string" || value.trim().length === 0;

  if (blank(entry.costCode)) throw new InvalidJudgmentRule("A judgment rule needs a cost code.");
  if (blank(entry.label)) throw new InvalidJudgmentRule("A judgment rule needs a label.");
  if (!PROJECT_TYPES.includes(entry.projectType)) {
    throw new InvalidJudgmentRule(`Project type must be one of: ${PROJECT_TYPES.join(", ")}.`);
  }
  if (!CONSTRUCTION_KINDS.includes(entry.constructionKind)) {
    throw new InvalidJudgmentRule(
      `Construction kind must be one of: ${CONSTRUCTION_KINDS.join(", ")}.`,
    );
  }
  if (entry.condition && (blank(entry.condition.fact) || blank(entry.condition.equals))) {
    throw new InvalidJudgmentRule("A condition needs both a fact and the value it has to hold.");
  }
  if (!Number.isFinite(entry.adjustmentUsdPerGsf) || entry.adjustmentUsdPerGsf === 0) {
    throw new InvalidJudgmentRule(
      "A judgment rule needs an adjustment in dollars per gross square foot, and it cannot be zero.",
    );
  }
  if (blank(entry.statedBy)) {
    throw new InvalidJudgmentRule("A judgment rule needs the name of the person who stated it.");
  }
  if (!DATE_ONLY.test(entry.statedOn) || Number.isNaN(Date.parse(entry.statedOn))) {
    throw new InvalidJudgmentRule("A judgment rule needs the date it was stated, as YYYY-MM-DD.");
  }
  // ADR 0005: a number set by judgment carries its stated reason, or it is refused.
  if (blank(entry.reason)) {
    throw new InvalidJudgmentRule("A judgment rule needs a stated reason.");
  }
}

type RuleRow = {
  id: string;
  cost_code: string;
  label: string;
  project_type: ProjectType;
  construction_kind: ConstructionKind;
  condition_fact: string | null;
  condition_value: string | null;
  adjustment_usd_per_gsf: string;
  stated_by: string;
  stated_on: Date | string;
  reason: string;
  status: JudgmentRuleStatus;
  approved_by: string | null;
  approved_at: Date | string | null;
  created_at: Date | string;
};

const COLUMNS = `id, cost_code, label, project_type, construction_kind, condition_fact,
                 condition_value, adjustment_usd_per_gsf, stated_by, stated_on, reason,
                 status, approved_by, approved_at, created_at`;

function toRecord(row: RuleRow): JudgmentRuleRecord {
  return {
    id: row.id,
    costCode: row.cost_code,
    label: row.label,
    projectType: row.project_type,
    constructionKind: row.construction_kind,
    condition:
      row.condition_fact && row.condition_value
        ? { fact: row.condition_fact, equals: row.condition_value }
        : null,
    adjustmentUsdPerGsf: Number(row.adjustment_usd_per_gsf),
    statedBy: row.stated_by,
    statedOn: toDateOnly(row.stated_on),
    reason: row.reason,
    status: row.status,
    approvedBy: row.approved_by,
    approvedAt: row.approved_at ? toIso(row.approved_at) : null,
    createdAt: toIso(row.created_at),
  };
}

/** Enters a rule (LA-19 AC1). It is staged, visible, and affects no ROM until it is approved. */
export async function stageJudgmentRule(
  db: Db,
  entry: JudgmentRuleEntry,
): Promise<JudgmentRuleRecord> {
  validateJudgmentRuleEntry(entry);

  const { rows } = await db.query<RuleRow>(
    `insert into judgment_rules
       (cost_code, label, project_type, construction_kind, condition_fact, condition_value,
        adjustment_usd_per_gsf, stated_by, stated_on, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     returning ${COLUMNS}`,
    [
      entry.costCode.trim(),
      entry.label.trim(),
      entry.projectType,
      entry.constructionKind,
      entry.condition ? entry.condition.fact.trim() : null,
      entry.condition ? entry.condition.equals.trim() : null,
      entry.adjustmentUsdPerGsf,
      entry.statedBy.trim(),
      entry.statedOn,
      entry.reason.trim(),
    ],
  );
  return toRecord(rows[0]);
}

export async function getJudgmentRule(db: Db, id: string): Promise<JudgmentRuleRecord> {
  const { rows } = await db.query<RuleRow>(
    `select ${COLUMNS} from judgment_rules where id = $1`,
    [id],
  );
  if (!rows[0]) throw new JudgmentRuleNotFound(id);
  return toRecord(rows[0]);
}

/** The review list: every rule, or only those in one status, newest first. */
export async function listJudgmentRules(
  db: Db,
  filter: { status?: JudgmentRuleStatus } = {},
): Promise<JudgmentRuleRecord[]> {
  const { rows } = await db.query<RuleRow>(
    `select ${COLUMNS} from judgment_rules
      where ($1::text is null or status = $1)
      order by created_at desc, id`,
    [filter.status ?? null],
  );
  return rows.map(toRecord);
}

/**
 * Approves a staged rule (LA-19 AC1), after which it adjusts the lines it
 * applies to. The status transition is the guard, the same atomic
 * update-where-staged `approveCostImport` uses, so two callers racing cannot
 * both approve the same rule.
 */
export async function approveJudgmentRule(
  db: Db,
  id: string,
  approvedBy: string,
): Promise<JudgmentRuleRecord> {
  return db.withTransaction(async (tx) => {
    const { rows } = await tx.query<RuleRow>(
      `update judgment_rules
          set status = 'approved', approved_by = $2, approved_at = now()
        where id = $1 and status = 'staged'
        returning ${COLUMNS}`,
      [id, approvedBy],
    );
    if (rows[0]) return toRecord(rows[0]);

    // The UPDATE's WHERE clause cannot say why it matched no row, so ask.
    const { rows: existing } = await tx.query<{ id: string }>(
      `select id from judgment_rules where id = $1`,
      [id],
    );
    if (!existing[0]) throw new JudgmentRuleNotFound(id);
    throw new JudgmentRuleNotStaged(id);
  });
}

/**
 * The approved rules for one project, in the engine's own shape, ready to go
 * into a `DataSnapshot`. Read alongside the benchmarks and the parameters when
 * a run builds its snapshot.
 */
export async function readApprovedJudgmentRules(
  db: Db,
  project: { projectType: ProjectType; constructionKind: ConstructionKind },
): Promise<JudgmentRule[]> {
  const { rows } = await db.query<RuleRow>(
    `select ${COLUMNS} from judgment_rules
      where status = 'approved' and project_type = $1 and construction_kind = $2
      order by stated_on, id`,
    [project.projectType, project.constructionKind],
  );

  return rows.map((row) => {
    const record = toRecord(row);
    return {
      id: record.id,
      costCode: record.costCode,
      projectType: record.projectType,
      constructionKind: record.constructionKind,
      condition: record.condition,
      adjustmentUsdPerGsf: record.adjustmentUsdPerGsf,
      provenance: {
        kind: "reviewed_judgment",
        sourceProjectIds: [],
        exportLabel: null,
        recordedBy: record.statedBy,
        recordedAt: record.statedOn,
      },
    };
  });
}
