import { describe, expect, it } from "vitest";

import * as engine from "@kulka/engine";

// Placeholder. It proves two things and asserts nothing about the ROM: the
// root test command reaches package tests, and the app's own import path
// resolves. Real engine tests arrive with the first ROM slice.
describe("engine package", () => {
  it("resolves through the workspace", () => {
    expect(engine).toBeTypeOf("object");
  });
});
