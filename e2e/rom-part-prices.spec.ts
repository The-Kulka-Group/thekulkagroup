import { expect, test } from "@playwright/test";
import type { Rom } from "@kulka/engine";

import { BROWSER_TEST_ROM_PROJECT_ID } from "../lib/browser-test-db";
import { rateUsd, usd } from "../lib/format/usd";
import { partPrices, type PricedPart } from "../lib/rom/part-prices";
import { type StageFacts, stageBuilding } from "../lib/rom/stage-model";

// LA-2211. A saved run's Building View, picked part by part. The detail the
// page shows must be what the part price map says for that part. The run is
// the synthetic browser-test project (lib/browser-test-db.ts): 100,000 SF,
// four stories, and one site line, Sitework, at a proposed $8 per SF.

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

async function expectDetail(page: import("@playwright/test").Page, part: PricedPart) {
  const detail = page.locator(`.stg-pick[data-part="${part.part}"]`);
  await expect(detail).toBeVisible();
  await expect(detail.locator(".stg-pick-name")).toHaveText(part.name);
  await expect(detail.locator(".stg-pick-total")).toHaveText(part.total === null ? "Not Priced" : usd(part.total));
  if (part.perGsf !== null) await expect(detail.locator(".stg-pick-psf")).toHaveText(`${rateUsd(part.perGsf)} per GSF`);
  await expect(detail.locator(".chip")).toHaveText(part.source);
  await expect(detail.locator(".stg-pick-math li")).toHaveText(part.math);
}

test("picks a part of the saved budget's building and shows what the part price map says it costs", async ({ page, request }) => {
  const run = await request.post("/api/rom", { data: { projectId: BROWSER_TEST_ROM_PROJECT_ID } });
  expect(run.status(), await run.text()).toBe(200);
  const { rom } = (await run.json()) as { rom: Rom };
  const map = partPrices({ rom, facts, building: stageBuilding(facts, []) });
  const site = map.parts.find((one) => one.part === "site")!;
  // The fixture's one site line, priced the way its benchmark says.
  expect(site.math).toContain("Sitework: 100,000 SF x $8.00 per SF (AI Figure)");
  expect(site.source).toBe("Placeholder Rate");

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/rom?project=${BROWSER_TEST_ROM_PROJECT_ID}`);
  await page.getByRole("button", { name: "Open the Building View" }).click();

  // Picked from the row of parts beneath the model.
  const pill = page.locator('.stg-parts [data-part="site"]');
  await pill.click();
  await expect(pill).toHaveAttribute("aria-pressed", "true");
  await expectDetail(page, site);

  // The same pick again clears it.
  await pill.click();
  await expect(page.locator(".stg-pick")).toHaveCount(0);

  // Picked on the model itself: the middle of the view is the building.
  const canvas = page.locator("canvas.stg-cv");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  const picked = page.locator(".stg-pick");
  await expect(picked).toBeVisible();
  const part = await picked.getAttribute("data-part");
  const expected = map.parts.find((one) => one.part === part);
  expect(expected, `picked ${part}`).toBeDefined();
  await expectDetail(page, expected!);

  // A part nothing prices reads Not Priced, never $0.
  for (const one of map.parts.filter((p) => p.unpriced)) {
    await expect(page.locator(`.stg-parts [data-part="${one.part}"] .stg-part-p`)).toHaveText("Not Priced");
  }
});
