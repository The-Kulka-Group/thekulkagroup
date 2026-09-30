import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PARAMETER_NAMES } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";
import type { PublishedBudgetRecord } from "@/lib/rom/published-budgets";

import { canPublish, EMPTY_FIELDS, PublishForm, VersionList } from "./PublishPanel";
import { versionList } from "./publish-model";

// LA-1419. Render tests for the publish controls: the four fields, Copy Link,
// the version list with its dates and links, and Revoke behind a confirm
// step. The copy guard below is LA-1333's, run over this panel.

const noop = () => {};

function record(version: number, patch: Partial<PublishedBudgetRecord> = {}): PublishedBudgetRecord {
  return {
    id: `id-${version}`,
    token: `tok${version}`.padEnd(22, "A"),
    runId: "run",
    projectId: "project",
    version,
    stage: "conceptual",
    pdfPath: null,
    issuedAt: `2026-09-2${version}T15:00:00.000Z`,
    issuedBy: "devin@example.com",
    revokedAt: null,
    supersededBy: null,
    ...patch,
  };
}

const LIST_PROPS = {
  origin: "https://kulka.example",
  copiedId: null,
  confirmingId: null,
  busyId: null,
  error: null,
  onCopy: noop,
  onAskRevoke: noop,
  onCancel: noop,
  onRevoke: noop,
};

function form(patch = {}, props = {}) {
  return renderToStaticMarkup(
    <PublishForm
      fields={{ ...EMPTY_FIELDS, preparedFor: "Harbor Point", preparedBy: "Devin", ...patch }}
      busy={false}
      error={null}
      nextVersion={1}
      onChange={noop}
      onSubmit={noop}
      {...props}
    />,
  );
}

function list(records: PublishedBudgetRecord[], props = {}) {
  return renderToStaticMarkup(<VersionList rows={versionList(records)} {...LIST_PROPS} {...props} />);
}

describe("PublishForm", () => {
  it("asks for the four fields, with validity days at 90", () => {
    const html = form();
    for (const label of ["Prepared for", "Prepared by", "Cover Sentence", "Days Valid"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain('value="90"');
    expect(html).toContain("Publish Version 1");
  });

  it("says Publish on a saved budget and never Generate or Run", () => {
    const html = form();
    expect(html).not.toMatch(/generate/i);
    expect(html).not.toMatch(/\brun\b/i);
  });

  it("names the next version on the button", () => {
    expect(form({}, { nextVersion: 2 })).toContain("Publish Version 2");
  });

  it("holds Publish back until Prepared For and Prepared By are filled", () => {
    expect(canPublish(EMPTY_FIELDS)).toBe(false);
    expect(canPublish({ ...EMPTY_FIELDS, preparedFor: "A", preparedBy: " " })).toBe(false);
    expect(canPublish({ ...EMPTY_FIELDS, preparedFor: "A", preparedBy: "B" })).toBe(true);
    expect(form({ preparedFor: "" })).toMatch(/<button[^>]*disabled[^>]*>Publish Version 1/);
    expect(form()).not.toMatch(/<button[^>]*disabled[^>]*>Publish Version 1/);
  });

  it("shows a refusal from the route", () => {
    const html = form({}, { error: "Add who prepared this budget." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("Add who prepared this budget.");
  });
});

describe("VersionList", () => {
  it("says so when nothing is published", () => {
    expect(list([])).toContain("Nothing is published for this budget yet.");
  });

  it("lists every version with its date and link, newest first", () => {
    const html = list([record(1, { supersededBy: "id-2" }), record(2)]);
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("Sep 21, 2026");
    expect(html).toContain("Sep 22, 2026");
    expect(html).toContain('href="https://kulka.example/b/tok1AAAAAAAAAAAAAAAAAA"');
    expect(html).toContain('href="https://kulka.example/b/tok2AAAAAAAAAAAAAAAAAA"');
    expect(html.match(/Copy Link/g)).toHaveLength(2);
    expect(html).toContain("Current");
    expect(html).toContain("Superseded");
  });

  it("says a revoked version is withdrawn, and offers no link, Copy Link or Revoke for it", () => {
    const html = list([record(1, { revokedAt: "2026-09-25T15:00:00.000Z" })]);
    expect(html).toContain("Withdrawn on Sep 25, 2026");
    expect(html).not.toContain("/b/");
    expect(html).not.toContain("Copy Link");
    expect(html).not.toContain(">Revoke<");
  });

  it("asks before it revokes", () => {
    const html = list([record(1)]);
    expect(html).toContain(">Revoke<");
    expect(html).not.toContain("Confirm Revoke");

    const asking = list([record(1)], { confirmingId: "id-1" });
    expect(asking).toContain("Revoke Version 1? Its link stops opening and shows a withdrawn notice.");
    expect(asking).toContain("Confirm Revoke");
    expect(asking).toContain(">Cancel<");
    expect(asking).not.toContain("Copy Link");
  });

  it("says Copied on the link just copied", () => {
    expect(list([record(1)], { copiedId: "id-1" })).toContain(">Copied<");
  });
});

// LA-1333's guard, over this panel: nothing that reads like the inside of the
// software, and every label in title case.
const LEAKS: RegExp[] = [
  /docs\//,
  /\.md\b/,
  /\bjev\b/i,
  /\bAI\b/,
  /\bLLM\b/,
  ...PARAMETER_NAMES.map((name) => new RegExp(name.replace(/\./g, "\\."))),
];

function visibleText(html: string): string[] {
  return html
    .replace(/<a [^>]*>.*?<\/a>/g, "")
    .split(/<[^>]+>/)
    .map((piece) => piece.trim())
    .filter(Boolean);
}

describe("copy guard and case", () => {
  const html = [
    form(),
    list([record(2), record(1, { supersededBy: "id-2" }), record(3, { revokedAt: "2026-09-25T15:00:00.000Z" })]),
    list([record(1)], { confirmingId: "id-1" }),
  ].join("");

  it("finds nothing internal on the panel", () => {
    // An email address is a leak too, so the publisher's email must not show.
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    for (const leak of LEAKS) expect(html).not.toMatch(leak);
  });

  it("puts every button, label and heading in title case", () => {
    const short = visibleText(html).filter((piece) => piece.split(/\s+/).length <= 4 && !/[.?]$/.test(piece));
    const wrong = short.filter((piece) => !/\d/.test(piece) && titleCase(piece) !== piece);
    expect(wrong).toEqual([]);
  });

  it("uses no em dash or en dash", () => {
    expect(html).not.toMatch(/[–—]/);
  });
});

describe("phone width", () => {
  const css = readFileSync(new URL("./publish.css", import.meta.url), "utf8");

  it("gives nothing a fixed width and lets rows and links wrap", () => {
    expect(css).not.toMatch(/(^|[^-])width:\s*\d+px/m);
    expect(css).toMatch(/overflow-wrap:\s*anywhere/);
    expect(css).toMatch(/flex-wrap:\s*wrap/);
    expect(css).toMatch(/minmax\(min\(\d+px, 100%\)/);
  });
});
