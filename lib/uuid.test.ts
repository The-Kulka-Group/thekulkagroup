import { describe, expect, it } from "vitest";

import { isUuid } from "./uuid";

describe("isUuid", () => {
  it("accepts supported UUID versions", () => {
    expect(isUuid("00000000-0000-4000-8000-000000000001")).toBe(true);
  });

  it.each(["bad", "00000000-0000-0000-0000-000000000001", "' or true --"])(
    "rejects malformed database identifiers: %s",
    (value) => expect(isUuid(value)).toBe(false),
  );
});
