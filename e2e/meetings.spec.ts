import { expect, test } from "@playwright/test";

// LA-2280, LA-2287. The Meetings page against the synthetic Fireflies meetings
// in lib/browser-test-db.ts: the week at a glance, sentiment on each row, and
// the open meeting's summary and analytics.

test("Meetings shows sentiment at a glance and opens a meeting's analytics", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/meetings");

  await expect(page.getByRole("heading", { name: "Meetings", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /Meetings/ }).first()).toBeVisible();

  // This week at a glance names the most negative meeting.
  const glance = page.getByRole("region", { name: "This Week at a Glance" });
  await expect(glance).toContainText("Synthetic Job Owner Meeting");
  await expect(glance).toContainText("34% negative");

  // Every row carries its sentiment, newest first, and the newest is open.
  await expect(page.getByRole("img", { name: "30% positive, 58% neutral, 12% negative" }).first()).toBeVisible();
  const detail = page.getByRole("article", { name: "Synthetic Job Weekly OAC" });
  await expect(detail.getByRole("region", { name: "Meeting at a Glance" })).toContainText("12% Negative");
  await expect(detail.getByText("Synthetic overview: the team reviewed the schedule")).toBeVisible();
  await expect(detail.getByRole("row", { name: "Example Architect Answer the roof drain RFIs" })).toBeVisible();
  await expect(detail.getByRole("region", { name: "Analytics" })).toContainText("Example PM");
  await expect(detail.getByRole("region", { name: "Analytics" })).toContainText("Example Architect joined 9 min late.");
  await expect(detail.getByRole("link", { name: "Open Transcript in Fireflies" })).toHaveAttribute(
    "href",
    "https://app.fireflies.ai/view/SYNTH-FF-1",
  );

  await page.screenshot({ path: "/tmp/kulka-playwright-results/la-2280-first.png" });

  // Picking the other meeting opens it.
  await page.getByRole("link", { name: /Synthetic Job Owner Meeting/ }).last().click();
  await expect(page.getByRole("article", { name: "Synthetic Job Owner Meeting" })).toContainText("34% Negative");

  await page.screenshot({ path: "/tmp/kulka-playwright-results/la-2280-open.png" });

  // Search narrows the list.
  await page.getByRole("searchbox", { name: "Search" }).fill("window delivery");
  await page.getByRole("searchbox", { name: "Search" }).press("Enter");
  await expect(page.getByRole("link", { name: /Synthetic Job Weekly OAC/ })).toHaveCount(0);
  await page.screenshot({ path: "/tmp/kulka-playwright-results/la-2280-meetings.png", fullPage: true });

  // At phone width the page stacks with no sideways scroll.
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/meetings");
  await expect(page.getByRole("article", { name: "Synthetic Job Weekly OAC" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
});
