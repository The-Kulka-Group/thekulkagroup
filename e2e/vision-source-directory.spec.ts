import {expect, test} from "@playwright/test";

test("shows joined source coverage and filters to a clear empty result", async ({page}) => {
  await page.goto("/vision/sources");

  const coverage = page.getByLabel("Long Island source coverage");
  await expect(coverage).toContainText("111local jurisdictions69 Nassau · 42 Suffolk");
  await expect(coverage).toContainText("116directory sources5 county-level · 111 local");
  await expect(coverage).toContainText("4collectable sources");
  await expect(page.getByText(/official source routes, not projects/i)).toBeVisible();
  await expect(page.locator(".vision-directory-card")).toHaveCount(116);

  await page.getByRole("combobox", {name: "Location", exact: true}).selectOption("Suffolk:village:Poquott");
  await expect(page.locator(".vision-directory-card")).toHaveCount(1);
  await expect(page.getByRole("heading", {name: "Poquott board agenda"})).toBeVisible();
  await expect(page.getByText("What this source publishes")).toBeVisible();
  await expect(page.getByText("Manual step or access need")).toBeVisible();
  await expect(page.getByRole("link", {name: "Open official source"})).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByText("Checked September 9, 2026")).toBeVisible();

  await page.getByRole("combobox", {name: "County", exact: true}).selectOption("Nassau");
  await expect(page.getByRole("heading", {name: "No sources match these filters."})).toBeVisible();
  await expect(page.getByText("Change or clear a filter to see more official sources.")).toBeVisible();
});

test("keeps the coverage view usable at 375px", async ({page}) => {
  await page.setViewportSize({width: 375, height: 812});
  await page.goto("/vision/sources");

  await expect(page.getByLabel("Long Island source coverage")).toBeVisible();
  await expect(page.getByRole("combobox", {name: "Location", exact: true})).toBeVisible();
  await page.getByRole("combobox", {name: "Access", exact: true}).selectOption("automated");
  await expect(page.locator(".vision-directory-card")).toHaveCount(4);
  await expect(page.getByText("4 of 116 sources shown")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
