import { expect, test } from "@playwright/test";

// LA-2270. Rob entered 1 SF on a 100-unit job and could not see how to fix it.
// The area check names the typo, the folded setup keeps it in view with an
// Edit Setup button, and correcting the area reprices the live budget.

test("New Budget flags a 1 SF area and corrects it after the first answer", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/rom?new=1");

  const setup = page.getByRole("region", { name: "Project Setup" });
  await setup.getByRole("textbox").nth(0).fill("Area Correction Check");
  const selects = setup.locator("select");
  await selects.nth(0).selectOption({ label: "Multifamily" });
  await selects.nth(1).selectOption({ label: "New Construction" });
  const boxes = setup.getByRole("textbox");
  await boxes.nth(1).fill("1");
  await boxes.nth(2).fill("5");
  await boxes.nth(3).fill("100");
  await expect(setup.getByRole("alert")).toHaveText("That is 0.01 SF per unit. Check Gross Square Feet.");

  // The first answer folds setup; the facts and the warning stay in view.
  await page.getByRole("button", { name: "None", exact: true }).click();
  const summary = page.locator(".nb-sum");
  await expect(summary).toContainText("1 SF · 5 Stories · 100 Units");
  await expect(summary.getByRole("alert")).toContainText("0.01 SF per unit");
  const total = page.locator(".lb-tot .rb-tv");
  const before = await total.innerText();

  // Edit Setup reopens the fields, the corrected area reprices, and the warning clears.
  await summary.getByRole("button", { name: "Edit Setup" }).click();
  await page.getByRole("region", { name: "Project Setup" }).getByRole("textbox").nth(1).fill("100000");
  await expect(page.getByRole("region", { name: "Project Setup" }).getByRole("alert")).toHaveCount(0);
  await expect(total).not.toHaveText(before);
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator(".nb-sum")).toContainText("100,000 SF · 5 Stories · 100 Units");
  await expect(page.locator(".nb-sum").getByRole("alert")).toHaveCount(0);
  await page.screenshot({ path: "/tmp/kulka-playwright-results/la-2270-after.png" });
});
