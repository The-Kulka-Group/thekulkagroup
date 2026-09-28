import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { firstSentence, RateSuggestionFailed, suggestRate, type RateClient } from "./rate-suggestion";

// LA-1245. The fake stands in for Claude; nothing reaches the network.

function fake(reply: object | string, stop: string = "end_turn") {
  const calls: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming[] = [];
  const client: RateClient = {
    beta: {
      messages: {
        create: async (params) => {
          calls.push(params);
          return {
            model: "claude-opus-5",
            stop_reason: stop,
            content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }],
          } as unknown as Anthropic.Beta.Messages.BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}

const input = {
  itemLabel: "Plumbing Disconnect and Cap",
  quantityBasis: "Structure Demolition brings this in, one per structure coming down",
  unit: "each" as const,
  facts: { zip: "10956", laborType: "union", projectType: "multifamily" },
};

describe("suggestRate", () => {
  it("returns a rounded rate, range and reason, and sends the location and labor type", async () => {
    const { client, calls } = fake({ rate: 1850.4, low: 1400, high: 2600.6, reasoning: " Union rates in Rockland. " });
    const suggestion = await suggestRate(client, input);
    expect(suggestion).toEqual({
      value: 1850,
      low: 1400,
      high: 2601,
      reasoning: "Union rates in Rockland.",
      model: "claude-opus-5",
    });
    const sent = JSON.parse(String(calls[0].messages[0].content));
    expect(sent.project).toMatchObject({ zip: "10956", laborType: "union" });
    expect(calls[0].model).toBe("claude-opus-5");
  });

  it("refuses a range that does not hold together, a refusal, and unreadable output", async () => {
    await expect(suggestRate(fake({ rate: 3000, low: 1000, high: 2000, reasoning: "x" }).client, input)).rejects.toBeInstanceOf(
      RateSuggestionFailed,
    );
    await expect(suggestRate(fake({}, "refusal").client, input)).rejects.toBeInstanceOf(RateSuggestionFailed);
    await expect(suggestRate(fake("not json").client, input)).rejects.toBeInstanceOf(RateSuggestionFailed);
  });
});

describe("firstSentence (Matt, 2026-09-28: one-sentence reasons)", () => {
  it("keeps only the first sentence", () => {
    expect(firstSentence("Rockland is a high-cost market. Labor type was not stated. The range is wide.")).toBe(
      "Rockland is a high-cost market.",
    );
  });

  it("leaves a single sentence alone", () => {
    expect(firstSentence("  Open shop pricing in Rockland County, 10920.  ")).toBe("Open shop pricing in Rockland County, 10920.");
  });
});
