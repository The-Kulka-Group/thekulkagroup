import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { SCOPES, checkSignIn, startSignIn, type UserSettings } from "./oauth";

// LA-2894. The state check and PKCE pair that tie Autodesk's callback to the
// browser that pressed Connect Autodesk.

const settings: UserSettings = { clientId: "test-user-client", clientSecret: "test-user-secret", key: randomBytes(32) };
const origin = "https://kulka-ai-the-kulka-group.vercel.app";

describe("startSignIn", () => {
  it("sends Autodesk a code request with state and an S256 challenge, and no secret", () => {
    const { url } = startSignIn(settings, origin);
    const sent = new URL(url);
    expect(`${sent.origin}${sent.pathname}`).toBe("https://developer.api.autodesk.com/authentication/v2/authorize");
    expect(sent.searchParams.get("response_type")).toBe("code");
    expect(sent.searchParams.get("client_id")).toBe("test-user-client");
    expect(sent.searchParams.get("redirect_uri")).toBe(`${origin}/api/autodesk/callback`);
    expect(sent.searchParams.get("scope")).toBe(SCOPES);
    expect(sent.searchParams.get("code_challenge_method")).toBe("S256");
    expect(sent.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url).not.toContain("test-user-secret");
  });

  it("seals a verifier whose hash is the challenge sent", () => {
    const { url, cookie } = startSignIn(settings, origin);
    const sent = new URL(url);
    const verifier = checkSignIn(settings, cookie, sent.searchParams.get("state"));
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(createHash("sha256").update(verifier!).digest("base64url")).toBe(sent.searchParams.get("code_challenge"));
    expect(cookie).not.toContain(verifier!);
  });
});

describe("checkSignIn", () => {
  const now = Date.UTC(2026, 9, 20, 15);
  const begun = startSignIn(settings, origin, now);
  const state = new URL(begun.url).searchParams.get("state");

  it("refuses a state that does not match the cookie", () => {
    expect(checkSignIn(settings, begun.cookie, "someone-elses-state", now)).toBeNull();
    expect(checkSignIn(settings, begun.cookie, `${state}x`, now)).toBeNull();
    expect(checkSignIn(settings, begun.cookie, null, now)).toBeNull();
  });

  it("refuses a missing, altered or foreign cookie", () => {
    expect(checkSignIn(settings, undefined, state, now)).toBeNull();
    expect(checkSignIn(settings, `${begun.cookie}A`, state, now)).toBeNull();
    expect(checkSignIn({ ...settings, key: randomBytes(32) }, begun.cookie, state, now)).toBeNull();
  });

  it("refuses a sign-in started more than ten minutes ago", () => {
    expect(checkSignIn(settings, begun.cookie, state, now + 9 * 60_000)).not.toBeNull();
    expect(checkSignIn(settings, begun.cookie, state, now + 11 * 60_000)).toBeNull();
  });
});
