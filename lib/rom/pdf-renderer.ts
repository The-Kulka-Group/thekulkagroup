import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { Browser } from "playwright-core";

import type { PdfRenderer, PrintJob } from "./published-pdf";

// LA-1420. Prints a PrintJob with headless Chromium. Locally that is the
// Chromium Playwright installs (`npx playwright install chromium`). On Vercel
// it is @sparticuz/chromium, a build of Chromium that fits a serverless
// function, driven by playwright-core. Nothing else in the app imports this
// file: the publish route hands it to lib/rom/published-pdf.ts as a
// `PdfRenderer`, and tests hand in a fake.
//
// The page is not fetched from the app's own address. The job carries the
// finished HTML, and the browser is given a private origin whose only
// contents are that HTML and the three files the print page loads from
// public/scrollcraft. So the render needs no network path back into the app,
// no deployment protection bypass and no second request to the database.

const ORIGIN = "https://print.kulka.invalid";
const ASSETS = ["scrollcraft.css", "budget-page.css", "budget-page.js"] as const;
const TYPES: Record<string, string> = { css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8" };

async function launch(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  if (process.env.VERCEL) {
    const serverless = (await import("@sparticuz/chromium")).default;
    return chromium.launch({ args: serverless.args, executablePath: await serverless.executablePath(), headless: true });
  }
  if (process.env.KULKA_CHROMIUM_PATH) return chromium.launch({ executablePath: process.env.KULKA_CHROMIUM_PATH });
  try {
    return await chromium.launch();
  } catch (cause) {
    // Playwright's own Chromium is missing or a build behind playwright-core.
    // A machine that has Chrome can still print.
    try {
      return await chromium.launch({ channel: "chrome" });
    } catch {
      throw cause;
    }
  }
}

/** Letter, with room top and bottom for the running header and footer. */
export const PDF_MARGIN = { top: "18mm", right: "14mm", bottom: "18mm", left: "14mm" } as const;

/**
 * Loads the print page, puts the engine at rest under print media, and prints
 * it. `rest()` is the page's own hook (public/scrollcraft/budget-page.js): it
 * opens every drill-down, fills the receipt and sets every act to its end.
 */
export async function openPrintPage(browser: Browser, job: PrintJob) {
  const context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  const page = await context.newPage();
  await page.route(`${ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === "/print") return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: job.html });
    const name = pathname.replace("/scrollcraft/", "");
    if (pathname.startsWith("/scrollcraft/") && (ASSETS as readonly string[]).includes(name)) {
      const body = await readFile(join(process.cwd(), "public", "scrollcraft", name));
      return route.fulfill({ status: 200, contentType: TYPES[name.split(".").pop()!], body });
    }
    return route.fulfill({ status: 404, body: "Not found." });
  });
  await page.goto(`${ORIGIN}/print`, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await page.emulateMedia({ media: "print" });
  await page.evaluate(() => (window as unknown as { KulkaBudget: { rest(): void } }).KulkaBudget.rest());
  return { context, page };
}

export const renderPdfWithChromium: PdfRenderer = async (job) => {
  const browser = await launch();
  try {
    const { page } = await openPrintPage(browser, job);
    const pdf = await page.pdf({
      format: "Letter",
      printBackground: true,
      preferCSSPageSize: false,
      displayHeaderFooter: true,
      headerTemplate: job.headerTemplate,
      footerTemplate: job.footerTemplate,
      margin: PDF_MARGIN,
    });
    return new Uint8Array(pdf);
  } finally {
    await browser.close();
  }
};

export { launch as launchChromium };
