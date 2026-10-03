import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readReplyAs, REPLY_AS_KEY } from "@/components/reply-as";

// LA-1490. Reply As is remembered per browser, and a browser with storage
// blocked still gets a working field.

function stubWindow(storage: Pick<Storage, "getItem"> | (() => never)) {
  vi.stubGlobal("window", {
    get localStorage() {
      if (typeof storage === "function") return storage();
      return storage;
    },
  });
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("readReplyAs", () => {
  it("returns the name this browser remembered", () => {
    stubWindow({ getItem: (key) => (key === REPLY_AS_KEY ? "Devin Hart" : null) });
    expect(readReplyAs()).toBe("Devin Hart");
  });

  it("returns null when nothing is remembered, so the version's Prepared By shows", () => {
    stubWindow({ getItem: () => null });
    expect(readReplyAs()).toBeNull();
  });

  it("returns null, without throwing, when storage is blocked", () => {
    stubWindow(() => {
      throw new Error("blocked");
    });
    expect(readReplyAs()).toBeNull();
  });
});
