import { expect, test } from "@playwright/test";

test.skip(process.env.KULKA_AUTH_BYPASS !== "1", "temporary bypass is off");

test("opens the app and APIs without a Supabase session", async ({ page, request }) => {
  await page.goto("/pursuits");
  await expect(page).toHaveURL(/\/pursuits$/);
  await expect(page.getByText("Temporary Access", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign Out" })).toHaveCount(0);

  const response = await request.post("/api/rom", {
    data: { projectId: "00000000-0000-4000-8000-000000000001" },
  });
  expect(response.status()).toBe(404);

  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
});
