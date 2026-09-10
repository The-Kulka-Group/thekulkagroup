import {describe, expect, it} from "vitest";

import {SOURCE_RUN_OUTCOME_LABELS, visionDateTime} from "./presentation";

describe("Vision source run presentation", () => {
  it("uses the completed outcome label shown on both source screens", () => {
    expect(SOURCE_RUN_OUTCOME_LABELS.completed).toBe("Completed");
  });

  it("uses the same fallback when a source has not been checked", () => {
    expect(visionDateTime(null)).toBe("Not checked yet");
    expect(visionDateTime(undefined)).toBe("Not checked yet");
  });

  it("formats completed checks in a fixed time zone", () => {
    expect(visionDateTime("2026-09-09T17:56:08.000Z")).toBe("9/9/26, 1:56:08 PM");
  });
});
