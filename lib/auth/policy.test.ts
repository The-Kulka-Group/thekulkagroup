import { describe, expect, it } from "vitest";

import { allowedEmailsFrom, authConfiguration, safeReturnPath } from "./policy";

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
  ])(
    "sends an unsafe return path to the homepage: %s",
    (value) => expect(safeReturnPath(value)).toBe("/"),
  );
});
