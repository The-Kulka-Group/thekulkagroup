import { expect, test } from "@playwright/test";

// LA-2213. New Budget's building: an answer moves the budget with no Generate
// button, the running line compares it with the session's first total, and the
// live building opens to pick a part and read its price.

test("New Budget's building picks a part and the running line follows the answers", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/rom?new=1");

  const setup = page.getByRole("region", { name: "Project Setup" });
  await setup.getByRole("textbox").nth(0).fill("Answer Feedback Check");
  const selects = setup.locator("select");
  await selects.nth(0).selectOption({ label: "Multifamily" });
  await selects.nth(1).selectOption({ label: "New Construction" });
  const boxes = setup.getByRole("textbox");
  await boxes.nth(1).fill("100000");
  await boxes.nth(2).fill("5");
  await boxes.nth(3).fill("100");

  // The first answer: no Generate or Run button anywhere, and the line names where the session started.
  await page.getByRole("button", { name: "None", exact: true }).click();
  const running = page.getByTestId("running-change");
  await expect(running).toHaveText(/From Answers · Started at \$/);
  await expect(page.getByRole("button", { name: /^(Generate|Run)/ })).toHaveCount(0);

  // Open the live building and pick a part from the list under the model.
  await page.getByRole("button", { name: "Open the Building View" }).click();
  await expect(page.locator(".stg--live.stg--open")).toBeVisible();
  const pill = page.locator(".stg-parts [data-part]").first();
  const listed = (await pill.locator(".stg-part-p").innerText()).trim();
  await pill.click();
  const detail = page.locator(".stg-pick");
  await expect(detail).toBeVisible();
  // LA-2209 review S4: a part with nothing on it reads No Items on the row and spells it out in the panel.
  await expect(detail.locator(".stg-pick-total")).toHaveText(listed === "No Items" ? "No Items in This Budget" : listed);

  // Pressing the same part again clears it, and Close gives the field back.
  await pill.click();
  await expect(page.locator(".stg-pick")).toHaveCount(0);
  await page.locator(".stg--live .stg-pill--ink").click();
  await expect(page.locator(".stg--live.stg--open")).toHaveCount(0);
});
