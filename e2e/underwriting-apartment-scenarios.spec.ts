import { expect, test } from "@playwright/test";

test("saves apartment scenario deltas and reopens the comparison run", async ({ page, request }) => {
  test.setTimeout(120_000);
  const create = await request.post("/api/underwriting/cases", { data: { name: "Synthetic scenario browser test", address: "170 Test Avenue" } });
  expect(create.status()).toBe(201);
  const { case: created } = await create.json();
  const schedule = await request.put(`/api/underwriting/cases/${created.id}/schedule`, { data: { expectedRevision: created.caseRevision, analysisStartMonth: "2026-01", saleMonth: "2026-12", costLines: [{ id: "land", name: "Land", category: "land", amount: 1_000_000, unit: "usd", startMonth: "2026-01", endMonth: "2026-01", distributionMethod: "straight_line", distributionVersion: "straight_line.v1", sourceLabel: "Synthetic browser fixture", sourceDate: "2026-09-02", reviewState: "done" }] } });
  expect(schedule.status(), await schedule.text()).toBe(200);
  const scheduled = (await schedule.json()).case;
  const operations = await request.put(`/api/underwriting/cases/${created.id}/operations`, { data: { expectedRevision: scheduled.caseRevision, inputVersion: "apartment_operations_inputs.v1", operationStartMonth: "2026-01", growthStartMonth: "2026-01", preleasedUnits: 10, leaseUpUnitsPerMonth: 1, annualIncomeGrowthPercent: 3, annualExpenseGrowthPercent: 2, rentAdjustmentLossPercent: 0, freeRentPercent: 0, vacancyPercent: 5, creditLossPercent: 0, assumptionEvidence: operationsEvidence(), residentialUnitTypes: [{ id: "unit", name: "Unit", units: 10, nonRevenueUnits: 0, averageAreaSf: 800, monthlyMarketRent: 2_000, sourceLabel: "Synthetic browser fixture", sourceDate: "2026-09-02", reviewState: "done" }], otherIncomeLines: [], operatingExpenseLines: [], capitalExpenditureLines: [] } });
  expect(operations.status(), await operations.text()).toBe(200);
  const operating = (await operations.json()).case;
  const capital = await request.put(`/api/underwriting/cases/${created.id}/capital`, { data: { expectedRevision: operating.caseRevision, capitalInputVersion: "development_capital_inputs.v1", targetDebtSharePercent: 65, annualInterestRatePercent: 8, loanFeePercent: 1, fundingOrder: "equity_first.v1", interestTreatment: "capitalized_net_operating_cash.v1", interestConvention: "opening_balance_monthly.v1", feeMonth: "2026-01", payoffMonth: "2026-12", capitalAssumptionEvidence: capitalEvidence() } });
  expect(capital.status(), await capital.text()).toBe(200);
  const capitalized = (await capital.json()).case;
  const sale = await request.put(`/api/underwriting/cases/${created.id}/returns`, { data: { expectedRevision: capitalized.caseRevision, saleInputVersion: "property_returns_inputs.v1", terminalCapRatePercent: 5.75, sellingCostPercent: 1.5, forwardNoiConvention: "forward_twelve_month_noi.v1", cashFlowDateConvention: "month_end_dates.v1", xirrConvention: "xirr_actual_365.v1", saleAssumptionEvidence: saleEvidence() } });
  expect(sale.status(), await sale.text()).toBe(200);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/underwriting/${created.id}`);
  const downsideVacancy = page.getByLabel("Downside Vacancy value");
  await expect(page.getByLabel("Downside Vacancy source label")).toHaveAttribute("maxlength", "500");
  await page.locator("#scenario-downside-name").fill("Higher Vacancy");
  await downsideVacancy.fill("101");
  const invalidResponse = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${created.id}/scenarios`));
  await page.getByRole("button", { name: "Save Scenarios" }).click();
  expect((await invalidResponse).status()).toBe(400);
  await expect(downsideVacancy).toHaveAttribute("aria-invalid", "true");
  // LA-1944: the field shows the error and the save message names it too.
  await expect(page.getByText(/Vacancy Percent must be no more than 100 percent/)).toHaveCount(2);
  await expect(page.getByText(/^Review the scenario inputs and try again\. .*Vacancy Percent must be no more than 100 percent/)).toBeVisible();
  await page.locator("#scenario-downside-name").fill("Higher Vacancy");
  await downsideVacancy.fill("8");
  await page.getByLabel("Downside Vacancy source label").fill("Market study");
  await page.getByLabel("Downside Vacancy source date").fill("2026-09-02");
  await page.getByLabel("Downside Vacancy review state").selectOption("done");
  await page.locator("#scenario-upside-name").fill("Lower Terminal Cap");
  await page.getByLabel("Upside Terminal Cap Rate value").fill("5");
  await page.getByLabel("Upside Terminal Cap Rate source label").fill("Broker opinion");
  await page.getByLabel("Upside Terminal Cap Rate source date").fill("2026-09-02");
  await page.getByLabel("Upside Terminal Cap Rate review state").selectOption("done");
  const saveResponse = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${created.id}/scenarios`));
  await page.getByRole("button", { name: "Save Scenarios" }).click();
  const savedResponse = await saveResponse;
  const savedBody = await savedResponse.json();
  expect(savedResponse.status(), JSON.stringify(savedBody)).toBe(200);
  await expect(page.locator(".underwriting-run-action")).toHaveAttribute("data-case-revision", String(savedBody.case.caseRevision));
  const runResponse = page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(`/api/underwriting/cases/${created.id}/runs`));
  await page.getByRole("button", { name: "Run calculation" }).click();
  expect((await runResponse).status()).toBe(201);
  await expect(page.getByRole("heading", { name: "Scenario Comparison" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Current Reviewed Inputs" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Downside: Higher Vacancy" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Downside Vacancy value")).toHaveValue("8");
  await page.getByRole("link", { name: "Current revision" }).click();
  await expect(page.getByText("Saved Results and Formulas", { exact: true })).toBeVisible();
  // LA-2055: the run page folds the input and evidence snapshots until the viewer opens them.
  await page.getByRole("button", { name: "Expand Full Calculation Input Snapshot" }).click();
  await page.getByRole("button", { name: "Expand Saved Evidence Snapshot" }).click();
  await expect(page.getByText("vacancyPercent: 8")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved Scenario Evidence" })).toBeVisible();
  const evidenceRow = page.getByRole("row").filter({ hasText: "Higher Vacancy" }).filter({ hasText: "Market study" });
  await expect(evidenceRow).toContainText("2026-09-02");
  await expect(evidenceRow).toContainText("Done");
  await expect(evidenceRow.locator("td").nth(4)).not.toHaveText("Missing");
  await page.setViewportSize({ width: 375, height: 812 });
  const table = await page.locator(".underwriting-results-wrap").filter({ has: page.locator(".underwriting-scenario-comparison") }).first().evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(table.scrollWidth).toBeGreaterThan(table.clientWidth);
});

function item() { return { sourceLabel: "Synthetic browser fixture", sourceDate: "2026-09-02", reviewState: "done" }; }
function operationsEvidence() { return { operationStartMonth: item(), growthStartMonth: item(), preleasedUnits: item(), leaseUpUnitsPerMonth: item(), annualIncomeGrowthPercent: item(), annualExpenseGrowthPercent: item(), rentAdjustmentLossPercent: item(), freeRentPercent: item(), vacancyPercent: item(), creditLossPercent: item() }; }
function capitalEvidence() { return { targetDebtSharePercent: item(), annualInterestRatePercent: item(), loanFeePercent: item(), fundingOrder: item(), interestTreatment: item(), interestConvention: item(), feeMonth: item(), payoffMonth: item() }; }
function saleEvidence() { return { saleMonth: item(), terminalCapRatePercent: item(), sellingCostPercent: item(), forwardNoiConvention: item(), cashFlowDateConvention: item(), xirrConvention: item() }; }
