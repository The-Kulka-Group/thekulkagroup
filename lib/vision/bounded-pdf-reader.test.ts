import {describe, expect, it, vi} from "vitest";

import {
  readBoundedPdfText,
  type PdfDocumentLoader,
  type PdfLoadingTask,
} from "./bounded-pdf-reader";

const errors = {
  invalidPdf: "invalid PDF",
  pageLimit: "page limit",
  pageTextLimit: "page text limit",
};

function pdfBytes() {
  return new Uint8Array(Buffer.from("%PDF-test"));
}

function loaderFor(
  pages: Array<Array<{str: string; transform: number[]}>>,
  hooks: {cleanup?: () => void; destroy?: () => void | Promise<void>} = {},
): PdfDocumentLoader {
  return () => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (pageNumber: number) => ({
        getTextContent: async () => ({items: pages[pageNumber - 1]}),
        cleanup: hooks.cleanup ?? vi.fn<() => void>(),
      }),
    }),
    destroy: hooks.destroy ?? vi.fn<() => void>(),
  });
}

describe("bounded PDF reader", () => {
  it("orders embedded text by physical line and horizontal position", async () => {
    const pages = await readBoundedPdfText(pdfBytes(), {
      maxPages: 1,
      maxPageCharacters: 100,
      minimumDocumentCharacters: 1,
      shortDocument: {behavior: "empty"},
      errors,
    }, loaderFor([[
      {str: "right", transform: [1, 0, 0, 1, 40, 100]},
      {str: "second", transform: [1, 0, 0, 1, 10, 80]},
      {str: "left", transform: [1, 0, 0, 1, 10, 100]},
    ]]));

    expect(pages).toEqual(["left right\nsecond"]);
  });

  it("rejects page and text bounds while cleaning up pages and the loading task", async () => {
    const pageCleanup = vi.fn<() => void>();
    const pageBoundDestroy = vi.fn<() => void>();
    await expect(readBoundedPdfText(pdfBytes(), {
      maxPages: 1,
      maxPageCharacters: 100,
      minimumDocumentCharacters: 1,
      shortDocument: {behavior: "empty"},
      errors,
    }, loaderFor([[], []], {destroy: pageBoundDestroy}))).rejects.toThrow("page limit");
    expect(pageBoundDestroy).toHaveBeenCalledOnce();

    const textBoundDestroy = vi.fn<() => void>();
    await expect(readBoundedPdfText(pdfBytes(), {
      maxPages: 1,
      maxPageCharacters: 3,
      minimumDocumentCharacters: 1,
      shortDocument: {behavior: "empty"},
      errors,
    }, loaderFor([[{str: "long text", transform: [1, 0, 0, 1, 10, 100]}]], {
      cleanup: pageCleanup,
      destroy: textBoundDestroy,
    }))).rejects.toThrow("page text limit");
    expect(pageCleanup).toHaveBeenCalledOnce();
    expect(textBoundDestroy).toHaveBeenCalledOnce();
  });

  it("destroys an in-flight loading task when the signal aborts", async () => {
    const controller = new AbortController();
    const reason = new Error("test abort");
    let rejectDocument!: (error: unknown) => void;
    const task: PdfLoadingTask = {
      promise: new Promise((_, reject) => { rejectDocument = reject; }),
      destroy: vi.fn(() => { rejectDocument(reason); }),
    };
    const pending = readBoundedPdfText(pdfBytes(), {
      maxPages: 1,
      maxPageCharacters: 100,
      minimumDocumentCharacters: 1,
      shortDocument: {behavior: "empty"},
      errors,
      signal: controller.signal,
    }, () => task);

    controller.abort(reason);

    await expect(pending).rejects.toBe(reason);
    expect(task.destroy).toHaveBeenCalledOnce();
  });

  it("keeps short-document behavior configurable", async () => {
    const loader = loaderFor([[{str: "short", transform: [1, 0, 0, 1, 10, 100]}]]);
    await expect(readBoundedPdfText(pdfBytes(), {
      maxPages: 1,
      maxPageCharacters: 100,
      minimumDocumentCharacters: 10,
      shortDocument: {behavior: "empty"},
      errors,
    }, loader)).resolves.toEqual([]);
    await expect(readBoundedPdfText(pdfBytes(), {
      maxPages: 1,
      maxPageCharacters: 100,
      minimumDocumentCharacters: 10,
      shortDocument: {behavior: "error", message: "unusable text"},
      errors,
    }, loader)).rejects.toThrow("unusable text");
  });
});
