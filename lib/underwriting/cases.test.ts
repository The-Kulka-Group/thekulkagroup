import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  getUnderwritingCase,
  listUnderwritingCases,
  updateUnderwritingCase,
  type CaseDraft,
} from "./cases";

let db: Awaited<ReturnType<typeof seededDatabase>>;

const firstDraft: CaseDraft = {
  name: "First saved case",
  address: "100 Test Avenue",
  proposedUnits: 48,
  averageUnitSquareFeet: 875.5,
  grossBuildingSquareFeet: 52000,
  assumptions: {
    purchasePrice: 4200000,
    debtPercent: 65.25,
    constructionMonths: 20,
  },
};

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

describe("underwriting case repository", () => {
  it("creates and reads a case with supplied assumptions", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const reopened = await getUnderwritingCase(db, created!.id);

    expect(reopened).toEqual(created);
    expect(reopened).toMatchObject({
      sheetNumber: "U-101",
      name: firstDraft.name,
      address: firstDraft.address,
      proposedUnits: 48,
      developmentType: "ground_up_multifamily",
      status: "working",
    });
    expect(reopened!.assumptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "purchasePrice", value: 4200000, unit: "usd" }),
        expect.objectContaining({ name: "debtPercent", value: 65.25, unit: "percent" }),
      ]),
    );
  });

  it("lists newest cases first without loading assumption rows", async () => {
    const first = await createUnderwritingCase(db, firstDraft);
    const second = await createUnderwritingCase(db, {
      ...firstDraft,
      name: "Second saved case",
      address: "200 Test Avenue",
    });

    const cases = await listUnderwritingCases(db);
    expect(cases.map((savedCase) => savedCase.id)).toEqual([second!.id, first!.id]);
    expect(cases.every((savedCase) => savedCase.assumptions.length === 0)).toBe(true);
  });

  it("updates facts and replaces the supplied assumption set", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const updated = await updateUnderwritingCase(db, created!.id, {
      ...firstDraft,
      name: "Revised saved case",
      proposedUnits: 52,
      assumptions: { exitCapRatePercent: 5.4, holdYears: 10 },
    });

    expect(updated).toMatchObject({ name: "Revised saved case", proposedUnits: 52 });
    expect(updated!.assumptions.map((assumption) => assumption.name).sort()).toEqual([
      "exitCapRatePercent",
      "holdYears",
    ]);
  });

  it("returns null when a case does not exist", async () => {
    expect(await getUnderwritingCase(db, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(
      await updateUnderwritingCase(db, "00000000-0000-4000-8000-0000000000ff", firstDraft),
    ).toBeNull();
  });
});

describe("underwriting migration", () => {
  it("enables row level security with no browser policies", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity
       from pg_class
       where relname in ('underwriting_cases', 'underwriting_case_assumptions')
       order by relname`,
    );
    expect(rows).toEqual([
      { relname: "underwriting_case_assumptions", relrowsecurity: true },
      { relname: "underwriting_cases", relrowsecurity: true },
    ]);

    const policies = await db.query(`select * from pg_policies where tablename like 'underwriting_%'`);
    expect(policies.rows).toEqual([]);
  });

  it("rejects a financial assumption paired with the wrong unit", async () => {
    const savedCase = await createUnderwritingCase(db, firstDraft);
    await expect(
      db.query(
        `insert into underwriting_case_assumptions
           (case_id, assumption_key, value, unit)
         values ($1, 'exit_cap_rate_percent', 5.5, 'usd')`,
        [savedCase!.id],
      ),
    ).rejects.toThrow();
  });
});
