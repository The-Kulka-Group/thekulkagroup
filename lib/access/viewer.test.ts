import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seededDatabase } from "@/test/database";

import { setException, setRoleAccess } from "./store";
import { allows, cookieFrom, levelNeeded, parseViewAs, resolveViewer, toolForPath, viewerLevel, visibleToolKeys } from "./viewer";

// LA-3047: who is looking, and what that lets them open. Every person here is synthetic.

const OWNER_PERSON = "00000000-0000-4000-8000-0000000005e1";
const EST = "00000000-0000-4000-8000-0000000005e2";
const TODAY = "2026-10-24";

describe("toolForPath", () => {
  it("matches pages and APIs to their tool", () => {
    expect(toolForPath("/rom")).toBe("rom");
    expect(toolForPath("/rom/runs/abc")).toBe("rom");
    expect(toolForPath("/api/rom/projects/abc/answers")).toBe("rom");
    expect(toolForPath("/api/underwriting/cases")).toBe("underwriting");
    expect(toolForPath("/api/vision/opportunities")).toBe("vision");
    expect(toolForPath("/api/meetings/abc/job")).toBe("meetings");
    expect(toolForPath("/api/jobs/sync")).toBe("projects");
    expect(toolForPath("/api/autodesk/connection")).toBe("projects");
    expect(toolForPath("/settings/access/map")).toBe("access");
    expect(toolForPath("/settings/sources/autodesk_projects")).toBe("sources");
  });

  it("leaves Home and paths no tool owns open", () => {
    expect(toolForPath("/")).toBeNull();
    expect(toolForPath("/login")).toBeNull();
    expect(toolForPath("/romance")).toBeNull();
  });
});

describe("View As cookie", () => {
  it("parses a person or a role and nothing else", () => {
    expect(parseViewAs(`person:${EST}`)).toEqual({ kind: "person", id: EST });
    expect(parseViewAs("role:estimator")).toEqual({ kind: "role", key: "estimator" });
    expect(parseViewAs("person:not-a-uuid")).toBeNull();
    expect(parseViewAs("team:x")).toBeNull();
    expect(parseViewAs(undefined)).toBeNull();
  });

  it("reads one cookie from a Cookie header", () => {
    expect(cookieFrom("a=1; kulka-view-as=role%3Aestimator; b=2", "kulka-view-as")).toBe("role:estimator");
    expect(cookieFrom(null, "kulka-view-as")).toBeUndefined();
  });

  it("needs View to read and Edit to write", () => {
    expect(levelNeeded("GET")).toBe("view");
    expect(levelNeeded("post")).toBe("edit");
    expect(allows("edit", "view")).toBe(true);
    expect(allows("view", "edit")).toBe(false);
    expect(allows("hidden", "view")).toBe(false);
  });
});

describe("resolveViewer", () => {
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
      `insert into people (id, name, email, role_key) values
         ($1, 'Test Owner', 'owner@example.test', 'owner'),
         ($2, 'Test Estimator', 'est@example.test', 'estimator')`,
      [OWNER_PERSON, EST],
    );
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "department", targetKey: "pre-construction", level: "edit", changedBy: "test" });
    await setRoleAccess(db, { roleKey: "estimator", targetKind: "tool", targetKey: "projects", level: "view", changedBy: "test" });
  });

  it("treats the open-access user as an Owner who may View As", async () => {
    const viewer = await resolveViewer(db, { email: "open-access@kulka.invalid", unrestricted: true }, null);
    expect(viewer.canViewAs).toBe(true);
    expect(viewerLevel(viewer, "access", TODAY)).toBe("edit");
  });

  it("gives a signed-in email with no row in People no access anywhere", async () => {
    const viewer = await resolveViewer(db, { email: "stranger@example.test", unrestricted: false }, null);
    expect(viewer.access).toBeNull();
    expect(visibleToolKeys(viewer, TODAY)).toEqual([]);
  });

  it("lets an Owner view as a role", async () => {
    const viewer = await resolveViewer(db, { email: "owner@example.test", unrestricted: false }, { kind: "role", key: "estimator" });
    expect(viewer.viewingAs).toEqual({ kind: "role", name: "Estimator", roleName: "Estimator" });
    expect(visibleToolKeys(viewer, TODAY)).toEqual(["projects", "rom", "estimating"]);
    expect(viewerLevel(viewer, "projects", TODAY)).toBe("view");
  });

  it("lets an Owner view as a person, exceptions included", async () => {
    await setException(db, { personId: EST, targetKind: "tool", targetKey: "meetings", level: "view", reason: "Pricing meetings.", endsOn: null, setBy: "test" });
    const viewer = await resolveViewer(db, { email: "owner@example.test", unrestricted: false }, { kind: "person", id: EST });
    expect(viewer.viewingAs).toEqual({ kind: "person", name: "Test Estimator", roleName: "Estimator" });
    expect(viewerLevel(viewer, "meetings", TODAY)).toBe("view");
  });

  it("ignores View As from anyone but an Owner", async () => {
    const viewer = await resolveViewer(db, { email: "est@example.test", unrestricted: false }, { kind: "role", key: "owner" });
    expect(viewer.canViewAs).toBe(false);
    expect(viewer.viewingAs).toBeNull();
    expect(viewerLevel(viewer, "access", TODAY)).toBe("hidden");
  });
});
