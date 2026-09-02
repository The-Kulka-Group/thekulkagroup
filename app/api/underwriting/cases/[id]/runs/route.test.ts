import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { createUnderwritingCase } from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, POST } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

describe("/api/underwriting/cases/:id/runs", () => {
  it("stores a failed run and returns it as the latest run", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Route run case",
      address: "600 Test Avenue",
      assumptions: {},
    });
    const created = await POST(new Request("http://localhost", { method: "POST" }), context(savedCase!.id));
    expect(created.status).toBe(201);
    const createdBody = await created.json();
    expect(createdBody.run.status).toBe("failed");
    expect(createdBody.run.results).toEqual([]);
    expect(createdBody.run.issues).toContainEqual(expect.objectContaining({ code: "missing" }));

    const latest = await GET(new Request("http://localhost"), context(savedCase!.id));
    expect(latest.status).toBe(200);
    expect((await latest.json()).run.caseId).toBe(savedCase!.id);
  });

  it("returns clear errors for invalid, missing, and uncalculated cases", async () => {
    expect((await POST(new Request("http://localhost"), context("bad"))).status).toBe(400);
    const missingId = "00000000-0000-4000-8000-0000000000ff";
    expect((await POST(new Request("http://localhost"), context(missingId))).status).toBe(404);

    const savedCase = await createUnderwritingCase(db, {
      name: "No run case",
      address: "601 Test Avenue",
      assumptions: {},
    });
    expect((await GET(new Request("http://localhost"), context(savedCase!.id))).status).toBe(404);
  });
});
