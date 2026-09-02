import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, POST } = await import("./route");

function post(body: unknown, raw = false) {
  return POST(
    new Request("http://localhost/api/underwriting/cases", {
      method: "POST",
      body: raw ? String(body) : JSON.stringify(body),
    }),
  );
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("/api/underwriting/cases", () => {
  it("creates and lists a saved case with stable JSON fields", async () => {
    const response = await post({
      name: "Route test case",
      address: "300 Test Avenue",
      proposedUnits: 40,
      assumptions: { purchasePrice: 3000000 },
    });
    expect(response.status).toBe(201);
    const created = await response.json();
    expect(created.case).toMatchObject({
      name: "Route test case",
      address: "300 Test Avenue",
      proposedUnits: 40,
      sheetNumber: "U-101",
      assumptions: [expect.objectContaining({ name: "purchasePrice", value: 3000000 })],
    });
    expect(typeof created.case.createdAt).toBe("string");

    const listed = await (await GET()).json();
    expect(listed.cases).toEqual([
      expect.objectContaining({ id: created.case.id, sheetNumber: "U-101" }),
    ]);
  });

  it("rejects invalid and non-JSON input without writing a case", async () => {
    expect((await post({ name: "Missing address" })).status).toBe(400);
    expect((await post("not json", true)).status).toBe(400);
    expect((await (await GET()).json()).cases).toEqual([]);
  });
});
