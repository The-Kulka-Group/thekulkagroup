import { describe, expect, it } from "vitest";

import { issuedLabel, linkFor, versionList, type ListedVersion } from "./publish-model";

// LA-1419. What the version list shows for each published version. The state
// and the link come from the server (GET /api/rom/projects/[id]/published),
// which computes the state by the rule loadPublishedBudget follows.

function listed(version: number, patch: Partial<ListedVersion> = {}): ListedVersion {
  const token = `token-${version}`.padEnd(22, "x");
  return {
    id: `id-${version}`,
    token,
    runId: "run",
    projectId: "project",
    version,
    stage: "conceptual",
    pdfPath: null,
    issuedAt: `2026-09-${String(20 + version).padStart(2, "0")}T15:00:00.000Z`,
    issuedBy: "devin@example.com",
    revokedAt: null,
    supersededBy: null,
    state: "current",
    link: `https://kulka.example/b/${token}`,
    ...patch,
  };
}

describe("versionList", () => {
  it("shows the state the server gave, without working it out again", () => {
    // The server's rule is tested in lib/rom/published-budgets.test.ts; here a
    // state no local rule would give shows as sent.
    const list = versionList([listed(2, { state: "superseded" }), listed(1, { state: "current" })]);
    expect(list.map((v) => [v.version, v.state])).toEqual([
      [2, "superseded"],
      [1, "current"],
    ]);
  });

  it("carries the server's full link for each version", () => {
    expect(versionList([listed(1)])[0].link).toBe(`https://kulka.example/b/${"token-1".padEnd(22, "x")}`);
  });

  it("says when a withdrawn version was withdrawn", () => {
    const list = versionList([listed(1, { state: "withdrawn", revokedAt: "2026-09-25T15:00:00.000Z" })]);
    expect(list[0].state).toBe("withdrawn");
    expect(list[0].withdrawnOn).toBe("Sep 25, 2026");
  });

  it("sorts newest first whatever order it is given", () => {
    expect(versionList([listed(1), listed(3), listed(2)]).map((v) => v.version)).toEqual([3, 2, 1]);
  });
});

describe("issuedLabel and linkFor", () => {
  it("prints the date in Eastern time", () => {
    expect(issuedLabel("2026-09-30T02:00:00.000Z")).toBe("Sep 29, 2026");
  });

  it("builds the link from the site's own address", () => {
    expect(linkFor("https://kulka.example", "abc")).toBe("https://kulka.example/b/abc");
  });
});
