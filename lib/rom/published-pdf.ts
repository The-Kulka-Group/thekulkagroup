import type { Db } from "@/lib/db";
import { renderBudgetPage } from "@/app/b/[token]/render";
import { longDate, presentBudget, type BudgetPage } from "@/lib/rom/presentation";
import { loadPublishedBudget, type PublishedBudgetRecord } from "@/lib/rom/published-budgets";

// LA-1420. The stored PDF of a published budget (LA-1309, "PDF"). At publish
// the page is rendered once with ?print=1's markup, printed by headless
// Chromium and stored; `pdf_path` is set once, and /b/<token>.pdf serves the
// stored file. Nothing prints a version a second time: the PDF is as frozen as
// the snapshot.
//
// Chromium and the storage bucket sit behind two small seams, `PdfRenderer` and
// `PublishedPdfStore`, so tests inject fakes and only the wiring in
// lib/rom/pdf-renderer.ts and lib/rom/pdf-store.ts knows about either.

/** What a renderer needs to print one published budget. */
export type PrintJob = {
  /** The page, `renderBudgetPage(page, { print: true })`. Its assets are under /scrollcraft/. */
  html: string;
  /** Chromium header and footer templates: running header, validity note, page number. */
  headerTemplate: string;
  footerTemplate: string;
  title: string;
};

export type PdfRenderer = (job: PrintJob) => Promise<Uint8Array>;

/** Where stored PDFs live. */
export type PublishedPdfStore = {
  read(path: string): Promise<Uint8Array | null>;
  write(path: string, bytes: Uint8Array): Promise<void>;
};

/** No storage is wired, so no PDF is ever present and none can be stored. */
export const NO_PDF_STORE: PublishedPdfStore = {
  read: async () => null,
  write: async () => {
    throw new Error("No PDF storage is configured.");
  },
};

const esc = (t: string): string => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const TEMPLATE_STYLE = `width:100%;font-family:'Open Sans',Arial,sans-serif;font-size:8px;color:#676879;padding:0 14mm;display:flex;justify-content:space-between;`;

/**
 * The print job for a page model. Pure. The running header names Kulka, the
 * project, the version and the issue date. The footer says how long the
 * figures stay valid (when the estimator set a period) and the page number.
 */
export function buildPrintJob(page: BudgetPage): PrintJob {
  const r = page.record;
  const validity = r.validityDays ? `Figures valid ${r.validityDays} days from issue` : "";
  return {
    html: renderBudgetPage(page, { print: true }),
    headerTemplate: `<div style="${TEMPLATE_STYLE}"><span style="font-weight:700;color:#1D1D1F">Kulka</span><span>${esc(page.projectName)} · Version ${r.version} · Issued ${esc(longDate(r.issuedAt))}</span></div>`,
    footerTemplate: `<div style="${TEMPLATE_STYLE}"><span>${esc(validity)}</span><span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
    title: page.documentTitle,
  };
}

/** Where a version's PDF is stored. The row id is not the link's token, so the path reveals nothing about it. */
export function pdfPathFor(published: Pick<PublishedBudgetRecord, "id">): string {
  return `published-budgets/${published.id}.pdf`;
}

export type PdfOutcome =
  | { ok: true; path: string; rendered: boolean }
  | { ok: false; reason: string };

/**
 * Prints and stores one published budget's PDF, once. A row that already has a
 * `pdf_path` is left alone and nothing renders. Never throws: a failure to
 * render or store leaves `pdf_path` null and comes back as `{ ok: false }`, so
 * a publish that cannot print still publishes.
 */
export async function renderPublishedPdf(
  db: Db,
  published: Pick<PublishedBudgetRecord, "id" | "token" | "pdfPath">,
  seams: { renderer: PdfRenderer; store: PublishedPdfStore },
): Promise<PdfOutcome> {
  if (published.pdfPath) return { ok: true, path: published.pdfPath, rendered: false };
  try {
    const { rows: held } = await db.query<{ pdf_path: string | null }>(`select pdf_path from published_budgets where id = $1`, [published.id]);
    if (held[0]?.pdf_path) return { ok: true, path: held[0].pdf_path, rendered: false };

    const view = await loadPublishedBudget(db, published.token);
    if (!view || view.state === "withdrawn") return { ok: false, reason: "The budget was withdrawn before its PDF was made." };
    const page = presentBudget({ snapshot: view.snapshot, version: view.version, stage: view.stage, issuedAt: view.issuedAt, newer: null });

    const bytes = await seams.renderer(buildPrintJob(page));
    const path = pdfPathFor(published);
    await seams.store.write(path, bytes);
    // The trigger lets pdf_path go from null to a value once.
    const { rows } = await db.query<{ pdf_path: string }>(
      `update published_budgets set pdf_path = $1 where id = $2 and pdf_path is null returning pdf_path`,
      [path, published.id],
    );
    return { ok: true, path: rows[0]?.pdf_path ?? path, rendered: true };
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    console.error(`PDF for published budget ${published.id} was not made: ${reason}`);
    return { ok: false, reason };
  }
}
