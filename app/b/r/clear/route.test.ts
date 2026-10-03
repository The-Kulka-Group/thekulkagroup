import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

// LA-1486. "Not You?" expires the reader cookie, and nothing else.

afterEach(() => vi.unstubAllEnvs());

function post(headers: Record<string, string>) {
  return POST(new Request("http://localhost/b/r/clear", { method: "POST", headers }));
}

describe("POST /b/r/clear", () => {
  it("expires the reader cookie on /b and leaves the device cookie alone", async () => {
    const response = await post({ origin: "http://localhost" });

    expect(response.status).toBe(204);
    const set = response.headers.getSetCookie();
    expect(set).toHaveLength(1);
    expect(set[0]).toMatch(/^kulka-reader=;/);
    expect(set[0]).toContain("Path=/b;");
    expect(set[0]).toContain("Max-Age=0");
    expect(set[0]).toContain("HttpOnly");
    expect(set[0]).toContain("Secure");
    expect(set[0]).toContain("SameSite=Lax");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("refuses a request from another origin or with no origin, and clears nothing", async () => {
    for (const headers of [{ origin: "https://elsewhere.example" }, {} as Record<string, string>]) {
      const response = await post(headers);
      expect(response.status).toBe(403);
      expect(response.headers.get("set-cookie")).toBeNull();
    }
  });

  it("compares the origin with KULKA_SITE_URL when it is set", async () => {
    vi.stubEnv("KULKA_SITE_URL", "https://kulka.example");
    expect((await post({ origin: "https://kulka.example" })).status).toBe(204);
    expect((await post({ origin: "http://localhost" })).status).toBe(403);
  });
});
