import { launchChromium, PDF_MARGIN } from "@/lib/rom/pdf-renderer";
import type { WorkbookSource } from "@/lib/underwriting/workbook/layout";

import { renderSummaryHtml, SUMMARY_PAGE_IDS, summaryTemplates, TIGHT_CLASS } from "./summary";

// LA-1948. Prints the deal summary with the Chromium the budget PDF uses
// (lib/rom/pdf-renderer.ts). The HTML is finished before the browser sees it.
// The browser gets a private origin that serves only that HTML, and every other
// request is aborted, so the render has no path back into the app, the database
// or the internet, and prints the same on a laptop and on Vercel.

const ORIGIN = "https://summary.kulka.invalid";

/** A renderer takes the finished page and returns the PDF. Tests hand in a fake. */
export type SummaryRenderer = (source: WorkbookSource) => Promise<Uint8Array>;

export class SummaryLayoutError extends Error {}

/** The pages whose content runs past one printed page, by id. */
export const overflowingPages = () =>
  [...document.querySelectorAll<HTMLElement>(".page")].filter((el) => el.scrollHeight > el.clientHeight + 0.5).map((el) => el.dataset.page ?? "");

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

    // A page that holds more than one printed page of content gets one tighter pass, then fails.
    // Shipping a table cut by a page break is worse than shipping nothing.
    let overflow = await page.evaluate(overflowingPages);
    if (overflow.length > 0) {
      await page.evaluate(
        ([ids, cls]) => ids.forEach((id) => document.querySelector(`.page[data-page="${id}"]`)?.classList.add(cls)),
        [overflow, TIGHT_CLASS] as const,
      );
      overflow = await page.evaluate(overflowingPages);
    }
    if (overflow.length > 0) throw new SummaryLayoutError(`The deal summary page ${overflow.join(", ")} does not fit one printed page.`);

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
    if (pages !== SUMMARY_PAGE_IDS.length) throw new SummaryLayoutError(`The deal summary printed ${pages} pages, expected ${SUMMARY_PAGE_IDS.length}.`);
    return pdf;
  } finally {
    await browser.close();
  }
};
