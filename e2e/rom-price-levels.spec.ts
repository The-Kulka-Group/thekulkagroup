import { expect, type Page, test } from "@playwright/test";
import type { Rom } from "@kulka/engine";

import { BROWSER_TEST_ROM_PROJECT_ID } from "../lib/browser-test-db";
import { rateUsd, usd } from "../lib/format/usd";

// LA-2212. A saved run's Building View read at the three price levels. The
// run is the synthetic browser-test project (lib/browser-test-db.ts):
// 100,000 SF, four stories, and one site line, Sitework, which sits on the
// site part.

const dollars = (text: string) => Number(text.replace(/[^0-9.-]/g, ""));

async function rowTotals(page: Page): Promise<number[]> {
  const texts = await page.locator(".stg-rows [data-row] .stg-row-p").allTextContents();
  return texts.filter((text) => text !== "Not Priced").map(dollars);
}

test("reads the saved budget's building at levels 1, 2 and 3 and keeps the list and the stage picked together", async ({ page, request }) => {
  const run = await request.post("/api/rom", { data: { projectId: BROWSER_TEST_ROM_PROJECT_ID } });
  expect(run.status(), await run.text()).toBe(200);
  const { rom } = (await run.json()) as { rom: Rom };
  const total = (rom.total.low + rom.total.high) / 2;

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/rom?project=${BROWSER_TEST_ROM_PROJECT_ID}`);
  await page.getByRole("button", { name: "Open the Building View" }).click();

  const levels = page.getByRole("group", { name: "Price Level" });
  await expect(levels.getByRole("button", { name: "Level 3" })).toHaveAttribute("aria-pressed", "true");

  // Level 1: the whole run as one block at one $/GSF.
  await levels.getByRole("button", { name: "Level 1" }).click();
  const rows = page.locator(".stg-rows [data-row]");
  await expect(rows).toHaveCount(1);
  await expect(rows.first().locator(".stg-row-p")).toHaveText(usd(total));
  await expect(rows.first().locator(".stg-row-psf")).toHaveText(`${rateUsd(total / 100_000)} per GSF`);

  // Every level lists the same run total, to the dollar each row rounds to.
  for (const level of ["Level 2", "Level 3"]) {
    await levels.getByRole("button", { name: level }).click();
    await expect(levels.getByRole("button", { name: level })).toHaveAttribute("aria-pressed", "true");
    const totals = await rowTotals(page);
    expect(totals.length).toBeGreaterThan(1);
    expect(Math.abs(totals.reduce((s, n) => s + n, 0) - total)).toBeLessThanOrEqual(totals.length);
  }

  // A row picked in the list lights its parts; picked again, it clears.
  const sitework = page.locator('.stg-rows [data-row]').filter({ hasText: "Sitework" });
  await sitework.click();
  await expect(sitework).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('.stg-parts [data-part="site"]')).toHaveAttribute("data-lit", "true");
  await expect(page.locator('.stg-parts [data-part="massing"]')).not.toHaveAttribute("data-lit", "true");
  await sitework.click();
  await expect(sitework).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('.stg-parts [data-part="site"]')).not.toHaveAttribute("data-lit", "true");

  // A part picked on the stage marks the rows it sits in, at any level.
  const site = page.locator('.stg-parts [data-part="site"]');
  await site.click();
  await expect(sitework).toHaveAttribute("aria-current", "true");
  await site.click();
  await expect(sitework).not.toHaveAttribute("aria-current", "true");
  await levels.getByRole("button", { name: "Level 1" }).click();
  await site.click();
  await expect(rows.first()).toHaveAttribute("aria-current", "true");
});
