import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { addReader, closeThread, openThread, replyToThread, revokeReader, type BudgetReader } from "@/lib/rom/budget-comments";
import type { CommentLayer } from "@/lib/rom/comment-layer";
import { newToken, publishBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { GET as page } from "./route";
import { GET as threads } from "./threads/route";

// LA-1489. The comment layer reaches only a reader's browser: the plain link,
// the print render, a revoked reader and a reader of another project get none
// of it, and no reader's email or id ever reaches the page.

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
let dan: BudgetReader;
let rosa: BudgetReader;

const COPY = { preparedFor: "A", preparedBy: "B", validityDays: 90, coverSentence: null };
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-0000000000aa";
const STAFF = { name: "Sam Ortiz", account: "open-access@kulka.invalid" };

const publish = () => publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });

beforeEach(async () => {
  db = await seededDatabase();
  testDb.current = db as Db;
  ({ runId } = await runRom(db as Db, TEST_PROJECT_ID));
  dan = await addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Dan Reyes", email: "dan@example.com", company: "Fieldstone", createdBy: "devin@example.com" });
  rosa = await addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Rosa Lin", email: "rosa@example.com", createdBy: "devin@example.com" });
});

afterEach(async () => {
  testDb.current = null;
  await db.close();
});

function request(path: string, reader: string | null): Request {
  return new Request(`http://localhost${path}`, { headers: reader ? { cookie: `kulka-reader=${reader}; kulka-device=${newToken()}` } : {} });
}
const html = async (token: string, reader: string | null, query = "") =>
  (await page(request(`/b/${token}${query}`, reader), { params: Promise.resolve({ token }) })).text();
const layerIn = (text: string): CommentLayer | null => {
  const m = text.match(/<script type="application\/json" id="cm-data">([\s\S]*?)<\/script>/);
  return m ? (JSON.parse(m[1]) as CommentLayer) : null;
};

const question = (publishedBudgetId: string, by = dan, elementId = "section:your-number") =>
  openThread(db as Db, {
    publishedBudgetId,
    readerId: by.id,
    deviceId: newToken(),
    elementId,
    anchor: { label: "The Opening", text: "Version 1", figure: null },
    kind: "question",
    body: "Is this the <b>latest</b>?",
  });

describe("the page at /b/<token>", () => {
  it("carries no comment layer without a reader cookie", async () => {
    const { token } = await publish();
    const text = await html(token, null);
    expect(text).not.toContain("cm-data");
    expect(text).not.toContain("comments.js");
    expect(text).not.toContain("comments.css");
    expect(text).not.toContain("hd-cmt");
  });

  it("carries the layer, the control and its assets for a reader", async () => {
    const { token, id } = await publish();
    await question(id);
    const text = await html(token, dan.readerKey);
    expect(text).toContain('<link rel="stylesheet" href="/scrollcraft/comments.css">');
    expect(text).toContain('<script src="/scrollcraft/comments.js"></script>');
    expect(text).toContain("data-cm-toggle");
    const layer = layerIn(text);
    expect(layer).toMatchObject({ version: 1, takesNew: true, reader: { name: "Dan Reyes", company: "Fieldstone" } });
    expect(layer?.threads).toHaveLength(1);
    expect(layer?.threads[0]).toMatchObject({ on: "section:your-number", kind: "question", status: "open", mine: true, by: { name: "Dan Reyes" } });
    expect(layer?.elements.some(([id]) => id === "record:prepared-by")).toBe(true);
    expect(layer?.elements.some(([id]) => id === "page:general")).toBe(false);
  });

  it("never carries the layer in print, even for a reader", async () => {
    const { token, id } = await publish();
    await question(id);
    const text = await html(token, dan.readerKey, "?print=1");
    expect(text).not.toContain("cm-data");
    expect(text).not.toContain("comments.js");
    expect(text).not.toContain("Is this the");
  });

  it("carries no layer for a revoked reader or a reader of another project", async () => {
    const { token } = await publish();
    await db.query(
      `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
       values ($1, 'Second synthetic project', 'multifamily', 'new', 2000)`,
      [OTHER_PROJECT_ID],
    );
    const stranger = await addReader(db as Db, { projectId: OTHER_PROJECT_ID, name: "Pat", email: "pat@example.com", createdBy: "devin@example.com" });
    await revokeReader(db as Db, rosa.id);
    expect(await html(token, rosa.readerKey)).not.toContain("cm-data");
    expect(await html(token, stranger.readerKey)).not.toContain("cm-data");
    expect(await html(token, "not-a-reader-key")).not.toContain("cm-data");
  });

  it("sends no email, no reader id and no staff account, and escapes what a reader wrote", async () => {
    const { token, id } = await publish();
    const { thread } = await question(id);
    await replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Yes." });
    await replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Internal only.", internal: true });
    const text = await html(token, rosa.readerKey);
    expect(text).not.toContain("dan@example.com");
    expect(text).not.toContain(dan.id);
    expect(text).not.toContain(dan.readerKey);
    expect(text).not.toContain("open-access@kulka.invalid");
    expect(text).not.toContain("Internal only.");
    expect(text).not.toContain("<b>latest</b>");
    const layer = layerIn(text);
    expect(layer?.threads[0]).toMatchObject({ mine: false, status: "answered" });
    expect(layer?.threads[0].messages.map((m) => [m.author, m.company, m.kulka, m.body])).toEqual([
      ["Dan Reyes", "Fieldstone", false, "Is this the <b>latest</b>?"],
      ["Sam Ortiz", "The Kulka Group", true, "Yes."],
    ]);
  });

  it("shows a superseded version its own threads and takes no new ones there", async () => {
    const first = await publish();
    await question(first.id);
    await publish();
    const layer = layerIn(await html(first.token, dan.readerKey));
    expect(layer).toMatchObject({ version: 1, takesNew: false });
    expect(layer?.threads).toHaveLength(1);
  });

  it("carries an open thread onto the newest version and lists a missing element under From Earlier Versions", async () => {
    const first = await publish();
    const kept = await question(first.id);
    const gone = await question(first.id, dan, "line:no-longer-here");
    const closed = await question(first.id);
    await closeThread(db as Db, { threadId: closed.thread.id, by: { kind: "reader", readerId: dan.id } });
    const second = await publish();
    const layer = layerIn(await html(second.token, dan.readerKey));
    const byId = new Map(layer?.threads.map((t) => [t.id, t]));
    expect(byId.get(kept.thread.id)).toMatchObject({ on: "section:your-number", fromVersion: 1, version: 1 });
    expect(byId.get(gone.thread.id)).toMatchObject({ on: null, fromVersion: 1 });
    expect(byId.has(closed.thread.id)).toBe(false);
  });

  it("carries no layer on a withdrawn version", async () => {
    const { token, id } = await publish();
    await revokePublishedBudget(db as Db, id);
    expect(await html(token, dan.readerKey)).not.toContain("cm-data");
  });
});

describe("GET /b/<token>/threads", () => {
  const get = (token: string, reader: string | null) => threads(request(`/b/${token}/threads`, reader), { params: Promise.resolve({ token }) });

  it("returns the same layer the page carries, for a reader", async () => {
    const { token, id } = await publish();
    await question(id);
    const res = await get(token, dan.readerKey);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const layer = (await res.json()) as CommentLayer;
    expect(layer).toEqual(layerIn(await html(token, dan.readerKey)));
  });

  it("answers a plain 403 without a reader, and a 404 for an unknown or withdrawn budget", async () => {
    const { token, id } = await publish();
    expect((await get(token, null)).status).toBe(403);
    expect((await get(newToken(), dan.readerKey)).status).toBe(404);
    await revokePublishedBudget(db as Db, id);
    expect((await get(token, dan.readerKey)).status).toBe(404);
  });
});
