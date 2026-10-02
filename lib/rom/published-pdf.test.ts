import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Db } from "@/lib/db";
import { presentBudget } from "@/lib/rom/presentation";
import { publishBudget, listPublishedBudgets, loadPublishedBudget, revokePublishedBudget } from "@/lib/rom/published-budgets";
import { runRom } from "@/lib/rom/run";
import { referencePublication } from "@/test/fixtures/published-budget";
import { TEST_PROJECT_ID, seededDatabase } from "@/test/database";

import { buildPrintJob, pdfPathFor, renderPublishedPdf, type PrintJob, type PublishedPdfStore } from "./published-pdf";

// LA-1420. The stored PDF: printed once per version, stored at pdf_path, and
// a failure to print leaves the publish standing with pdf_path null.

let db: Awaited<ReturnType<typeof seededDatabase>>;

beforeEach(async () => {
  db = await seededDatabase();
});

afterEach(async () => {
  await db.close();
});

const PDF = new TextEncoder().encode("%PDF-1.7 example");

function seams() {
  const jobs: PrintJob[] = [];
  const files = new Map<string, Uint8Array>();
  const store: PublishedPdfStore = {
    read: async (path) => files.get(path) ?? null,
    write: async (path, bytes) => void files.set(path, bytes),
  };
  return {
    jobs,
    files,
    seams: {
      renderer: async (job: PrintJob) => {
        jobs.push(job);
        return PDF;
      },
      store,
    },
  };
}

async function publish(validityDays: number | null = 60) {
  const { runId } = await runRom(db as Db, TEST_PROJECT_ID);
  return publishBudget(db as Db, {
    runId,
    issuedBy: "devin@example.com",
    copy: { preparedFor: "Harbor Point Partners (example)", preparedBy: "Devin (example)", validityDays, coverSentence: null },
  });
}

describe("renderPublishedPdf", () => {
  it("prints the row's own page, stores it and sets pdf_path once", async () => {
    const published = await publish();
    const { jobs, files, seams: s } = seams();

    const outcome = await renderPublishedPdf(db as Db, published, s);

    expect(outcome).toEqual({ ok: true, path: pdfPathFor(published), rendered: true });
    expect(jobs).toHaveLength(1);
    expect(jobs[0].html).toContain("Harbor Point Partners (example)");
    expect(files.get(pdfPathFor(published))).toEqual(PDF);
    const [row] = await listPublishedBudgets(db as Db, published.projectId);
    expect(row.pdfPath).toBe(pdfPathFor(published));
  });

  it("never prints a version twice", async () => {
    const published = await publish();
    const { jobs, seams: s } = seams();

    await renderPublishedPdf(db as Db, published, s);
    // The caller's copy of the row is stale, as after a retry, and the row itself has a path.
    const again = await renderPublishedPdf(db as Db, { ...published, pdfPath: null }, s);
    // A caller that holds the fresh row does not even read the database.
    const third = await renderPublishedPdf(db as Db, { ...published, pdfPath: pdfPathFor(published) }, s);

    expect(again).toEqual({ ok: true, path: pdfPathFor(published), rendered: false });
    expect(third).toEqual({ ok: true, path: pdfPathFor(published), rendered: false });
    expect(jobs).toHaveLength(1);
  });

  it("leaves pdf_path null and says why when the renderer fails", async () => {
    const published = await publish();
    const { files, seams: s } = seams();

    const outcome = await renderPublishedPdf(db as Db, published, {
      ...s,
      renderer: async () => {
        throw new Error("Chromium did not start.");
      },
    });

    expect(outcome).toEqual({ ok: false, reason: "Chromium did not start." });
    expect(files.size).toBe(0);
    expect((await listPublishedBudgets(db as Db, published.projectId))[0].pdfPath).toBeNull();
  });

  it("leaves pdf_path null when the file cannot be stored", async () => {
    const published = await publish();
    const { seams: s } = seams();

    const outcome = await renderPublishedPdf(db as Db, published, {
      ...s,
      store: { read: async () => null, write: async () => { throw new Error("Bucket unreachable."); } },
    });

    expect(outcome.ok).toBe(false);
    expect((await listPublishedBudgets(db as Db, published.projectId))[0].pdfPath).toBeNull();
  });

  it("prints from the snapshot the publish already holds, without reading the row back", async () => {
    const published = await publish();
    const { jobs, seams: s } = seams();
    const view = await loadPublishedBudget(db as Db, published.token);
    if (view?.state !== "current") throw new Error("expected a current budget");
    // A copy that differs from the stored one shows which snapshot was printed.
    const inHand = { ...view.snapshot, copy: { ...view.snapshot.copy, preparedFor: "Held In Hand (example)" } };

    const outcome = await renderPublishedPdf(db as Db, published, s, {
      snapshot: inHand,
      version: published.version,
      stage: published.stage,
      issuedAt: published.issuedAt,
    });

    expect(outcome.ok).toBe(true);
    expect(jobs[0].html).toContain("Held In Hand (example)");
    expect(jobs[0].html).not.toContain("Harbor Point Partners (example)");
  });

  it("does not print a withdrawn budget even when the snapshot is in hand", async () => {
    const published = await publish();
    const view = await loadPublishedBudget(db as Db, published.token);
    if (view?.state !== "current") throw new Error("expected a current budget");
    await revokePublishedBudget(db as Db, published.id);
    const { jobs, seams: s } = seams();

    const outcome = await renderPublishedPdf(db as Db, published, s, {
      snapshot: view.snapshot,
      version: published.version,
      stage: published.stage,
      issuedAt: published.issuedAt,
    });

    expect(outcome.ok).toBe(false);
    expect(jobs).toHaveLength(0);
  });

  it("does not print a budget withdrawn before its PDF was made", async () => {
    const published = await publish();
    await revokePublishedBudget(db as Db, published.id);
    const { jobs, seams: s } = seams();

    expect((await renderPublishedPdf(db as Db, published, s)).ok).toBe(false);
    expect(jobs).toHaveLength(0);
  });
});

describe("buildPrintJob", () => {
  const job = () => buildPrintJob(presentBudget(referencePublication({ snapshot: withValidity(60) })));

  function withValidity(days: number | null) {
    const snapshot = referencePublication().snapshot;
    return { ...snapshot, copy: { ...(snapshot.copy ?? { preparedFor: null, preparedBy: null, coverSentence: null }), validityDays: days } };
  }

  it("runs the header on Kulka, project, version and issue date", () => {
    const header = job().headerTemplate;
    expect(header).toContain("Kulka");
    expect(header).toContain("MN Test #4");
    expect(header).toContain("Version 1");
    expect(header).toContain("September 28, 2026");
  });

  it("runs the footer on the validity note and the page number", () => {
    const footer = job().footerTemplate;
    expect(footer).toContain("Figures valid 60 days from issue");
    expect(footer).toContain('class="pageNumber"');
  });

  it("says nothing about validity when the estimator set no period", () => {
    const footer = buildPrintJob(presentBudget(referencePublication({ snapshot: withValidity(null) }))).footerTemplate;
    expect(footer).not.toContain("Figures valid");
  });

  it("prints the one depth with no chrome, no engine and no appendix", () => {
    const { html } = job();
    expect(html).toContain('<html lang="en" data-print="1">');
    expect(html).not.toContain('class="hd"');
    expect(html).not.toContain("data-sc-progress");
    expect(html).not.toContain("scrollcraft.js");
    expect(html).not.toContain('id="appendix"');
  });

  it("names every element id as a destination and keeps each once", () => {
    const { html } = job();
    const els = [...html.matchAll(/data-el="([^"]*)"/g)].map((m) => m[1]);
    const ids = [...html.matchAll(/\sid="([^"]*)"/g)].map((m) => m[1]);
    for (const el of els) expect(ids, el).toContain(el);
    expect(new Set(ids).size).toBe(ids.length);
    for (const el of els) expect(html, el).toContain(`<a href="#${el}">`);
  });
});
