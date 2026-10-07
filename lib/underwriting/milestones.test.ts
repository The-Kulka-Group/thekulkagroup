import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MonthlyCostLine, MonthlyCostScheduleInputs } from "@kulka/engine";
import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  getUnderwritingCase,
  saveApartmentOperations,
  saveUnderwritingCostSchedule,
  type CaseDraft,
} from "./cases";
import { parseApartmentOperations } from "./operations-input";
import { InvalidCostSchedule, parseCostSchedule } from "./schedule-input";
import { monthlyInputsFor, runUnderwritingCase } from "./runs";

/*
 * LA-1839. Milestones and anchors go through the real migrations: a save writes the milestones,
 * the anchor columns and the resolved months, a read gives them back, and a run saves both.
 */

let db: Awaited<ReturnType<typeof seededDatabase>>;

const draft: CaseDraft = {
  name: "Milestone case",
  address: "100 Test Avenue",
  proposedUnits: 48,
  grossBuildingSquareFeet: 52000,
  assumptions: { purchasePrice: 4_200_000, constructionMonths: 20 },
};

const milestones = [
  { id: "land-close", name: "Land Close", month: "2026-01" },
  { id: "construction-start", name: "Construction Start", month: "2026-03" },
  { id: "first-units", name: "First Units", month: "2027-02" },
  { id: "sale", name: "Sale", month: "2027-12" },
];

function line(id: string, patch: Partial<MonthlyCostLine>): MonthlyCostLine {
  return {
    id,
    name: id,
    category: "hard_cost",
    amount: 1_200_000,
    unit: "usd",
    startMonth: "2026-03",
    endMonth: "2026-08",
    distributionMethod: "straight_line",
    distributionVersion: "straight_line.v1",
    reviewState: "working",
    ...patch,
  };
}

function schedule(patch: Partial<MonthlyCostScheduleInputs> = {}): MonthlyCostScheduleInputs {
  return {
    analysisStartMonth: "2026-01",
    saleMonth: "2027-12",
    saleAnchor: { milestoneId: "sale", offsetMonths: 0 },
    milestones,
    costLines: [
      line("land", {
        category: "land",
        startAnchor: { milestoneId: "land-close", offsetMonths: 0 },
        endAnchor: { milestoneId: "land-close", offsetMonths: 0 },
      }),
      line("hard", {
        startAnchor: { milestoneId: "construction-start", offsetMonths: 0 },
        endAnchor: { milestoneId: "first-units", offsetMonths: -1 },
        distributionMethod: "front_loaded",
        distributionVersion: "front_loaded.quadratic.v1",
      }),
      line("soft", {
        category: "soft_cost",
        startAnchor: { milestoneId: "construction-start", offsetMonths: -2 },
        endAnchor: { durationMonths: 12 },
        distributionMethod: "back_loaded",
        distributionVersion: "back_loaded.quadratic.v1",
      }),
      line("typed", { startMonth: "2026-04", endMonth: "2026-06" }),
    ],
    ...patch,
  };
}

function operations(patch: Record<string, unknown> = {}) {
  return {
    inputVersion: "apartment_operations_inputs.v1",
    operationStartMonth: "2027-02",
    operationStartAnchor: { milestoneId: "first-units", offsetMonths: 0 },
    growthStartMonth: "2027-04",
    growthStartAnchor: { milestoneId: "first-units", offsetMonths: 2 },
    preleasedUnits: 2,
    leaseUpUnitsPerMonth: 4,
    annualIncomeGrowthPercent: 3,
    annualExpenseGrowthPercent: 3,
    rentAdjustmentLossPercent: 0,
    freeRentPercent: 0,
    vacancyPercent: 5,
    creditLossPercent: 1,
    assumptionEvidence: Object.fromEntries([
      "operationStartMonth", "growthStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth",
      "annualIncomeGrowthPercent", "annualExpenseGrowthPercent", "rentAdjustmentLossPercent",
      "freeRentPercent", "vacancyPercent", "creditLossPercent",
    ].map((key) => [key, { reviewState: "working" }])),
    residentialUnitTypes: [{
      id: "one-bedroom", name: "One Bedroom", units: 10, nonRevenueUnits: 0, averageAreaSf: 800,
      monthlyMarketRent: 2_000, sourceLabel: "Program", sourceDate: "2026-08-01", reviewState: "done",
    }],
    otherIncomeLines: [],
    operatingExpenseLines: [],
    capitalExpenditureLines: [],
    ...patch,
  };
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

describe("saving milestones and anchors", () => {
  it("stores milestones, anchors and resolved months, and reads them back", async () => {
    const created = await createUnderwritingCase(db, draft);
    const parsed = parseCostSchedule(schedule());
    const saved = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, parsed);

    expect(saved!.costSchedule).toMatchObject({
      saleMonth: "2027-12",
      saleAnchor: { milestoneId: "sale", offsetMonths: 0 },
      milestones,
    });
    const byId = Object.fromEntries(saved!.costSchedule!.costLines.map((item) => [item.id, item]));
    expect(byId.hard).toMatchObject({
      startMonth: "2026-03",
      endMonth: "2027-01",
      startAnchor: { milestoneId: "construction-start", offsetMonths: 0 },
      endAnchor: { milestoneId: "first-units", offsetMonths: -1 },
      distributionMethod: "front_loaded",
    });
    expect(byId.soft).toMatchObject({
      startMonth: "2026-01",
      endMonth: "2026-12",
      startAnchor: { milestoneId: "construction-start", offsetMonths: -2 },
      endAnchor: { durationMonths: 12 },
      distributionMethod: "back_loaded",
    });
    expect(byId.typed.startAnchor).toBeUndefined();
    expect(byId.typed.endAnchor).toBeUndefined();
    expect(await getUnderwritingCase(db, created!.id)).toEqual(saved);
  });

  it("moves every anchored line when a milestone moves and leaves typed lines alone", async () => {
    const created = await createUnderwritingCase(db, draft);
    const first = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, parseCostSchedule(schedule()));
    const moved = schedule({ milestones: milestones.map((item) => item.id === "construction-start" ? { ...item, month: "2026-06" } : item) });
    const second = await saveUnderwritingCostSchedule(db, created!.id, first!.caseRevision, parseCostSchedule(moved));
    const byId = Object.fromEntries(second!.costSchedule!.costLines.map((item) => [item.id, item]));
    expect(byId.hard).toMatchObject({ startMonth: "2026-06", endMonth: "2027-01" });
    expect(byId.soft).toMatchObject({ startMonth: "2026-04", endMonth: "2027-03" });
    expect(byId.land).toMatchObject({ startMonth: "2026-01", endMonth: "2026-01" });
    expect(byId.typed).toMatchObject({ startMonth: "2026-04", endMonth: "2026-06" });
    expect(second!.costSchedule!.milestones!.find(({ id }) => id === "construction-start")!.month).toBe("2026-06");
  });

  it("drops removed milestones and clears anchors that are removed from a line", async () => {
    const created = await createUnderwritingCase(db, draft);
    const first = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, parseCostSchedule(schedule()));
    const typedOnly = schedule({
      saleAnchor: undefined,
      milestones: undefined,
      costLines: [line("hard", { startMonth: "2026-03", endMonth: "2027-01" })],
    });
    const second = await saveUnderwritingCostSchedule(db, created!.id, first!.caseRevision, parseCostSchedule(typedOnly));
    expect(second!.costSchedule!.milestones).toBeUndefined();
    expect(second!.costSchedule!.saleAnchor).toBeUndefined();
    expect(second!.costSchedule!.costLines).toHaveLength(1);
    expect(second!.costSchedule!.costLines[0].startAnchor).toBeUndefined();
    const { rows } = await db.query<{ count: string }>(`select count(*) from underwriting_case_milestones where case_id = $1`, [created!.id]);
    expect(Number(rows[0].count)).toBe(0);
  });

  it("treats a cleared anchor sent as null the same as an absent one", () => {
    const body = { ...schedule(), costLines: [line("hard", { startAnchor: null as never, endAnchor: null as never })] };
    expect(parseCostSchedule(body).costLines[0].startAnchor).toBeUndefined();
  });

  it("rejects each named failure at save, before anything is stored", () => {
    const failure = (body: MonthlyCostScheduleInputs) => {
      try {
        parseCostSchedule(body);
      } catch (cause) {
        if (cause instanceof InvalidCostSchedule) return cause.issues.map(({ code }) => code);
        throw cause;
      }
      return [];
    };
    expect(failure(schedule({ costLines: [line("hard", { startAnchor: { milestoneId: "gone", offsetMonths: 0 } })] }))).toEqual(["missing_milestone"]);
    expect(failure(schedule({ costLines: [line("hard", { startAnchor: { milestoneId: "land-close", offsetMonths: -3 } })] }))).toEqual(["anchor_outside_timeline"]);
    expect(failure(schedule({ costLines: [line("hard", {
      startAnchor: { milestoneId: "first-units", offsetMonths: 0 },
      endAnchor: { milestoneId: "construction-start", offsetMonths: 0 },
    })] }))).toEqual(["anchor_end_before_start"]);
  });

  it("refuses to store a front-loaded line against the wrong distribution version", async () => {
    const created = await createUnderwritingCase(db, draft);
    await expect(db.query(
      `insert into underwriting_case_cost_lines
         (case_id, id, line_order, name, category, amount, unit, start_month, end_month,
          distribution_method, distribution_version, review_state)
       values ($1, 'x', 0, 'X', 'hard_cost', 100, 'usd', '2026-01-01', '2026-02-01',
               'front_loaded', 'back_loaded.quadratic.v1', 'working')`,
      [created!.id],
    )).rejects.toThrow();
  });
});

describe("running a case with anchors", () => {
  async function savedCase() {
    const created = await createUnderwritingCase(db, draft);
    const scheduled = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, parseCostSchedule(schedule()));
    const costSchedule = monthlyInputsFor(scheduled!.costSchedule!);
    return saveApartmentOperations(
      db,
      created!.id,
      scheduled!.caseRevision,
      parseApartmentOperations(operations(), costSchedule),
    );
  }

  it("stores operation and growth anchors and shows the month they resolve to now", async () => {
    const saved = await savedCase();
    expect(saved!.apartmentOperations).toMatchObject({
      operationStartMonth: "2027-02",
      operationStartAnchor: { milestoneId: "first-units", offsetMonths: 0 },
      growthStartMonth: "2027-04",
      growthStartAnchor: { milestoneId: "first-units", offsetMonths: 2 },
    });
    const moved = schedule({ milestones: milestones.map((item) => item.id === "first-units" ? { ...item, month: "2027-05" } : item) });
    const second = await saveUnderwritingCostSchedule(db, saved!.id, saved!.caseRevision, parseCostSchedule(moved));
    // The operations were saved once with typed months of 2027-02 and 2027-04. A read follows the milestone.
    expect(second!.apartmentOperations).toMatchObject({ operationStartMonth: "2027-05", growthStartMonth: "2027-07" });
  });

  it("saves the anchor and the resolved month in the run, and the trace names the milestone", async () => {
    const saved = await savedCase();
    const run = await runUnderwritingCase(db, saved!.id, saved!.caseRevision);
    expect(run).toMatchObject({ status: "complete", issues: [] });
    const snapshot = run!.inputSnapshot;
    expect(snapshot).toMatchObject({
      operationStartMonth: "2027-02",
      operationStartAnchor: { milestoneId: "first-units", offsetMonths: 0 },
      growthStartMonth: "2027-04",
      saleMonth: "2027-12",
      saleAnchor: { milestoneId: "sale", offsetMonths: 0 },
      milestones,
    });
    expect(snapshot.costLines!.find(({ id }) => id === "hard")).toMatchObject({
      startMonth: "2026-03",
      endMonth: "2027-01",
      startAnchor: { milestoneId: "construction-start", offsetMonths: 0 },
    });
    const hard = run!.apartmentOperationsResult!.costSchedule.costLineSchedules.find(({ lineId }) => lineId === "hard")!;
    expect(hard.formulaTrace).toContain("Construction Start (2026-03)");
    expect(hard.formulaTrace).toContain("First Units (2027-02)");
    expect(run!.apartmentOperationsResult!.anchors).toEqual([
      expect.objectContaining({ path: "operationStartMonth", milestoneName: "First Units", month: "2027-02" }),
      expect.objectContaining({ path: "growthStartMonth", milestoneName: "First Units", month: "2027-04" }),
    ]);
    expect(run!.evidenceSnapshot.costSchedule!.milestones).toEqual(milestones);
  });

  it("fails the run with a named issue when a milestone an operations date points to was removed", async () => {
    const saved = await savedCase();
    const withoutFirstUnits = schedule({
      milestones: milestones.filter(({ id }) => id !== "first-units"),
      costLines: [line("land", { startMonth: "2026-01", endMonth: "2026-01" })],
    });
    const second = await saveUnderwritingCostSchedule(db, saved!.id, saved!.caseRevision, parseCostSchedule(withoutFirstUnits));
    const run = await runUnderwritingCase(db, saved!.id, second!.caseRevision);
    expect(run!.status).toBe("failed");
    expect(run!.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "missing_milestone", path: "operationStartAnchor.milestoneId" })]));
  });
});
