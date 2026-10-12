import { expect, test } from "@playwright/test";

// LA-2209 story 45, review S5. At phone width New Budget's building, its
// questions and the live list stack one above the other, and the page never
// scrolls sideways.

test("stacks the building, the questions and the list at 375 px with no sideways scroll", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/rom?new=1");

  const setup = page.getByRole("region", { name: "Project Setup" });
  await setup.getByRole("textbox").nth(0).fill("Phone Width Check");
  const selects = setup.locator("select");
  await selects.nth(0).selectOption({ label: "Multifamily" });
  await selects.nth(1).selectOption({ label: "New Construction" });
  const boxes = setup.getByRole("textbox");
  await boxes.nth(1).fill("100000");
  await boxes.nth(2).fill("5");
  await boxes.nth(3).fill("100");
  await page.getByRole("button", { name: "None", exact: true }).click();
  await expect(page.locator(".nb-q .nb-prompt")).toBeVisible();

  const building = page.locator("section.hs");
  const questions = page.locator(".nb-q");
  const list = page.locator(".lb").first();
  for (const one of [building, questions, list]) await expect(one).toBeVisible();

  // Nothing runs past the right edge.
  const widths = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, view: window.innerWidth }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.view);

  // Each sits inside the screen's width, and no two share a band of height.
  const placed = await Promise.all([building, questions, list].map(async (one) => (await one.boundingBox())!));
  for (const box of placed) {
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(375 + 0.5);
  }
  const byTop = [...placed].sort((a, b) => a.y - b.y);
  for (let i = 1; i < byTop.length; i++) {
    expect(byTop[i].y).toBeGreaterThanOrEqual(byTop[i - 1].y + byTop[i - 1].height - 0.5);
  }
});
