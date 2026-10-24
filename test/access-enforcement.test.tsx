import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Db } from "@/lib/db";
import { setRoleAccess } from "@/lib/access/store";
import type { AccessSetting } from "@/lib/access/level";
import type { Viewer } from "@/lib/access/viewer";
import { visibleToolKeys } from "@/lib/access/viewer";
import { seededDatabase } from "@/test/database";

// LA-3047: the rail for two roles, No Access, a View page with no save
// controls, and a 403 from a write API. Every person here is synthetic.

let db: Awaited<ReturnType<typeof seededDatabase>>;
vi.mock("@/lib/db", () => ({ getDb: () => db as Db }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
vi.mock("@/app/(app)/view-as-actions", () => ({ startViewAs: vi.fn(), stopViewAs: vi.fn() }));
vi.mock("@/app/(app)/settings/access/actions", () => ({
  setRoleLevel: vi.fn(), addPersonAction: vi.fn(), addExceptionAction: vi.fn(), removeExceptionAction: vi.fn(),
}));

const { Rail } = await import("@/components/Rail");
const { GateBody } = await import("@/components/access/ToolGate");
const { PersonView } = await import("@/app/(app)/settings/access/people/[id]/PersonView");
const { POST } = await import("@/app/api/rom/projects/route");

const TODAY = "2026-10-24";
const EST = "00000000-0000-4000-8000-0000000006e1";

function roleViewer(roleKey: string, roleAccess: AccessSetting[]): Viewer {
  return { access: { roleKey, roleAccess, exceptions: [] }, canViewAs: false, viewingAs: null };
}

beforeAll(async () => {
  db = await seededDatabase();
}, 60_000);
afterAll(async () => db?.close());
beforeEach(async () => {
  await db.query(`truncate access_changes, access_exceptions, role_access, people cascade`);
});

describe("the rail follows the viewer's access", () => {
  const estimator = roleViewer("estimator", [
    { targetKind: "department", targetKey: "pre-construction", level: "edit" },
    { targetKind: "tool", targetKey: "projects", level: "view" },
  ]);
  const finance = roleViewer("finance", [{ targetKind: "tool", targetKey: "underwriting", level: "edit" }]);

  it("shows an Estimator only Pre-Construction and Projects", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "x@example.test", openAccess: true, tools: visibleToolKeys(estimator, TODAY) }));
    expect(html).toContain('href="/rom"');
    expect(html).toContain('href="/estimating"');
    expect(html).toContain('href="/projects"');
    expect(html).not.toContain('href="/meetings"');
    expect(html).not.toContain('href="/underwriting"');
    expect(html).not.toContain("Sales and Marketing");
    expect(html).not.toContain(">Settings<");
    expect(html).toContain(">Home<");
  });

  it("shows Finance only Underwriting, under Development", () => {
    const html = renderToStaticMarkup(createElement(Rail, { email: "x@example.test", openAccess: true, tools: visibleToolKeys(finance, TODAY) }));
    expect(html).toContain('href="/underwriting"');
    expect(html).toContain(">Development<");
    expect(html).not.toContain('href="/rom"');
    expect(html).not.toContain("Pre-Construction");
  });
});

describe("tool gates", () => {
  const viewer = roleViewer("finance", []);

  it("shows No Access in place of a Hidden tool's page", () => {
    const html = renderToStaticMarkup(
      createElement(GateBody, { level: "hidden", toolLabel: "Conceptual Budget", viewer }, createElement("p", null, "SECRET PAGE")),
    );
    expect(html).toContain("No Access");
    expect(html).toContain("You cannot open Conceptual Budget.");
    expect(html).not.toContain("SECRET PAGE");
  });

  it("names the person being viewed as on No Access", () => {
    const html = renderToStaticMarkup(
      createElement(GateBody, {
        level: "hidden",
        toolLabel: "Vision",
        viewer: { ...viewer, viewingAs: { kind: "person", name: "Test Estimator", roleName: "Estimator" } },
      }, null),
    );
    expect(html).toContain("Test Estimator cannot open Vision.");
  });

  it("shows a View Only page with its note and no save controls", () => {
    const person = { id: EST, name: "Test Estimator", email: "est@example.test", title: null, roleKey: "estimator", roleName: "Estimator", exceptionCount: 1 };
    const page = createElement(PersonView, {
      person,
      exceptions: [{ targetKind: "tool", targetKey: "projects", level: "edit", reason: "Covers a project.", endsOn: null, setBy: "test" }],
      roleAccess: [],
      today: TODAY,
      canEdit: false,
    });
    const html = renderToStaticMarkup(createElement(GateBody, { level: "view", toolLabel: "People and Access", viewer }, page));
    expect(html).toContain("View Only.");
    expect(html).toContain("Covers a project.");
    expect(html).not.toContain("Add Exception");
    expect(html).not.toContain(">Remove<");
  });
});

describe("write APIs", () => {
  const newBudget = (cookie?: string) =>
    POST(
      new Request("http://localhost/api/rom/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cookie ? { cookie } : {}) },
        body: JSON.stringify({ name: "Synthetic Budget" }),
      }),
    );

  it("answers 403 to a write when the viewer only has View", async () => {
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "rom", level: "view", changedBy: "test" });
    const response = await newBudget("kulka-view-as=role%3Aestimator");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You can view this, but you cannot change it." });
  });

  it("answers 403 to a viewer for whom the tool is Hidden", async () => {
    const response = await newBudget("kulka-view-as=role%3Afinance");
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "You do not have access to this." });
  });

  it("lets the same write through with no View As, as today", async () => {
    const response = await newBudget();
    expect(response.status).not.toBe(403);
  });
});
