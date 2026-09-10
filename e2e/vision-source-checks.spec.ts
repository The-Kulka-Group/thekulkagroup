import {expect, test, type Page, type Route} from "@playwright/test";

const selectedSources = ["nassau-applications", "suffolk-planning", "nassau-ida", "suffolk-ida"];
const emptyInbox = (outcomes: Record<string, string | null> = {}) => ({
  sources: Object.fromEntries(selectedSources.map(id => [id, {
    last_checked_at: null,
    last_success_at: null,
    last_error: null,
    last_outcome: outcomes[id] ?? null,
    record_count: 0,
    coverage: null,
    running: false,
  }])),
  sourceErrors: {},
  candidates: [],
  applicationTypes: [],
});

async function mockVisionChecks(page: Page) {
  let oneSourceRun = 0;
  let releaseRequest: (() => void) | undefined;
  await page.context().addCookies([{name: "vision-sources", value: `v1:${selectedSources.join(",")}`, url: "http://127.0.0.1:3188"}]);
  await page.route("**/api/vision/opportunities", route => route.fulfill({json: {opportunities: []}}));
  await page.route("**/api/vision/discovery**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "GET") {
      await route.fulfill({json: emptyInbox()});
      return;
    }
    await new Promise<void>(resolve => { releaseRequest = resolve; });
    if (url.searchParams.get("source") === "all") {
      await route.fulfill({json: {mode: "all", results: [
        {sourceId: "nassau-applications", outcome: "completed", count: 3, error: null},
        {sourceId: "suffolk-planning", outcome: "skipped", count: 0, error: null},
        {sourceId: "nassau-ida", outcome: "blocked", count: 0, error: "A source check is already running."},
        {sourceId: "suffolk-ida", outcome: "failed", count: 0, error: "The source check failed. Earlier source records remain available."},
      ]}});
      return;
    }
    oneSourceRun++;
    await route.fulfill({json: oneSourceRun === 1
      ? {sourceId: "nassau-applications", outcome: "completed", count: 2, error: null}
      : {sourceId: "nassau-applications", outcome: "completed_empty", count: 0, error: null}});
  });
  return {
    async release() {
      await expect.poll(() => Boolean(releaseRequest)).toBe(true);
      releaseRequest!();
      releaseRequest = undefined;
    },
  };
}

for (const viewport of [{name: "desktop", width: 1280, height: 900}, {name: "375 px", width: 375, height: 812}]) {
  test(`shows one-source and all-source run outcomes at ${viewport.name}`, async ({page}) => {
    await page.setViewportSize({width: viewport.width, height: viewport.height});
    const checks = await mockVisionChecks(page);
    await page.goto("/vision/discover");

    const nassau = page.locator(".discovery-source-check").filter({hasText: "Nassau planning applications"});
    const checkNassau = nassau.getByRole("button", {name: "Check this source"});
    await checkNassau.click();
    await expect(nassau.getByRole("status")).toHaveText("Checking this source…");
    await checks.release();
    await expect(nassau.getByRole("status")).toHaveText("The check returned 2 records. Existing review choices stay unchanged.");

    await checkNassau.click();
    await expect(nassau.getByRole("status")).toHaveText("Checking this source…");
    await checks.release();
    await expect(nassau.getByRole("status")).toHaveText("The check completed with no records. Earlier source records remain available.");

    await page.getByRole("button", {name: "Check all enabled sources"}).click();
    await expect(page.getByText("Checking this source…")).toHaveCount(4);
    await checks.release();
    await expect(page.getByText("The check returned 3 records. Existing review choices stay unchanged.")).toBeVisible();
    await expect(page.getByText("The source check was skipped.")).toBeVisible();
    await expect(page.getByText("A source check is already running.")).toBeVisible();
    await expect(page.getByText("The source check failed. Earlier source records remain available.")).toBeVisible();
    await expect(page.getByText("The enabled source checks finished with separate results.")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
  });
}
