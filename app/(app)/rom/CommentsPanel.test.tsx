import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PARAMETER_NAMES } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import type { PanelMessage, PanelThread, PanelVersion } from "@/lib/rom/budget-comment-inbox";

import { ThreadCard, VersionThreads, type ActiveAction } from "./CommentsPanel";
import { markersOf, offersOf, stateWords } from "./comments-model";

// LA-1490. What the Client Comments panel offers on each kind of thread, the
// forms it opens, the marks it shows, and the copy guard over all of it. What
// each action does to the database is tested in
// app/api/rom/comments/routes.test.ts.

const noop = () => {};

function message(patch: Partial<PanelMessage> = {}): PanelMessage {
  return {
    id: "m1",
    authorKind: "reader",
    author: "Dan Reyes",
    company: "Fieldstone",
    visibility: "client",
    body: "How was this priced?",
    createdAt: "2026-10-02T15:00:00.000Z",
    hidden: false,
    removed: false,
    ...patch,
  };
}

function thread(patch: Partial<PanelThread> = {}): PanelThread {
  return {
    id: "t1",
    kind: "question",
    status: "open",
    outcome: null,
    elementId: "line:1a",
    label: "Structure Demolition",
    budgetSays: "$120,000",
    proposed: null,
    proposedRemoved: false,
    openedAt: "2026-10-02T15:00:00.000Z",
    reader: { name: "Dan Reyes", company: "Fieldstone" },
    needsKulka: true,
    newDevice: false,
    elementMissingIn: null,
    messages: [message()],
    ...patch,
  };
}

function card(t: PanelThread, active: ActiveAction | null = null, patch: Partial<Parameters<typeof ThreadCard>[0]> = {}) {
  return renderToStaticMarkup(
    <ul>
      <ThreadCard
        thread={t}
        active={active}
        text=""
        busy={false}
        error={null}
        replyAsMissing={false}
        onStart={noop}
        onText={noop}
        onSubmit={noop}
        onCancel={noop}
        {...patch}
      />
    </ul>,
  );
}

// The thread's own buttons. Each message carries its own Remove, counted apart.
const buttons = (html: string) =>
  [...html.matchAll(/<button([^>]*)>(.*?)<\/button>/g)].filter((m) => !m[1].includes("cc-msg-remove")).map((m) => m[2].replace(/<[^>]+>/g, ""));
const messageRemoves = (html: string) => (html.match(/cc-msg-remove/g) ?? []).length;

describe("what each thread offers", () => {
  it("offers Reply, Internal Note and Close on a comment or question", () => {
    for (const kind of ["comment", "question"] as const) {
      expect(buttons(card(thread({ kind })))).toEqual(["Reply", "Internal Note", "Close"]);
    }
  });

  it("offers Accept for Next Version and Decline on a flag, in place of a plain Close", () => {
    const html = card(thread({ kind: "flag", elementId: "fact:grossSquareFeet", proposed: "1,200 SF" }));
    expect(buttons(html)).toEqual(["Reply", "Internal Note", "Accept for Next Version", "Decline", "Remove What It Should Be"]);
  });

  it("offers no reply, note or close on a closed thread, and keeps Remove on each message", () => {
    const html = card(thread({ status: "closed" }));
    expect(buttons(html)).toEqual([]);
    expect(messageRemoves(html)).toBe(1);
    expect(offersOf({ kind: "flag", status: "closed", proposed: "1,200 SF" })).toMatchObject({
      reply: false,
      accept: false,
      decline: false,
      removeCorrection: true,
    });
  });

  it("offers no Remove on a message already removed, and says so in the writer's words", () => {
    const html = card(thread({ messages: [message({ body: null, removed: true })] }));
    expect(html).toContain("Removed at the Writer&rsquo;s Request".replace("&rsquo;", "’"));
    expect(messageRemoves(html)).toBe(0);
  });
});

describe("the forms", () => {
  it("opens a reply box for Reply and an Internal Note box that says only Kulka sees it", () => {
    const reply = card(thread(), { mode: "reply" });
    expect(reply).toContain("Reply to the Client");
    expect(buttons(reply)).toEqual(["Cancel", "Send Reply"]);
    const note = card(thread(), { mode: "note" });
    expect(note).toContain("Only Kulka sees an Internal Note.");
    expect(buttons(note)).toEqual(["Cancel", "Save Note"]);
  });

  it("asks for the client-visible reply a decline needs, and disables send until there is one", () => {
    const flag = thread({ kind: "flag", proposed: "1,200 SF" });
    const empty = card(flag, { mode: "decline" });
    expect(empty).toContain("The owner reads this reply. It tells them why.");
    expect(empty).toMatch(/<button type="submit" class="btn btn--primary" disabled="">Decline and Reply<\/button>/);
    const filled = card(flag, { mode: "decline" }, { text: "The garage is in the area." });
    expect(filled).not.toMatch(/disabled="">Decline and Reply/);
  });

  it("puts Close, Accept and Remove behind a confirm step", () => {
    expect(buttons(card(thread(), { mode: "close" }))).toEqual(["Cancel", "Confirm Close"]);
    expect(card(thread({ kind: "flag", proposed: "1,200 SF" }), { mode: "accept" })).toContain("The budget does not change.");
    expect(buttons(card(thread({ kind: "flag", proposed: "1,200 SF" }), { mode: "remove-correction" }))).toEqual(["Cancel", "Confirm Remove"]);
    expect(buttons(card(thread(), { mode: "remove-message", messageId: "m1" }))).toEqual(["Cancel", "Confirm Remove"]);
  });

  it("holds every send while Reply As is empty", () => {
    const html = card(thread(), { mode: "close" }, { replyAsMissing: true });
    expect(html).toMatch(/disabled="">Confirm Close/);
  });

  it("shows an error under the thread", () => {
    expect(card(thread(), null, { error: "That thread is closed." })).toContain("That thread is closed.");
  });
});

describe("what a thread shows", () => {
  it("names the element, reader, kind and state", () => {
    const html = card(thread());
    for (const text of ["Structure Demolition", "Dan Reyes, Fieldstone", "Question", "Open", "$120,000"]) expect(html).toContain(text);
  });

  it("shows Budget Says beside Owner Says on a flag", () => {
    const html = card(thread({ kind: "flag", proposed: "1,200 SF", budgetSays: "1,000 SF" }));
    expect(html).toMatch(/Budget Says<\/dt><dd>1,000 SF/);
    expect(html).toMatch(/Owner Says<\/dt><dd>1,200 SF/);
  });

  it("marks New Device for This Reader and Element Not in Version 2 where they apply", () => {
    expect(card(thread())).not.toContain("cc-mark--warn");
    const html = card(thread({ newDevice: true, elementMissingIn: 2 }));
    expect(html).toContain("New Device for This Reader");
    expect(html).toContain("Element Not in Version 2");
    expect(markersOf({ newDevice: false, elementMissingIn: 3 })).toEqual(["Element Not in Version 3"]);
  });

  it("labels an Internal Note and a hidden message, and shows the closed states", () => {
    const html = card(thread({ messages: [message({ visibility: "internal", authorKind: "staff", author: "Devin", company: null, hidden: true })] }));
    expect(html).toContain("Internal Note");
    expect(html).toContain("Hidden From the Client");
    expect(stateWords({ kind: "flag", status: "closed", outcome: "accepted" })).toBe("Accepted for Next Version");
    expect(stateWords({ kind: "flag", status: "closed", outcome: "declined" })).toBe("Declined");
    expect(stateWords({ kind: "flag", status: "closed", outcome: "withdrawn" })).toBe("Withdrawn");
    expect(stateWords({ kind: "comment", status: "closed", outcome: null })).toBe("Closed");
    expect(stateWords({ kind: "question", status: "answered", outcome: null })).toBe("Answered");
  });

  it("groups threads under their version with how many need Kulka", () => {
    const version: PanelVersion = {
      id: "v2",
      version: 2,
      state: "current",
      preparedBy: "Devin",
      threads: [thread(), thread({ id: "t2", needsKulka: false })],
    };
    const html = renderToStaticMarkup(<VersionThreads version={version} card={(t) => <li key={t.id}>{t.id}</li>} />);
    expect(html).toContain("Version 2");
    expect(html).toContain("Current, 1 Needs Kulka");
  });
});

const LEAKS: RegExp[] = [/docs\//, /\.md\b/, /\bjev\b/i, /\bLLM\b/, ...PARAMETER_NAMES.map((name) => new RegExp(name.replace(/\./g, "\\.")))];

function visibleText(html: string): string[] {
  return html
    .split(/<[^>]+>/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

describe("copy guard and case", () => {
  const html = [
    card(thread()),
    card(thread({ kind: "flag", proposed: "1,200 SF", newDevice: true, elementMissingIn: 2 })),
    card(thread({ status: "closed" })),
    card(thread({ messages: [message({ visibility: "internal", authorKind: "staff", author: "Devin", company: null, hidden: true })] })),
    card(thread(), { mode: "reply" }),
    card(thread(), { mode: "note" }),
    card(thread({ kind: "flag", proposed: "1,200 SF" }), { mode: "decline" }),
    card(thread({ kind: "flag", proposed: "1,200 SF" }), { mode: "accept" }),
    card(thread(), { mode: "remove-message", messageId: "m1" }),
  ].join("");

  it("shows no email address, repository path or engine key", () => {
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    for (const leak of LEAKS) expect(html).not.toMatch(leak);
  });

  it("puts every button, label and heading in title case", () => {
    const labels = visibleText(html).filter(
      (piece) => piece.split(/\s+/).length <= 4 && !/[.?]$/.test(piece) && !/\d/.test(piece) && piece !== "Nothing shown",
    );
    // Names a reader typed are not labels.
    const wrong = labels.filter((piece) => !["Dan Reyes, Fieldstone", "Dan Reyes"].includes(piece) && titleCase(piece) !== piece);
    expect(wrong).toEqual([]);
  });

  it("uses no em dash or en dash", () => {
    expect(html).not.toMatch(/[–—]/);
  });
});

describe("phone width", () => {
  const css = readFileSync(new URL("./comments.css", import.meta.url), "utf8");

  it("gives nothing a fixed width and lets rows and text wrap", () => {
    expect(css).not.toMatch(/(^|[^-])width:\s*\d+px/m);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/flex-wrap:\s*wrap/);
    expect(css).toMatch(/minmax\(min\(\d+px, 100%\)/);
  });
});
