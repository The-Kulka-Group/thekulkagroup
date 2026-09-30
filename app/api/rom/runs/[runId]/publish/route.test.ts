import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1419. Publish a saved run: POST takes the four fields the estimator
// wrote and calls publishBudget. The first publish is Version 1; a second
// makes Version 2 and marks Version 1 superseded.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

const BODY = {
  preparedFor: "Harbor Point Partners (example)",
  preparedBy: "Devin (example)",
  coverSentence: "This is the first look at the number.",
  validityDays: 60,
};

function ctx(runId: string) {
  return { params: Promise.resolve({ runId }) };
}

function post(runId: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`http://localhost/api/rom/runs/${runId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(runId),
  );
}

async function succeededRunId(): Promise<string> {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return runId;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/runs/[runId]/publish", () => {
  it("refuses a signed-out request and publishes nothing", async () => {
    const runId = await succeededRunId();
    const response = await post(runId, BODY, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from published_budgets`);
    expect(rows[0].n).toBe(0);
  });

  it("publishes Version 1 with the estimator's words and the signed-in email", async () => {
    const runId = await succeededRunId();
    const response = await post(runId, BODY);
    expect(response.status).toBe(200);
    const { published } = await response.json();
    expect(published.version).toBe(1);
    expect(published.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(published.issuedBy).toBe("browser-test@kulka.invalid");

    const { rows } = await db.query<{ copy: Record<string, unknown> }>(
      `select snapshot->'copy' as copy from published_budgets where id = $1`,
      [published.id],
    );
    expect(rows[0].copy).toEqual({
      preparedFor: BODY.preparedFor,
      preparedBy: BODY.preparedBy,
      coverSentence: BODY.coverSentence,
      validityDays: 60,
    });
  });

  it("makes Version 2 on a second publish and marks Version 1 superseded", async () => {
    const runId = await succeededRunId();
    const first = (await (await post(runId, BODY)).json()).published;
    const second = (await (await post(runId, { ...BODY, validityDays: undefined })).json()).published;

    expect(second.version).toBe(2);
    expect(second.token).not.toBe(first.token);
    const { rows } = await db.query<{ id: string; superseded_by: string | null }>(
      `select id, superseded_by from published_budgets order by version`,
    );
    expect(rows[0].superseded_by).toBe(second.id);
    expect(rows[1].superseded_by).toBeNull();
    const days = await db.query<{ d: number }>(`select (snapshot->'copy'->>'validityDays')::int as d from published_budgets where id = $1`, [second.id]);
    expect(days.rows[0].d).toBe(90);
  });

  it("answers 400 to a body it cannot read and publishes nothing", async () => {
    const runId = await succeededRunId();
    expect((await post(runId, "{nope")).status).toBe(400);
    const missing = await post(runId, { preparedBy: "Devin" });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("Add who this budget is prepared for.");
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from published_budgets`);
    expect(rows[0].n).toBe(0);
  });

  it("answers 404 for an id that is not a run, and 409 for a run that did not succeed", async () => {
    expect((await post("not-a-uuid", BODY)).status).toBe(404);
    expect((await post("00000000-0000-4000-8000-000000000000", BODY)).status).toBe(404);

    const runId = await succeededRunId();
    await db.query(`update runs set status = 'failed' where id = $1`, [runId]);
    expect((await post(runId, BODY)).status).toBe(409);
  });
});
