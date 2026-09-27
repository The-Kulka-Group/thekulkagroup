import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET, POST } = await import("./route");

// LA-866: saving an engine parameter change through the API. Every value is a
// synthetic test figure.

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(new Request("http://localhost/api/rom/parameters", { method: "POST", headers, body: JSON.stringify(body) }));
}

async function rowCount(): Promise<number> {
  const { rows } = await db.query<{ n: string }>(`select count(*) as n from engine_parameters`);
  return Number(rows[0].n);
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/parameters", () => {
  it("refuses a signed-out request and writes nothing", async () => {
    const count = await rowCount();
    const response = await post(
      { values: { "spread.high": 0.12 }, reason: "Synthetic." },
      { "x-kulka-test-auth": "signed-out" },
    );
    expect(response.status).toBe(401);
    expect(await rowCount()).toBe(count);
  });

  it("refuses a change with no reason", async () => {
    const response = await post({ values: { "spread.high": 0.12 }, reason: " " });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/reason/);
  });

  it("refuses a set the engine would refuse, naming the value", async () => {
    const response = await post({ values: { "flag.high_min_comparables": 1 }, reason: "Synthetic." });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.problems).toEqual([
      { name: "flag.high_min_comparables", message: "High cannot need fewer comparables than Medium." },
    ]);
  });

  it("refuses a body with no values", async () => {
    expect((await post({ reason: "Synthetic." })).status).toBe(400);
  });

  it("saves a change as the signed-in person, today, as reviewed judgment", async () => {
    const response = await post({ values: { "spread.high": 0.12 }, reason: "Synthetic." });
    expect(response.status).toBe(201);
    const { saved } = await response.json();
    expect(saved).toHaveLength(1);
    expect(saved[0].provenance.kind).toBe("reviewed_judgment");
    expect(saved[0].provenance.recordedBy).toBe("browser-test@kulka.invalid");
    expect(saved[0].provenance.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("GET /api/rom/parameters", () => {
  it("lists every recorded value, with its person, date and reason", async () => {
    const response = await GET(new Request("http://localhost/api/rom/parameters"));
    expect(response.status).toBe(200);
    const { history } = await response.json();
    expect(history).toHaveLength(11);
    const actuals = history.find((h: { name: string }) => h.name === "weight.actuals");
    expect(actuals.provenance.recordedBy).toBe("Matt Nicosia");
    expect(actuals.provenance.recordedAt).toBe("2026-09-21");
    expect(actuals.provenance.reason).toMatch(/five to one/);
  });
});
