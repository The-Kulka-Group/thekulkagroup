import {expect, test} from "@playwright/test";

test("keeps one live source feedback region mounted while the picker opens and closes", async ({page}) => {
  await page.goto("/vision");

  const liveRegion = page.locator("#vision-source-picker-feedback");
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveAttribute("data-panel-open", "false");
  const liveRegionHandle = await liveRegion.elementHandle();
  expect(liveRegionHandle).not.toBeNull();

  await page.getByRole("button", {name: /Sources/}).click();

  await expect(page.locator("#vision-source-picker-panel")).toBeVisible();
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveAttribute("data-panel-open", "true");
  expect(await liveRegionHandle!.evaluate(node => node.isConnected && node === document.querySelector("#vision-source-picker-feedback"))).toBe(true);

  await page.getByRole("button", {name: "Done"}).click();

  await expect(page.locator("#vision-source-picker-panel")).toHaveCount(0);
  await expect(liveRegion).toHaveCount(1);
  await expect(liveRegion).toHaveAttribute("data-panel-open", "false");
  expect(await liveRegionHandle!.evaluate(node => node.isConnected && node === document.querySelector("#vision-source-picker-feedback"))).toBe(true);
});
