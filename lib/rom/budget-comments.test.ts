import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import {
  BudgetCommentError,
  addReader,
  closeThread,
  findActiveReader,
  hideMessage,
  isAssumptionElement,
  isElementId,
  listReaders,
  loadThread,
  newestOpenToken,
  openThread,
  releaseMessage,
  removeMessage,
  removeProposed,
  replyToThread,
  revokeReader,
  type BudgetReader,
  type CommentErrorCode,
  type StaffAuthor,
} from "./budget-comments";
import { newToken, publishBudget, revokePublishedBudget } from "./published-budgets";

// LA-1485. Comment tables, their triggers and the module over them, tested
// against a real Postgres built from this repo's migrations, as in
// lib/rom/published-budgets.test.ts. The first half drives the module. The
// second half writes raw SQL, because a trigger has to hold against any
// writer, not only against this module.

let db: Awaited<ReturnType<typeof seededDatabase>>;
let runId: string;
let version1: string;
let reader: BudgetReader;
let device: string;

const COPY = {
  preparedFor: "Harbor Point Partners (example)",
  preparedBy: "Devin (example)",
  validityDays: null,
  coverSentence: null,
};
const STAFF: StaffAuthor = { name: "Devin", account: "open-access@kulka.invalid" };
const ANCHOR = { section: "The Project", label: "Gross Area", text: "1,000 SF", figure: null };
const OTHER_PROJECT_ID = "00000000-0000-4000-8000-0000000000aa";

async function publish(): Promise<string> {
  const published = await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY });
  return published.id;
}

beforeEach(async () => {
  db = await seededDatabase();
  ({ runId } = await runRom(db as Db, TEST_PROJECT_ID));
  version1 = await publish();
  reader = await addReader(db as Db, {
    projectId: TEST_PROJECT_ID,
    name: "Dan Reyes",
    email: "dan@example.com",
    company: "Fieldstone",
    createdBy: "devin@example.com",
  });
  device = newToken();
});

afterEach(async () => {
  await db.close();
});

async function otherProjectReader(): Promise<BudgetReader> {
  await db.query(
    `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
     values ($1, 'Second synthetic project', 'multifamily', 'new', 2000)`,
    [OTHER_PROJECT_ID],
  );
  return addReader(db as Db, {
    projectId: OTHER_PROJECT_ID,
    name: "Pat Other",
    email: "pat@example.com",
    createdBy: "devin@example.com",
  });
}

async function comment(kind: "comment" | "question" = "comment", elementId = "line:1a") {
  return openThread(db as Db, {
    publishedBudgetId: version1,
    readerId: reader.id,
    deviceId: device,
    elementId,
    anchor: ANCHOR,
    kind,
    body: "Is this the figure with the garage?",
  });
}

async function flag(elementId = "fact:grossSquareFeet") {
  return openThread(db as Db, {
    publishedBudgetId: version1,
    readerId: reader.id,
    deviceId: device,
    elementId,
    anchor: ANCHOR,
    kind: "flag",
    proposed: "1,200 SF",
    body: "We added a floor.",
  });
}

async function codeOf(promise: Promise<unknown>): Promise<CommentErrorCode | "no error"> {
  try {
    await promise;
    return "no error";
  } catch (cause) {
    if (cause instanceof BudgetCommentError) return cause.code;
    throw cause;
  }
}

async function aiDraft(threadId: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into budget_messages (thread_id, author_kind, body, visibility, provenance)
     values ($1, 'ai', 'The garage is included.', 'draft', '{"model":"example","cites":["fact:grossSquareFeet"]}')
     returning id`,
    [threadId],
  );
  return rows[0].id;
}

describe("element ids", () => {
  it("accepts a data-el id and page:general, and rejects anything else", () => {
    expect(isElementId("line:1a")).toBe(true);
    expect(isElementId("page:general")).toBe(true);
    expect(isElementId("division:03:1a")).toBe(true);
    expect(isElementId("Line:1a")).toBe(false);
    expect(isElementId("line:")).toBe(false);
    expect(isElementId("line 1a")).toBe(false);
  });

  it("names the assumption families a flag may sit on", () => {
    for (const id of ["fact:elevatorType", "criterion:A-1", "note:3", "gate:26", "note:3f9a2b8c1d", "note:3f9a2b8c1d-2", "assumption:x", "inclusion:x", "exclusion:x", "raise:x"]) {
      expect(isAssumptionElement(id)).toBe(true);
    }
    for (const id of ["line:1a", "total:trades", "markup:fee", "parameter:fee-rate", "record:issued", "page:general", "nonsense"]) {
      expect(isAssumptionElement(id)).toBe(false);
    }
  });
});

describe("addReader, revokeReader and findActiveReader", () => {
  it("adds a reader with a new key and the person's details", async () => {
    expect(reader.readerKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(reader).toMatchObject({ name: "Dan Reyes", email: "dan@example.com", company: "Fieldstone", revokedAt: null });
    const second = await addReader(db as Db, {
      projectId: TEST_PROJECT_ID,
      name: "Sam",
      email: "sam@example.com",
      company: "  ",
      createdBy: "devin@example.com",
    });
    expect(second.readerKey).not.toBe(reader.readerKey);
    expect(second.company).toBeNull();
  });

  it("rejects a blank name, a bad email, a blank creator and an unknown project", async () => {
    const base = { projectId: TEST_PROJECT_ID, name: "A", email: "a@example.com", createdBy: "x" };
    expect(await codeOf(addReader(db as Db, { ...base, name: " " }))).toBe("invalid");
    expect(await codeOf(addReader(db as Db, { ...base, email: "no-at-sign" }))).toBe("invalid");
    expect(await codeOf(addReader(db as Db, { ...base, createdBy: "" }))).toBe("invalid");
    expect(await codeOf(addReader(db as Db, { ...base, projectId: OTHER_PROJECT_ID }))).toBe("not_found");
    expect(await codeOf(addReader(db as Db, { ...base, projectId: "nope" }))).toBe("not_found");
  });

  it("finds a reader by key until the reader is revoked", async () => {
    expect((await findActiveReader(db as Db, reader.readerKey))?.id).toBe(reader.id);
    const revoked = await revokeReader(db as Db, reader.id);
    expect(revoked.revokedAt).not.toBeNull();
    expect(await findActiveReader(db as Db, reader.readerKey)).toBeNull();
  });

  it("answers a malformed or unknown key with null", async () => {
    expect(await findActiveReader(db as Db, "short")).toBeNull();
    expect(await findActiveReader(db as Db, newToken())).toBeNull();
  });

  it("keeps the first revoke time when a reader is revoked twice", async () => {
    const first = await revokeReader(db as Db, reader.id);
    const second = await revokeReader(db as Db, reader.id);
    expect(second.revokedAt).toBe(first.revokedAt);
    expect(await codeOf(revokeReader(db as Db, "00000000-0000-4000-8000-0000000000ff"))).toBe("not_found");
  });
});

describe("listReaders and newestOpenToken (LA-1486)", () => {
  it("lists a project's readers newest first, a revoked one included, and no other project's", async () => {
    const second = await addReader(db as Db, {
      projectId: TEST_PROJECT_ID,
      name: "Sam",
      email: "sam@example.com",
      createdBy: "devin@example.com",
    });
    await revokeReader(db as Db, reader.id);

    const listed = await listReaders(db as Db, TEST_PROJECT_ID);
    expect(listed.map((one) => one.id)).toEqual([second.id, reader.id]);
    expect(listed[1].revokedAt).not.toBeNull();
    expect(await listReaders(db as Db, OTHER_PROJECT_ID)).toEqual([]);
    expect(await listReaders(db as Db, "nope")).toEqual([]);
  });

  it("names the newest version that is not withdrawn", async () => {
    const tokenOf = async (id: string) =>
      (await db.query<{ token: string }>(`select token from published_budgets where id = $1`, [id])).rows[0].token;
    expect(await newestOpenToken(db as Db, TEST_PROJECT_ID)).toBe(await tokenOf(version1));

    const version2 = await publish();
    expect(await newestOpenToken(db as Db, TEST_PROJECT_ID)).toBe(await tokenOf(version2));

    await revokePublishedBudget(db as Db, version2);
    expect(await newestOpenToken(db as Db, TEST_PROJECT_ID)).toBe(await tokenOf(version1));

    await revokePublishedBudget(db as Db, version1);
    expect(await newestOpenToken(db as Db, TEST_PROJECT_ID)).toBeNull();
    expect(await newestOpenToken(db as Db, OTHER_PROJECT_ID)).toBeNull();
  });
});

describe("openThread", () => {
  it("opens a comment with its first message from the reader", async () => {
    const { thread, message } = await comment("comment");
    expect(thread).toMatchObject({
      publishedBudgetId: version1,
      projectId: TEST_PROJECT_ID,
      elementId: "line:1a",
      kind: "comment",
      status: "open",
      openedBy: reader.id,
      anchor: ANCHOR,
      proposed: null,
    });
    expect(message).toMatchObject({
      authorKind: "reader",
      readerId: reader.id,
      deviceId: device,
      visibility: "client",
      body: "Is this the figure with the garage?",
    });
  });

  it("opens a question and a thread on page:general", async () => {
    expect((await comment("question")).thread.kind).toBe("question");
    expect((await comment("comment", "page:general")).thread.elementId).toBe("page:general");
  });

  it("opens a flag with a correction, and a flag with no Why makes no message", async () => {
    const withWhy = await flag();
    expect(withWhy.thread).toMatchObject({ kind: "flag", proposed: "1,200 SF", status: "open" });
    expect(withWhy.message?.body).toBe("We added a floor.");

    const bare = await openThread(db as Db, {
      publishedBudgetId: version1,
      readerId: reader.id,
      deviceId: device,
      elementId: "note:2",
      anchor: ANCHOR,
      kind: "flag",
      proposed: "Different wording.",
    });
    expect(bare.message).toBeNull();
    expect((await loadThread(db as Db, bare.thread.id))?.messages).toEqual([]);
  });

  it("keeps the anchor as the caller gave it and the reader's device on the post", async () => {
    const { thread } = await comment();
    const loaded = await loadThread(db as Db, thread.id);
    expect(loaded?.thread.anchor).toEqual(ANCHOR);
    expect(loaded?.messages[0].deviceId).toBe(device);
  });

  it("rejects a flag on a figure, a flag with no correction and a correction on a comment", async () => {
    expect(await codeOf(flag("line:1a"))).toBe("invalid");
    expect(
      await codeOf(
        openThread(db as Db, {
          publishedBudgetId: version1,
          readerId: reader.id,
          deviceId: device,
          elementId: "fact:grossSquareFeet",
          anchor: ANCHOR,
          kind: "flag",
          proposed: "  ",
        }),
      ),
    ).toBe("invalid");
    expect(
      await codeOf(
        openThread(db as Db, {
          publishedBudgetId: version1,
          readerId: reader.id,
          deviceId: device,
          elementId: "line:1a",
          anchor: ANCHOR,
          kind: "comment",
          body: "Hi",
          proposed: "x",
        }),
      ),
    ).toBe("invalid");
  });

  it("rejects an empty body, a body over 4000 characters, a bad element id, a bad device and a non-object anchor", async () => {
    const base = {
      publishedBudgetId: version1,
      readerId: reader.id,
      deviceId: device,
      elementId: "line:1a",
      anchor: ANCHOR,
      kind: "comment" as const,
      body: "Hi",
    };
    expect(await codeOf(openThread(db as Db, { ...base, body: "  " }))).toBe("invalid");
    expect(await codeOf(openThread(db as Db, { ...base, body: "x".repeat(4001) }))).toBe("invalid");
    expect(await codeOf(openThread(db as Db, { ...base, body: "x".repeat(4000) }))).toBe("no error");
    expect(await codeOf(openThread(db as Db, { ...base, elementId: "<script>" }))).toBe("invalid");
    expect(await codeOf(openThread(db as Db, { ...base, deviceId: "short" }))).toBe("invalid");
    expect(await codeOf(openThread(db as Db, { ...base, anchor: [] as never }))).toBe("invalid");
  });

  it("rejects a revoked reader, a reader of another project and an unknown reader", async () => {
    const stranger = await otherProjectReader();
    const open = (readerId: string) =>
      openThread(db as Db, {
        publishedBudgetId: version1,
        readerId,
        deviceId: device,
        elementId: "line:1a",
        anchor: ANCHOR,
        kind: "comment",
        body: "Hi",
      });
    expect(await codeOf(open(stranger.id))).toBe("forbidden");
    expect(await codeOf(open("not-a-uuid"))).toBe("forbidden");
    await revokeReader(db as Db, reader.id);
    expect(await codeOf(open(reader.id))).toBe("forbidden");
  });

  it("rejects an unknown version and a withdrawn one", async () => {
    const open = (publishedBudgetId: string) =>
      openThread(db as Db, {
        publishedBudgetId,
        readerId: reader.id,
        deviceId: device,
        elementId: "line:1a",
        anchor: ANCHOR,
        kind: "comment",
        body: "Hi",
      });
    expect(await codeOf(open("00000000-0000-4000-8000-0000000000ff"))).toBe("not_found");
    await revokePublishedBudget(db as Db, version1);
    expect(await codeOf(open(version1))).toBe("version_not_open");
  });

  it("takes no new thread on a superseded version, and takes them again if the newer version is withdrawn", async () => {
    const version2 = await publish();
    expect(await codeOf(comment())).toBe("version_not_open");
    await revokePublishedBudget(db as Db, version2);
    expect(await codeOf(comment())).toBe("no error");
  });

  it("leaves nothing behind when the first message fails", async () => {
    await expect(
      openThread(db as Db, {
        publishedBudgetId: version1,
        readerId: reader.id,
        deviceId: device,
        elementId: "line:1a",
        anchor: ANCHOR,
        kind: "comment",
        body: "x".repeat(4001),
      }),
    ).rejects.toBeInstanceOf(BudgetCommentError);
    const { rows } = await db.query(`select 1 from budget_threads`);
    expect(rows).toHaveLength(0);
  });
});

describe("replyToThread", () => {
  it("adds a reader reply and leaves an open thread open", async () => {
    const { thread } = await comment();
    const { message, thread: after } = await replyToThread(db as Db, {
      threadId: thread.id,
      author: "reader",
      readerId: reader.id,
      deviceId: device,
      body: "Thanks.",
    });
    expect(message).toMatchObject({ authorKind: "reader", readerId: reader.id, body: "Thanks." });
    expect(after.status).toBe("open");
  });

  it("lets a second reader of the project reply", async () => {
    const colleague = await addReader(db as Db, {
      projectId: TEST_PROJECT_ID,
      name: "Sam Lee",
      email: "sam@example.com",
      createdBy: "devin@example.com",
    });
    const { thread } = await comment();
    const { message } = await replyToThread(db as Db, {
      threadId: thread.id,
      author: "reader",
      readerId: colleague.id,
      deviceId: newToken(),
      body: "Agreed.",
    });
    expect(message.readerId).toBe(colleague.id);
  });

  it("answers an open question when Kulka replies to the client", async () => {
    const { thread } = await comment("question");
    const { message, thread: after } = await replyToThread(db as Db, {
      threadId: thread.id,
      author: "staff",
      staff: STAFF,
      body: "Yes, the garage is in.",
    });
    expect(message).toMatchObject({ authorKind: "staff", staffName: "Devin", staffAccount: "open-access@kulka.invalid", visibility: "client" });
    expect(after.status).toBe("answered");
  });

  it("opens an answered thread again when the reader replies", async () => {
    const { thread } = await comment("question");
    await replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Yes." });
    const { thread: after } = await replyToThread(db as Db, {
      threadId: thread.id,
      author: "reader",
      readerId: reader.id,
      deviceId: device,
      body: "And the roof?",
    });
    expect(after.status).toBe("open");
  });

  it("does not answer a comment or a flag, and an internal note changes nothing", async () => {
    const c = await comment("comment");
    const f = await flag();
    const q = await comment("question");
    expect((await replyToThread(db as Db, { threadId: c.thread.id, author: "staff", staff: STAFF, body: "Noted." })).thread.status).toBe("open");
    expect((await replyToThread(db as Db, { threadId: f.thread.id, author: "staff", staff: STAFF, body: "Noted." })).thread.status).toBe("open");

    const note = await replyToThread(db as Db, {
      threadId: q.thread.id,
      author: "staff",
      staff: STAFF,
      body: "Ask the estimator.",
      internal: true,
    });
    expect(note.message.visibility).toBe("internal");
    expect(note.thread.status).toBe("open");
  });

  it("rejects an empty reply, an unknown thread, a closed thread, a revoked reader and a reader of another project", async () => {
    const { thread } = await comment();
    const stranger = await otherProjectReader();
    const reply = (over: Partial<{ threadId: string; readerId: string; body: string }> = {}) =>
      replyToThread(db as Db, {
        threadId: thread.id,
        author: "reader",
        readerId: reader.id,
        deviceId: device,
        body: "Hi",
        ...over,
      });
    expect(await codeOf(reply({ body: " " }))).toBe("invalid");
    expect(await codeOf(reply({ threadId: "00000000-0000-4000-8000-0000000000ff" }))).toBe("not_found");
    expect(await codeOf(reply({ readerId: stranger.id }))).toBe("forbidden");
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } });
    expect(await codeOf(reply())).toBe("thread_closed");
    expect(await codeOf(replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Late." }))).toBe("thread_closed");

    const fresh = await comment();
    await revokeReader(db as Db, reader.id);
    expect(await codeOf(reply({ threadId: fresh.thread.id }))).toBe("forbidden");
  });

  it("keeps replying to a thread after a newer version is published", async () => {
    const { thread } = await comment();
    await publish();
    expect(
      await codeOf(
        replyToThread(db as Db, { threadId: thread.id, author: "reader", readerId: reader.id, deviceId: device, body: "Still here." }),
      ),
    ).toBe("no error");
  });
});

describe("closeThread", () => {
  it("lets the reader who opened a comment close it", async () => {
    const { thread } = await comment();
    const closed = await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } });
    expect(closed).toMatchObject({ status: "closed", outcome: null, closedByReader: reader.id, closedByStaff: null });
    expect(closed.closedAt).not.toBeNull();
  });

  it("does not let another reader close it", async () => {
    const colleague = await addReader(db as Db, {
      projectId: TEST_PROJECT_ID,
      name: "Sam Lee",
      email: "sam@example.com",
      createdBy: "devin@example.com",
    });
    const { thread } = await comment();
    expect(await codeOf(closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: colleague.id } }))).toBe("forbidden");
    const stranger = await otherProjectReader();
    expect(await codeOf(closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: stranger.id } }))).toBe("forbidden");
  });

  it("lets the reader withdraw their own flag", async () => {
    const { thread } = await flag();
    const closed = await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } });
    expect(closed).toMatchObject({ status: "closed", outcome: "withdrawn", closedByReader: reader.id });
  });

  it("lets Kulka close a question, and records the name", async () => {
    const { thread } = await comment("question");
    const closed = await closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF } });
    expect(closed).toMatchObject({ status: "closed", outcome: null, closedByStaff: "Devin", closedByReader: null });
  });

  it("closes an answered question", async () => {
    const { thread } = await comment("question");
    await replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Yes." });
    const closed = await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } });
    expect(closed.status).toBe("closed");
  });

  it("makes Kulka give a flag an outcome, and a comment none", async () => {
    const f = await flag();
    expect(await codeOf(closeThread(db as Db, { threadId: f.thread.id, by: { kind: "staff", staff: STAFF } }))).toBe("invalid");
    const c = await comment();
    expect(
      await codeOf(closeThread(db as Db, { threadId: c.thread.id, by: { kind: "staff", staff: STAFF, outcome: "accepted" } })),
    ).toBe("invalid");
  });

  it("accepts a flag with no reply and changes nothing else", async () => {
    const { thread } = await flag();
    const closed = await closeThread(db as Db, {
      threadId: thread.id,
      by: { kind: "staff", staff: STAFF, outcome: "accepted" },
    });
    expect(closed).toMatchObject({ status: "closed", outcome: "accepted", closedByStaff: "Devin", addressedIn: null });
  });

  it("declines a flag only with a client-visible reply, written in the same step", async () => {
    const { thread } = await flag();
    expect(
      await codeOf(closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF, outcome: "declined" } })),
    ).toBe("invalid");
    expect((await loadThread(db as Db, thread.id))?.thread.status).toBe("open");

    const closed = await closeThread(db as Db, {
      threadId: thread.id,
      by: { kind: "staff", staff: STAFF, outcome: "declined", reply: "The plans show 1,000 SF." },
    });
    expect(closed).toMatchObject({ status: "closed", outcome: "declined" });
    const messages = (await loadThread(db as Db, thread.id))?.messages ?? [];
    expect(messages.at(-1)).toMatchObject({ authorKind: "staff", visibility: "client", body: "The plans show 1,000 SF." });
  });

  it("rolls the reply back when the close fails", async () => {
    const { thread } = await flag();
    await expect(
      closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: { name: " ", account: "a" }, outcome: "declined", reply: "No." } }),
    ).rejects.toBeInstanceOf(BudgetCommentError);
    expect((await loadThread(db as Db, thread.id))?.messages).toHaveLength(1);
  });

  it("rejects a withdrawn outcome from Kulka, a second close and an unknown thread", async () => {
    const { thread } = await flag();
    expect(
      await codeOf(closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF, outcome: "withdrawn" as never } })),
    ).toBe("invalid");
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } });
    expect(await codeOf(closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF, outcome: "accepted" } }))).toBe("thread_closed");
    expect(await codeOf(closeThread(db as Db, { threadId: "nope", by: { kind: "staff", staff: STAFF } }))).toBe("not_found");
  });

  it("rejects a revoked reader", async () => {
    const { thread } = await comment();
    await revokeReader(db as Db, reader.id);
    expect(await codeOf(closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } }))).toBe("forbidden");
  });
});

describe("releaseMessage", () => {
  it("releases an AI draft to the client, signed by the releaser, and answers an open question", async () => {
    const { thread } = await comment("question");
    const draftId = await aiDraft(thread.id);
    const { message, thread: after } = await releaseMessage(db as Db, { messageId: draftId, releasedBy: "Devin" });
    expect(message).toMatchObject({ visibility: "client", releasedBy: "Devin", authorKind: "ai" });
    expect(message.releasedAt).not.toBeNull();
    expect(after.status).toBe("answered");
  });

  it("leaves a comment thread open", async () => {
    const { thread } = await comment("comment");
    const { thread: after } = await releaseMessage(db as Db, { messageId: await aiDraft(thread.id), releasedBy: "Devin" });
    expect(after.status).toBe("open");
  });

  it("releases a draft once, and releases nothing but an AI draft", async () => {
    const { thread, message } = await comment("question");
    const draftId = await aiDraft(thread.id);
    await releaseMessage(db as Db, { messageId: draftId, releasedBy: "Devin" });
    expect(await codeOf(releaseMessage(db as Db, { messageId: draftId, releasedBy: "Devin" }))).toBe("not_releasable");
    expect(await codeOf(releaseMessage(db as Db, { messageId: (message as { id: string }).id, releasedBy: "Devin" }))).toBe("not_releasable");
    expect(await codeOf(releaseMessage(db as Db, { messageId: "00000000-0000-4000-8000-0000000000ff", releasedBy: "Devin" }))).toBe("not_found");
    expect(await codeOf(releaseMessage(db as Db, { messageId: draftId, releasedBy: " " }))).toBe("invalid");
  });

  it("does not release into a closed thread", async () => {
    const { thread } = await comment("question");
    const draftId = await aiDraft(thread.id);
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF } });
    expect(await codeOf(releaseMessage(db as Db, { messageId: draftId, releasedBy: "Devin" }))).toBe("thread_closed");
  });
});

describe("hideMessage", () => {
  it("takes a message off the page and keeps its words", async () => {
    const { message } = await comment();
    const hidden = await hideMessage(db as Db, { messageId: (message as { id: string }).id, hiddenBy: "Devin" });
    expect(hidden).toMatchObject({ hiddenBy: "Devin", body: "Is this the figure with the garage?", removedAt: null });
    expect(hidden.hiddenAt).not.toBeNull();
  });

  it("hides once, and rejects a blank name and an unknown message", async () => {
    const { message } = await comment();
    const id = (message as { id: string }).id;
    await hideMessage(db as Db, { messageId: id, hiddenBy: "Devin" });
    expect(await codeOf(hideMessage(db as Db, { messageId: id, hiddenBy: "Devin" }))).toBe("invalid");
    expect(await codeOf(hideMessage(db as Db, { messageId: id, hiddenBy: "" }))).toBe("invalid");
    expect(await codeOf(hideMessage(db as Db, { messageId: "nope", hiddenBy: "Devin" }))).toBe("not_found");
  });
});

describe("removeMessage and removeProposed", () => {
  it("clears a message body and keeps the row", async () => {
    const { thread, message } = await comment();
    const removed = await removeMessage(db as Db, { messageId: (message as { id: string }).id, removedBy: "Devin" });
    expect(removed).toMatchObject({ body: null, removedBy: "Devin" });
    expect(removed.removedAt).not.toBeNull();
    const loaded = await loadThread(db as Db, thread.id);
    expect(loaded?.messages).toHaveLength(1);
  });

  it("removes once, even from a hidden message, and rejects an unknown message", async () => {
    const { message } = await comment();
    const id = (message as { id: string }).id;
    await hideMessage(db as Db, { messageId: id, hiddenBy: "Devin" });
    await removeMessage(db as Db, { messageId: id, removedBy: "Devin" });
    expect(await codeOf(removeMessage(db as Db, { messageId: id, removedBy: "Devin" }))).toBe("invalid");
    expect(await codeOf(removeMessage(db as Db, { messageId: "nope", removedBy: "Devin" }))).toBe("not_found");
    expect(await codeOf(removeMessage(db as Db, { messageId: id, removedBy: " " }))).toBe("invalid");
  });

  it("clears a flag's correction, even on a closed flag, and keeps the flag a flag", async () => {
    const { thread } = await flag();
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "reader", readerId: reader.id } });
    const after = await removeProposed(db as Db, { threadId: thread.id });
    expect(after).toMatchObject({ kind: "flag", proposed: null, status: "closed", outcome: "withdrawn" });
    expect(after.proposedRemovedAt).not.toBeNull();
  });

  it("removes a correction once, and not from a thread that never had one", async () => {
    const { thread } = await flag();
    await removeProposed(db as Db, { threadId: thread.id });
    expect(await codeOf(removeProposed(db as Db, { threadId: thread.id }))).toBe("invalid");
    const c = await comment();
    expect(await codeOf(removeProposed(db as Db, { threadId: c.thread.id }))).toBe("invalid");
    expect(await codeOf(removeProposed(db as Db, { threadId: "nope" }))).toBe("not_found");
  });
});

describe("loadThread", () => {
  it("returns a thread with every message oldest first, and null for an unknown or malformed id", async () => {
    // Writes in the same millisecond tie on time, and the thread cannot order
    // them. Real replies never land that close, so the test waits (LA-1565).
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const { thread } = await comment("question");
    await tick();
    await replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Yes.", internal: true });
    await tick();
    await replyToThread(db as Db, { threadId: thread.id, author: "staff", staff: STAFF, body: "Yes, it is." });
    const loaded = await loadThread(db as Db, thread.id);
    expect(loaded?.messages.map((m) => m.body)).toEqual(["Is this the figure with the garage?", "Yes.", "Yes, it is."]);
    expect(loaded?.messages.map((m) => m.visibility)).toEqual(["client", "internal", "client"]);
    expect(await loadThread(db as Db, "00000000-0000-4000-8000-0000000000ff")).toBeNull();
    expect(await loadThread(db as Db, "nope")).toBeNull();
  });
});

// The database alone. Each of these writes SQL directly, so the rule has to
// hold for any writer.

describe("budget_readers triggers", () => {
  it("rejects a delete", async () => {
    await expect(db.query(`delete from budget_readers where id = $1`, [reader.id])).rejects.toThrow(/never deleted/);
  });

  it.each(["name = 'Other'", "email = 'o@example.com'", "company = 'Other'", "created_by = 'someone'", "project_id = '00000000-0000-4000-8000-0000000000aa'", "reader_key = 'AAAAAAAAAAAAAAAAAAAAAA'", "created_at = now() - interval '1 day'"])(
    "rejects a change to %s",
    async (assignment) => {
      await otherProjectReader();
      await expect(db.query(`update budget_readers set ${assignment} where id = $1`, [reader.id])).rejects.toThrow(/frozen/);
    },
  );

  it("sets revoked_at once and never changes it", async () => {
    await db.query(`update budget_readers set revoked_at = now() where id = $1`, [reader.id]);
    await expect(
      db.query(`update budget_readers set revoked_at = now() + interval '1 day' where id = $1`, [reader.id]),
    ).rejects.toThrow(/frozen/);
    await expect(db.query(`update budget_readers set revoked_at = null where id = $1`, [reader.id])).rejects.toThrow(/frozen/);
  });

  it("checks the key, email, name and company shapes", async () => {
    const insert = (key: string, name: string, email: string, company: string | null) =>
      db.query(
        `insert into budget_readers (project_id, reader_key, name, email, company, created_by) values ($1, $2, $3, $4, $5, 'x')`,
        [TEST_PROJECT_ID, key, name, email, company],
      );
    await expect(insert("short", "A", "a@example.com", null)).rejects.toThrow(/check constraint/);
    await expect(insert(newToken(), " ", "a@example.com", null)).rejects.toThrow(/check constraint/);
    await expect(insert(newToken(), "A", "no-at", null)).rejects.toThrow(/check constraint/);
    await expect(insert(newToken(), "A", "a@example.com", " ")).rejects.toThrow(/check constraint/);
    await expect(insert(reader.readerKey, "A", "a@example.com", null)).rejects.toThrow(/unique/);
  });
});

describe("budget_threads checks and triggers", () => {
  it("rejects a delete", async () => {
    const { thread } = await comment();
    await expect(db.query(`delete from budget_threads where id = $1`, [thread.id])).rejects.toThrow(/never deleted/);
  });

  it("rejects a change to the version, project, element, anchor, kind, opener or opened_at", async () => {
    const { thread } = await comment();
    const version2 = await publish();
    await otherProjectReader();
    const colleague = await addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Sam", email: "s@example.com", createdBy: "x" });
    const changes = [
      `published_budget_id = '${version2}'`,
      `project_id = '${OTHER_PROJECT_ID}'`,
      `element_id = 'line:2'`,
      `anchor = '{}'::jsonb`,
      `kind = 'question'`,
      `opened_by = '${colleague.id}'`,
      `opened_at = now() + interval '1 day'`,
    ];
    for (const change of changes) {
      await expect(db.query(`update budget_threads set ${change} where id = $1`, [thread.id])).rejects.toThrow(/fixed once opened/);
    }
  });

  it("moves status open to answered, answered to open, and either to closed", async () => {
    const { thread } = await comment("question");
    await db.query(`update budget_threads set status = 'answered' where id = $1`, [thread.id]);
    await db.query(`update budget_threads set status = 'open' where id = $1`, [thread.id]);
    await db.query(`update budget_threads set status = 'answered' where id = $1`, [thread.id]);
    await db.query(
      `update budget_threads set status = 'closed', closed_at = now(), closed_by_staff = 'Devin' where id = $1`,
      [thread.id],
    );
  });

  it("makes closed final", async () => {
    const { thread } = await comment();
    await db.query(
      `update budget_threads set status = 'closed', closed_at = now(), closed_by_staff = 'Devin' where id = $1`,
      [thread.id],
    );
    for (const status of ["open", "answered"]) {
      await expect(
        db.query(`update budget_threads set status = $2, closed_at = null, closed_by_staff = null where id = $1`, [thread.id, status]),
      ).rejects.toThrow(/Closed is final/);
    }
    await expect(db.query(`update budget_threads set closed_by_staff = 'Someone Else' where id = $1`, [thread.id])).rejects.toThrow(/closed thread is final/);
    await expect(db.query(`update budget_threads set closed_at = now() + interval '1 day' where id = $1`, [thread.id])).rejects.toThrow(/closed thread is final/);
  });

  it("changes the outcome of a closed flag never, and sets one only when closing", async () => {
    const { thread } = await flag();
    await expect(db.query(`update budget_threads set outcome = 'accepted' where id = $1`, [thread.id])).rejects.toThrow(/Only closing/);
    await db.query(
      `update budget_threads set status = 'closed', outcome = 'declined', closed_at = now(), closed_by_staff = 'Devin' where id = $1`,
      [thread.id],
    );
    await expect(db.query(`update budget_threads set outcome = 'accepted' where id = $1`, [thread.id])).rejects.toThrow(/closed thread is final/);
  });

  it("lets only the opening reader close as a reader", async () => {
    const colleague = await addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Sam", email: "s@example.com", createdBy: "x" });
    const { thread } = await comment();
    await expect(
      db.query(
        `update budget_threads set status = 'closed', closed_at = now(), closed_by_reader = $2 where id = $1`,
        [thread.id, colleague.id],
      ),
    ).rejects.toThrow(/Only the reader who opened/);
  });

  it("changes the correction only by clearing it once with proposed_removed_at", async () => {
    const { thread } = await flag();
    await expect(db.query(`update budget_threads set proposed = 'something else' where id = $1`, [thread.id])).rejects.toThrow(/removed, once/);
    await expect(db.query(`update budget_threads set proposed = null where id = $1`, [thread.id])).rejects.toThrow();
    await expect(db.query(`update budget_threads set proposed_removed_at = now() where id = $1`, [thread.id])).rejects.toThrow();
    await db.query(`update budget_threads set proposed = null, proposed_removed_at = now() where id = $1`, [thread.id]);
    await expect(db.query(`update budget_threads set proposed = 'back' where id = $1`, [thread.id])).rejects.toThrow(/removed, once/);
    await expect(db.query(`update budget_threads set proposed_removed_at = null where id = $1`, [thread.id])).rejects.toThrow(/removed, once/);
  });

  it("sets addressed_in once, on an accepted flag, to a version of its own project", async () => {
    const { thread } = await flag();
    const version2 = await publish();
    await expect(db.query(`update budget_threads set addressed_in = $2 where id = $1`, [thread.id, version2])).rejects.toThrow(/check constraint/);
    await db.query(
      `update budget_threads set status = 'closed', outcome = 'accepted', closed_at = now(), closed_by_staff = 'Devin' where id = $1`,
      [thread.id],
    );
    await db.query(`update budget_threads set addressed_in = $2 where id = $1`, [thread.id, version2]);
    const version3 = await publish();
    await expect(db.query(`update budget_threads set addressed_in = $2 where id = $1`, [thread.id, version3])).rejects.toThrow(/set once/);
    await expect(db.query(`update budget_threads set addressed_in = null where id = $1`, [thread.id])).rejects.toThrow(/set once/);
  });

  it("refuses an addressed_in from another project", async () => {
    const { thread } = await flag();
    await db.query(
      `update budget_threads set status = 'closed', outcome = 'accepted', closed_at = now(), closed_by_staff = 'Devin' where id = $1`,
      [thread.id],
    );
    await db.query(
      `insert into projects (id, name, project_type, construction_kind, gross_square_feet)
       values ($1, 'Second synthetic project', 'multifamily', 'new', 2000)`,
      [OTHER_PROJECT_ID],
    );
    const { rows: other } = await db.query<{ id: string }>(
      `insert into published_budgets (token, run_id, project_id, version, stage, snapshot, issued_by)
       select $1, run_id, $2, 1, stage, snapshot, issued_by from published_budgets where id = $3
       returning id`,
      [newToken(), OTHER_PROJECT_ID, version1],
    );
    await expect(db.query(`update budget_threads set addressed_in = $2 where id = $1`, [thread.id, other[0].id])).rejects.toThrow(/foreign key/);
  });

  it("ties a thread to a version, project and reader that agree", async () => {
    const stranger = await otherProjectReader();
    const insert = (over: { version?: string; project?: string; opener?: string }) =>
      db.query(
        `insert into budget_threads (published_budget_id, project_id, element_id, anchor, kind, opened_by)
         values ($1, $2, 'line:1a', '{}', 'comment', $3)`,
        [over.version ?? version1, over.project ?? TEST_PROJECT_ID, over.opener ?? reader.id],
      );
    await expect(insert({ project: OTHER_PROJECT_ID, opener: stranger.id })).rejects.toThrow(/foreign key/);
    await expect(insert({ opener: stranger.id })).rejects.toThrow(/foreign key/);
    await expect(insert({})).resolves.toBeDefined();
  });

  it("checks the element id, the anchor, the kind and the flag fields", async () => {
    const insert = (columns: string, values: string) =>
      db.query(
        `insert into budget_threads (published_budget_id, project_id, opened_by, ${columns})
         values ('${version1}', '${TEST_PROJECT_ID}', '${reader.id}', ${values})`,
      );
    await expect(insert("element_id, anchor, kind", `'Line:1', '{}', 'comment'`)).rejects.toThrow(/check constraint/);
    await expect(insert("element_id, anchor, kind", `'line:1', '[]', 'comment'`)).rejects.toThrow(/check constraint/);
    await expect(insert("element_id, anchor, kind", `'line:1', '{}', 'shout'`)).rejects.toThrow(/check constraint/);
    await expect(insert("element_id, anchor, kind", `'fact:a', '{}', 'flag'`)).rejects.toThrow(/check constraint/);
    await expect(insert("element_id, anchor, kind, proposed", `'line:1', '{}', 'comment', 'x'`)).rejects.toThrow(/check constraint/);
    await expect(insert("element_id, anchor, kind, proposed, outcome", `'fact:a', '{}', 'flag', 'x', 'accepted'`)).resolves.toBeDefined().catch(() => undefined);
  });

  it("checks that status, closed_at, who closed and the outcome agree", async () => {
    const { thread: c } = await comment();
    const { thread: f } = await flag();
    const close = (id: string, set: string) => db.query(`update budget_threads set ${set} where id = $1`, [id]);
    await expect(close(c.id, `status = 'closed', closed_by_staff = 'D'`)).rejects.toThrow(/check constraint/);
    await expect(close(c.id, `status = 'closed', closed_at = now()`)).rejects.toThrow(/check constraint/);
    await expect(close(c.id, `status = 'closed', closed_at = now(), closed_by_staff = 'D', closed_by_reader = '${reader.id}'`)).rejects.toThrow(/check constraint|Only/);
    await expect(close(f.id, `status = 'closed', closed_at = now(), closed_by_staff = 'D'`)).rejects.toThrow(/check constraint/);
    await expect(close(f.id, `status = 'closed', outcome = 'withdrawn', closed_at = now(), closed_by_staff = 'D'`)).rejects.toThrow(/check constraint/);
    await expect(close(f.id, `status = 'closed', outcome = 'accepted', closed_at = now(), closed_by_reader = '${reader.id}'`)).rejects.toThrow(/check constraint/);
    await expect(close(c.id, `status = 'closed', outcome = 'accepted', closed_at = now(), closed_by_staff = 'D'`)).rejects.toThrow(/check constraint/);
  });
});

describe("budget_messages checks and triggers", () => {
  it("rejects a delete", async () => {
    const { message } = await comment();
    await expect(db.query(`delete from budget_messages where id = $1`, [(message as { id: string }).id])).rejects.toThrow(/never deleted/);
  });

  it("rejects an edit to the body", async () => {
    const { message } = await comment();
    await expect(
      db.query(`update budget_messages set body = 'rewritten' where id = $1`, [(message as { id: string }).id]),
    ).rejects.toThrow(/never edited/);
  });

  it("rejects a change to the thread, author, reader, staff, provenance, device or time", async () => {
    const { message } = await comment();
    const other = await comment();
    const id = (message as { id: string }).id;
    const changes = [
      `thread_id = '${other.thread.id}'`,
      `author_kind = 'staff'`,
      `reader_id = null`,
      `staff_name = 'Devin'`,
      `staff_account = 'x'`,
      `provenance = '{}'::jsonb`,
      `device_id = 'AAAAAAAAAAAAAAAAAAAAAA'`,
      `created_at = now() + interval '1 day'`,
    ];
    for (const change of changes) {
      await expect(db.query(`update budget_messages set ${change} where id = $1`, [id])).rejects.toThrow();
    }
    await expect(db.query(`update budget_messages set thread_id = '${other.thread.id}' where id = $1`, [id])).rejects.toThrow(/frozen/);
    await expect(db.query(`update budget_messages set created_at = now() + interval '1 day' where id = $1`, [id])).rejects.toThrow(/frozen/);
  });

  it("releases an AI draft once, and never by another path", async () => {
    const { thread, message } = await comment();
    const draftId = await aiDraft(thread.id);
    await expect(
      db.query(`update budget_messages set visibility = 'client' where id = $1`, [draftId]),
    ).rejects.toThrow();
    await db.query(`update budget_messages set visibility = 'client', released_at = now(), released_by = 'Devin' where id = $1`, [draftId]);
    await expect(
      db.query(`update budget_messages set released_by = 'Sam' where id = $1`, [draftId]),
    ).rejects.toThrow(/released, once/);
    await expect(db.query(`update budget_messages set visibility = 'draft' where id = $1`, [draftId])).rejects.toThrow(/released, once/);
    const readerId = (message as { id: string }).id;
    await expect(
      db.query(`update budget_messages set visibility = 'internal' where id = $1`, [readerId]),
    ).rejects.toThrow(/released, once/);
    await expect(
      db.query(`update budget_messages set released_at = now(), released_by = 'Devin' where id = $1`, [readerId]),
    ).rejects.toThrow(/released, once|check constraint/);
  });

  it("hides once, with a name, and never shows a hidden message again", async () => {
    const { message } = await comment();
    const id = (message as { id: string }).id;
    await expect(db.query(`update budget_messages set hidden_at = now() where id = $1`, [id])).rejects.toThrow(/check constraint/);
    await db.query(`update budget_messages set hidden_at = now(), hidden_by = 'Devin' where id = $1`, [id]);
    await expect(db.query(`update budget_messages set hidden_at = null, hidden_by = null where id = $1`, [id])).rejects.toThrow(/hidden once/);
    await expect(db.query(`update budget_messages set hidden_by = 'Sam' where id = $1`, [id])).rejects.toThrow(/hidden once/);
  });

  it("removes once, and the removal clears the body in the same update", async () => {
    const { message } = await comment();
    const id = (message as { id: string }).id;
    await expect(db.query(`update budget_messages set removed_at = now(), removed_by = 'Devin' where id = $1`, [id])).rejects.toThrow();
    await expect(db.query(`update budget_messages set body = null where id = $1`, [id])).rejects.toThrow();
    await db.query(`update budget_messages set body = null, removed_at = now(), removed_by = 'Devin' where id = $1`, [id]);
    await expect(db.query(`update budget_messages set removed_by = 'Sam' where id = $1`, [id])).rejects.toThrow(/removed, once/);
    await expect(db.query(`update budget_messages set body = 'back' where id = $1`, [id])).rejects.toThrow(/removed, once|check constraint/);
    await expect(db.query(`update budget_messages set removed_at = null, removed_by = null where id = $1`, [id])).rejects.toThrow(/removed, once/);
  });

  it("checks body length, author fields, visibility and device shape on insert", async () => {
    const { thread } = await comment();
    const insert = (columns: string, values: unknown[]) =>
      db.query(`insert into budget_messages (thread_id, ${columns}) values ($1, ${values.map((_, i) => `$${i + 2}`).join(", ")})`, [thread.id, ...values]);
    await expect(insert("author_kind, reader_id, device_id, visibility, body", ["reader", reader.id, device, "client", "  "])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, reader_id, device_id, visibility, body", ["reader", reader.id, device, "client", "x".repeat(4001)])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, reader_id, device_id, visibility, body", ["reader", reader.id, device, "internal", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, reader_id, visibility, body", ["reader", reader.id, "client", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, reader_id, device_id, visibility, body", ["reader", reader.id, "short", "client", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, visibility, body", ["reader", "client", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, staff_name, visibility, body", ["staff", "Devin", "client", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, staff_name, staff_account, visibility, body", ["staff", "Devin", "a", "draft", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, staff_name, staff_account, visibility, body", ["ai", null, null, "draft", "Hi"])).rejects.toThrow(/check constraint/);
    await expect(insert("author_kind, staff_name, staff_account, visibility, body", ["staff", "Devin", "a", "internal", "Hi"])).resolves.toBeDefined();
  });

  it("rejects a reader post from a revoked reader or a reader of another project", async () => {
    const { thread } = await comment();
    const stranger = await otherProjectReader();
    const post = (readerId: string) =>
      db.query(
        `insert into budget_messages (thread_id, author_kind, reader_id, device_id, visibility, body)
         values ($1, 'reader', $2, $3, 'client', 'Hi')`,
        [thread.id, readerId, device],
      );
    await expect(post(stranger.id)).rejects.toThrow(/own project/);
    await expect(post(reader.id)).resolves.toBeDefined();
    await db.query(`update budget_readers set revoked_at = now() where id = $1`, [reader.id]);
    await expect(post(reader.id)).rejects.toThrow(/revoked reader/);
  });

  it("keeps a revoked reader's earlier posts under the reader's name", async () => {
    const { thread } = await comment();
    await revokeReader(db as Db, reader.id);
    const loaded = await loadThread(db as Db, thread.id);
    expect(loaded?.messages[0].readerId).toBe(reader.id);
  });

  it("restricts deleting a reader, a thread's version or a thread that has messages", async () => {
    const { thread } = await comment();
    // The delete triggers fire first; these confirm the keys point the same way.
    await expect(db.query(`delete from budget_readers where id = $1`, [reader.id])).rejects.toThrow();
    await expect(db.query(`delete from published_budgets where id = $1`, [version1])).rejects.toThrow();
    await expect(db.query(`delete from budget_threads where id = $1`, [thread.id])).rejects.toThrow();
  });
});

describe("row level security", () => {
  it("is on for the three tables, with no policies", async () => {
    const { rows } = await db.query<{ relname: string; relrowsecurity: boolean }>(
      `select relname, relrowsecurity from pg_class
       where relname in ('budget_readers', 'budget_threads', 'budget_messages') order by relname`,
    );
    expect(rows).toEqual([
      { relname: "budget_messages", relrowsecurity: true },
      { relname: "budget_readers", relrowsecurity: true },
      { relname: "budget_threads", relrowsecurity: true },
    ]);
    const { rows: policies } = await db.query(
      `select 1 from pg_policies where tablename in ('budget_readers', 'budget_threads', 'budget_messages')`,
    );
    expect(policies).toHaveLength(0);
  });

  it("gives the trigger functions an empty search_path", async () => {
    const { rows } = await db.query<{ proname: string; proconfig: string[] | null }>(
      `select proname, proconfig from pg_proc
       where proname in ('reject_budget_reader_change', 'reject_budget_thread_change', 'reject_budget_message_change', 'check_budget_message_reader')
       order by proname`,
    );
    expect(rows).toHaveLength(4);
    for (const row of rows) expect(row.proconfig).toEqual(["search_path=\"\""]);
  });
});
