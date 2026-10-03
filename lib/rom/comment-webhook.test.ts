import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { addReader, openThread, replyToThread, type BudgetReader } from "./budget-comments";
import { COMMENT_WEBHOOK_TIMEOUT_MS, commentWebhookUrl, notifyNewThread, threadLink } from "./comment-webhook";
import { newToken, publishBudget } from "./published-budgets";

// LA-1492. The webhook push for a new thread that needs Kulka, against a real
// Postgres and a stubbed fetch.

const HOOK = "https://hooks.example.com/services/secret-path";
const ORIGIN = "https://kulka.ai";
const COPY = { preparedFor: "Harbor Point Partners (example)", preparedBy: "Devin (example)", validityDays: null, coverSentence: null };
const ANCHOR = { section: "The Project", label: "Structure Demolition", text: "$120,000", figure: null };
const BODY = "Why is demolition so high? Call me at 555-0100.";

let db: Awaited<ReturnType<typeof seededDatabase>>;
let reader: BudgetReader;
let versionId: string;
let device: string;
let fetchMock: ReturnType<typeof vi.fn>;

async function newQuestion() {
  const { thread } = await openThread(db as Db, {
    publishedBudgetId: versionId,
    readerId: reader.id,
    deviceId: device,
    elementId: "line:1a",
    anchor: ANCHOR,
    kind: "question",
    body: BODY,
  });
  return thread;
}

beforeEach(async () => {
  db = await seededDatabase();
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  versionId = (await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY })).id;
  reader = await addReader(db as Db, {
    projectId: TEST_PROJECT_ID,
    name: "Dan Reyes",
    email: "dan@example.com",
    company: "Fieldstone",
    createdBy: "devin@example.com",
  });
  device = newToken();
  fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await db.close();
});

describe("when the variable is unset", () => {
  it("sends nothing, for an unset and a blank value", async () => {
    const thread = await newQuestion();
    vi.stubEnv("KULKA_COMMENT_WEBHOOK_URL", "");
    expect(commentWebhookUrl()).toBeNull();
    expect(await notifyNewThread(db as Db, thread.id, ORIGIN)).toBe(false);
    vi.stubEnv("KULKA_COMMENT_WEBHOOK_URL", "   ");
    expect(await notifyNewThread(db as Db, thread.id, ORIGIN)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("when the variable is set", () => {
  beforeEach(() => vi.stubEnv("KULKA_COMMENT_WEBHOOK_URL", HOOK));

  it("posts the Home sentence and a link, and nothing from the message", async () => {
    const thread = await newQuestion();
    expect(await notifyNewThread(db as Db, thread.id, ORIGIN)).toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const link = `${ORIGIN}/rom?project=${TEST_PROJECT_ID}&thread=${thread.id}`;
    const sentence = "Dan Reyes at Fieldstone asked about Structure Demolition on Version 1.";
    const raw = String(init.body);
    expect(JSON.parse(raw)).toEqual({ text: `${sentence} ${link}`, sentence, link });
    expect(raw).not.toContain("Why is demolition");
    expect(raw).not.toContain("555-0100");
    expect(raw).not.toContain("dan@example.com");
  });

  it("sends nothing for a thread that no longer needs Kulka, and for an unknown thread", async () => {
    const thread = await newQuestion();
    await replyToThread(db as Db, {
      threadId: thread.id,
      author: "staff",
      staff: { name: "Devin", account: "open-access@kulka.invalid" },
      body: "It is from three jobs.",
      internal: false,
    });
    expect(await notifyNewThread(db as Db, thread.id, ORIGIN)).toBe(false);
    expect(await notifyNewThread(db as Db, "00000000-0000-4000-8000-000000000000", ORIGIN)).toBe(false);
    expect(await notifyNewThread(db as Db, "not-a-uuid", ORIGIN)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("logs and returns false when the endpoint answers with an error", async () => {
    const thread = await newQuestion();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 500 }));
    await expect(notifyNewThread(db as Db, thread.id, ORIGIN)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("500"));
  });

  it("logs and returns false when the send throws or times out, without printing the address", async () => {
    const thread = await newQuestion();
    fetchMock.mockRejectedValueOnce(new Error(`connect failed to ${HOOK}`));
    await expect(notifyNewThread(db as Db, thread.id, ORIGIN)).resolves.toBe(false);
    fetchMock.mockRejectedValueOnce(new DOMException("The operation timed out.", "TimeoutError"));
    await expect(notifyNewThread(db as Db, thread.id, ORIGIN)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(console.error).mock.calls) expect(String(call[0])).not.toContain("secret-path");
  });

  it("gives up after the short timeout", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    try {
      const thread = await newQuestion();
      fetchMock.mockImplementationOnce(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          }),
      );
      const sending = notifyNewThread(db as Db, thread.id, ORIGIN);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(COMMENT_WEBHOOK_TIMEOUT_MS + 1);
      await expect(sending).resolves.toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("threadLink", () => {
  it("names the project and the thread, and tolerates a trailing slash on the origin", () => {
    expect(threadLink("https://kulka.ai/", "p 1", "t1")).toBe("https://kulka.ai/rom?project=p%201&thread=t1");
  });
});
