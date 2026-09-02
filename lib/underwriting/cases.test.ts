import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  getUnderwritingCase,
  listUnderwritingCases,
  saveUnderwritingCostSchedule,
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
      caseRevision: 1,
      factMetadata: {
        proposedUnits: expect.objectContaining({ reviewState: "working", caseRevision: 1 }),
        averageUnitSquareFeet: expect.objectContaining({ reviewState: "working", caseRevision: 1 }),
        grossBuildingSquareFeet: expect.objectContaining({ reviewState: "working", caseRevision: 1 }),
      },
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
    }, created!.caseRevision);

    expect(updated).toMatchObject({ name: "Revised saved case", proposedUnits: 52 });
    expect(updated!.caseRevision).toBe(2);
    expect(updated!.assumptions.map((assumption) => assumption.name).sort()).toEqual([
      "exitCapRatePercent",
      "holdYears",
    ]);
  });

  it("resets review to working when a value changes and keeps its submitted source", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const updated = await updateUnderwritingCase(db, created!.id, {
      ...firstDraft,
      assumptions: { purchasePrice: 4300000 },
      assumptionMetadata: {
        purchasePrice: {
          sourceLabel: "Acquisition memo",
          sourceDate: "2026-08-14",
          reviewState: "done",
        },
      },
    }, created!.caseRevision);

    expect(updated!.assumptions).toEqual([
      expect.objectContaining({
        name: "purchasePrice",
        value: 4300000,
        sourceKind: "user_supplied",
        sourceLabel: "Acquisition memo",
        sourceDate: "2026-08-14",
        reviewState: "working",
        lastChangedAt: expect.any(String),
      }),
    ]);
  });

  it("keeps done review when the saved value does not change", async () => {
    const draftWithEvidence: CaseDraft = {
      ...firstDraft,
      assumptionMetadata: {
        purchasePrice: {
          sourceLabel: "Acquisition memo",
          sourceDate: "2026-08-14",
          reviewState: "done",
        },
      },
    };
    const created = await createUnderwritingCase(db, draftWithEvidence);
    const originalChangedAt = created!.assumptions.find(
      ({ name }) => name === "purchasePrice",
    )!.lastChangedAt;
    const updated = await updateUnderwritingCase(db, created!.id, {
      ...draftWithEvidence,
    }, created!.caseRevision);

    expect(updated!.assumptions.find(({ name }) => name === "purchasePrice")).toMatchObject({
      value: 4200000,
      sourceLabel: "Acquisition memo",
      sourceDate: "2026-08-14",
      reviewState: "done",
      lastChangedAt: originalChangedAt,
    });
  });

  it.each([
    ["source label", { sourceLabel: "Revised memo", sourceDate: "2026-08-14" }],
    ["source date", { sourceLabel: "Acquisition memo", sourceDate: "2026-08-15" }],
  ])("resets assumption review when the %s changes", async (_change, source) => {
    const created = await createUnderwritingCase(db, {
      ...firstDraft,
      assumptionMetadata: {
        purchasePrice: {
          sourceLabel: "Acquisition memo",
          sourceDate: "2026-08-14",
          reviewState: "done",
        },
      },
    });
    const updated = await updateUnderwritingCase(db, created!.id, {
      ...firstDraft,
      assumptionMetadata: {
        purchasePrice: { ...source, reviewState: "done" },
      },
    }, created!.caseRevision);

    expect(updated!.assumptions.find(({ name }) => name === "purchasePrice")).toMatchObject({
      ...source,
      reviewState: "working",
    });
  });

  it("keeps missing assumption evidence missing", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    expect(created!.assumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "purchasePrice", sourceLabel: undefined, sourceDate: undefined }),
    ]));
  });

  it("resets project fact review when its value or evidence changes", async () => {
    const created = await createUnderwritingCase(db, {
      ...firstDraft,
      factMetadata: {
        proposedUnits: {
          sourceLabel: "Program memo",
          sourceDate: "2026-08-10",
          reviewState: "done",
        },
      },
    });
    const reviewed = await updateUnderwritingCase(db, created!.id, {
      ...firstDraft,
      factMetadata: {
        proposedUnits: {
          sourceLabel: "Program memo",
          sourceDate: "2026-08-10",
          reviewState: "done",
        },
      },
    }, created!.caseRevision);
    expect(reviewed!.factMetadata.proposedUnits?.reviewState).toBe("done");

    const sourceEdit = await updateUnderwritingCase(db, reviewed!.id, {
      ...firstDraft,
      factMetadata: {
        proposedUnits: {
          sourceLabel: "Revised program memo",
          sourceDate: "2026-08-10",
          reviewState: "done",
        },
      },
    }, reviewed!.caseRevision);
    expect(sourceEdit!.factMetadata.proposedUnits).toMatchObject({
      sourceLabel: "Revised program memo",
      reviewState: "working",
      caseRevision: 3,
    });

    const valueEdit = await updateUnderwritingCase(db, sourceEdit!.id, {
      ...firstDraft,
      proposedUnits: 50,
      factMetadata: {
        proposedUnits: {
          sourceLabel: "Revised program memo",
          sourceDate: "2026-08-10",
          reviewState: "done",
        },
      },
    }, sourceEdit!.caseRevision);
    expect(valueEdit!.factMetadata.proposedUnits).toMatchObject({
      reviewState: "working",
      caseRevision: 4,
    });
  });

  it("resets project fact review when its source date changes", async () => {
    const created = await createUnderwritingCase(db, {
      ...firstDraft,
      factMetadata: {
        proposedUnits: { sourceLabel: "Program memo", sourceDate: "2026-08-10", reviewState: "working" },
      },
    });
    const reviewed = await updateUnderwritingCase(db, created!.id, {
      ...firstDraft,
      factMetadata: {
        proposedUnits: { sourceLabel: "Program memo", sourceDate: "2026-08-10", reviewState: "done" },
      },
    }, created!.caseRevision);
    const changed = await updateUnderwritingCase(db, reviewed!.id, {
      ...firstDraft,
      factMetadata: {
        proposedUnits: { sourceLabel: "Program memo", sourceDate: "2026-08-11", reviewState: "done" },
      },
    }, reviewed!.caseRevision);
    expect(changed!.factMetadata.proposedUnits).toMatchObject({
      sourceDate: "2026-08-11",
      reviewState: "working",
      caseRevision: 3,
    });
  });

  it("increments the case revision on every saved edit", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const firstEdit = await updateUnderwritingCase(db, created!.id, firstDraft, created!.caseRevision);
    const secondEdit = await updateUnderwritingCase(db, created!.id, firstDraft, firstEdit!.caseRevision);

    expect([created!.caseRevision, firstEdit!.caseRevision, secondEdit!.caseRevision]).toEqual([1, 2, 3]);
  });

  it("reads the case and ordered assumptions with one database statement", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    let queryCount = 0;
    const countedDb = {
      query: <Row>(text: string, params: unknown[] = []) => {
        queryCount += 1;
        return db.query<Row>(text, params);
      },
    };

    const reopened = await getUnderwritingCase(countedDb, created!.id);

    expect(queryCount).toBe(1);
    expect(reopened!.assumptions.map(({ key }) => key)).toEqual([
      "construction_months",
      "debt_percent",
      "purchase_price",
    ]);
  });

  it("returns the snapshot from the revision-controlled update without a follow-up read", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    let queryCount = 0;
    const countedDb = {
      query: async <Row>(text: string, params: unknown[] = []) => {
        queryCount += 1;
        return db.query<Row>(text, params);
      },
    };

    const updated = await updateUnderwritingCase(
      countedDb,
      created!.id,
      { ...firstDraft, name: "Controlled update" },
      created!.caseRevision,
    );

    expect(queryCount).toBe(1);
    expect(updated).toMatchObject({ name: "Controlled update", caseRevision: 2 });
  });

  it("returns null when a case does not exist", async () => {
    expect(await getUnderwritingCase(db, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(
      await updateUnderwritingCase(db, "00000000-0000-4000-8000-0000000000ff", firstDraft, 1),
    ).toBeNull();
  });

  it("rejects a stale edit without overwriting the current revision", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const firstEdit = await updateUnderwritingCase(
      db,
      created!.id,
      { ...firstDraft, name: "Current case name" },
      created!.caseRevision,
    );

    await expect(
      updateUnderwritingCase(
        db,
        created!.id,
        { ...firstDraft, name: "Stale case name" },
        created!.caseRevision,
      ),
    ).rejects.toThrow("The case changed before your edits were saved");
    expect(await getUnderwritingCase(db, created!.id)).toMatchObject({
      name: "Current case name",
      caseRevision: firstEdit!.caseRevision,
    });
  });

  it("stores a versioned monthly cost schedule with source and review fields", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const saved = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2027-12",
      costLines: [{
        id: "hard-cost",
        name: "Hard cost",
        category: "hard_cost",
        amount: 42_630_000,
        unit: "usd",
        startMonth: "2026-02",
        endMonth: "2027-06",
        distributionMethod: "s_curve",
        distributionVersion: "s_curve.smoothstep.v1",
        sourceLabel: "Workbook fixture",
        sourceDate: "2026-09-02",
        reviewState: "done",
      }],
    });

    expect(saved).toMatchObject({
      caseRevision: 2,
      costSchedule: {
        analysisStartMonth: "2026-01",
        saleMonth: "2027-12",
        costLines: [expect.objectContaining({
          id: "hard-cost",
          amount: 42_630_000,
          distributionVersion: "s_curve.smoothstep.v1",
          sourceLabel: "Workbook fixture",
          sourceDate: "2026-09-02",
          reviewState: "done",
          lastChangedAt: expect.any(String),
        })],
      },
    });
    expect((await getUnderwritingCase(db, created!.id))?.costSchedule).toEqual(saved!.costSchedule);
  });

  it("replaces removed cost lines and resets review when a line value changes", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const initial = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [
        {
          id: "land",
          name: "Land",
          category: "land",
          amount: 1_000_000,
          unit: "usd",
          startMonth: "2026-01",
          endMonth: "2026-01",
          distributionMethod: "straight_line",
          distributionVersion: "straight_line.v1",
          reviewState: "done",
        },
        {
          id: "soft",
          name: "Soft cost",
          category: "soft_cost",
          amount: 100_000,
          unit: "usd",
          startMonth: "2026-01",
          endMonth: "2026-06",
          distributionMethod: "straight_line",
          distributionVersion: "straight_line.v1",
          reviewState: "working",
        },
      ],
    });
    const changed = await saveUnderwritingCostSchedule(db, created!.id, initial!.caseRevision, {
      ...initial!.costSchedule!,
      costLines: [{ ...initial!.costSchedule!.costLines[0], amount: 1_100_000, reviewState: "done" }],
    });

    expect(changed!.costSchedule!.costLines).toHaveLength(1);
    expect(changed!.costSchedule!.costLines[0]).toMatchObject({
      id: "land",
      amount: 1_100_000,
      reviewState: "working",
    });
  });

  it("rejects a stale cost schedule save", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const schedule = { analysisStartMonth: "2026-01", saleMonth: "2026-02", costLines: [] };
    await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, schedule);
    await expect(saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, schedule))
      .rejects.toThrow("case changed before your edits were saved");
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

  it("rejects unrecognized project fact evidence fields", async () => {
    await expect(db.query(
      `insert into underwriting_cases (name, address, fact_metadata)
       values ('Invalid fact evidence', '100 Test Avenue', $1::jsonb)`,
      [JSON.stringify({
        proposedUnits: {
          reviewState: "working",
          lastChangedAt: "2026-09-02T00:00:00.000Z",
          caseRevision: 1,
          inventedField: "not allowed",
        },
      })],
    )).rejects.toThrow();
  });

  it("protects monthly cost lines from browser access", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class where relname = 'underwriting_case_cost_lines'`,
    );
    expect(rows).toEqual([{ relname: "underwriting_case_cost_lines", relrowsecurity: true }]);
    const policies = await db.query(`select * from pg_policies where tablename = 'underwriting_case_cost_lines'`);
    expect(policies.rows).toEqual([]);
  });
});
