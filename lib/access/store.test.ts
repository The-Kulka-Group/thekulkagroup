import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { levelFor } from "./level";
import { AccessWriteError, readPersonAccess, removeException, setException, setRoleAccess } from "./store";

// LA-3045: the migration applies on PGlite, and every access write lands with
// its change log row or not at all. Every person here is synthetic.

const ESTIMATOR = "00000000-0000-4000-8000-0000000003e1";
const OWNER = "00000000-0000-4000-8000-0000000003e2";
const TODAY = "2026-10-24";

describe("access store", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;

  beforeAll(async () => {
    db = await seededDatabase();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.query(`truncate access_changes, access_exceptions, role_access, people cascade`);
    await db.query(
      `insert into people (id, name, email, title, role_key) values
         ($1, 'Test Estimator', 'estimator@example.test', 'Senior Estimator', 'estimator'),
         ($2, 'Test Owner', 'owner@example.test', null, 'owner')`,
      [ESTIMATOR, OWNER],
    );
  });

  const changes = async () =>
    (
      await db.query<{ subject_kind: string; target_key: string; from_level: string | null; to_level: string | null }>(
        `select subject_kind, target_key, from_level, to_level from access_changes order by changed_at, id`,
      )
    ).rows;

  it("seeds the five built-in roles", async () => {
    const { rows } = await db.query<{ key: string }>(`select key from roles where built_in order by key`);
    expect(rows.map((r) => r.key)).toEqual(["admin", "estimator", "finance", "owner", "project_manager"]);
  });

  it("resolves a stored person's level through their role and exceptions", async () => {
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "department", targetKey: "pre-construction", level: "edit", changedBy: "test" });
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "projects", level: "view", changedBy: "test" });
    await setException(db, {
      personId: ESTIMATOR, targetKind: "tool", targetKey: "projects", level: "edit",
      reason: "Covers a project while its manager is out.", endsOn: "2026-12-31", setBy: "test",
    });

    const access = await readPersonAccess(db, ESTIMATOR);
    expect(access).not.toBeNull();
    expect(levelFor(access!, "rom", TODAY)).toBe("edit");
    expect(levelFor(access!, "projects", TODAY)).toBe("edit");
    expect(levelFor(access!, "projects", "2027-01-01")).toBe("view");
    expect(levelFor(access!, "clients", TODAY)).toBe("hidden");
  });

  it("logs each role change once, and nothing for a level it already has", async () => {
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: "view", changedBy: "test" });
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: "view", changedBy: "test" });
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: "edit", changedBy: "test" });
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: null, changedBy: "test" });

    expect(await changes()).toEqual([
      { subject_kind: "role", target_key: "rom", from_level: null, to_level: "view" },
      { subject_kind: "role", target_key: "rom", from_level: "view", to_level: "edit" },
      { subject_kind: "role", target_key: "rom", from_level: "edit", to_level: null },
    ]);
    const { rows } = await db.query(`select 1 from role_access`);
    expect(rows).toHaveLength(0);
  });

  it("logs an exception added and removed", async () => {
    await setException(db, {
      personId: ESTIMATOR, targetKind: "tool", targetKey: "meetings", level: "view",
      reason: "Sits in on project meetings during pricing.", endsOn: null, setBy: "test",
    });
    await removeException(db, { personId: ESTIMATOR, targetKind: "tool", targetKey: "meetings", changedBy: "test" });
    await removeException(db, { personId: ESTIMATOR, targetKind: "tool", targetKey: "meetings", changedBy: "test" });

    expect(await changes()).toEqual([
      { subject_kind: "person", target_key: "meetings", from_level: null, to_level: "view" },
      { subject_kind: "person", target_key: "meetings", from_level: "view", to_level: null },
    ]);
  });

  it("refuses to change the Owner role or give an Owner an exception, and writes nothing", async () => {
    await expect(
      setRoleAccess(db, { roleKey: "owner", targetKind: "tool", targetKey: "rom", level: "hidden", changedBy: "test" }),
    ).rejects.toBeInstanceOf(AccessWriteError);
    await expect(
      setException(db, { personId: OWNER, targetKind: "tool", targetKey: "rom", level: "hidden", reason: "No.", endsOn: null, setBy: "test" }),
    ).rejects.toBeInstanceOf(AccessWriteError);
    expect(await changes()).toEqual([]);

    const owner = await readPersonAccess(db, OWNER);
    expect(levelFor(owner!, "access", TODAY)).toBe("edit");
  });

  it("refuses an unknown tool or department, and an exception with no reason", async () => {
    await expect(
      setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "nope", level: "edit", changedBy: "test" }),
    ).rejects.toBeInstanceOf(AccessWriteError);
    await expect(
      setRoleAccess(db, { roleKey: "estimator", targetKind: "department", targetKey: "rom", level: "edit", changedBy: "test" }),
    ).rejects.toBeInstanceOf(AccessWriteError);
    await expect(
      setException(db, { personId: ESTIMATOR, targetKind: "tool", targetKey: "rom", level: "edit", reason: "  ", endsOn: null, setBy: "test" }),
    ).rejects.toBeInstanceOf(AccessWriteError);
    expect(await changes()).toEqual([]);
  });

  it("rolls the change back with its log row when the log write fails", async () => {
    await db.query(`alter table access_changes add constraint test_block check (changed_by <> 'blocked')`);
    try {
      await expect(
        setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: "edit", changedBy: "blocked" }),
      ).rejects.toThrow();
      const { rows } = await db.query(`select 1 from role_access`);
      expect(rows).toHaveLength(0);
    } finally {
      await db.query(`alter table access_changes drop constraint test_block`);
    }
  });

  it("treats an inactive person as having no access", async () => {
    await db.query(`update people set active = false where id = $1`, [ESTIMATOR]);
    expect(await readPersonAccess(db, ESTIMATOR)).toBeNull();
  });
});
