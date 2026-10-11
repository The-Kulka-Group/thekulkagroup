import { expect, test } from "@playwright/test";

test("saves, runs, reloads, and reopens monthly apartment operations", async ({ page, request }) => {
  const create = await request.post("/api/underwriting/cases", {
    data: {
      name: "Synthetic apartment operations browser test",
      address: "901 Test Avenue",
    },
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
  expect(schedule.status()).toBe(200);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/underwriting/${createdCase.id}`);
  await expect(page.locator(".underwriting-operations-editor")).toHaveAttribute("data-client-ready", "true");
  await page.getByRole("button", { name: "Add Unit Type" }).click();
  const invalidSave = page.waitForResponse((response) =>
    response.request().method() === "PUT"
    && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/operations`));
  await page.getByRole("button", { name: "Save Operations" }).click();
  expect((await invalidSave).status()).toBe(400);

  const operationStart = page.locator("#apartment-operations-operationStartMonth");
  await expect(operationStart).toHaveAttribute("id", "apartment-operations-operationStartMonth");
  await expect(operationStart).toHaveAttribute("aria-invalid", "true");
  await expect(operationStart).toHaveAttribute("aria-describedby", "apartment-operations-operationStartMonth-error");
  await expect(page.locator("#apartment-operations-operationStartMonth-error")).toContainText("YYYY-MM");
  const unitName = page.locator("#apartment-operations-residentialUnitTypes-0-name");
  await expect(unitName).toHaveAttribute("id", "apartment-operations-residentialUnitTypes-0-name");
  await expect(unitName).toHaveAttribute("aria-invalid", "true");
  await expect(unitName).toHaveAttribute("aria-describedby", "apartment-operations-residentialUnitTypes-0-name-error");
  await expect(page.getByLabel("Line source label", { exact: true })).toHaveAttribute("id", "apartment-operations-residentialUnitTypes-0-sourceLabel");
  await expect(page.getByLabel("Line source label", { exact: true })).toHaveAttribute("aria-invalid", "false");
  await expect(page.getByLabel("Line source date", { exact: true })).toHaveAttribute("id", "apartment-operations-residentialUnitTypes-0-sourceDate");
  await expect(page.getByLabel("Line review state", { exact: true })).toHaveAttribute("id", "apartment-operations-residentialUnitTypes-0-reviewState");
  await expect(page.getByRole("spinbutton", { name: "Rent Adjustment Loss %", exact: true })).toHaveValue("0");
  await expect(page.getByRole("spinbutton", { name: "Free Rent %", exact: true })).toHaveValue("0");
  await expect(page.getByLabel("Unit type 1 non-revenue units", { exact: true })).toHaveValue("0");

  await page.locator("#apartment-operations-operationStartMonth").fill("2026-02");
  await page.locator("#apartment-operations-growthStartMonth").fill("2026-02");
  await page.locator("#apartment-operations-preleasedUnits").fill("2");
  await page.locator("#apartment-operations-leaseUpUnitsPerMonth").fill("4");
  await page.locator("#apartment-operations-annualIncomeGrowthPercent").fill("3");
  await page.locator("#apartment-operations-annualExpenseGrowthPercent").fill("3");
  await page.locator("#apartment-operations-vacancyPercent").fill("5");
  await page.locator("#apartment-operations-creditLossPercent").fill("1");
  await page.locator("#apartment-operations-residentialUnitTypes-0-name").fill("One Bedroom");
  await page.locator("#apartment-operations-residentialUnitTypes-0-units").fill("10");
  await page.locator("#apartment-operations-residentialUnitTypes-0-averageAreaSf").fill("800");
  await page.locator("#apartment-operations-residentialUnitTypes-0-nonRevenueUnits").fill("0");
  await page.locator("#apartment-operations-residentialUnitTypes-0-monthlyMarketRent").fill("2000");

  const saveResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT"
    && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/operations`));
  await page.getByRole("button", { name: "Save Operations" }).click();
  const savedOperations = await saveResponse;
  const savedOperationsBody = await savedOperations.json();
  expect(savedOperations.status(), JSON.stringify(savedOperationsBody)).toBe(200);

  // LA-2054: the review list holds one collapsed row per input, so open the group first.
  await page.locator(".underwriting-review-group").filter({ hasText: "Apartment Operations" }).locator("summary").click();
  await expect(page.getByText("One Bedroom: No Source Label", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Vacancy Percent: No Source Label", { exact: false }).first()).toBeVisible();
  const runResponse = page.waitForResponse((response) =>
    response.request().method() === "POST"
    && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/runs`));
  await page.getByRole("button", { name: "Run calculation" }).click();
  expect((await runResponse).status()).toBe(201);

  await expect(page.getByText("The saved results are ready for review.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Monthly apartment operations results" })).toBeVisible();
  await expect(page.locator(".underwriting-operations-results")).toContainText("2026-02");
  await expect(page.locator(".underwriting-operations-results")).toContainText("$20,000");
  await expect(page.getByText("Effective Gross Revenue", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("First Stabilized Month", { exact: true }).first()).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Operation Start Month", { exact: true })).toHaveValue("2026-02");
  await expect(page.getByLabel("One Bedroom units", { exact: true })).toHaveValue("10");
  await expect(page.getByRole("spinbutton", { name: "Rent Adjustment Loss %", exact: true })).toHaveValue("0");
  await expect(page.getByRole("spinbutton", { name: "Free Rent %", exact: true })).toHaveValue("0");
  await expect(page.getByLabel("One Bedroom non-revenue units", { exact: true })).toHaveValue("0");
  await expect(page.getByText("The saved results are ready for review.")).toBeVisible();
  await page.locator(".underwriting-review-group").filter({ hasText: "Apartment Operations" }).locator("summary").click();
  await expect(page.getByText("One Bedroom: No Source Label", { exact: false }).first()).toBeVisible();

  await page.getByRole("link", { name: "Current revision" }).click();
  await expect(page.getByText("Saved Results and Formulas", { exact: true })).toBeVisible();
  // LA-2055: the run page folds the input and evidence snapshots until the viewer opens them.
  await page.getByRole("button", { name: "Expand Full Calculation Input Snapshot" }).click();
  await page.getByRole("button", { name: "Expand Saved Evidence Snapshot" }).click();
  await page.locator("summary", { hasText: "Formula Traces" }).click();
  await expect(page.getByText("Total Potential Income", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved Evidence Snapshot" })).toBeVisible();
  await expect(page.getByText("Missing").first()).toBeVisible();
});
