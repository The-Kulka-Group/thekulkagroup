import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { accessGrid } from "@/lib/access/grid";
import { readPersonAccess, setException, setRoleAccess } from "@/lib/access/store";
import { listChanges, listPeople, listRoleAccess, listRoles, readPerson } from "@/lib/access/read";
import { seededDatabase } from "@/test/database";

import { ChangeList } from "./changes/ChangeList";
import { AccessMap, type MapRole } from "./map/AccessMap";
import { PeopleList } from "./PeopleList";
import { PersonView } from "./people/[id]/PersonView";

// LA-3046: the People and Access pages render from what the store wrote.
// Every person here is synthetic.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./actions", () => ({
  setRoleLevel: vi.fn(),
  addPersonAction: vi.fn(),
  addExceptionAction: vi.fn(),
  removeExceptionAction: vi.fn(),
}));

const EST = "00000000-0000-4000-8000-0000000004e1";
const TODAY = "2026-10-24";

describe("People and Access pages", () => {
  let db: Awaited<ReturnType<typeof seededDatabase>>;
  beforeAll(async () => {
    db = await seededDatabase();
  });
  afterAll(async () => {
    await db.close();
  });
  beforeEach(async () => {
    await db.query(`truncate access_changes, access_exceptions, role_access, people cascade`);
    await db.query(
      `insert into people (id, name, email, title, role_key) values ($1, 'Test Estimator', 'est@example.test', 'Senior Estimator', 'estimator')`,
      [EST],
    );
  });

  async function map(open: string[] = []) {
    const [roles, byRole, people] = await Promise.all([listRoles(db), listRoleAccess(db), listPeople(db)]);
    const mapRoles: MapRole[] = roles.map((r) => ({
      key: r.key, name: r.name, locked: r.key === "owner",
      people: people.filter((p) => p.roleKey === r.key).map((p) => ({ id: p.id, name: p.name })),
    }));
    return renderToStaticMarkup(createElement(AccessMap, { roles: mapRoles, grid: accessGrid(roles, byRole), initialOpen: open }));
  }

  it("renders the grid with one column per role, departments folded, and the Owner locked", async () => {
    const html = await map();
    for (const role of ["Owner", "Admin", "Project Manager", "Estimator", "Finance"]) expect(html).toContain(`>${role}<`);
    expect(html).toContain("Pre-Construction");
    expect(html).not.toContain(">Conceptual Budget<");
    expect(html).toMatch(/disabled=""[^>]*aria-label="Owner, Pre-Construction: Edit"/);
    expect(html).toContain('aria-label="Estimator, Pre-Construction: Hidden"');
  });

  it("shows a department-level change on the department and on every tool under it", async () => {
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "department", targetKey: "pre-construction", level: "view", changedBy: "test" });
    const html = await map(["pre-construction"]);
    expect(html).toContain('aria-label="Estimator, Pre-Construction: View"');
    expect(html).toContain('aria-label="Estimator, Conceptual Budget: View"');
    expect(html).toContain('aria-label="Estimator, Estimating: View"');

    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: "edit", changedBy: "test" });
    const mixed = await map(["pre-construction"]);
    expect(mixed).toContain('aria-label="Estimator, Pre-Construction: Mixed"');
    expect(mixed).toContain('aria-label="Estimator, Conceptual Budget: Edit, differs from its department"');
  });

  it("lists people with their role and exception count", async () => {
    await setException(db, { personId: EST, targetKind: "tool", targetKey: "projects", level: "edit", reason: "Covers a project.", endsOn: null, setBy: "test" });
    const html = renderToStaticMarkup(createElement(PeopleList, { people: await listPeople(db) }));
    expect(html).toContain("Test Estimator");
    expect(html).toContain("Estimator</span>");
    expect(html).toContain('<span class="ac-exc">1</span>');
    expect(html).toContain(`href="/settings/access/people/${EST}"`);
  });

  it("shows a person's exception with the purple pin, apart from their role access", async () => {
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "projects", level: "view", changedBy: "test" });
    await setException(db, {
      personId: EST, targetKind: "tool", targetKey: "projects", level: "edit",
      reason: "Covers C00466 while its project manager is out.", endsOn: "2026-12-31", setBy: "matt@example.test",
    });
    const found = (await readPerson(db, EST))!;
    const html = renderToStaticMarkup(
      createElement(PersonView, { person: found.person, exceptions: found.exceptions, roleAccess: (await listRoleAccess(db)).estimator, today: TODAY }),
    );
    expect(html).toContain("1 Exception");
    expect(html).toContain("View to Edit");
    expect(html).toContain("Covers C00466 while its project manager is out.");
    expect(html).toContain("Ends Dec 31, 2026");
    expect(html).toContain("ac-mk--edit ac-pin");
    expect(html).toContain("Edit, Exception");
    // Role access alone carries no pin.
    expect(html).not.toContain("ac-mk--view ac-pin");
    expect(await readPersonAccess(db, EST)).not.toBeNull();
  });

  it("writes the change log newest first, with who, what, from and to", async () => {
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "department", targetKey: "pre-construction", level: "view", changedBy: "matt@example.test" });
    await setException(db, { personId: EST, targetKind: "tool", targetKey: "meetings", level: "view", reason: "Sits in on pricing meetings.", endsOn: null, setBy: "matt@example.test" });
    const html = renderToStaticMarkup(createElement(ChangeList, { changes: await listChanges(db) }));
    const exc = html.indexOf("gave Test Estimator an exception on Meetings");
    const role = html.indexOf("set Estimator to View on Pre-Construction (Whole Department)");
    expect(exc).toBeGreaterThan(-1);
    expect(role).toBeGreaterThan(exc);
    expect(html).toContain("<b>matt@example.test</b>");
    expect(html).toContain("No Setting");
    expect(html).toContain("Sits in on pricing meetings.");
  });

  it("says plainly when nothing has changed yet", () => {
    const html = renderToStaticMarkup(createElement(ChangeList, { changes: [] }));
    expect(html).toContain("No access has changed yet.");
  });
});
