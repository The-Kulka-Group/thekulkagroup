import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { addReader, loadThread, openThread, type BudgetReader } from "@/lib/rom/budget-comments";
import { newToken, publishBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1490. Kulka's side of client comments: Reply, Internal Note, Close,
// Accept for Next Version, Decline and Remove, and the project list the
// panel reads. Each route refuses a signed-out request, rejects a bad id and
// a missing Reply As, and keeps the module's rules (a decline needs a reply,
// a flag takes no plain Close, a closed thread takes nothing).

let db: Awaited<ReturnType<typeof seededDatabase>>;
let version1: string;
let reader: BudgetReader;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { GET: listComments } = await import("../projects/[id]/comments/route");
const { POST: reply } = await import("./threads/[id]/reply/route");
const { POST: close } = await import("./threads/[id]/close/route");
const { POST: accept } = await import("./threads/[id]/accept/route");
const { POST: decline } = await import("./threads/[id]/decline/route");
const { POST: removeCorrection } = await import("./threads/[id]/remove-correction/route");
const { POST: removeMessage } = await import("./messages/[id]/remove/route");

const ANCHOR = { section: "The Project", label: "Gross Area", text: "1,000 SF", figure: null };
const MISSING = "00000000-0000-4000-8000-0000000000ff";

type Handler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

function call(handler: Handler, path: string, id: string, body: unknown, headers: Record<string, string> = {}) {
  return handler(
    new Request(`http://localhost/api/rom/comments/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

beforeEach(async () => {
  db = await seededDatabase();
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  version1 = (
    await publishBudget(db as Db, {
      runId,
      issuedBy: "devin@example.com",
      copy: { preparedFor: "Harbor Point (example)", preparedBy: "Devin (example)", validityDays: null, coverSentence: null },
    })
  ).id;
  reader = await addReader(db as Db, {
    projectId: TEST_PROJECT_ID,
    name: "Dan Reyes",
    email: "dan@example.com",
    company: "Fieldstone",
    createdBy: "devin@example.com",
  });
});

afterEach(async () => {
  await db.close();
});

function open(kind: "comment" | "question" | "flag", elementId = "line:1a") {
  return openThread(db as Db, {
    publishedBudgetId: version1,
    readerId: reader.id,
    deviceId: newToken(),
    elementId: kind === "flag" ? "fact:grossSquareFeet" : elementId,
    anchor: ANCHOR,
    kind,
    body: "Is this right?",
    ...(kind === "flag" ? { proposed: "1,200 SF" } : {}),
  }).then((r) => r.thread);
}

const as = { replyAs: "Devin Hart" };

describe("every route", () => {
  const cases: [string, Handler, string][] = [
    ["reply", reply, "threads"],
    ["close", close, "threads"],
    ["accept", accept, "threads"],
    ["decline", decline, "threads"],
    ["remove-correction", removeCorrection, "threads"],
  ];

  for (const [name, handler, kind] of cases) {
    it(`${name}: refuses a signed-out request and changes nothing`, async () => {
      const thread = await open("flag");
      const response = await call(handler, `${kind}/${thread.id}/${name}`, thread.id, { ...as, body: "x", reply: "x" }, { "x-kulka-test-auth": "signed-out" });
      expect(response.status).toBe(401);
      const stored = await loadThread(db as Db, thread.id);
      expect(stored?.thread.status).toBe("open");
      expect(stored?.messages).toHaveLength(1);
    });

    it(`${name}: answers a bad id and an unknown id with 404`, async () => {
      expect((await call(handler, `${kind}/nope/${name}`, "nope", { ...as, body: "x", reply: "x" })).status).toBe(404);
      expect((await call(handler, `${kind}/${MISSING}/${name}`, MISSING, { ...as, body: "x", reply: "x" })).status).toBe(404);
    });

    it(`${name}: needs a JSON object and a Reply As name`, async () => {
      const thread = await open("flag");
      expect((await call(handler, `${kind}/${thread.id}/${name}`, thread.id, "not json")).status).toBe(400);
      expect((await call(handler, `${kind}/${thread.id}/${name}`, thread.id, [])).status).toBe(400);
      expect((await call(handler, `${kind}/${thread.id}/${name}`, thread.id, { body: "x", reply: "x" })).status).toBe(400);
      expect((await call(handler, `${kind}/${thread.id}/${name}`, thread.id, { replyAs: "  ", body: "x", reply: "x" })).status).toBe(400);
      expect((await call(handler, `${kind}/${thread.id}/${name}`, thread.id, { replyAs: "x".repeat(81), body: "x", reply: "x" })).status).toBe(400);
      expect((await loadThread(db as Db, thread.id))?.thread.status).toBe("open");
    });
  }

  it("remove (message): refuses a signed-out request, a bad id and a missing Reply As", async () => {
    const thread = await open("comment");
    const message = (await loadThread(db as Db, thread.id))!.messages[0];
    const path = `messages/${message.id}/remove`;
    expect((await call(removeMessage, path, message.id, as, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
    expect((await call(removeMessage, "messages/nope/remove", "nope", as)).status).toBe(404);
    expect((await call(removeMessage, `messages/${MISSING}/remove`, MISSING, as)).status).toBe(404);
    expect((await call(removeMessage, path, message.id, {})).status).toBe(400);
    expect((await loadThread(db as Db, thread.id))!.messages[0].body).toBe("Is this right?");
  });
});

describe("POST reply", () => {
  it("adds a client-visible reply signed with the Reply As name, and answers an open question", async () => {
    const thread = await open("question");
    const response = await call(reply, "threads/x/reply", thread.id, { ...as, body: "It is from three jobs." });
    expect(response.status).toBe(200);
    const stored = await loadThread(db as Db, thread.id);
    expect(stored?.thread.status).toBe("answered");
    expect(stored?.messages[1]).toMatchObject({
      authorKind: "staff",
      staffName: "Devin Hart",
      staffAccount: "browser-test@kulka.invalid",
      visibility: "client",
      body: "It is from three jobs.",
    });
  });

  it("saves an Internal Note that leaves the thread's state alone", async () => {
    const thread = await open("question");
    const response = await call(reply, "threads/x/reply", thread.id, { ...as, body: "Ask Rob first.", internal: true });
    expect(response.status).toBe(200);
    const stored = await loadThread(db as Db, thread.id);
    expect(stored?.thread.status).toBe("open");
    expect(stored?.messages[1]).toMatchObject({ visibility: "internal", body: "Ask Rob first." });
  });

  it("rejects an empty reply, a non-boolean internal flag and a reply on a closed thread", async () => {
    const thread = await open("comment");
    expect((await call(reply, "threads/x/reply", thread.id, { ...as, body: "  " })).status).toBe(400);
    expect((await call(reply, "threads/x/reply", thread.id, { ...as, body: "ok", internal: "yes" })).status).toBe(400);
    await call(close, "threads/x/close", thread.id, as);
    expect((await call(reply, "threads/x/reply", thread.id, { ...as, body: "late" })).status).toBe(409);
  });
});

describe("POST close", () => {
  it("closes a comment as Kulka, with an optional reply the client reads", async () => {
    const thread = await open("comment");
    const response = await call(close, "threads/x/close", thread.id, { ...as, reply: "Noted, thank you." });
    expect(response.status).toBe(200);
    const stored = await loadThread(db as Db, thread.id);
    expect(stored?.thread).toMatchObject({ status: "closed", outcome: null, closedByStaff: "Devin Hart" });
    expect(stored?.messages[1]).toMatchObject({ visibility: "client", body: "Noted, thank you." });
  });

  it("closes a question, and refuses a second close", async () => {
    const thread = await open("question");
    expect((await call(close, "threads/x/close", thread.id, as)).status).toBe(200);
    expect((await call(close, "threads/x/close", thread.id, as)).status).toBe(409);
  });

  it("refuses a plain Close on a flag, which needs an outcome", async () => {
    const thread = await open("flag");
    expect((await call(close, "threads/x/close", thread.id, as)).status).toBe(400);
    expect((await loadThread(db as Db, thread.id))?.thread.status).toBe("open");
  });
});

describe("POST accept", () => {
  it("closes a flag as accepted and changes nothing in the budget", async () => {
    const thread = await open("flag");
    const before = (await db.query<{ snapshot: unknown }>(`select snapshot from published_budgets where id = $1`, [version1])).rows[0];
    const response = await call(accept, "threads/x/accept", thread.id, as);
    expect(response.status).toBe(200);
    expect((await loadThread(db as Db, thread.id))?.thread).toMatchObject({ status: "closed", outcome: "accepted", closedByStaff: "Devin Hart" });
    const after = (await db.query<{ snapshot: unknown }>(`select snapshot from published_budgets where id = $1`, [version1])).rows[0];
    expect(after).toEqual(before);
  });

  it("refuses to accept a comment", async () => {
    const thread = await open("comment");
    expect((await call(accept, "threads/x/accept", thread.id, as)).status).toBe(400);
  });
});

describe("POST decline", () => {
  it("closes a flag as declined with the client-visible reply in the same action", async () => {
    const thread = await open("flag");
    const response = await call(decline, "threads/x/decline", thread.id, { ...as, reply: "The garage is in the area." });
    expect(response.status).toBe(200);
    const stored = await loadThread(db as Db, thread.id);
    expect(stored?.thread).toMatchObject({ status: "closed", outcome: "declined" });
    expect(stored?.messages[1]).toMatchObject({ visibility: "client", body: "The garage is in the area.", staffName: "Devin Hart" });
  });

  it("refuses a decline with no reply and leaves the flag open", async () => {
    const thread = await open("flag");
    expect((await call(decline, "threads/x/decline", thread.id, as)).status).toBe(400);
    expect((await call(decline, "threads/x/decline", thread.id, { ...as, reply: "   " })).status).toBe(400);
    const stored = await loadThread(db as Db, thread.id);
    expect(stored?.thread.status).toBe("open");
    expect(stored?.messages).toHaveLength(1);
  });

  it("refuses to decline a question", async () => {
    const thread = await open("question");
    expect((await call(decline, "threads/x/decline", thread.id, { ...as, reply: "No." })).status).toBe(400);
  });
});

describe("POST remove-correction and remove (message)", () => {
  it("clears a flag's What It Should Be and keeps the row, even on a closed flag", async () => {
    const thread = await open("flag");
    await call(accept, "threads/x/accept", thread.id, as);
    const response = await call(removeCorrection, "threads/x/remove-correction", thread.id, as);
    expect(response.status).toBe(200);
    expect((await loadThread(db as Db, thread.id))?.thread).toMatchObject({ proposed: null, status: "closed" });
    expect((await loadThread(db as Db, thread.id))?.thread.proposedRemovedAt).not.toBeNull();
    expect((await call(removeCorrection, "threads/x/remove-correction", thread.id, as)).status).toBe(400);
  });

  it("clears a message's words, keeps the row and refuses a second removal", async () => {
    const thread = await open("comment");
    const message = (await loadThread(db as Db, thread.id))!.messages[0];
    const response = await call(removeMessage, `messages/${message.id}/remove`, message.id, as);
    expect(response.status).toBe(200);
    const stored = (await loadThread(db as Db, thread.id))!.messages[0];
    expect(stored).toMatchObject({ body: null, removedBy: "Devin Hart (browser-test@kulka.invalid)" });
    expect(stored.removedAt).not.toBeNull();
    expect((await call(removeMessage, `messages/${message.id}/remove`, message.id, as)).status).toBe(400);
  });
});

describe("GET /api/rom/projects/[id]/comments", () => {
  const get = (id: string, headers: Record<string, string> = {}) =>
    listComments(new Request(`http://localhost/api/rom/projects/${id}/comments`, { headers }), { params: Promise.resolve({ id }) });

  it("refuses a signed-out request", async () => {
    expect((await get(TEST_PROJECT_ID, { "x-kulka-test-auth": "signed-out" })).status).toBe(401);
  });

  it("answers a bad project id with 404", async () => {
    expect((await get("nope")).status).toBe(404);
  });

  it("returns the threads grouped by version with the count that needs Kulka", async () => {
    await open("question");
    const answered = await open("comment", "line:2a");
    await call(reply, "threads/x/reply", answered.id, { ...as, body: "Seen." });
    const response = await get(TEST_PROJECT_ID);
    expect(response.status).toBe(200);
    const { comments } = await response.json();
    expect(comments.needsKulka).toBe(1);
    expect(comments.defaultReplyAs).toBe("Devin (example)");
    expect(comments.versions).toHaveLength(1);
    expect(comments.versions[0].threads).toHaveLength(2);
  });
});
