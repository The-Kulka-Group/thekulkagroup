import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "rom/route.ts",
  "underwriting/cases/route.ts",
  "underwriting/cases/[id]/route.ts",
  "underwriting/cases/[id]/capital/route.ts",
  "underwriting/cases/[id]/operations/route.ts",
  "underwriting/cases/[id]/returns/route.ts",
  "underwriting/cases/[id]/runs/route.ts",
  "underwriting/cases/[id]/scenarios/route.ts",
  "underwriting/cases/[id]/schedule/route.ts",
  // LA-1486: reader links. The two that need the signed-in email use authorizeRequest, which requireApiUser wraps.
  "rom/projects/[id]/readers/route.ts",
  "rom/readers/[id]/revoke/route.ts",
];

describe("API authentication gate", () => {
  for (const route of routes) {
    it(`protects ${route} before database access`, async () => {
      const source = await readFile(join(process.cwd(), "app/api", route), "utf8");
      const gate = source.match(/await (requireApiUser|authorizeRequest)\(/);
      expect(gate).not.toBeNull();
      expect(source.indexOf(gate![0])).toBeLessThan(source.indexOf("getDb()"));
    });
  }
});
