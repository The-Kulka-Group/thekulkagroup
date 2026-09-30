import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { newToken, publishBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { renderPublishedPdf } from "@/lib/rom/published-pdf";

import { servePublishedPdf, type PublishedPdfStore } from "./serve";

// LA-1417. /b/<token>.pdf serves the PDF stored at publish, when there is
// one. Rendering and storing it is LA-1418's; this is the serving end.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const PDF = new TextEncoder().encode("%PDF-1.7 example");

const store: PublishedPdfStore = {
  read: async (path) => (path === "budgets/one.pdf" ? PDF : null),
  write: async () => {},
};

async function publish() {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return publishBudget(db as Db, {
    runId,
    issuedBy: "devin@example.com",
    copy: { preparedFor: null, preparedBy: null, validityDays: null, coverSentence: null },
  });
}

describe("servePublishedPdf", () => {
  it("serves the stored PDF inline", async () => {
    const published = await publish();
    await db.query(`update published_budgets set pdf_path = 'budgets/one.pdf' where id = $1`, [published.id]);

    const response = await servePublishedPdf(db as Db, store, published.token);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe("inline");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
  });

  it("is a 404 when no PDF was stored", async () => {
    const published = await publish();

    expect((await servePublishedPdf(db as Db, store, published.token)).status).toBe(404);
  });

  it("is a 404 when the stored file is missing", async () => {
    const published = await publish();
    await db.query(`update published_budgets set pdf_path = 'budgets/gone.pdf' where id = $1`, [published.id]);

    expect((await servePublishedPdf(db as Db, store, published.token)).status).toBe(404);
  });

  it("is a 404 once the link is withdrawn", async () => {
    const published = await publish();
    await db.query(`update published_budgets set pdf_path = 'budgets/one.pdf' where id = $1`, [published.id]);
    await revokePublishedBudget(db as Db, published.id);

    expect((await servePublishedPdf(db as Db, store, published.token)).status).toBe(404);
  });

  it("is a 404 for an unknown or malformed token", async () => {
    expect((await servePublishedPdf(db as Db, store, newToken())).status).toBe(404);
    expect((await servePublishedPdf(db as Db, store, "nope")).status).toBe(404);
  });

  it("is a 404 until the PDF exists and the stored file afterward (LA-1420)", async () => {
    const files = new Map<string, Uint8Array>();
    const memory: PublishedPdfStore = {
      read: async (path) => files.get(path) ?? null,
      write: async (path, bytes) => void files.set(path, bytes),
    };
    const published = await publish();

    expect((await servePublishedPdf(db as Db, memory, published.token)).status).toBe(404);

    const outcome = await renderPublishedPdf(db as Db, published, { renderer: async () => PDF, store: memory });
    expect(outcome.ok).toBe(true);

    const response = await servePublishedPdf(db as Db, memory, published.token);
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PDF);
  });
});
