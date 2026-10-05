import {
  applyCorrection,
  type DerivedAssumption,
  type DerivedCorrection,
  type DerivedInput,
  type DerivedStep,
  type DerivedValue,
  InvalidDerivedAssumption,
  validateDerivedAssumption,
} from "@kulka/engine";

import type { Db } from "@/lib/db";

import { currentWording } from "./criterion-wording";
import { toIso } from "./date";

// LA-860. Storage for derived assumptions and their corrections
// (20260927170000_derived_assumptions.sql). Validation is the engine's
// (packages/engine/src/derived-assumptions.ts); every database side effect
// lives here. A correction is recorded like a judgment rule's approval: the
// signed-in user's email and the time, with a required reason.

/** A derived assumption as the ROM screen reads it: the record plus the ids it is stored under. */
export type StoredDerivedAssumption = DerivedAssumption & {
  id: string;
  /** The live correction's row id, for Undo after a revert. Null when not corrected. */
  correctionId: string | null;
};

export class DerivedAssumptionNotFound extends Error {
  constructor(readonly derivedAssumptionId: string) {
    super(`No derived assumption ${derivedAssumptionId}.`);
    this.name = "DerivedAssumptionNotFound";
  }
}

export { InvalidDerivedAssumption };

type Row = {
  id: string;
  code: string;
  label: string;
  value: DerivedValue;
  method: string;
  inputs: DerivedInput[];
  steps: DerivedStep[];
  confidence: "high" | "low";
  confidence_reason: string;
  cost_codes: string[];
  correction_id: string | null;
  correction_value: DerivedValue | null;
  correction_reason: string | null;
  corrected_by: string | null;
  corrected_at: Date | string | null;
};

const SELECT = `
  select a.id, a.code, a.label, a.value, a.method, a.inputs, a.steps, a.confidence,
         a.confidence_reason, a.cost_codes,
         c.id as correction_id, c.value as correction_value, c.reason as correction_reason,
         c.corrected_by, c.corrected_at
    from derived_assumptions a
    left join derived_assumption_corrections c
      on c.derived_assumption_id = a.id and c.reverted_at is null`;

/**
 * LA-1333. A criterion saved before LA-1333 carries wording from inside the
 * software: a repository path after its method, and the internal model's
 * name. The stored row stays as it was written; only what is read for the
 * screen drops them, so an old budget reads like a new one.
 */
export function publicWording(text: string): string {
  return text
    .replace(/ \(docs\/[^)]*\.md\)/g, "")
    .replace(/\bJev picked\b/g, "picked")
    .replace(
      / No Jev client is configured, so V-1 proposes Hydraulic without calling Jev\./g,
      " Nothing is set up to choose between the two, so V-1 proposes Hydraulic, the cheaper type.",
    )
    .replace(/Either -- no Jev client configured, proposing Hydraulic/g, "Either; nothing set up to choose, so Hydraulic");
}

function fromRow(row: Row): StoredDerivedAssumption {
  const correction: DerivedCorrection | null =
    row.correction_id && row.correction_value && row.correction_reason && row.corrected_by && row.corrected_at
      ? {
          value: row.correction_value,
          reason: row.correction_reason,
          correctedBy: row.corrected_by,
          correctedAt: toIso(row.corrected_at),
        }
      : null;
  return currentWording({
    kind: "derived_assumption",
    id: row.id,
    code: row.code,
    label: row.label,
    value: row.value,
    method: publicWording(row.method),
    inputs: row.inputs,
    steps: row.steps.map((step) => ({ ...step, result: publicWording(step.result) })),
    confidence: row.confidence,
    confidenceReason: publicWording(row.confidence_reason),
    costCodes: row.cost_codes,
    correction,
    correctionId: correction ? row.correction_id : null,
  });
}

/** Every derived assumption on a project, in code order. An empty list means the ROM screen shows no section. */
export async function listDerivedAssumptions(db: Db, projectId: string): Promise<StoredDerivedAssumption[]> {
  const { rows } = await db.query<Row>(`${SELECT} where a.project_id = $1 order by a.code`, [projectId]);
  return rows.map(fromRow);
}

export async function getDerivedAssumption(db: Db, id: string): Promise<StoredDerivedAssumption> {
  const { rows } = await db.query<Row>(`${SELECT} where a.id = $1`, [id]);
  if (!rows[0]) throw new DerivedAssumptionNotFound(id);
  return fromRow(rows[0]);
}

/**
 * Stores what Jev derived, or replaces it in place when the criterion was
 * derived before. The row keeps its id, so a live correction stays attached
 * and keeps winning after a fact change (the engine's `rederive`).
 */
export async function saveDerivedAssumption(
  db: Db,
  projectId: string,
  assumption: DerivedAssumption,
  derivedBy: { model: string; confidence?: number | null },
): Promise<StoredDerivedAssumption> {
  validateDerivedAssumption({ ...assumption, correction: null });
  const { rows } = await db.query<{ id: string }>(
    `insert into derived_assumptions
       (project_id, code, label, value, method, inputs, steps, confidence, confidence_reason,
        cost_codes, derived_by, jev_confidence)
     values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
     on conflict (project_id, code) do update set
       label = excluded.label, value = excluded.value, method = excluded.method,
       inputs = excluded.inputs, steps = excluded.steps, confidence = excluded.confidence,
       confidence_reason = excluded.confidence_reason, cost_codes = excluded.cost_codes,
       derived_by = excluded.derived_by, jev_confidence = excluded.jev_confidence,
       derived_at = now()
     returning id`,
    [
      projectId,
      assumption.code,
      assumption.label,
      JSON.stringify(assumption.value),
      assumption.method,
      JSON.stringify(assumption.inputs),
      JSON.stringify(assumption.steps),
      assumption.confidence,
      assumption.confidenceReason,
      assumption.costCodes,
      derivedBy.model,
      derivedBy.confidence ?? null,
    ],
  );
  return getDerivedAssumption(db, rows[0].id);
}

/**
 * Records the estimator's correction. Value and reason are both required and
 * the value must be the same kind (and unit) as Jev's. Any live correction is
 * marked reverted first, so one stays live.
 */
export async function correctDerivedAssumption(
  db: Db,
  id: string,
  entry: { value: DerivedValue; reason: string },
  correctedBy: string,
): Promise<StoredDerivedAssumption> {
  return db.withTransaction(async (tx) => {
    const current = await getDerivedAssumption(tx, id);
    // Throws a plain sentence on a bad value or a blank reason.
    applyCorrection(current, {
      value: entry.value,
      reason: entry.reason,
      correctedBy,
      correctedAt: new Date().toISOString(),
    });
    await tx.query(
      `update derived_assumption_corrections set reverted_by = $2, reverted_at = now()
        where derived_assumption_id = $1 and reverted_at is null`,
      [id, correctedBy],
    );
    await tx.query(
      `insert into derived_assumption_corrections (derived_assumption_id, value, reason, corrected_by)
       values ($1, $2::jsonb, $3, $4)`,
      [id, JSON.stringify(entry.value), entry.reason.trim(), correctedBy],
    );
    return getDerivedAssumption(tx, id);
  });
}

/** Goes back to Jev's value. The correction row stays, marked reverted by whom and when. */
export async function revertDerivedAssumption(
  db: Db,
  id: string,
  revertedBy: string,
): Promise<StoredDerivedAssumption> {
  await getDerivedAssumption(db, id);
  await db.query(
    `update derived_assumption_corrections set reverted_by = $2, reverted_at = now()
      where derived_assumption_id = $1 and reverted_at is null`,
    [id, revertedBy],
  );
  return getDerivedAssumption(db, id);
}

/** Undo after a revert: the named correction is live again, and whatever was live is reverted. */
export async function restoreCorrection(
  db: Db,
  id: string,
  correctionId: string,
  restoredBy: string,
): Promise<StoredDerivedAssumption> {
  return db.withTransaction(async (tx) => {
    await getDerivedAssumption(tx, id);
    const { rows } = await tx.query<{ id: string }>(
      `select id from derived_assumption_corrections where id = $1 and derived_assumption_id = $2`,
      [correctionId, id],
    );
    if (!rows[0]) throw new InvalidDerivedAssumption("That correction does not belong to this criterion.");
    await tx.query(
      `update derived_assumption_corrections set reverted_by = $2, reverted_at = now()
        where derived_assumption_id = $1 and reverted_at is null`,
      [id, restoredBy],
    );
    await tx.query(
      `update derived_assumption_corrections set reverted_by = null, reverted_at = null where id = $1`,
      [correctionId],
    );
    return getDerivedAssumption(tx, id);
  });
}

/**
 * LA-1265: removes a criterion that no longer applies, such as V-2 once the
 * job is not hydraulic. Its corrections go with it (on delete cascade).
 */
export async function deleteDerivedAssumption(db: Db, projectId: string, code: string): Promise<void> {
  await db.query(`delete from derived_assumptions where project_id = $1 and code = $2`, [projectId, code]);
}
