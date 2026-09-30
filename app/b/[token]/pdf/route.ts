import { getDb } from "@/lib/db";

import { NO_PDF_STORE, servePublishedPdf } from "./serve";

export const dynamic = "force-dynamic";

// LA-1417. /b/<token>.pdf, rewritten here by proxy.ts. Open to anyone with
// the link, like the page.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return servePublishedPdf(getDb(), NO_PDF_STORE, token);
}
