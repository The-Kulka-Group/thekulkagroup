import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  getUnderwritingCase,
  listUnderwritingCases,
  saveApartmentOperations,
  saveApartmentScenarios,
  saveDevelopmentCapital,
  savePropertyReturns,
  saveUnderwritingCostSchedule,
  updateUnderwritingCase,
  type CaseDraft,
} from "./cases";
import type { MonthlyCostLine } from "@kulka/engine";

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
  it("stores only scenario deltas and resets review after a changed value", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const scenarios = [
      { id: "higher-vacancy", role: "downside" as const, name: "Higher Vacancy", inputVersion: "apartment_scenario_delta.v1" as const, delta: { vacancyPercent: 8 }, evidence: { vacancyPercent: { sourceLabel: "Market study", sourceDate: "2026-08-01", reviewState: "done" as const } } },
      { id: "lower-exit-cap", role: "upside" as const, name: "Lower Terminal Cap", inputVersion: "apartment_scenario_delta.v1" as const, delta: { terminalCapRatePercent: 5 }, evidence: { terminalCapRatePercent: { sourceLabel: "Broker opinion", sourceDate: "2026-08-01", reviewState: "done" as const } } },
    ];
    const saved = await saveApartmentScenarios(db, created!.id, created!.caseRevision, scenarios);
    expect(saved).toMatchObject({ caseRevision: 2, scenarios: [expect.objectContaining({ delta: { vacancyPercent: 8 } }), expect.objectContaining({ delta: { terminalCapRatePercent: 5 } })] });
    const { rows } = await db.query<{ delta: Record<string, number> }>(`select delta from underwriting_case_scenarios where case_id = $1`, [created!.id]);
    expect(rows.every(({ delta }) => !("base" in delta))).toBe(true);

    const changed = await saveApartmentScenarios(db, created!.id, saved!.caseRevision, [
      { ...scenarios[0], delta: { vacancyPercent: 9 } },
      scenarios[1],
    ]);
    expect(changed!.scenarios!.find(({ role }) => role === "downside")!.evidence.vacancyPercent!.reviewState).toBe("working");
    expect(changed!.scenarios!.find(({ role }) => role === "upside")!.evidence.terminalCapRatePercent!.reviewState).toBe("done");
  });

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

  it("stores versioned apartment operations inputs on a new case revision", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{
        id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd",
        startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line",
        distributionVersion: "straight_line.v1", reviewState: "working",
      }],
    });
    const saved = await saveApartmentOperations(db, created!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1",
      operationStartMonth: "2026-02",
      growthStartMonth: "2026-02",
      preleasedUnits: 2,
      leaseUpUnitsPerMonth: 4,
      annualIncomeGrowthPercent: 3,
      annualExpenseGrowthPercent: 3,
      rentAdjustmentLossPercent: 0,
      freeRentPercent: 0,
      vacancyPercent: 5,
      creditLossPercent: 1,
      assumptionEvidence: workingAssumptionEvidence(),
      residentialUnitTypes: [{
        id: "one-bedroom", name: "One Bedroom", units: 10, nonRevenueUnits: 0,
        averageAreaSf: 800,
        monthlyMarketRent: 2_000, sourceLabel: "Program", sourceDate: "2026-08-01",
        reviewState: "done",
      }],
      otherIncomeLines: [],
      operatingExpenseLines: [],
      capitalExpenditureLines: [],
    });

    expect(saved).toMatchObject({
      caseRevision: 3,
      apartmentOperations: {
        inputVersion: "apartment_operations_inputs.v1",
        operationStartMonth: "2026-02",
        residentialUnitTypes: [expect.objectContaining({ id: "one-bedroom" })],
        lastChangedAt: expect.any(String),
      },
    });
    expect(await getUnderwritingCase(db, created!.id)).toEqual(saved);

    const { lastChangedAt: _lastChangedAt, ...savedDraft } = saved!.apartmentOperations!;
    void _lastChangedAt;
    const changed = await saveApartmentOperations(db, created!.id, saved!.caseRevision, {
      ...savedDraft,
      vacancyPercent: 6,
      assumptionEvidence: doneAssumptionEvidence(),
    });
    expect(changed!.apartmentOperations!.assumptionEvidence.vacancyPercent.reviewState).toBe("working");
    expect(changed!.apartmentOperations!.assumptionEvidence.creditLossPercent.reviewState).toBe("working");

    const { lastChangedAt: _changedAt, ...changedDraft } = changed!.apartmentOperations!;
    void _changedAt;
    const sourceChanged = await saveApartmentOperations(db, created!.id, changed!.caseRevision, {
      ...changedDraft,
      assumptionEvidence: {
        ...changedDraft.assumptionEvidence,
        creditLossPercent: {
          ...changedDraft.assumptionEvidence.creditLossPercent,
          sourceLabel: "Revised operating history",
          reviewState: "done",
        },
      },
    });
    expect(sourceChanged!.apartmentOperations!.assumptionEvidence.creditLossPercent).toMatchObject({
      sourceLabel: "Revised operating history",
      reviewState: "working",
    });

    const { lastChangedAt: _reviewedAt, ...reviewedDraft } = sourceChanged!.apartmentOperations!;
    void _reviewedAt;
    const reviewed = await saveApartmentOperations(db, created!.id, sourceChanged!.caseRevision, {
      ...reviewedDraft,
      assumptionEvidence: {
        ...reviewedDraft.assumptionEvidence,
        creditLossPercent: {
          ...reviewedDraft.assumptionEvidence.creditLossPercent,
          reviewState: "done",
        },
      },
    });
    const { lastChangedAt: _reviewDateAt, ...reviewDateDraft } = reviewed!.apartmentOperations!;
    void _reviewDateAt;
    const dateChanged = await saveApartmentOperations(db, created!.id, reviewed!.caseRevision, {
      ...reviewDateDraft,
      assumptionEvidence: {
        ...reviewDateDraft.assumptionEvidence,
        creditLossPercent: {
          ...reviewDateDraft.assumptionEvidence.creditLossPercent,
          sourceDate: "2026-08-02",
          reviewState: "done",
        },
      },
    });
    expect(dateChanged!.apartmentOperations!.assumptionEvidence.creditLossPercent).toMatchObject({
      sourceDate: "2026-08-02",
      reviewState: "working",
    });
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
    const countedDb: Db = {
      query: <Row>(text: string, params: unknown[] = []) => {
        queryCount += 1;
        return db.query<Row>(text, params);
      },
      withTransaction: (fn) => fn(countedDb),
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
    const countedDb: Db = {
      query: async <Row>(text: string, params: unknown[] = []) => {
        queryCount += 1;
        return db.query<Row>(text, params);
      },
      withTransaction: (fn) => fn(countedDb),
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
    ).rejects.toThrow("The project changed before your edits were saved");
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

  it("saves a basis line without an amount and reads it back with the case quantities", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const line = (id: string, extra: Partial<MonthlyCostLine>): MonthlyCostLine => ({
      id,
      name: id,
      category: "hard_cost",
      unit: "usd",
      startMonth: "2026-01",
      endMonth: "2026-02",
      distributionMethod: "straight_line",
      distributionVersion: "straight_line.v1",
      reviewState: "done",
      ...extra,
    });
    const saved = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-03",
      costLines: [
        line("shell", { basis: { type: "per_gross_square_foot", rate: 185.5 } }),
        line("appliances", { basis: { type: "per_unit", rate: 4250 } }),
        line("design", { category: "soft_cost", basis: { type: "percent_of_line", baseLineId: "shell", percent: 6.5 } }),
        line("land", { category: "land", amount: 1_000_000 }),
      ],
    });

    expect(saved!.costSchedule!.quantities).toEqual({ grossSquareFeet: 52000, units: 48 });
    const [shell, appliances, design, land] = saved!.costSchedule!.costLines;
    expect(shell).toMatchObject({ basis: { type: "per_gross_square_foot", rate: 185.5 } });
    expect(shell).not.toHaveProperty("amount");
    expect(appliances.basis).toEqual({ type: "per_unit", rate: 4250 });
    expect(design.basis).toEqual({ type: "percent_of_line", baseLineId: "shell", percent: 6.5 });
    expect(land).toMatchObject({ amount: 1_000_000 });
    expect(land.basis).toBeUndefined();

    const changed = await saveUnderwritingCostSchedule(db, created!.id, saved!.caseRevision, {
      ...saved!.costSchedule!,
      costLines: saved!.costSchedule!.costLines.map((saved) => saved.id === "shell"
        ? { ...saved, basis: { type: "per_gross_square_foot" as const, rate: 190 } }
        : saved),
    });
    expect(changed!.costSchedule!.costLines.map(({ id, reviewState }) => [id, reviewState])).toEqual([
      ["shell", "working"], ["appliances", "done"], ["design", "done"], ["land", "done"],
    ]);
  });

  it("saves a percent-of-total line with its base and resets review when the base changes", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const fee: MonthlyCostLine = {
      id: "fee", name: "Development Fee", category: "development_fee", unit: "usd", startMonth: "2026-01", endMonth: "2026-02",
      distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "done",
      basis: { type: "percent_of_total", base: "total_cost", percent: 3.5 },
    };
    const hard: MonthlyCostLine = { ...fee, id: "hard", name: "Hard", category: "hard_cost", basis: undefined, amount: 1_000_000 };
    const saved = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-03", costLines: [hard, fee],
    });
    expect(saved!.costSchedule!.costLines[1].basis).toEqual({ type: "percent_of_total", base: "total_cost", percent: 3.5 });
    expect(saved!.costSchedule!.costLines[1]).not.toHaveProperty("amount");

    const changed = await saveUnderwritingCostSchedule(db, created!.id, saved!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-03",
      costLines: [hard, { ...fee, basis: { type: "percent_of_total", base: "total_less_land", percent: 3.5 } }],
    });
    expect(changed!.costSchedule!.costLines.map(({ reviewState }) => reviewState)).toEqual(["done", "working"]);
  });

  it("rejects a percent-of-total row without a base or at 100 percent", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const insert = (values: string) => db.query(
      `insert into underwriting_case_cost_lines
         (case_id, id, line_order, name, category, unit, start_month, end_month,
          distribution_method, distribution_version, review_state, basis_type, basis_percent, basis_total_base)
       values ($1, 'x', 0, 'x', 'hard_cost', 'usd', '2026-01-01', '2026-02-01',
          'straight_line', 'straight_line.v1', 'working', 'percent_of_total', ${values})`,
      [created!.id],
    );
    await expect(insert("5, null")).rejects.toThrow();
    await expect(insert("100, 'total_cost'")).rejects.toThrow();
    await expect(insert("5, 'everything'")).rejects.toThrow();
    await expect(insert("5, 'hard_and_soft'")).resolves.toBeDefined();
  });

  it("moves a line from a basis back to a fixed amount", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const base: MonthlyCostLine = {
      id: "shell", name: "Shell", category: "hard_cost", unit: "usd", startMonth: "2026-01", endMonth: "2026-02",
      distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "done",
    };
    const derived = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-03",
      costLines: [{ ...base, basis: { type: "per_unit", rate: 100 } }],
    });
    const fixed = await saveUnderwritingCostSchedule(db, created!.id, derived!.caseRevision, {
      analysisStartMonth: "2026-01", saleMonth: "2026-03",
      costLines: [{ ...base, amount: 5000 }],
    });
    expect(fixed!.costSchedule!.costLines[0]).toMatchObject({ amount: 5000 });
    expect(fixed!.costSchedule!.costLines[0].basis).toBeUndefined();
  });

  it("rejects a basis line that is inconsistent in the database", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const insert = (columns: string) => db.query(
      `insert into underwriting_case_cost_lines
         (case_id, id, line_order, name, category, unit, start_month, end_month,
          distribution_method, distribution_version, review_state, ${columns.split("|")[0]})
       values ($1, 'x', 0, 'x', 'hard_cost', 'usd', '2026-01-01', '2026-02-01',
          'straight_line', 'straight_line.v1', 'working', ${columns.split("|")[1]})`,
      [created!.id],
    );
    await expect(insert("amount, basis_type|100, 'per_unit'")).rejects.toThrow();
    await expect(insert("basis_type|'per_unit'")).rejects.toThrow();
    await expect(insert("basis_type, basis_percent, basis_base_line_id|'percent_of_line', 5, 'x'")).rejects.toThrow();
    await expect(insert("basis_type, basis_rate|'per_unit', 12.5")).resolves.toBeDefined();
  });

  it("rejects a stale cost schedule save", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const schedule = { analysisStartMonth: "2026-01", saleMonth: "2026-02", costLines: [] };
    await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, schedule);
    await expect(saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, schedule))
      .rejects.toThrow("project changed before your edits were saved");
  });

  it("keeps review on unchanged grants and credited land, and resets it when an amount changes", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, created!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01",
      preleasedUnits: 10, leaseUpUnitsPerMonth: 1, annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0,
      rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(),
      residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
    });
    const plan = {
      capitalInputVersion: "development_capital_inputs.v1" as const,
      targetDebtSharePercent: 65,
      annualInterestRatePercent: 8,
      loanFeePercent: 1,
      fundingOrder: "equity_first.v1" as const,
      interestTreatment: "capitalized_net_operating_cash.v1" as const,
      interestConvention: "opening_balance_monthly.v1" as const,
      feeMonth: "2026-01",
      payoffMonth: "2026-12",
      otherSources: [{ id: "grant", name: "State Grant", kind: "grant" as const, draws: [{ month: "2026-01", amount: 100_000 }], reviewState: "done" as const }],
      creditedLand: { creditedValue: 1_500_000, countsAsSponsorEquity: true, reviewState: "done" as const },
      capitalAssumptionEvidence: doneCapitalEvidence(),
    };
    const saved = await saveDevelopmentCapital(db, created!.id, operating!.caseRevision, plan);
    expect(saved!.developmentCapital!.otherSources![0].reviewState).toBe("done");
    expect(saved!.developmentCapital!.creditedLand!.reviewState).toBe("done");

    const same = await saveDevelopmentCapital(db, created!.id, saved!.caseRevision, plan);
    expect(same!.developmentCapital!.otherSources![0].reviewState).toBe("done");
    expect(same!.developmentCapital!.creditedLand!.reviewState).toBe("done");

    const changed = await saveDevelopmentCapital(db, created!.id, same!.caseRevision, {
      ...plan,
      otherSources: [{ ...plan.otherSources[0], draws: [{ month: "2026-01", amount: 120_000 }] }],
      creditedLand: { ...plan.creditedLand, countsAsSponsorEquity: false },
    });
    expect(changed!.developmentCapital!.otherSources![0].reviewState).toBe("working");
    expect(changed!.developmentCapital!.creditedLand!.reviewState).toBe("working");

    const removed = await saveDevelopmentCapital(db, created!.id, changed!.caseRevision, { ...plan, otherSources: undefined, creditedLand: undefined });
    expect(removed!.developmentCapital).not.toHaveProperty("otherSources");
    expect(removed!.developmentCapital).not.toHaveProperty("creditedLand");
  });

  it("stores a versioned capital plan and resets review when a term changes", async () => {
    const created = await createUnderwritingCase(db, firstDraft);
    const scheduled = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, {
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", reviewState: "working" }],
    });
    const operating = await saveApartmentOperations(db, created!.id, scheduled!.caseRevision, {
      inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01",
      preleasedUnits: 10, leaseUpUnitsPerMonth: 1, annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0,
      rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
      assumptionEvidence: workingAssumptionEvidence(),
      residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, reviewState: "working" }],
      otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
    });
    const plan = {
      capitalInputVersion: "development_capital_inputs.v1" as const,
      targetDebtSharePercent: 65,
      annualInterestRatePercent: 8,
      loanFeePercent: 1,
      fundingOrder: "equity_first.v1" as const,
      interestTreatment: "capitalized_net_operating_cash.v1" as const,
      interestConvention: "opening_balance_monthly.v1" as const,
      feeMonth: "2026-01",
      payoffMonth: "2026-12",
      capitalAssumptionEvidence: doneCapitalEvidence(),
    };
    const saved = await saveDevelopmentCapital(db, created!.id, operating!.caseRevision, plan);
    expect(saved).toMatchObject({
      caseRevision: 4,
      developmentCapital: { ...plan, lastChangedAt: expect.any(String) },
    });

    const changed = await saveDevelopmentCapital(db, created!.id, saved!.caseRevision, {
      ...plan,
      annualInterestRatePercent: 8.5,
    });
    expect(changed!.developmentCapital!.capitalAssumptionEvidence.annualInterestRatePercent.reviewState).toBe("working");
    expect(changed!.developmentCapital!.capitalAssumptionEvidence.targetDebtSharePercent.reviewState).toBe("done");

    const changedLabel = await saveDevelopmentCapital(db, created!.id, changed!.caseRevision, {
      ...plan,
      annualInterestRatePercent: 8.5,
      capitalAssumptionEvidence: {
        ...doneCapitalEvidence(),
        targetDebtSharePercent: {
          ...doneCapitalEvidence().targetDebtSharePercent,
          sourceLabel: "Revised capital source",
        },
      },
    });
    expect(changedLabel!.developmentCapital!.capitalAssumptionEvidence.targetDebtSharePercent.reviewState).toBe("working");

    const changedDate = await saveDevelopmentCapital(db, created!.id, changedLabel!.caseRevision, {
      ...plan,
      annualInterestRatePercent: 8.5,
      capitalAssumptionEvidence: {
        ...changedLabel!.developmentCapital!.capitalAssumptionEvidence,
        feeMonth: {
          ...changedLabel!.developmentCapital!.capitalAssumptionEvidence.feeMonth,
          sourceDate: "2026-08-02",
          reviewState: "done",
        },
      },
    });
    expect(changedDate!.developmentCapital!.capitalAssumptionEvidence.feeMonth.reviewState).toBe("working");

    const salePlan = {
      saleInputVersion: "property_returns_inputs.v1" as const,
      terminalCapRatePercent: 5.75,
      sellingCostPercent: 1.5,
      forwardNoiConvention: "forward_twelve_month_noi.v1" as const,
      cashFlowDateConvention: "month_end_dates.v1" as const,
      xirrConvention: "xirr_actual_365.v1" as const,
      saleAssumptionEvidence: doneSaleEvidence(),
    };
    const sold = await savePropertyReturns(db, created!.id, changedDate!.caseRevision, salePlan);
    expect(sold).toMatchObject({ caseRevision: 8, propertyReturns: { ...salePlan, lastChangedAt: expect.any(String) } });
    const saleChanged = await savePropertyReturns(db, created!.id, sold!.caseRevision, {
      ...salePlan,
      terminalCapRatePercent: 6,
      saleAssumptionEvidence: {
        ...salePlan.saleAssumptionEvidence,
        sellingCostPercent: { ...salePlan.saleAssumptionEvidence.sellingCostPercent, sourceLabel: "Changed sale source" },
      },
    });
    expect(saleChanged!.propertyReturns!.saleAssumptionEvidence.terminalCapRatePercent.reviewState).toBe("working");
    expect(saleChanged!.propertyReturns!.saleAssumptionEvidence.sellingCostPercent.reviewState).toBe("working");
    expect(saleChanged!.propertyReturns!.saleAssumptionEvidence.saleMonth.reviewState).toBe("done");
    const done = { sourceLabel: "Operating agreement", sourceDate: "2026-10-07", reviewState: "done" as const };
    const partnership = {
      partnershipInputVersion: "partnership_inputs.v1" as const,
      lpFundingSharePercent: 90,
      fundingOrder: "pari_passu" as const,
      preferredReturn: { ratePercent: 8, accrual: "compound_monthly" as const },
      tiers: [{ lpIrrHurdlePercent: 12, promotePercent: 20, lpBaseSharePercent: 90 }],
      finalSplit: { promotePercent: 40, lpBaseSharePercent: 90 },
      partnershipEvidence: { funding: done, preferredReturn: done, promoteTiers: done },
    };
    const withWaterfall = await savePropertyReturns(db, created!.id, saleChanged!.caseRevision, {
      ...salePlan,
      terminalCapRatePercent: 6,
      saleAssumptionEvidence: saleChanged!.propertyReturns!.saleAssumptionEvidence,
      partnership,
    });
    expect(withWaterfall!.propertyReturns!.partnership).toEqual(partnership);
    const promoteChanged = await savePropertyReturns(db, created!.id, withWaterfall!.caseRevision, {
      ...salePlan,
      terminalCapRatePercent: 6,
      saleAssumptionEvidence: saleChanged!.propertyReturns!.saleAssumptionEvidence,
      partnership: { ...partnership, finalSplit: { promotePercent: 35, lpBaseSharePercent: 90 } },
    });
    const evidenceAfter = promoteChanged!.propertyReturns!.partnership!.partnershipEvidence;
    expect(evidenceAfter.promoteTiers!.reviewState).toBe("working");
    expect(evidenceAfter.funding!.reviewState).toBe("done");
    expect(evidenceAfter.preferredReturn!.reviewState).toBe("done");
    const withoutWaterfall = await savePropertyReturns(db, created!.id, promoteChanged!.caseRevision, {
      ...salePlan,
      terminalCapRatePercent: 6,
      saleAssumptionEvidence: saleChanged!.propertyReturns!.saleAssumptionEvidence,
    });
    expect(withoutWaterfall!.propertyReturns!.partnership).toBeUndefined();
    const revisedSchedule = await saveUnderwritingCostSchedule(db, created!.id, withoutWaterfall!.caseRevision, {
      analysisStartMonth: saleChanged!.costSchedule!.analysisStartMonth,
      saleMonth: "2027-01",
      costLines: saleChanged!.costSchedule!.costLines.map(({ lastChangedAt, ...line }) => {
        void lastChangedAt;
        return line;
      }),
    });
    expect(revisedSchedule!.propertyReturns!.saleAssumptionEvidence.saleMonth.reviewState).toBe("working");
  });
});

function workingAssumptionEvidence() {
  return {
    operationStartMonth: { reviewState: "working" as const },
    growthStartMonth: { reviewState: "working" as const },
    preleasedUnits: { reviewState: "working" as const },
    leaseUpUnitsPerMonth: { reviewState: "working" as const },
    annualIncomeGrowthPercent: { reviewState: "working" as const },
    annualExpenseGrowthPercent: { reviewState: "working" as const },
    rentAdjustmentLossPercent: { reviewState: "working" as const },
    freeRentPercent: { reviewState: "working" as const },
    vacancyPercent: { reviewState: "working" as const },
    creditLossPercent: { reviewState: "working" as const },
  };
}

function doneAssumptionEvidence() {
  const item = () => ({ sourceLabel: "Reviewed source", sourceDate: "2026-08-01", reviewState: "done" as const });
  return {
    operationStartMonth: item(),
    growthStartMonth: item(),
    preleasedUnits: item(),
    leaseUpUnitsPerMonth: item(),
    annualIncomeGrowthPercent: item(),
    annualExpenseGrowthPercent: item(),
    rentAdjustmentLossPercent: item(),
    freeRentPercent: item(),
    vacancyPercent: item(),
    creditLossPercent: item(),
  };
}

function doneCapitalEvidence() {
  const item = () => ({ sourceLabel: "Reviewed capital source", sourceDate: "2026-08-01", reviewState: "done" as const });
  return {
    targetDebtSharePercent: item(),
    annualInterestRatePercent: item(),
    loanFeePercent: item(),
    fundingOrder: item(),
    interestTreatment: item(),
    interestConvention: item(),
    feeMonth: item(),
    payoffMonth: item(),
  };
}

function doneSaleEvidence() {
  const item = () => ({ sourceLabel: "Reviewed sale source", sourceDate: "2026-08-01", reviewState: "done" as const });
  return {
    saleMonth: item(), terminalCapRatePercent: item(), sellingCostPercent: item(),
    forwardNoiConvention: item(), cashFlowDateConvention: item(), xirrConvention: item(),
  };
}

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
