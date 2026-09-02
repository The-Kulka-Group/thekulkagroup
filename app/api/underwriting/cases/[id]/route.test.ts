import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { createUnderwritingCase } from "@/lib/underwriting/cases";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, PATCH } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("/api/underwriting/cases/:id", () => {
  it("reopens and updates a saved case", async () => {
    const savedCase = await createUnderwritingCase(db, {
      name: "Saved route case",
      address: "400 Test Avenue",
      assumptions: {},
    });
    const reopened = await GET(new Request("http://localhost"), context(savedCase!.id));
    expect(reopened.status).toBe(200);
    expect((await reopened.json()).case.id).toBe(savedCase!.id);

    const updated = await PATCH(
      new Request("http://localhost", {
        method: "PATCH",
        body: JSON.stringify({
          name: "Updated route case",
          address: "400 Test Avenue",
          proposedUnits: 44,
          assumptions: { exitCapRatePercent: 5.25 },
        }),
      }),
      context(savedCase!.id),
    );
    expect(updated.status).toBe(200);
    expect((await updated.json()).case).toMatchObject({
      name: "Updated route case",
      proposedUnits: 44,
      assumptions: [expect.objectContaining({ name: "exitCapRatePercent", value: 5.25 })],
    });
  });

  it("rejects malformed ids and returns 404 for missing cases", async () => {
    expect((await GET(new Request("http://localhost"), context("bad"))).status).toBe(400);
    expect(
      (
        await GET(
          new Request("http://localhost"),
          context("00000000-0000-4000-8000-0000000000ff"),
        )
      ).status,
    ).toBe(404);
  });
});
