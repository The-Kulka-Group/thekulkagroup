import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { seededDatabase } from "@/test/database";

import { type Brief, type BriefClient, briefMeeting, groundBrief, MAX_SENTENCES, transcriptFor, writeBrief } from "./brief";
import type { MeetingSentence } from "./store";

// LA-2282. The Kulka Brief, with the model call stubbed. The sentences are
// synthetic, in the shape Fireflies returns.

const sentence = (index: number, speaker: string, text: string, flags: Record<string, string> = {}): MeetingSentence => ({
  index, speaker, text, start: index, end: index + 1, flags,
});
const SENTENCES = [
  sentence(0, "Example PM", "Let's start with the schedule."),
  sentence(1, "Example Owner", "We agreed to move the lobby finish selection to November."),
  sentence(2, "Example PM", "Dana will send the revised lookahead by Friday.", { task: "send lookahead" }),
  sentence(3, "Example Architect", "The roof drain RFIs are still open after ten days."),
];
const ATTENDEES = [{ name: "Dana Example", email: "dana@example.com" }];

function fakeClient(brief: unknown, stop: "end_turn" | "refusal" = "end_turn"): BriefClient & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return {
            id: "msg_test",
            type: "message",
            role: "assistant",
            model: "claude-opus-5-5",
            stop_reason: stop,
            content: [{ type: "text", text: JSON.stringify(brief) }],
            usage: { input_tokens: 1200, output_tokens: 300 },
          } as never;
        },
      },
    },
  };
}

describe("groundBrief", () => {
  it("keeps an owner and due date only when the cited sentences say them", () => {
    const raw: Brief = {
      decisions: [{ text: "Lobby finish selection moved to November.", evidence: [1] }],
      risks: [{ text: "Roof drain RFIs open ten days.", evidence: [3, 99] }],
      actionItems: [
        { owner: "Dana", action: "Send the revised lookahead", due: "Friday", evidence: [2] },
        { owner: "Example Architect", action: "Answer the roof drain RFIs", due: "October 20", evidence: [3] },
        { owner: "Someone", action: "Item with no real evidence", due: null, evidence: [42] },
      ],
    };
    expect(groundBrief(raw, SENTENCES, ATTENDEES)).toEqual({
      decisions: [{ text: "Lobby finish selection moved to November.", evidence: [1] }],
      risks: [{ text: "Roof drain RFIs open ten days.", evidence: [3] }],
      actionItems: [
        { owner: "Dana", action: "Send the revised lookahead", due: "Friday", evidence: [2] },
        // The architect spoke sentence 3, so the owner stays; nobody said October 20, so the date goes.
        { owner: "Example Architect", action: "Answer the roof drain RFIs", due: null, evidence: [3] },
      ],
    });
  });
});

describe("transcriptFor", () => {
  it("numbers each sentence with its speaker", () => {
    expect(transcriptFor(SENTENCES.slice(0, 2))).toBe(
      "[0] Example PM: Let's start with the schedule.\n[1] Example Owner: We agreed to move the lobby finish selection to November.",
    );
  });

  it("keeps flagged lines and their neighbors from a very long meeting", () => {
    const long = Array.from({ length: MAX_SENTENCES + 10 }, (_, i) =>
      sentence(i, "Speaker", `Line ${i}`, i === 500 ? { question: "yes" } : {}),
    );
    expect(transcriptFor(long).split("\n").map((line) => line.split("]")[0])).toEqual(["[499", "[500", "[501"]);
  });
});

describe("writeBrief", () => {
  it("asks Claude for a JSON brief and grounds what comes back", async () => {
    const client = fakeClient({
      decisions: [],
      risks: [],
      actionItems: [{ owner: "Dana", action: "Send the lookahead", due: "next Tuesday", evidence: [2] }],
    });
    const written = await writeBrief(client, { title: "Example OAC", sentences: SENTENCES, attendees: ATTENDEES });
    expect(written).toEqual({
      brief: { decisions: [], risks: [], actionItems: [{ owner: "Dana", action: "Send the lookahead", due: null, evidence: [2] }] },
      model: "claude-opus-5-5",
      inputTokens: 1200,
      outputTokens: 300,
    });
    expect(client.calls[0]).toMatchObject({
      model: "claude-opus-5-5",
      output_config: { effort: "medium", format: { type: "json_schema" } },
      fallbacks: "default",
    });
  });

  it("refuses to save a declined brief", async () => {
    await expect(
      writeBrief(fakeClient({}, "refusal"), { title: "x", sentences: SENTENCES, attendees: [] }),
    ).rejects.toThrow("declined");
  });
});

describe("briefMeeting", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;
  beforeAll(async () => {
    db = await seededDatabase();
  }, 60_000);
  beforeEach(async () => {
    await db.query(`truncate meetings`);
  });
  afterAll(async () => db?.close());

  const insert = (summary: string) =>
    db.query(
      `insert into meetings (fireflies_id, title, started_at, summary, sentences, attendees)
       values ('FF-1', 'Example OAC', now(), $1, $2, $3)`,
      [summary, JSON.stringify(SENTENCES), JSON.stringify(ATTENDEES)],
    );

  it("waits for Fireflies' summary, then saves the brief with its cost", async () => {
    const client = fakeClient({ decisions: [{ text: "Lobby moved to November.", evidence: [1] }], risks: [], actionItems: [] });
    await insert('{"overview": ""}');
    expect(await briefMeeting(db as Db, client, "FF-1")).toBe(false);
    expect(client.calls).toHaveLength(0);

    await db.query(`update meetings set summary = '{"overview": "Done."}'`);
    expect(await briefMeeting(db as Db, client, "FF-1")).toBe(true);
    const { rows } = await db.query<{ brief: Brief; brief_input_tokens: number; brief_written_at: string | null }>(
      `select brief, brief_input_tokens, brief_written_at from meetings`,
    );
    expect(rows[0].brief.decisions).toEqual([{ text: "Lobby moved to November.", evidence: [1] }]);
    expect(rows[0].brief_input_tokens).toBe(1200);
    expect(rows[0].brief_written_at).not.toBeNull();

    // A brief is written once.
    expect(await briefMeeting(db as Db, client, "FF-1")).toBe(false);
  });

  it("saves the reason when the model declines, so the page can say so", async () => {
    await insert('{"overview": "Done."}');
    expect(await briefMeeting(db as Db, fakeClient({}, "refusal"), "FF-1")).toBe(false);
    const { rows } = await db.query<{ brief: unknown; brief_error: string }>(`select brief, brief_error from meetings`);
    expect(rows[0]).toEqual({ brief: null, brief_error: "The model declined to write this brief." });
  });
});
