import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import {
  aboutWords,
  countThreadsNeedingKulka,
  listProjectComments,
  listThreadsNeedingKulka,
  needsKulkaSentence,
  whoWords,
} from "./budget-comment-inbox";
import {
  addReader,
  closeThread,
  hideMessage,
  openThread,
  removeMessage,
  replyToThread,
  type BudgetReader,
  type StaffAuthor,
} from "./budget-comments";
import { newToken, publishBudget, revokePublishedBudget } from "./published-budgets";

// LA-1490. The reads behind Home, the Rail count and the Client Comments
// panel, against a real Postgres built from this repo's migrations.

let db: Awaited<ReturnType<typeof seededDatabase>>;
let runId: string;
let version1: string;
let reader: BudgetReader;
let device: string;

const COPY = { preparedFor: "Harbor Point Partners (example)", preparedBy: "Devin (example)", validityDays: null, coverSentence: null };
const STAFF: StaffAuthor = { name: "Devin", account: "open-access@kulka.invalid" };
const ANCHOR = { section: "The Project", label: "Structure Demolition", text: "$120,000", figure: null };

async function publish(): Promise<string> {
  return (await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY })).id;
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

function open(kind: "comment" | "question" | "flag" = "question", elementId = "line:1a", body: string | null = "How was this priced?") {
  return openThread(db as Db, {
    publishedBudgetId: version1,
    readerId: reader.id,
    deviceId: device,
    elementId,
    anchor: ANCHOR,
    kind,
    body,
    ...(kind === "flag" ? { proposed: "1,200 SF", elementId: "fact:grossSquareFeet" } : {}),
  });
}

const staffReply = (threadId: string, internal = false) =>
  replyToThread(db as Db, { threadId, author: "staff", staff: STAFF, body: internal ? "Check with Rob." : "It is from three jobs.", internal });
const readerReply = (threadId: string, deviceId = device) =>
  replyToThread(db as Db, { threadId, author: "reader", readerId: reader.id, deviceId, body: "Thanks, one more thing." });

describe("the sentence", () => {
  it("reads as the spec's example for a question", () => {
    expect(
      needsKulkaSentence({ who: whoWords("Dan Reyes", "Fieldstone"), kind: "question", about: "Structure Demolition", version: 2, followUp: false }),
    ).toBe("Dan Reyes at Fieldstone asked about Structure Demolition on Version 2.");
  });

  it("changes the verb for a comment, a flag and a follow-up", () => {
    const base = { who: "Dan Reyes", about: "Gross Area", version: 1 };
    expect(needsKulkaSentence({ ...base, kind: "comment", followUp: false })).toBe("Dan Reyes commented on Gross Area on Version 1.");
    expect(needsKulkaSentence({ ...base, kind: "flag", followUp: false })).toBe("Dan Reyes flagged Gross Area on Version 1.");
    expect(needsKulkaSentence({ ...base, kind: "flag", followUp: true })).toBe("Dan Reyes replied about Gross Area on Version 1.");
  });

  it("drops the company when there is none, and names the whole page", () => {
    expect(whoWords("Dan Reyes", null)).toBe("Dan Reyes");
    expect(aboutWords("page:general", ANCHOR)).toBe("the budget as a whole");
    expect(aboutWords("line:1a", ANCHOR)).toBe("Structure Demolition");
    expect(aboutWords("line:1a", {})).toBe("an item");
  });
});

describe("threads that need Kulka", () => {
  it("counts and lists a new question, with the sentence Home shows", async () => {
    await open("question");
    expect(await countThreadsNeedingKulka(db as Db)).toBe(1);
    const [item] = await listThreadsNeedingKulka(db as Db);
    expect(item).toMatchObject({
      projectId: TEST_PROJECT_ID,
      version: 1,
      preparedBy: "Devin (example)",
      kind: "question",
      sentence: "Dan Reyes at Fieldstone asked about Structure Demolition on Version 1.",
      said: "How was this priced?",
    });
  });

  it("stops counting once Kulka replies in a way the client can see", async () => {
    const { thread } = await open("question");
    await staffReply(thread.id);
    expect(await countThreadsNeedingKulka(db as Db)).toBe(0);
    expect(await listThreadsNeedingKulka(db as Db)).toEqual([]);
  });

  it("keeps counting after an Internal Note, which tells the client nothing", async () => {
    const { thread } = await open("question");
    await staffReply(thread.id, true);
    expect(await countThreadsNeedingKulka(db as Db)).toBe(1);
  });

  it("counts a reader's reply to Kulka again, as a follow-up", async () => {
    const { thread } = await open("comment");
    await staffReply(thread.id);
    expect(await countThreadsNeedingKulka(db as Db)).toBe(0);
    await readerReply(thread.id);
    const [item] = await listThreadsNeedingKulka(db as Db);
    expect(item.sentence).toBe("Dan Reyes at Fieldstone replied about Structure Demolition on Version 1.");
    expect(item.said).toBe("Thanks, one more thing.");
  });

  it("counts a flag that carries only a correction, and leaves a closed thread out", async () => {
    const { thread } = await open("flag", "fact:grossSquareFeet", null);
    expect(await countThreadsNeedingKulka(db as Db)).toBe(1);
    const [item] = await listThreadsNeedingKulka(db as Db);
    expect(item).toMatchObject({ kind: "flag", proposed: "1,200 SF", said: null });
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF, outcome: "accepted" } });
    expect(await countThreadsNeedingKulka(db as Db)).toBe(0);
  });

  it("does not let a hidden Kulka reply hide the need", async () => {
    const { thread } = await open("comment");
    const { message } = await staffReply(thread.id);
    expect(await countThreadsNeedingKulka(db as Db)).toBe(0);
    await hideMessage(db as Db, { messageId: message.id, hiddenBy: "Devin" });
    expect(await countThreadsNeedingKulka(db as Db)).toBe(1);
  });

  it("lists the newest client activity first", async () => {
    // Writes in the same millisecond tie on time, and the inbox cannot order
    // them. Real replies never land that close, so the test waits (LA-1547).
    const tick = () => new Promise((resolve) => setTimeout(resolve, 5));
    const first = await open("comment", "line:1a", "First.");
    await tick();
    await open("comment", "line:2a", "Second.");
    expect((await listThreadsNeedingKulka(db as Db)).map((i) => i.said)).toEqual(["Second.", "First."]);
    // A later reply on the older thread moves it to the top.
    await tick();
    await staffReply(first.thread.id);
    await tick();
    await readerReply(first.thread.id);
    expect((await listThreadsNeedingKulka(db as Db)).map((i) => i.said)).toEqual(["Thanks, one more thing.", "Second."]);
  });

  it("keeps the count equal to the list", async () => {
    await open("comment");
    await open("question", "line:2a");
    const answered = await open("question", "line:3a");
    await staffReply(answered.thread.id);
    expect(await countThreadsNeedingKulka(db as Db)).toBe((await listThreadsNeedingKulka(db as Db)).length);
    expect(await countThreadsNeedingKulka(db as Db)).toBe(2);
  });
});

describe("listProjectComments", () => {
  it("is empty for a project with no comments and for a bad id", async () => {
    expect(await listProjectComments(db as Db, TEST_PROJECT_ID)).toEqual({ defaultReplyAs: "Devin (example)", needsKulka: 0, versions: [] });
    expect(await listProjectComments(db as Db, "nope")).toEqual({ defaultReplyAs: null, needsKulka: 0, versions: [] });
  });

  it("groups threads by version, newest version first, with the messages, internal notes included", async () => {
    const { thread } = await open("question");
    await staffReply(thread.id, true);
    const version2 = await publish();
    expect(version2).not.toBe(version1);
    const comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    // Version 2 has no threads of its own, so only Version 1 lists.
    expect(comments.versions.map((v) => [v.version, v.state, v.threads.length])).toEqual([[1, "superseded", 1]]);
    const [row] = comments.versions[0].threads;
    expect(row).toMatchObject({
      kind: "question",
      status: "open",
      label: "Structure Demolition",
      budgetSays: "$120,000",
      needsKulka: true,
      reader: { name: "Dan Reyes", company: "Fieldstone" },
    });
    expect(row.messages.map((m) => [m.author, m.visibility])).toEqual([
      ["Dan Reyes", "client"],
      ["Devin", "internal"],
    ]);
    expect(JSON.stringify(comments)).not.toContain("dan@example.com");
  });

  it("marks a thread whose element the newest version no longer holds, until it is closed", async () => {
    const gone = await open("comment", "line:no-longer-here");
    const kept = await open("comment", "section:your-number");
    const general = await open("comment", "page:general");
    await publish();
    let comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    const byId = new Map(comments.versions[0].threads.map((t) => [t.id, t]));
    expect(byId.get(gone.thread.id)?.elementMissingIn).toBe(2);
    expect(byId.get(kept.thread.id)?.elementMissingIn).toBeNull();
    expect(byId.get(general.thread.id)?.elementMissingIn).toBeNull();

    await closeThread(db as Db, { threadId: gone.thread.id, by: { kind: "staff", staff: STAFF } });
    comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    expect(comments.versions[0].threads.find((t) => t.id === gone.thread.id)?.elementMissingIn).toBeNull();
  });

  it("does not mark an element missing on the newest version itself", async () => {
    const { thread } = await open("comment", "line:no-longer-here");
    const comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    expect(comments.versions[0].threads.find((t) => t.id === thread.id)?.elementMissingIn).toBeNull();
  });

  it("measures the newest version among those still open", async () => {
    const { thread } = await open("comment", "line:no-longer-here");
    const v2 = await publish();
    await revokePublishedBudget(db as Db, v2);
    const comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    // Version 2 is withdrawn, so Version 1 is the newest open one and holds its own element.
    expect(comments.versions[0].threads.find((t) => t.id === thread.id)?.elementMissingIn).toBeNull();
  });

  it("marks a post from a device the reader has not used before", async () => {
    const first = await open("comment", "line:1a", "From the office.");
    expect((await listProjectComments(db as Db, TEST_PROJECT_ID)).versions[0].threads[0].newDevice).toBe(false);
    await readerReply(first.thread.id, newToken());
    const [row] = (await listProjectComments(db as Db, TEST_PROJECT_ID)).versions[0].threads;
    expect(row.newDevice).toBe(true);
    // The same new device a second time is no longer new.
    await readerReply(first.thread.id, (await db.query<{ device_id: string }>(
      `select device_id from budget_messages where thread_id = $1 order by created_at desc, id limit 1`,
      [first.thread.id],
    )).rows[0].device_id);
    const after = (await listProjectComments(db as Db, TEST_PROJECT_ID)).versions[0].threads[0];
    expect(after.newDevice).toBe(false);
  });

  it("shows a removed message with no words and a hidden one marked", async () => {
    const { thread, message } = await open("comment");
    const reply = await staffReply(thread.id);
    await removeMessage(db as Db, { messageId: message!.id, removedBy: "Devin" });
    await hideMessage(db as Db, { messageId: reply.message.id, hiddenBy: "Devin" });
    const [row] = (await listProjectComments(db as Db, TEST_PROJECT_ID)).versions[0].threads;
    expect(row.messages[0]).toMatchObject({ body: null, removed: true });
    expect(row.messages[1]).toMatchObject({ hidden: true });
  });

  it("reports the count of threads that need Kulka, the same as the Rail", async () => {
    await open("comment");
    const answered = await open("question", "line:2a");
    await staffReply(answered.thread.id);
    const comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    expect(comments.needsKulka).toBe(1);
    expect(comments.needsKulka).toBe(await countThreadsNeedingKulka(db as Db));
  });
});
