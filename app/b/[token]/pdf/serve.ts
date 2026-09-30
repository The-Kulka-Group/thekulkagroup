import type { Db } from "@/lib/db";
import { publishedPdfPath } from "@/lib/rom/published-budgets";

// LA-1417. The serving end of /b/<token>.pdf. The PDF is rendered once at
// publish and stored (LA-1418); this reads the stored path off the published
// row and hands back the file. A withdrawn link, an unknown token, or a
// budget with no stored PDF is the same plain 404 the page gives.

/** Where stored PDFs are read from. LA-1418 supplies the Supabase storage one. */
export type PublishedPdfStore = {
  read(path: string): Promise<Uint8Array | null>;
};

/** No storage is wired yet, so no PDF is ever present. */
export const NO_PDF_STORE: PublishedPdfStore = { read: async () => null };

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
