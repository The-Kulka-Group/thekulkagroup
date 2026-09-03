import { afterEach, describe, expect, it, vi } from "vitest";

import { authorizeRequest, authorizeVerifiedUser } from "./server";

afterEach(() => vi.unstubAllEnvs());

describe("temporary access", () => {
  it("returns a labeled temporary user without Supabase", async () => {
    vi.stubEnv("KULKA_AUTH_BYPASS", "1");
    await expect(authorizeRequest()).resolves.toEqual({
      ok: true,
      user: { id: "temporary-workspace", email: "Temporary Access", temporary: true },
    });
  });
});

describe("authorizeVerifiedUser", () => {
  const allowed = "matt@kulka.com,rob@kulka.com,devin@kulka.com,jason@kulka.com,lee@kulka.com";

  it("allows a verified user whose normalized email is listed", async () => {
    const result = await authorizeVerifiedUser(
      async () => ({ id: "user-1", email: "MATT@KULKA.COM" }),
      allowed,
    );
    expect(result).toEqual({ ok: true, user: { id: "user-1", email: "matt@kulka.com" } });
  });

  it("returns 401 when Supabase has no user", async () => {
    expect(await authorizeVerifiedUser(async () => null, allowed)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("returns 403 for a verified email outside the list", async () => {
    expect(
      await authorizeVerifiedUser(async () => ({ id: "user-2", email: "other@kulka.com" }), allowed),
    ).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed when configuration is missing", async () => {
    const verify = vi.fn(async () => ({ id: "user-1", email: "matt@kulka.com" }));
    expect(await authorizeVerifiedUser(verify, undefined)).toMatchObject({ ok: false, status: 503 });
    expect(verify).not.toHaveBeenCalled();
  });

  it("fails closed when Supabase cannot verify the request", async () => {
    expect(
      await authorizeVerifiedUser(async () => {
        throw new Error("provider unavailable");
      }, allowed),
    ).toMatchObject({ ok: false, status: 503 });
  });
});
