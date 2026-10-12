import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { validFirefliesSignature } from "./signature";

describe("validFirefliesSignature", () => {
  const body = '{"meetingId":"x"}';
  const good = createHmac("sha256", "secret").update(body).digest("hex");

  it("accepts the HMAC as bare hex or with a sha256= prefix", () => {
    expect(validFirefliesSignature(body, good, "secret")).toBe(true);
    expect(validFirefliesSignature(body, `sha256=${good}`, "secret")).toBe(true);
  });

  it("refuses a wrong signature, a missing header or a missing secret", () => {
    expect(validFirefliesSignature(body, good, "other")).toBe(false);
    expect(validFirefliesSignature(`${body} `, good, "secret")).toBe(false);
    expect(validFirefliesSignature(body, null, "secret")).toBe(false);
    expect(validFirefliesSignature(body, good, undefined)).toBe(false);
  });
});
