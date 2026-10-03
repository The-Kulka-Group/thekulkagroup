import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { anchorFor } from "@/lib/rom/reader-posts";
import { runRom } from "@/lib/rom/run";
import { referencePublication } from "@/test/fixtures/published-budget";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { addressableElements, type AddressableElement } from "./addressable-elements";
import { listProjectComments } from "./budget-comment-inbox";
import {
  addReader,
  closeThread,
  isAssumptionElement,
  openThread,
  replyToThread,
  type BudgetReader,
  type StaffAuthor,
} from "./budget-comments";
import { presentBudget } from "./presentation";
import { newToken, publishBudget, revokePublishedBudget } from "./published-budgets";
import { listPageThreads, newestOpenElements, placeThreads, type CarryThread } from "./thread-carry";

// LA-1491. The carry and orphan rule across two published versions.

// Version 1 is MN Test #4 as published. Version 2 drops Millwork, doubles
// Screened Balconies and rewrites the first assumption.
const v1Elements = () => addressableElements(presentBudget(referencePublication()));
function v2Elements(): ReadonlyMap<string, AddressableElement> {
  const publication = referencePublication({ version: 2 });
  const rom = publication.snapshot.rom;
  rom.lines = rom.lines.filter((line) => line.costCode !== "10");
  const balconies = rom.lines.find((line) => line.costCode === "11") as unknown as Record<string, unknown>;
  for (const key of ["low", "high", "likely", "median"]) {
    if (typeof balconies[key] === "number") balconies[key] = (balconies[key] as number) * 2;
  }
  rom.assumptions = ["The project is multifamily new construction over a podium.", ...rom.assumptions.slice(1)];
  return addressableElements(presentBudget(publication));
}

const V1 = "00000000-0000-4000-8000-0000000000a1";
const V2 = "00000000-0000-4000-8000-0000000000a2";

function threadOn(element: AddressableElement, over: Partial<CarryThread> = {}): CarryThread {
  return {
    id: `t-${element.id}`,
    publishedBudgetId: V1,
    version: 1,
    elementId: element.id,
    anchor: anchorFor(element),
    status: "open",
    outcome: null,
    addressedIn: null,
    ...over,
  };
}

describe("placeThreads on MN Test #4", () => {
  const one = v1Elements();
  const two = v2Elements();
  const v2Page = { id: V2, version: 2, newestOpen: true, elements: two };
  const firstNote = [...one.values()].find((e) => e.kind === "note") as AddressableElement;
  const keptNote = [...one.values()].filter((e) => e.kind === "note")[1];

  it("starts from a Version 2 that differs where the test says", () => {
    expect(one.has("line:10")).toBe(true);
    expect(two.has("line:10")).toBe(false);
    expect(two.get("line:11")?.figure).not.toBe(one.get("line:11")?.figure);
    expect(two.has(firstNote.id)).toBe(false);
    expect(two.get(keptNote.id)?.text).toBe(keptNote.text);
  });

  it("carries an open thread to the same id and reads From Version 1", () => {
    const thread = threadOn(one.get("section:your-number") as AddressableElement);
    const placed = placeThreads(v2Page, [thread]);
    expect(placed.fromEarlierVersions).toEqual([]);
    const [entry] = placed.onElements.get("section:your-number") ?? [];
    expect(entry).toMatchObject({ fromVersion: 1, carriedInto: null });
  });

  it("marks Changed Since Version 1 with both values when the figure moved", () => {
    const before = one.get("line:11") as AddressableElement;
    const [entry] = placeThreads(v2Page, [threadOn(before)]).onElements.get("line:11") ?? [];
    expect(entry.fromVersion).toBe(1);
    expect(entry.changed).toEqual({
      was: { text: before.text || null, figure: before.figure },
      now: { text: two.get("line:11")?.text || null, figure: two.get("line:11")?.figure },
    });
  });

  it("does not mark a change when the anchor still matches", () => {
    const [entry] = placeThreads(v2Page, [threadOn(one.get("line:1") as AddressableElement)]).onElements.get("line:1") ?? [];
    expect(entry.changed).toBeNull();
  });

  it("orphans a thread whose element is gone, quoting its anchor, and never guesses another element", () => {
    const millwork = one.get("line:10") as AddressableElement;
    const placed = placeThreads(v2Page, [threadOn(millwork)]);
    expect([...placed.onElements.keys()]).toEqual([]);
    expect(placed.fromEarlierVersions).toHaveLength(1);
    expect(placed.fromEarlierVersions[0]).toMatchObject({ fromVersion: 1, changed: null });
    expect(placed.fromEarlierVersions[0].thread.anchor.label).toBe(millwork.label);
  });

  it("carries a note only on its exact words", () => {
    const placed = placeThreads(v2Page, [threadOn(firstNote), threadOn(keptNote)]);
    expect(placed.fromEarlierVersions.map((p) => p.thread.elementId)).toEqual([firstNote.id]);
    expect(placed.onElements.get(keptNote.id)?.[0].changed).toBeNull();
    // A note id the new page holds with other words still orphans.
    const altered = threadOn(keptNote, { anchor: { ...anchorFor(keptNote), text: "Other words." } });
    expect(placeThreads(v2Page, [altered]).fromEarlierVersions).toHaveLength(1);
  });

  it("keeps page:general on the page", () => {
    const general = one.get("page:general") as AddressableElement;
    expect(placeThreads(v2Page, [threadOn(general)]).onElements.get("page:general")).toHaveLength(1);
  });

  it("leaves closed threads on their own version, except an accepted flag carried into this one", () => {
    const fact = [...one.values()].find((e) => e.kind === "fact") as AddressableElement;
    const closed = threadOn(fact, { id: "closed", status: "closed" });
    const accepted = threadOn(fact, { id: "accepted", status: "closed", outcome: "accepted", addressedIn: V2 });
    const placed = placeThreads(v2Page, [closed, accepted]);
    expect(placed.onElements.get(fact.id)?.map((p) => [p.thread.id, p.carriedInto])).toEqual([["accepted", 2]]);
  });

  it("shows a version its own threads and nothing carried once it is superseded", () => {
    const own = threadOn(one.get("line:1") as AddressableElement);
    const v1Page = { id: V1, version: 1, newestOpen: false, elements: one };
    const placed = placeThreads(v1Page, [own, threadOn(one.get("line:10") as AddressableElement, { publishedBudgetId: V2, version: 2 })]);
    expect([...placed.onElements.keys()]).toEqual(["line:1"]);
    expect(placed.onElements.get("line:1")?.[0]).toMatchObject({ fromVersion: null, changed: null, carriedInto: null });
    expect(placed.fromEarlierVersions).toEqual([]);
  });
});

// The same rule against a real Postgres built from this repo's migrations.

describe("carry at publish", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;
  let runId: string;
  let version1: string;
  let reader: BudgetReader;
  let elements: ReadonlyMap<string, AddressableElement>;
  const device = newToken();
  const STAFF: StaffAuthor = { name: "Devin", account: "open-access@kulka.invalid" };
  const COPY = { preparedFor: null, preparedBy: "Devin (example)", validityDays: null, coverSentence: null };

  const publish = async () => (await publishBudget(db as Db, { runId, issuedBy: "devin@example.com", copy: COPY })).id;
  const open = (elementId: string, kind: "comment" | "flag" = "comment", anchor = anchorFor(elements.get(elementId) as AddressableElement), on = version1) =>
    openThread(db as Db, {
      publishedBudgetId: on,
      readerId: reader.id,
      deviceId: device,
      elementId,
      anchor,
      kind,
      body: "About this.",
      ...(kind === "flag" ? { proposed: "Something else." } : {}),
    });
  const addressedIn = async (threadId: string) =>
    (await db.query<{ addressed_in: string | null }>(`select addressed_in from budget_threads where id = $1`, [threadId])).rows[0]
      .addressed_in;

  beforeEach(async () => {
    db = await seededDatabase();
    ({ runId } = await runRom(db as Db, TEST_PROJECT_ID));
    version1 = await publish();
    reader = await addReader(db as Db, { projectId: TEST_PROJECT_ID, name: "Dan Reyes", email: "dan@example.com", createdBy: "devin@example.com" });
    elements = (await newestOpenElements(db as Db, TEST_PROJECT_ID))?.elements ?? new Map();
  });

  afterEach(async () => {
    await db.close();
  });

  const flagElement = () => [...elements.keys()].find(isAssumptionElement) as string;

  it("sets addressed_in on every accepted flag that has none, and on nothing else", async () => {
    const accepted = await open(flagElement(), "flag");
    const declined = await open(flagElement(), "flag");
    const openFlag = await open(flagElement(), "flag");
    await closeThread(db as Db, { threadId: accepted.thread.id, by: { kind: "staff", staff: STAFF, outcome: "accepted" } });
    await closeThread(db as Db, { threadId: declined.thread.id, by: { kind: "staff", staff: STAFF, outcome: "declined", reply: "It stays." } });

    const version2 = await publish();
    expect(await addressedIn(accepted.thread.id)).toBe(version2);
    expect(await addressedIn(declined.thread.id)).toBeNull();
    expect(await addressedIn(openFlag.thread.id)).toBeNull();

    // Carried once: Version 3 leaves it on Version 2.
    await publish();
    expect(await addressedIn(accepted.thread.id)).toBe(version2);
  });

  it("shows the accepted flag on Version 2 as Carried Into Version 2, and not on Version 1's own page", async () => {
    const id = flagElement();
    const { thread } = await open(id, "flag");
    await closeThread(db as Db, { threadId: thread.id, by: { kind: "staff", staff: STAFF, outcome: "accepted" } });
    const version2 = await publish();

    const two = await listPageThreads(db as Db, version2);
    expect(two?.onElements.get(id)?.map((p) => [p.thread.id, p.fromVersion, p.carriedInto])).toEqual([[thread.id, 1, 2]]);
    const one = await listPageThreads(db as Db, version1);
    expect(one?.state).toBe("superseded");
    expect(one?.onElements.get(id)?.[0]).toMatchObject({ fromVersion: null, carriedInto: null });

    // Version 3 does not show a flag Version 2 already carried.
    const version3 = await publish();
    expect((await listPageThreads(db as Db, version3))?.onElements.size).toBe(0);
  });

  it("carries open threads, marks a changed anchor and orphans a missing element", async () => {
    const carried = await open("record:prepared-by");
    const stale = await open("record:prepared-by", "comment", { section: "what-happens-next", label: "Prepared By", text: "Prepared by Someone Else", figure: "$1" });
    const gone = await open("line:no-longer-here", "comment", { section: "where-the-money-is", label: "Millwork", text: "Old basis", figure: "$10" });
    const closed = await open("record:prepared-by");
    await closeThread(db as Db, { threadId: closed.thread.id, by: { kind: "staff", staff: STAFF } });
    await replyToThread(db as Db, { threadId: carried.thread.id, author: "staff", staff: STAFF, body: "Kept for Rob.", internal: true });
    const version2 = await publish();

    const page = await listPageThreads(db as Db, version2);
    const onPreparedBy = page?.onElements.get("record:prepared-by") ?? [];
    expect(onPreparedBy.map((p) => p.thread.id)).toEqual([carried.thread.id, stale.thread.id]);
    expect(onPreparedBy[0]).toMatchObject({ fromVersion: 1, changed: null });
    expect(onPreparedBy[1].changed).toEqual({
      was: { text: "Prepared by Someone Else", figure: "$1" },
      now: { text: "Prepared by Devin (example)", figure: null },
    });
    expect(page?.fromEarlierVersions.map((p) => [p.thread.id, p.thread.anchor.label])).toEqual([[gone.thread.id, "Millwork"]]);

    // Only what a client may read: the internal note stays out, and no email appears.
    expect(onPreparedBy[0].thread.messages.map((m) => m.body)).toEqual(["About this."]);
    expect(JSON.stringify(page)).not.toContain("dan@example.com");

    // Version 1 keeps every thread it took, the closed one included.
    const one = await listPageThreads(db as Db, version1);
    expect(one?.onElements.get("record:prepared-by")).toHaveLength(3);
    expect(one?.fromEarlierVersions).toEqual([]);
  });

  it("marks the orphan Element Not in Version 2 in the panel until Kulka closes it", async () => {
    const note = [...elements.values()].find((e) => e.kind === "note") as AddressableElement;
    const rewritten = await open(note.id, "comment", { ...anchorFor(note), text: "Words the run no longer has." });
    await publish();
    let comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    expect(comments.versions[0].threads.find((t) => t.id === rewritten.thread.id)?.elementMissingIn).toBe(2);

    await closeThread(db as Db, { threadId: rewritten.thread.id, by: { kind: "staff", staff: STAFF } });
    comments = await listProjectComments(db as Db, TEST_PROJECT_ID);
    expect(comments.versions[0].threads.find((t) => t.id === rewritten.thread.id)?.elementMissingIn).toBeNull();
  });

  it("carries to the newest open version when the newest is withdrawn", async () => {
    const { thread } = await open("line:no-longer-here", "comment", { label: "Millwork", text: "Old", figure: null });
    const version2 = await publish();
    const version3 = await publish();
    await revokePublishedBudget(db as Db, version3);

    expect((await listPageThreads(db as Db, version2))?.fromEarlierVersions.map((p) => p.thread.id)).toEqual([thread.id]);
    expect((await listPageThreads(db as Db, version3))?.fromEarlierVersions).toEqual([]);
  });

  it("returns null for an unknown version", async () => {
    expect(await listPageThreads(db as Db, "00000000-0000-4000-8000-00000000ffff")).toBeNull();
    expect(await listPageThreads(db as Db, "not-a-uuid")).toBeNull();
  });
});
