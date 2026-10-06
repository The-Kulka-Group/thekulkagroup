import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APARTMENT_DEVELOPMENT_V2_98_SCORECARD } from "./fixtures/apartment-development-model-v2.98-scorecard";
import { scorecardFor, type AuditedModelScorecard, type Scorecard } from "./model-scorecard";

/*
 * LA-1687 scorecard. v2.98 is a public sample, so its adapter lives in the repo and runs in CI.
 * The three live deals keep their inputs and expected values in Dropbox, under
 * BLDG/BLDG Labs/DEVELOPMENT/LA-1685 Model Audit. Point KULKA_MODEL_AUDIT_DIR at that folder
 * to score them; without it those tests skip. The written scorecard holds percents, not values.
 */

const AUDIT_DIR = process.env.KULKA_MODEL_AUDIT_DIR;
const DEAL_MODELS = ["benjamin", "jll-214-w-main", "graybarn"] as const;
const DEAL_INPUT_FILE = "engine-scorecard-input.json";
const SCORECARD_FILE = "engine-scorecard.md";

// v2.98 targets the engine's full run matched when LA-1687 landed. Each must stay matched.
const V2_98_MATCHED_BASELINE = [
  "cost-land-total",
  "cost-hard-total",
  "cost-development-fee",
  "cost-soft-total",
  "cost-before-financing",
  "hard-cost-monthly-sum",
  "stabilized-month",
  "stabilized-year-residential-gross-rent",
  "stabilized-year-residential-non-revenue",
  "stabilized-year-capital-expenditures",
];

function loadDeal(folder: string): AuditedModelScorecard {
  const path = join(AUDIT_DIR!, folder, DEAL_INPUT_FILE);
  expect(existsSync(path), `${path} is missing`).toBe(true);
  const model = JSON.parse(readFileSync(path, "utf8")) as AuditedModelScorecard;
  expect(model.model).toBe(folder);
  return model;
}

function expectSound(model: AuditedModelScorecard, card: Scorecard) {
  expect(card.problems, `${model.model} targets`).toEqual([]);
  expect(card.run.status, card.run.issueCodes.join(", ")).toBe("complete");
  expect(card.rows.filter(({ status }) => status === "defect_matched").map(({ id }) => id), `${model.model} defects`).toEqual([]);
}

describe("audited model scorecard: v2.98 public sample", () => {
  it("scores the full engine run against the workbook's saved values", () => {
    const model = APARTMENT_DEVELOPMENT_V2_98_SCORECARD;
    const card = scorecardFor(model);
    console.info(card.text);
    expectSound(model, card);
    const matched = card.rows.filter(({ status }) => status === "matched").map(({ id }) => id);
    expect(V2_98_MATCHED_BASELINE.filter((id) => !matched.includes(id)), "v2.98 targets that stopped matching").toEqual([]);
  });
});

describe.skipIf(!AUDIT_DIR)("audited model scorecard: live deals from Dropbox", () => {
  it.each(DEAL_MODELS)("scores %s", (folder) => {
    const model = loadDeal(folder);
    const card = scorecardFor(model);
    console.info(card.text);
    expectSound(model, card);
  });

  it("writes the combined scorecard next to the fixtures", () => {
    const cards = [APARTMENT_DEVELOPMENT_V2_98_SCORECARD, ...DEAL_MODELS.map(loadDeal)].map(scorecardFor);
    const header = [
      "# Engine Scorecard Against Four Audited Models",
      "",
      "LA-1687. Each row compares one saved workbook value with the engine's full run on the same deal.",
      "Percent off is the engine less the workbook, over the workbook. No expected or actual value appears here.",
      "",
    ];
    writeFileSync(join(AUDIT_DIR!, SCORECARD_FILE), [...header, ...cards.flatMap(({ text }) => [text, ""])].join("\n"));
    expect(cards.flatMap(({ problems }) => problems)).toEqual([]);
  });
});
