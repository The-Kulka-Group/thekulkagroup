import { describe, expect, it } from "vitest";

import { computePreliminaryUnderwriting, UNDERWRITING_FORMULA_VERSION } from "./underwriting";

const complete = {
  grossBuildingSquareFeet: 100000.125,
  proposedUnits: 100,
  purchasePrice: 5_000_000.25,
  monthlyRent: 2000.5,
  hardCostPerGrossSquareFoot: 200.25,
  softCostPercent: 10.125,
  contingencyPercent: 5.25,
  vacancyPercent: 5.5,
  operatingExpensePercent: 30.25,
  debtPercent: 65.5,
  interestRatePercent: 7.125,
  exitCapRatePercent: 5.25,
};

describe("computePreliminaryUnderwriting", () => {
  it("computes the approved annual model and keeps input precision", () => {
    const run = computePreliminaryUnderwriting(complete);
    expect(run).toMatchObject({
      formulaVersion: UNDERWRITING_FORMULA_VERSION,
      status: "complete",
      inputSnapshot: complete,
      issues: [],
    });

    const value = (key: string) => run.results.find((result) => result.key === key)!.value;
    const hardCost = complete.grossBuildingSquareFeet * complete.hardCostPerGrossSquareFoot;
    const softCost = hardCost * (complete.softCostPercent / 100);
    const contingency = hardCost * (complete.contingencyPercent / 100);
    const totalCost = complete.purchasePrice + hardCost + softCost + contingency;
    const grossRevenue = complete.proposedUnits * complete.monthlyRent * 12;
    const egr = grossRevenue * (1 - complete.vacancyPercent / 100);
    const opex = egr * (complete.operatingExpensePercent / 100);
    const noi = egr - opex;
    const exitValue = noi / (complete.exitCapRatePercent / 100);
    const loan = totalCost * (complete.debtPercent / 100);

    expect(value("hardCost")).toBe(hardCost);
    expect(value("softCost")).toBe(softCost);
    expect(value("contingency")).toBe(contingency);
    expect(value("totalDevelopmentCost")).toBe(totalCost);
    expect(value("grossRevenue")).toBe(grossRevenue);
    expect(value("effectiveGrossRevenue")).toBe(egr);
    expect(value("operatingExpenses")).toBe(opex);
    expect(value("netOperatingIncome")).toBe(noi);
    expect(value("exitValue")).toBe(exitValue);
    expect(value("developmentMargin")).toBe((exitValue - totalCost) / totalCost);
    expect(value("yieldOnCost")).toBe(noi / totalCost);
    expect(value("loanAmount")).toBe(loan);
    expect(value("equityRequired")).toBe(totalCost - loan);
    expect(value("annualDebtInterestEstimate")).toBe(loan * (complete.interestRatePercent / 100));
    expect(run.results.every((result) => result.formula && result.inputKeys.length > 0)).toBe(true);
    expect(run.results.find((result) => result.key === "developmentMargin")!.inputKeys).not.toContain(
      "interestRatePercent",
    );
  });

  it("returns issues and no result for missing inputs", () => {
    const run = computePreliminaryUnderwriting({ purchasePrice: 0 });
    expect(run.status).toBe("failed");
    expect(run.results).toEqual([]);
    expect(run.issues).toContainEqual(expect.objectContaining({ inputKey: "proposedUnits", code: "missing" }));
  });

  it.each([0, -1])("rejects a non-positive divisor input: %s", (value) => {
    const run = computePreliminaryUnderwriting({ ...complete, exitCapRatePercent: value });
    expect(run.status).toBe("failed");
    expect(run.results).toEqual([]);
    expect(run.issues).toContainEqual(expect.objectContaining({ inputKey: "exitCapRatePercent" }));
  });

  it("accepts zero for bounded cost and operating percentages", () => {
    const run = computePreliminaryUnderwriting({
      ...complete,
      softCostPercent: 0,
      contingencyPercent: 0,
      vacancyPercent: 0,
      operatingExpensePercent: 0,
    });
    expect(run.status).toBe("complete");
  });

  it.each(["softCostPercent", "contingencyPercent", "vacancyPercent", "operatingExpensePercent", "debtPercent", "interestRatePercent", "exitCapRatePercent"] as const)(
    "rejects a percent above 100 for %s",
    (key) => {
      const run = computePreliminaryUnderwriting({ ...complete, [key]: 100.001 });
      expect(run.status).toBe("failed");
      expect(run.issues).toContainEqual(expect.objectContaining({ inputKey: key, code: "percent_out_of_range" }));
    },
  );

  it("never divides by zero when total development cost is zero", () => {
    const run = computePreliminaryUnderwriting({
      ...complete,
      purchasePrice: 0,
      grossBuildingSquareFeet: Number.MIN_VALUE,
      hardCostPerGrossSquareFoot: Number.MIN_VALUE,
      softCostPercent: 0,
      contingencyPercent: 0,
    });
    expect(run.status).toBe("failed");
    expect(run.results).toEqual([]);
    expect(run.issues).toContainEqual(expect.objectContaining({ inputKey: "totalDevelopmentCost" }));
  });
});
