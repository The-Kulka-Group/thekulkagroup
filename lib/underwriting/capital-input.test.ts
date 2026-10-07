import { describe, expect, it } from "vitest";
import type { DevelopmentCapitalInputs } from "@kulka/engine";

import { parseDevelopmentCapital, InvalidDevelopmentCapital } from "./capital-input";
import { APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE } from "../../packages/engine/src/fixtures/apartment-development-model-v2.98-capital";

const fixture = APARTMENT_DEVELOPMENT_V2_98_CAPITAL_FIXTURE.fullModelInput as DevelopmentCapitalInputs;
const start = fixture.analysisStartMonth;
const operationsFixtureForCapital = () => fixture;
const body = (ratePath?: unknown) => ({ ...fixture, ...(ratePath === undefined ? {} : { ratePath }) });

describe("parseDevelopmentCapital other sources", () => {
  const grant = { id: "grant", name: "State Grant", kind: "grant", draws: [{ month: start, amount: 1_000_000 }], reviewState: "working" };
  const land = { creditedValue: 10_000_000, countsAsSponsorEquity: true, reviewState: "working" };

  it("drops null sources and credited land", () => {
    const parsed = parseDevelopmentCapital({ ...fixture, otherSources: null, creditedLand: null }, operationsFixtureForCapital());
    expect(parsed).not.toHaveProperty("otherSources");
    expect(parsed).not.toHaveProperty("creditedLand");
  });

  it("keeps valid sources and credited land", () => {
    const parsed = parseDevelopmentCapital({ ...fixture, otherSources: [grant], creditedLand: land }, operationsFixtureForCapital());
    expect(parsed.otherSources).toEqual([grant]);
    expect(parsed.creditedLand).toEqual(land);
  });

  it("reports each bad field under its own path", () => {
    try {
      parseDevelopmentCapital({ ...fixture, otherSources: [{ ...grant, draws: [{ month: start, amount: 0 }] }], creditedLand: { ...land, creditedValue: 1 } }, operationsFixtureForCapital());
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDevelopmentCapital);
      expect((error as InvalidDevelopmentCapital).fieldErrors).toHaveProperty(["otherSources.0.draws.0.amount"]);
      expect((error as InvalidDevelopmentCapital).fieldErrors).toHaveProperty(["creditedLand.creditedValue"]);
    }
  });
});

describe("parseDevelopmentCapital rate path", () => {
  it("drops a null rate path and keeps the fixed rate", () => {
    expect(parseDevelopmentCapital(body(null), operationsFixtureForCapital())).not.toHaveProperty("ratePath");
  });

  it("keeps a valid rate path", () => {
    const path = { baseRates: [{ month: start, baseRatePercent: 4 }], spreadPercent: -0.5, curveSourceLabel: "Forward SOFR", asOfDate: `${fixture.feeMonth}-05` };
    expect(parseDevelopmentCapital(body(path), operationsFixtureForCapital()).ratePath).toEqual(path);
  });

  it("reports a stale curve against the as-of date field", () => {
    const path = { baseRates: [{ month: start, baseRatePercent: 4 }], spreadPercent: 3, curveSourceLabel: "Forward SOFR", asOfDate: "2019-01-05" };
    try {
      parseDevelopmentCapital(body(path), operationsFixtureForCapital());
      throw new Error("expected a failure");
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidDevelopmentCapital);
      expect((error as InvalidDevelopmentCapital).fieldErrors).toHaveProperty(["ratePath.asOfDate"]);
    }
  });
});
