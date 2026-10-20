import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { upsertJobs } from "./store";

// LA-2881. What the sync keeps from each ACC project. Every project is synthetic.

describe("jobs store", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;
  beforeAll(async () => {
    db = await seededDatabase();
    await db.query(`truncate meetings, jobs cascade`);
  }, 60_000);
  afterAll(async () => db?.close());

  const row = async (autodeskId: string) =>
    (
      await db.query<Record<string, unknown>>(
        `select address_line1, postal_code, latitude, longitude, member_count, company_count, sheet_count, autodesk_tools
           from jobs where autodesk_id = $1`,
        [autodeskId],
      )
    ).rows[0];

  it("keeps the address, pin, counts and the active tools", async () => {
    await upsertJobs(db, [
      {
        id: "acc-synth-a",
        name: "Synthetic A",
        addressLine1: " 100 Example Street ",
        postalCode: "00001",
        latitude: "40.75",
        longitude: -73.25,
        memberCount: 12,
        companyCount: 3,
        sheetCount: 40,
        products: [
          { key: "docs", status: "active" },
          { key: "build", status: "active" },
          { key: "cost", status: "inactive" },
          { key: "build", status: "active" },
        ],
      },
    ]);
    expect(await row("acc-synth-a")).toEqual({
      address_line1: "100 Example Street",
      postal_code: "00001",
      latitude: 40.75,
      longitude: -73.25,
      member_count: 12,
      company_count: 3,
      sheet_count: 40,
      autodesk_tools: ["build", "docs"],
    });
  });

  it("stores nothing for blank, out of range or missing values", async () => {
    await upsertJobs(db, [
      { id: "acc-synth-b", name: "Synthetic B", addressLine1: "  ", latitude: "", longitude: 500, memberCount: -1, sheetCount: 2.5 },
    ]);
    expect(await row("acc-synth-b")).toEqual({
      address_line1: null,
      postal_code: null,
      latitude: null,
      longitude: null,
      member_count: null,
      company_count: null,
      sheet_count: null,
      autodesk_tools: null,
    });
  });

  it("updates the row on the next sync", async () => {
    await upsertJobs(db, [{ id: "acc-synth-a", name: "Synthetic A", memberCount: 14, products: [] }]);
    expect(await row("acc-synth-a")).toMatchObject({ member_count: 14, address_line1: null, autodesk_tools: [] });
  });
});
