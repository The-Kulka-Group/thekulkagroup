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
  // LA-2282: the Kulka Brief leads; an owner or date nobody said reads Not Stated.
  const brief = detail.getByRole("region", { name: "Kulka Brief" });
  await expect(brief).toContainText("Synthetic decision: the lobby finish selection moved to November.");
  await expect(brief).toContainText("Synthetic risk: two roof drain RFIs are open after ten days.");
  await expect(brief.getByRole("row", { name: "Example PM Send the revised lookahead Friday" })).toBeVisible();
  await expect(brief.getByRole("row", { name: "Not Stated Confirm the elevator cab finish Not Stated" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Synthetic Job Weekly OAC/ }).first()).toContainText("Brief Ready");

  // Fireflies' own summary folds under the brief and opens on request.
  await expect(detail.getByText("Synthetic overview: the team reviewed the schedule")).toBeHidden();
  await detail.getByText("Fireflies Summary").click();
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
  const owner = page.getByRole("article", { name: "Synthetic Job Owner Meeting" });
  await expect(owner).toContainText("34% Negative");
  // No brief yet, so Fireflies' summary shows open.
  await expect(owner.getByRole("region", { name: "Kulka Brief" })).toHaveCount(0);
  await expect(owner.getByText("Synthetic overview: the owner raised concerns")).toBeVisible();

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
