import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { addReader, revokeReader } from "@/lib/rom/budget-comments";
import { newToken, publishBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { GET } from "./route";

// LA-1486. /b/r/<readerKey> sets the reader and device cookies and sends the
// reader to the project's newest open version. A bad key answers the same
// plain 404 as an unknown budget token.

const testDb = vi.hoisted(() => ({ current: null as Db | null }));

vi.mock("@/lib/db", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getDb: () => {
    if (!testDb.current) throw new Error("No test database.");
    return testDb.current;
  },
}));

let db: Awaited<ReturnType<typeof seededDatabase>>;
let runId: string;

const COPY = { preparedFor: "A", preparedBy: "B", validityDays: 90, coverSentence: null };

beforeEach(async () => {
  db = await seededDatabase();
  testDb.current = db as Db;
  ({ runId } = await runRom(db as Db, TEST_PROJECT_ID));
});

afterEach(async () => {
  testDb.current = null;
  vi.unstubAllEnvs();
  await db.close();
});

function open(key: string, headers: Record<string, string> = {}) {
  return GET(new Request(`http://localhost/b/r/${key}`, { headers }), { params: Promise.resolve({ key }) });
}

const publish = () => publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
const reader = () =>
  addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Dan Reyes", email: "dan@example.com", company: "Fieldstone", createdBy: "devin@example.com" });

function cookies(response: Response): string[] {
  return response.headers.getSetCookie();
}

async function expectPlain404(response: Response) {
  expect(response.status).toBe(404);
  expect(await response.text()).toBe("Not Found");
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(response.headers.get("location")).toBeNull();
}

describe("GET /b/r/<readerKey>", () => {
  it("redirects with a 303 to the newest open version and drops the key from the address", async () => {
    await publish();
    const second = await publish();
    const dan = await reader();

    const response = await open(dan.readerKey);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`http://localhost/b/${second.token}`);
    expect(response.headers.get("location")).not.toContain(dan.readerKey);
  });

  it("sets the reader cookie and a device cookie, both HttpOnly, Secure and SameSite=Lax on /b", async () => {
    await publish();
    const dan = await reader();

    const set = cookies(await open(dan.readerKey));

    expect(set).toHaveLength(2);
    const readerCookie = set.find((c) => c.startsWith("kulka-reader="))!;
    const deviceCookie = set.find((c) => c.startsWith("kulka-device="))!;
    expect(readerCookie).toContain(`kulka-reader=${dan.readerKey};`);
    expect(deviceCookie).toMatch(/^kulka-device=[A-Za-z0-9_-]{22};/);
    for (const cookie of set) {
      expect(cookie).toContain("Path=/b;");
      expect(cookie).toContain("HttpOnly");
      expect(cookie).toContain("Secure");
      expect(cookie).toContain("SameSite=Lax");
    }
  });

  it("gives each new browser its own device id and keeps the one a browser already has", async () => {
    await publish();
    const dan = await reader();
    const deviceOf = (response: Response) => cookies(response).find((c) => c.startsWith("kulka-device="))!.split(";")[0];

    const first = deviceOf(await open(dan.readerKey));
    const other = deviceOf(await open(dan.readerKey));
    expect(other).not.toBe(first);

    const held = newToken();
    expect(deviceOf(await open(dan.readerKey, { cookie: `kulka-device=${held}` }))).toBe(`kulka-device=${held}`);
    const bad = deviceOf(await open(dan.readerKey, { cookie: "kulka-device=not-a-device-id" }));
    expect(bad).toMatch(/^kulka-device=[A-Za-z0-9_-]{22}$/);
    expect(bad).not.toContain("not-a-device-id");
  });

  it("sends the same no-store, noindex and no-referrer headers as a budget link", async () => {
    await publish();
    const dan = await reader();
    for (const response of [await open(dan.readerKey), await open(newToken())]) {
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(response.headers.get("referrer-policy")).toBe("no-referrer");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("opens Version 2 with the same link once Version 2 is published", async () => {
    const first = await publish();
    const dan = await reader();
    expect((await open(dan.readerKey)).headers.get("location")).toBe(`http://localhost/b/${first.token}`);

    const second = await publish();
    expect((await open(dan.readerKey)).headers.get("location")).toBe(`http://localhost/b/${second.token}`);
  });

  it("skips a withdrawn newest version and opens the one before it", async () => {
    const first = await publish();
    const second = await publish();
    await revokePublishedBudget(db as Db, second.id);
    const dan = await reader();

    expect((await open(dan.readerKey)).headers.get("location")).toBe(`http://localhost/b/${first.token}`);
  });

  it("builds the redirect on KULKA_SITE_URL when it is set", async () => {
    vi.stubEnv("KULKA_SITE_URL", "https://kulka.example");
    const first = await publish();
    const dan = await reader();

    expect((await open(dan.readerKey)).headers.get("location")).toBe(`https://kulka.example/b/${first.token}`);
  });

  it("answers a malformed key with the plain 404", async () => {
    await publish();
    for (const key of ["short", "x".repeat(23), "has space in the key!!!", "'; drop table budget_readers; --"]) {
      await expectPlain404(await open(key));
    }
  });

  it("answers an unknown key with the plain 404", async () => {
    await publish();
    await expectPlain404(await open(newToken()));
  });

  it("answers a revoked key with the plain 404 on the next request", async () => {
    await publish();
    const dan = await reader();
    expect((await open(dan.readerKey)).status).toBe(303);

    await revokeReader(db as Db, dan.id);

    await expectPlain404(await open(dan.readerKey));
    // The browser's old cookie does not help: the route reads only the key in the address.
    await expectPlain404(await open(dan.readerKey, { cookie: `kulka-reader=${dan.readerKey}` }));
  });

  it("answers a project with no open version with the plain 404", async () => {
    const dan = await reader();
    await expectPlain404(await open(dan.readerKey));

    const only = await publish();
    await revokePublishedBudget(db as Db, only.id);
    await expectPlain404(await open(dan.readerKey));
  });

  it("gives an unknown key the same status, body and headers as an unknown budget token", async () => {
    const { GET: openToken } = await import("../../[token]/route");
    const token = newToken();
    const budget = await openToken(new Request(`http://localhost/b/${token}`), { params: Promise.resolve({ token }) });
    const key = await open(newToken());

    expect(key.status).toBe(budget.status);
    expect(await key.text()).toBe(await budget.text());
    expect([...key.headers].sort()).toEqual([...budget.headers].sort());
  });
});
