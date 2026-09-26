import type { FramingSystem } from "@kulka/engine";

import type { Db } from "@/lib/db";

// The framing system choice in Run settings (LA-1103). Prefilled from the
// project record and sent with the run request, the same way the Scope
// module's answers are (lib/rom/gates.ts).

const FRAMING_VALUES: ReadonlySet<string> = new Set(["wood", "metal"]);

export type ParsedFraming =
  | { ok: true; framing: FramingSystem | null | undefined }
  | { ok: false; error: string };

/**
 * Undefined means "read the project's own column". Null means the estimator
 * left it not set for this run.
 */
export function parseFramingSystem(value: unknown): ParsedFraming {
  if (value === undefined) return { ok: true, framing: undefined };
  if (value === null) return { ok: true, framing: null };
  if (typeof value === "string" && FRAMING_VALUES.has(value)) {
    return { ok: true, framing: value as FramingSystem };
  }
  return { ok: false, error: 'Send framingSystem as "wood", "metal", or null.' };
}

export async function readProjectFramingSystem(db: Db, projectId: string): Promise<FramingSystem | null> {
  const { rows } = await db.query<{ framing_system: FramingSystem | null }>(
    `select framing_system from projects where id = $1`,
    [projectId],
  );
  return rows[0]?.framing_system ?? null;
}

/** Writes the Run settings framing choice back onto the project (LA-1109). Null clears it. */
export async function saveProjectFramingSystem(
  db: Db,
  projectId: string,
  framing: FramingSystem | null,
): Promise<void> {
  await db.query(`update projects set framing_system = $2 where id = $1`, [projectId, framing]);
}
