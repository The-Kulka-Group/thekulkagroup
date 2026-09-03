import { expect, test } from "@playwright/test";

test("redirects, signs in to a safe return path, and signs out", async ({ page, context }) => {
  await context.addCookies([{
    name: "kulka-test-auth",
    value: "signed-out",
    url: "http://127.0.0.1:3188",
  }]);
  await page.goto("/pursuits");
  await expect(page).toHaveURL(/\/login\?next=%2Fpursuits$/);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByText(/sign up|create account/i)).toHaveCount(0);
  await page.getByLabel("Email").fill("browser-test@kulka.invalid");
  await page.getByLabel("Password").fill("local-browser-test-password");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/pursuits$/);
  await expect(page.getByText("browser-test@kulka.invalid")).toBeVisible();

  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/pursuits");
  await expect(page).toHaveURL(/\/login\?next=%2Fpursuits$/);
});

test("turns away an authenticated browser identity outside the allowlist", async ({ page, context }) => {
  await context.addCookies([{
    name: "kulka-test-auth",
    value: "forbidden",
    url: "http://127.0.0.1:3188",
  }]);
  await page.goto("/underwriting");
  await expect(page).toHaveURL(/\/login\?next=%2Funderwriting$/);
});

test("returns distinct API responses for signed-out and forbidden users", async ({ request }) => {
  const signedOut = await request.post("/api/rom", {
    headers: { "x-kulka-test-auth": "signed-out" },
    data: { projectId: "00000000-0000-4000-8000-000000000001" },
  });
  expect(signedOut.status()).toBe(401);

  const forbidden = await request.post("/api/rom", {
    headers: { "x-kulka-test-auth": "forbidden" },
    data: { projectId: "00000000-0000-4000-8000-000000000001" },
  });
  expect(forbidden.status()).toBe(403);
});
