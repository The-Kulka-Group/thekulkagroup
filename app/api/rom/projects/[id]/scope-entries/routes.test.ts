import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { publishBudget } from "@/lib/rom/published-budgets";
import { setRateClientForTests } from "@/lib/rom/rate-suggestion";
import { runRom } from "@/lib/rom/run";
import { definitionSection } from "@/lib/rom/scope-draft";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1503. AI drafts a line's Inclusions and Exclusions, the estimator edits,
// approves or removes them, and only approved entries reach a published budget.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const list = await import("./route");
const one = await import("./[entryId]/route");
const draft = await import("./draft/route");

const project = { params: Promise.resolve({ id: TEST_PROJECT_ID }) };
const entryContext = (entryId: string) => ({ params: Promise.resolve({ id: TEST_PROJECT_ID, entryId }) });

function request(method: string, body?: unknown, query = "") {
  return new Request(`http://localhost/api/rom/projects/${TEST_PROJECT_ID}/scope-entries${query}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

type Entry = { id: string; side: string; text: string; drafter: string; approvedBy: string | null; approvedAt: string | null };

function fakeModel(answer: unknown, sent: { content?: string } = {}) {
  setRateClientForTests({
    beta: {
      messages: {
        create: async (params) => {
          sent.content = String(params.messages[0].content);
          return {
            model: "claude-opus-5",
            stop_reason: "end_turn",
            content: [{ type: "text", text: JSON.stringify(answer) }],
          } as unknown as Anthropic.Beta.Messages.BetaMessage;
        },
      },
    },
  });
}

async function entries(costCode = "TEST"): Promise<Entry[]> {
  const response = await list.GET(request("GET", undefined, `?costCode=${costCode}`), project);
  return (await response.json()).entries;
}

async function addByHand(side: string, text: string): Promise<Entry> {
  const response = await list.POST(request("POST", { costCode: "TEST", side, text }), project);
  expect(response.status).toBe(201);
  return (await response.json()).entry;
}

async function patch(entryId: string, body: unknown) {
  return one.PATCH(request("PATCH", body), entryContext(entryId));
}

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  setRateClientForTests(null);
  await db.close();
});

describe("writing and approving entries", () => {
  it("adds an entry by hand as an unapproved draft written by the person", async () => {
    const entry = await addByHand("include", "  Footings   and Foundation Walls ");
    expect(entry).toMatchObject({ side: "include", text: "Footings and Foundation Walls", drafter: "user", approvedBy: null });
    expect(entry.approvedAt).toBeNull();
  });

  it("refuses an empty entry, a bad side and an unknown project", async () => {
    expect((await list.POST(request("POST", { costCode: "TEST", side: "include", text: "  " }), project)).status).toBe(400);
    expect((await list.POST(request("POST", { costCode: "TEST", side: "both", text: "X" }), project)).status).toBe(400);
    const missing = { params: Promise.resolve({ id: "00000000-0000-4000-8000-0000000000ff" }) };
    expect((await list.POST(request("POST", { costCode: "TEST", side: "include", text: "X" }), missing)).status).toBe(404);
  });

  it("approves an entry, and an edit takes the approval away", async () => {
    const entry = await addByHand("exclude", "Gas Piping");
    const approved = (await (await patch(entry.id, { approved: true })).json()).entry as Entry;
    expect(approved.approvedBy).toBe("browser-test@kulka.invalid");
    expect(approved.approvedAt).not.toBeNull();

    // Approving again keeps the first approval's time.
    const again = (await (await patch(entry.id, { approved: true })).json()).entry as Entry;
    expect(again.approvedAt).toBe(approved.approvedAt);

    // The same words keep it approved; new words do not.
    expect(((await (await patch(entry.id, { text: "Gas Piping" })).json()).entry as Entry).approvedBy).not.toBeNull();
    const edited = (await (await patch(entry.id, { text: "Gas Piping Beyond the Meter" })).json()).entry as Entry;
    expect(edited).toMatchObject({ text: "Gas Piping Beyond the Meter", approvedBy: null, approvedAt: null });

    // Editing and approving in one request approves the new words.
    const both = (await (await patch(entry.id, { text: "Gas Service", approved: true })).json()).entry as Entry;
    expect(both).toMatchObject({ text: "Gas Service", approvedBy: "browser-test@kulka.invalid" });

    const undone = (await (await patch(entry.id, { approved: false })).json()).entry as Entry;
    expect(undone.approvedBy).toBeNull();
  });

  it("removes a rejected entry", async () => {
    const entry = await addByHand("include", "Rejected Scope");
    expect((await one.DELETE(request("DELETE"), entryContext(entry.id))).status).toBe(204);
    expect(await entries()).toEqual([]);
    expect((await one.DELETE(request("DELETE"), entryContext(entry.id))).status).toBe(404);
  });

  it("puts only approved entries into a published budget, never a draft or an edited one", async () => {
    const kept = await addByHand("include", "Approved Scope");
    const edited = await addByHand("include", "Approved Then Edited");
    await addByHand("include", "Never Approved");
    await patch(kept.id, { approved: true });
    await patch(edited.id, { approved: true });
    await patch(edited.id, { text: "Edited After Approval" });

    const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
    const published = await publishBudget(db as Db, {
      runId,
      issuedBy: "devin@example.com",
      copy: { preparedFor: null, preparedBy: null, validityDays: null, coverSentence: null },
    });
    const line = published.snapshot.rom.lines.find((l) => l.costCode === "TEST")!;
    expect(line.includes?.map((e) => e.text)).toEqual(["Approved Scope"]);
    const page = JSON.stringify(published.snapshot);
    expect(page).not.toContain("Never Approved");
    expect(page).not.toContain("Edited After Approval");
  });
});

describe("drafting entries", () => {
  it("says drafts are not set up without an API key", async () => {
    const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
    const response = await draft.POST(request("POST", { costCode: "1", runId }), project);
    expect(response.status).toBe(503);
  });

  it("drafts from Kulka's definition and the run's answers, and saves every entry unapproved", async () => {
    const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
    // The seeded run prices TEST; the draft needs a line Kulka has defined.
    await db.query(`update runs set rom = jsonb_set(rom, '{lines,0,costCode}', '"1a"') where id = $1`, [runId]);
    const sent: { content?: string } = {};
    fakeModel({ includes: ["mechanical demolition of the structure.", "Loading and Trucking", "Loading and Trucking"], excludes: ["Hazardous Material Abatement"] }, sent);

    const response = await draft.POST(request("POST", { costCode: "1a", runId }), project);
    expect(response.status).toBe(201);
    const saved = (await response.json()).entries as Entry[];
    expect(saved.map((e) => [e.side, e.text])).toEqual([
      ["exclude", "Hazardous Material Abatement"],
      ["include", "Mechanical Demolition of the Structure"],
      ["include", "Loading and Trucking"],
    ]);
    expect(saved.every((e) => e.drafter === "ai" && e.approvedBy === null)).toBe(true);

    const asked = JSON.parse(sent.content!);
    expect(asked.definition).toContain("### 1a. Structure Demolition");
    expect(asked.definition).not.toContain("### 2.");
    expect(asked.projectAnswers).toMatchObject({ grossSquareFeet: expect.any(Number) });

    // A second draft does not add the same words twice.
    const second = await draft.POST(request("POST", { costCode: "1a", runId }), project);
    expect(((await second.json()).entries as Entry[]).length).toBe(3);
  });

  it("refuses an item that is not in the run, and one Kulka has not defined", async () => {
    const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
    fakeModel({ includes: ["X"], excludes: [] });
    expect((await draft.POST(request("POST", { costCode: "1a", runId }), project)).status).toBe(404);
    expect((await draft.POST(request("POST", { costCode: "TEST", runId }), project)).status).toBe(422);
  });

  it("saves nothing when the model's answer cannot be read", async () => {
    const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
    await db.query(`update runs set rom = jsonb_set(rom, '{lines,0,costCode}', '"1a"') where id = $1`, [runId]);
    fakeModel({ includes: "not a list" });
    expect((await draft.POST(request("POST", { costCode: "1a", runId }), project)).status).toBe(502);
    expect(await entries("1a")).toEqual([]);
  });
});

describe("definitionSection", () => {
  const doc = ["## Division 02", "### 1. Site Demolition", "Site text.", "### 1a. Structure Demolition", "Structure text.", "## Division 03", "### 2. Foundations"].join("\n");

  it("takes one item's section, and no other item's", () => {
    expect(definitionSection(doc, "1")).toBe("### 1. Site Demolition\nSite text.");
    expect(definitionSection(doc, "1a")).toBe("### 1a. Structure Demolition\nStructure text.");
    expect(definitionSection(doc, "26c")).toBeNull();
  });
});
