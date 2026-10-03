import { describe, expect, it } from "vitest";

import { newToken } from "./published-budgets";
import { deviceIdFrom, readCookie, signInCookies, signOutCookie } from "./reader-cookies";

// LA-1486. The reader and device cookies.

describe("readCookie", () => {
  it("finds one cookie among several and nothing in an empty header", () => {
    expect(readCookie("a=1; kulka-device=abc; b=2", "kulka-device")).toBe("abc");
    expect(readCookie("xkulka-device=abc", "kulka-device")).toBeNull();
    expect(readCookie(null, "kulka-device")).toBeNull();
    expect(readCookie("", "kulka-device")).toBeNull();
  });
});

describe("deviceIdFrom", () => {
  it("keeps a held id and replaces a missing or malformed one", () => {
    const held = newToken();
    expect(deviceIdFrom(`kulka-device=${held}`)).toBe(held);
    expect(deviceIdFrom(null)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(deviceIdFrom("kulka-device=nope")).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });
});

describe("cookie attributes", () => {
  it("signs in with two cookies that last a year", () => {
    const [reader, device] = signInCookies("K".repeat(22), "D".repeat(22));
    expect(reader).toBe(`kulka-reader=${"K".repeat(22)}; Path=/b; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
    expect(device).toBe(`kulka-device=${"D".repeat(22)}; Path=/b; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`);
  });

  it("signs out by expiring the reader cookie on the same path", () => {
    expect(signOutCookie()).toBe("kulka-reader=; Path=/b; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  });
});
