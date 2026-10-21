import { CONFIDENCE_SCALE } from "@kulka/engine";

import type { Db } from "@/lib/db";

// A past job's estimator confidence score (LA-2967): a whole number from 1 to
// 10, the person who gave it, and the date. The engine reads only the score
// (lib/rom/run.ts). The person and date are its provenance and show beside it.

export type JobConfidence = { score: number; scoredBy: string; scoredOn: string };

export class JobNotFound extends Error {
  constructor(readonly projectId: string) {
    super("That past job could not be found.");
    this.name = "JobNotFound";
  }
}

export type ParsedJobConfidence = { ok: true; confidence: JobConfidence | null } | { ok: false; error: string };

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `{ score: null }` clears a job's score. Anything else needs all three parts,
 * since a score with no person or date behind it is not provenance.
 */
export function parseJobConfidence(body: unknown): ParsedJobConfidence {
  const { score, scoredBy, scoredOn } = (body ?? {}) as Record<string, unknown>;
  if (score === null) return { ok: true, confidence: null };
  if (typeof score !== "number" || !Number.isInteger(score) || score < 1 || score > CONFIDENCE_SCALE) {
    return { ok: false, error: `Send score as a whole number from 1 to ${CONFIDENCE_SCALE}, or null to clear it.` };
  }
  if (typeof scoredBy !== "string" || scoredBy.trim() === "") {
    return { ok: false, error: "Send scoredBy, the person who gave the score." };
  }
  if (typeof scoredOn !== "string" || !DATE_ONLY.test(scoredOn) || Number.isNaN(Date.parse(scoredOn))) {
    return { ok: false, error: "Send scoredOn as a date, such as 2026-10-15." };
  }
  return { ok: true, confidence: { score, scoredBy: scoredBy.trim(), scoredOn } };
}

type ConfidenceRow = {
  name: string;
  estimator_confidence: number | null;
  estimator_confidence_by: string | null;
  estimator_confidence_on: string | null;
};

/** The job's name and its score, null when nobody has scored it. Throws JobNotFound for a missing job. */
export async function readJob(db: Db, projectId: string): Promise<{ name: string; confidence: JobConfidence | null }> {
  const { rows } = await db.query<ConfidenceRow>(
    `select name, estimator_confidence, estimator_confidence_by,
            to_char(estimator_confidence_on, 'YYYY-MM-DD') as estimator_confidence_on
       from projects where id = $1`,
    [projectId],
  );
  const row = rows[0];
  if (!row) throw new JobNotFound(projectId);
  const confidence =
    row.estimator_confidence === null
      ? null
      : {
          score: Number(row.estimator_confidence),
          scoredBy: row.estimator_confidence_by!,
          scoredOn: row.estimator_confidence_on!,
        };
  return { name: row.name, confidence };
}

export async function readJobConfidence(db: Db, projectId: string): Promise<JobConfidence | null> {
  return (await readJob(db, projectId)).confidence;
}

/** Sets or clears the job's score. The next run reads it; saved runs keep the weights they used. */
export async function saveJobConfidence(db: Db, projectId: string, confidence: JobConfidence | null): Promise<void> {
  const { rows } = await db.query<{ id: string }>(
    `update projects
        set estimator_confidence = $2, estimator_confidence_by = $3, estimator_confidence_on = $4
      where id = $1
      returning id`,
    [projectId, confidence?.score ?? null, confidence?.scoredBy ?? null, confidence?.scoredOn ?? null],
  );
  if (!rows[0]) throw new JobNotFound(projectId);
}
