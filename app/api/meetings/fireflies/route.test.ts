import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import sample from "@/lib/meetings/fixtures/sample-transcript.json";
import { seededDatabase } from "@/test/database";
import { sourceRuns } from "@/test/source-runs";

// LA-2279. The Fireflies webhook and the backfill against a seeded Postgres.
// `fetch` is stubbed, so the real Fireflies client runs with no network.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
// LA-2282: `after` needs a request scope; here the scheduled work is kept to run by hand.
const scheduled: (() => Promise<unknown>)[] = [];
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => void scheduled.push(task),
}));

const { setBriefClientForTests } = await import("@/lib/meetings/brief");
const webhook = await import("./route");
const sync = await import("../sync/route");

const SECRET = "test-webhook-secret";
const sign = (body: string) => createHmac("sha256", SECRET).update(body).digest("hex");
const fireflies = vi.fn();

function deliver(body: string, signature: string | null) {
  return webhook.POST(
    new Request("http://localhost/api/meetings/fireflies", {
      method: "POST",
      headers: signature === null ? {} : { "x-hub-signature": signature },
      body,
    }),
  );
}

function answer(data: unknown) {
  return new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function savedMeetings() {
  const { rows } = await db.query<{
    fireflies_id: string;
    title: string;
    attendees: unknown;
    summary: { overview: string };
    meeting_type: string | null;
    positive_pct: string | null;
    negative_pct: string | null;
    analytics: { speakers: { name: string; share: number }[] };
    attendance: unknown;
    sentences: { flags: Record<string, string> }[];
  }>(
    `select fireflies_id, title, attendees, summary, meeting_type, positive_pct, negative_pct, analytics, attendance, sentences
       from meetings order by started_at`,
  );
  return rows;
}

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`truncate meetings`);
  await db.query(`delete from source_runs`);
  vi.stubEnv("FIREFLIES_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("FIREFLIES_API_KEY", "test-key");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  setBriefClientForTests(null);
  scheduled.length = 0;
  fireflies.mockReset();
  vi.stubGlobal("fetch", fireflies);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => db?.close());

describe("POST /api/meetings/fireflies", () => {
  const body = JSON.stringify({ event: "meeting.summarized", timestamp: 1791824000000, meeting_id: sample.id });

  it("refuses an unsigned or wrongly signed call and saves nothing", async () => {
    expect((await deliver(body, null)).status).toBe(401);
    expect((await deliver(body, sign("something else"))).status).toBe(401);
    expect(fireflies).not.toHaveBeenCalled();
    expect(await savedMeetings()).toHaveLength(0);
  });

  it("fetches the transcript and saves it once, however often Fireflies calls", async () => {
    fireflies.mockImplementation(async () => answer({ transcript: sample }));
    expect((await deliver(body, sign(body))).status).toBe(200);
    expect((await deliver(body, `sha256=${sign(body)}`)).status).toBe(200);

    const [request] = fireflies.mock.calls[0];
    expect(request).toBe("https://api.fireflies.ai/graphql");
    expect(fireflies.mock.calls[0][1].headers.Authorization).toBe("Bearer test-key");

    const saved = await savedMeetings();
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      fireflies_id: "SAMPLE-FF-001",
      title: "Example Job Weekly OAC",
      attendees: [
        { name: "Example PM", email: "pm@example.com" },
        { name: "Example Owner", email: "owner@example.com" },
      ],
      summary: { overview: "The team reviewed the example schedule and two open RFIs." },
      meeting_type: "OAC Meeting",
      attendance: [
        { name: "Example PM", joinedAt: "2026-10-12T13:00:05Z", leftAt: "2026-10-12T13:58:40Z" },
        { name: "Example Owner", joinedAt: "2026-10-12T13:07:30Z", leftAt: "2026-10-12T13:58:40Z" },
      ],
    });
    // LA-2287: sentiment as columns for project roll-ups, talk time as analytics, flags kept on each sentence.
    expect(Number(saved[0].positive_pct)).toBe(30);
    expect(Number(saved[0].negative_pct)).toBe(12);
    expect(saved[0].analytics.speakers.map((one) => [one.name, one.share])).toEqual([
      ["Example PM", 61],
      ["Example Owner", 39],
    ]);
    expect(saved[0].sentences[1].flags).toEqual({ question: "Where are we on the RFIs?", sentiment: "negative" });
  });

  it("writes the Kulka Brief after answering, when Claude is set up", async () => {
    fireflies.mockImplementation(async () => answer({ transcript: sample }));
    expect((await deliver(body, sign(body))).status).toBe(200);
    expect(scheduled).toHaveLength(0);

    const create = vi.fn(async () => ({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ decisions: [{ text: "Schedule reviewed.", evidence: [0] }], risks: [], actionItems: [] }) }],
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
    setBriefClientForTests({ beta: { messages: { create } } } as never);
    expect((await deliver(body, sign(body))).status).toBe(200);
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    const { rows } = await db.query<{ brief: { decisions: unknown[] } }>(`select brief from meetings`);
    expect(rows[0].brief.decisions).toEqual([{ text: "Schedule reviewed.", evidence: [0] }]);
  });

  it("answers a bot-joined event without saving or calling Fireflies", async () => {
    const joined = JSON.stringify({ event: "meeting.bot_joined", timestamp: 1, meeting_id: sample.id });
    const response = await deliver(joined, sign(joined));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, ignored: true });
    expect(fireflies).not.toHaveBeenCalled();
  });

  it("says Fireflies is not set up when the API key is missing", async () => {
    vi.stubEnv("FIREFLIES_API_KEY", "");
    expect((await deliver(body, sign(body))).status).toBe(503);
  });

  it("passes on a Fireflies error as a 502", async () => {
    fireflies.mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "object_not_found" }] }), { status: 200 }));
    const response = await deliver(body, sign(body));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toBe("object_not_found");
  });

  it("logs each call as a Fireflies Meetings run: added first, changed after (LA-3048)", async () => {
    fireflies.mockImplementation(async () => answer({ transcript: sample }));
    await deliver(body, sign(body));
    await deliver(body, sign(body));
    expect(await sourceRuns(db)).toEqual([
      { source_key: "fireflies_meetings", trigger: "webhook", outcome: "ok", rows_added: 1, rows_changed: 0, error: null, finished: true },
      { source_key: "fireflies_meetings", trigger: "webhook", outcome: "ok", rows_added: 0, rows_changed: 1, error: null, finished: true },
    ]);
  });

  it("logs a Fireflies error as a failed run (LA-3048)", async () => {
    fireflies.mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "object_not_found" }] }), { status: 200 }));
    await deliver(body, sign(body));
    expect(await sourceRuns(db)).toEqual([
      { source_key: "fireflies_meetings", trigger: "webhook", outcome: "failed", rows_added: null, rows_changed: null, error: "object_not_found", finished: true },
    ]);
  });
});

describe("POST /api/meetings/sync", () => {
  const backfill = (body: unknown = {}) =>
    sync.POST(new Request("http://localhost/api/meetings/sync", { method: "POST", body: JSON.stringify(body) }));

  it("adds only the meetings Kulka AI does not have, and is safe to repeat", async () => {
    fireflies.mockImplementation(async (_url: string, init: { body: string }) => {
      const { query, variables } = JSON.parse(init.body);
      if (query.includes("transcripts(")) return answer({ transcripts: [{ id: "SAMPLE-FF-001" }, { id: "SAMPLE-FF-002" }] });
      return answer({ transcript: { ...sample, id: variables.id, title: `Meeting ${variables.id}` } });
    });
    await db.query(
      `insert into meetings (fireflies_id, title, started_at, summary)
       values ('SAMPLE-FF-001', 'Already Here', now(), '{"overview": "Done."}')`,
    );

    const first = await backfill();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ found: 2, added: 1, briefed: 0 });
    expect((await savedMeetings()).map((one) => one.title).sort()).toEqual(["Already Here", "Meeting SAMPLE-FF-002"]);

    expect(await (await backfill()).json()).toEqual({ found: 2, added: 0, briefed: 0 });
  });

  it("refuses a day count outside 1 to 90", async () => {
    expect((await backfill({ days: 0 })).status).toBe(400);
    expect((await backfill({ days: 91 })).status).toBe(400);
  });

  it("fetches again a meeting saved before its summary was ready", async () => {
    fireflies.mockImplementation(async (_url: string, init: { body: string }) => {
      const { query } = JSON.parse(init.body);
      if (query.includes("transcripts(")) return answer({ transcripts: [{ id: "SAMPLE-FF-001" }] });
      return answer({ transcript: sample });
    });
    await db.query(`insert into meetings (fireflies_id, title, started_at) values ('SAMPLE-FF-001', 'No Summary Yet', now())`);
    expect(await (await backfill()).json()).toEqual({ found: 1, added: 1, briefed: 0 });
    expect((await savedMeetings())[0].title).toBe("Example Job Weekly OAC");
  });

  it("logs a backfill as a Fireflies Meetings run started by a button (LA-3048)", async () => {
    fireflies.mockImplementation(async (_url: string, init: { body: string }) => {
      const { query, variables } = JSON.parse(init.body);
      if (query.includes("transcripts(")) return answer({ transcripts: [{ id: "SAMPLE-FF-001" }, { id: "SAMPLE-FF-002" }] });
      return answer({ transcript: { ...sample, id: variables.id } });
    });
    await backfill();
    expect(await sourceRuns(db)).toEqual([
      { source_key: "fireflies_meetings", trigger: "button", outcome: "ok", rows_added: 2, rows_changed: 0, error: null, finished: true },
    ]);
  });

  it("logs a failed backfill and still answers 502 (LA-3048)", async () => {
    fireflies.mockResolvedValue(new Response(JSON.stringify({ errors: [{ message: "rate limited" }] }), { status: 200 }));
    expect((await backfill()).status).toBe(502);
    expect(await sourceRuns(db)).toEqual([
      { source_key: "fireflies_meetings", trigger: "button", outcome: "failed", rows_added: null, rows_changed: null, error: "rate limited", finished: true },
    ]);
  });
});
