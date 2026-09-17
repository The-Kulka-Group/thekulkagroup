import { describe, expect, it } from "vitest";

import {
  allowedEmailsFrom,
  authConfiguration,
  safeAuthEmailType,
  safeAuthEmail,
  safeAuthTokenHash,
  safeReturnPath,
  siteUrlFrom,
  verifiedAllowedEmail,
} from "./policy";

describe("allowedEmailsFrom", () => {
  it("normalizes exactly five unique email addresses", () => {
    expect(allowedEmailsFrom(" Matt@Kulka.com,ROB@kulka.com , devin@kulka.com,jason@kulka.com,lee@kulka.com ")).toEqual(
      new Set(["matt@kulka.com", "rob@kulka.com", "devin@kulka.com", "jason@kulka.com", "lee@kulka.com"]),
    );
  });

  it.each([
    undefined,
    "",
    "a@x.com,b@x.com,c@x.com,d@x.com",
    "a@x.com,b@x.com,c@x.com,d@x.com,a@x.com",
    "a@x.com,b@x.com,c@x.com,d@x.com,invalid",
  ])(
    "fails closed for an invalid allowlist: %s",
    (value) => expect(allowedEmailsFrom(value)).toBeNull(),
  );
});

describe("authConfiguration", () => {
  const valid = [
    "https://project.supabase.co",
    "publishable-key",
    "a@x.com,b@x.com,c@x.com,d@x.com,e@x.com",
  ] as const;

  it("accepts a complete configuration", () => {
    expect(authConfiguration(...valid)).toMatchObject({
      url: "https://project.supabase.co",
      publishableKey: "publishable-key",
    });
  });

  it.each([0, 1, 2])("fails closed when value %s is missing", (index) => {
    const values: [string | undefined, string | undefined, string | undefined] = [...valid];
    values[index] = undefined;
    expect(authConfiguration(...values)).toBeNull();
  });
});

describe("verifiedAllowedEmail", () => {
  const allowed = new Set(["matt@kulka.com"]);

  it("returns a normalized allowlisted email only when Supabase verified it", () => {
    expect(verifiedAllowedEmail({
      email: " MATT@KULKA.COM ",
      email_confirmed_at: "2026-09-14T12:00:00Z",
    }, allowed)).toBe("matt@kulka.com");
  });

  it("rejects an allowlisted but unverified email claim", () => {
    expect(verifiedAllowedEmail({ email: "matt@kulka.com" }, allowed)).toBeNull();
  });

  it("rejects a verified email outside the allowlist", () => {
    expect(verifiedAllowedEmail({
      email: "other@kulka.com",
      email_confirmed_at: "2026-09-14T12:00:00Z",
    }, allowed)).toBeNull();
  });
});

describe("safeReturnPath", () => {
  it("keeps an internal app path", () => {
    expect(safeReturnPath("/underwriting/123?tab=returns")).toBe(
      "/underwriting/123?tab=returns",
    );
  });

  it.each([
    undefined,
    "",
    "https://evil.test",
    "//evil.test",
    "/\\evil.test",
    "/%5Cevil.test",
    "/login",
    "/login?next=/",
    "/auth/continue",
  ])(
    "sends an unsafe return path to the homepage: %s",
    (value) => expect(safeReturnPath(value)).toBe("/"),
  );
});

describe("safeAuthEmailType", () => {
  it.each(["invite", "magiclink"])("accepts %s links", (value) => {
    expect(safeAuthEmailType(value)).toBe(value);
  });

  it.each([undefined, "", "signup", "recovery", "email_change"])(
    "rejects %s links",
    (value) => expect(safeAuthEmailType(value)).toBeNull(),
  );
});

describe("safeAuthEmail", () => {
  it("normalizes a bounded email address", () => {
    expect(safeAuthEmail("  Matt@BLDGLabs.ai ")).toBe("matt@bldglabs.ai");
  });

  it("rejects missing, malformed, and oversized values", () => {
    expect(safeAuthEmail(undefined)).toBeNull();
    expect(safeAuthEmail("not-an-email")).toBeNull();
    expect(safeAuthEmail(`${"a".repeat(250)}@b.co`)).toBeNull();
  });
});

describe("safeAuthTokenHash", () => {
  it("accepts a bounded URL-safe token hash", () => {
    expect(safeAuthTokenHash("abcDEF0123_-token")).toBe("abcDEF0123_-token");
  });

  it.each([undefined, "", "short", "token with spaces", "x".repeat(513)])(
    "rejects an invalid token hash",
    (value) => expect(safeAuthTokenHash(value)).toBeNull(),
  );
});

describe("siteUrlFrom", () => {
  it("accepts a secure origin and removes a trailing slash", () => {
    expect(siteUrlFrom("https://kulka-ai.vercel.app/")).toBe("https://kulka-ai.vercel.app");
  });

  it.each([undefined, "", "http://kulka-ai.vercel.app", "https://kulka-ai.vercel.app/path"])(
    "rejects an unsafe site URL: %s",
    (value) => expect(siteUrlFrom(value)).toBeNull(),
  );
});
