import { describe, expect, it } from "vitest";

import * as engine from "@kulka/engine";

// Placeholder, and the import above is the real test. It proves the root test
// command reaches package tests and that the workspace resolves
// `@kulka/engine` by name. Next resolves that same name through
// transpilePackages, which is a different path and is not covered here. Real
// engine tests arrive with the first ROM slice.
describe("engine package", () => {
  it("resolves by name through the workspace", () => {
    expect(engine).toBeDefined();
  });
});
