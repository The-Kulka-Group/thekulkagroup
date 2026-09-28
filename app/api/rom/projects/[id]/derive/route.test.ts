import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1265. New Budget works the elevator criteria out mid-flow: V-1 from the
// building's height, then V-2 from V-1's type. No Jev client is configured in
// tests, so V-1 in the either band proposes Hydraulic without calling Jev.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

function derive(responses: Record<string, string>, id = TEST_PROJECT_ID) {
  return POST(
    new Request(`http://localhost/api/rom/projects/${id}/derive`, {
      method: "POST",
      body: JSON.stringify({ responses }),
    }),
    { params: Promise.resolve({ id }) },
  );
}

/** The elevator criteria alone; M-0 and M-1 come back for any multifamily job (LA-1282). */
const elevatorCodes = (criteria: { code: string }[]) =>
  criteria
    .map((one) => one.code)
    .filter((code) => code.startsWith("V-"))
    .sort();

const FIVE_STORIES = {
  project_type: "multifamily",
  construction_kind: "new",
  gross_square_feet: "50000",
  stories_above_grade: "5",
  elevator: "yes",
  elevator_count: "2",
  levels_below_grade: "no",
  site_conditions: "no",
};

beforeEach(async () => {
  db = await seededDatabase();
  await db.query(`update projects set framing_system = 'wood' where id = $1`, [TEST_PROJECT_ID]);
});

afterEach(async () => {
  await db.close();
});

describe("POST /api/rom/projects/[id]/derive", () => {
  it("works out V-1, V-2 and V-3, and returns the facts they set", async () => {
    const response = await derive(FIVE_STORIES);
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(elevatorCodes(body.criteria)).toEqual(["V-1", "V-2", "V-3"]);
    // Five stories at 10'-0" is 40 ft: hydraulic, and in-ground on dry ground.
    // Two hydraulic cars in one building share one machine room (LA-1269).
    expect(body.facts).toEqual({
      elevatorType: "hydraulic",
      hydraulicJackType: "in_ground",
      elevatorMachineRooms: "1",
      elevatorMachineRoomHvac: "yes",
    });
    const v2 = body.criteria.find((one: { code: string }) => one.code === "V-2");
    expect(v2.costCodes).toEqual(["26", "26i"]);
  });

  it("goes holeless on wet ground", async () => {
    const body = await (await derive({ ...FIVE_STORIES, site_conditions: "yes" })).json();
    expect(body.facts.hydraulicJackType).toBe("holeless");
  });

  it("removes V-2 once V-1 is corrected to traction", async () => {
    const first = await (await derive(FIVE_STORIES)).json();
    const v1 = first.criteria.find((one: { code: string }) => one.code === "V-1");
    await db.query(
      `insert into derived_assumption_corrections (derived_assumption_id, value, reason, corrected_by)
       values ($1, '{"kind":"spec","text":"Traction"}'::jsonb, 'test', 'automated test')`,
      [v1.id],
    );

    const body = await (await derive(FIVE_STORIES)).json();
    expect(elevatorCodes(body.criteria)).toEqual(["V-1", "V-3"]);
    // Machine-room-less traction has no room to condition (LA-1269).
    expect(body.facts).toEqual({ elevatorType: "traction", elevatorMachineRooms: "0", elevatorMachineRoomHvac: "no" });
  });

  it("works no elevator criterion out without an elevator", async () => {
    const body = await (await derive({ ...FIVE_STORIES, elevator: "no" })).json();
    // No unit count, so E-1 has nothing to size either (LA-1281).
    expect(body.criteria.map((one: { code: string }) => one.code).sort()).toEqual(["M-0", "M-1"]);
    expect(body.facts).toEqual({});
  });

  it("sizes the cooling and the electrical service (LA-1281, LA-1282)", async () => {
    const body = await (
      await derive({
        ...FIVE_STORIES,
        unit_count: "60",
        building_count: "1",
        zip: "10956",
        parking_type: "surface",
        amenity_scope: "no",
        retail_storefronts: "no",
        balconies: "no",
      })
    ).json();
    const byCode = Object.fromEntries(body.criteria.map((one: { code: string }) => [one.code, one]));
    expect(Object.keys(byCode).sort()).toEqual(["E-1", "M-0", "M-1", "V-1", "V-2", "V-3"]);
    // New City is Rockland, zone 5: 50,000 / 701 GSF per ton is 71 tons.
    expect(byCode["M-0"].value).toEqual({ kind: "spec", text: "Standard Glazing Band" });
    expect(byCode["M-1"].value).toEqual({ kind: "quantity", amount: 71, unit: "Tons" });
    expect(byCode["M-1"].costCodes).toEqual(["30"]);
    expect(byCode["E-1"].value.unit).toBe("A Service");
    expect(byCode["E-1"].costCodes).toEqual(["31"]);
    // They set no fact: items 30 and 31 still price per square foot.
    expect(Object.keys(body.facts).sort()).toEqual([
      "elevatorMachineRoomHvac",
      "elevatorMachineRooms",
      "elevatorType",
      "hydraulicJackType",
    ]);
  });
});
