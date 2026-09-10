type PdfTextItem = {str: string; transform: ArrayLike<number>};
type PdfPage = {
  getTextContent: () => Promise<{items: unknown[]}>;
  cleanup: () => void;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
};

export type PdfLoadingTask = {
  promise: Promise<PdfDocument>;
  destroy: () => void | Promise<void>;
};

export type PdfDocumentLoader = (bytes: Uint8Array) => PdfLoadingTask | Promise<PdfLoadingTask>;

type BoundedPdfErrors = {
  invalidPdf: string;
  pageLimit: string;
  pageTextLimit: string;
};

type BoundedPdfOptions = {
  maxPages: number;
  maxPageCharacters: number;
  minimumDocumentCharacters: number;
  shortDocument: {behavior: "empty"} | {behavior: "error"; message: string};
  errors: BoundedPdfErrors;
  signal?: AbortSignal;
};

const cleanLine = (value: string) => value
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
  .replace(/[ \t]+/g, " ")
  .trim();

function isTextItem(item: unknown): item is PdfTextItem {
  if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return false;
  const value = item as {str?: unknown; transform?: unknown};
  return typeof value.str === "string" && value.transform !== null && typeof value.transform === "object"
    && typeof (value.transform as ArrayLike<unknown>)[4] === "number"
    && typeof (value.transform as ArrayLike<unknown>)[5] === "number";
}

function assemblePage(items: unknown[]): string {
  const textItems = items
    .filter(isTextItem)
    .filter(item => item.str.trim())
    .sort((left, right) => Math.abs(left.transform[5] - right.transform[5]) < 2
      ? left.transform[4] - right.transform[4]
      : right.transform[5] - left.transform[5]);
  let y: number | undefined;
  let line = "";
  const lines: string[] = [];
  for (const item of textItems) {
    if (y !== undefined && Math.abs(item.transform[5] - y) >= 2) {
      const cleaned = cleanLine(line);
      if (cleaned) lines.push(cleaned);
      line = "";
    }
    line += ` ${item.str}`;
    y = item.transform[5];
  }
  const cleaned = cleanLine(line);
  if (cleaned) lines.push(cleaned);
  return lines.join("\n");
}

const defaultLoader: PdfDocumentLoader = async bytes => {
  const {getDocument} = await import("pdfjs-dist/legacy/build/pdf.mjs");
  return getDocument({data: bytes, useSystemFonts: true, disableFontFace: true, verbosity: 0}) as unknown as PdfLoadingTask;
};

export async function readBoundedPdfText(
  bytes: Uint8Array,
  options: BoundedPdfOptions,
  loadDocument: PdfDocumentLoader = defaultLoader,
): Promise<string[]> {
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Error(options.errors.invalidPdf);

  const task = await loadDocument(bytes);
  const documentPromise = task.promise;
  void documentPromise.catch(() => undefined);
  let destroyPromise: Promise<void> | undefined;
  const destroy = () => destroyPromise ??= Promise.resolve().then(() => task.destroy());
  const abort = () => { void destroy().catch(() => undefined); };
  options.signal?.addEventListener("abort", abort, {once: true});
  try {
    options.signal?.throwIfAborted();
    const pdf = await documentPromise;
    options.signal?.throwIfAborted();
    if (!pdf.numPages || pdf.numPages > options.maxPages) throw new Error(options.errors.pageLimit);
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      options.signal?.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      try {
        const content = await page.getTextContent();
        options.signal?.throwIfAborted();
        const text = assemblePage(content.items);
        if (text.length > options.maxPageCharacters) throw new Error(options.errors.pageTextLimit);
        pages.push(text);
      } finally {
        page.cleanup();
      }
    }
    if (pages.join("").trim().length < options.minimumDocumentCharacters) {
      if (options.shortDocument.behavior === "empty") return [];
      throw new Error(options.shortDocument.message);
    }
    return pages;
  } finally {
    options.signal?.removeEventListener("abort", abort);
    await destroy();
  }
}
