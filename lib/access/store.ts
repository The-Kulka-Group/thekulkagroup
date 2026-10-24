import type { Db } from "@/lib/db";
import { DEPARTMENTS, TOOLS } from "@/lib/tools/catalog";

import { OWNER_ROLE, type AccessException, type AccessSetting, type Level, type PersonAccess, type TargetKind } from "./level";

// LA-3045. Reads and writes for people's access. Every write to role_access or
// access_exceptions adds its access_changes row in the same transaction, so
// the change log can never miss a change or record one that rolled back.

export class AccessWriteError extends Error {}

function assertTarget(kind: TargetKind, key: string) {
  const known = kind === "tool" ? TOOLS.some((t) => t.key === key) : DEPARTMENTS.some((d) => d.key === key);
  if (!known) throw new AccessWriteError(`There is no ${kind} called ${key}.`);
}

type SettingRow = { target_kind: TargetKind; target_key: string; level: Level };

/** The role, role settings and exceptions behind a person's access. Null for no such person or an inactive one. */
export async function readPersonAccess(db: Db, personId: string): Promise<PersonAccess | null> {
  const { rows: people } = await db.query<{ role_key: string }>(
    `select role_key from people where id = $1 and active`,
    [personId],
  );
  if (!people[0]) return null;
  const roleKey = people[0].role_key;
  const [{ rows: settings }, { rows: exceptions }] = await Promise.all([
    db.query<SettingRow>(`select target_kind, target_key, level from role_access where role_key = $1`, [roleKey]),
    db.query<SettingRow & { ends_on: string | null }>(
      `select target_kind, target_key, level, to_char(ends_on, 'YYYY-MM-DD') as ends_on
         from access_exceptions where person_id = $1`,
      [personId],
    ),
  ]);
  const roleAccess: AccessSetting[] = settings.map((r) => ({ targetKind: r.target_kind, targetKey: r.target_key, level: r.level }));
  const personExceptions: AccessException[] = exceptions.map((r) => ({
    targetKind: r.target_kind,
    targetKey: r.target_key,
    level: r.level,
    endsOn: r.ends_on,
  }));
  return { roleKey, roleAccess, exceptions: personExceptions };
}

async function logChange(
  tx: Db,
  change: {
    changedBy: string;
    subjectKind: "role" | "person";
    subjectKey: string;
    targetKind: TargetKind;
    targetKey: string;
    from: Level | null;
    to: Level | null;
    reason?: string | null;
  },
) {
  await tx.query(
    `insert into access_changes (changed_by, subject_kind, subject_key, target_kind, target_key, from_level, to_level, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [change.changedBy, change.subjectKind, change.subjectKey, change.targetKind, change.targetKey, change.from, change.to, change.reason ?? null],
  );
}

/**
 * Sets a role's level for a department or tool, or clears it with `level:
 * null`. The Owner role cannot be changed. Setting the level it already has
 * writes nothing.
 */
export async function setRoleAccess(
  db: Db,
  input: { roleKey: string; targetKind: TargetKind; targetKey: string; level: Level | null; changedBy: string },
): Promise<void> {
  if (input.roleKey === OWNER_ROLE) throw new AccessWriteError("The Owner role opens every tool and cannot be changed.");
  assertTarget(input.targetKind, input.targetKey);
  await db.withTransaction(async (tx) => {
    const { rows: roles } = await tx.query(`select 1 from roles where key = $1 for update`, [input.roleKey]);
    if (!roles[0]) throw new AccessWriteError(`There is no role called ${input.roleKey}.`);
    const { rows } = await tx.query<{ level: Level }>(
      `select level from role_access where role_key = $1 and target_kind = $2 and target_key = $3`,
      [input.roleKey, input.targetKind, input.targetKey],
    );
    const from = rows[0]?.level ?? null;
    if (from === input.level) return;
    if (input.level === null) {
      await tx.query(`delete from role_access where role_key = $1 and target_kind = $2 and target_key = $3`, [
        input.roleKey,
        input.targetKind,
        input.targetKey,
      ]);
    } else {
      await tx.query(
        `insert into role_access (role_key, target_kind, target_key, level) values ($1, $2, $3, $4)
         on conflict (role_key, target_kind, target_key) do update set level = excluded.level, updated_at = now()`,
        [input.roleKey, input.targetKind, input.targetKey, input.level],
      );
    }
    await logChange(tx, {
      changedBy: input.changedBy,
      subjectKind: "role",
      subjectKey: input.roleKey,
      targetKind: input.targetKind,
      targetKey: input.targetKey,
      from,
      to: input.level,
    });
  });
}

async function lockPerson(tx: Db, personId: string): Promise<void> {
  const { rows } = await tx.query<{ role_key: string }>(`select role_key from people where id = $1 for update`, [personId]);
  if (!rows[0]) throw new AccessWriteError("There is no such person.");
  if (rows[0].role_key === OWNER_ROLE) throw new AccessWriteError("An Owner opens every tool and takes no exceptions.");
}

/** Gives a person their own level for a department or tool, replacing any exception they had there. */
export async function setException(
  db: Db,
  input: {
    personId: string;
    targetKind: TargetKind;
    targetKey: string;
    level: Level;
    reason: string;
    endsOn: string | null;
    setBy: string;
  },
): Promise<void> {
  assertTarget(input.targetKind, input.targetKey);
  const reason = input.reason.trim();
  if (!reason) throw new AccessWriteError("An exception needs a reason.");
  await db.withTransaction(async (tx) => {
    await lockPerson(tx, input.personId);
    const { rows } = await tx.query<{ level: Level }>(
      `select level from access_exceptions where person_id = $1 and target_kind = $2 and target_key = $3`,
      [input.personId, input.targetKind, input.targetKey],
    );
    await tx.query(
      `insert into access_exceptions (person_id, target_kind, target_key, level, reason, ends_on, set_by)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (person_id, target_kind, target_key)
       do update set level = excluded.level, reason = excluded.reason, ends_on = excluded.ends_on,
                     set_by = excluded.set_by, created_at = now()`,
      [input.personId, input.targetKind, input.targetKey, input.level, reason, input.endsOn, input.setBy],
    );
    const from = rows[0]?.level ?? null;
    // A new reason or end date on the same level is not an access change.
    if (from === input.level) return;
    await logChange(tx, {
      changedBy: input.setBy,
      subjectKind: "person",
      subjectKey: input.personId,
      targetKind: input.targetKind,
      targetKey: input.targetKey,
      from,
      to: input.level,
      reason,
    });
  });
}

/** Takes a person's exception away, so their role decides again. Removing one that is not there writes nothing. */
export async function removeException(
  db: Db,
  input: { personId: string; targetKind: TargetKind; targetKey: string; changedBy: string },
): Promise<void> {
  await db.withTransaction(async (tx) => {
    await lockPerson(tx, input.personId);
    const { rows } = await tx.query<{ level: Level }>(
      `delete from access_exceptions where person_id = $1 and target_kind = $2 and target_key = $3 returning level`,
      [input.personId, input.targetKind, input.targetKey],
    );
    if (!rows[0]) return;
    await logChange(tx, {
      changedBy: input.changedBy,
      subjectKind: "person",
      subjectKey: input.personId,
      targetKind: input.targetKind,
      targetKey: input.targetKey,
      from: rows[0].level,
      to: null,
    });
  });
}
