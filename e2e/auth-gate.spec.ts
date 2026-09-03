import { expect, test } from "@playwright/test";

test("shows password sign-in with no public signup", async ({ page }) => {
  await page.goto("/login?next=/underwriting");
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(page.getByText(/sign up|create account/i)).toHaveCount(0);
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
