import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { insertRomProject } from "@/lib/rom/projects";
import { seededDatabase } from "@/test/database";

// LA-1322. Delete, from the All Budgets menu: removes a budget and what
// belongs only to it, and refuses a past job other budgets price from.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { DELETE } = await import("./route");
const { GET } = await import("../route");

function del(id: string, headers: Record<string, string> = {}) {
  return DELETE(new Request(`http://localhost/api/rom/projects/${id}`, { method: "DELETE", headers }), {
    params: Promise.resolve({ id }),
  });
}

async function newBudget(name: string) {
  return insertRomProject(db as Db, {
    name,
    grossSquareFeet: 50000,
    projectType: "multifamily",
    constructionKind: "new",
    framingSystem: null,
  } as Parameters<typeof insertRomProject>[1]);
}

async function count(sql: string, params: unknown[]) {
  const { rows } = await db.query<{ n: number }>(sql, params);
  return rows[0].n;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("DELETE /api/rom/projects/[id]", () => {
  it("refuses a signed-out request and deletes nothing", async () => {
    const id = await newBudget("Signed Out Check");
    const response = await del(id, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    expect(await count(`select count(*)::int as n from projects where id = $1`, [id])).toBe(1);
  });

  it("deletes a budget with its markup history and budget-only rates", async () => {
    const id = await newBudget("Delete Me");
    await db.query(
      `insert into project_rates (project_id, cost_code, label, unit, value, provenance_kind, provenance_note, recorded_by, recorded_at)
       values ($1, '31', 'Electrical', 'usd_per_gsf', 20, 'reviewed_judgment', 'test', 'test', current_date)`,
      [id],
    );
    expect(await count(`select count(*)::int as n from project_rates where project_id = $1`, [id])).toBe(1);
    const response = await del(id);
    expect(response.status).toBe(200);
    expect(await count(`select count(*)::int as n from projects where id = $1`, [id])).toBe(0);
    expect(await count(`select count(*)::int as n from project_rates where project_id = $1`, [id])).toBe(0);
    expect(await count(`select count(*)::int as n from markup_history where project_id = $1`, [id])).toBe(0);
  });

  it("refuses to delete a past job other budgets price from, and keeps it", async () => {
    const { rows } = await db.query<{ id: string }>(
      `select project_id as id from benchmark_source_projects
       union select source_project_id from cost_imports limit 1`,
    );
    expect(rows.length).toBe(1);
    const response = await del(rows[0].id);
    expect(response.status).toBe(409);
    expect(await count(`select count(*)::int as n from projects where id = $1`, [rows[0].id])).toBe(1);
  });

  it("answers 404 for a project that isn't there", async () => {
    const response = await del("00000000-0000-4000-8000-000000000000");
    expect(response.status).toBe(404);
  });
});

describe("GET /api/rom/projects", () => {
  it("lists active and archived budgets, flagging past jobs", async () => {
    const active = await newBudget("Active Budget");
    const archived = await newBudget("Archived Budget");
    await db.query(`update projects set archived_at = now() where id = $1`, [archived]);
    const response = await GET(new Request("http://localhost/api/rom/projects"));
    const body = (await response.json()) as { budgets: { id: string; archivedAt: string | null; feedsPricing: boolean }[] };
    const ids = body.budgets.map((one) => one.id);
    expect(ids).toContain(active);
    expect(ids).toContain(archived);
    expect(ids.indexOf(active)).toBeLessThan(ids.indexOf(archived));
    expect(body.budgets.find((one) => one.id === active)?.feedsPricing).toBe(false);
  });
});
