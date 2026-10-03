import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { proxy } from "@/proxy";

// LA-1417. A published budget link opens for anyone who has it, whether or
// not sign-in is on, and never under KULKA_AUTH_OPEN's handling. The rest of
// the site stays behind sign-in.

afterEach(() => vi.unstubAllEnvs());

const TOKEN = "AbCdEfGhIjKlMnOpQrSt_-";

function request(path: string) {
  return new NextRequest(new URL(path, "https://kulka.example"));
}

describe("proxy and /b/ links", () => {
  it("keeps the app behind sign-in when sign-in is on", async () => {
    vi.stubEnv("KULKA_AUTH_OPEN", "");

    const response = await proxy(request("/rom"));

    expect(response.headers.get("location")).toContain("/login");
  });

  it("opens a published budget without sign-in, marked noindex and no-referrer", async () => {
    vi.stubEnv("KULKA_AUTH_OPEN", "");

    const response = await proxy(request(`/b/${TOKEN}`));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("opens a reader link and the Not You? route without sign-in, with the same headers", async () => {
    vi.stubEnv("KULKA_AUTH_OPEN", "");

    for (const path of [`/b/r/${TOKEN}`, "/b/r/clear"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("handles a published budget the same way when access is open", async () => {
    vi.stubEnv("KULKA_AUTH_OPEN", "1");

    const response = await proxy(request(`/b/${TOKEN}`));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("sends /b/<token>.pdf to the PDF route", async () => {
    vi.stubEnv("KULKA_AUTH_OPEN", "");

    const response = await proxy(request(`/b/${TOKEN}.pdf`));

    expect(response.headers.get("location")).toBeNull();
    expect(new URL(response.headers.get("x-middleware-rewrite") ?? "").pathname).toBe(`/b/${TOKEN}/pdf`);
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("serves the page's engine, script and styles without sign-in (LA-1418)", async () => {
    vi.stubEnv("KULKA_AUTH_OPEN", "");

    for (const path of ["/scrollcraft/scrollcraft.js", "/scrollcraft/scrollcraft.css", "/scrollcraft/budget-page.js", "/scrollcraft/budget-page.css"]) {
      const response = await proxy(request(path));
      expect(response.headers.get("location")).toBeNull();
    }
  });
});
