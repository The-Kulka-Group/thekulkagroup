import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { saveDerivedAssumption } from "@/lib/rom/derived-assumptions";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-860. The correction route records who set a value from the signed-in
// user. Every figure is synthetic.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST, DELETE } = await import("./route");
const context = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string, body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost", { method: "POST", body: JSON.stringify(body), headers }),
    context(id),
  );

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

function seed() {
  return saveDerivedAssumption(
    db as Db,
    TEST_PROJECT_ID,
    {
      kind: "derived_assumption",
      code: "M-1",
      label: "HVAC Cooling Capacity",
      value: { kind: "quantity", amount: 148, unit: "Tons" },
      method: "Synthetic rule of thumb",
      inputs: [{ name: "Gross Area", value: "59,200 SF", basis: "stated" }],
      steps: [{ label: "Cooling capacity", result: "148 tons" }],
      confidence: "low",
      confidenceReason: "Synthetic.",
      costCodes: ["23-100"],
      correction: null,
    },
    { model: "jev-test" },
  );
}

describe("/api/rom/derived-assumptions/:id/correction", () => {
  it("rejects a signed-out request", async () => {
    const saved = await seed();
    const response = await post(
      saved.id,
      { value: { kind: "quantity", amount: 160, unit: "Tons" }, reason: "x" },
      { "x-kulka-test-auth": "signed-out" },
    );
    expect(response.status).toBe(401);
  });

  it("saves a correction by the signed-in user, then reverts it", async () => {
    const saved = await seed();
    const response = await post(saved.id, {
      value: { kind: "quantity", amount: 160, unit: "Tons" },
      reason: "Synthetic: engineer's early number",
    });
    expect(response.status).toBe(200);
    const { derivedAssumption } = await response.json();
    expect(derivedAssumption.correction.correctedBy).toBe("browser-test@kulka.invalid");
    expect(derivedAssumption.correction.value.amount).toBe(160);

    const reverted = await DELETE(new Request("http://localhost", { method: "DELETE" }), context(saved.id));
    expect((await reverted.json()).derivedAssumption.correction).toBeNull();
  });

  it("refuses a correction without a reason or with the wrong unit", async () => {
    const saved = await seed();
    expect((await post(saved.id, { value: { kind: "quantity", amount: 160, unit: "Tons" } })).status).toBe(400);
    const wrongUnit = await post(saved.id, { value: { kind: "quantity", amount: 160, unit: "kW" }, reason: "x" });
    expect(wrongUnit.status).toBe(400);
    expect((await wrongUnit.json()).error).toBe("Correct this quantity in Tons.");
  });

  it("returns 404 for a criterion that does not exist", async () => {
    const response = await post("00000000-0000-4000-8000-0000000000ff", {
      value: { kind: "spec", text: "x" },
      reason: "x",
    });
    expect(response.status).toBe(404);
  });
});
