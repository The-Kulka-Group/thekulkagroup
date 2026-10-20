import { randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { keepSignInAlive } from "@/lib/autodesk/connection";
import { SIGN_IN_COOKIE, userSettings } from "@/lib/autodesk/oauth";
import { seededDatabase } from "@/test/database";

// LA-2894. The Autodesk sign-in end to end against a seeded Postgres, with
// `fetch` stubbed so Autodesk is never called. Every token is synthetic and
// distinctive, so a leak into any response is easy to catch.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
// KULKA_AUTH_OPEN asks Next for a request scope a test does not have.
vi.mock("next/server", async (original) => ({ ...(await original<typeof import("next/server")>()), connection: async () => {} }));

const connect = await import("./connect/route");
const callback = await import("./callback/route");
const connection = await import("./connection/route");
const areas = await import("./areas/route");

const SECRETS = ["ACCESS-SECRET-1", "REFRESH-SECRET-1", "ACCESS-SECRET-2", "REFRESH-SECRET-2", "test-user-secret"];
const autodesk = vi.fn();
let refreshAnswer: "ok" | "expired" = "ok";
let jobId: string;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function autodeskAnswers() {
  autodesk.mockImplementation(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    const bearer = String((init?.headers as Record<string, string> | undefined)?.Authorization ?? "");
    if (href.endsWith("/authentication/v2/token")) {
      const form = new URLSearchParams(String(init?.body));
      if (form.get("grant_type") === "authorization_code") {
        return json({ access_token: "ACCESS-SECRET-1", refresh_token: "REFRESH-SECRET-1", expires_in: 3599, scope: "data:read account:read user-profile:read" });
      }
      if (refreshAnswer === "expired") return json({ error: "invalid_grant", error_description: "The refresh token is invalid." }, 400);
      return json({ access_token: "ACCESS-SECRET-2", refresh_token: "REFRESH-SECRET-2", expires_in: 3599 });
    }
    if (href.endsWith("/authentication/v2/revoke")) return new Response(null, { status: 200 });
    if (href === "https://api.userprofile.autodesk.com/userinfo") return json({ sub: "AUTODESK-USER-1", name: "Test Person" });
    if (href.includes("/project/v1/hubs/") && !href.endsWith("/topFolders")) {
      return json({ data: { relationships: { cost: { data: { id: "cost-container-1" } } } } });
    }
    if (href.includes("/construction/issues/v1/projects/acc-gordon/issues")) {
      return json({ pagination: { totalResults: 42 }, results: [{ id: "i1" }] });
    }
    if (href.includes("/cost/v1/containers/cost-container-1/budgets")) return json({ results: [{}, {}, {}] });
    if (href.includes("/construction/reviews/")) return json({ results: [] });
    // A refusal that echoes the bearer, to prove the readout never repeats it.
    return json({ detail: `Forbidden for ${bearer}` }, 403);
  });
}

const request = (path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}, base = "http://localhost") =>
  new NextRequest(`${base}${path}`, init);

async function everythingIn(response: Response) {
  return [await response.clone().text(), ...[...response.headers.entries()].map(([k, v]) => `${k}: ${v}`)].join("\n");
}

function expectNoSecret(text: string) {
  for (const secret of SECRETS) expect(text).not.toContain(secret);
}

async function signIn() {
  const start = await connect.GET(request("/api/autodesk/connect"));
  const cookie = start.cookies.get(SIGN_IN_COOKIE)!.value;
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const back = await callback.GET(
    request(`/api/autodesk/callback?${new URLSearchParams({ code: "CODE-1", state })}`, { headers: { cookie: `${SIGN_IN_COOKIE}=${cookie}` } }),
  );
  return { start, back };
}

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`truncate jobs cascade`);
  await db.query(`delete from autodesk_connections`);
  const { rows } = await db.query<{ id: string }>(
    `insert into jobs (autodesk_id, name, job_number) values ('acc-gordon', '10 Gordon Drive', 'C00366') returning id`,
  );
  jobId = rows[0].id;
  vi.stubEnv("APS_USER_CLIENT_ID", "test-user-client");
  vi.stubEnv("APS_USER_CLIENT_SECRET", "test-user-secret");
  vi.stubEnv("AUTODESK_TOKEN_KEY", randomBytes(32).toString("base64"));
  vi.stubEnv("ACC_ACCOUNT_ID", "b.00000000-0000-4000-8000-0000000000aa");
  refreshAnswer = "ok";
  autodesk.mockReset();
  autodeskAnswers();
  vi.stubGlobal("fetch", autodesk);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => db?.close());

describe("Connect Autodesk", () => {
  it("sends the browser to Autodesk with a sealed, http-only sign-in cookie", async () => {
    const response = await connect.GET(request("/api/autodesk/connect"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toMatch(/^https:\/\/developer\.api\.autodesk\.com\/authentication\/v2\/authorize\?/);
    const cookie = response.cookies.get(SIGN_IN_COOKIE)!;
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/api/autodesk", maxAge: 600 });
    expect(autodesk).not.toHaveBeenCalled();
    expectNoSecret(await everythingIn(response));
  });

  it("says sign-in is not set up without the token key", async () => {
    vi.stubEnv("AUTODESK_TOKEN_KEY", "");
    expect((await connect.GET(request("/api/autodesk/connect"))).status).toBe(503);
  });
});

describe("the callback", () => {
  it("trades the code on the server, saves the tokens sealed, and sends back only a redirect", async () => {
    const { back } = await signIn();
    expect(back.status).toBe(303);
    expect(back.headers.get("location")).toBe("http://localhost/projects?autodesk=connected");
    expect(back.cookies.get(SIGN_IN_COOKIE)?.value).toBe("");
    expectNoSecret(await everythingIn(back));

    const [, exchange] = autodesk.mock.calls.find(([url]) => String(url).endsWith("/authentication/v2/token"))!;
    const form = new URLSearchParams(String(exchange.body));
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("CODE-1");
    expect(form.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(form.get("redirect_uri")).toBe("http://localhost/api/autodesk/callback");

    const { rows } = await db.query<Record<string, string>>(`select * from autodesk_connections`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ autodesk_user_id: "AUTODESK-USER-1", autodesk_user_name: "Test Person" });
    expectNoSecret(JSON.stringify(rows[0]));
  });

  it("refuses a state that does not match and never calls Autodesk", async () => {
    const start = await connect.GET(request("/api/autodesk/connect"));
    const cookie = start.cookies.get(SIGN_IN_COOKIE)!.value;
    const back = await callback.GET(
      request(`/api/autodesk/callback?code=CODE-1&state=forged-state`, { headers: { cookie: `${SIGN_IN_COOKIE}=${cookie}` } }),
    );
    expect(back.headers.get("location")).toBe("http://localhost/projects?autodesk=state");
    expect(autodesk).not.toHaveBeenCalled();
    expect((await db.query(`select 1 from autodesk_connections`)).rows).toHaveLength(0);
  });

  it("refuses a callback with no sign-in cookie", async () => {
    const back = await callback.GET(request(`/api/autodesk/callback?code=CODE-1&state=anything`));
    expect(back.headers.get("location")).toBe("http://localhost/projects?autodesk=state");
    expect(autodesk).not.toHaveBeenCalled();
  });

  it("reports a cancelled sign-in", async () => {
    const start = await connect.GET(request("/api/autodesk/connect"));
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const back = await callback.GET(
      request(`/api/autodesk/callback?${new URLSearchParams({ error: "access_denied", state })}`, {
        headers: { cookie: `${SIGN_IN_COOKIE}=${start.cookies.get(SIGN_IN_COOKIE)!.value}` },
      }),
    );
    expect(back.headers.get("location")).toBe("http://localhost/projects?autodesk=denied");
    expect(autodesk).not.toHaveBeenCalled();
  });
});

describe("the connection and Disconnect", () => {
  it("says who is connected without any token", async () => {
    await signIn();
    const response = await connection.GET(request("/api/autodesk/connection"));
    const seen = await everythingIn(response);
    const body = await response.json();
    expect(body.connection).toMatchObject({ userId: "AUTODESK-USER-1", userName: "Test Person", scopes: "data:read account:read user-profile:read" });
    expectNoSecret(seen);
  });

  it("deletes the row and revokes the refresh token", async () => {
    await signIn();
    const response = await connection.DELETE(request("/api/autodesk/connection", { method: "DELETE" }));
    const seen = await everythingIn(response);
    expect(await response.json()).toEqual({ disconnected: true });
    expect((await db.query(`select 1 from autodesk_connections`)).rows).toHaveLength(0);
    const [, revoke] = autodesk.mock.calls.find(([url]) => String(url).endsWith("/authentication/v2/revoke"))!;
    expect(new URLSearchParams(String(revoke.body)).get("token")).toBe("REFRESH-SECRET-1");
    expectNoSecret(seen);
  });

  it("refuses a Disconnect sent from another site", async () => {
    await signIn();
    const response = await connection.DELETE(
      request("/api/autodesk/connection", { method: "DELETE", headers: { origin: "https://elsewhere.example" } }),
    );
    expect(response.status).toBe(403);
    expect((await db.query(`select 1 from autodesk_connections`)).rows).toHaveLength(1);
  });
});

describe("the area readout", () => {
  const readout = () => areas.GET(request(`/api/autodesk/areas?job=${jobId}`));

  it("calls each area as the connected person and returns counts with no token", async () => {
    await signIn();
    autodesk.mockClear();
    const response = await readout();
    expect(response.status).toBe(200);
    const seen = await everythingIn(response);
    const body = await response.json();
    expect(body.project).toEqual({ name: "10 Gordon Drive", jobNumber: "C00366" });
    const byArea = Object.fromEntries(body.areas.map((one: { area: string }) => [one.area, one]));
    expect(byArea.Issues).toMatchObject({ answers: true, records: 42, more: false });
    expect(byArea["Cost Budgets"]).toMatchObject({ answers: true, records: 3 });
    expect(byArea.Forms).toMatchObject({ answers: false, status: 403, records: null, reason: "Forbidden for Bearer [token]" });
    expect(body.areas).toHaveLength(28);
    // LA-2911: the app-only company areas are not asked as a person.
    expect(body.areas.some((one: { area: string }) => one.area.startsWith("Project Companies"))).toBe(false);
    expectNoSecret(seen);

    // The token still had an hour, so no refresh; every call carried it.
    expect(autodesk.mock.calls.some(([url]) => String(url).endsWith("/authentication/v2/token"))).toBe(false);
    for (const [, init] of autodesk.mock.calls) expect(init.headers.Authorization).toBe("Bearer ACCESS-SECRET-1");
    const reviews = autodesk.mock.calls.find(([url]) => String(url).includes("/construction/reviews/"))!;
    expect(new URL(String(reviews[0])).searchParams.get("limit")).toBe("50");
    const photos = autodesk.mock.calls.find(([url]) => String(url).includes("/photos:filter"))!;
    expect(JSON.parse(String(photos[1].body))).toEqual({ limit: 50 });
  });

  it("refreshes an expired access token once, saves the new pair sealed, and reads with it", async () => {
    await signIn();
    await db.query(`update autodesk_connections set access_expires_at = now() - interval '1 minute'`);
    autodesk.mockClear();
    const response = await readout();
    expect(response.status).toBe(200);
    expectNoSecret(await everythingIn(response));

    const refreshes = autodesk.mock.calls.filter(([url]) => String(url).endsWith("/authentication/v2/token"));
    expect(refreshes).toHaveLength(1);
    const form = new URLSearchParams(String(refreshes[0][1].body));
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("REFRESH-SECRET-1");
    const areaCalls = autodesk.mock.calls.filter(([url]) => !String(url).includes("/authentication/"));
    for (const [, init] of areaCalls) expect(init.headers.Authorization).toBe("Bearer ACCESS-SECRET-2");

    const { rows } = await db.query<Record<string, unknown>>(`select * from autodesk_connections`);
    expect(new Date(rows[0].access_expires_at as string).getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(rows[0].refreshed_at).not.toBeNull();
    expectNoSecret(JSON.stringify(rows[0]));

    // The next readout uses the saved new token and does not refresh again.
    autodesk.mockClear();
    await readout();
    expect(autodesk.mock.calls.some(([url]) => String(url).endsWith("/authentication/v2/token"))).toBe(false);
  });

  it("drops a connection whose refresh token Autodesk has retired", async () => {
    await signIn();
    await db.query(`update autodesk_connections set access_expires_at = now() - interval '1 minute'`);
    refreshAnswer = "expired";
    const response = await readout();
    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("The Autodesk sign-in has expired. Connect Autodesk again.");
    expect((await db.query(`select 1 from autodesk_connections`)).rows).toHaveLength(0);
  });

  it("says Autodesk is not connected before anyone signs in", async () => {
    const response = await readout();
    expect(response.status).toBe(409);
    expect(autodesk).not.toHaveBeenCalled();
  });
});

describe("the daily keep-alive (LA-2911)", () => {
  const keep = (now?: number) => keepSignInAlive(db as Db, userSettings()!, now);

  it("refreshes a sign-in idle for a day, so Autodesk's 15 days start again", async () => {
    await signIn();
    autodesk.mockClear();
    expect(await keep(Date.now() + 24 * 3600_000)).toBe("connected");
    const refreshes = autodesk.mock.calls.filter(([url]) => String(url).endsWith("/authentication/v2/token"));
    expect(refreshes).toHaveLength(1);
    const { rows } = await db.query<{ refreshed_at: string | null }>(`select refreshed_at from autodesk_connections`);
    expect(rows[0].refreshed_at).not.toBeNull();
  });

  it("reports a missing or retired sign-in without throwing", async () => {
    expect(await keep()).toBe("Autodesk is not connected. Connect Autodesk on the Projects page.");
    await signIn();
    refreshAnswer = "expired";
    expect(await keep(Date.now() + 24 * 3600_000)).toBe("The Autodesk sign-in has expired. Connect Autodesk again.");
  });
});

describe("the host gate while app sign-in is off", () => {
  beforeEach(() => {
    vi.stubEnv("KULKA_AUTH_OPEN", "1");
  });

  it("refuses every route on a custom domain", async () => {
    const base = "https://kulka.ai";
    for (const response of [
      await connect.GET(request("/api/autodesk/connect", {}, base)),
      await callback.GET(request("/api/autodesk/callback?code=x&state=y", {}, base)),
      await connection.GET(request("/api/autodesk/connection", {}, base)),
      await connection.DELETE(request("/api/autodesk/connection", { method: "DELETE" }, base)),
      await areas.GET(request(`/api/autodesk/areas?job=${jobId}`, {}, base)),
    ]) {
      expect(response.status).toBe(403);
    }
    expect(autodesk).not.toHaveBeenCalled();
  });

  it("answers on the Vercel address that Vercel sign-in covers", async () => {
    const response = await connect.GET(request("/api/autodesk/connect", {}, "https://kulka-ai-the-kulka-group.vercel.app"));
    expect(response.status).toBe(302);
    expect(new URL(response.headers.get("location")!).searchParams.get("redirect_uri")).toBe(
      "https://kulka-ai-the-kulka-group.vercel.app/api/autodesk/callback",
    );
    expect(response.cookies.get(SIGN_IN_COOKIE)?.secure).toBe(true);
  });
});
