import type { Db } from "@/lib/db";
import { publishedPdfPath } from "@/lib/rom/published-budgets";
import { NO_PDF_STORE, type PublishedPdfStore } from "@/lib/rom/published-pdf";

export { NO_PDF_STORE, type PublishedPdfStore };

// LA-1417. The serving end of /b/<token>.pdf. The PDF is rendered once at
// publish and stored (LA-1420); this reads the stored path off the published
// row and hands back the file. A withdrawn link, an unknown token, or a
// budget with no stored PDF is the same plain 404 the page gives.

function notFound(): Response {
  return new Response("Not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

export async function servePublishedPdf(db: Db, store: PublishedPdfStore, token: string): Promise<Response> {
  const path = await publishedPdfPath(db, token);
  if (!path) return notFound();
  const file = await store.read(path);
  if (!file) return notFound();
  return new Response(new Uint8Array(file), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline",
    },
  });
}
