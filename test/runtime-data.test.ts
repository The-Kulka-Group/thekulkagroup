import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const RUNTIME_FILES = [
  "app/(app)/page.tsx",
  "app/(app)/clients/page.tsx",
  "components/Rail.tsx",
  "lib/data.ts",
];

describe("runtime data boundary", () => {
  it("keeps invented demo records out of shipped screens", async () => {
    const runtime = (await Promise.all(
      RUNTIME_FILES.map((path) => readFile(join(process.cwd(), path), "utf8")),
    )).join("\n");

    for (const fabricatedValue of [
      "Bergen Holdings",
      "Calder Health",
      "Example Avenue",
      "Foxglove Group",
      "Synthetic browser check",
    ]) {
      expect(runtime).not.toContain(fabricatedValue);
    }
  });
});
