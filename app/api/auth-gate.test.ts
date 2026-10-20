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
  "underwriting/cases/[id]/review/route.ts",
  "underwriting/cases/[id]/runs/route.ts",
  "underwriting/cases/[id]/runs/[runId]/workbook/route.ts",
  "underwriting/cases/[id]/runs/[runId]/summary-pdf/route.ts",
  "underwriting/cases/[id]/scenarios/route.ts",
  "underwriting/cases/[id]/schedule/route.ts",
  // LA-1486: reader links. The two that need the signed-in email use authorizeRequest, which requireApiUser wraps.
  "rom/projects/[id]/readers/route.ts",
  "rom/readers/[id]/revoke/route.ts",
  // LA-1490: client comments, Kulka's side. These read the signed-in account
  // for the staff name on a reply, so they call authorizeRequest directly.
  "rom/projects/[id]/comments/route.ts",
  "rom/comments/threads/[id]/reply/route.ts",
  "rom/comments/threads/[id]/close/route.ts",
  "rom/comments/threads/[id]/accept/route.ts",
  "rom/comments/threads/[id]/decline/route.ts",
  "rom/comments/threads/[id]/remove-correction/route.ts",
  "rom/comments/messages/[id]/remove/route.ts",
  // LA-2894: the Autodesk sign-in. connect/route.ts opens no database.
  "autodesk/callback/route.ts",
  "autodesk/connection/route.ts",
  "autodesk/areas/route.ts",
];

// A route is guarded by requireApiUser, or by authorizeRequest when it needs
// the signed-in user's email.
const GUARD = /await (requireApiUser|authorizeRequest)\(/;

describe("API authentication gate", () => {
  for (const route of routes) {
    it(`protects ${route} before database access`, async () => {
      const source = await readFile(join(process.cwd(), "app/api", route), "utf8");
      const guard = source.search(GUARD);
      expect(guard).toBeGreaterThanOrEqual(0);
      expect(guard).toBeLessThan(source.indexOf("getDb()"));
    });
  }
});
