import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

describe("sidebar navigation", () => {
  it("puts Home first and outside the business function groups", async () => {
    const source = await readFile(join(process.cwd(), "components/Rail.tsx"), "utf8");

    expect(source).not.toContain('label: "Operations"');
    expect(source).not.toContain('label: "Homepage"');
    expect(source.indexOf("<span>Home</span>")).toBeLessThan(source.indexOf("NAV_GROUPS.map"));
  });
});
