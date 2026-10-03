import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { MAX_JSON_BODY_BYTES } from "@/lib/http/json-body";
import { addressableElements } from "@/lib/rom/addressable-elements";
import { addReader, closeThread, loadThread, openThread, revokeReader, type BudgetReader } from "@/lib/rom/budget-comments";
import { presentBudget } from "@/lib/rom/presentation";
import { loadPublishedBudget, newToken, publishBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { MAX_MESSAGES_PER_DAY, MAX_READER_POST_BYTES, MAX_THREADS_PER_DAY } from "@/lib/rom/reader-posts";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { POST as openRoute } from "./route";
import { POST as closeRoute } from "./[id]/close/route";
import { POST as replyRoute } from "./[id]/messages/route";

// LA-1487. The reader routes under /b/<token>/threads and the seven checks
// each one runs. Every check has tests that fail when the check is removed.
// A failed check answers a plain 404, 403 or 429 with a fixed body, so a test
// can compare the answer with what an unknown budget gives, and read nothing
// into which check said no.

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
let deviceId: string;
let tokenV1: string;
let idV1: string;

const COPY = { preparedFor: "A", preparedBy: "B", validityDays: 90, coverSentence: null };
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-0000000000aa";

const publish = () => publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
const newReader = (projectId = TEST_PROJECT_ID, name = "Dan Reyes") =>
  addReader(db as Db, { projectId, name, email: `${name.split(" ")[0].toLowerCase()}@example.com`, createdBy: "devin@example.com" });

beforeEach(async () => {
  db = await seededDatabase();
  testDb.current = db as Db;
  ({ runId } = await runRom(db as Db, TEST_PROJECT_ID));
  const first = await publish();
  tokenV1 = first.token;
  idV1 = first.id;
  dan = await newReader();
  deviceId = newToken();
});

afterEach(async () => {
  testDb.current = null;
  vi.unstubAllEnvs();
  await db.close();
});

type Send = {
  token?: string;
  reader?: string | null;
  device?: string | null;
  origin?: string | null;
  contentType?: string | null;
  /** An object is sent as JSON. A string is sent as it is. */
  body?: unknown;
};

function request(path: string, send: Send): Request {
  const headers: Record<string, string> = {};
  const reader = send.reader === undefined ? dan.readerKey : send.reader;
  const device = send.device === undefined ? deviceId : send.device;
  const cookie = [reader ? `kulka-reader=${reader}` : null, device ? `kulka-device=${device}` : null].filter(Boolean).join("; ");
  if (cookie) headers.cookie = cookie;
  const origin = send.origin === undefined ? "http://localhost" : send.origin;
  if (origin !== null) headers.origin = origin;
  const type = send.contentType === undefined ? "application/json" : send.contentType;
  if (type !== null) headers["content-type"] = type;
  const body = typeof send.body === "string" ? send.body : JSON.stringify(send.body ?? {});
  return new Request(`http://localhost${path}`, { method: "POST", headers, body });
}

const token = (send: Send) => send.token ?? tokenV1;

const open = (send: Send) =>
  openRoute(request(`/b/${token(send)}/threads`, send), { params: Promise.resolve({ token: token(send) }) });
const reply = (id: string, send: Send) =>
  replyRoute(request(`/b/${token(send)}/threads/${id}/messages`, send), { params: Promise.resolve({ token: token(send), id }) });
const close = (id: string, send: Send = {}) =>
  closeRoute(request(`/b/${token(send)}/threads/${id}/close`, send), { params: Promise.resolve({ token: token(send), id }) });

async function elements(forToken = tokenV1) {
  const view = await loadPublishedBudget(db as Db, forToken);
  if (!view || view.state === "withdrawn") throw new Error("No view.");
  const page = presentBudget({ snapshot: view.snapshot, version: view.version, stage: view.stage, issuedAt: view.issuedAt, newer: view.newer });
  return addressableElements(page);
}

async function ids() {
  const all = [...(await elements()).keys()];
  const fact = all.find((id) => id.startsWith("fact:"));
  const line = all.find((id) => id.startsWith("line:"));
  if (!fact || !line) throw new Error("The reference page has no fact or line.");
  return { fact, line };
}

const note = (element_id: string, extra: Record<string, unknown> = {}) => ({
  kind: "comment",
  element_id,
  body: "Is the garage in this?",
  ...extra,
});

async function startThread(element?: string, who: BudgetReader = dan, version = idV1) {
  const { line } = await ids();
  return openThread(db as Db, {
    publishedBudgetId: version,
    readerId: who.id,
    deviceId,
    elementId: element ?? line,
    anchor: { section: "x", label: "x", text: "x", figure: null },
    kind: "comment",
    body: "A starting comment.",
  });
}

async function plain(response: Response, status: number, text: string) {
  expect(response.status).toBe(status);
  expect(await response.text()).toBe(text);
  expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
}
const expect404 = (r: Response) => plain(r, 404, "Not Found");
const expect403 = (r: Response) => plain(r, 403, "Forbidden");
const expect429 = (r: Response) => plain(r, 429, "Too Many Requests");

async function rowCounts() {
  const { rows } = await db.query<{ threads: number; messages: number }>(
    `select (select count(*) from budget_threads)::int as threads, (select count(*) from budget_messages)::int as messages`,
  );
  return rows[0];
}

describe("the routes, when every check passes", () => {
  it("opens a thread with its first message and builds the anchor from the page model", async () => {
    const { line } = await ids();
    const model = (await elements()).get(line)!;

    const response = await open({ body: note(line, { anchor: { label: "Forged" } }) });

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");
    const answer = await response.json();
    expect(answer.thread).toMatchObject({ kind: "comment", element_id: line, status: "open" });
    expect(answer.message.body).toBe("Is the garage in this?");
    const loaded = await loadThread(db as Db, answer.thread.id);
    expect(loaded!.thread.anchor).toEqual({ section: model.section, label: model.label, text: model.text, figure: model.figure });
    expect(loaded!.thread.publishedBudgetId).toBe(idV1);
    expect(loaded!.thread.openedBy).toBe(dan.id);
    expect(loaded!.messages[0]).toMatchObject({ readerId: dan.id, deviceId, visibility: "client", authorKind: "reader" });
  });

  it("opens a comment on page:general with no section, and a flag on an assumption with its correction", async () => {
    const general = await open({ body: { kind: "question", element_id: "page:general", body: "When is this good until?" } });
    expect(general.status).toBe(201);
    const generalId = (await general.json()).thread.id;
    expect((await loadThread(db as Db, generalId))!.thread.anchor.section).toBeNull();

    const { fact } = await ids();
    const flagged = await open({ body: { kind: "flag", element_id: fact, proposed: "1,200 SF", body: "We added a floor." } });
    expect(flagged.status).toBe(201);
    expect((await flagged.json()).thread).toMatchObject({ kind: "flag", proposed: "1,200 SF" });
  });

  it("replies, and closes by the reader who opened the thread", async () => {
    const { thread } = await startThread();

    const replied = await reply(thread.id, { body: { body: "One more thing." } });
    expect(replied.status).toBe(201);
    expect((await replied.json()).message.body).toBe("One more thing.");

    const closed = await close(thread.id);
    expect(closed.status).toBe(200);
    expect((await closed.json()).thread).toMatchObject({ id: thread.id, status: "closed" });
  });

  it("withdraws a flag when its reader closes it", async () => {
    const { fact } = await ids();
    const flagged = await (await open({ body: { kind: "flag", element_id: fact, proposed: "1,200 SF" } })).json();
    const closed = await (await close(flagged.thread.id)).json();
    expect(closed.thread).toMatchObject({ status: "closed", outcome: "withdrawn" });
  });

  it("sets the device cookie when the browser has none, and keeps the one it has", async () => {
    const { line } = await ids();
    const fresh = await open({ device: null, body: note(line) });
    expect(fresh.status).toBe(201);
    expect(fresh.headers.getSetCookie().join(";")).toMatch(/kulka-device=[A-Za-z0-9_-]{22}/);

    const held = await open({ body: note(line) });
    expect(held.headers.getSetCookie()).toEqual([]);
  });

  it("sends the no-store, noindex and nosniff headers and never the reader key", async () => {
    const { line } = await ids();
    const response = await open({ body: note(line) });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).not.toContain(dan.readerKey);
  });

  it("returns the body through esc and stores it as typed", async () => {
    const { line } = await ids();
    const typed = `<script>alert("x")</script> & <b>bold</b>`;
    const answer = await (await open({ body: note(line, { body: typed }) })).json();
    expect(answer.message.body).toBe(typed);
    expect(answer.message.bodyHtml).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;");
    expect(answer.message.bodyHtml).not.toContain("<");
  });

  it("answers a thread with no opening message as a flag without a Why", async () => {
    const { fact } = await ids();
    const flagged = await (await open({ body: { kind: "flag", element_id: fact, proposed: "1,200 SF" } })).json();
    expect(flagged.message).toBeNull();
  });
});

describe("check 1: the token names a row that takes this post", () => {
  it("answers an unknown or malformed token with the plain 404 on every route", async () => {
    const { thread } = await startThread();
    const { line } = await ids();
    for (const bad of [newToken(), "short", "x".repeat(23), "'; drop table budget_threads; --"]) {
      await expect404(await open({ token: bad, body: note(line) }));
      await expect404(await reply(thread.id, { token: bad, body: { body: "hi" } }));
      await expect404(await close(thread.id, { token: bad }));
    }
    expect(await rowCounts()).toEqual({ threads: 1, messages: 1 });
  });

  it("takes no post on a withdrawn version, not a thread, a reply or a close", async () => {
    const { thread } = await startThread();
    const { line } = await ids();
    await revokePublishedBudget(db as Db, idV1);

    await expect404(await open({ body: note(line) }));
    await expect404(await reply(thread.id, { body: { body: "hi" } }));
    await expect404(await close(thread.id));
    expect(await rowCounts()).toEqual({ threads: 1, messages: 1 });
  });

  it("takes no new thread on a superseded version, and still takes a reply and a close on its own thread", async () => {
    const { thread } = await startThread();
    const { line } = await ids();
    await publish();

    await expect404(await open({ body: note(line) }));
    expect((await reply(thread.id, { body: { body: "Still here." } })).status).toBe(201);
    expect((await close(thread.id)).status).toBe(200);
  });

  it("takes a new thread on a version again once the newer one is withdrawn", async () => {
    const { line } = await ids();
    const second = await publish();
    await revokePublishedBudget(db as Db, second.id);
    expect((await open({ body: note(line) })).status).toBe(201);
  });

  it("gives an unknown token the same answer as the budget page does", async () => {
    const { GET } = await import("../route");
    const unknown = newToken();
    const page = await GET(new Request(`http://localhost/b/${unknown}`), { params: Promise.resolve({ token: unknown }) });
    const post = await open({ token: unknown, body: note("page:general") });
    expect(post.status).toBe(page.status);
    expect(await post.text()).toBe(await page.text());
  });
});

describe("check 2: the reader cookie names an unrevoked reader on the same project", () => {
  it("answers a post with no reader cookie with the plain 403", async () => {
    const { thread } = await startThread();
    const { line } = await ids();
    await expect403(await open({ reader: null, body: note(line) }));
    await expect403(await reply(thread.id, { reader: null, body: { body: "hi" } }));
    await expect403(await close(thread.id, { reader: null }));
    expect(await rowCounts()).toEqual({ threads: 1, messages: 1 });
  });

  it("answers a malformed or unknown reader key with the plain 403", async () => {
    const { line } = await ids();
    for (const key of ["junk", newToken(), "x".repeat(23)]) {
      await expect403(await open({ reader: key, body: note(line) }));
    }
  });

  it("stops a revoked reader on the next post", async () => {
    const { line } = await ids();
    const { thread } = await startThread();
    expect((await open({ body: note(line) })).status).toBe(201);

    await revokeReader(db as Db, dan.id);

    await expect403(await open({ body: note(line) }));
    await expect403(await reply(thread.id, { body: { body: "hi" } }));
    await expect403(await close(thread.id));
  });

  it("answers a reader from another project with the plain 403", async () => {
    await db.query(
      `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
       values ($1, 'Second synthetic project', 'multifamily', 'new', 2000)`,
      [OTHER_PROJECT_ID],
    );
    const pat = await newReader(OTHER_PROJECT_ID, "Pat Other");
    const { thread } = await startThread();
    const { line } = await ids();

    await expect403(await open({ reader: pat.readerKey, body: note(line) }));
    await expect403(await reply(thread.id, { reader: pat.readerKey, body: { body: "hi" } }));
    await expect403(await close(thread.id, { reader: pat.readerKey }));
  });

  it("reads the cookie and nothing in the body or the address", async () => {
    const { line } = await ids();
    await expect403(await open({ reader: null, body: { ...note(line), reader: dan.readerKey, reader_id: dan.id } }));
  });
});

describe("check 3: same origin, JSON, under 8 KB", () => {
  it("answers a missing or foreign Origin with the plain 403 on every route", async () => {
    const { thread } = await startThread();
    const { line } = await ids();
    for (const origin of [null, "https://evil.example", "http://localhost.evil.example", "null"]) {
      await expect403(await open({ origin, body: note(line) }));
      await expect403(await reply(thread.id, { origin, body: { body: "hi" } }));
      await expect403(await close(thread.id, { origin }));
    }
    expect(await rowCounts()).toEqual({ threads: 1, messages: 1 });
  });

  it("compares the Origin with KULKA_SITE_URL when it is set", async () => {
    vi.stubEnv("KULKA_SITE_URL", "https://kulka.example");
    const { line } = await ids();
    await expect403(await open({ origin: "http://localhost", body: note(line) }));
    expect((await open({ origin: "https://kulka.example", body: note(line) })).status).toBe(201);
  });

  it("answers a body that is not JSON with the plain 403", async () => {
    const { line } = await ids();
    await expect403(await open({ body: "kind=comment&element_id=page:general&body=hi", contentType: "application/x-www-form-urlencoded" }));
    await expect403(await open({ body: JSON.stringify(note(line)), contentType: "text/plain" }));
    await expect403(await open({ body: JSON.stringify(note(line)), contentType: null }));
    await expect403(await open({ body: "{not json" }));
    await expect403(await open({ body: "" }));
  });

  it("answers a body over 8 KB with the plain 403, though the shared cap is 1 MB", async () => {
    expect(MAX_READER_POST_BYTES).toBe(8 * 1024);
    expect(MAX_READER_POST_BYTES).toBeLessThan(MAX_JSON_BODY_BYTES);
    const { line } = await ids();
    // Under the 4,000 character message cap, so only the byte cap can stop it.
    const padded = JSON.stringify({ ...note(line), padding: "x".repeat(MAX_READER_POST_BYTES) });
    expect(padded.length).toBeGreaterThan(MAX_READER_POST_BYTES);
    await expect403(await open({ body: padded }));
    expect(await rowCounts()).toEqual({ threads: 0, messages: 0 });
  });

  it("takes a body just under 8 KB", async () => {
    const { line } = await ids();
    const small = JSON.stringify({ ...note(line), padding: "x".repeat(MAX_READER_POST_BYTES - 200) });
    expect(small.length).toBeLessThan(MAX_READER_POST_BYTES);
    expect((await open({ body: small })).status).toBe(201);
  });

  it("counts the streamed bytes when the request declares no length", async () => {
    const { line } = await ids();
    const big = JSON.stringify({ ...note(line), padding: "x".repeat(MAX_READER_POST_BYTES) });
    const raw = request(`/b/${tokenV1}/threads`, { body: big });
    raw.headers.delete("content-length");
    await expect403(await openRoute(raw, { params: Promise.resolve({ token: tokenV1 }) }));
  });

  it("checks the Origin before the body, so a foreign post never reads it", async () => {
    await expect403(await open({ origin: "https://evil.example", body: "{not json" }));
  });
});

describe("check 4: the element is one the page model holds, and the server builds the anchor", () => {
  it("answers an element that is not on the page with the plain 404", async () => {
    for (const element of ["line:does-not-exist", "note:ffffffffff", "division:03", "page:other", "Line:1a", "../etc", "", 7, null]) {
      await expect404(await open({ body: note(element as string) }));
    }
    await expect404(await open({ body: { kind: "comment", body: "No element at all." } }));
    expect(await rowCounts()).toEqual({ threads: 0, messages: 0 });
  });

  it("answers an element that sits only on another version with the plain 404", async () => {
    // The id is made up from this version's snapshot, so a different one cannot land here.
    const { thread } = await startThread();
    const stranger = `line:${thread.id.slice(0, 8)}`;
    await expect404(await open({ body: note(stranger) }));
  });

  it("takes every id the model holds, for any kind that fits it", async () => {
    const all = [...(await elements()).keys()];
    expect(all).toContain("page:general");
    const sample = all.filter((id) => !id.startsWith("fact:") && id !== "page:general").slice(0, 5);
    for (const element of sample) expect((await open({ body: note(element) })).status).toBe(201);
  });

  it("ignores an anchor sent in the body", async () => {
    const { line } = await ids();
    const forged = { section: "Forged", label: "Forged", text: "Forged", figure: "$1" };
    const answer = await (await open({ body: { ...note(line), anchor: forged, section: "Forged", label: "Forged" } })).json();
    const model = (await elements()).get(line)!;
    const stored = (await loadThread(db as Db, answer.thread.id))!.thread.anchor;
    expect(stored.label).toBe(model.label);
    expect(stored.label).not.toBe("Forged");
    expect(stored.text).not.toBe("Forged");
  });
});

describe("check 5: a flag goes only on an assumption element", () => {
  it("answers a flag on a figure, a total or a line with the plain 403", async () => {
    const { line } = await ids();
    const all = [...(await elements()).keys()];
    const total = all.find((id) => id.startsWith("total:"));
    for (const element of [line, total!, "page:general"]) {
      await expect403(await open({ body: { kind: "flag", element_id: element, proposed: "Something else" } }));
    }
    expect(await rowCounts()).toEqual({ threads: 0, messages: 0 });
  });

  it("takes a flag on a fact, a criterion, a note or a gate, whichever the page has", async () => {
    const all = [...(await elements()).keys()];
    const families = ["fact", "criterion", "note", "gate"].filter((f) => all.some((id) => id.startsWith(`${f}:`)));
    expect(families).toContain("fact");
    for (const family of families) {
      const element = all.find((id) => id.startsWith(`${family}:`))!;
      const response = await open({ body: { kind: "flag", element_id: element, proposed: "Corrected" } });
      expect(response.status, element).toBe(201);
    }
  });

  it("takes a comment or a question on the same figure a flag cannot go on", async () => {
    const { line } = await ids();
    expect((await open({ body: { kind: "comment", element_id: line, body: "Why this?" } })).status).toBe(201);
    expect((await open({ body: { kind: "question", element_id: line, body: "Why this?" } })).status).toBe(201);
  });

  it("answers a flag with no correction with a 400, not a thread", async () => {
    const { fact } = await ids();
    expect((await open({ body: { kind: "flag", element_id: fact, body: "It is wrong." } })).status).toBe(400);
    expect(await rowCounts()).toEqual({ threads: 0, messages: 0 });
  });
});

describe("check 6: a reply or close belongs to this project and shows on this version's page", () => {
  it("answers a thread id that does not exist with the plain 404", async () => {
    for (const id of ["00000000-0000-4000-8000-000000000001", "not-a-uuid", "1; drop table budget_threads"]) {
      await expect404(await reply(id, { body: { body: "hi" } }));
      await expect404(await close(id));
    }
  });

  it("answers a thread on another project with the plain 404, though the reader is active", async () => {
    await db.query(
      `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
       values ($1, 'Second synthetic project', 'multifamily', 'new', 2000)`,
      [OTHER_PROJECT_ID],
    );
    const pat = await newReader(OTHER_PROJECT_ID, "Pat Other");
    // A published version for the other project, so Pat has a thread to point at.
    await db.query(
      `insert into published_budgets (token, run_id, project_id, version, stage, snapshot, issued_by)
       select $1, run_id, $2, 1, stage, snapshot, issued_by from published_budgets where id = $3`,
      [newToken(), OTHER_PROJECT_ID, idV1],
    );
    const { rows } = await db.query<{ id: string }>(`select id from published_budgets where project_id = $1`, [OTHER_PROJECT_ID]);
    const theirs = await startThread("line:1a", pat, rows[0].id);

    await expect404(await reply(theirs.thread.id, { body: { body: "hi" } }));
    await expect404(await close(theirs.thread.id));
    expect((await loadThread(db as Db, theirs.thread.id))!.messages).toHaveLength(1);
  });

  it("carries an open thread to the newest version, so Version 2's page takes a reply to it", async () => {
    const { thread } = await startThread();
    const second = await publish();

    const carried = await reply(thread.id, { token: second.token, body: { body: "Reply from Version 2." } });
    expect(carried.status).toBe(201);
    // The reply stays on the original thread, on the original version.
    const loaded = await loadThread(db as Db, thread.id);
    expect(loaded!.messages).toHaveLength(2);
    expect(loaded!.thread.publishedBudgetId).toBe(idV1);

    expect((await close(thread.id, { token: second.token })).status).toBe(200);
  });

  it("does not show a thread on a version older than the one it was posted on", async () => {
    const second = await publish();
    const onSecond = await startThread("line:1a", dan, second.id);

    await expect404(await reply(onSecond.thread.id, { token: tokenV1, body: { body: "hi" } }));
    await expect404(await close(onSecond.thread.id, { token: tokenV1 }));
  });

  it("does not carry a closed thread to a newer version", async () => {
    const { thread } = await startThread();
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: dan.id } });
    const second = await publish();

    await expect404(await reply(thread.id, { token: second.token, body: { body: "hi" } }));
    await expect404(await close(thread.id, { token: second.token }));
  });

  it("answers a closed thread on its own version's page with a 409, since the page still shows it", async () => {
    const { thread } = await startThread();
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: dan.id } });
    await plain(await reply(thread.id, { body: { body: "hi" } }), 409, "Conflict");
    await plain(await close(thread.id), 409, "Conflict");
  });

  it("lets only the reader who opened a thread close it", async () => {
    const { thread } = await startThread();
    const sam = await newReader(TEST_PROJECT_ID, "Sam Lee");
    await expect403(await close(thread.id, { reader: sam.readerKey }));
    // Sam may still reply on the project's thread.
    expect((await reply(thread.id, { reader: sam.readerKey, body: { body: "Same question here." } })).status).toBe(201);
    expect((await loadThread(db as Db, thread.id))!.thread.status).toBe("open");
  });
});

describe("check 7: 20 threads and 60 messages a day", () => {
  async function fill(threads: number, messages: number, hoursAgo = 0) {
    // Raw inserts, so a test does not pay for a transaction per post.
    const when = `now() - interval '${hoursAgo} hours'`;
    for (let i = 0; i < threads; i++) {
      await db.query(
        `insert into budget_threads (published_budget_id, project_id, element_id, anchor, kind, opened_by, opened_at)
         values ($1, $2, 'page:general', '{}'::jsonb, 'comment', $3, ${when})`,
        [idV1, TEST_PROJECT_ID, dan.id],
      );
    }
    if (messages === 0) return;
    const { rows } = await db.query<{ id: string }>(`select id from budget_threads order by opened_at limit 1`);
    for (let i = 0; i < messages; i++) {
      await db.query(
        `insert into budget_messages (thread_id, author_kind, reader_id, device_id, body, visibility, created_at)
         values ($1, 'reader', $2, $3, 'filler', 'client', ${when})`,
        [rows[0].id, dan.id, deviceId],
      );
    }
  }

  it("takes the 20th thread and answers the 21st with 429", async () => {
    await fill(19, 0);
    expect((await open({ body: note("page:general") })).status).toBe(201);
    await expect429(await open({ body: note("page:general") }));
  });

  it("takes the 60th message and answers the 61st with 429", async () => {
    await fill(1, 58);
    const { rows } = await db.query<{ id: string }>(`select id from budget_threads limit 1`);
    expect((await reply(rows[0].id, { body: { body: "message 59" } })).status).toBe(201);
    expect((await reply(rows[0].id, { body: { body: "message 60" } })).status).toBe(201);
    await expect429(await reply(rows[0].id, { body: { body: "message 61" } }));
  });

  it("counts the opening message toward the 60, and stops a thread whose message would be the 61st", async () => {
    await fill(1, 60);
    await expect429(await open({ body: note("page:general") }));
    expect((await rowCounts()).threads).toBe(1);
  });

  it("lets a flag with no Why open at 60 messages, since it adds none", async () => {
    await fill(1, 60);
    const { fact } = await ids();
    expect((await open({ body: { kind: "flag", element_id: fact, proposed: "Corrected" } })).status).toBe(201);
  });

  it("counts each reader on their own", async () => {
    await fill(20, 0);
    const sam = await newReader(TEST_PROJECT_ID, "Sam Lee");
    await expect429(await open({ body: note("page:general") }));
    expect((await open({ reader: sam.readerKey, body: note("page:general") })).status).toBe(201);
  });

  it("counts a rolling day, so posts from the day before do not count", async () => {
    await fill(20, 60, 30);
    expect((await open({ body: note("page:general") })).status).toBe(201);
  });

  it("uses the limits the spec names", () => {
    expect(MAX_THREADS_PER_DAY).toBe(20);
    expect(MAX_MESSAGES_PER_DAY).toBe(60);
  });

  it("does not stop a close, which adds no row", async () => {
    await fill(20, 60);
    const { thread } = await openThreadDirect();
    expect((await close(thread)).status).toBe(200);
  });

  async function openThreadDirect() {
    const { rows } = await db.query<{ id: string }>(`select id from budget_threads order by opened_at limit 1`);
    return { thread: rows[0].id };
  }
});

describe("the order of the checks", () => {
  it("answers a withdrawn version with 404 before it looks at the cookie, so a stranger learns nothing", async () => {
    await revokePublishedBudget(db as Db, idV1);
    await expect404(await open({ reader: null, origin: null, body: "{not json" }));
  });

  it("answers a bad cookie with 403 before it looks at the Origin or the body", async () => {
    await expect403(await open({ reader: null, origin: "https://evil.example", body: "{not json" }));
  });

  it("runs the element check before the flag check, and the flag check before the limit", async () => {
    const { line } = await ids();
    await expect404(await open({ body: { kind: "flag", element_id: "line:missing", proposed: "x" } }));
    await expect403(await open({ body: { kind: "flag", element_id: line, proposed: "x" } }));
  });
});

// LA-1492. The webhook push after a post that needs Kulka.
describe("the comment webhook", () => {
  const HOOK = "https://hooks.example.com/services/secret-path";
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv("KULKA_COMMENT_WEBHOOK_URL", HOOK);
    fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends once when a reader opens a thread, with the link built from the request", async () => {
    const { line } = await ids();
    const response = await open({ body: note(line) });
    expect(response.status).toBe(201);
    const thread = (await response.json()).thread;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(JSON.parse(String(init.body)).link).toBe(`http://localhost/rom?project=${TEST_PROJECT_ID}&thread=${thread.id}`);
  });

  it("sends once more when a reader replies, since the thread needs Kulka again", async () => {
    const { thread } = await startThread();
    expect(fetchMock).not.toHaveBeenCalled();

    const replied = await reply(thread.id, { body: { body: "One more thing." } });
    expect(replied.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect((await reply(thread.id, { body: { body: "And another." } })).status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends nothing when a reader closes a thread", async () => {
    const { line } = await ids();
    const opened = await (await open({ body: note(line) })).json();
    fetchMock.mockClear();

    const closed = await close(opened.thread.id);
    expect(closed.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when a post is refused", async () => {
    expect((await open({ body: { kind: "comment", element_id: "line:missing", body: "x" } })).status).toBe(404);
    expect((await open({ reader: null, body: note("page:general") })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends nothing when the variable is unset", async () => {
    vi.stubEnv("KULKA_COMMENT_WEBHOOK_URL", "");
    expect((await open({ body: note("page:general") })).status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still saves and answers 201 when the send is rejected, throws, or gets an error status", async () => {
    const failures: Array<() => Promise<Response>> = [
      () => Promise.reject(new Error(`connect failed to ${HOOK}`)),
      () => {
        throw new Error("fetch blew up");
      },
      () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
      async () => new Response("no", { status: 500 }),
    ];
    const { thread } = await startThread();
    for (const failure of failures) {
      fetchMock.mockImplementationOnce(failure);
      const opened = await open({ body: note("page:general") });
      expect(opened.status).toBe(201);
      expect((await opened.json()).message.body).toBe("Is the garage in this?");

      fetchMock.mockImplementationOnce(failure);
      const replied = await reply(thread.id, { body: { body: "A reply during an outage." } });
      expect(replied.status).toBe(201);
    }
    const counts = await rowCounts();
    expect(counts.threads).toBe(1 + failures.length);
    expect(counts.messages).toBe(1 + failures.length * 2);
    for (const call of vi.mocked(console.error).mock.calls) expect(String(call[0])).not.toContain("secret-path");
  });
});
