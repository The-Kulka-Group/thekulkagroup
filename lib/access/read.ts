import type { Db } from "@/lib/db";
import { DEPARTMENTS, TOOLS } from "@/lib/tools/catalog";

import type { AccessSetting, Level, TargetKind } from "./level";
import { AccessWriteError } from "./store";

// LA-3046. What the People and Access pages read, and Add Person.

export interface Role {
  key: string;
  name: string;
  builtIn: boolean;
}

export interface PersonRow {
  id: string;
  name: string;
  email: string;
  title: string | null;
  roleKey: string;
  roleName: string;
  exceptionCount: number;
}

export interface ExceptionRow {
  targetKind: TargetKind;
  targetKey: string;
  level: Level;
  reason: string;
  endsOn: string | null;
  setBy: string;
}

export interface ChangeRow {
  id: string;
  changedBy: string;
  subjectKind: "role" | "person";
  subjectKey: string;
  subjectName: string;
  targetKind: TargetKind;
  targetKey: string;
  targetName: string;
  from: Level | null;
  to: Level | null;
  reason: string | null;
  changedAt: string;
}

// Built-in roles in the order Matt listed them; any later role after them by name.
const ROLE_ORDER = ["owner", "admin", "project_manager", "estimator", "finance"];

export function targetName(kind: TargetKind, key: string): string {
  const found = kind === "tool" ? TOOLS.find((t) => t.key === key) : DEPARTMENTS.find((d) => d.key === key);
  return found?.label ?? key;
}

export async function listRoles(db: Db): Promise<Role[]> {
  const { rows } = await db.query<{ key: string; name: string; built_in: boolean }>(`select key, name, built_in from roles`);
  const rank = (key: string) => (ROLE_ORDER.includes(key) ? ROLE_ORDER.indexOf(key) : ROLE_ORDER.length);
  return rows
    .map((r) => ({ key: r.key, name: r.name, builtIn: r.built_in }))
    .sort((a, b) => rank(a.key) - rank(b.key) || a.name.localeCompare(b.name));
}

/** Every role's settings, by role key. */
export async function listRoleAccess(db: Db): Promise<Record<string, AccessSetting[]>> {
  const { rows } = await db.query<{ role_key: string; target_kind: TargetKind; target_key: string; level: Level }>(
    `select role_key, target_kind, target_key, level from role_access`,
  );
  const byRole: Record<string, AccessSetting[]> = {};
  for (const r of rows) (byRole[r.role_key] ??= []).push({ targetKind: r.target_kind, targetKey: r.target_key, level: r.level });
  return byRole;
}

export async function listPeople(db: Db): Promise<PersonRow[]> {
  const { rows } = await db.query<{
    id: string; name: string; email: string; title: string | null; role_key: string; role_name: string; exceptions: number;
  }>(
    `select p.id, p.name, p.email, p.title, p.role_key, r.name as role_name,
            (select count(*)::int from access_exceptions e where e.person_id = p.id) as exceptions
       from people p join roles r on r.key = p.role_key
      where p.active
      order by p.name`,
  );
  return rows.map((r) => ({
    id: r.id, name: r.name, email: r.email, title: r.title, roleKey: r.role_key, roleName: r.role_name, exceptionCount: r.exceptions,
  }));
}

export async function readPerson(db: Db, id: string): Promise<{ person: PersonRow; exceptions: ExceptionRow[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const people = (await listPeople(db)).filter((p) => p.id === id);
  if (!people[0]) return null;
  const { rows } = await db.query<{ target_kind: TargetKind; target_key: string; level: Level; reason: string; ends_on: string | null; set_by: string }>(
    `select target_kind, target_key, level, reason, to_char(ends_on, 'YYYY-MM-DD') as ends_on, set_by
       from access_exceptions where person_id = $1 order by created_at`,
    [id],
  );
  return {
    person: people[0],
    exceptions: rows.map((r) => ({ targetKind: r.target_kind, targetKey: r.target_key, level: r.level, reason: r.reason, endsOn: r.ends_on, setBy: r.set_by })),
  };
}

export async function listChanges(db: Db, limit = 100): Promise<ChangeRow[]> {
  const { rows } = await db.query<{
    id: string; changed_by: string; subject_kind: "role" | "person"; subject_key: string; subject_name: string | null;
    target_kind: TargetKind; target_key: string; from_level: Level | null; to_level: Level | null; reason: string | null; changed_at: Date | string;
  }>(
    `select c.id, c.changed_by, c.subject_kind, c.subject_key,
            coalesce(r.name, p.name) as subject_name,
            c.target_kind, c.target_key, c.from_level, c.to_level, c.reason, c.changed_at
       from access_changes c
       left join roles r on c.subject_kind = 'role' and r.key = c.subject_key
       left join people p on c.subject_kind = 'person' and p.id::text = c.subject_key
      order by c.changed_at desc, c.id desc
      limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: r.id,
    changedBy: r.changed_by,
    subjectKind: r.subject_kind,
    subjectKey: r.subject_key,
    subjectName: r.subject_name ?? "Someone Removed",
    targetKind: r.target_kind,
    targetKey: r.target_key,
    targetName: targetName(r.target_kind, r.target_key),
    from: r.from_level,
    to: r.to_level,
    reason: r.reason,
    changedAt: new Date(r.changed_at).toISOString(),
  }));
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Adds a person. No invite goes out: sign-in is off, so they get their access the day it turns on. */
export async function addPerson(
  db: Db,
  input: { name: string; email: string; title: string; roleKey: string },
): Promise<string> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const title = input.title.trim();
  if (!name) throw new AccessWriteError("Add their name.");
  if (!EMAIL.test(email)) throw new AccessWriteError("Add an email address that looks like name@company.com.");
  const { rows: roles } = await db.query(`select 1 from roles where key = $1`, [input.roleKey]);
  if (!roles[0]) throw new AccessWriteError("Pick a role.");
  const { rows: taken } = await db.query(`select 1 from people where email = $1`, [email]);
  if (taken[0]) throw new AccessWriteError("Someone already has that email.");
  const { rows } = await db.query<{ id: string }>(
    `insert into people (name, email, title, role_key) values ($1, $2, $3, $4) returning id`,
    [name, email, title || null, input.roleKey],
  );
  return rows[0].id;
}
