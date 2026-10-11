import { expect, type Page, test } from "@playwright/test";
import type { Rom } from "@kulka/engine";

import { BROWSER_TEST_ROM_PROJECT_ID } from "../lib/browser-test-db";
import { usd } from "../lib/format/usd";
import { type PartPriceMap, partPrices } from "../lib/rom/part-prices";
import { type StageFacts, stageBuilding } from "../lib/rom/stage-model";

// LA-2217. The saved budget's Building View switches between Assembled and
// Opened, and a part picks the same way in both. The run is the synthetic
// browser-test project (lib/browser-test-db.ts): 100,000 SF and four stories.

const facts: StageFacts = {
  grossSquareFeet: 100_000,
  stories: 4,
  unitCount: 120,
  buildingCount: 1,
  parkingType: null,
  elevatorCount: 2,
  belowGrade: false,
  balconies: false,
  retail: false,
};

/** Clicks the middle of the model and checks the picked part's panel against the part price map. */
async function pickOnModel(page: Page, map: PartPriceMap) {
  const canvas = page.locator("canvas.stg-cv");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const picked = page.locator(".stg-pick");
  await expect(picked).toBeVisible();
  const name = await picked.getAttribute("data-part");
  const expected = map.parts.find((one) => one.part === name);
  expect(expected, `picked ${name}`).toBeDefined();
  await expect(picked.locator(".stg-pick-name")).toHaveText(expected!.name);
  await expect(picked.locator(".stg-pick-total")).toHaveText(
    expected!.unpriced ? "Not Priced" : expected!.empty ? "No Items in This Budget" : usd(expected!.total!),
  );
  // Clear it for the next pick.
  await picked.getByRole("button", { name: "Clear the picked part" }).click();
  await expect(picked).toHaveCount(0);
}

test("switches the Building View between Assembled and Opened, and picks a part in both", async ({ page, request }) => {
  const run = await request.post("/api/rom", { data: { projectId: BROWSER_TEST_ROM_PROJECT_ID } });
  expect(run.status(), await run.text()).toBe(200);
  const { rom } = (await run.json()) as { rom: Rom };
  const map = partPrices({ rom, facts, building: stageBuilding(facts, []) });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/rom?project=${BROWSER_TEST_ROM_PROJECT_ID}`);
  await page.getByRole("button", { name: "Open the Building View" }).click();

  const stage = page.locator("section.stg");
  const views = page.getByRole("group", { name: "View" });
  const assembled = views.getByRole("button", { name: "Assembled" });
  const opened = views.getByRole("button", { name: "Opened" });

  // It opens assembled.
  await expect(assembled).toHaveAttribute("aria-pressed", "true");
  await expect(stage).toHaveAttribute("data-view", "assembled");
  await pickOnModel(page, map);

  // Opened: the stories lift apart, and picking still works, on the model and from the row.
  await opened.click();
  await expect(opened).toHaveAttribute("aria-pressed", "true");
  await expect(stage).toHaveAttribute("data-view", "opened");
  await expect(stage).toHaveAttribute("data-opened", "1");
  await pickOnModel(page, map);
  const site = map.parts.find((one) => one.part === "site")!;
  await page.locator('.stg-parts [data-part="site"]').click();
  await expect(page.locator('.stg-pick[data-part="site"] .stg-pick-name')).toHaveText(site.name);

  // Closing the view puts it back to Assembled.
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Open the Building View" }).click();
  await expect(stage).toHaveAttribute("data-view", "assembled");
});

test("jumps straight to the Opened view when motion is reduced", async ({ page, request }) => {
  const run = await request.post("/api/rom", { data: { projectId: BROWSER_TEST_ROM_PROJECT_ID } });
  expect(run.status(), await run.text()).toBe(200);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/rom?project=${BROWSER_TEST_ROM_PROJECT_ID}`);
  await page.getByRole("button", { name: "Open the Building View" }).click();
  await page.getByRole("group", { name: "View" }).getByRole("button", { name: "Opened" }).click();
  // The animated switch takes 700 ms; reduced motion is there at once.
  await expect(page.locator("section.stg")).toHaveAttribute("data-opened", "1", { timeout: 150 });
});
