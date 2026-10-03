import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PARAMETER_NAMES } from "@kulka/engine";

import { titleCase } from "@/lib/format/title-case";

import { canAddReader, EMPTY_READER, ReaderForm, ReaderList } from "./ReaderLinks";
import { readerLinkFor, readerRows, type ListedReader } from "./reader-model";

// LA-1486. Render tests for the readers section of the Publish panel: the
// three fields, Add a Reader, Copy Reader Link and Revoke Link behind a
// confirm step, and the same copy guard the rest of the panel passes.

const noop = () => {};

function reader(n: number, patch: Partial<ListedReader> = {}): ListedReader {
  return {
    id: `reader-${n}`,
    projectId: "project",
    name: n === 1 ? "Dan Reyes" : "Dana Cole",
    email: `person${n}@example.com`,
    company: n === 1 ? "Fieldstone" : null,
    createdAt: "2026-09-21T15:00:00.000Z",
    createdBy: "devin@example.com",
    revokedAt: null,
    link: `https://kulka.example/b/r/key${n}`.padEnd(40, "A"),
    ...patch,
  };
}

const LIST_PROPS = { copiedId: null, confirmingId: null, busyId: null, error: null, onCopy: noop, onAskRevoke: noop, onCancel: noop, onRevoke: noop };

function form(patch = {}, props = {}) {
  return renderToStaticMarkup(
    <ReaderForm
      fields={{ ...EMPTY_READER, name: "Dan Reyes", email: "dan@example.com", ...patch }}
      busy={false}
      error={null}
      onChange={noop}
      onSubmit={noop}
      {...props}
    />,
  );
}

function list(readers: ListedReader[], props = {}) {
  return renderToStaticMarkup(<ReaderList rows={readerRows(readers)} {...LIST_PROPS} {...props} />);
}

describe("readerLinkFor and readerRows", () => {
  it("builds the link on the origin it is given", () => {
    expect(readerLinkFor("https://kulka.example", "K".repeat(22))).toBe(`https://kulka.example/b/r/${"K".repeat(22)}`);
  });

  it("gives a revoked reader no link and the day it was revoked", () => {
    const [active, revoked] = readerRows([reader(1), reader(2, { revokedAt: "2026-09-25T15:00:00.000Z" })]);
    expect(active.link).not.toBeNull();
    expect(active.revokedOn).toBeNull();
    expect(revoked.link).toBeNull();
    expect(revoked.revokedOn).toBe("Sep 25, 2026");
  });
});

describe("ReaderForm", () => {
  it("asks for name, email and company, and offers Add a Reader", () => {
    const html = form();
    for (const label of ["Name", "Email", "Company", "Add a Reader"]) expect(html).toContain(label);
  });

  it("holds Add a Reader back until there is a name and an email with an @", () => {
    expect(canAddReader(EMPTY_READER)).toBe(false);
    expect(canAddReader({ ...EMPTY_READER, name: "Dan", email: "dan" })).toBe(false);
    expect(canAddReader({ ...EMPTY_READER, name: " ", email: "dan@example.com" })).toBe(false);
    expect(canAddReader({ name: "Dan", email: "dan@example.com", company: "" })).toBe(true);
    expect(form({ name: "" })).toMatch(/<button[^>]*disabled[^>]*>Add a Reader/);
    expect(form()).not.toMatch(/<button[^>]*disabled[^>]*>Add a Reader/);
  });

  it("shows a refusal from the route", () => {
    const html = form({}, { error: "A reader name is required." });
    expect(html).toContain('role="alert"');
    expect(html).toContain("A reader name is required.");
  });
});

describe("ReaderList", () => {
  it("says so when no reader is added", () => {
    expect(list([])).toContain("No readers are added to this project yet.");
  });

  it("lists each reader with a company, and offers Copy Reader Link and Revoke Link on an active one", () => {
    const html = list([reader(1), reader(2)]);
    expect(html).toContain("Dan Reyes");
    expect(html).toContain("Fieldstone");
    expect(html).toContain("Dana Cole");
    expect(html.match(/Copy Reader Link/g)).toHaveLength(2);
    expect(html.match(/Revoke Link/g)).toHaveLength(2);
    expect(html).toContain("Active");
  });

  it("never prints a reader's email or link", () => {
    const html = list([reader(1), reader(2)]);
    expect(html).not.toContain("@");
    expect(html).not.toContain("/b/r/");
  });

  it("says a revoked link no longer opens and offers no buttons for it", () => {
    const html = list([reader(1, { revokedAt: "2026-09-25T15:00:00.000Z" })]);
    expect(html).toContain("Revoked on Sep 25, 2026");
    expect(html).toContain("The link no longer opens the budget.");
    expect(html).not.toContain("Copy Reader Link");
    expect(html).not.toContain("Revoke Link");
  });

  it("asks before it revokes", () => {
    const asking = list([reader(1)], { confirmingId: "reader-1" });
    expect(asking).toContain("Revoke the link for Dan Reyes? It stops opening on the next visit.");
    expect(asking).toContain("Confirm Revoke");
    expect(asking).toContain(">Cancel<");
    expect(asking).not.toContain("Copy Reader Link");
  });

  it("says Copied on the link just copied", () => {
    expect(list([reader(1)], { copiedId: "reader-1" })).toContain(">Copied<");
  });
});

describe("copy guard and case", () => {
  // The form is shown empty: an email the estimator is typing is theirs, not a leak.
  const html = [
    form({ name: "", email: "" }),
    list([reader(1), reader(2, { revokedAt: "2026-09-25T15:00:00.000Z" })]),
    list([reader(1)], { confirmingId: "reader-1" }),
  ].join("");

  it("finds nothing internal and no email address", () => {
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.-]+/);
    for (const leak of [/docs\//, /\.md\b/, /\bjev\b/i, /\bAI\b/, /\bLLM\b/, ...PARAMETER_NAMES.map((n) => new RegExp(n.replace(/\./g, "\\.")))]) {
      expect(html).not.toMatch(leak);
    }
  });

  it("puts every button, label and heading in title case", () => {
    const short = html
      .split(/<[^>]+>/)
      .map((piece) => piece.trim())
      .filter((piece) => piece && piece.split(/\s+/).length <= 4 && !/[.?]$/.test(piece));
    expect(short.filter((piece) => !/\d/.test(piece) && titleCase(piece) !== piece)).toEqual([]);
  });

  it("uses no em dash or en dash", () => {
    expect(html).not.toMatch(/[–—]/);
  });
});
