import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { decrypt, encrypt, tokenKey } from "./crypto";

// LA-2894. Autodesk 3-legged sign-in: authorization code with PKCE, for the
// "Kulka AI User Sign-in" app (a Traditional Web App). The older "Kulka AI"
// app behind APS_CLIENT_ID is Server-to-Server, cannot sign a person in, and
// keeps running the app-only project sync in lib/jobs/autodesk.ts.
//
// Nothing here logs or returns a token. Errors carry Autodesk's own message
// or a status, never a request or response body.

const AUTHORIZE_URL = "https://developer.api.autodesk.com/authentication/v2/authorize";
const TOKEN_URL = "https://developer.api.autodesk.com/authentication/v2/token";
const REVOKE_URL = "https://developer.api.autodesk.com/authentication/v2/revoke";
const USERINFO_URL = "https://api.userprofile.autodesk.com/userinfo";

// user-profile:read lets the callback learn who signed in (id and name).
export const SCOPES = "data:read account:read user-profile:read";
export const CALLBACK_PATH = "/api/autodesk/callback";
export const SIGN_IN_COOKIE = "kulka-autodesk-sign-in";
const SIGN_IN_PURPOSE = "autodesk-sign-in-cookie";
export const SIGN_IN_MAX_AGE = 600;

export class AutodeskSignInError extends Error {
  /** True when Autodesk says the refresh token is dead, so only a new sign-in helps. */
  readonly expired: boolean;
  constructor(message: string, expired = false) {
    super(message);
    this.name = "AutodeskSignInError";
    this.expired = expired;
  }
}

export type UserSettings = { clientId: string; clientSecret: string; key: Buffer };

/** The sign-in app and the token key, or null when any is missing. */
export function userSettings(): UserSettings | null {
  const clientId = process.env.APS_USER_CLIENT_ID?.trim();
  const clientSecret = process.env.APS_USER_CLIENT_SECRET?.trim();
  const key = tokenKey();
  return clientId && clientSecret && key ? { clientId, clientSecret, key } : null;
}

export function callbackUrl(origin: string) {
  return `${origin}${CALLBACK_PATH}`;
}

type SignInCookie = { state: string; verifier: string; at: number };

/** A fresh state and PKCE verifier, the sealed cookie that carries them, and the Autodesk URL to send the browser to. */
export function startSignIn(settings: UserSettings, origin: string, now = Date.now()) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", settings.clientId);
  url.searchParams.set("redirect_uri", callbackUrl(origin));
  url.searchParams.set("scope", SCOPES);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  const cookie: SignInCookie = { state, verifier, at: now };
  return { url: url.toString(), cookie: encrypt(JSON.stringify(cookie), SIGN_IN_PURPOSE, settings.key) };
}

/**
 * The PKCE verifier when the cookie opens, is under ten minutes old, and holds
 * the same state Autodesk sent back. Null otherwise.
 */
export function checkSignIn(
  settings: UserSettings,
  sealedCookie: string | undefined,
  returnedState: string | null,
  now = Date.now(),
): string | null {
  if (!sealedCookie || !returnedState) return null;
  const plain = decrypt(sealedCookie, SIGN_IN_PURPOSE, settings.key);
  if (!plain) return null;
  let cookie: Partial<SignInCookie>;
  try {
    cookie = JSON.parse(plain) as Partial<SignInCookie>;
  } catch {
    return null;
  }
  if (typeof cookie.state !== "string" || typeof cookie.verifier !== "string" || typeof cookie.at !== "number") return null;
  if (now - cookie.at > SIGN_IN_MAX_AGE * 1000 || now < cookie.at) return null;
  const expected = Buffer.from(cookie.state);
  const given = Buffer.from(returnedState);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return cookie.verifier;
}

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: Date; scopes: string };

function basic(settings: UserSettings) {
  return `Basic ${Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString("base64")}`;
}

async function tokenRequest(settings: UserSettings, form: Record<string, string>, now: number): Promise<Tokens> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: basic(settings),
      },
      body: new URLSearchParams(form),
      cache: "no-store",
    });
  } catch {
    throw new AutodeskSignInError("Autodesk sign-in could not be reached.");
  }
  const body = (await response.json().catch(() => null)) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    error?: string;
    error_description?: string;
    developerMessage?: string;
  } | null;
  if (!response.ok || !body?.access_token || !body.refresh_token) {
    // invalid_grant is Autodesk's answer for a used, revoked or 15-day-old refresh token.
    const expired = body?.error === "invalid_grant";
    const message = body?.error_description ?? body?.developerMessage ?? `Autodesk sign-in answered ${response.status}.`;
    throw new AutodeskSignInError(message, expired);
  }
  const seconds = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: new Date(now + seconds * 1000),
    scopes: body.scope?.trim() || SCOPES,
  };
}

export function exchangeCode(settings: UserSettings, code: string, verifier: string, origin: string, now = Date.now()) {
  return tokenRequest(
    settings,
    { grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: callbackUrl(origin) },
    now,
  );
}

/** Autodesk hands back a new refresh token each time and retires the old one. */
export function refreshTokens(settings: UserSettings, refreshToken: string, now = Date.now()) {
  return tokenRequest(settings, { grant_type: "refresh_token", refresh_token: refreshToken }, now);
}

export type AutodeskUser = { id: string; name: string | null };

export async function signedInUser(accessToken: string): Promise<AutodeskUser> {
  let response: Response;
  try {
    response = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  } catch {
    throw new AutodeskSignInError("Autodesk could not be reached to read who signed in.");
  }
  const body = (await response.json().catch(() => null)) as {
    sub?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
  } | null;
  if (!response.ok || !body?.sub) {
    throw new AutodeskSignInError(`Autodesk answered ${response.status} when asked who signed in.`);
  }
  const name = body.name?.trim() || [body.given_name, body.family_name].filter(Boolean).join(" ").trim() || body.email?.trim() || null;
  return { id: body.sub, name: name ? name.slice(0, 300) : null };
}

/** Best effort: Disconnect deletes Kulka's copy whether or not Autodesk confirms. */
export async function revokeRefreshToken(settings: UserSettings, refreshToken: string) {
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: basic(settings) },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token" }),
      cache: "no-store",
    });
  } catch {
    // The row is gone either way, and Autodesk retires an unused refresh token after 15 days.
  }
}
