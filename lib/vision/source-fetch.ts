type SourceFetchOptions = { accept: string; userAgent?: string; contentTypes?: readonly string[] };
async function readAttempt(url: string, max: number, deadline: AbortSignal, options: SourceFetchOptions): Promise<Uint8Array> {
  const response = await fetch(url, { signal: AbortSignal.any([deadline, AbortSignal.timeout(30_000)]), redirect: "error", cache: "no-store", headers: { "User-Agent": options.userAgent ?? "Mozilla/5.0 (compatible; KulkaVision public-record collector)", Accept: options.accept } });
  if (!response.ok) throw new Error(`The public source returned HTTP ${response.status}. Earlier finds have been kept.`);
  const contentType = response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (options.contentTypes?.length && (!contentType || !options.contentTypes.includes(contentType))) throw new Error("The public source returned an unexpected content type. Earlier finds have been kept.");
  if (!response.body) throw new Error("The public source returned an empty body.");
  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  try {
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > max) throw new Error("The public source exceeded the response size limit.");
      chunks.push(part.value);
    }
  } finally { await reader.cancel(); reader.releaseLock(); }
  return new Uint8Array(Buffer.concat(chunks));
}
export async function readPublicSource(url: string, max: number, deadline: AbortSignal, options: SourceFetchOptions): Promise<Uint8Array> {
  try { return await readAttempt(url, max, deadline, options); }
  catch (error) {
    deadline.throwIfAborted();
    const retryable = error instanceof Error && (error.name === "TimeoutError" || error.message === "fetch failed" || /HTTP 5\d\d/.test(error.message));
    if (!retryable) throw error;
    return readAttempt(url, max, deadline, options);
  }
}
