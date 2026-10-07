import { expect, test } from "@playwright/test";

test("saves, calculates, reloads, and reopens a monthly cost schedule", async ({ page, request }) => {
  const create = await request.post("/api/underwriting/cases", {
    data: {
      name: "Synthetic monthly schedule browser test",
      address: "900 Test Avenue",
    },
  });
  expect(create.status()).toBe(201);
  const { case: savedCase } = await create.json();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`/underwriting/${savedCase.id}`);
  const scheduleEditor = page.locator(".underwriting-cost-editor");
  await expect(scheduleEditor).toHaveAttribute("data-client-ready", "true");
  await page.locator("#cost-schedule-analysis-start-month").fill("2026-01");
  await page.locator("#cost-schedule-sale-month").fill("2026-12");
  await expect(page.locator("#cost-schedule-analysis-start-month")).toHaveValue("2026-01");
  await expect(page.locator("#cost-schedule-sale-month")).toHaveValue("2026-12");
  await page.getByRole("button", { name: "Add Cost Line" }).click();

  await page.getByRole("button", { name: "Save Schedule" }).click();
  await expect(page.locator("#cost-line-0-name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.locator("#cost-line-0-name")).toHaveAttribute("aria-describedby", "cost-line-0-name-error");
  await expect(page.locator("#cost-line-0-name-error")).toContainText("required");
  await expect(page.locator("#cost-line-0-amount")).toHaveAttribute("aria-invalid", "true");

  await fillLine(page, 0, { name: "Land", category: "land", amount: "1000000", start: "2026-01", end: "2026-01" });
  for (let index = 1; index < 4; index += 1) {
    await page.getByRole("button", { name: "Add Cost Line" }).click();
  }
  await fillLine(page, 1, { name: "Hard Cost", category: "hard_cost", amount: "2000000", start: "2026-02", end: "2026-10", distribution: "s_curve", source: "Synthetic browser fixture", sourceDate: "2026-09-02" });
  await fillLine(page, 2, { name: "Soft Cost", category: "soft_cost", amount: "300000", start: "2026-02", end: "2026-10", source: "Synthetic browser fixture" });
  await fillLine(page, 3, { name: "Development Fee", category: "development_fee", amount: "100000", start: "2026-02", end: "2026-10", source: "Synthetic browser fixture" });

  const editorScroll = await page.locator(".underwriting-edit-table-wrap")
    .filter({ has: page.locator(".underwriting-cost-lines") }).evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(editorScroll.scrollWidth).toBeGreaterThan(editorScroll.clientWidth);

  const savedResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${savedCase.id}/schedule`));
  await page.getByRole("button", { name: "Save Schedule" }).click();
  const scheduleResponse = await savedResponse;
  const scheduleResponseBody = await scheduleResponse.json();
  expect(scheduleResponse.status(), JSON.stringify(scheduleResponseBody)).toBe(200);
  await expect(page.getByText("Land needs a source label.")).toBeVisible();

  const projectRevision = scheduleResponseBody.case.caseRevision + 1;
  await page.locator("#cost-line-1-amount").fill("2050000");
  await page.locator("#underwriting-proposedUnits").fill("72");
  const savedFactsResponse = page.waitForResponse((response) =>
    response.request().method() === "PATCH" && response.url().endsWith(`/api/underwriting/cases/${savedCase.id}`));
  await page.getByRole("button", { name: "Save and recalculate" }).click();
  const factsResponse = await savedFactsResponse;
  expect(factsResponse.status(), JSON.stringify(await factsResponse.json())).toBe(200);
  await expect(scheduleEditor).toHaveAttribute("data-expected-revision", String(projectRevision));
  await expect(page.locator("#cost-line-1-amount")).toHaveValue("2050000");
  await saveSchedule(page, savedCase.id);
  await expect(page.locator("#cost-line-1-amount")).toHaveValue("2050000");

  await page.locator("#cost-line-1-reviewState").selectOption("done");
  await saveSchedule(page, savedCase.id);
  await expect(page.locator("#cost-line-1-reviewState")).toHaveValue("done");
  await page.locator("#cost-line-1-amount").fill("2100000");
  const finalSchedule = await saveSchedule(page, savedCase.id);
  await expect(page.locator("#cost-line-1-reviewState")).toHaveValue("working");
  await expect(page.locator(".underwriting-run-action")).toHaveAttribute(
    "data-case-revision",
    String(finalSchedule.case.caseRevision),
  );

  const runResponse = page.waitForResponse((response) =>
    response.request().method() === "POST" && response.url().endsWith(`/api/underwriting/cases/${savedCase.id}/runs`));
  await page.getByRole("button", { name: "Run calculation" }).click();
  expect((await runResponse).status()).toBe(201);
  await expect(page.getByText("The saved results are ready for review.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Monthly uses" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Aggregate formula traces" })).toBeVisible();
  await expect(page.getByText("$3,500,000").first()).toBeVisible();

  await page.reload();
  await expect(page.locator("#cost-line-0-name")).toHaveValue("Land");
  await expect(page.getByText("The saved results are ready for review.")).toBeVisible();
  await page.getByRole("link", { name: "Current revision" }).click();
  await expect(page.getByText("Saved Results and Formulas", { exact: true })).toBeVisible();
  await expect(page.getByText("Aggregate Result")).toBeVisible();
  await expect(page.getByText("Missing").first()).toBeVisible();

  await page.goBack();
  await page.setViewportSize({ width: 375, height: 812 });
  await page.reload();
  await expect(page.getByText("Land needs a source label.")).toBeVisible();
  const narrowLayout = await page.evaluate(() => ({
    bodyWidth: document.body.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
  }));
  expect(narrowLayout.bodyWidth).toBeLessThanOrEqual(narrowLayout.viewportWidth);
  const narrowTable = await page.locator(".underwriting-results-wrap").filter({ has: page.locator(".underwriting-monthly-table") }).evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth,
  }));
  expect(narrowTable.scrollWidth).toBeGreaterThan(narrowTable.clientWidth);
});

async function fillLine(
  page: import("@playwright/test").Page,
  index: number,
  input: {
    name: string;
    category: string;
    amount: string;
    start: string;
    end: string;
    distribution?: string;
    source?: string;
    sourceDate?: string;
  },
) {
  await page.locator(`#cost-line-${index}-name`).fill(input.name);
  await page.locator(`#cost-line-${index}-category`).selectOption(input.category);
  await page.locator(`#cost-line-${index}-amount`).fill(input.amount);
  await page.locator(`#cost-line-${index}-startMonth`).fill(input.start);
  await page.locator(`#cost-line-${index}-endMonth`).fill(input.end);
  if (input.distribution) {
    await page.locator(`#cost-line-${index}-distributionMethod`).selectOption(input.distribution);
  }
  if (input.source) {
    await page.locator(`#cost-line-${index}-sourceLabel`).fill(input.source);
  }
  if (input.sourceDate) {
    const sourceDate = page.locator(`#cost-line-${index}-sourceDate`);
    await sourceDate.fill(input.sourceDate);
    await expect(sourceDate).toHaveValue(input.sourceDate);
  }
}

async function saveSchedule(page: import("@playwright/test").Page, caseId: string) {
  const savedResponse = page.waitForResponse((response) =>
    response.request().method() === "PUT" && response.url().endsWith(`/api/underwriting/cases/${caseId}/schedule`));
  await page.getByRole("button", { name: "Save Schedule" }).click();
  const response = await savedResponse;
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(200);
  return body;
}
