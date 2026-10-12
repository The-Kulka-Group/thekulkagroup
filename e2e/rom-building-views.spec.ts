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

// LA-2209 review Q5. A project on poor soil with hydraulic elevators: in the
// Assembled view the piles and the jacks sit below grade, under the ground
// plane, and a click on the model still picks them.
test("keeps the piles and the hydraulic jacks pickable under the Assembled ground plane", async ({ page, request }) => {
  // The sweep below reads the model point by point.
  test.setTimeout(180_000);
  const created = await request.post("/api/rom/projects", {
    data: {
      name: "Deep Foundation Check",
      grossSquareFeet: 100_000,
      projectType: "multifamily",
      constructionKind: "new",
      parkingType: "none",
      storiesAboveGrade: 4,
      unitCount: 120,
      buildingCount: 1,
      elevatorCount: 2,
      laborType: "open_shop",
    },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const { projectId } = (await created.json()) as { projectId: string };
  const run = await request.post("/api/rom", { data: { projectId, gates: { site_conditions: "yes", elevator: "yes" } } });
  expect(run.status(), await run.text()).toBe(200);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`/rom?project=${projectId}`);
  await page.getByRole("button", { name: "Open the Building View" }).click();
  await expect(page.locator("section.stg")).toHaveAttribute("data-view", "assembled");
  for (const part of ["piles", "elevatorJack"]) await expect(page.locator(`.stg-parts [data-part="${part}"]`)).toBeVisible();

  // Zoom in so the parts below grade are big enough to find.
  const canvas = page.locator("canvas.stg-cv");
  await canvas.focus();
  for (let i = 0; i < 4; i++) await page.keyboard.press("+");

  // Find a part under the pointer the way hovering does, in the page, at
  // every point where the model itself is on top (the list and the controls
  // float over the canvas), then pick it there with a real click.
  const pickOnModel = async (part: string) => {
    const spot = await canvas.evaluate(async (el, wanted) => {
      const frame = () => new Promise((done) => requestAnimationFrame(() => setTimeout(done, 0)));
      const r = el.getBoundingClientRect();
      for (let y = r.top + 2; y < r.bottom - 2; y += 4) {
        for (let x = r.left + 2; x < r.right - 2; x += 4) {
          if (document.elementFromPoint(x, y) !== el) continue;
          el.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse", isPrimary: true }));
          await frame();
          if (document.querySelector(`.stg-parts [data-part="${wanted}"]`)?.getAttribute("data-lit") === "true") return { x, y };
        }
      }
      return null;
    }, part);
    expect(spot, `${part} under the pointer`).not.toBeNull();
    await page.mouse.click(spot!.x, spot!.y);
    await expect(page.locator(".stg-pick")).toHaveAttribute("data-part", part);
    await page.keyboard.press("Escape");
    await expect(page.locator(".stg-pick")).toHaveCount(0);
  };

  // The piles show through the cut corner, under the ground plane, which
  // takes no pointer, so they pick the same as a part above grade.
  await pickOnModel("piles");
  // The jacks sit in the ground under the shafts, inside the site block, so
  // the model shows them only where a cut reaches a shaft. They still pick
  // from the row in the Assembled view.
  await page.locator('.stg-parts [data-part="elevatorJack"]').click();
  await expect(page.locator(".stg-pick")).toHaveAttribute("data-part", "elevatorJack");
  await expect(page.locator(".stg-pick .stg-pick-total")).toHaveText("$280,000");
});
