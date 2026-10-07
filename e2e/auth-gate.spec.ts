import { expect, test, type Page } from "@playwright/test";
import { AUTH_ROUTES, AUTH_SECURITY_HEADERS } from "../lib/auth/routes";

const authStates = [
  { path: "/login", title: "Sign In" },
  {
    path: "/auth/continue?token_hash=browser-test-token&type=invite",
    title: "Finish Account Setup",
  },
  {
    path: "/auth/continue?token_hash=browser-test-token&type=magiclink",
    title: "Finish Account Setup",
  },
  { path: "/auth/continue?error=invalid", title: "Finish Account Setup" },
] as const;

const SENT_MESSAGE = "If that address has access, a sign-in link is on the way.";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function expectAuthCardFits(page: Page, viewport: { width: number; height: number }, label: string) {
  const card = page.locator(".auth-card");
  await expect(card).toBeVisible();
  const box = await card.boundingBox();
  expect(box, label).not.toBeNull();
  expect(box!.x, label).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, label).toBeLessThanOrEqual(viewport.width);
  expect(box!.y, label).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, label).toBeLessThanOrEqual(viewport.height);
}

function expectPrivateAuthHeaders(headers: Record<string, string>) {
  for (const [name, value] of Object.entries(AUTH_SECURITY_HEADERS)) {
    if (name === "Cache-Control") {
      expect(headers[name.toLowerCase()]).toMatch(/no-store|no-cache/);
    } else {
      expect(headers[name.toLowerCase()]).toBe(value);
    }
  }
}

test("redirects, signs in to a safe return path, and signs out", async ({ page, context }) => {
  await context.addCookies([{
    name: "kulka-test-auth",
    value: "signed-out",
    url: "http://127.0.0.1:3188",
  }]);
  await page.goto("/underwriting");
  await expect(page).toHaveURL(/\/login\?next=%2Funderwriting$/);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Sign-In Link" })).toBeVisible();
  await expect(page.locator(".auth-card")).toHaveCount(1);
  await expect(page.getByText(/sign up|create account/i)).toHaveCount(0);
  await page.getByLabel("Email").fill("browser-test@kulka.invalid");
  const signInResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Send Sign-In Link" }).click();
  const signInResponse = await signInResponsePromise;
  expectPrivateAuthHeaders(signInResponse.headers());
  await expect(page).toHaveURL(/\/underwriting$/);
  await expect(page.getByText("browser-test@kulka.invalid")).toBeVisible();

  const signOutResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sign Out" }).click();
  const signOutResponse = await signOutResponsePromise;
  expectPrivateAuthHeaders(signOutResponse.headers());
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/underwriting");
  await expect(page).toHaveURL(/\/login\?next=%2Funderwriting$/);
});

test("stops a signed-out page request at the proxy boundary", async ({ request }) => {
  const response = await request.get("/underwriting?view=mine", {
    headers: { Cookie: "kulka-test-auth=signed-out" },
    maxRedirects: 0,
  });

  expect(response.status()).toBe(307);
  expect(response.headers().location).toMatch(/\/login\?next=%2Funderwriting%3Fview%3Dmine$/);
  expectPrivateAuthHeaders(response.headers());
  expect((await response.body()).toString()).toBe("/login?next=%2Funderwriting%3Fview%3Dmine");
});

for (const viewport of [
  { name: "phone", width: 375, height: 667 },
  { name: "desktop", width: 1440, height: 900 },
] as const) {
  test(`keeps every shared auth state usable at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const state of authStates) {
      await page.goto(state.path);
      await expect(page.getByRole("heading", { name: state.title })).toBeVisible();
      await expectAuthCardFits(page, viewport, state.path);
    }
  });

  test(`keeps sign-in pending and success states usable at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/login?next=%2Funderwriting");

    const requestHeld = deferred();
    const releaseRequest = deferred();
    await page.route("**/login*", async (route) => {
      if (route.request().method() === "POST") {
        requestHeld.resolve();
        await releaseRequest.promise;
      }
      await route.continue();
    });

    await page.getByLabel("Email").fill("outside@kulka.com");
    const click = page.getByRole("button", { name: "Send Sign-In Link" }).click();
    await requestHeld.promise;
    await expect(page.getByRole("button", { name: "Sending..." })).toBeDisabled();
    await expectAuthCardFits(page, viewport, "sign-in pending");

    releaseRequest.resolve();
    await click;
    await expect(page.getByRole("status")).toHaveText(SENT_MESSAGE);
    await expectAuthCardFits(page, viewport, "sign-in success");
  });
}

test("keeps the sign-in form in logical keyboard order", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/login?next=%2Funderwriting");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Email")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Send Sign-In Link" })).toBeFocused();
});

test("shows the same message for an email outside the allowlist", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("unknown@example.com");
  await page.getByRole("button", { name: "Send Sign-In Link" }).click();
  await expect(page.locator('.auth-message[role="status"]')).toHaveText(SENT_MESSAGE);
  await expect(page).toHaveURL(/\/login$/);
});

test("falls back to app home for an unsafe return path", async ({ page }) => {
  await page.goto("/login?next=https%3A%2F%2Fevil.test%2Foutside");
  await expect(page.locator('input[name="next"]')).toHaveValue("/");
  await page.getByLabel("Email").fill("browser-test@kulka.invalid");
  await page.getByRole("button", { name: "Send Sign-In Link" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3188/");
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

test("confirms an invite and returns straight to the safe path", async ({ page, context }) => {
  await context.addCookies([{
    name: "kulka-test-auth",
    value: "signed-out",
    url: "http://127.0.0.1:3188",
  }]);
  await page.goto(
    "/auth/continue?token_hash=browser-test-token&type=invite&next=%2Funderwriting",
  );
  await expect(page.getByRole("heading", { name: "Finish Account Setup" })).toBeVisible();
  const confirmResponsePromise = page.waitForResponse((response) =>
    response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Continue" }).click();
  const confirmResponse = await confirmResponsePromise;
  expectPrivateAuthHeaders(confirmResponse.headers());
  await expect(page).toHaveURL(/\/underwriting$/);
});

test("confirms a magic link and returns straight to the safe path", async ({ page, context }) => {
  await context.addCookies([{
    name: "kulka-test-auth",
    value: "signed-out",
    url: "http://127.0.0.1:3188",
  }]);
  await page.goto(
    "/auth/continue?token_hash=browser-test-token&type=magiclink&next=%2Funderwriting",
  );
  await expect(page.getByRole("heading", { name: "Finish Account Setup" })).toBeVisible();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/underwriting$/);
});

test("shows a generic error for an invalid account link", async ({ page }) => {
  await page.goto("/auth/continue?token_hash=bad&type=signup");
  await expect(page.locator('.auth-description[role="alert"]')).toHaveText("This account link is invalid or has expired.");
  await expect(page.locator(".auth-card")).toHaveCount(1);
});

test("keeps the invalid link next step tied to its email flow", async ({ page }) => {
  await page.goto("/auth/continue?token_hash=bad-browser-token&type=invite");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/continue\?error=invalid&type=invite$/);
  await expect(page.getByText("Ask a Kulka owner to send a new invitation.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Request a New Link" })).toHaveCount(0);

  await page.goto("/auth/continue?token_hash=bad-browser-token&type=magiclink");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/auth\/continue\?error=invalid&type=magiclink$/);
  await expect(page.getByRole("link", { name: "Request a New Link" })).toBeVisible();
});

test("keeps every public auth page out of browser and CDN caches", async ({ page }) => {
  const coveredRoutes = new Set(authStates.map((state) => new URL(state.path, "https://kulka.invalid").pathname));
  expect([...coveredRoutes].sort()).toEqual([...AUTH_ROUTES].sort());
  for (const state of authStates) {
    const response = await page.goto(state.path);
    expect(response, state.path).not.toBeNull();
    expectPrivateAuthHeaders(response!.headers());
  }
});
