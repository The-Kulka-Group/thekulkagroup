import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { referenceSnapshot } from "@/test/fixtures/published-budget";

import {
  DURATION_MODEL,
  DurationEstimateFailed,
  durationEstimator,
  durationFactsOf,
  estimateDurationMonths,
  parseDurationMonths,
  type DurationClient,
} from "./duration-estimate";

// LA-1566. The fake stands in for Claude; nothing reaches the network.

function fake(reply: object | string | Error, stop: string = "end_turn") {
  const calls: { params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming; options?: Anthropic.RequestOptions }[] = [];
  const client: DurationClient = {
    beta: {
      messages: {
        create: async (params, options) => {
          calls.push({ params, options });
          if (reply instanceof Error) throw reply;
          return {
            model: DURATION_MODEL,
            stop_reason: stop,
            content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }],
          } as unknown as Anthropic.Beta.Messages.BetaMessage;
        },
      },
    },
  };
  return { client, calls };
}

const snapshot = referenceSnapshot();
const facts = durationFactsOf(snapshot.answers, snapshot.rom);

describe("durationFactsOf", () => {
  it("hands the model the budget's stated facts and the scope it prices", () => {
    expect(facts.projectType).toBe("multifamily");
    expect(facts.constructionKind).toBe("new");
    expect(facts.grossSquareFeet).toBe(64_000);
    expect(facts.facts).toMatchObject({ unitCount: 70, storiesAboveGrade: 5, levels_below_grade: "no", elevatorCount: 2 });
    expect(facts.scope.length).toBeGreaterThan(0);
    expect(new Set(facts.scope).size).toBe(facts.scope.length);
  });
});

describe("parseDurationMonths", () => {
  it("takes whole months from 1 to 120", () => {
    expect(parseDurationMonths({ months: 1 })).toBe(1);
    expect(parseDurationMonths({ months: 16 })).toBe(16);
    expect(parseDurationMonths({ months: 120 })).toBe(120);
  });

  it("rejects anything else", () => {
    for (const raw of [{ months: 0 }, { months: 121 }, { months: 14.5 }, { months: "14" }, { months: Number.NaN }, {}, null, 14, "14"]) {
      expect(parseDurationMonths(raw), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe("estimateDurationMonths", () => {
  it("returns the model's whole months and sends the facts, with a timeout that does not hold up publishing", async () => {
    const { client, calls } = fake({ months: 16 });

    expect(await estimateDurationMonths(client, facts)).toBe(16);
    expect(calls).toHaveLength(1);
    expect(calls[0].params.model).toBe(DURATION_MODEL);
    expect(JSON.parse(calls[0].params.messages[0].content as string)).toEqual(facts);
    expect(calls[0].options).toEqual({ timeout: 20_000, maxRetries: 0 });
  });

  it("fails on a reply outside 1 to 120 months, a fraction, or prose", async () => {
    for (const reply of [{ months: 0 }, { months: 400 }, { months: 15.5 }, "About 16 months."]) {
      await expect(estimateDurationMonths(fake(reply).client, facts), JSON.stringify(reply)).rejects.toBeInstanceOf(DurationEstimateFailed);
    }
  });

  it("fails on a refusal", async () => {
    await expect(estimateDurationMonths(fake({ months: 16 }, "refusal").client, facts)).rejects.toBeInstanceOf(DurationEstimateFailed);
  });

  it("passes a failed call through, for publishing to drop", async () => {
    await expect(estimateDurationMonths(fake(new Error("connection reset")).client, facts)).rejects.toThrow("connection reset");
  });
});

describe("durationEstimator", () => {
  it("is absent without a client, so publishing makes no estimate", () => {
    expect(durationEstimator(null)).toBeUndefined();
  });

  it("estimates through the client it is given", async () => {
    const estimate = durationEstimator(fake({ months: 22 }).client);
    expect(await estimate!(facts)).toBe(22);
  });
});
