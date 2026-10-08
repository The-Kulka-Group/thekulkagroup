import { describe, expect, it } from "vitest";

import { formatMultiple } from "./format-multiple";

describe("formatMultiple", () => {
  it("always shows two decimals", () => {
    expect(formatMultiple(1.6)).toBe("1.60x");
    expect(formatMultiple(1.594)).toBe("1.59x");
    expect(formatMultiple(2)).toBe("2.00x");
  });
});
