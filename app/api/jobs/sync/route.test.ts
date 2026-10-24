import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";
import { sourceRuns } from "@/test/source-runs";

// LA-2283. The Autodesk job list sync against a seeded Postgres, with `fetch`
// stubbed so the real Autodesk client runs offline. Every project is synthetic.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const route = await import("./route");
const autodesk = vi.fn();

const project = (i: number, extra: Record<string, unknown> = {}) => ({
  id: `acc-${i}`,
  name: `Synthetic Job ${i}`,
  jobNumber: `C${String(i).padStart(5, "0")}`,
  status: "active",
  type: "Multi-Family Housing",
  platform: "acc",
  startDate: "2026-01-15",
  updatedAt: "2026-10-01T12:00:00.000Z",
  ...extra,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function autodeskAnswers(pages: unknown[][]) {
  autodesk.mockImplementation(async (url: string | URL) => {
    const href = String(url);
    if (href.endsWith("/authentication/v2/token")) return json({ access_token: "test-token", expires_in: 3599 });
    const offset = Number(new URL(href).searchParams.get("offset"));
    const page = pages[offset / 200] ?? [];
    return json({ pagination: { limit: 200, offset, totalResults: pages.flat().length }, results: page });
  });
}

const sync = () => route.POST(new Request("http://localhost/api/jobs/sync", { method: "POST" }));

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`truncate jobs cascade`);
  await db.query(`delete from source_runs`);
  await db.query(`update data_sources set lease_token = null, lease_until = null`);
  vi.stubEnv("APS_CLIENT_ID", "test-client");
  vi.stubEnv("APS_CLIENT_SECRET", "test-secret");
  vi.stubEnv("ACC_ACCOUNT_ID", "b.00000000-0000-4000-8000-0000000000aa");
  autodesk.mockReset();
  vi.stubGlobal("fetch", autodesk);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => db?.close());

describe("POST /api/jobs/sync", () => {
  it("signs in app-only, reads every page of production projects, and saves them", async () => {
    autodeskAnswers([Array.from({ length: 200 }, (_, i) => project(i)), [project(200), project(201)]]);
    const response = await sync();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ jobs: 202, matched: 0 });

    const [tokenUrl, tokenInit] = autodesk.mock.calls[0];
    expect(tokenUrl).toBe("https://developer.api.autodesk.com/authentication/v2/token");
    expect(tokenInit.headers.Authorization).toBe(`Basic ${Buffer.from("test-client:test-secret").toString("base64")}`);
    expect(String(tokenInit.body)).toBe("grant_type=client_credentials&scope=account%3Aread");

    const page = new URL(String(autodesk.mock.calls[1][0]));
    // The "b." hub prefix is dropped, as the Admin API asks.
    expect(page.pathname).toBe("/construction/admin/v1/accounts/00000000-0000-4000-8000-0000000000aa/projects");
    expect(page.searchParams.get("filter[classification]")).toBe("production");
    expect(autodesk.mock.calls[1][1].headers.Authorization).toBe("Bearer test-token");
    expect(autodesk).toHaveBeenCalledTimes(3);

    const { rows } = await db.query<{ count: string }>(`select count(*) from jobs`);
    expect(Number(rows[0].count)).toBe(202);
  });

  it("updates a job in place and keeps one ACC archived", async () => {
    autodeskAnswers([[project(1)]]);
    await sync();
    autodeskAnswers([[project(1, { name: "Synthetic Job 1, Renamed", status: "archived" })]]);
    await sync();
    const { rows } = await db.query<{ name: string; status: string; job_number: string; start_date: string | Date }>(
      `select name, status, job_number, start_date from jobs`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "Synthetic Job 1, Renamed", status: "archived", job_number: "C00001" });
  });

  it("says Autodesk is not set up when a setting is missing", async () => {
    vi.stubEnv("ACC_ACCOUNT_ID", "");
    expect((await sync()).status).toBe(503);
    expect(autodesk).not.toHaveBeenCalled();
  });

  it("passes on an Autodesk refusal as a 502", async () => {
    autodesk.mockImplementation(async () => json({ developerMessage: "The client_id specified does not have access to the api product" }, 403));
    const response = await sync();
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("The client_id specified does not have access to the api product");
  });

  it("logs each refresh as an Autodesk Projects run, with jobs added and changed (LA-3048)", async () => {
    autodeskAnswers([[project(1)]]);
    await sync();
    autodeskAnswers([[project(1), project(2), project(3)]]);
    await sync();
    expect(await sourceRuns(db)).toEqual([
      { source_key: "autodesk_projects", trigger: "button", outcome: "ok", rows_added: 1, rows_changed: 0, error: null, finished: true },
      { source_key: "autodesk_projects", trigger: "button", outcome: "ok", rows_added: 2, rows_changed: 1, error: null, finished: true },
    ]);
  });

  it("answers 409 to a second refresh while the first is running, so only one run is made (LA-3049)", async () => {
    let open!: () => void;
    const gate = new Promise<void>((done) => (open = done));
    autodeskAnswers([[project(1)]]);
    const answers = autodesk.getMockImplementation()!;
    autodesk.mockImplementation(async (...args: unknown[]) => {
      await gate;
      return answers(...(args as [string]));
    });
    const first = sync();
    await vi.waitFor(() => expect(autodesk).toHaveBeenCalled());
    const second = await sync();
    expect(second.status).toBe(409);
    expect((await second.json()).error).toBe("Autodesk Projects is already refreshing. Try again in a minute.");
    open();
    expect((await first).status).toBe(200);
    expect(await sourceRuns(db)).toHaveLength(1);
  });

  it("logs an Autodesk refusal as a failed run and still answers 502 (LA-3048)", async () => {
    autodesk.mockImplementation(async () => json({ developerMessage: "No access" }, 403));
    expect((await sync()).status).toBe(502);
    expect(await sourceRuns(db)).toEqual([
      { source_key: "autodesk_projects", trigger: "button", outcome: "failed", rows_added: null, rows_changed: null, error: "No access", finished: true },
    ]);
  });
});
