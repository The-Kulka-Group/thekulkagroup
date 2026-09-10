import {afterEach, describe, expect, it, vi} from "vitest";

import {getDocument} from "pdfjs-dist/legacy/build/pdf.mjs";

import {extractCivicPlusPages} from "./civicplus-source";
import {extractOysterBayZbaPages} from "./oyster-bay-zba-source";

vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({getDocument: vi.fn()}));

const bytes = new Uint8Array(Buffer.from("%PDF-test"));

function mockDocument(text: string) {
  vi.mocked(getDocument).mockReturnValue({
    promise: Promise.resolve({
      numPages: 1,
      getPage: async () => ({
        getTextContent: async () => ({items: [{str: text, transform: [1, 0, 0, 1, 10, 100]}]}),
        cleanup: vi.fn(),
      }),
    }),
    destroy: vi.fn(),
  } as never);
}

function mockPageCount(numPages: number) {
  const destroy = vi.fn();
  vi.mocked(getDocument).mockReturnValue({
    promise: Promise.resolve({numPages, getPage: vi.fn()}),
    destroy,
  } as never);
  return destroy;
}

function mockPendingDocument(reason: Error) {
  let rejectDocument!: (error: unknown) => void;
  const destroy = vi.fn(() => rejectDocument(reason));
  vi.mocked(getDocument).mockReturnValue({
    promise: new Promise((_, reject) => { rejectDocument = reject; }),
    destroy,
  } as never);
  return destroy;
}

afterEach(() => vi.clearAllMocks());

describe("collector PDF rules", () => {
  it("keeps CivicPlus short text as an empty result and fails Oyster Bay short text", async () => {
    mockDocument("x".repeat(39));
    await expect(extractCivicPlusPages(bytes, 1, new AbortController().signal)).resolves.toEqual([]);

    mockDocument("x".repeat(79));
    await expect(extractOysterBayZbaPages(bytes, 1)).rejects.toThrow(
      "An Oyster Bay Zoning Board PDF has no usable embedded text. Earlier source records remain available.",
    );
  });

  it("keeps the 40,000 and 50,000 page-character limits distinct", async () => {
    const text = "x".repeat(45_000);
    mockDocument(text);
    await expect(extractCivicPlusPages(bytes, 1, new AbortController().signal)).rejects.toThrow(
      "A CivicPlus document page exceeded its text limit.",
    );

    mockDocument(text);
    await expect(extractOysterBayZbaPages(bytes, 1)).resolves.toEqual([text]);
  });

  it("keeps each collector's non-PDF error", async () => {
    const notPdf = new Uint8Array(Buffer.from("plain text"));
    await expect(extractCivicPlusPages(notPdf, 1, new AbortController().signal)).rejects.toThrow(
      "The CivicPlus source returned an unreadable PDF.",
    );
    await expect(extractOysterBayZbaPages(notPdf, 1)).rejects.toThrow(
      "The Oyster Bay Zoning Board source returned a non-PDF document. Earlier source records remain available.",
    );
    expect(getDocument).not.toHaveBeenCalled();
  });

  it("passes each adapter's page bound to the shared reader", async () => {
    const civicDestroy = mockPageCount(2);
    await expect(extractCivicPlusPages(bytes, 1, new AbortController().signal)).rejects.toThrow(
      "The CivicPlus document exceeded its page limit.",
    );
    expect(civicDestroy).toHaveBeenCalledOnce();

    const oysterDestroy = mockPageCount(2);
    await expect(extractOysterBayZbaPages(bytes, 1)).rejects.toThrow(
      "An Oyster Bay Zoning Board PDF exceeds its reviewed page limit.",
    );
    expect(oysterDestroy).toHaveBeenCalledOnce();
  });

  it("passes abort signals from both adapter exports to the shared reader", async () => {
    for (const extract of [extractCivicPlusPages, extractOysterBayZbaPages]) {
      const controller = new AbortController();
      const reason = new Error("adapter abort");
      const destroy = mockPendingDocument(reason);
      const pending = extract(bytes, 1, controller.signal);

      controller.abort(reason);

      await expect(pending).rejects.toBe(reason);
      expect(destroy).toHaveBeenCalledOnce();
    }
  });
});
