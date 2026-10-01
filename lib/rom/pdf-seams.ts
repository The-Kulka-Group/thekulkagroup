import { renderPdfWithChromium } from "./pdf-renderer";
import { supabasePdfStore } from "./pdf-store";
import type { PdfRenderer, PublishedPdfStore } from "./published-pdf";

// LA-1420. The two things publish reaches outside the process for: headless
// Chromium and the storage bucket. A test replaces either by assigning to this
// object; nothing in production does.
export const pdfSeams: { renderer: PdfRenderer; store: PublishedPdfStore } = {
  renderer: renderPdfWithChromium,
  store: supabasePdfStore,
};
