import { expect, test } from "@playwright/test";

test("saves, calculates, reloads, and reopens monthly development capital", async ({ page, request }) => {
  const create = await request.post("/api/underwriting/cases", {
    data: { name: "Synthetic development capital browser test", address: "920 Test Avenue" },
  });
  expect(create.status()).toBe(201);
  const { case: createdCase } = await create.json();

  const schedule = await request.put(`/api/underwriting/cases/${createdCase.id}/schedule`, {
    data: {
      expectedRevision: createdCase.caseRevision,
      analysisStartMonth: "2026-01",
      saleMonth: "2026-12",
      costLines: [{
        id: "land",
        name: "Land",
        category: "land",
        amount: 1_000_000,
        unit: "usd",
        startMonth: "2026-01",
        endMonth: "2026-01",
        distributionMethod: "straight_line",
        distributionVersion: "straight_line.v1",
        sourceLabel: "Synthetic browser fixture",
        sourceDate: "2026-09-02",
        reviewState: "done",
      }],
    },
  });
  expect(schedule.status(), await schedule.text()).toBe(200);
  const { case: scheduledCase } = await schedule.json();

  const operations = await request.put(`/api/underwriting/cases/${createdCase.id}/operations`, {
    data: {
      expectedRevision: scheduledCase.caseRevision,
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
      assumptionEvidence: operationsEvidence(),
      residentialUnitTypes: [{
        id: "one-bedroom",
        name: "One Bedroom",
        units: 10,
        nonRevenueUnits: 0,
        averageAreaSf: 800,
        monthlyMarketRent: 2_000,
        sourceLabel: "Synthetic browser fixture",
        sourceDate: "2026-09-02",
        reviewState: "done",
      }],
      otherIncomeLines: [],
      operatingExpenseLines: [],
      capitalExpenditureLines: [],
    },
  });
  expect(operations.status(), await operations.text()).toBe(200);
  const { case: operatingCase } = await operations.json();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/underwriting/${createdCase.id}`);
  await expect(page.getByLabel("Annual Interest Rate source label", { exact: true })).toHaveAttribute("maxlength", "500");
  await page.locator("#capital-target-debt-share").fill("101");
  await page.locator("#capital-annual-interest-rate").fill("8");
  await page.locator("#capital-loan-fee").fill("1");
  await page.getByRole("button", { name: "Save Capital Plan" }).click();
  await expect(page.locator("#capital-target-debt-share")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#capital-target-debt-share")).toHaveAttribute("aria-describedby", "capital-target-debt-share-error");
  await expect(page.locator("#capital-target-debt-share-error")).toContainText("0 to 100");

  await page.locator("#capital-target-debt-share").fill("65");
  const savedResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/capital`));
  await page.getByRole("button", { name: "Save Capital Plan" }).click();
  const capitalResponse = await savedResponse;
  const capitalBody = await capitalResponse.json();
  expect(capitalResponse.status(), JSON.stringify(capitalBody)).toBe(200);
  expect(capitalBody.case.caseRevision).toBe(operatingCase.caseRevision + 1);
  await expect(page.locator(".underwriting-run-action")).toHaveAttribute(
    "data-case-revision",
    String(capitalBody.case.caseRevision),
  );

  const runResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/runs`));
  await page.getByRole("button", { name: "Run calculation" }).click();
  expect((await runResponse).status()).toBe(201);
  await expect(page.getByText("The saved results are ready for review.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monthly funding and debt balance" })).toBeVisible();
  await expect(page.getByText("Debt Before Reserves").first()).toBeVisible();
  await expect(page.getByText("Operating Shortfall Reserve").first()).toBeVisible();
  await expect(page.getByText("Closing Debt").first()).toBeVisible();
  await expect(page.getByText("Total sources equal total uses")).toBeVisible();

  await page.reload();
  await expect(page.locator("#capital-target-debt-share")).toHaveValue("65");
  await expect(page.locator("#capital-annual-interest-rate")).toHaveValue("8");
  await page.getByRole("link", { name: "Current revision" }).click();
  await expect(page.getByText("Saved results and formulas", { exact: true })).toBeVisible();
  await expect(page.getByText("Capital Input Version")).toBeVisible();
  await expect(page.getByText("Saved Capital Assumption")).toBeVisible();
  await expect(page.getByText("Closing construction debt equals zero after the payoff month")).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  const narrowTable = await page.locator(".underwriting-results-wrap")
    .filter({ has: page.locator(".underwriting-capital-results") })
    .evaluate((node) => ({ clientWidth: node.clientWidth, scrollWidth: node.scrollWidth }));
  expect(narrowTable.scrollWidth).toBeGreaterThan(narrowTable.clientWidth);
});

function operationsEvidence() {
  const item = () => ({
    sourceLabel: "Synthetic browser fixture",
    sourceDate: "2026-09-02",
    reviewState: "done",
  });
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
