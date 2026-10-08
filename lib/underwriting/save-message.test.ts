import { describe, expect, it } from "vitest";

import { saveMessage } from "./save-message";

describe("saveMessage", () => {
  it("names the first failed field after the lead", () => {
    expect(saveMessage("Review the cost schedule fields.", [{ message: "Add at least one cost line." }, { message: "Second." }]))
      .toBe("Review the cost schedule fields. Add at least one cost line.");
  });

  it("keeps the lead alone when there is no field issue", () => {
    expect(saveMessage("Review the development capital fields.", [])).toBe("Review the development capital fields.");
  });
});
