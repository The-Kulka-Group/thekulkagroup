import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const resetPasswordForEmail = vi.hoisted(() => vi.fn());
const createSupabaseServerClient = vi.hoisted(() => vi.fn(async () => ({
  auth: { resetPasswordForEmail },
})));

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient }));

const { requestPasswordReset } = await import("./actions");
const allowed = "matt@kulka.com,rob@kulka.com,devin@kulka.com,jason@kulka.com,lee@kulka.com";
const sent = { error: null, message: "If the address has access, a password reset email is on the way." };

function form(email: string, next = "/") {
  const data = new FormData();
  data.set("email", email);
  data.set("next", next);
  return data;
}

beforeEach(() => {
  vi.stubEnv("KULKA_AUTH_ALLOWED_EMAILS", allowed);
  vi.stubEnv("KULKA_SITE_URL", "https://kulka.ai");
  vi.stubEnv("KULKA_BROWSER_TEST", "0");
  resetPasswordForEmail.mockReset();
  createSupabaseServerClient.mockClear();
});

afterEach(() => vi.unstubAllEnvs());

describe("requestPasswordReset", () => {
  it("sends an allowlisted user to the scanner-safe recovery route", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: null });

    await expect(requestPasswordReset(sent, form(" MATT@KULKA.COM ", "/pursuits"))).resolves.toEqual(sent);
    expect(resetPasswordForEmail).toHaveBeenCalledWith("matt@kulka.com", {
      redirectTo: "https://kulka.ai/auth/continue?next=%2Fpursuits",
    });
  });

  it.each(["outside@kulka.com", "not-an-email"])(
    "returns the same result without sending for %s",
    async (email) => {
      await expect(requestPasswordReset(sent, form(email))).resolves.toEqual(sent);
      expect(createSupabaseServerClient).not.toHaveBeenCalled();
    },
  );

  it("does not reveal a provider failure", async () => {
    resetPasswordForEmail.mockRejectedValue(new Error("provider unavailable"));
    await expect(requestPasswordReset(sent, form("matt@kulka.com"))).resolves.toEqual(sent);
  });

  it("fails closed when server settings are missing", async () => {
    vi.stubEnv("KULKA_SITE_URL", "");
    await expect(requestPasswordReset(sent, form("matt@kulka.com"))).resolves.toEqual({
      error: "Password reset is unavailable.",
      message: null,
    });
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });
});
