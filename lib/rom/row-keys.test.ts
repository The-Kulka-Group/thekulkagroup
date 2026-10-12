import { describe, expect, it } from "vitest";

import { parseRowKey, rowKey } from "./row-keys";

// LA-2209 review M4: one way to build and read the `element:` / `line:` /
// `unpriced:` keys the Building View's list and the client page share.

describe("row keys", () => {
  it("builds each kind of key", () => {
    expect(rowKey("element", "Elevator")).toBe("element:Elevator");
    expect(rowKey("line", "26a")).toBe("line:26a");
    expect(rowKey("unpriced", "garage-dry-sprinklers")).toBe("unpriced:garage-dry-sprinklers");
  });

  it("reads a key back into its kind and id", () => {
    expect(parseRowKey("element:Elevator")).toEqual({ kind: "element", id: "Elevator" });
    expect(parseRowKey("line:XX-1")).toEqual({ kind: "line", id: "XX-1" });
    expect(parseRowKey(rowKey("unpriced", "36a"))).toEqual({ kind: "unpriced", id: "36a" });
  });

  it("reads a key of no known kind as null", () => {
    expect(parseRowKey("block")).toBeNull();
    expect(parseRowKey("plan-line:3")).toBeNull();
    expect(parseRowKey("line:")).toBeNull();
  });
});
