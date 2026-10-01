import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { PublishedPdfStore } from "./published-pdf";

// LA-1420. Stored PDFs of published budgets live in a private Supabase Storage
// bucket. Nothing outside the server reads it: /b/<token>.pdf reads the file
// here and streams it, so the bucket has no public URL and the link's token is
// the only key.
//
// Judgment call: the app talks to Postgres in SQL and holds no Supabase
// secret today (.env.example says not to put the service-role key here).
// Storage has no SQL door, so this needs SUPABASE_SERVICE_ROLE_KEY on the
// server. It is used for this bucket only, never sent to the browser, and its
// absence turns storing off rather than breaking anything: publish still
// works and pdf_path stays null.

export const PDF_BUCKET = "published-budget-pdfs";

let client: SupabaseClient | undefined;

function storageClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

/** True when storage credentials are present. */
export function pdfStorageConfigured(): boolean {
  return storageClient() !== null;
}

async function ensureBucket(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.storage.createBucket(PDF_BUCKET, { public: false, allowedMimeTypes: ["application/pdf"] });
  // Already there is the usual answer after the first publish.
  if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`The PDF bucket could not be created: ${error.message}`);
}

export const supabasePdfStore: PublishedPdfStore = {
  async read(path) {
    const supabase = storageClient();
    if (!supabase) return null;
    const { data, error } = await supabase.storage.from(PDF_BUCKET).download(path);
    if (error || !data) return null;
    return new Uint8Array(await data.arrayBuffer());
  },

  async write(path, bytes) {
    const supabase = storageClient();
    if (!supabase) throw new Error("PDF storage is not configured: SUPABASE_SERVICE_ROLE_KEY is not set.");
    await ensureBucket(supabase);
    const { error } = await supabase.storage.from(PDF_BUCKET).upload(path, bytes, { contentType: "application/pdf", upsert: false });
    if (error) throw new Error(`The PDF could not be stored: ${error.message}`);
  },
};
