import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import type { NeedsKulka } from "@/lib/rom/budget-comment-inbox";
import { addReader, openThread, replyToThread } from "@/lib/rom/budget-comments";
import { newToken, publishBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { HomeThread } from "./HomeThreads";

// LA-1490. Home's list of client comments that need Kulka: one sentence and a
// Reply action each, newest first, and nothing for a thread Kulka has
// answered. The form behind Reply sends to the reply route, tested in
// app/api/rom/comments/routes.test.ts.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const { default: Home } = await import("./page");

const ANCHOR = { section: "The Project", label: "Structure Demolition", text: "$120,000", figure: null };

let versionId: string;
let readerId: string;

beforeEach(async () => {
  db = await seededDatabase();
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  versionId = (
    await publishBudget(db as Db, {
      runId,
      issuedBy: "devin@example.com",
      copy: { preparedFor: "Harbor Point (example)", preparedBy: "Devin (example)", validityDays: null, coverSentence: null },
    })
  ).id;
  readerId = (
    await addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Dan Reyes", email: "dan@example.com", company: "Fieldstone", createdBy: "x@example.com" })
  ).id;
});

afterEach(async () => {
  await db.close();
});

const ask = (elementId: string, body: string) =>
  openThread(db as Db, { publishedBudgetId: versionId, readerId, deviceId: newToken(), elementId, anchor: ANCHOR, kind: "question", body });

async function home() {
  return renderToStaticMarkup(await Home());
}

describe("Home", () => {
  it("says nothing needs a reply when no thread waits", async () => {
    const html = await home();
    expect(html).toContain("Nothing needs a reply.");
    expect(html).not.toContain("hc-list");
  });

  it("lists each thread that needs Kulka as one sentence with a Reply action, and counts them", async () => {
    await ask("line:1a", "How was this priced?");
    const answered = await ask("line:2a", "And this?");
    await replyToThread(db as Db, {
      threadId: answered.thread.id,
      author: "staff",
      staff: { name: "Devin", account: "open-access@kulka.invalid" },
      body: "Three jobs.",
    });
    const html = await home();
    expect(html).toContain("1 client comment needs a reply.");
    expect(html).toContain("Dan Reyes at Fieldstone asked about Structure Demolition on Version 1.");
    expect((html.match(/<button[^>]*>Reply<\/button>/g) ?? []).length).toBe(1);
    expect(html).not.toContain("@");
  });

  it("puts the newest thread first", async () => {
    await ask("line:1a", "First.");
    await new Promise((resolve) => setTimeout(resolve, 5));
    await openThread(db as Db, {
      publishedBudgetId: versionId,
      readerId,
      deviceId: newToken(),
      elementId: "line:2a",
      anchor: { ...ANCHOR, label: "Elevators" },
      kind: "comment",
      body: "Second.",
    });
    const html = await home();
    expect(html).toContain("2 client comments need a reply.");
    expect(html.indexOf("commented on Elevators")).toBeLessThan(html.indexOf("asked about Structure Demolition"));
  });

  it("says so when the comments cannot be read", async () => {
    await db.query(`drop table budget_messages cascade`);
    expect(await home()).toContain("Client comments could not be read.");
  });
});

describe("a Home row", () => {
  const item: NeedsKulka = {
    threadId: "t1",
    projectId: TEST_PROJECT_ID,
    projectName: "Harbor Point",
    version: 2,
    preparedBy: "Devin (example)",
    kind: "flag",
    sentence: "Dan Reyes at Fieldstone flagged Gross Area on Version 2.",
    at: "2026-10-02T15:00:00.000Z",
    said: "We added a floor.",
    proposed: "1,200 SF",
    budgetSays: "1,000 SF",
  };
  const row = (patch: Partial<Parameters<typeof HomeThread>[0]> = {}) =>
    renderToStaticMarkup(
      <ul>
        <HomeThread
          item={item}
          replying={false}
          text=""
          replyAs="Devin (example)"
          busy={false}
          error={null}
          onReply={() => {}}
          onText={() => {}}
          onReplyAs={() => {}}
          onSend={() => {}}
          onCancel={() => {}}
          {...patch}
        />
      </ul>,
    );

  it("offers Reply, and no form until it is pressed", () => {
    const html = row();
    expect(html).toContain("Dan Reyes at Fieldstone flagged Gross Area on Version 2.");
    expect(html).toContain(">Reply</button>");
    expect(html).not.toContain("<textarea");
    expect(html).toContain("Harbor Point");
  });

  it("opens the client's words, a Reply As field and a reply box", () => {
    const html = row({ replying: true });
    expect(html).toContain("We added a floor.");
    expect(html).toContain("What It Should Be:</b> 1,200 SF");
    expect(html).toContain("Reply As");
    expect(html).toMatch(/value="Devin \(example\)"/);
    expect(html).toContain("Reply to the Client");
    expect(html).toMatch(/<button type="submit" class="btn btn--primary" disabled="">Send Reply<\/button>/);
    expect(html).not.toContain(">Reply</button>");
  });

  it("holds the send until Reply As and the reply both have words", () => {
    expect(row({ replying: true, text: "Thanks." })).not.toMatch(/disabled="">Send Reply/);
    expect(row({ replying: true, text: "Thanks.", replyAs: " " })).toMatch(/disabled="">Send Reply/);
  });
});
