import {expect, test} from "@playwright/test";
import {ACCESS_MODES, filterMunicipalSources} from "../lib/vision/source-directory";
import {VISION_SOURCES} from "../lib/vision/sources";

const expectedCount = (filters: Parameters<typeof filterMunicipalSources>[1]) => filterMunicipalSources(VISION_SOURCES, filters).length;

test("shows joined source coverage and filters to a clear empty result", async ({page}) => {
  await page.goto("/vision/sources");

  const coverage = page.getByLabel("Long Island source coverage");
  await expect(coverage).toContainText("111local jurisdictionsNassau has 69, and Suffolk has 42.");
  await expect(coverage).toContainText("140directory sourcesThere are 5 county sources and 135 local sources.");
  await expect(coverage).toContainText("8collectable sources");
  await expect(page.getByText(/official source routes, not projects/i)).toBeVisible();
  await expect(page.locator(".vision-directory-card")).toHaveCount(140);
  await expect(page.locator(".vision-source-checked")).toHaveCount(140);
  const sourceAccess = page.locator(".vision-source-access").first();
  await expect(sourceAccess).toHaveCSS("min-width", "112px");
  await expect(sourceAccess).toHaveCSS("color", "rgb(50, 51, 56)");
  const sourceUrls = await page.getByRole("link", {name: "Open official source"}).evaluateAll(links => links.map(link => (link as HTMLAnchorElement).href));
  expect(sourceUrls).toEqual(VISION_SOURCES.map(source => source.url));

  const municipalityType = page.getByRole("combobox", {name: "Municipality type", exact: true});
  await municipalityType.selectOption("village");
  await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({jurisdictionType: "village"}));
  await municipalityType.selectOption("");

  const recordType = page.getByRole("combobox", {name: "Record type", exact: true});
  await recordType.selectOption("Building permits");
  await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({recordFamily: "Building permits"}));
  await recordType.selectOption("");

  const access = page.getByRole("combobox", {name: "Access", exact: true});
  for (const mode of ACCESS_MODES) {
    await access.selectOption(mode);
    await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({accessMode: mode}));
    await expect(page.locator(`.vision-directory-card:not([data-access-mode="${mode}"])`)).toHaveCount(0);
  }
  await access.selectOption("");

  await page.getByRole("combobox", {name: "Location", exact: true}).selectOption("Suffolk:village:Poquott");
  await expect(page.locator(".vision-directory-card")).toHaveCount(1);
  await expect(page.getByRole("heading", {name: "Poquott planning and permit records contact"})).toBeVisible();
  await expect(page.getByText("What this source publishes")).toBeVisible();
  await expect(page.getByText("Manual step or access need")).toBeVisible();
  await expect(page.getByRole("link", {name: "Open official source"})).toHaveAttribute("href", /^https:\/\//);
  await expect(page.getByText("We checked this source on September 9, 2026.")).toBeVisible();
  const poquottPopupPromise = page.waitForEvent("popup");
  await page.getByRole("link", {name: "Open official source"}).click();
  const poquottPopup = await poquottPopupPromise;
  await poquottPopup.close();

  await page.getByRole("combobox", {name: "County", exact: true}).selectOption("Nassau");
  await expect(page.getByRole("heading", {name: "No sources match these filters."})).toBeVisible();
  await expect(page.getByText("Change or clear a filter to see more official sources.")).toBeVisible();
});

test("keeps the coverage view usable at 375px", async ({page}) => {
  await page.setViewportSize({width: 375, height: 812});
  await page.goto("/vision/sources");

  await expect(page.getByLabel("Long Island source coverage")).toBeVisible();
  await expect(page.getByRole("link", {name: "Open official source"})).toHaveCount(140);
  await expect(page.locator(".vision-source-checked")).toHaveCount(140);
  const county = page.getByRole("combobox", {name: "County", exact: true});
  await county.selectOption("Nassau");
  await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({county: "Nassau"}));
  await county.selectOption("");

  const location = page.getByRole("combobox", {name: "Location", exact: true});
  await location.selectOption("Nassau:village:Floral Park");
  await expect(page.locator(".vision-directory-card")).toHaveCount(1);
  await expect(page.getByText("We checked this source on September 9, 2026.")).toBeVisible();
  const floralParkPopupPromise = page.waitForEvent("popup");
  await page.getByRole("link", {name: "Open official source"}).click();
  const floralParkPopup = await floralParkPopupPromise;
  await expect(floralParkPopup).toHaveURL("https://floralparkny.gov/board-of-trustees-meeting-minutes/");
  await floralParkPopup.close();
  await location.selectOption("");
  const municipalityType = page.getByRole("combobox", {name: "Municipality type", exact: true});
  await municipalityType.selectOption("town");
  await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({jurisdictionType: "town"}));
  await municipalityType.selectOption("");

  const recordType = page.getByRole("combobox", {name: "Record type", exact: true});
  await recordType.selectOption("Building permits");
  await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({recordFamily: "Building permits"}));
  await recordType.selectOption("");

  const access = page.getByRole("combobox", {name: "Access", exact: true});
  for (const mode of ACCESS_MODES) {
    await access.selectOption(mode);
    await expect(page.locator(".vision-directory-card")).toHaveCount(expectedCount({accessMode: mode}));
  }
  await access.selectOption("automated");
  await expect(page.getByText("The directory shows 8 of 140 sources.")).toBeVisible();
  await access.selectOption("");

  await location.selectOption("Suffolk:village:Poquott");
  await county.selectOption("Nassau");
  await expect(page.getByRole("heading", {name: "No sources match these filters."})).toBeVisible();
  await expect(page.getByText("Change or clear a filter to see more official sources.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
