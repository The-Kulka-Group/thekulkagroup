import { launchChromium, PDF_MARGIN } from "@/lib/rom/pdf-renderer";
import type { WorkbookSource } from "@/lib/underwriting/workbook/layout";

import { renderSummaryHtml, summaryTemplates } from "./summary";

// LA-1948. Prints the deal summary with the Chromium the budget PDF uses
// (lib/rom/pdf-renderer.ts). The HTML is finished before the browser sees it.
// The browser gets a private origin that serves only that HTML, and every other
// request is aborted, so the render has no path back into the app, the database
// or the internet, and prints the same on a laptop and on Vercel.

const ORIGIN = "https://summary.kulka.invalid";

/** A renderer takes the finished page and returns the PDF. Tests hand in a fake. */
export type SummaryRenderer = (source: WorkbookSource) => Promise<Uint8Array>;

export class SummaryLayoutError extends Error {}

/** The summary aims at three printed pages. A run with many annual columns or lender rows may need a fourth or fifth. */
export const MAX_SUMMARY_PAGES = 5;

/** Counts the pages of a PDF from its page objects. */
export function pdfPageCount(pdf: Uint8Array): number {
  return (Buffer.from(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
}

export const renderSummaryPdf: SummaryRenderer = async (source) => {
  const html = renderSummaryHtml(source);
  const { headerTemplate, footerTemplate } = summaryTemplates(source);
  const browser = await launchChromium();
  try {
    const context = await browser.newContext({ viewport: { width: 710, height: 915 }, javaScriptEnabled: true });
    const page = await context.newPage();
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.origin === ORIGIN && url.pathname === "/print") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: html });
      return route.abort();
    });
    await page.goto(`${ORIGIN}/print`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.emulateMedia({ media: "print" });

    const pdf = new Uint8Array(await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: PDF_MARGIN,
    }));
    const pages = pdfPageCount(pdf);
    if (pages > MAX_SUMMARY_PAGES) throw new SummaryLayoutError(`The deal summary printed ${pages} pages, and it should not pass ${MAX_SUMMARY_PAGES}.`);
    return pdf;
  } finally {
    await browser.close();
  }
};
