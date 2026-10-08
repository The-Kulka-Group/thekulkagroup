import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";
import {
  createUnderwritingCase,
  getUnderwritingCase,
  saveApartmentOperations,
  saveUnderwritingCostSchedule,
  type CaseDraft,
} from "./cases";
import { parseApartmentOperations } from "./operations-input";
import { parseCostSchedule } from "./schedule-input";
import { monthlyInputsFor } from "./runs";

/*
 * LA-1871. Commercial spaces save inside the apartment operations JSON, each space and the block
 * keeping its own source and review state, through the real migrations.
 */

let db: Awaited<ReturnType<typeof seededDatabase>>;

const draft: CaseDraft = {
  name: "Commercial case",
  address: "100 Test Avenue",
  proposedUnits: 48,
  grossBuildingSquareFeet: 52000,
  assumptions: { purchasePrice: 4_200_000, constructionMonths: 20 },
};

const milestones = [
  { id: "first-units", name: "First Units", month: "2026-02" },
  { id: "sale", name: "Sale", month: "2026-12" },
];

const schedule = {
  analysisStartMonth: "2026-01",
  saleMonth: "2026-12",
  saleAnchor: { milestoneId: "sale", offsetMonths: 0 },
  milestones,
  costLines: [{ id: "land", name: "Land", category: "land" as const, amount: 1_000_000, unit: "usd" as const, startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line" as const, distributionVersion: "straight_line.v1" as const, reviewState: "working" as const }],
};

const done = { sourceLabel: "Broker opinion", sourceDate: "2026-10-01", reviewState: "done" as const };

function space(id: string, patch: Record<string, unknown> = {}) {
  return {
    id,
    name: id === "retail" ? "Ground Floor Retail" : "Corner Cafe",
    areaSf: 2_500,
    annualRentPerSf: 36,
    leaseStartMonth: "2026-03",
    freeRentMonths: 2,
    recoveries: [{ basis: { kind: "expense_lines", lineIds: ["cam"] }, sharePercent: 20 }],
    tenantImprovementPerSf: 40,
    leasingCommissionPercent: 4,
    leaseTermMonths: 120,
    ...done,
    ...patch,
  };
}

function operations(patch: Record<string, unknown> = {}) {
  return {
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
    assumptionEvidence: Object.fromEntries([
      "operationStartMonth", "growthStartMonth", "preleasedUnits", "leaseUpUnitsPerMonth",
      "annualIncomeGrowthPercent", "annualExpenseGrowthPercent", "rentAdjustmentLossPercent",
      "freeRentPercent", "vacancyPercent", "creditLossPercent",
    ].map((key) => [key, { reviewState: "working" }])),
    residentialUnitTypes: [{ id: "one-bedroom", name: "One Bedroom", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, ...done }],
    otherIncomeLines: [],
    operatingExpenseLines: [{ id: "cam", name: "Common Area Maintenance", amount: 30_000, unit: "usd_per_year", appliesTo: "commercial", ...done }],
    capitalExpenditureLines: [],
    commercial: { spaces: [space("retail"), space("cafe", { recoveries: [], leaseStartMonth: "2026-04" })], vacancyPercent: 10, creditLossPercent: 1, ...done },
    ...patch,
  };
}

async function savedCase() {
  const created = await createUnderwritingCase(db, draft);
  const scheduled = await saveUnderwritingCostSchedule(db, created!.id, created!.caseRevision, parseCostSchedule(schedule));
  return scheduled!;
}

async function save(current: Awaited<ReturnType<typeof savedCase>>, body: Record<string, unknown>) {
  const costSchedule = monthlyInputsFor(current.costSchedule!);
  const saved = await saveApartmentOperations(db, current.id, current.caseRevision, parseApartmentOperations(body, costSchedule));
  expect(saved).not.toBeNull();
  return saved!;
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db?.close();
});

describe("saving commercial spaces on a case", () => {
  it("stores the block with the operations, reads it back unchanged and needs no migration", async () => {
    const saved = await save(await savedCase(), operations());
    expect(saved.apartmentOperations!.commercial!.spaces.map(({ id }) => id)).toEqual(["retail", "cafe"]);
    expect(saved.apartmentOperations!.commercial).toMatchObject({ vacancyPercent: 10, creditLossPercent: 1, reviewState: "done" });
    expect(saved.apartmentOperations!.operatingExpenseLines[0].appliesTo).toBe("commercial");
    expect(await getUnderwritingCase(db, saved.id)).toEqual(saved);
  });

  it("keeps review on an unchanged block and resets only the space whose terms or source changed", async () => {
    const first = await save(await savedCase(), operations());
    const same = await save(first, operations());
    expect(same.apartmentOperations!.commercial!.spaces.map(({ reviewState }) => reviewState)).toEqual(["done", "done"]);
    expect(same.apartmentOperations!.commercial!.reviewState).toBe("done");

    const changed = await save(same, operations({
      commercial: { spaces: [space("retail", { annualRentPerSf: 38 }), space("cafe", { recoveries: [], leaseStartMonth: "2026-04" })], vacancyPercent: 10, creditLossPercent: 1, ...done },
    }));
    const [retail, cafe] = changed.apartmentOperations!.commercial!.spaces;
    expect(retail.reviewState).toBe("working");
    expect(cafe.reviewState).toBe("done");
    expect(changed.apartmentOperations!.commercial!.reviewState).toBe("done");

    const relabeled = await save(changed, operations({
      commercial: { spaces: [space("retail", { annualRentPerSf: 38 }), space("cafe", { recoveries: [], leaseStartMonth: "2026-04", sourceLabel: "Revised opinion" })], vacancyPercent: 10, creditLossPercent: 1, ...done },
    }));
    expect(relabeled.apartmentOperations!.commercial!.spaces[1].reviewState).toBe("working");
  });

  it("resets the block, and not the spaces, when commercial vacancy changes", async () => {
    const first = await save(await savedCase(), operations());
    const changed = await save(first, operations({
      commercial: { ...operations().commercial, vacancyPercent: 12 },
    }));
    expect(changed.apartmentOperations!.commercial!.reviewState).toBe("working");
    expect(changed.apartmentOperations!.commercial!.spaces.map(({ reviewState }) => reviewState)).toEqual(["done", "done"]);
  });

  it("resets only the expense line whose Applies To choice changed", async () => {
    const first = await save(await savedCase(), operations({
      operatingExpenseLines: [
        { id: "cam", name: "Common Area Maintenance", amount: 30_000, unit: "usd_per_year", appliesTo: "commercial", ...done },
        { id: "insurance", name: "Insurance", amount: 50_000, unit: "usd_per_year", ...done },
      ],
    }));
    const changed = await save(first, operations({
      operatingExpenseLines: [
        { id: "cam", name: "Common Area Maintenance", amount: 30_000, unit: "usd_per_year", appliesTo: "commercial", ...done },
        { id: "insurance", name: "Insurance", amount: 50_000, unit: "usd_per_year", appliesTo: "commercial", ...done },
      ],
    }));
    expect(changed.apartmentOperations!.operatingExpenseLines.map(({ reviewState }) => reviewState)).toEqual(["done", "working"]);
  });

  it("drops the block when it is removed", async () => {
    const first = await save(await savedCase(), operations());
    const { commercial: _commercial, ...rest } = operations();
    void _commercial;
    const removed = await save(first, { ...rest, operatingExpenseLines: [] });
    expect(removed.apartmentOperations).not.toHaveProperty("commercial");
  });

  it("moves an anchored lease start when its milestone moves", async () => {
    const first = await save(await savedCase(), operations({
      commercial: { spaces: [space("retail", { leaseStartMonth: "2026-04", leaseStartAnchor: { milestoneId: "first-units", offsetMonths: 2 } })], vacancyPercent: 10, creditLossPercent: 1, ...done },
    }));
    expect(first.apartmentOperations!.commercial!.spaces[0].leaseStartMonth).toBe("2026-04");
    const moved = await saveUnderwritingCostSchedule(db, first.id, first.caseRevision, parseCostSchedule({
      ...schedule,
      milestones: milestones.map((item) => item.id === "first-units" ? { ...item, month: "2026-05" } : item),
    }));
    expect(moved!.apartmentOperations!.commercial!.spaces[0].leaseStartMonth).toBe("2026-07");
    expect(moved!.apartmentOperations!.commercial!.spaces[0].leaseStartAnchor).toEqual({ milestoneId: "first-units", offsetMonths: 2 });
  });
});
