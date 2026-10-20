import { randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { decrypt, encrypt, tokenKey } from "./crypto";

// LA-2894. The seal on Autodesk tokens at rest.

const key = randomBytes(32);

describe("token encryption", () => {
  it("opens what it sealed, and the sealed form never shows the plain text", () => {
    const sealed = encrypt("refresh-token-plain", "autodesk-refresh-token", key);
    expect(sealed).not.toContain("refresh-token-plain");
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(decrypt(sealed, "autodesk-refresh-token", key)).toBe("refresh-token-plain");
  });

  it("seals the same text differently each time", () => {
    expect(encrypt("same", "p", key)).not.toBe(encrypt("same", "p", key));
  });

  it("refuses a value sealed for another purpose, under another key, or altered", () => {
    const sealed = encrypt("refresh-token-plain", "autodesk-refresh-token", key);
    expect(decrypt(sealed, "autodesk-access-token", key)).toBeNull();
    expect(decrypt(sealed, "autodesk-refresh-token", randomBytes(32))).toBeNull();
    const [version, iv, tag, body] = sealed.split(".");
    const flipped = Buffer.from(body, "base64url");
    flipped[0] ^= 1;
    expect(decrypt([version, iv, tag, flipped.toString("base64url")].join("."), "autodesk-refresh-token", key)).toBeNull();
    // A cut-down tag is refused rather than checked on fewer bytes.
    const shortTag = Buffer.from(tag, "base64url").subarray(0, 4).toString("base64url");
    expect(decrypt([version, iv, shortTag, body].join("."), "autodesk-refresh-token", key)).toBeNull();
    expect(decrypt("not-sealed", "autodesk-refresh-token", key)).toBeNull();
  });

  it("takes only a 32-byte base64 key", () => {
    expect(tokenKey(randomBytes(32).toString("base64"))?.length).toBe(32);
    expect(tokenKey(randomBytes(16).toString("base64"))).toBeNull();
    expect(tokenKey("")).toBeNull();
    expect(tokenKey(undefined)).toBeNull();
  });
});
