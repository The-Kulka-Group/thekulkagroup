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
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await expect(page.locator(".auth-card")).toHaveCount(1);
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

test("keeps the shared auth card usable at phone width with keyboard focus", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/login?next=%2Fpursuits");

  const card = page.locator(".auth-card");
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(375);

  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Password")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Sign In" })).toBeFocused();
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

test("requests password recovery without revealing account status", async ({ page }) => {
  const response = await page.goto("/forgot-password?next=%2Funderwriting");
  expect(response?.headers()["cache-control"]).toContain("no-cache");
  expect(response?.headers()["vercel-cdn-cache-control"]).toBe("no-store");
  expect(response?.headers()["referrer-policy"]).toBe("no-referrer");
  await page.getByLabel("Email").fill("browser-test@kulka.invalid");
  await page.getByRole("button", { name: "Send Reset Link" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "If the address has access, a password reset email is on the way.",
  );
  await expect(page.locator('input[name="next"]')).toHaveValue("/underwriting");
  await expect(page.locator(".auth-card")).toHaveCount(1);
});

test("uses reset wording for a recovery link", async ({ page }) => {
  await page.goto("/auth/continue?token_hash=browser-test-token&type=recovery");
  await expect(page.getByRole("heading", { name: "Reset Your Password" })).toBeVisible();
  await expect(page.locator(".auth-card")).toHaveCount(1);
});

test("confirms an invite, validates the password, and returns safely", async ({ page, context }) => {
  await context.addCookies([{
    name: "kulka-test-auth",
    value: "signed-out",
    url: "http://127.0.0.1:3188",
  }]);
  await page.goto(
    "/auth/continue?token_hash=browser-test-token&type=invite&next=%2Fpursuits",
  );
  await expect(page.getByRole("heading", { name: "Finish Account Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/update-password\?next=%2Fpursuits&flow=invite$/);

  await page.getByLabel("New Password", { exact: true }).fill("a long passphrase 42");
  await page.getByLabel("Confirm Password").fill("a different passphrase 43");
  await page.getByRole("button", { name: "Save Password" }).click();
  await expect(page.getByText("The passwords do not match.", { exact: true })).toBeVisible();
  await expect(page.locator('.auth-message[role="alert"]')).toHaveText("The passwords do not match.");
  await expect(page.getByLabel("New Password", { exact: true })).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("New Password", { exact: true }).fill("a long passphrase 42");
  await page.getByLabel("Confirm Password").fill("a long passphrase 42");
  await page.getByRole("button", { name: "Save Password" }).click();
  await expect(page).toHaveURL(/\/pursuits$/);
});

test("shows a generic error for an invalid account link", async ({ page }) => {
  await page.goto("/auth/continue?token_hash=bad&type=signup");
  await expect(page.locator('.auth-description[role="alert"]')).toHaveText("This account link is invalid or has expired.");
  await expect(page.locator(".auth-card")).toHaveCount(1);
});
