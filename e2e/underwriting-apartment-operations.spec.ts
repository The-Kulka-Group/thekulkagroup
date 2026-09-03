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
  await page.getByLabel("Operation start month", { exact: true }).fill("2026-02");
  await page.getByLabel("Growth start month", { exact: true }).fill("2026-02");
  await page.getByLabel("Pre-leased units", { exact: true }).fill("2");
  await page.getByLabel("Lease-up units per month", { exact: true }).fill("4");
  await page.getByRole("spinbutton", { name: "Annual income growth %", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "Annual expense growth %", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "Vacancy %", exact: true }).fill("5");
  await page.getByRole("spinbutton", { name: "Credit loss %", exact: true }).fill("1");
  await page.getByRole("button", { name: "Add Unit Type" }).click();
  await page.getByLabel("Unit type 1 name").fill("One Bedroom");
  await page.getByLabel("One Bedroom units").fill("10");
  await page.getByLabel("One Bedroom average area").fill("800");
  await page.getByLabel("One Bedroom non-revenue units").fill("0");
  await page.getByLabel("One Bedroom monthly market rent").fill("2000");

  const saveResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT"
    && response.url().endsWith(`/api/underwriting/cases/${createdCase.id}/operations`));
  await page.getByRole("button", { name: "Save Operations" }).click();
  const savedOperations = await saveResponse;
  const savedOperationsBody = await savedOperations.json();
  expect(savedOperations.status(), JSON.stringify(savedOperationsBody)).toBe(200);

  await expect(page.getByText("One Bedroom needs a source label.")).toBeVisible();
  await expect(page.getByText("Vacancy Percent needs a source label.")).toBeVisible();
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
  await expect(page.getByLabel("Operation start month", { exact: true })).toHaveValue("2026-02");
  await expect(page.getByLabel("One Bedroom units", { exact: true })).toHaveValue("10");
  await expect(page.getByText("The saved results are ready for review.")).toBeVisible();
  await expect(page.getByText("One Bedroom needs a source label.")).toBeVisible();

  await page.getByRole("link", { name: "Current revision" }).click();
  await expect(page.getByText("Saved results and formulas", { exact: true })).toBeVisible();
  await expect(page.getByText("Total Potential Income", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Saved evidence snapshot" })).toBeVisible();
  await expect(page.getByText("Missing").first()).toBeVisible();
});
