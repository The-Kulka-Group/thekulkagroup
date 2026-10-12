import { createHmac } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import sample from "@/lib/meetings/fixtures/sample-transcript.json";
import { seededDatabase } from "@/test/database";

// LA-2279. The Fireflies webhook and the backfill against a seeded Postgres.
// `fetch` is stubbed, so the real Fireflies client runs with no network.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

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
  const { rows } = await db.query<{ fireflies_id: string; title: string; attendees: unknown; summary: { overview: string } }>(
    `select fireflies_id, title, attendees, summary from meetings order by started_at`,
  );
  return rows;
}

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
beforeEach(async () => {
  await db.query(`truncate meetings`);
  vi.stubEnv("FIREFLIES_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("FIREFLIES_API_KEY", "test-key");
  fireflies.mockReset();
  vi.stubGlobal("fetch", fireflies);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => db?.close());

describe("POST /api/meetings/fireflies", () => {
  const body = JSON.stringify({ meetingId: sample.id, eventType: "Transcription completed" });

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
    });
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
      `insert into meetings (fireflies_id, title, started_at) values ('SAMPLE-FF-001', 'Already Here', now())`,
    );

    const first = await backfill();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ found: 2, added: 1 });
    expect((await savedMeetings()).map((one) => one.title).sort()).toEqual(["Already Here", "Meeting SAMPLE-FF-002"]);

    expect(await (await backfill()).json()).toEqual({ found: 2, added: 0 });
  });

  it("refuses a day count outside 1 to 90", async () => {
    expect((await backfill({ days: 0 })).status).toBe(400);
    expect((await backfill({ days: 91 })).status).toBe(400);
  });
});
