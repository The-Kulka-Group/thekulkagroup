import { describe, expect, it } from "vitest";

import RomIntakePage from "./page";

// LA-1141. /rom/intake is a redirect now: the guided New budget flow on /rom
// covers everything intake asked. next/navigation's redirect() throws a
// special error carrying the destination, which is how a server component
// hands a redirect to the framework, so a passing test here catches that
// error and reads the digest off it rather than expecting a return value.

function destinationOf(error: unknown): string {
  if (!(error instanceof Error) || !("digest" in error)) throw error;
  // The digest is "NEXT_REDIRECT;<type>;<url>;<status>".
  return String((error as { digest: unknown }).digest).split(";")[2];
}

describe("RomIntakePage", () => {
  it("redirects to the guided New budget flow when the URL names no project", async () => {
    await expect(RomIntakePage({ searchParams: Promise.resolve({}) })).rejects.toSatisfy((error) => {
      expect(destinationOf(error)).toBe("/rom?new=1");
      return true;
    });
  });

  it("redirects a ?project= link to the same project on /rom", async () => {
    const projectId = "00000000-0000-4000-8000-000000000001";
    await expect(
      RomIntakePage({ searchParams: Promise.resolve({ project: projectId }) }),
    ).rejects.toSatisfy((error) => {
      expect(destinationOf(error)).toBe(`/rom?project=${projectId}`);
      return true;
    });
  });

  it("uses the first id when the URL repeats ?project=", async () => {
    const projectId = "00000000-0000-4000-8000-000000000002";
    await expect(
      RomIntakePage({ searchParams: Promise.resolve({ project: [projectId, "00000000-0000-4000-8000-000000000009"] }) }),
    ).rejects.toSatisfy((error) => {
      expect(destinationOf(error)).toBe(`/rom?project=${projectId}`);
      return true;
    });
  });
});
