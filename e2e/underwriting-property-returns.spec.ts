import { expect, test } from "@playwright/test";

test("saves, calculates, reloads, and reopens property sale returns", async ({ page, request }) => {
  test.setTimeout(120_000);
  const create = await request.post("/api/underwriting/cases", { data: { name: "Synthetic property returns browser test", address: "921 Test Avenue" } });
  expect(create.status()).toBe(201);
  const { case: createdCase } = await create.json();
  const schedule = await request.put(`/api/underwriting/cases/${createdCase.id}/schedule`, { data: {
    expectedRevision: createdCase.caseRevision, analysisStartMonth: "2026-01", saleMonth: "2026-12",
    costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", sourceLabel: "Synthetic browser fixture", sourceDate: "2026-09-02", reviewState: "done" }],
  } });
  expect(schedule.status(), await schedule.text()).toBe(200);
  const { case: scheduledCase } = await schedule.json();
  const operations = await request.put(`/api/underwriting/cases/${createdCase.id}/operations`, { data: {
    expectedRevision: scheduledCase.caseRevision, inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01",
    preleasedUnits: 10, leaseUpUnitsPerMonth: 1, annualIncomeGrowthPercent: 0, annualExpenseGrowthPercent: 0, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 0, creditLossPercent: 0,
    assumptionEvidence: operationsEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, sourceLabel: "Synthetic browser fixture", sourceDate: "2026-09-02", reviewState: "done" }],
    otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [],
  } });
  expect(operations.status(), await operations.text()).toBe(200);
  const { case: operatingCase } = await operations.json();
  const capital = await request.put(`/api/underwriting/cases/${createdCase.id}/capital`, { data: {
    expectedRevision: operatingCase.caseRevision, capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1,
    fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1", feeMonth: "2026-01", payoffMonth: "2026-12", capitalAssumptionEvidence: capitalEvidence(),
  } });
  expect(capital.status(), await capital.text()).toBe(200);
  const { case: capitalCase } = await capital.json();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/underwriting/${createdCase.id}`);
  await expect(page.getByLabel("Terminal Cap Rate source label", { exact: true })).toHaveAttribute("maxlength", "500");
  await page.locator("#returns-terminal-cap-rate").fill("0");
  await page.locator("#returns-selling-cost").fill("1.5");
  const invalidResponse = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/returns`));
  await page.getByRole("button", { name: "Save Sale Plan" }).click();
  expect((await invalidResponse).status()).toBe(400);
  await expect(page.locator("#returns-terminal-cap-rate")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#returns-terminal-cap-rate-error")).toContainText("greater than zero");

  await page.locator("#returns-terminal-cap-rate").fill("5.75");
  for (const label of ["Sale Month", "Terminal Cap Rate", "Selling Costs", "Forward NOI Period", "Cash Flow Dates", "XIRR Convention"]) {
    await page.getByLabel(`${label} source label`, { exact: true }).fill("Synthetic browser fixture");
    await page.getByLabel(`${label} source date`, { exact: true }).fill("2026-09-02");
    await page.getByLabel(`${label} review state`, { exact: true }).selectOption("done");
  }
  const saveResponse = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/returns`));
  await page.getByRole("button", { name: "Save Sale Plan" }).click();
  const saleResponse = await saveResponse;
  const saleBody = await saleResponse.json();
  expect(saleResponse.status(), JSON.stringify(saleBody)).toBe(200);
  expect(saleBody.case.caseRevision).toBe(capitalCase.caseRevision + 1);
  await expect(page.locator(".underwriting-run-action")).toHaveAttribute("data-case-revision", String(saleBody.case.caseRevision));

  const runResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/runs`));
  await page.getByRole("button", { name: "Run calculation" }).click();
  expect((await runResponse).status()).toBe(201);
  await expect(page.getByText("The saved results are ready for review.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Dated Monthly Property Cash Flow" })).toBeVisible();
  await expect(page.getByText("Unlevered XIRR").first()).toBeVisible();
  await expect(page.getByText("Levered XIRR").first()).toBeVisible();
  await expect(page.getByText("Equity Sale Proceeds").first()).toBeVisible();

  await page.reload();
  await expect(page.locator("#returns-terminal-cap-rate")).toHaveValue("5.75");
  await expect(page.locator("#returns-selling-cost")).toHaveValue("1.5");
  await page.getByRole("link", { name: "Current revision" }).click();
  await expect(page.getByText("Saved Results and Formulas", { exact: true })).toBeVisible();
  await expect(page.getByText("Sale Input Version")).toBeVisible();
  await expect(page.getByText("Saved Sale Assumption")).toBeVisible();
  await expect(page.getByText("2026-12 unlevered cash flow equals operating cash and sale proceeds less project costs")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const narrowTable = await page.locator(".underwriting-results-wrap").filter({ has: page.locator(".underwriting-property-cash-flow") }).evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(narrowTable.scrollWidth).toBeGreaterThan(narrowTable.clientWidth);
});

function evidence() { return { sourceLabel: "Synthetic browser fixture", sourceDate: "2026-09-02", reviewState: "done" }; }
function operationsEvidence() { return { operationStartMonth: evidence(), growthStartMonth: evidence(), preleasedUnits: evidence(), leaseUpUnitsPerMonth: evidence(), annualIncomeGrowthPercent: evidence(), annualExpenseGrowthPercent: evidence(), rentAdjustmentLossPercent: evidence(), freeRentPercent: evidence(), vacancyPercent: evidence(), creditLossPercent: evidence() }; }
function capitalEvidence() { return { targetDebtSharePercent: evidence(), annualInterestRatePercent: evidence(), loanFeePercent: evidence(), fundingOrder: evidence(), interestTreatment: evidence(), interestConvention: evidence(), feeMonth: evidence(), payoffMonth: evidence() }; }
