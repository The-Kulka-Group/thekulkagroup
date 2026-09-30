import { describe, expect, it } from "vitest";

import { DEFAULT_VALIDITY_DAYS, parsePublishBody } from "./publish-request";

// LA-1419. What the publish route accepts from the estimator's form.

describe("parsePublishBody", () => {
  it("takes the four fields and trims the text", () => {
    const parsed = parsePublishBody({
      preparedFor: "  Harbor Point Partners ",
      preparedBy: " Devin ",
      coverSentence: "  This is the number for the first look. ",
      validityDays: 60,
    });
    expect(parsed).toEqual({
      ok: true,
      copy: {
        preparedFor: "Harbor Point Partners",
        preparedBy: "Devin",
        coverSentence: "This is the number for the first look.",
        validityDays: 60,
      },
    });
  });

  it("defaults validity to 90 days when it is left out or blank", () => {
    expect(DEFAULT_VALIDITY_DAYS).toBe(90);
    for (const validityDays of [undefined, null, ""]) {
      const parsed = parsePublishBody({ preparedFor: "A", preparedBy: "B", validityDays });
      expect(parsed.ok && parsed.copy.validityDays).toBe(90);
    }
  });

  it("accepts validity days typed as a whole number in a string", () => {
    const parsed = parsePublishBody({ preparedFor: "A", preparedBy: "B", validityDays: "45" });
    expect(parsed.ok && parsed.copy.validityDays).toBe(45);
  });

  it("turns a blank text field into null, since the page treats it as not stated", () => {
    const parsed = parsePublishBody({ preparedFor: "A", preparedBy: "B", coverSentence: "   " });
    expect(parsed.ok && parsed.copy.coverSentence).toBeNull();
  });

  it("needs prepared for and prepared by, since the client page names both", () => {
    const missing = parsePublishBody({ preparedBy: "B" });
    expect(missing).toEqual({ ok: false, error: "Prepared For is required." });
    const noBy = parsePublishBody({ preparedFor: "A", preparedBy: " " });
    expect(noBy).toEqual({ ok: false, error: "Prepared By is required." });
  });

  it.each([0, -5, 1.5, "abc", 731, true])("refuses validity days of %s", (validityDays) => {
    const parsed = parsePublishBody({ preparedFor: "A", preparedBy: "B", validityDays });
    expect(parsed).toEqual({ ok: false, error: "Valid For must be a whole number of days from 1 to 730." });
  });

  it("refuses a cover sentence over 400 characters, since it is one sentence", () => {
    const parsed = parsePublishBody({ preparedFor: "A", preparedBy: "B", coverSentence: "x".repeat(401) });
    expect(parsed).toEqual({ ok: false, error: "The Cover Sentence must be 400 characters or fewer." });
  });

  it("refuses a body that is not an object, and text fields that are not text", () => {
    expect(parsePublishBody(null).ok).toBe(false);
    expect(parsePublishBody("x").ok).toBe(false);
    expect(parsePublishBody({ preparedFor: 5, preparedBy: "B" }).ok).toBe(false);
  });
});
