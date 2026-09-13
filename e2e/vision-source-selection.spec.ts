import {expect, test} from "@playwright/test";
import {DISCOVERY_SOURCES} from "../lib/vision/discovery-catalog";

const sourceCount=DISCOVERY_SOURCES.length;

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

test("supports source presets, an individual switch, Escape, and focus return", async ({page}) => {
  await page.goto("/vision");

  const trigger = page.getByRole("button", {name: /Sources/});
  await trigger.click();
  const switches = page.getByRole("switch");
  await expect(switches).toHaveCount(sourceCount);

  await page.getByRole("button", {name:"None"}).click();
  await expect(trigger).toContainText("0 on");
  await expect(page.getByRole("button", {name:"None"})).toHaveAttribute("aria-pressed","true");
  for (let index=0;index<sourceCount;index++) await expect(switches.nth(index)).not.toBeChecked();

  await page.getByRole("button", {name:"All"}).click();
  await expect(trigger).toContainText(`${sourceCount} on`);
  await expect(page.getByRole("button", {name:"All"})).toHaveAttribute("aria-pressed","true");
  for (let index=0;index<sourceCount;index++) await expect(switches.nth(index)).toBeChecked();

  await switches.first().click();
  await expect(trigger).toContainText(`${sourceCount-1} on`);
  await expect(switches.first()).not.toBeChecked();

  await page.keyboard.press("Escape");
  await expect(page.locator("#vision-source-picker-panel")).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("changes each map layer from a pressed On pill to an Off pill", async ({page}) => {
  await page.goto("/vision");

  const discoveries = page.getByRole("button", {name:/^Discoveries \d+/});
  const approximate = page.getByRole("button", {name:/^Approximate areas \d+/});
  const tracked = page.getByRole("button", {name:/^Tracked opportunities \d+/});
  const discoveryPins = page.locator(".vision-map-canvas .vision-discovery-pin");
  const approximatePins = page.locator(".vision-map-canvas .vision-approximate-pin");
  const trackedPins = page.locator(".vision-map-canvas .vision-map-pin");
  await expect(discoveries).toHaveAttribute("aria-pressed","true");
  await expect(approximate).toHaveAttribute("aria-pressed","true");
  await expect(tracked).toHaveAttribute("aria-pressed","true");
  await expect(discoveryPins).toHaveCount(1);
  await expect(approximatePins).toHaveCount(2);
  await expect(trackedPins).toHaveCount(1);

  await approximate.click();
  await expect(approximate).toHaveAttribute("aria-pressed","false");
  await expect(approximate).toContainText("Off");
  await expect(approximatePins).toHaveCount(0);
  await expect(discoveryPins).toHaveCount(1);
  await expect(trackedPins).toHaveCount(1);

  await discoveries.click();
  await expect(discoveries).toHaveAttribute("aria-pressed","false");
  await expect(discoveries).toContainText("Off");
  await expect(discoveryPins).toHaveCount(0);
  await expect(trackedPins).toHaveCount(1);

  await tracked.click();
  await expect(tracked).toHaveAttribute("aria-pressed","false");
  await expect(tracked).toContainText("Off");
  await expect(trackedPins).toHaveCount(0);
});

test("keeps discovery filters collapsed until a filter is active", async ({page}) => {
  await page.goto("/vision");
  await expect(page.locator(".vision-discovery-filters")).not.toHaveAttribute("open","");
  await expect(page.locator(".vision-filter-footer")).toBeHidden();

  await page.goto("/vision?applicationType=Agenda&dateMode=known");
  await expect(page.locator(".vision-discovery-filters")).toHaveAttribute("open","");
  await expect(page.locator(".vision-discovery-filters > summary .vision-filter-count")).toHaveText("2");
  await expect(page.locator(".vision-filter-footer")).toBeVisible();
});

test("keeps the map in view without horizontal overflow on desktop and mobile", async ({page}) => {
  await page.setViewportSize({width:1280,height:760});
  await page.goto("/vision");

  const desktop = await page.locator(".vision-map-canvas").evaluate(element => {
    const box = element.getBoundingClientRect();
    return {top:box.top,height:box.height,innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth};
  });
  expect(desktop.scrollWidth).toBe(desktop.innerWidth);
  expect(desktop.top).toBeLessThan(500);
  expect(desktop.height).toBeGreaterThanOrEqual(500);

  await page.setViewportSize({width:375,height:812});
  await page.reload();

  const mobile = await page.locator(".vision-map-canvas").evaluate(element => {
    const box = element.getBoundingClientRect();
    return {top:box.top,height:box.height,innerWidth:window.innerWidth,scrollWidth:document.documentElement.scrollWidth};
  });
  expect(mobile.scrollWidth).toBe(mobile.innerWidth);
  expect(mobile.top).toBeLessThan(812);
  expect(mobile.height).toBeGreaterThanOrEqual(440);
});
