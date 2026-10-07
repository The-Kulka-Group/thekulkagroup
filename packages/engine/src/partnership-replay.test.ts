import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE } from "./fixtures/apartment-development-model-v2.98-returns";
import {
  APARTMENT_DEVELOPMENT_V2_98_ASSET_MANAGEMENT_FEE,
  APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP,
  APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED,
} from "./fixtures/apartment-development-model-v2.98-partnership";
import { runPartnershipWaterfall } from "./partnership-waterfall";
import { calculatePropertyReturns } from "./property-returns";
import { xirr } from "./xirr";

/*
 * LA-1863: the v2.98 public sample's single promote, replayed on the workbook's own levered cash flow.
 * This checks the waterfall rules apart from any gap in the engine's property cash flow. The terms and
 * the asset management fee the workbook pays the GP before the waterfall are described in the fixture.
 * The engine has no fee module, so the replay takes the fee off the cash the waterfall sees and adds it
 * to the GP here.
 */

const PLAN = APARTMENT_DEVELOPMENT_V2_98_PARTNERSHIP;
const { monthly: ASSET_MANAGEMENT_FEE, firstMonthIndex: FIRST_FEE_MONTH_INDEX } = APARTMENT_DEVELOPMENT_V2_98_ASSET_MANAGEMENT_FEE;
const EXPECTED = APARTMENT_DEVELOPMENT_V2_98_WATERFALL_EXPECTED;

describe("partnership waterfall replay: v2.98 single promote", () => {
  const fixture = APARTMENT_DEVELOPMENT_V2_98_RETURNS_FIXTURE;
  const property = calculatePropertyReturns(fixture.months, fixture.forwardSalePeriod, fixture.plan).result!;
  const fee = (index: number) => (index >= FIRST_FEE_MONTH_INDEX ? ASSET_MANAGEMENT_FEE : 0);
  const run = runPartnershipWaterfall(property.months.map((month, index) => ({
    month: month.month,
    date: month.date,
    leveredCashFlow: Math.round((month.leveredCashFlow - fee(index)) * 100) / 100,
    equityContribution: Math.max(-month.leveredCashFlow, 0),
  })), PLAN);

  it("reconciles the replay to the cash it was given", () => {
    expect(run.status, JSON.stringify(run.issues)).toBe("complete");
    expect(run.reconciliations.filter(({ status }) => status === "fail")).toEqual([]);
  });

  it("matches the workbook's LP and GP XIRR", () => {
    const rows = run.result!.months;
    const lp = xirr(rows.map((row) => ({ date: row.date, amountCents: Math.round(row.lpNetCashFlow * 100) })));
    const gp = xirr(rows.map((row, index) => ({ date: row.date, amountCents: Math.round((row.gpNetCashFlow + fee(index)) * 100) })));
    expect(lp.status).toBe("ok");
    expect(gp.status).toBe("ok");
    if (lp.status !== "ok" || gp.status !== "ok") return;
    expect(lp.rate).toBeCloseTo(EXPECTED.lpNetXirr, 6);
    expect(gp.rate).toBeCloseTo(EXPECTED.gpNetXirr, 6);
    // Without the fee the engine's own LP figure is the same flow.
    expect(run.result!.lp.xirr).toBeCloseTo(EXPECTED.lpNetXirr, 6);
  });

  it("distributes the workbook's total once the fee is added back", () => {
    const fees = property.months.reduce((total, _, index) => total + fee(index), 0);
    expect(run.result!.lp.distributions + run.result!.gp.distributions + fees).toBeCloseTo(EXPECTED.distributionTotal, 0);
  });
});
