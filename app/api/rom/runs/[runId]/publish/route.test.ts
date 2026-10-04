import type Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { pdfSeams } from "@/lib/rom/pdf-seams";
import type { PrintJob, PublishedPdfStore } from "@/lib/rom/published-pdf";
import { setRateClientForTests } from "@/lib/rom/rate-suggestion";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

// LA-1419. Publish a saved run: POST takes the four fields the estimator
// wrote and calls publishBudget. The first publish is Version 1; a second
// makes Version 2 and marks Version 1 superseded.

let db: Awaited<ReturnType<typeof seededDatabase>>;

vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));

const { POST } = await import("./route");

const BODY = {
  preparedFor: "Harbor Point Partners (example)",
  preparedBy: "Devin (example)",
  coverSentence: "This is the first look at the number.",
  validityDays: 60,
};

// LA-1420. Chromium and the bucket are replaced: publish prints once and stores.
const printed: PrintJob[] = [];
const stored = new Map<string, Uint8Array>();
const FAKE_PDF = new TextEncoder().encode("%PDF-1.7 fake");
const fakeStore: PublishedPdfStore = {
  read: async (path) => stored.get(path) ?? null,
  write: async (path, bytes) => void stored.set(path, bytes),
};

function ctx(runId: string) {
  return { params: Promise.resolve({ runId }) };
}

function post(runId: string, body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request(`http://localhost/api/rom/runs/${runId}/publish`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ctx(runId),
  );
}

async function succeededRunId(): Promise<string> {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return runId;
}

beforeEach(async () => {
  db = await seededDatabase();
  printed.length = 0;
  stored.clear();
  pdfSeams.renderer = async (job) => {
    printed.push(job);
    return FAKE_PDF;
  };
  pdfSeams.store = fakeStore;
});

afterEach(async () => {
  setRateClientForTests(null);
  await db.close();
});

/** LA-1566. A stand-in for Claude that answers every ask with `text`. */
function modelAnswering(text: string) {
  setRateClientForTests({
    beta: {
      messages: {
        create: async () =>
          ({ model: "claude-opus-5", stop_reason: "end_turn", content: [{ type: "text", text }] }) as unknown as Anthropic.Beta.Messages.BetaMessage,
      },
    },
  });
}

async function storedEstimate(id: string): Promise<unknown> {
  const { rows } = await db.query<{ estimate: unknown }>(`select snapshot->'durationEstimate' as estimate from published_budgets where id = $1`, [id]);
  return rows[0].estimate;
}

describe("POST /api/rom/runs/[runId]/publish", () => {
  it("refuses a signed-out request and publishes nothing", async () => {
    const runId = await succeededRunId();
    const response = await post(runId, BODY, { "x-kulka-test-auth": "signed-out" });
    expect(response.status).toBe(401);
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from published_budgets`);
    expect(rows[0].n).toBe(0);
  });

  it("publishes Version 1 with the estimator's words and the signed-in email", async () => {
    const runId = await succeededRunId();
    const response = await post(runId, BODY);
    expect(response.status).toBe(200);
    const { published } = await response.json();
    expect(published.version).toBe(1);
    expect(published.token).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(published.issuedBy).toBe("browser-test@kulka.invalid");

    const { rows } = await db.query<{ copy: Record<string, unknown> }>(
      `select snapshot->'copy' as copy from published_budgets where id = $1`,
      [published.id],
    );
    expect(rows[0].copy).toEqual({
      preparedFor: BODY.preparedFor,
      preparedBy: BODY.preparedBy,
      coverSentence: BODY.coverSentence,
      validityDays: 60,
    });
  });

  it("freezes the model's duration estimate for a budget with no schedule (LA-1566)", async () => {
    modelAnswering(JSON.stringify({ months: 18 }));
    const runId = await succeededRunId();
    const response = await post(runId, BODY);
    expect(response.status).toBe(200);
    expect(await storedEstimate((await response.json()).published.id)).toEqual({ months: 18 });
  });

  it("publishes without a duration when the model's answer does not hold up (LA-1566)", async () => {
    modelAnswering(JSON.stringify({ months: 600 }));
    const runId = await succeededRunId();
    const response = await post(runId, BODY);
    expect(response.status).toBe(200);
    expect(await storedEstimate((await response.json()).published.id)).toBeNull();
  });

  it("returns the new version's full link, built from the site's address", async () => {
    vi.stubEnv("KULKA_SITE_URL", "https://kulka.example");
    try {
      const runId = await succeededRunId();
      const { published } = await (await post(runId, BODY)).json();
      expect(published.link).toBe(`https://kulka.example/b/${published.token}`);
      expect(published).not.toHaveProperty("snapshot");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("makes Version 2 on a second publish and marks Version 1 superseded", async () => {
    const runId = await succeededRunId();
    const first = (await (await post(runId, BODY)).json()).published;
    const second = (await (await post(runId, { ...BODY, validityDays: undefined })).json()).published;

    expect(second.version).toBe(2);
    expect(second.token).not.toBe(first.token);
    const { rows } = await db.query<{ id: string; superseded_by: string | null }>(
      `select id, superseded_by from published_budgets order by version`,
    );
    expect(rows[0].superseded_by).toBe(second.id);
    expect(rows[1].superseded_by).toBeNull();
    const days = await db.query<{ d: number }>(`select (snapshot->'copy'->>'validityDays')::int as d from published_budgets where id = $1`, [second.id]);
    expect(days.rows[0].d).toBe(90);
  });

  it("answers 400 to a body it cannot read and publishes nothing", async () => {
    const runId = await succeededRunId();
    expect((await post(runId, "{nope")).status).toBe(400);
    const missing = await post(runId, { preparedBy: "Devin" });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error).toBe("Add who this budget is prepared for.");
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from published_budgets`);
    expect(rows[0].n).toBe(0);
  });

  it("answers 404 for an id that is not a run, and 409 for a run that did not succeed", async () => {
    expect((await post("not-a-uuid", BODY)).status).toBe(404);
    expect((await post("00000000-0000-4000-8000-000000000000", BODY)).status).toBe(404);

    const runId = await succeededRunId();
    await db.query(`update runs set status = 'failed' where id = $1`, [runId]);
    expect((await post(runId, BODY)).status).toBe(409);
  });

  it("prints the PDF once at publish, stores it and sets pdf_path", async () => {
    const runId = await succeededRunId();
    const response = await post(runId, BODY);
    const { published, pdf } = await response.json();

    expect(pdf).toEqual({ ok: true });
    expect(printed).toHaveLength(1);
    expect(printed[0].html).toContain('data-print="1"');
    expect(published.pdfPath).toBe(`published-budgets/${published.id}.pdf`);
    expect(stored.get(published.pdfPath)).toEqual(FAKE_PDF);
    const { rows } = await db.query<{ pdf_path: string }>(`select pdf_path from published_budgets where id = $1`, [published.id]);
    expect(rows[0].pdf_path).toBe(published.pdfPath);
  });

  it("publishes anyway when the PDF cannot be made, and says so", async () => {
    pdfSeams.renderer = async () => {
      throw new Error("Chromium did not start.");
    };
    const runId = await succeededRunId();
    const response = await post(runId, BODY);

    expect(response.status).toBe(200);
    const { published, pdf } = await response.json();
    expect(published.version).toBe(1);
    expect(published.pdfPath).toBeNull();
    expect(pdf.ok).toBe(false);
    expect(pdf.message).toContain("PDF could not be made");
    const { rows } = await db.query<{ pdf_path: string | null }>(`select pdf_path from published_budgets where id = $1`, [published.id]);
    expect(rows[0].pdf_path).toBeNull();
    expect(stored.size).toBe(0);
  });

  it("prints each version once: a second publish prints only its own row", async () => {
    const runId = await succeededRunId();
    await post(runId, BODY);
    await post(runId, BODY);
    expect(printed).toHaveLength(2);
    const { rows } = await db.query<{ pdf_path: string }>(`select pdf_path from published_budgets order by version`);
    expect(new Set(rows.map((r) => r.pdf_path)).size).toBe(2);
  });
});
