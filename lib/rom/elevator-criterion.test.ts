import { describe, expect, it, vi } from "vitest";

import { deriveElevatorType } from "./elevator-criterion";
import type { JevClient } from "./jev";

// LA-1205, on the LA-860 mechanism: Jev is asked only inside the "either"
// band (over 35 ft, up to 55 ft of travel), through the shared wrapper
// (jev.ts), and only when a client is configured. Every fake client below
// never leaves the process (jev.test.ts's own convention).

function fakeClient(pick: string, confidence: number) {
  const systemOne = vi.fn(async () => ({ model: "jev-test", answers: { pick: { choice: pick, confidence } } }));
  return { client: { systemOne } satisfies JevClient, systemOne };
}

describe("deriveElevatorType", () => {
  it("returns null with no Stories Above Grade: nothing to derive, no default", async () => {
    const result = await deriveElevatorType(null, {
      storiesAboveGrade: null,
      framingSystem: "wood",
      hasTallerGroundFloor: false,
    });
    expect(result).toBeNull();
  });

  it("4 stories at 10'-0\" floors: Hydraulic, high confidence, no Jev call even with a client configured", async () => {
    const { client, systemOne } = fakeClient("traction", 0.9);
    const result = await deriveElevatorType(client, {
      storiesAboveGrade: 4,
      framingSystem: "wood",
      hasTallerGroundFloor: false,
    });
    expect(result!.assumption.value).toEqual({ kind: "spec", text: "Hydraulic" });
    expect(result!.assumption.confidence).toBe("high");
    expect(result!.jev).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("8 stories at 10'-0\" floors: Traction, high confidence, no Jev call", async () => {
    const { client, systemOne } = fakeClient("hydraulic", 0.9);
    const result = await deriveElevatorType(client, {
      storiesAboveGrade: 8,
      framingSystem: "wood",
      hasTallerGroundFloor: false,
    });
    expect(result!.assumption.value).toEqual({ kind: "spec", text: "Traction" });
    expect(result!.assumption.confidence).toBe("high");
    expect(result!.jev).toBeNull();
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("6 stories at 10'-0\" floors sits in the either band and calls Jev exactly once", async () => {
    const { client, systemOne } = fakeClient("traction", 0.85);
    const result = await deriveElevatorType(client, {
      storiesAboveGrade: 6,
      framingSystem: "wood",
      hasTallerGroundFloor: false,
    });
    expect(systemOne).toHaveBeenCalledOnce();
    expect(result!.assumption.value).toEqual({ kind: "spec", text: "Traction" });
    expect(result!.assumption.confidence).toBe("high");
    expect(result!.jev).toEqual({ model: "jev-test", choice: "traction", confidence: 0.85 });
  });

  it("reads Jev's low-confidence pick as low confidence, still inside the band", async () => {
    const { client } = fakeClient("hydraulic", 0.5);
    const result = await deriveElevatorType(client, {
      storiesAboveGrade: 6,
      framingSystem: "wood",
      hasTallerGroundFloor: false,
    });
    expect(result!.assumption.confidence).toBe("low");
  });

  it("with no Jev client configured, the either band proposes Hydraulic at low confidence and says Jev was not called", async () => {
    const result = await deriveElevatorType(null, {
      storiesAboveGrade: 6,
      framingSystem: "wood",
      hasTallerGroundFloor: false,
    });
    expect(result!.assumption.value).toEqual({ kind: "spec", text: "Hydraulic" });
    expect(result!.assumption.confidence).toBe("low");
    expect(result!.assumption.confidenceReason).toMatch(/no jev client is configured/i);
    expect(result!.jev).toBeNull();
  });

  it("cold-formed steel (the project's 'metal' framing) uses the wood figure, same band outcome as wood", async () => {
    const wood = await deriveElevatorType(null, { storiesAboveGrade: 4, framingSystem: "wood", hasTallerGroundFloor: false });
    const metal = await deriveElevatorType(null, { storiesAboveGrade: 4, framingSystem: "metal", hasTallerGroundFloor: false });
    expect(wood!.assumption.value).toEqual(metal!.assumption.value);
    expect(wood!.assumption.confidence).toBe(metal!.assumption.confidence);
  });

  it("with no framing system known, floor-to-floor is assumed as wood and the input says so", async () => {
    const result = await deriveElevatorType(null, { storiesAboveGrade: 4, framingSystem: null, hasTallerGroundFloor: false });
    const framingInput = result!.assumption.inputs.find((i) => i.name === "Framing System");
    expect(framingInput?.basis).toBe("assumed");
  });

  it("a taller retail ground floor can move a 6-story building from either into traction", async () => {
    // 6 stories, 10'-0" typical, 15'-0" ground floor: 5*10 + 5 = 55 ft, still "either" at the boundary.
    // 7 stories with the same ground floor pushes past 55 ft into traction.
    const result = await deriveElevatorType(null, {
      storiesAboveGrade: 7,
      framingSystem: "wood",
      hasTallerGroundFloor: true,
    });
    expect(result!.assumption.value).toEqual({ kind: "spec", text: "Traction" });
    expect(result!.assumption.confidence).toBe("high");
  });
});
