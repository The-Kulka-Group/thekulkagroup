import { getDb } from "@/lib/db";

import { pdfSeams } from "@/lib/rom/pdf-seams";

import { servePublishedPdf } from "./serve";

export const dynamic = "force-dynamic";

// LA-1417, LA-1420. /b/<token>.pdf, rewritten here by proxy.ts. Open to anyone
// with the link, like the page. The file is the PDF stored at publish.
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return servePublishedPdf(getDb(), pdfSeams.store, token);
}
