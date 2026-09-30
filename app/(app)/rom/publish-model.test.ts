import { describe, expect, it } from "vitest";

import type { PublishedBudgetRecord } from "@/lib/rom/published-budgets";

import { issuedLabel, linkFor, versionList } from "./publish-model";

// LA-1419. What the version list shows for each published version.

function record(version: number, patch: Partial<PublishedBudgetRecord> = {}): PublishedBudgetRecord {
  return {
    id: `id-${version}`,
    token: `token-${version}`.padEnd(22, "x"),
    runId: "run",
    projectId: "project",
    version,
    stage: "conceptual",
    pdfPath: null,
    issuedAt: `2026-09-${String(20 + version).padStart(2, "0")}T15:00:00.000Z`,
    issuedBy: "devin@example.com",
    revokedAt: null,
    supersededBy: null,
    ...patch,
  };
}

describe("versionList", () => {
  it("marks a lone version Current", () => {
    expect(versionList([record(1)]).map((v) => v.state)).toEqual(["current"]);
  });

  it("marks Version 1 Superseded once Version 2 is out, newest first", () => {
    const list = versionList([record(2), record(1, { supersededBy: "id-2" })]);
    expect(list.map((v) => [v.version, v.state])).toEqual([
      [2, "current"],
      [1, "superseded"],
    ]);
  });

  it("marks a revoked version Withdrawn, and says when", () => {
    const list = versionList([record(1, { revokedAt: "2026-09-25T15:00:00.000Z" })]);
    expect(list[0].state).toBe("withdrawn");
    expect(list[0].withdrawnOn).toBe("Sep 25, 2026");
  });

  it("reads an older version as Current when every later version is withdrawn, as its page does", () => {
    const list = versionList([
      record(2, { revokedAt: "2026-09-25T15:00:00.000Z" }),
      record(1, { supersededBy: "id-2" }),
    ]);
    expect(list.map((v) => v.state)).toEqual(["withdrawn", "current"]);
  });

  it("sorts newest first whatever order it is given", () => {
    expect(versionList([record(1), record(3), record(2)]).map((v) => v.version)).toEqual([3, 2, 1]);
  });
});

describe("issuedLabel and linkFor", () => {
  it("prints the date in Eastern time", () => {
    expect(issuedLabel("2026-09-30T02:00:00.000Z")).toBe("Sep 29, 2026");
  });

  it("builds the link from the site's own address", () => {
    expect(linkFor("https://kulka.example", "abc")).toBe("https://kulka.example/b/abc");
    expect(linkFor("", "abc")).toBe("/b/abc");
  });
});
