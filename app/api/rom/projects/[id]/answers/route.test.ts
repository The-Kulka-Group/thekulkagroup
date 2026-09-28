import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1225. New Budget saves gate answers and GRs/GCs choices as each one is
// given, with no run opened.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { PUT } = await import("./route");

function put(id: string, body: unknown, headers: Record<string, string> = {}) {
  return PUT(
    new Request(`http://localhost/api/rom/projects/${id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

async function row() {
  const result = await db.query<{ demolition_gate: string | null; elevator_gate: string | null; markup_choices: unknown }>(
    `select demolition_gate, elevator_gate, markup_choices from projects where id = $1`,
    [TEST_PROJECT_ID],
  );
  return result.rows[0];
}

async function runCount() {
  const result = await db.query<{ n: number }>(`select count(*)::int as n from runs`);
  return result.rows[0].n;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("PUT /api/rom/projects/[id]/answers", () => {
  it("refuses a signed-out request and writes nothing", async () => {
    const before = await row();
    const response = await put(TEST_PROJECT_ID, { gates: { demolition: "yes" } }, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    expect(await row()).toEqual(before);
  });

  it("saves gate answers without opening a run", async () => {
    const runs = await runCount();
    const response = await put(TEST_PROJECT_ID, { gates: { demolition: "yes", elevator: "no" } });
    expect(response.status).toBe(200);
    expect(await row()).toMatchObject({ demolition_gate: "yes", elevator_gate: "no" });
    expect(await runCount()).toBe(runs);
  });

  it("saves markups and leaves the gates alone when only markups are sent", async () => {
    await put(TEST_PROJECT_ID, { gates: { demolition: "yes" } });
    const response = await put(TEST_PROJECT_ID, { markups: { setup: "gc_only", method: "usd_per_gsf" } });
    expect(response.status).toBe(200);
    const saved = await row();
    expect(saved.demolition_gate).toBe("yes");
    expect(saved.markup_choices).toMatchObject({ setup: "gc_only", method: "usd_per_gsf" });
  });

  it("refuses a bad gate answer", async () => {
    const response = await put(TEST_PROJECT_ID, { gates: { demolition: "maybe" } });
    expect(response.status).toBe(400);
  });

  it("404s for a project that does not exist", async () => {
    const response = await put("00000000-0000-4000-8000-00000000abcd", { gates: {} });
    expect(response.status).toBe(404);
  });
});
