import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { addReader, findActiveReader, revokeReader } from "@/lib/rom/budget-comments";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1486. Add readers to a project and list them with the link to copy.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, POST } = await import("./route");

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function get(id: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/api/rom/projects/${id}/readers`, { headers }), ctx(id));
}

function post(id: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`http://localhost/api/rom/projects/${id}/readers`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(id),
  );
}

const DAN = { name: "Dan Reyes", email: "dan@example.com", company: "Fieldstone" };

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await db.close();
});

describe("POST /api/rom/projects/[id]/readers", () => {
  it("refuses a signed-out request and adds nobody", async () => {
    expect((await post(TEST_PROJECT_ID, DAN, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
    const { rows } = await db.query(`select 1 from budget_readers`);
    expect(rows).toHaveLength(0);
  });

  it("adds a reader and returns their link, built on the site's origin, without the bare key", async () => {
    vi.stubEnv("KULKA_SITE_URL", "https://kulka.example");
    const response = await post(TEST_PROJECT_ID, DAN);

    expect(response.status).toBe(201);
    const { reader } = await response.json();
    expect(reader).toMatchObject({ name: "Dan Reyes", email: "dan@example.com", company: "Fieldstone", revokedAt: null });
    expect(reader.link).toMatch(/^https:\/\/kulka\.example\/b\/r\/[A-Za-z0-9_-]{22}$/);
    expect(reader).not.toHaveProperty("readerKey");

    const key = reader.link.split("/").pop();
    expect((await findActiveReader(db as Db, key))?.id).toBe(reader.id);
  });

  it("records who added the reader and takes a missing company as none", async () => {
    const { reader } = await (await post(TEST_PROJECT_ID, { name: "Dana", email: "dana@example.com" })).json();
    expect(reader.company).toBeNull();
    expect(reader.createdBy).toBe("browser-test@kulka.invalid");
  });

  it("answers 400 for a missing name, a bad email or a body that is not a reader", async () => {
    for (const body of [
      { ...DAN, name: "  " },
      { ...DAN, email: "no-at-sign" },
      { name: "Dan" },
      { ...DAN, company: 7 },
      ["Dan"],
      "not json",
    ]) {
      expect((await post(TEST_PROJECT_ID, body)).status).toBe(400);
    }
    const { rows } = await db.query(`select 1 from budget_readers`);
    expect(rows).toHaveLength(0);
  });

  it("answers 404 for a project that does not exist", async () => {
    expect((await post("not-a-uuid", DAN)).status).toBe(404);
    expect((await post("00000000-0000-4000-8000-000000000000", DAN)).status).toBe(404);
  });
});

describe("GET /api/rom/projects/[id]/readers", () => {
  it("refuses a signed-out request", async () => {
    expect((await get(TEST_PROJECT_ID, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("lists nothing for a project with no readers and 404s a bad id", async () => {
    const response = await get(TEST_PROJECT_ID);
    expect(response.status).toBe(200);
    expect((await response.json()).readers).toEqual([]);
    expect((await get("not-a-uuid")).status).toBe(404);
  });

  it("lists readers newest first, with a link for an active one and none for a revoked one", async () => {
    const dan = await addReader(db as Db, { projectId: TEST_PROJECT_ID, ...DAN, createdBy: "devin@example.com" });
    const dana = await addReader(db as Db, {
      projectId: TEST_PROJECT_ID,
      name: "Dana Cole",
      email: "dana@example.com",
      createdBy: "devin@example.com",
    });
    await revokeReader(db as Db, dan.id);

    const { readers } = await (await get(TEST_PROJECT_ID)).json();

    expect(readers.map((r: { name: string }) => r.name)).toEqual(["Dana Cole", "Dan Reyes"]);
    expect(readers[0].link).toBe(`http://localhost/b/r/${dana.readerKey}`);
    expect(readers[1].link).toBeNull();
    expect(readers[1].revokedAt).not.toBeNull();
    expect(JSON.stringify(readers)).not.toContain(dan.readerKey);
  });
});
