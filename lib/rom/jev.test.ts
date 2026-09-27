import { restsOnAssumedFact } from "@kulka/engine";
import { describe, expect, it, vi } from "vitest";

import { deriveAssumption, type DerivationRequest, type JevClient } from "./jev";

// LA-860. The wrapper against a fake client: no call leaves the process.
// Every fact and candidate here is synthetic.

function fakeClient(pick: string, confidence: number) {
  const systemOne = vi.fn(async () => ({ model: "jev-test", answers: { pick: { choice: pick, confidence } } }));
  return { client: { systemOne } satisfies JevClient, systemOne };
}

const request: DerivationRequest = {
  code: "V-1",
  label: "Elevator Type",
  costCodes: ["14-200"],
  facts: [
    { name: "Stories", value: "4", basis: "stated" },
    { name: "Floor to Floor", value: "10.5 ft", basis: "assumed" },
  ],
  question: "Which elevator type fits the travel these facts give?",
  candidates: {
    hydraulic: {
      description: "Travel within hydraulic range",
      value: { kind: "spec", text: "Hydraulic, 2 Cars" },
      method: "Synthetic: travel under the hydraulic limit",
      steps: [
        { label: "Travel", result: "31.5 ft" },
        { label: "Type", result: "Hydraulic" },
      ],
    },
    traction: {
      description: "Travel past hydraulic range",
      value: { kind: "spec", text: "Traction, 2 Cars" },
      method: "Synthetic: travel past the hydraulic limit",
      steps: [
        { label: "Travel", result: "31.5 ft" },
        { label: "Type", result: "Traction" },
      ],
    },
  },
  reasons: { high: "Synthetic: well inside one range.", low: "Synthetic: near the edge of both ranges." },
};

describe("deriveAssumption", () => {
  it("returns the picked candidate as a typed record with high confidence", async () => {
    const { client, systemOne } = fakeClient("hydraulic", 0.93);
    const { assumption, jev } = await deriveAssumption(client, request);

    expect(assumption.kind).toBe("derived_assumption");
    expect(assumption.value).toEqual({ kind: "spec", text: "Hydraulic, 2 Cars" });
    expect(assumption.steps.at(-1)).toEqual({ label: "Type", result: "Hydraulic" });
    expect(assumption.confidence).toBe("high");
    expect(assumption.confidenceReason).toBe("Synthetic: well inside one range.");
    expect(assumption.costCodes).toEqual(["14-200"]);
    expect(assumption.correction).toBeNull();
    expect(jev).toEqual({ model: "jev-test", choice: "hydraulic", confidence: 0.93 });
    expect(systemOne).toHaveBeenCalledOnce();
  });

  it("sends only the bounded facts and the candidates as criteria", async () => {
    const { client, systemOne } = fakeClient("traction", 0.5);
    await deriveAssumption(client, request);
    const [sent] = systemOne.mock.calls[0] as unknown as [{ state: unknown; questions: { pick: { criteria: object } } }];
    expect(sent.state).toEqual({
      criterion: "Elevator Type",
      facts: [
        { name: "Stories", value: "4", basis: "stated" },
        { name: "Floor to Floor", value: "10.5 ft", basis: "assumed" },
      ],
    });
    expect(Object.keys(sent.questions.pick.criteria)).toEqual(["hydraulic", "traction"]);
  });

  it("reads low below the threshold, and derives the assumed-fact flag from the inputs", async () => {
    const { client } = fakeClient("traction", 0.5);
    const { assumption } = await deriveAssumption(client, request);
    expect(assumption.confidence).toBe("low");
    expect(restsOnAssumedFact(assumption)).toBe(true);

    const stated = await deriveAssumption(client, {
      ...request,
      facts: request.facts.map((fact) => ({ ...fact, basis: "stated" as const })),
    });
    expect(restsOnAssumedFact(stated.assumption)).toBe(false);
  });

  it("refuses a pick that is not a candidate, and a request with one candidate", async () => {
    await expect(deriveAssumption(fakeClient("escalator", 0.9).client, request)).rejects.toThrow("not one of");
    await expect(
      deriveAssumption(fakeClient("hydraulic", 0.9).client, {
        ...request,
        candidates: { hydraulic: request.candidates.hydraulic },
      }),
    ).rejects.toThrow("at least two candidates");
  });
});
