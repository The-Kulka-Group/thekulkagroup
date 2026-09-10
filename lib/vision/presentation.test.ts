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
});
