import { expect, test } from "@playwright/test";

// LA-2219. New Budget asks Full or Juliet once the units have balconies, then
// the three balcony facts. Answering Full draws the slabs, the rails and the
// doors on the live building, each priced from the rates the migration seeds.

test("answering Full balconies draws the slabs, rails and doors, each with its price", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/rom?new=1");

  const setup = page.getByRole("region", { name: "Project Setup" });
  await setup.getByRole("textbox").nth(0).fill("Balcony Check");
  const selects = setup.locator("select");
  await selects.nth(0).selectOption({ label: "Multifamily" });
  await selects.nth(1).selectOption({ label: "New Construction" });
  const boxes = setup.getByRole("textbox");
  await boxes.nth(1).fill("100000");
  await boxes.nth(2).fill("5");
  await boxes.nth(3).fill("100");
  // Balconies are a Level 3 question, and New Budget starts at Level 1 (LA-2209 review Q1).
  await page.locator(".nb-level-seg").getByRole("button", { name: "Level 3" }).click();
  await page.getByRole("button", { name: "None", exact: true }).click();

  // Every scope question before it answered No, up to the balconies gate.
  const question = page.locator(".nb-q");
  const prompt = question.locator(".nb-prompt");
  for (let step = 0; step < 20; step++) {
    await expect(prompt).toBeVisible();
    if ((await prompt.innerText()).trim() === "Do the units have balconies?") break;
    const before = await prompt.innerText();
    await question.getByRole("button", { name: "No", exact: true }).click();
    await expect(prompt).not.toHaveText(before);
  }
  await expect(prompt).toHaveText("Do the units have balconies?");
  await question.getByRole("button", { name: "Yes", exact: true }).click();

  // The follow-up, then the three facts.
  await expect(prompt).toHaveText("What kind of balconies do the units have?");
  await expect(question.getByRole("button", { name: "Juliet", exact: true })).toBeVisible();
  await question.getByRole("button", { name: "Full", exact: true }).click();
  for (const [name, value] of [
    ["Balcony Count", "25"],
    ["Deck Area per Balcony", "110"],
    ["Rail per Balcony", "26"],
  ]) {
    await expect(prompt).toHaveText(name);
    await question.getByRole("textbox", { name }).fill(value);
    await question.getByRole("button", { name: "Next" }).click();
  }
  await expect(prompt).not.toHaveText("Rail per Balcony");

  // The live building draws each part, priced, and picking one shows its rate math.
  await page.getByRole("button", { name: "Open the Building View" }).click();
  await expect(page.locator(".stg--live.stg--open")).toBeVisible();
  const parts = page.locator(".stg-parts");
  await expect(parts.locator('[data-part="balconies"] .stg-part-p')).toHaveText("$165,000");
  await expect(parts.locator('[data-part="balconyRail"] .stg-part-p')).toHaveText("$195,000");
  await expect(parts.locator('[data-part="balconyDoors"] .stg-part-p')).toHaveText("$54,213");
  await parts.locator('[data-part="balconyRail"]').click();
  await expect(page.locator('.stg-pick[data-part="balconyRail"] .stg-pick-math li')).toHaveText([
    "Balcony Posts and Rail: 25 Balconies x 26 LF x $300 per LF (Stated Rate, VA)",
  ]);
  await parts.locator('[data-part="balconyDoors"]').click();
  await expect(page.locator('.stg-pick[data-part="balconyDoors"] .stg-pick-math li')).toHaveText([
    "Sliding Doors: 25 Doors x $1,800 to $2,537 per Door (Stated Rate, VA, V64, VR)",
  ]);
});
