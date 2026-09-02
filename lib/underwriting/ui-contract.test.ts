import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

async function source(path: string) {
  return readFile(join(process.cwd(), path), "utf8");
}

describe("underwriting form accessibility contract", () => {
  it("labels inline controls and links field errors with described-by ids", async () => {
    const edit = await source("app/(app)/underwriting/[id]/EditUnderwritingCase.tsx");
    expect(edit).toContain("aria-label={`${field.label} review state`}");
    expect(edit).toContain("aria-label={label}");
    expect(edit).toContain("aria-describedby={error ? errorId : undefined}");
    expect(edit).toContain("<span id={id} className=\"input-error\" role=\"alert\">");
  });

  it("keeps a linked detail route in the paged run history", async () => {
    const casePage = await source("app/(app)/underwriting/[id]/page.tsx");
    const runPage = await source("app/(app)/underwriting/[id]/runs/[runId]/page.tsx");
    expect(casePage).toContain("/runs/${run.id}");
    expect(casePage).toContain("runPage=${runPage + 1}");
    expect(runPage).toContain("Full calculation input snapshot");
    expect(runPage).toContain("Saved evidence snapshot");
  });
});
